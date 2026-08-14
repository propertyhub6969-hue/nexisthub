import secrets
import uuid
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.core.unit_status import unit_status_for_client, set_unit_status
from app.core.cashbook import sync_payment_cashbook
from app.core import storage
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.core.security import create_file_token
from app.api.deps import get_current_context, AuthContext
from app.models.kpr import Bank, KprApplication, KprStage, BankShareLink, KprBankSubmission, BankSubmissionStatus
from app.models.marketing import Client, ClientStatus
from app.models.property import Unit
from app.models.user import User
from app.models.payment import Payment, PaymentSource, PaymentMethod, PaymentPurpose, PaymentApprovalStatus
from app.schemas.kpr import (
    BankCreate, BankUpdate, BankResponse,
    KprCreate, KprUpdate, KprResponse, DisburseRequest, DisbursementResponse, RejectRequest,
    BankShareLinkCreate, BankShareLinkResponse, BankSubmissionResponse, BankSubmissionRejectRequest,
)
from app.schemas.document_text import BankLetterData

router = APIRouter()

NOTDEL = lambda m: m.is_deleted == False  # noqa: E731, E712


# ═══════════════════════ BANKS ═══════════════════════
@router.get("/banks", response_model=list[BankResponse])
async def list_banks(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Bank).where(Bank.tenant_id == ctx.tenant_id, NOTDEL(Bank)).order_by(Bank.name))
    return r.scalars().all()


