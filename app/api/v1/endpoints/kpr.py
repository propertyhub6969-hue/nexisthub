import uuid
from datetime import datetime, date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.core.unit_status import unit_status_for_client, set_unit_status
from app.api.deps import get_current_context, AuthContext
from app.models.kpr import Bank, KprApplication, KprStage
from app.models.marketing import Client, ClientStatus
from app.models.payment import Payment, PaymentSource, PaymentMethod, PaymentPurpose
from app.schemas.kpr import (
    BankCreate, BankUpdate, BankResponse,
    KprCreate, KprUpdate, KprResponse, DisburseRequest, DisbursementResponse, RejectRequest,
)

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


# ═══════════════════════ KPR APPLICATIONS ═══════════════════════
async def _disbursed_total(db, tenant_id, kpr_id) -> Decimal:
    """Total pencairan yang sudah cair (jumlah semua uang masuk Bank bertautan KPR ini)."""
    return Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.kpr_id == kpr_id, Payment.tenant_id == tenant_id, NOTDEL(Payment))
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
    # Tgl Collect Berkas default = tanggal pembeli pertama kali dientri (bila tak diisi manual)
    if data.get("submitted_date") is None:
        client = (await db.execute(
            select(Client).where(Client.id == payload.client_id, Client.tenant_id == ctx.tenant_id)
        )).scalar_one_or_none()
        if client is not None:
            data["submitted_date"] = client.created_at.date()
    k = KprApplication(tenant_id=ctx.tenant_id, **data)
    db.add(k); await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "kpr_applications", k.id, new_data=payload)
    return await _load_kpr(db, ctx.tenant_id, k.id)


@router.patch("/applications/{kpr_id}", response_model=KprResponse)
async def update_kpr(kpr_id: uuid.UUID, payload: KprUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    k = await _load_kpr(db, ctx.tenant_id, kpr_id)
    data = payload.model_dump(exclude_unset=True)
    for f, v in data.items():
        setattr(k, f, v)
    await db.flush()
    await _sync_client_on_kpr_stage(db, ctx.tenant_id, k.client_id, k.stage)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "kpr_applications", kpr_id, new_data=data)
    return await _load_kpr(db, ctx.tenant_id, kpr_id)


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
    )
    db.add(pay)
    await db.flush()

    k.pencairan_payment_id = k.pencairan_payment_id or pay.id
    k.pencairan_date = pay_date
    k.pencairan_amount = await _disbursed_total(db, ctx.tenant_id, k.id)  # legacy: total cair
    k.stage = KprStage.PENCAIRAN
    await db.flush()
    await _sync_client_on_kpr_stage(db, ctx.tenant_id, k.client_id, k.stage)
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
    # sinkron kolom legacy pencairan_amount
    k = (await db.execute(select(KprApplication).where(KprApplication.id == kpr_id))).scalar_one_or_none()
    if k is not None:
        k.pencairan_amount = await _disbursed_total(db, ctx.tenant_id, kpr_id)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "payments", payment_id, old_data={"kpr_disbursement": str(pay.amount)})
