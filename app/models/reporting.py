import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class ReportType(str, enum.Enum):
    MARKETING_SUMMARY = "marketing_summary"
    SALES_PIPELINE = "sales_pipeline"
    PROCUREMENT_SUMMARY = "procurement_summary"
    REVENUE = "revenue"
    CUSTOM = "custom"


class ReportConfig(BaseModel):
    """Konfigurasi report yang disimpan pengguna."""
    __tablename__ = "report_configs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    report_type: Mapped[ReportType] = mapped_column(
        SAEnum(ReportType), nullable=False
    )
    filters: Mapped[str] = mapped_column(Text, nullable=True)    # JSON filter config
    columns: Mapped[str] = mapped_column(Text, nullable=True)    # JSON column selection
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<ReportConfig {self.name} [{self.report_type}]>"
