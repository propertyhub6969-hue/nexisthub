import uuid
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class AuditLog(BaseModel):
    """Track semua perubahan data penting."""
    __tablename__ = "audit_logs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)     # CREATE, UPDATE, DELETE
    resource: Mapped[str] = mapped_column(String(100), nullable=False)  # leads, clients, PO, dll
    resource_id: Mapped[str] = mapped_column(String(100), nullable=True)
    old_data: Mapped[str] = mapped_column(Text, nullable=True)          # JSON sebelum
    new_data: Mapped[str] = mapped_column(Text, nullable=True)          # JSON sesudah
    ip_address: Mapped[str] = mapped_column(String(50), nullable=True)

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} on {self.resource}>"
