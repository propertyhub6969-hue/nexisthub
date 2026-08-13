import uuid
import enum
from datetime import date
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date, Integer, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class CashDirection(str, enum.Enum):
    IN = "in"    # kas masuk
    OUT = "out"  # kas keluar


class CashAccountKind(str, enum.Enum):
    KAS = "kas"     # kas tunai / kas kecil
    BANK = "bank"   # rekening bank


class CashAccount(BaseModel, SoftDeleteMixin):
    """Rekening kas/bank tenant. Buku Kas dipartisi per rekening (single-entry, BUKAN GL akuntansi).
    Saldo = saldo_awal + Σ masuk − Σ keluar ± transfer."""
    __tablename__ = "cash_accounts"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)   # "BCA xxx", "Kas Kecil"
    kind: Mapped[CashAccountKind] = mapped_column(
        SAEnum(CashAccountKind, native_enum=False, length=10), default=CashAccountKind.BANK, nullable=False)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=True)
    account_number: Mapped[str] = mapped_column(String(50), nullable=True)
    opening_balance: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    opening_date: Mapped[date] = mapped_column(Date, nullable=True)  # default 2026-01-01 (diisi app)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # rekening default entri baru
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)


class CashTransfer(BaseModel, SoftDeleteMixin):
    """Pindah dana antar rekening — BUKAN pemasukan/pengeluaran (tak masuk laporan laba/rugi)."""
    __tablename__ = "cash_transfers"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    from_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    to_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    is_cleared: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # sudah cocok di rek. koran


class CashReconciliation(BaseModel):
    """Snapshot rekonsiliasi 1 rekening per tanggal: saldo bank aktual vs saldo buku."""
    __tablename__ = "cash_reconciliations"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cash_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    statement_date: Mapped[date] = mapped_column(Date, nullable=False)
    statement_balance: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)  # saldo rek. koran
    book_balance: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)        # saldo buku s/d tgl itu
    cleared_balance: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)     # saldo dari entri cleared
    difference: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)          # statement − cleared
    note: Mapped[str] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)


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
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )  # rekening kas/bank tempat uang ini masuk/keluar (NULL = belum ditentukan)
    is_cleared: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # sudah cocok di rek. koran
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
