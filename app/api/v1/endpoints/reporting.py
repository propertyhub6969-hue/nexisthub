from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.marketing import Lead, Prospect, Client, ProspectStatus, ClientStatus
from app.models.property import Unit, UnitStatus
from app.models.payment import Payment, PaymentSchedule, ScheduleStatus

router = APIRouter()


class DashboardStats(BaseModel):
    leads_total: int
    prospects_active: int
    clients_total: int
    units_total: int
    units_available: int
    units_booked: int
    units_sold: int
    payments_this_month: Decimal
    total_contract: Decimal
    total_paid: Decimal
    outstanding: Decimal
    overdue_count: int


async def _count(db, model, *conds) -> int:
    return await db.scalar(select(func.count()).select_from(model).where(*conds)) or 0


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    t = ctx.tenant_id
    month_start = date.today().replace(day=1)

    leads_total = await _count(db, Lead, Lead.tenant_id == t)
    prospects_active = await _count(db, Prospect, Prospect.tenant_id == t, Prospect.status == ProspectStatus.ACTIVE)
    clients_total = await _count(db, Client, Client.tenant_id == t, Client.is_deleted == False)  # noqa: E712

    units_total = await _count(db, Unit, Unit.tenant_id == t)
    units_available = await _count(db, Unit, Unit.tenant_id == t, Unit.status == UnitStatus.AVAILABLE)
    units_booked = await _count(db, Unit, Unit.tenant_id == t, Unit.status == UnitStatus.BOOKED)
    units_sold = await _count(db, Unit, Unit.tenant_id == t,
                              Unit.status.in_([UnitStatus.SOLD, UnitStatus.HANDOVER]))

    payments_this_month = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == t, Payment.is_deleted == False,  # noqa: E712
            Payment.payment_date >= month_start)
    ))
    total_contract = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Client.contract_value), 0)).where(
            Client.tenant_id == t, Client.is_deleted == False,  # noqa: E712
            Client.status != ClientStatus.INACTIVE)
    ))
    total_paid = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == t, Payment.is_deleted == False)  # noqa: E712
    ))
    overdue_count = await _count(db, PaymentSchedule, PaymentSchedule.tenant_id == t,
                                 PaymentSchedule.is_deleted == False,  # noqa: E712
                                 PaymentSchedule.status == ScheduleStatus.PENDING,
                                 PaymentSchedule.due_date < date.today())

    return DashboardStats(
        leads_total=leads_total, prospects_active=prospects_active, clients_total=clients_total,
        units_total=units_total, units_available=units_available, units_booked=units_booked, units_sold=units_sold,
        payments_this_month=payments_this_month, total_contract=total_contract, total_paid=total_paid,
        outstanding=total_contract - total_paid, overdue_count=overdue_count,
    )
