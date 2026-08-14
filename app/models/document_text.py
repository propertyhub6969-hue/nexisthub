import uuid
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class DocumentText(BaseModel):
    """Teks dokumen yang bisa disesuaikan per-tenant (kalimat/isi, BUKAN tata letak).
    Generik via `doc_key` supaya bisa dipakai ulang untuk banyak jenis dokumen.
    Opsional per `bank_id` (mis. surat ke bank berbeda tiap bank); bank_id NULL = template
    default tenant (fallback bila bank belum punya sendiri). Tak ada baris = pakai bawaan sistem.
    Keunikan dijaga index parsial di migrasi (default vs per-bank)."""
    __tablename__ = "document_texts"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doc_key: Mapped[str] = mapped_column(String(50), nullable=False)
    bank_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("banks.id", ondelete="CASCADE"), nullable=True, index=True
    )  # NULL = default semua bank
    subject: Mapped[str] = mapped_column(String(300), nullable=True)   # mis. perihal surat
    body: Mapped[str] = mapped_column(Text, nullable=True)             # isi, boleh mengandung {{variabel}}
