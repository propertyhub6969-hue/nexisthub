import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class PlanRequest(BaseModel):
    """Permintaan upgrade paket dari tenant → super-admin tinjau & terbitkan tagihan.
    Model hybrid: tenant tak bisa ganti paket sendiri, hanya MEMINTA."""
    __tablename__ = "plan_requests"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_name: Mapped[str] = mapped_column(String(200), nullable=True)      # snapshot
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)
    plan_name: Mapped[str] = mapped_column(String(80), nullable=True)         # snapshot paket diminta
    current_plan: Mapped[str] = mapped_column(String(80), nullable=True)      # snapshot paket saat minta
    note: Mapped[str] = mapped_column(Text, nullable=True)
    requested_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending | handled
    handled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<PlanRequest {self.tenant_name} -> {self.plan_name} [{self.status}]>"
