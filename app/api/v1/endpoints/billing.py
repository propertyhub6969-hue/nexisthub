from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.tenant import Tenant
from app.models.billing import Invoice
from app.schemas.billing import SubscriptionResponse, InvoiceResponse

router = APIRouter()


@router.get("/subscription", response_model=SubscriptionResponse)
async def my_subscription(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tenant tidak ditemukan")
    days = (t.expires_at - date.today()).days if t.expires_at else None
    return SubscriptionResponse(
        tenant_name=t.name, slug=t.slug, plan=t.subscription_plan, status=t.status.value,
        is_active=t.is_active, expires_at=t.expires_at, days_left=days,
    )


@router.get("/invoices", response_model=list[InvoiceResponse])
async def my_invoices(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(Invoice).where(Invoice.tenant_id == ctx.tenant_id).order_by(Invoice.created_at.desc())
    )
    return r.scalars().all()
