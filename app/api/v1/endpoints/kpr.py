import uuid
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext
from app.models.kpr import Bank, KprApplication, KprStage
from app.models.marketing import Client
from app.models.payment import Payment, PaymentSource, PaymentMethod, PaymentPurpose
from app.schemas.kpr import (
    BankCreate, BankUpdate, BankResponse,
    KprCreate, KprUpdate, KprResponse, DisburseRequest,
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
async def _load_kpr(db, tenant_id, kpr_id) -> KprApplication:
    k = (await db.execute(
        select(KprApplication).options(selectinload(KprApplication.bank))
        .where(KprApplication.id == kpr_id, KprApplication.tenant_id == tenant_id, NOTDEL(KprApplication))
    )).scalar_one_or_none()
    if k is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pengajuan KPR tidak ditemukan")
    return k


@router.get("/applications", response_model=list[KprResponse])
async def list_kpr(client_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(KprApplication).options(selectinload(KprApplication.bank))
        .where(KprApplication.client_id == client_id, KprApplication.tenant_id == ctx.tenant_id, NOTDEL(KprApplication))
        .order_by(KprApplication.created_at.desc())
    )
    return r.scalars().all()


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
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "kpr_applications", kpr_id, new_data=data)
    return await _load_kpr(db, ctx.tenant_id, kpr_id)


@router.delete("/applications/{kpr_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kpr(kpr_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    k = await _load_kpr(db, ctx.tenant_id, kpr_id)
    k.is_deleted = True; k.deleted_at = datetime.utcnow()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "kpr_applications", kpr_id)


@router.post("/applications/{kpr_id}/disburse", response_model=KprResponse)
async def disburse_kpr(kpr_id: uuid.UUID, payload: DisburseRequest, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Catat pencairan KPR → set tahap Pencairan & buat uang masuk (sumber Bank) otomatis."""
    k = await _load_kpr(db, ctx.tenant_id, kpr_id)
    pay_date = payload.pay_date or date.today()

    if k.pencairan_payment_id:
        # sudah pernah cair → update pembayaran yang ada
        pay = (await db.execute(select(Payment).where(Payment.id == k.pencairan_payment_id, NOTDEL(Payment)))).scalar_one_or_none()
        if pay:
            pay.amount = payload.amount
            pay.payment_date = pay_date
    else:
        pay = Payment(
            tenant_id=ctx.tenant_id, client_id=k.client_id, amount=payload.amount,
            payment_date=pay_date, method=PaymentMethod.TRANSFER, source=PaymentSource.BANK,
            purpose=PaymentPurpose.REALISASI_KPR,
            notes="Pencairan KPR",
        )
        db.add(pay)
        await db.flush()
        k.pencairan_payment_id = pay.id

    k.stage = KprStage.PENCAIRAN
    k.pencairan_amount = payload.amount
    k.pencairan_date = pay_date
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DISBURSE", "kpr_applications", kpr_id,
                       new_data={"amount": str(payload.amount), "date": str(pay_date)})
    return await _load_kpr(db, ctx.tenant_id, kpr_id)
