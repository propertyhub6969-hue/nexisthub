import uuid
import enum
from datetime import date
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class CashDirection(str, enum.Enum):
    IN = "in"    # kas masuk
    OUT = "out"  # kas keluar


class AccountCategory(BaseModel, SoftDeleteMixin):
    """Kategori akun sederhana (bukan CoA penuh) — Fase B1: Kas/Bank, Piutang, Pendapatan, PPN, Retensi, Biaya."""
    __tablename__ = "account_categories"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    direction: Mapped[CashDirection] = mapped_column(SAEnum(CashDirection), nullable=False)
    # code stabil utk auto-mapping sistem (mis. 'pendapatan_penjualan'); NULL = kategori kustom milik tenant,
    # tak pernah di-assign otomatis oleh sistem, hanya dipakai manual.
    code: Mapped[str] = mapped_column(String(50), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<AccountCategory {self.name} [{self.direction}]>"


class CashBookEntry(BaseModel):
    """Baris Buku Kas — bayangan (derived) dari Payment/Expense yg sudah cash-effective (approved/dibayar).
    Disinkron ulang tiap sumbernya berubah (bukan jurnal append-only); satu sumber = maks satu baris."""
    __tablename__ = "cash_book_entries"
    __table_args__ = (UniqueConstraint("source_type", "source_id", name="uq_cash_book_entries_source"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    direction: Mapped[CashDirection] = mapped_column(SAEnum(CashDirection), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("account_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'payment' | 'expense'
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )

    category: Mapped["AccountCategory"] = relationship("AccountCategory")

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None

    def __repr__(self) -> str:
        return f"<CashBookEntry {self.direction} {self.amount} [{self.source_type}]>"
