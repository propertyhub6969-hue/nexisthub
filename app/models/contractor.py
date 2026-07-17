import uuid
from sqlalchemy import String, Text, ForeignKey, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from typing import List
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
    )  # legacy — kontraktor kini diisi bebas (contractor_name), tak lagi dari master vendor
    contractor_name: Mapped[str] = mapped_column(String(200), nullable=True)  # nama kontraktor (isian bebas)
    pengawas: Mapped[str] = mapped_column(String(200), nullable=True)         # nama pengawas
    rab_category: Mapped[str] = mapped_column(String(20), nullable=False, server_default="upah")  # opname masuk kategori RAB: upah|kontraktor
    title: Mapped[str] = mapped_column(String(200), nullable=True)
    total_value: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)  # nilai borongan
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    vendor: Mapped["Vendor"] = relationship("Vendor")

    @property
    def vendor_name(self):
        return self.vendor.name if self.vendor else None

    def __repr__(self) -> str:
        return f"<ContractorContract {self.title} {self.total_value}>"


class ContractWorkItem(BaseModel):
    """Bagian pekerjaan dari sebuah kontrak borongan (Pondasi, Dinding, dst) — punya nilai sendiri.
    Bila kontrak punya bagian, total_value kontrak = Σ nilai bagian. Opname bisa ditautkan ke bagian
    (Expense.work_item_id) → pembayaran & sisa per bagian; opname tanpa bagian = 'umum/tak terinci'."""
    __tablename__ = "contract_work_items"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contractor_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:
        return f"<ContractWorkItem {self.name} {self.value}>"


class WorkStageTemplate(BaseModel, SoftDeleteMixin):
    """Template tahapan borongan reusable (per-tenant) untuk mengisi cepat bagian pekerjaan kontrak.
    mode='rp' → baris pakai nilai Rupiah; mode='percent' → baris pakai persen (dipecah dari total kontrak)."""
    __tablename__ = "work_stage_templates"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    mode: Mapped[str] = mapped_column(String(10), nullable=False, server_default="rp")  # rp | percent

    lines: Mapped[List["WorkStageTemplateLine"]] = relationship(
        "WorkStageTemplateLine", back_populates="template",
        cascade="all, delete-orphan", order_by="WorkStageTemplateLine.position",
    )

    def __repr__(self) -> str:
        return f"<WorkStageTemplate {self.name} {self.mode}>"


class WorkStageTemplateLine(BaseModel):
    """Baris tahapan dalam template (nama + nilai Rp/persen)."""
    __tablename__ = "work_stage_template_lines"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_stage_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)  # Rp atau persen sesuai mode
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    template: Mapped["WorkStageTemplate"] = relationship("WorkStageTemplate", back_populates="lines")

    def __repr__(self) -> str:
        return f"<WorkStageTemplateLine {self.name} {self.value}>"
