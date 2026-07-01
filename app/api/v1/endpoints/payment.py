import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.sale import Sale
from app.models.payment import PaymentSchedule, Payment, ScheduleStatus
from app.schemas.payment import (
    ScheduleCreate, ScheduleUpdate, ScheduleResponse,
    PaymentCreate, PaymentUpdate, PaymentResponse, PaymentSummary,
)

router = APIRouter()


async def _get_sale(db, tenant_id, sale_id) -> Sale:
    s = (await db.execute(select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id))).scalar_one_or_none()
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Penjualan tidak ditemukan")
    return s


async def _recompute_schedule(db, tenant_id, schedule_id):
    """Tandai termin lunas bila total pembayaran untuk termin itu >= nominalnya."""
    if not schedule_id:
        return
    sch = (await db.execute(
        select(PaymentSchedule).where(PaymentSchedule.id == schedule_id, PaymentSchedule.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if sch is None:
        return
    paid = await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.schedule_id == schedule_id)
    )
    sch.status = ScheduleStatus.PAID if Decimal(paid) >= sch.amount else ScheduleStatus.PENDING


# ═══════════════════════ SUMMARY ═══════════════════════
@router.get("/summary", response_model=PaymentSummary)
async def payment_summary(
    sale_id: uuid.UUID = Query(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    sale = await _get_sale(db, ctx.tenant_id, sale_id)
    price = Decimal(sale.price or 0)
    total_paid = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.sale_id == sale_id)
    ))
    remaining = price - total_paid
    progress = float(total_paid / price * 100) if price > 0 else 0.0

    sch_total = await db.scalar(select(func.count()).select_from(PaymentSchedule).where(PaymentSchedule.sale_id == sale_id))
    sch_paid = await db.scalar(select(func.count()).select_from(PaymentSchedule).where(
        PaymentSchedule.sale_id == sale_id, PaymentSchedule.status == ScheduleStatus.PAID))
    overdue = await db.scalar(select(func.count()).select_from(PaymentSchedule).where(
        PaymentSchedule.sale_id == sale_id, PaymentSchedule.status == ScheduleStatus.PENDING,
        PaymentSchedule.due_date < date.today()))

    return PaymentSummary(
        sale_id=sale_id, price=price, total_paid=total_paid, remaining=remaining,
        progress_percent=round(progress, 1),
        schedule_count=sch_total or 0, schedule_paid=sch_paid or 0,
        schedule_pending=(sch_total or 0) - (sch_paid or 0), overdue_count=overdue or 0,
    )


# ═══════════════════════ SCHEDULES (Termin) ═══════════════════════
@router.get("/schedules", response_model=list[ScheduleResponse])
async def list_schedules(
    sale_id: uuid.UUID = Query(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PaymentSchedule)
        .where(PaymentSchedule.sale_id == sale_id, PaymentSchedule.tenant_id == ctx.tenant_id)
        .order_by(PaymentSchedule.sequence, PaymentSchedule.due_date)
    )
    return result.scalars().all()


@router.post("/schedules", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_sale(db, ctx.tenant_id, payload.sale_id)
    sch = PaymentSchedule(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(sch)
    await db.flush()
    await db.refresh(sch)
    return sch


async def _get_schedule(db, tenant_id, schedule_id) -> PaymentSchedule:
    sch = (await db.execute(
        select(PaymentSchedule).where(PaymentSchedule.id == schedule_id, PaymentSchedule.tenant_id == tenant_id)
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
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(sch, f, v)
    await db.flush()
    await db.refresh(sch)
    return sch


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    sch = await _get_schedule(db, ctx.tenant_id, schedule_id)
    await db.delete(sch)


# ═══════════════════════ PAYMENTS (Uang Masuk) ═══════════════════════
@router.get("/records", response_model=list[PaymentResponse])
async def list_payments(
    sale_id: uuid.UUID = Query(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Payment)
        .where(Payment.sale_id == sale_id, Payment.tenant_id == ctx.tenant_id)
        .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
    )
    return result.scalars().all()


@router.post("/records", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    payload: PaymentCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_sale(db, ctx.tenant_id, payload.sale_id)
    pay = Payment(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(pay)
    await db.flush()
    await _recompute_schedule(db, ctx.tenant_id, pay.schedule_id)
    await db.refresh(pay)
    return pay


async def _get_payment(db, tenant_id, payment_id) -> Payment:
    pay = (await db.execute(
        select(Payment).where(Payment.id == payment_id, Payment.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if pay is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembayaran tidak ditemukan")
    return pay


@router.patch("/records/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: uuid.UUID,
    payload: PaymentUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    pay = await _get_payment(db, ctx.tenant_id, payment_id)
    old_schedule = pay.schedule_id
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(pay, f, v)
    await db.flush()
    # recompute termin lama & baru
    await _recompute_schedule(db, ctx.tenant_id, old_schedule)
    if pay.schedule_id != old_schedule:
        await _recompute_schedule(db, ctx.tenant_id, pay.schedule_id)
    await db.refresh(pay)
    return pay


@router.delete("/records/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment(
    payment_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    pay = await _get_payment(db, ctx.tenant_id, payment_id)
    sched = pay.schedule_id
    await db.delete(pay)
    await db.flush()
    await _recompute_schedule(db, ctx.tenant_id, sched)
