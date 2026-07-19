"""One-off backfill: mark CASH clients whose approved payments already reached contract_value
as COMPLETED (and sync their unit to SOLD) — catches deals that were already fully paid before
the auto-complete-on-approve fix landed (2026-07-19, see payment.py _maybe_complete_cash_client).
Usage (inside backend container): python scripts/backfill_cash_completed.py
"""
import asyncio
import sys
from decimal import Decimal

sys.path.insert(0, "/app")

from sqlalchemy import select, func
import main  # noqa: F401 — registrasi semua model dulu (butuh utk resolve relationship string)
from app.core.database import AsyncSessionLocal
from app.core.unit_status import set_unit_status, unit_status_for_client
from app.models.marketing import Client, ClientStatus, ClientPaymentType
from app.models.payment import Payment, PaymentApprovalStatus


async def main_():
    async with AsyncSessionLocal() as db:
        clients = (await db.execute(
            select(Client).where(
                Client.payment_type == ClientPaymentType.CASH, Client.status == ClientStatus.ACTIVE,
                Client.is_deleted == False, Client.contract_value.isnot(None), Client.contract_value > 0)  # noqa: E712
        )).scalars().all()

        fixed = 0
        for c in clients:
            total_paid = Decimal(await db.scalar(
                select(func.coalesce(func.sum(Payment.amount), 0)).where(
                    Payment.client_id == c.id, Payment.is_deleted == False,  # noqa: E712
                    Payment.approval_status == PaymentApprovalStatus.APPROVED)
            ))
            if total_paid >= Decimal(c.contract_value):
                print(f"completing client {c.id} '{c.full_name}' tenant={c.tenant_id} paid={total_paid} contract={c.contract_value}")
                c.status = ClientStatus.COMPLETED
                await set_unit_status(db, c.tenant_id, c.unit_id, unit_status_for_client(c))
                fixed += 1
        await db.commit()
        print(f"Completed {fixed} cash client(s).")


if __name__ == "__main__":
    asyncio.run(main_())
