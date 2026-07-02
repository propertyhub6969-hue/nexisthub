import uuid
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin
from app.models.expense import ExpenseCategory


class RabTemplate(BaseModel, SoftDeleteMixin):
    """Template RAB per tipe rumah (per proyek). Dipakai ulang oleh banyak unit."""
    __tablename__ = "rab_templates"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)   # mis. "Tipe 36"
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    lines: Mapped[list["RabTemplateLine"]] = relationship(
        "RabTemplateLine", back_populates="template", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<RabTemplate {self.name}>"


class RabTemplateLine(BaseModel):
    """Baris anggaran per kategori dalam template RAB."""
    __tablename__ = "rab_template_lines"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rab_templates.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    category: Mapped[ExpenseCategory] = mapped_column(SAEnum(ExpenseCategory), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    template: Mapped["RabTemplate"] = relationship("RabTemplate", back_populates="lines")


class UnitRabAdjustment(BaseModel, SoftDeleteMixin):
    """Penyesuaian RAB khusus 1 unit (tambahan mutu ±)."""
    __tablename__ = "unit_rab_adjustments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    category: Mapped[ExpenseCategory] = mapped_column(SAEnum(ExpenseCategory), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)  # bisa negatif

    def __repr__(self) -> str:
        return f"<UnitRabAdjustment {self.category} {self.amount}>"
