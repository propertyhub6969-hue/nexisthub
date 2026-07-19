import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Request
from fastapi.responses import Response
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.core import storage
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext, require_role
from app.core.audit import record_audit
from app.core.cashbook import sync_payment_cashbook
from app.models.user import User, UserRole
from app.models.marketing import Client
from app.models.property import Unit
from app.models.payment import PaymentSchedule, Payment, ScheduleStatus, PaymentSource, PaymentApprovalStatus
from app.models.kpr import KprApplication, KprStage
from app.schemas.payment import (
    ScheduleCreate, ScheduleUpdate, ScheduleResponse,
    PaymentCreate, PaymentUpdate, PaymentResponse, PaymentSummary,
    PendingPaymentResponse, RejectPaymentRequest,
)

APPROVERS = (UserRole.OWNER, UserRole.ADMIN, UserRole.FINANCE)

router = APIRouter()

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


async def _get_client(db, tenant_id, client_id) -> Client:
    c = (await db.execute(select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id))).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembeli tidak ditemukan")
    return c


async def _recompute_schedule(db, tenant_id, schedule_id):
    """Tandai termin lunas bila total pembayaran untuk termin itu >= nominalnya."""
    if not schedule_id:
        return
    sch = (await db.execute(
        select(PaymentSchedule).where(PaymentSchedule.id == schedule_id, PaymentSchedule.tenant_id == tenant_id,
                                      PaymentSchedule.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if sch is None:
        return
    paid = await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.schedule_id == schedule_id, Payment.is_deleted == False,  # noqa: E712
            Payment.approval_status == PaymentApprovalStatus.APPROVED)
    )
    sch.status = ScheduleStatus.PAID if Decimal(paid) >= sch.amount else ScheduleStatus.PENDING


# ═══════════════════════ SUMMARY ═══════════════════════
@router.get("/summary", response_model=PaymentSummary)
async def payment_summary(
    client_id: uuid.UUID = Query(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    client = await _get_client(db, ctx.tenant_id, client_id)
    price = Decimal(client.contract_value or 0)

    _notdel = Payment.is_deleted == False  # noqa: E712
    _approved = Payment.approval_status == PaymentApprovalStatus.APPROVED
    from_buyer = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.client_id == client_id, Payment.source == PaymentSource.PEMBELI, _notdel, _approved)
    ))
    from_bank = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.client_id == client_id, Payment.source == PaymentSource.BANK, _notdel, _approved)
    ))
    pending_amount = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.client_id == client_id, _notdel, Payment.approval_status == PaymentApprovalStatus.PENDING)
    ))
    total_paid = from_buyer + from_bank
    remaining = price - total_paid
    progress = float(total_paid / price * 100) if price > 0 else 0.0

    # Plafon KPR = KPR terbaru pembeli ini (kalau cash → 0). Ambil plafon + tahapnya.
    kpr_row = (await db.execute(
        select(KprApplication.plafond, KprApplication.stage).where(
            KprApplication.client_id == client_id, KprApplication.tenant_id == ctx.tenant_id,
            KprApplication.is_deleted == False)  # noqa: E712
        .order_by(KprApplication.created_at.desc()).limit(1)
    )).first()
    kpr_plafond = Decimal(kpr_row[0] or 0) if kpr_row else Decimal(0)
    kpr_stage = kpr_row[1] if kpr_row else None
    has_kpr = kpr_plafond > 0
    # Plafon baru MENUTUP kewajiban pembeli SETELAH akad kredit (sebelum akad pinjaman belum final —
    # kalau KPR gagal sebelum akad, pembeli tetap menanggung penuh). SP3K/berkas belum menghitung.
    committed = kpr_plafond if kpr_stage in (KprStage.AKAD_KREDIT, KprStage.PENCAIRAN) else Decimal(0)
    # Sisa kewajiban PEMBELI: harga − uang dari pembeli − komitmen KPR (yang sudah akad)
    buyer_remaining = price - from_buyer - committed
    # RETENSI: plafon (yang sudah akad) − yang sudah cair dari bank
    retention_remaining = (committed - from_bank) if committed > 0 else Decimal(0)

    _sch = [PaymentSchedule.client_id == client_id, PaymentSchedule.is_deleted == False]  # noqa: E712
    sch_total = await db.scalar(select(func.count()).select_from(PaymentSchedule).where(*_sch))
    sch_paid = await db.scalar(select(func.count()).select_from(PaymentSchedule).where(
        *_sch, PaymentSchedule.status == ScheduleStatus.PAID))
    overdue = await db.scalar(select(func.count()).select_from(PaymentSchedule).where(
        *_sch, PaymentSchedule.status == ScheduleStatus.PENDING,
        PaymentSchedule.due_date < date.today()))

    return PaymentSummary(
        client_id=client_id, price=price, total_paid=total_paid, remaining=remaining,
        progress_percent=round(progress, 1),
        schedule_count=sch_total or 0, schedule_paid=sch_paid or 0,
        schedule_pending=(sch_total or 0) - (sch_paid or 0), overdue_count=overdue or 0,
        from_buyer=from_buyer, from_bank=from_bank, kpr_plafond=kpr_plafond,
        buyer_remaining=buyer_remaining, retention_remaining=retention_remaining, has_kpr=has_kpr,
        pending_amount=pending_amount,
    )


