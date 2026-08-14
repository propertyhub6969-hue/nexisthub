import uuid
from sqlalchemy import String, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class DocumentText(BaseModel):
    """Teks dokumen yang bisa disesuaikan per-tenant (kalimat/isi, BUKAN tata letak).
    Generik via `doc_key` supaya bisa dipakai ulang untuk banyak jenis dokumen
    (mis. 'surat_permohonan_bank', nanti 'kuitansi_ketentuan', dst).
    Kosong / tak ada baris = pakai teks standar bawaan."""
    __tablename__ = "document_texts"
    __table_args__ = (UniqueConstraint("tenant_id", "doc_key", name="uq_document_text_tenant_key"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doc_key: Mapped[str] = mapped_column(String(50), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=True)   # mis. perihal surat
    body: Mapped[str] = mapped_column(Text, nullable=True)             # isi, boleh mengandung {{variabel}}