@router.post("/banks", response_model=BankResponse, status_code=status.HTTP_201_CREATED)
async def create_bank(payload: BankCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    b = Bank(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(b); await db.flush(); await db.refresh(b)
    return b


async def _get_bank(db, tenant_id, bank_id) -> Bank:
    b = (await db.execute(select(Bank).where(Bank.id == bank_id, Bank.tenant_id == tenant_id, NOTDEL(Bank)))).scalar_one_or_none()
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bank tidak ditemukan")
    return b


@router.patch("/banks/{bank_id}", response_model=BankResponse)
async def update_bank(bank_id: uuid.UUID, payload: BankUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    b = await _get_bank(db, ctx.tenant_id, bank_id)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(b, f, v)
    await db.flush(); await db.refresh(b)
    return b


@router.delete("/banks/{bank_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bank(bank_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    b = await _get_bank(db, ctx.tenant_id, bank_id)
    b.is_deleted = True; b.deleted_at = datetime.utcnow()


# ═══════════════════════ TAUTAN BAGIKAN KE BANK (tanpa login) ═══════════════════════
@router.get("/bank-share", response_model=list[BankShareLinkResponse])
async def list_bank_share_links(bank_id: uuid.UUID = Query(None), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Daftar tautan yang pernah dibuat tenant ini (termasuk expired/dicabut, utk histori)."""
    conds = [BankShareLink.tenant_id == ctx.tenant_id]
    if bank_id:
        conds.append(BankShareLink.bank_id == bank_id)
    r = await db.execute(select(BankShareLink).where(*conds).order_by(BankShareLink.created_at.desc()))
    return r.scalars().all()


@router.post("/bank-share", response_model=BankShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_bank_share_link(payload: BankShareLinkCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Buat tautan bertoken (tanpa login) utk 1 bank lihat status pemberkasan & kirim update."""
    bank = await _get_bank(db, ctx.tenant_id, payload.bank_id)
    days = max(1, min(365, payload.expires_days))
    link = BankShareLink(
        tenant_id=ctx.tenant_id, token=secrets.token_urlsafe(32), bank_id=bank.id,
        bank_name_snapshot=bank.name, created_by=ctx.user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=days),
    )
    db.add(link)
    await db.flush(); await db.refresh(link)
    return link


@router.delete("/bank-share/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_bank_share_link(link_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    link = (await db.execute(select(BankShareLink).where(BankShareLink.id == link_id, BankShareLink.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan")
    link.revoked_at = datetime.now(timezone.utc)
    await db.flush()


# ═══════════════════════ KPR APPLICATIONS ═══════════════════════
async def _disbursed_total(db, tenant_id, kpr_id) -> Decimal:
    """Total pencairan yang sudah cair (jumlah semua uang masuk Bank bertautan KPR ini)."""
    return Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.kpr_id == kpr_id, Payment.tenant_id == tenant_id, NOTDEL(Payment),
            Payment.approval_status == PaymentApprovalStatus.APPROVED)
    ))


async def _attach_totals(db, tenant_id, k: KprApplication) -> KprApplication:
    total = await _disbursed_total(db, tenant_id, k.id)
    k.total_disbursed = total
    k.retention = (Decimal(k.plafond) if k.plafond is not None else Decimal(0)) - total
    return k


async def _load_kpr(db, tenant_id, kpr_id) -> KprApplication:
    k = (await db.execute(
        select(KprApplication).options(selectinload(KprApplication.bank))
        .where(KprApplication.id == kpr_id, KprApplication.tenant_id == tenant_id, NOTDEL(KprApplication))
    )).scalar_one_or_none()
    if k is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pengajuan KPR tidak ditemukan")
    return await _attach_totals(db, tenant_id, k)


@router.get("/applications/{kpr_id}/bank-letter", response_model=BankLetterData)
async def bank_letter(kpr_id: uuid.UUID, jenis: str = Query("surat_spr"),
                      ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Surat ke bank (SPR / Pencairan Awal / Pencairan Retensi) — teks dari 'Teks Dokumen' tenant
    (per bank, atau standar), variabel terisi otomatis dari data KPR + pembeli + perusahaan."""
    from app.models.tenant import Tenant
    from app.models.property import Project
    from app.models.cashbook import CashAccount
    from app.core.document_texts import get_doc_text, fill_vars, terbilang_rupiah, BANK_LETTER_DOCS
    if jenis not in BANK_LETTER_DOCS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Jenis surat tidak dikenal")
    _BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

    def tgl_id(d):
        return f"{d.day} {_BULAN[d.month]} {d.year}" if d else "-"

    k = await _load_kpr(db, ctx.tenant_id, kpr_id)   # attaches k.total_disbursed & k.retention
    client = (await db.execute(select(Client).where(Client.id == k.client_id, Client.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembeli tidak ditemukan")
    unit = (await db.execute(select(Unit).where(Unit.id == client.unit_id))).scalar_one_or_none() if client.unit_id else None
    project = (await db.execute(select(Project).where(Project.id == client.project_id))).scalar_one_or_none() if client.project_id else None
    tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
    acct = (await db.execute(select(CashAccount).where(
        CashAccount.tenant_id == ctx.tenant_id, CashAccount.is_deleted == False,  # noqa: E712
        CashAccount.is_default == True).limit(1))).scalar_one_or_none()  # noqa: E712
    if acct is None:
        acct = (await db.execute(select(CashAccount).where(
            CashAccount.tenant_id == ctx.tenant_id, CashAccount.is_deleted == False).limit(1))).scalar_one_or_none()  # noqa: E712

    def rp(v):
        return f"Rp {int(v):,}".replace(",", ".") if v is not None else "-"

    unit_label = ("-".join(x for x in [unit.block, unit.unit_number] if x)) if unit else (client.unit_number or "-")
    company = tenant.company_name or tenant.name
    alamat_proyek = " ".join(x for x in [(project.address if project else None),
                                         (project.city if project else None),
                                         (project.province if project else None)] if x) or "-"
    ctx_vars = {
        "nama_pembeli": client.full_name or "-", "nik": client.nik or "-",
        "alamat_pembeli": client.address or "-", "bank": k.bank_name or "-",
        "proyek": (project.name if project else "-"), "alamat_proyek": alamat_proyek,
        "unit": unit_label,
        "blok": (unit.block if unit and unit.block else "-"),
        "no_unit": (unit.unit_number if unit else (client.unit_number or "-")),
        "tipe": (unit.unit_type if unit and unit.unit_type else (client.unit_type or "-")),
        "lt": (f"{float(unit.land_area):g} m²" if unit and unit.land_area is not None else "-"),
        "lb": (f"{float(unit.building_area):g} m²" if unit and unit.building_area is not None else "-"),
        "harga_jual": rp(client.contract_value), "plafon": rp(k.plafond),
        "perusahaan": company, "kota": tenant.city or "-", "tanggal": tgl_id(date.today()),
        "tanggal_akad": tgl_id(k.akad_date),
        "jumlah_pencairan": rp(k.total_disbursed), "terbilang_pencairan": terbilang_rupiah(k.total_disbursed),
        "jumlah_retensi": rp(k.retention), "terbilang_retensi": terbilang_rupiah(k.retention),
        "nomor_rekening": (acct.account_number if acct else "-") or "-",
        "nama_bank_rekening": (acct.bank_name if acct else "-") or "-",
    }
    subject, body = await get_doc_text(db, ctx.tenant_id, jenis, k.bank_id)
    return BankLetterData(
        subject=fill_vars(subject, ctx_vars), body=fill_vars(body, ctx_vars),
        company_name=company, company_address=tenant.address, company_city=tenant.city,
        company_phone=tenant.phone, letter_city=tenant.city, date=date.today().isoformat(),
    )


@router.get("/bank-letter-types")
async def bank_letter_types(ctx: AuthContext = Depends(get_current_context)):
    """Daftar jenis surat ke bank (utk dropdown di halaman KPR & editor)."""
    from app.core.document_texts import BANK_LETTER_DOCS
    return [{"key": k, "label": v} for k, v in BANK_LETTER_DOCS.items()]


async def _sync_client_on_kpr_stage(db: AsyncSession, tenant_id, client_id, stage: KprStage) -> None:
    """Saat KPR mencapai Akad Kredit/Pencairan, tandai Pembeli 'Selesai' → unit otomatis ikut jadi Akad/Terjual
    (pakai helper yang sama dgn sinkronisasi status Pembeli, agar tak saling menimpa)."""
    if stage not in (KprStage.AKAD_KREDIT, KprStage.PENCAIRAN):
        return
    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id, Client.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if client is None or client.status != ClientStatus.ACTIVE:
        return  # jangan timpa status 'Nonaktif' (batal) atau yang sudah 'Selesai'
    client.status = ClientStatus.COMPLETED
    await set_unit_status(db, tenant_id, client.unit_id, unit_status_for_client(client))


@router.get("/applications", response_model=list[KprResponse])
async def list_kpr(client_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(KprApplication).options(selectinload(KprApplication.bank))
        .where(KprApplication.client_id == client_id, KprApplication.tenant_id == ctx.tenant_id, NOTDEL(KprApplication))
        .order_by(KprApplication.created_at.desc())
    )
    items = r.scalars().all()
    for k in items:
        await _attach_totals(db, ctx.tenant_id, k)
    return items


@router.post("/applications", response_model=KprResponse, status_code=status.HTTP_201_CREATED)
async def create_kpr(payload: KprCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    data = payload.model_dump()
    client = (await db.execute(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == ctx.tenant_id)
    )).scalar_one_or_none()
    # Tgl Collect Berkas default = tanggal pembeli pertama kali dientri (bila tak diisi manual)
    if data.get("submitted_date") is None and client is not None:
        data["submitted_date"] = client.created_at.date()
    k = KprApplication(tenant_id=ctx.tenant_id, **data)
    db.add(k); await db.flush()
    # AJUKAN ULANG bank lain setelah KPR ditolak: pembeli yang sebelumnya Batal (INACTIVE)
    # diaktifkan kembali + unit di-book ulang — deal kembali berjalan.
    if client is not None and client.status == ClientStatus.INACTIVE:
        client.status = ClientStatus.ACTIVE
        await set_unit_status(db, ctx.tenant_id, client.unit_id, unit_status_for_client(client))
        await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "kpr_applications", k.id, new_data=payload)
    return await _load_kpr(db, ctx.tenant_id, k.id)


@router.patch("/applications/{kpr_id}", response_model=KprResponse)
async def update_kpr(kpr_id: uuid.UUID, payload: KprUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    k = await _load_kpr(db, ctx.tenant_id, kpr_id)
    data = payload.model_dump(exclude_unset=True)
    # PIC bank + ttd = bukti serah berkas — hanya boleh diisi/diubah selagi tahap Berkas Masuk Bank
    # (dikunci di tahap lain, bukan cuma disembunyikan di FE, supaya bukti tak bisa diutak-atik belakangan).
    resulting_stage = data.get("stage", k.stage)
    if ("pic_bank_name" in data or "pic_bank_signature" in data) and resulting_stage != KprStage.BERKAS_MASUK_BANK:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="PIC Bank & tanda tangan hanya bisa diisi/diubah selagi tahap 'Berkas Masuk Bank'")
    for f, v in data.items():
        setattr(k, f, v)
    await db.flush()
    await _sync_client_on_kpr_stage(db, ctx.tenant_id, k.client_id, k.stage)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "kpr_applications", kpr_id, new_data=data)
    return await _load_kpr(db, ctx.tenant_id, kpr_id)


@router.get("/applications/{kpr_id}/sp3k-file")
async def download_sp3k_file(kpr_id: uuid.UUID, request: Request, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """File SP3K resmi (hasil terima kiriman bank, atau diunggah manual bila nanti ditambahkan)."""
    meta = (await db.execute(
        select(KprApplication.sp3k_file_size, KprApplication.sp3k_file_type, KprApplication.sp3k_file_name,
               KprApplication.updated_at, KprApplication.sp3k_file_key)
        .where(KprApplication.id == kpr_id, KprApplication.tenant_id == ctx.tenant_id, NOTDEL(KprApplication))
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    size, ctype, fname, updated, fkey = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = await storage.get(fkey) if fkey else None
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, ctype, fname, etag)


@router.get("/applications/{kpr_id}/sp3k-view-url")
async def get_sp3k_view_url(kpr_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """URL sekali-pakai utk buka lampiran SP3K KPR native/progresif di tab baru."""
    name = (await db.execute(
        select(KprApplication.sp3k_file_name).where(
            KprApplication.id == kpr_id, KprApplication.tenant_id == ctx.tenant_id, NOTDEL(KprApplication))
    )).scalar_one_or_none()
    if name is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    token = create_file_token("kpr_sp3k", kpr_id, ctx.tenant_id)
    return {"url": f"/api/v1/public/files/kpr_sp3k/{kpr_id}/view?t={token}"}


@router.delete("/applications/{kpr_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kpr(kpr_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    k = await _load_kpr(db, ctx.tenant_id, kpr_id)
    k.is_deleted = True; k.deleted_at = datetime.utcnow()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "kpr_applications", kpr_id)


@router.post("/applications/{kpr_id}/reject", response_model=KprResponse)
async def reject_kpr(kpr_id: uuid.UUID, payload: RejectRequest, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Tandai pengajuan KPR DITOLAK (data dipertahankan). Opsional cascade: bebaskan unit & tandai pembeli batal."""
    k = await _load_kpr(db, ctx.tenant_id, kpr_id)
    k.rejected_date = payload.rejected_date or date.today()
    k.rejection_reason = payload.reason
    if payload.cascade_release_unit:
        client = (await db.execute(
            select(Client).where(Client.id == k.client_id, Client.tenant_id == ctx.tenant_id, Client.is_deleted == False)  # noqa: E712
        )).scalar_one_or_none()
        if client is not None and client.status != ClientStatus.INACTIVE:
            client.status = ClientStatus.INACTIVE   # Batal → unit auto Tersedia via helper
            await set_unit_status(db, ctx.tenant_id, client.unit_id, unit_status_for_client(client))
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "REJECT", "kpr_applications", kpr_id,
                       new_data={"reason": payload.reason, "cascade": payload.cascade_release_unit})
    return await _load_kpr(db, ctx.tenant_id, kpr_id)


@router.get("/applications/{kpr_id}/disbursements", response_model=list[DisbursementResponse])
async def list_disbursements(kpr_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Daftar pencairan (tahap) untuk satu KPR."""
    await _load_kpr(db, ctx.tenant_id, kpr_id)
    r = await db.execute(
        select(Payment).where(Payment.kpr_id == kpr_id, Payment.tenant_id == ctx.tenant_id, NOTDEL(Payment))
        .order_by(Payment.payment_date, Payment.created_at)
    )
    return r.scalars().all()


@router.post("/applications/{kpr_id}/disburse", response_model=KprResponse)
async def disburse_kpr(kpr_id: uuid.UUID, payload: DisburseRequest, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Tambah SATU pencairan (bertahap) → buat uang masuk sumber Bank + set tahap Pencairan.
    Total cair terakumulasi; retensi = plafon − total cair."""
    k = await _load_kpr(db, ctx.tenant_id, kpr_id)
    pay_date = payload.pay_date or date.today()

    pay = Payment(
        tenant_id=ctx.tenant_id, client_id=k.client_id, kpr_id=k.id, amount=payload.amount,
        payment_date=pay_date, method=PaymentMethod.TRANSFER, source=PaymentSource.BANK,
        purpose=PaymentPurpose.REALISASI_KPR,
        notes=payload.notes or "Pencairan KPR",
        # auto-approved: pencairan KPR sudah dikendalikan alur tahapan KPR sendiri (bukan antrean finance)
        approval_status=PaymentApprovalStatus.APPROVED, approved_at=datetime.utcnow(),
    )
    db.add(pay)
    await db.flush()

    k.pencairan_payment_id = k.pencairan_payment_id or pay.id
    k.pencairan_date = pay_date
    k.pencairan_amount = await _disbursed_total(db, ctx.tenant_id, k.id)  # legacy: total cair
    k.stage = KprStage.PENCAIRAN
    await db.flush()
    await _sync_client_on_kpr_stage(db, ctx.tenant_id, k.client_id, k.stage)
    await sync_payment_cashbook(db, ctx.tenant_id, pay)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DISBURSE", "kpr_applications", kpr_id,
                       new_data={"amount": str(payload.amount), "date": str(pay_date)})
    return await _load_kpr(db, ctx.tenant_id, kpr_id)


@router.delete("/disbursements/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_disbursement(payment_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Hapus satu pencairan (uang masuk Bank bertautan KPR). Retensi otomatis dihitung ulang."""
    pay = (await db.execute(
        select(Payment).where(Payment.id == payment_id, Payment.tenant_id == ctx.tenant_id,
                              Payment.kpr_id.isnot(None), NOTDEL(Payment))
    )).scalar_one_or_none()
    if pay is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pencairan tidak ditemukan")
    kpr_id = pay.kpr_id
    pay.is_deleted = True
    pay.deleted_at = datetime.utcnow()
    await db.flush()
    await sync_payment_cashbook(db, ctx.tenant_id, pay)
    # sinkron kolom legacy pencairan_amount
    k = (await db.execute(select(KprApplication).where(KprApplication.id == kpr_id))).scalar_one_or_none()
    if k is not None:
        k.pencairan_amount = await _disbursed_total(db, ctx.tenant_id, kpr_id)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "payments", payment_id, old_data={"kpr_disbursement": str(pay.amount)})


# ═══════════════════════ KIRIMAN DARI BANK (menunggu persetujuan) ═══════════════════════
def _lbl(u: Unit) -> str:
    return "-".join(x for x in [u.block, u.unit_number] if x) or "?"


async def _submission_response(db, tenant_id, sub: KprBankSubmission) -> BankSubmissionResponse:
    row = (await db.execute(
        select(Client.id, Client.full_name, Client.unit_id, KprApplication.bank_id)
        .join(KprApplication, KprApplication.client_id == Client.id)
        .where(KprApplication.id == sub.kpr_application_id)
    )).first()
    client_id, client_name, unit_id, bank_id = row if row else (None, "?", None, None)
    unit_label = None
    if unit_id:
        u = (await db.execute(select(Unit).where(Unit.id == unit_id))).scalar_one_or_none()
        if u:
            unit_label = _lbl(u)
    bank_name = None
    if bank_id:
        bank_name = await db.scalar(select(Bank.name).where(Bank.id == bank_id))
    reviewer_name = None
    if sub.reviewed_by:
        reviewer_name = await db.scalar(select(User.full_name).where(User.id == sub.reviewed_by))
    return BankSubmissionResponse(
        id=sub.id, kpr_application_id=sub.kpr_application_id, client_id=client_id, client_name=client_name,
        unit_label=unit_label, bank_name=bank_name, submitted_stage=sub.submitted_stage,
        submitted_sp3k_number=sub.submitted_sp3k_number, submitted_sp3k_date=sub.submitted_sp3k_date,
        submitted_plafond=sub.submitted_plafond, submitted_tenor_months=sub.submitted_tenor_months,
        submitted_notes=sub.submitted_notes,
        has_file=sub.has_file, file_name=sub.file_name, status=sub.status,
        reviewer_name=reviewer_name, reviewed_at=sub.reviewed_at, notes=sub.notes, created_at=sub.created_at,
    )


@router.get("/bank-submissions", response_model=list[BankSubmissionResponse])
async def list_bank_submissions(
    status_filter: str = Query("pending", alias="status"),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Kiriman dari bank lewat tautan — default hanya yang menunggu persetujuan."""
    conds = [KprBankSubmission.tenant_id == ctx.tenant_id]
    if status_filter and status_filter != "all":
        conds.append(KprBankSubmission.status == BankSubmissionStatus(status_filter))
    rows = (await db.execute(
        select(KprBankSubmission).where(*conds).order_by(KprBankSubmission.created_at.desc())
    )).scalars().all()
    return [await _submission_response(db, ctx.tenant_id, s) for s in rows]


@router.get("/bank-submissions/pending-count")
async def bank_submissions_pending_count(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(KprBankSubmission).where(
        KprBankSubmission.tenant_id == ctx.tenant_id, KprBankSubmission.status == BankSubmissionStatus.PENDING))
    return {"count": count or 0}


async def _get_submission(db, tenant_id, sub_id) -> KprBankSubmission:
    sub = (await db.execute(
        select(KprBankSubmission).where(KprBankSubmission.id == sub_id, KprBankSubmission.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Kiriman tidak ditemukan")
    return sub


@router.get("/bank-submissions/{sub_id}/file")
async def download_submission_file(sub_id: uuid.UUID, request: Request, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Lihat file yang dikirim bank SEBELUM diterima — utk staf verifikasi dulu sebelum klik Terima."""
    sub = await _get_submission(db, ctx.tenant_id, sub_id)
    if not sub.has_file or not sub.file_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    etag = file_etag(sub.file_size, sub.updated_at)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = await storage.get(sub.file_key)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, sub.file_type, sub.file_name, etag)


@router.post("/bank-submissions/{sub_id}/accept", response_model=BankSubmissionResponse)
async def accept_bank_submission(sub_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Terima kiriman bank — baru di titik ini data KPR pembeli resmi berubah."""
    sub = await _get_submission(db, ctx.tenant_id, sub_id)
    if sub.status != BankSubmissionStatus.PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Kiriman ini sudah diproses")
    k = (await db.execute(
        select(KprApplication).where(KprApplication.id == sub.kpr_application_id, KprApplication.tenant_id == ctx.tenant_id, NOTDEL(KprApplication))
    )).scalar_one_or_none()
    if k is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pengajuan KPR tidak ditemukan")
    k.stage = sub.submitted_stage
    if sub.submitted_sp3k_number:
        k.sp3k_number = sub.submitted_sp3k_number
    if sub.submitted_sp3k_date:
        k.sp3k_date = sub.submitted_sp3k_date
    if sub.submitted_plafond is not None:
        k.plafond = sub.submitted_plafond
    if sub.submitted_tenor_months is not None:
        k.tenor_months = sub.submitted_tenor_months
    if sub.has_file:
        k.sp3k_file_name = sub.file_name
        k.sp3k_file_type = sub.file_type
        k.sp3k_file_size = sub.file_size
        k.sp3k_file_key = sub.file_key  # pakai ulang objek MinIO yang sama, tak diunggah ulang
    sub.status = BankSubmissionStatus.ACCEPTED
    sub.reviewed_by = ctx.user_id
    sub.reviewed_at = datetime.now(timezone.utc)
    await db.flush()
    await _sync_client_on_kpr_stage(db, ctx.tenant_id, k.client_id, k.stage)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "ACCEPT", "kpr_bank_submissions", sub_id,
                       new_data={"stage": sub.submitted_stage.value}, client_id=k.client_id)
    return await _submission_response(db, ctx.tenant_id, sub)


@router.post("/bank-submissions/{sub_id}/reject", response_model=BankSubmissionResponse)
async def reject_bank_submission(sub_id: uuid.UUID, payload: BankSubmissionRejectRequest, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Tolak kiriman bank — wajib alasan. Tak menyentuh data KPR."""
    sub = await _get_submission(db, ctx.tenant_id, sub_id)
    if sub.status != BankSubmissionStatus.PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Kiriman ini sudah diproses")
    sub.status = BankSubmissionStatus.REJECTED
    sub.reviewed_by = ctx.user_id
    sub.reviewed_at = datetime.now(timezone.utc)
    sub.notes = payload.reason.strip()
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "REJECT", "kpr_bank_submissions", sub_id,
                       reason=payload.reason.strip())
    return await _submission_response(db, ctx.tenant_id, sub)