# ═══════════════════════ SCHEDULES (Termin) ═══════════════════════
@router.get("/schedules", response_model=list[ScheduleResponse])
async def list_schedules(
    client_id: uuid.UUID = Query(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PaymentSchedule)
        .where(PaymentSchedule.client_id == client_id, PaymentSchedule.tenant_id == ctx.tenant_id,
               PaymentSchedule.is_deleted == False)  # noqa: E712
        .order_by(PaymentSchedule.sequence, PaymentSchedule.due_date)
    )
    schedules = result.scalars().all()

    # akumulasi pembayaran per termin (utk tampilkan sudah dibayar & sisa — dukung pembayaran sebagian)
    paid_rows = await db.execute(
        select(Payment.schedule_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.client_id == client_id, Payment.tenant_id == ctx.tenant_id,
               Payment.is_deleted == False, Payment.schedule_id.isnot(None),  # noqa: E712
               Payment.approval_status == PaymentApprovalStatus.APPROVED)
        .group_by(Payment.schedule_id)
    )
    paid_by_sched = {sid: Decimal(v) for sid, v in paid_rows.all()}
    for s in schedules:
        s.paid = paid_by_sched.get(s.id, Decimal(0))
        s.remaining = max(Decimal(s.amount) - s.paid, Decimal(0))
    return schedules


@router.post("/schedules", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_client(db, ctx.tenant_id, payload.client_id)
    sch = PaymentSchedule(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(sch)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "payment_schedules", sch.id,
                       new_data={"label": sch.label, "amount": str(sch.amount)}, client_id=sch.client_id)
    await db.refresh(sch)
    sch.paid = Decimal(0)                       # termin baru: belum ada pembayaran
    sch.remaining = Decimal(sch.amount)
    return sch


async def _get_schedule(db, tenant_id, schedule_id) -> PaymentSchedule:
    sch = (await db.execute(
        select(PaymentSchedule).where(PaymentSchedule.id == schedule_id, PaymentSchedule.tenant_id == tenant_id,
                                      PaymentSchedule.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if sch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Termin tidak ditemukan")
    return sch


@router.patch("/schedules/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    payload: ScheduleUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    sch = await _get_schedule(db, ctx.tenant_id, schedule_id)
    data = payload.model_dump(exclude_unset=True)
    reason = data.pop("reason", None)
    before_amount = sch.amount
    for f, v in data.items():
        setattr(sch, f, v)
    if sch.amount != before_amount and not (reason and reason.strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="Alasan wajib diisi untuk perubahan nominal termin")
    await db.flush()
    await _recompute_schedule(db, ctx.tenant_id, schedule_id)   # nominal berubah → status Lunas/Belum ikut menyesuaikan
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "payment_schedules", schedule_id,
                       new_data={"label": sch.label, "amount": str(sch.amount)}, client_id=sch.client_id,
                       reason=(reason.strip() if reason else None))
    await db.refresh(sch)
    paid = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.schedule_id == schedule_id, Payment.is_deleted == False)  # noqa: E712
    ))
    sch.paid = paid
    sch.remaining = max(Decimal(sch.amount) - paid, Decimal(0))
    return sch


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: uuid.UUID,
    reason: str = Query(..., min_length=1, description="Alasan penghapusan (wajib)"),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    sch = await _get_schedule(db, ctx.tenant_id, schedule_id)
    sch.is_deleted = True
    sch.deleted_at = datetime.utcnow()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "payment_schedules", schedule_id,
                       old_data={"label": sch.label, "amount": str(sch.amount)},
                       client_id=sch.client_id, reason=reason.strip())


