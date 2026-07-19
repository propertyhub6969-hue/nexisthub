"""One-off backfill: sync existing APPROVED payments & paid expenses into cash_book_entries.
Run once after deploying Fase B1 (cash book sync only fires on new mutations going forward).
Usage (inside backend container): python scripts/backfill_cashbook.py
"""
import asyncio
import sys

sys.path.insert(0, "/app")

from sqlalchemy import select
import main  # noqa: F401  — import app dulu supaya SEMUA model ke-register (butuh utk resolve relationship string)
from app.core.database import AsyncSessionLocal
from app.models.payment import Payment, PaymentApprovalStatus
from app.models.expense import Expense
from app.core.cashbook import sync_payment_cashbook, sync_expense_cashbook


async def main():
    async with AsyncSessionLocal() as db:
        payments = (await db.execute(
            select(Payment).where(Payment.is_deleted == False, Payment.approval_status == PaymentApprovalStatus.APPROVED)  # noqa: E712
        )).scalars().all()
        for p in payments:
            await sync_payment_cashbook(db, p.tenant_id, p)
        await db.flush()

        expenses = (await db.execute(
            select(Expense).where(Expense.is_deleted == False, Expense.is_paid == True)  # noqa: E712
        )).scalars().all()
        for e in expenses:
            await sync_expense_cashbook(db, e.tenant_id, e)
        await db.flush()

        await db.commit()
        print(f"Synced {len(payments)} payment(s) and {len(expenses)} expense(s) into cash book.")


if __name__ == "__main__":
    asyncio.run(main())
