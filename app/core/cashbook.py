import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cashbook import AccountCategory, CashBookEntry, CashDirection

# 6 kategori dasar Fase B1 — daftar pendek, bukan Chart of Accounts penuh.
# code stabil dipakai utk auto-mapping sistem; kategori kustom tenant (dibuat manual) code=None.
DEFAULT_CATEGORIES: list[tuple[str, str, CashDirection]] = [
    ("kas_bank", "Kas/Bank", CashDirection.IN),
    ("piutang_pembeli", "Piutang Pembeli", CashDirection.IN),
    ("pendapatan_penjualan", "Pendapatan Penjualan", CashDirection.IN),
    ("ppn_keluaran", "PPN Keluaran", CashDirection.IN),
    ("retensi_bank", "Retensi Bank", CashDirection.IN),
    ("biaya_operasional", "Biaya Operasional", CashDirection.OUT),
]


async def seed_default_account_categories(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """Idempotent: hanya insert kode yang belum ada utk tenant ini."""
    existing = set((await db.execute(
        select(AccountCategory.code).where(AccountCategory.tenant_id == tenant_id, AccountCategory.code.isnot(None))
    )).scalars().all())
    for code, name, direction in DEFAULT_CATEGORIES:
        if code in existing:
            continue
        db.add(AccountCategory(tenant_id=tenant_id, code=code, name=name, direction=direction))
    await db.flush()


async def _category_by_code(db: AsyncSession, tenant_id: uuid.UUID, code: str) -> Optional[AccountCategory]:
    return (await db.execute(
        select(AccountCategory).where(AccountCategory.tenant_id == tenant_id, AccountCategory.code == code,
                                      AccountCategory.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()


async def _get_entry(db: AsyncSession, tenant_id: uuid.UUID, source_type: str, source_id: uuid.UUID) -> Optional[CashBookEntry]:
    return (await db.execute(
        select(CashBookEntry).where(CashBookEntry.tenant_id == tenant_id, CashBookEntry.source_type == source_type,
                                    CashBookEntry.source_id == source_id)
    )).scalar_one_or_none()


async def sync_payment_cashbook(db: AsyncSession, tenant_id: uuid.UUID, payment) -> None:
    """Payment approved & tak terhapus → ada satu baris Buku Kas; selain itu → dihapus.
    Kategori: dari pembeli → Pendapatan Penjualan, dari bank (KPR) → Retensi Bank."""
    from app.models.payment import PaymentApprovalStatus, PaymentSource  # local import: hindari circular import

    entry = await _get_entry(db, tenant_id, "payment", payment.id)
    should_exist = (not payment.is_deleted) and payment.approval_status == PaymentApprovalStatus.APPROVED
    if not should_exist:
        if entry is not None:
            await db.delete(entry)
        return

    code = "pendapatan_penjualan" if payment.source == PaymentSource.PEMBELI else "retensi_bank"
    category = await _category_by_code(db, tenant_id, code)
    if entry is None:
        entry = CashBookEntry(tenant_id=tenant_id, source_type="payment", source_id=payment.id)
        db.add(entry)
    entry.date = payment.payment_date or date.today()
    entry.direction = CashDirection.IN
    entry.amount = payment.amount
    entry.category_id = category.id if category else None
    entry.client_id = payment.client_id
    entry.description = f"Pembayaran {payment.purpose.value if payment.purpose else payment.source.value}"


async def sync_expense_cashbook(db: AsyncSession, tenant_id: uuid.UUID, expense) -> None:
    """Expense dibayar (is_paid) & tak terhapus → ada satu baris Buku Kas; selain itu → dihapus.
    Kategori: selalu Biaya Operasional (rincian per jenis biaya tetap ada di Expense.category)."""
    entry = await _get_entry(db, tenant_id, "expense", expense.id)
    should_exist = (not expense.is_deleted) and expense.is_paid
    if not should_exist:
        if entry is not None:
            await db.delete(entry)
        return

    category = await _category_by_code(db, tenant_id, "biaya_operasional")
    if entry is None:
        entry = CashBookEntry(tenant_id=tenant_id, source_type="expense", source_id=expense.id)
        db.add(entry)
    entry.date = expense.paid_at or expense.expense_date or date.today()
    entry.direction = CashDirection.OUT
    entry.amount = expense.amount
    entry.category_id = category.id if category else None
    entry.project_id = expense.project_id
    entry.description = expense.description
