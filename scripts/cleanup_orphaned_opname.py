"""One-off cleanup: soft-delete Expense (opname) rows whose parent ContractorContract was
already deleted before delete_contract cascaded soft-deletes to its opname (bug fixed
2026-07-19 — see contractor.py delete_contract). These orphans were still counted in
upah-resume/RAB and (if is_paid) in the cash book.
Usage (inside backend container): python scripts/cleanup_orphaned_opname.py
"""
import asyncio
import sys
from datetime import datetime

sys.path.insert(0, "/app")

from sqlalchemy import select
import main  # noqa: F401 — registrasi semua model dulu (butuh utk resolve relationship string)
from app.core.database import AsyncSessionLocal
from app.models.expense import Expense
from app.models.contractor import ContractorContract
from app.core.cashbook import sync_expense_cashbook


async def main_():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Expense, ContractorContract.title)
            .join(ContractorContract, ContractorContract.id == Expense.contract_id)
            .where(Expense.is_deleted == False, ContractorContract.is_deleted == True)  # noqa: E712
        )).all()
        now = datetime.utcnow()
        for e, title in rows:
            print(f"soft-deleting orphaned opname {e.id} amount={e.amount} is_paid={e.is_paid} contract='{title}' tenant={e.tenant_id}")
            e.is_deleted = True
            e.deleted_at = now
        await db.flush()
        for e, _ in rows:
            await sync_expense_cashbook(db, e.tenant_id, e)
        await db.commit()
        print(f"Cleaned up {len(rows)} orphaned opname row(s).")


if __name__ == "__main__":
    asyncio.run(main_())
