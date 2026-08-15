import uuid
from datetime import date
from sqlalchemy import String, Text, ForeignKey, Numeric, Date, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class OpexCategory(BaseModel, SoftDeleteMixin):
    """Sub-kategori biaya operasional perusahaan (Gaji, Sewa Kantor, ATK, dll) — bisa ditambah tenant."""
    __tablename__ = "opex_categories"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<OpexCategory {self.name}>"


class OperationalExpense(BaseModel, SoftDeleteMixin):
    """Biaya operasional perusahaan (overhead) — TIDAK melekat ke proyek, jadi tak masuk Laba/Rugi proyek.
    Tetap tercatat di Buku Kas (Arus Kas) saat dibayar. Terpisah dari Expense (biaya proyek)."""
    __tablename__ = "operational_expenses"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    opex_category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("opex_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    expense_date: Mapped[Date] = mapped_column(Date, nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)   # false = dicatat, belum keluar kas
    paid_at: Mapped[Date] = mapped_column(Date, nullable=True)
    cash_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    category: Mapped["OpexCategory"] = relationship("OpexCategory")

    @property
    def category_name(self):
        return self.category.name if self.category else None

    def __repr__(self) -> str:
        return f"<OperationalExpense {self.description} {self.amount}>"
