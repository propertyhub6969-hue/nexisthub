import uuid
from sqlalchemy import String, Text, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class ContractorContract(BaseModel, SoftDeleteMixin):
    """Kontrak borongan kontraktor untuk satu unit (dibayar opname mingguan)."""
    __tablename__ = "contractor_contracts"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=True)
    total_value: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)  # nilai borongan
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    vendor: Mapped["Vendor"] = relationship("Vendor")

    @property
    def vendor_name(self):
        return self.vendor.name if self.vendor else None

    def __repr__(self) -> str:
        return f"<ContractorContract {self.title} {self.total_value}>"
