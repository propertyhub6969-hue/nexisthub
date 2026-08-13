import uuid

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class ImportBatch(BaseModel):
    """Satu kali 'Terapkan' impor. Menyimpan jejak agar bisa DIBATALKAN (undo).
    Level 1: hanya melacak record yang DITAMBAH (insert) — undo = hapus record itu."""
    __tablename__ = "import_batches"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entity: Mapped[str] = mapped_column(String(20), nullable=False)   # units | clients | documents
    inserted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=True)
    undone_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
    undone_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)


class ImportBatchItem(BaseModel):
    """Satu record yang DITAMBAH oleh sebuah batch impor (untuk undo)."""
    __tablename__ = "import_batch_items"

    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    resource: Mapped[str] = mapped_column(String(20), nullable=False)   # units | clients | documents
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    file_key: Mapped[str] = mapped_column(String(600), nullable=True)   # objek MinIO utk dihapus saat undo