# ═══════════════════════ PAYMENTS (Uang Masuk) ═══════════════════════
@router.get("/records", response_model=list[PaymentResponse])
async def list_payments(
    client_id: uuid.UUID = Query(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment).options(selectinload(Payment.approver))
        .where(Payment.client_id == client_id, Payment.tenant_id == ctx.tenant_id,
               Payment.is_deleted == False)  # noqa: E712
        .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
    )
    return result.scalars().all()


@router.get("/pending", response_model=list[PendingPaymentResponse])
async def list_pending_payments(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Semua pembayaran menunggu persetujuan, lintas pembeli — halaman Persetujuan Pembayaran."""
    rows = (await db.execute(
        select(Payment, Client.full_name, Unit.block, Unit.unit_number)
        .options(selectinload(Payment.approver))
        .select_from(Payment)
        .join(Client, Client.id == Payment.client_id)
        .outerjoin(Unit, Unit.id == Client.unit_id)
        .where(Payment.tenant_id == ctx.tenant_id, Payment.is_deleted == False,  # noqa: E712
               Payment.approval_status == PaymentApprovalStatus.PENDING)
        .order_by(Payment.payment_date, Payment.created_at)
    )).all()
    out = []
    for pay, client_name, block, unit_number in rows:
        unit_label = ((f"{block} " if block else "") + (unit_number or "")).strip() or None
        base = PaymentResponse.model_validate(pay).model_dump()
        out.append(PendingPaymentResponse(**base, client_name=client_name, unit_label=unit_label))
    return out


async def _generate_receipt_number(db, tenant_id) -> str:
    """Nomor kwitansi otomatis KW-000001, dst. Hitung SEMUA payment (termasuk terhapus)
    agar nomor tak pernah dipakai ulang meski ada yang dihapus."""
    count = await db.scalar(select(func.count()).select_from(Payment).where(Payment.tenant_id == tenant_id))
    return f"KW-{(count or 0) + 1:06d}"


@router.post("/records", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    payload: PaymentCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_client(db, ctx.tenant_id, payload.client_id)
    data = payload.model_dump()
    if not data.get("receipt_number"):
        data["receipt_number"] = await _generate_receipt_number(db, ctx.tenant_id)
    pay = Payment(tenant_id=ctx.tenant_id, **data)
    db.add(pay)
    await db.flush()
    await _recompute_schedule(db, ctx.tenant_id, pay.schedule_id)
    await sync_payment_cashbook(db, ctx.tenant_id, pay)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "payments", pay.id,
                       new_data=data, client_id=pay.client_id)
    await db.refresh(pay)
    return pay


async def _get_payment(db, tenant_id, payment_id) -> Payment:
    pay = (await db.execute(
        select(Payment).options(selectinload(Payment.approver))
        .where(Payment.id == payment_id, Payment.tenant_id == tenant_id,
              Payment.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if pay is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembayaran tidak ditemukan")
    return pay


@router.post("/records/{payment_id}/approve", response_model=PaymentResponse)
async def approve_payment(
    payment_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    approver: User = Depends(require_role(*APPROVERS)),
    db: AsyncSession = Depends(get_db),
):
    """Setujui pembayaran — baru dihitung sbg kas final & masuk laporan setelah ini."""
    pay = await _get_payment(db, ctx.tenant_id, payment_id)
    if pay.approval_status == PaymentApprovalStatus.APPROVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Pembayaran sudah disetujui")
    pay.approval_status = PaymentApprovalStatus.APPROVED
    pay.approver = approver
    pay.approved_at = datetime.utcnow()
    pay.rejection_reason = None
    await db.flush()
    await _recompute_schedule(db, ctx.tenant_id, pay.schedule_id)
    await sync_payment_cashbook(db, ctx.tenant_id, pay)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "APPROVE", "payments", payment_id,
                       new_data={"amount": str(pay.amount)}, client_id=pay.client_id)
    await db.refresh(pay)
    pay.approver = approver  # refresh() melepas relationship; set ulang tanpa query (lazy-load async tak aman di sini)
    return pay


@router.post("/records/{payment_id}/reject", response_model=PaymentResponse)
async def reject_payment(
    payment_id: uuid.UUID,
    payload: RejectPaymentRequest,
    ctx: AuthContext = Depends(get_current_context),
    approver: User = Depends(require_role(*APPROVERS)),
    db: AsyncSession = Depends(get_db),
):
    """Tolak pembayaran — wajib alasan. Tak dihitung kas/laporan; kembali ke staff utk diperbaiki."""
    pay = await _get_payment(db, ctx.tenant_id, payment_id)
    if pay.approval_status == PaymentApprovalStatus.REJECTED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Pembayaran sudah ditolak")
    was_approved = pay.approval_status == PaymentApprovalStatus.APPROVED
    pay.approval_status = PaymentApprovalStatus.REJECTED
    pay.approver = approver
    pay.approved_at = datetime.utcnow()
    pay.rejection_reason = payload.reason.strip()
    await db.flush()
    if was_approved:
        await _recompute_schedule(db, ctx.tenant_id, pay.schedule_id)  # sebelumnya lunas → hitung ulang
    await sync_payment_cashbook(db, ctx.tenant_id, pay)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "REJECT", "payments", payment_id,
                       new_data={"amount": str(pay.amount)}, client_id=pay.client_id,
                       reason=payload.reason.strip())
    await db.refresh(pay)
    pay.approver = approver  # refresh() melepas relationship; set ulang tanpa query
    return pay


@router.patch("/records/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: uuid.UUID,
    payload: PaymentUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    pay = await _get_payment(db, ctx.tenant_id, payment_id)
    if pay.kpr_id is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Pencairan KPR dikelola di modul KPR, tidak bisa diubah di sini")
    old_schedule = pay.schedule_id
    data = payload.model_dump(exclude_unset=True)
    reason = data.pop("reason", None)
    # nilai material sebelum diubah (perubahan angka wajib disertai alasan)
    before = (pay.amount, pay.source, pay.payment_date, pay.schedule_id)
    for f, v in data.items():
        setattr(pay, f, v)
    material_changed = (pay.amount, pay.source, pay.payment_date, pay.schedule_id) != before
    if material_changed and not (reason and reason.strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="Alasan wajib diisi untuk perubahan nominal/sumber/tanggal/termin pembayaran")
    # nominal/sumber/tanggal/termin berubah setelah disetujui/ditolak → wajib direview ulang finance
    if material_changed and pay.approval_status != PaymentApprovalStatus.PENDING:
        pay.approval_status = PaymentApprovalStatus.PENDING
        pay.approver_id = None
        pay.approved_at = None
        pay.rejection_reason = None
    await db.flush()
    await _recompute_schedule(db, ctx.tenant_id, old_schedule)
    if pay.schedule_id != old_schedule:
        await _recompute_schedule(db, ctx.tenant_id, pay.schedule_id)
    await sync_payment_cashbook(db, ctx.tenant_id, pay)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "payments", payment_id,
                       new_data={"amount": str(pay.amount), "source": pay.source.value},
                       client_id=pay.client_id, reason=(reason.strip() if reason else None))
    await db.refresh(pay)
    return pay


@router.post("/records/{payment_id}/file", response_model=PaymentResponse)
async def upload_payment_file(
    payment_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Upload bukti transfer untuk satu pembayaran."""
    pay = await _get_payment(db, ctx.tenant_id, payment_id)
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
    pay.file_key = storage.build_key(ctx.tenant_id, "payments", pay.id, file.filename)
    await storage.put(pay.file_key, data, file.content_type)
    pay.file_data = None
    pay.file_name = file.filename
    pay.file_type = file.content_type or "application/octet-stream"
    pay.file_size = len(data)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "payments", payment_id,
                       new_data={"file_name": file.filename, "size": len(data)}, client_id=pay.client_id)
    await db.refresh(pay)
    return pay


