from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core import xendit
from app.api.deps import get_current_context, AuthContext
from app.models.tenant import Tenant
from app.models.billing import Invoice, InvoiceStatus
from app.schemas.billing import SubscriptionResponse, InvoiceResponse

router = APIRouter()


@router.post("/invoices/{invoice_id}/pay-link")
async def create_pay_link(invoice_id, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Buat/ambil URL halaman bayar Xendit untuk satu invoice tenant ini."""
    if not xendit.is_enabled():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Pembayaran online belum diaktifkan.")
    inv = (await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tagihan tidak ditemukan")
    if inv.status == InvoiceStatus.PAID:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Tagihan sudah lunas.")
    if inv.payment_url and inv.xendit_invoice_id:
        return {"payment_url": inv.payment_url}
    t = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one_or_none()
    try:
        res = await xendit.create_invoice(
            external_id=str(inv.id), amount=float(inv.amount),
            description=f"Langganan NexistHub {inv.plan or ''} — {inv.period_start} s/d {inv.period_end}".strip(),
            success_redirect_url=f"{settings.APP_PUBLIC_URL}/settings/langganan",
        )
    except Exception:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Gagal membuat tagihan di Xendit. Coba lagi.")
    inv.xendit_invoice_id = res.get("id")
    inv.payment_url = res.get("invoice_url")
    await db.commit()
    return {"payment_url": inv.payment_url}


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


# ── Paket terlihat tenant + minta upgrade (hybrid: tenant meminta, admin menerbitkan) ──
from app.models.plan import Plan as _Plan  # noqa: E402
from app.models.plan_request import PlanRequest as _PlanRequest  # noqa: E402
from app.schemas.plan import PlanResponse as _PlanResponse, PlanRequestCreate as _PlanReqCreate  # noqa: E402


@router.get("/plans", response_model=list[_PlanResponse])
async def available_plans(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Katalog paket aktif — dilihat tenant di halaman Langganan."""
    return (await db.execute(select(_Plan).where(_Plan.is_active == True).order_by(_Plan.sort_order, _Plan.name))).scalars().all()  # noqa: E712


@router.post("/request-upgrade", status_code=status.HTTP_201_CREATED)
async def request_upgrade(payload: _PlanReqCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Tenant meminta upgrade ke paket tertentu. Admin yang meninjau & menerbitkan tagihan."""
    plan = (await db.execute(select(_Plan).where(_Plan.id == payload.plan_id))).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Paket tidak ditemukan")
    t = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
    req = _PlanRequest(tenant_id=ctx.tenant_id, tenant_name=t.name, plan_id=plan.id, plan_name=plan.name,
                       current_plan=t.subscription_plan, note=payload.note, requested_by_id=ctx.user_id, status="pending")
    db.add(req); await db.commit()
    return {"ok": True}
