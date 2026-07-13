import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class ExpenseCategory(str, enum.Enum):
    MATERIAL = "material"        # material non-stok / beli langsung
    UPAH = "upah"               # upah tukang harian
    KONTRAKTOR = "kontraktor"   # borongan
    KELISTRIKAN = "kelistrikan"  # instalasi & material listrik
    OPERASIONAL = "operasional"
    PERIZINAN = "perizinan"
    LAIN = "lain"


class Expense(BaseModel, SoftDeleteMixin):
    """Biaya/pengeluaran non-stok, dialokasi ke unit atau umum proyek."""
    __tablename__ = "expenses"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True, index=True   # kosong = biaya umum proyek
    )
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )
    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contractor_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )  # tautan ke kontrak borongan (opname)
    category: Mapped[ExpenseCategory] = mapped_column(
        SAEnum(ExpenseCategory), default=ExpenseCategory.LAIN, nullable=False
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    expense_date: Mapped[Date] = mapped_column(Date, nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    paid_at: Mapped[Date] = mapped_column(Date, nullable=True)  # tgl dibayar keuangan (opname: null=diajukan)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    vendor: Mapped["Vendor"] = relationship("Vendor")

    @property
    def vendor_name(self):
        return self.vendor.name if self.vendor else None

    def __repr__(self) -> str:
        return f"<Expense {self.category} {self.amount}>"
