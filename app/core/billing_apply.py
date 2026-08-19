"""Logika bersama 'invoice lunas → perpanjang masa aktif tenant'.
Dipakai mark-paid manual (platform) & webhook Xendit, agar konsisten & idempoten."""
from datetime import date
from sqlalchemy import select
from app.models.billing import Invoice, InvoiceStatus
from app.models.tenant import Tenant, TenantStatus


async def apply_invoice_paid(db, inv: Invoice, method: str | None = None, paid_at: date | None = None) -> bool:
    """Tandai invoice lunas + perpanjang & aktifkan tenant. Idempoten: bila sudah PAID, tak melakukan apa-apa.
    Return True bila baru saja diproses, False bila sudah lunas sebelumnya."""
    if inv.status == InvoiceStatus.PAID:
        return False
    inv.status = InvoiceStatus.PAID
    inv.paid_at = paid_at or date.today()
    if method:
        inv.method = method
    t = (await db.execute(select(Tenant).where(Tenant.id == inv.tenant_id))).scalar_one_or_none()
    if t is not None:
        if t.expires_at is None or inv.period_end > t.expires_at:
            t.expires_at = inv.period_end
        t.status = TenantStatus.ACTIVE
        if inv.plan:
            t.subscription_plan = inv.plan
    return True