@router.get("/records/{payment_id}/file")
async def download_payment_file(
    payment_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    meta = (await db.execute(
        select(Payment.file_size, Payment.file_type, Payment.file_name, Payment.updated_at, Payment.file_key).where(
            Payment.id == payment_id, Payment.tenant_id == ctx.tenant_id, Payment.is_deleted == False)  # noqa: E712
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    size, ctype, fname, updated, fkey = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    if fkey:
        data = await storage.get(fkey)
    else:
        data = (await db.execute(
            select(Payment.file_data).where(Payment.id == payment_id, Payment.tenant_id == ctx.tenant_id)
        )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, ctype, fname, etag)


@router.delete("/records/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment(
    payment_id: uuid.UUID,
    reason: str = Query(..., min_length=1, description="Alasan penghapusan (wajib)"),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    pay = await _get_payment(db, ctx.tenant_id, payment_id)
    if pay.kpr_id is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Pencairan KPR dihapus dari modul KPR, bukan di sini")
    sched = pay.schedule_id
    pay.is_deleted = True
    pay.deleted_at = datetime.utcnow()
    await db.flush()
    await _recompute_schedule(db, ctx.tenant_id, sched)
    await sync_payment_cashbook(db, ctx.tenant_id, pay)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "payments", payment_id,
                       old_data={"amount": str(pay.amount), "source": pay.source.value},
                       client_id=pay.client_id, reason=reason.strip())
