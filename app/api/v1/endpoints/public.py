import uuid
from datetime import datetime, date, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File, Form
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core import storage
from app.core.audit import record_audit
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.models.tenant import Tenant
from app.models.tax import (
    MonthlyTaxShareLink, TaxRecord, TaxStatus, TaxType, Notary, NotaryFee,
    NotaryShareLink, NotarySubmission, NotarySubmissionKind,
)
from app.models.kpr import Bank, KprApplication, KprStage, BankShareLink, KprBankSubmission
from app.models.marketing import Client
from app.models.property import Unit, Project
from app.models.document import Document, DocStatus
from app.schemas.kpr import PublicBankPageResponse, PublicBankRow
from app.schemas.tax import (
    PublicNotaryPageResponse, PublicNotaryClientRow, PublicNotaryTaxRow, PublicNotaryFeeRow,
)
from app.api.v1.endpoints.reporting import _build_monthly_tax_report, MonthlyTaxReport

router = APIRouter()

MAX_SUBMISSION_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.get("/tenant/{slug}")
async def tenant_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    """Info publik tenant (untuk branding halaman login per subdomain). Tanpa auth.

    Hanya expose data non-sensitif: nama & slug. 404 bila tak ada / nonaktif.
    """
    t = (await db.execute(
        select(Tenant).where(Tenant.slug == slug)
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Kantor Digital tidak ditemukan")
    return {"name": t.name, "slug": t.slug}


@router.get("/tenant-logo/{slug}")
async def tenant_logo(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Logo perusahaan tenant — non-sensitif (branding), dilayani tanpa auth supaya bisa dipakai
    langsung sbg <img src> di dokumen cetak (BAST/Kwitansi/Pengajuan Pembayaran)."""
    meta = (await db.execute(
        select(Tenant.logo_size, Tenant.logo_type, Tenant.logo_name, Tenant.updated_at, Tenant.logo_key)
        .where(Tenant.slug == slug)
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Logo tidak ditemukan")
    size, ctype, fname, updated, fkey = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = await storage.get(fkey)
    return cached_file_response(data, ctype, fname, etag)


@router.get("/monthly-tax/{token}", response_model=MonthlyTaxReport)
async def public_monthly_tax(token: str, db: AsyncSession = Depends(get_db)):
    """Laporan Pajak Bulanan lewat tautan bertoken (tanpa login) — utk pihak luar (mis. konsultan pajak).
    404 bila token salah/sudah dicabut/kedaluwarsa. Setiap akses dicatat (last_accessed_at + access_count)."""
    link = (await db.execute(
        select(MonthlyTaxShareLink).where(MonthlyTaxShareLink.token == token)
    )).scalar_one_or_none()
    if link is None or not link.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan, sudah dicabut, atau kedaluwarsa")
    link.last_accessed_at = datetime.now(timezone.utc)
    link.access_count += 1
    await db.flush()
    return await _build_monthly_tax_report(db, link.tenant_id, link.month, link.project_id)


@router.get("/bank/{token}", response_model=PublicBankPageResponse)
async def public_bank_page(token: str, db: AsyncSession = Depends(get_db)):
    """Status pemberkasan pembeli yang ditangani 1 bank, lewat tautan bertoken (tanpa login).
    Cakupan sempit: cuma pembeli bank ini yang SEDANG di tahap Berkas Masuk Bank (yg butuh aksi bank
    sekarang) — tahap KPR, status dokumen & pajak (jumlah, bukan detail)."""
    link = (await db.execute(select(BankShareLink).where(BankShareLink.token == token))).scalar_one_or_none()
    if link is None or not link.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan, sudah dicabut, atau kedaluwarsa")
    link.last_accessed_at = datetime.now(timezone.utc)
    link.access_count += 1
    await db.flush()

    bank_name = await db.scalar(select(Bank.name).where(Bank.id == link.bank_id)) or "Bank"

    kpr_rows = (await db.execute(
        select(KprApplication).where(
            KprApplication.tenant_id == link.tenant_id, KprApplication.bank_id == link.bank_id,
            KprApplication.stage == KprStage.BERKAS_MASUK_BANK, KprApplication.is_deleted == False)  # noqa: E712
        .order_by(KprApplication.created_at.desc())
    )).scalars().all()
    seen: set = set()
    apps = []
    for k in kpr_rows:   # 1 baris per pembeli — pengajuan TERBARU saja (kalau pernah ajukan ulang)
        if k.client_id in seen:
            continue
        seen.add(k.client_id)
        apps.append(k)
    if not apps:
        return PublicBankPageResponse(bank_name=bank_name, rows=[])

    client_ids = [k.client_id for k in apps]
    clients = {c.id: c for c in (await db.execute(select(Client).where(Client.id.in_(client_ids)))).scalars().all()}
    unit_ids = {c.unit_id for c in clients.values() if c.unit_id}
    units = {u.id: u for u in (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()} if unit_ids else {}
    proj_ids = {c.project_id for c in clients.values() if c.project_id}
    proj_names = dict((await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))).all()) if proj_ids else {}

    doc_rows = (await db.execute(
        select(Document.client_id, Document.status, func.count())
        .where(Document.client_id.in_(client_ids), Document.is_deleted == False)  # noqa: E712
        .group_by(Document.client_id, Document.status)
    )).all()
    doc_total: dict = {}; doc_terbit: dict = {}
    for cid, dstatus, cnt in doc_rows:
        doc_total[cid] = doc_total.get(cid, 0) + cnt
        if dstatus == DocStatus.TERBIT:
            doc_terbit[cid] = doc_terbit.get(cid, 0) + cnt

    tax_rows = (await db.execute(
        select(TaxRecord.client_id, TaxRecord.status, func.count())
        .where(TaxRecord.client_id.in_(client_ids), TaxRecord.is_deleted == False)  # noqa: E712
        .group_by(TaxRecord.client_id, TaxRecord.status)
    )).all()
    tax_total: dict = {}; tax_settled: dict = {}
    for cid, tstatus, cnt in tax_rows:
        tax_total[cid] = tax_total.get(cid, 0) + cnt
        if tstatus != TaxStatus.BELUM:
            tax_settled[cid] = tax_settled.get(cid, 0) + cnt

    today = date.today()
    rows = []
    for k in apps:
        c = clients.get(k.client_id)
        if c is None:
            continue
        u = units.get(c.unit_id) if c.unit_id else None
        unit_label = "-".join(x for x in [u.block, u.unit_number] if x) if u else None
        days = None
        if k.submitted_date:
            end = k.akad_date or today
            d = (end - k.submitted_date).days
            days = d if d >= 0 else None
        rows.append(PublicBankRow(
            kpr_application_id=k.id, client_name=c.full_name, unit_label=unit_label,
            project_name=proj_names.get(c.project_id), stage=k.stage,
            plafond=k.plafond, tenor_months=k.tenor_months,
            doc_total=doc_total.get(c.id, 0), doc_terbit=doc_terbit.get(c.id, 0),
            tax_total=tax_total.get(c.id, 0), tax_settled=tax_settled.get(c.id, 0), kpr_days=days,
        ))
    rows.sort(key=lambda r: r.client_name)
    return PublicBankPageResponse(bank_name=bank_name, rows=rows)


@router.post("/bank/{token}/submissions", status_code=status.HTTP_201_CREATED)
async def public_bank_submit(
    token: str,
    kpr_application_id: uuid.UUID = Form(...),
    stage: KprStage = Form(...),
    sp3k_number: str = Form(None),
    sp3k_date: str = Form(None),
    plafond: str = Form(None),
    tenor_months: str = Form(None),
    notes: str = Form(None),
    file: UploadFile = File(None),
    db: AsyncSession = Depends(get_db),
):
    """Kiriman dari bank (progres/No. SP3K/Tgl SP3K/plafon/tenor/catatan/file) — TIDAK langsung mengubah data KPR.
    Bank tak punya tombol "tolak" sendiri — kalau berkas kurang/ditolak, cukup tulis di catatan;
    developer yang putuskan terima/tolak lewat halaman Kiriman Bank (lihat kpr.py accept_bank_submission)."""
    link = (await db.execute(select(BankShareLink).where(BankShareLink.token == token))).scalar_one_or_none()
    if link is None or not link.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan, sudah dicabut, atau kedaluwarsa")

    k = (await db.execute(
        select(KprApplication).where(
            KprApplication.id == kpr_application_id, KprApplication.tenant_id == link.tenant_id,
            KprApplication.bank_id == link.bank_id, KprApplication.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if k is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pengajuan KPR tidak ditemukan utk bank ini")

    parsed_date = None
    if sp3k_date:
        try:
            parsed_date = date.fromisoformat(sp3k_date)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Format tanggal SP3K salah")
    parsed_plafond = None
    if plafond:
        try:
            parsed_plafond = Decimal(plafond)
        except InvalidOperation:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Format plafon salah")
    parsed_tenor = None
    if tenor_months:
        try:
            parsed_tenor = int(tenor_months)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Format tenor salah")

    sub = KprBankSubmission(
        tenant_id=link.tenant_id, kpr_application_id=k.id, bank_share_link_id=link.id,
        submitted_stage=stage, submitted_sp3k_number=(sp3k_number or None), submitted_sp3k_date=parsed_date,
        submitted_plafond=parsed_plafond, submitted_tenor_months=parsed_tenor, submitted_notes=(notes or None),
    )
    if file is not None and file.filename:
        data = await file.read()
        if len(data) > MAX_SUBMISSION_FILE_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
        sub.file_key = storage.build_key(link.tenant_id, "kpr-bank-submissions", kpr_application_id, file.filename)
        await storage.put(sub.file_key, data, file.content_type)
        sub.file_name = file.filename
        sub.file_type = file.content_type or "application/octet-stream"
        sub.file_size = len(data)
    db.add(sub)
    await db.flush()
    link.last_accessed_at = datetime.now(timezone.utc)
    link.access_count += 1
    await record_audit(db, link.tenant_id, None, "SUBMIT", "kpr_bank_submissions", sub.id,
                       new_data={"stage": stage.value}, client_id=k.client_id)
    return {"status": "submitted", "id": str(sub.id)}


@router.get("/notary/{token}", response_model=PublicNotaryPageResponse)
async def public_notary_page(token: str, db: AsyncSession = Depends(get_db)):
    """PPJB/AJB, pajak, & biaya jasa notaris utk pembeli yang DIA tangani, lewat tautan bertoken.
    Cakupan sempit: hanya baris pajak/biaya yang notary_id-nya = notaris ini (bukan seluruh pembeli tenant)."""
    link = (await db.execute(select(NotaryShareLink).where(NotaryShareLink.token == token))).scalar_one_or_none()
    if link is None or not link.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan, sudah dicabut, atau kedaluwarsa")
    link.last_accessed_at = datetime.now(timezone.utc)
    link.access_count += 1
    await db.flush()

    notary_name = await db.scalar(select(Notary.name).where(Notary.id == link.notary_id)) or "Notaris"

    tax_rows = (await db.execute(
        select(TaxRecord).where(TaxRecord.notary_id == link.notary_id, TaxRecord.tenant_id == link.tenant_id, TaxRecord.is_deleted == False)  # noqa: E712
    )).scalars().all()
    fee_rows = (await db.execute(
        select(NotaryFee).where(NotaryFee.notary_id == link.notary_id, NotaryFee.tenant_id == link.tenant_id, NotaryFee.is_deleted == False)  # noqa: E712
    )).scalars().all()

    client_ids = {r.client_id for r in tax_rows} | {r.client_id for r in fee_rows}
    if not client_ids:
        return PublicNotaryPageResponse(notary_name=notary_name, rows=[])

    clients = {c.id: c for c in (await db.execute(select(Client).where(Client.id.in_(client_ids)))).scalars().all()}
    unit_ids = {c.unit_id for c in clients.values() if c.unit_id}
    units = {u.id: u for u in (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()} if unit_ids else {}
    proj_ids = {c.project_id for c in clients.values() if c.project_id}
    proj_names = dict((await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))).all()) if proj_ids else {}

    tax_by_client: dict = {}
    for t in tax_rows:
        tax_by_client.setdefault(t.client_id, []).append(PublicNotaryTaxRow(
            id=t.id, tax_type=t.tax_type, category=t.category, amount=t.amount,
            id_billing=t.id_billing, ntpn=t.ntpn, tax_date=t.tax_date, status=t.status,
        ))
    fee_by_client: dict = {}
    for f in fee_rows:
        fee_by_client.setdefault(f.client_id, []).append(PublicNotaryFeeRow(
            id=f.id, description=f.description, amount=f.amount, fee_date=f.fee_date, is_paid=f.is_paid,
        ))

    rows = []
    for cid in client_ids:
        c = clients.get(cid)
        if c is None:
            continue
        u = units.get(c.unit_id) if c.unit_id else None
        unit_label = "-".join(x for x in [u.block, u.unit_number] if x) if u else None
        rows.append(PublicNotaryClientRow(
            client_id=c.id, client_name=c.full_name, unit_label=unit_label,
            project_name=proj_names.get(c.project_id),
            ppjb_number=c.ppjb_number, has_ppjb_file=c.has_ppjb_file,
            ajb_number=c.ajb_number, has_ajb_file=c.has_ajb_file,
            tax_records=tax_by_client.get(cid, []), fees=fee_by_client.get(cid, []),
        ))
    rows.sort(key=lambda r: r.client_name)
    return PublicNotaryPageResponse(notary_name=notary_name, rows=rows)


@router.post("/notary/{token}/submissions", status_code=status.HTTP_201_CREATED)
async def public_notary_submit(
    token: str,
    client_id: uuid.UUID = Form(...),
    kind: NotarySubmissionKind = Form(...),
    target_id: str = Form(None),
    ppjb_number: str = Form(None),
    ppjb_file: UploadFile = File(None),
    ajb_number: str = Form(None),
    ajb_file: UploadFile = File(None),
    tax_type: str = Form(None),
    tax_category: str = Form(None),
    tax_base_amount: str = Form(None),
    tax_amount: str = Form(None),
    tax_id_billing: str = Form(None),
    tax_ntpn: str = Form(None),
    tax_date: str = Form(None),
    tax_status: str = Form(None),
    fee_description: str = Form(None),
    fee_amount: str = Form(None),
    fee_date: str = Form(None),
    file: UploadFile = File(None),
    notes: str = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Kiriman dari notaris (PPJB/AJB, pajak, atau biaya notaris) — TIDAK langsung mengubah data.
    Developer terima/tolak lewat menu Kiriman Notaris (lihat tax.py accept_notary_submission)."""
    link = (await db.execute(select(NotaryShareLink).where(NotaryShareLink.token == token))).scalar_one_or_none()
    if link is None or not link.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan, sudah dicabut, atau kedaluwarsa")

    c = (await db.execute(select(Client).where(Client.id == client_id, Client.tenant_id == link.tenant_id, Client.is_deleted == False))).scalar_one_or_none()  # noqa: E712
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembeli tidak ditemukan")
    # pembeli harus benar-benar ditangani notaris ini (setidaknya sudah ada baris pajak/biaya bernotaris ini)
    handled = (await db.scalar(select(func.count()).select_from(TaxRecord).where(
        TaxRecord.client_id == client_id, TaxRecord.notary_id == link.notary_id, TaxRecord.is_deleted == False)) or 0)  # noqa: E712
    handled += (await db.scalar(select(func.count()).select_from(NotaryFee).where(
        NotaryFee.client_id == client_id, NotaryFee.notary_id == link.notary_id, NotaryFee.is_deleted == False)) or 0)  # noqa: E712
    if handled == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembeli ini tidak ditangani notaris ini")

    try:
        parsed_target_id = uuid.UUID(target_id) if target_id else None
        parsed_tax_base = Decimal(tax_base_amount) if tax_base_amount else None
        parsed_tax_amount = Decimal(tax_amount) if tax_amount else None
        parsed_tax_date = date.fromisoformat(tax_date) if tax_date else None
        parsed_fee_amount = Decimal(fee_amount) if fee_amount else None
        parsed_fee_date = date.fromisoformat(fee_date) if fee_date else None
    except (ValueError, InvalidOperation):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Format data salah")

    sub = NotarySubmission(
        tenant_id=link.tenant_id, notary_share_link_id=link.id, client_id=client_id,
        kind=kind, target_id=parsed_target_id,
        ppjb_number=(ppjb_number or None), ajb_number=(ajb_number or None),
        tax_type=(TaxType(tax_type) if tax_type else None), tax_category=(tax_category or None),
        tax_base_amount=parsed_tax_base, tax_amount=parsed_tax_amount,
        tax_id_billing=(tax_id_billing or None), tax_ntpn=(tax_ntpn or None),
        tax_date=parsed_tax_date, tax_status=(TaxStatus(tax_status) if tax_status else None),
        fee_description=(fee_description or None), fee_amount=parsed_fee_amount, fee_date=parsed_fee_date,
        submitted_notes=(notes or None),
    )
    for f, key_field, name_field, type_field, size_field in [
        (ppjb_file, 'ppjb_file_key', 'ppjb_file_name', 'ppjb_file_type', 'ppjb_file_size'),
        (ajb_file, 'ajb_file_key', 'ajb_file_name', 'ajb_file_type', 'ajb_file_size'),
        (file, 'file_key', 'file_name', 'file_type', 'file_size'),
    ]:
        if f is not None and f.filename:
            data = await f.read()
            if len(data) > MAX_SUBMISSION_FILE_BYTES:
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
            key = storage.build_key(link.tenant_id, "notary-submissions", client_id, f.filename)
            await storage.put(key, data, f.content_type)
            setattr(sub, key_field, key)
            setattr(sub, name_field, f.filename)
            setattr(sub, type_field, f.content_type or "application/octet-stream")
            setattr(sub, size_field, len(data))
    db.add(sub)
    await db.flush()
    link.last_accessed_at = datetime.now(timezone.utc)
    link.access_count += 1
    await record_audit(db, link.tenant_id, None, "SUBMIT", "notary_submissions", sub.id,
                       new_data={"kind": kind.value}, client_id=client_id)
    return {"status": "submitted", "id": str(sub.id)}
