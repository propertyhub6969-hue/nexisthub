import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class DocumentType(str, enum.Enum):
    SPJB = "spjb"           # Surat Perjanjian Jual Beli
    AJB = "ajb"             # Akta Jual Beli
    SHM = "shm"             # Sertifikat Hak Milik
    IMB = "imb"             # Izin Mendirikan Bangunan
    KPR = "kpr"             # Kredit Pemilikan Rumah
    OTHER = "other"


class DocumentStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_SIGN = "pending_sign"
    SIGNED = "signed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class DocumentTemplate(BaseModel):
    """Template dokumen legal yang bisa dipakai ulang."""
    __tablename__ = "document_templates"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    document_type: Mapped[DocumentType] = mapped_column(
        SAEnum(DocumentType), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=True)          # HTML/Markdown template
    variables: Mapped[str] = mapped_column(Text, nullable=True)        # JSON list of variables
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    documents: Mapped[list["LegalDocument"]] = relationship(
        "LegalDocument", back_populates="template"
    )

    def __repr__(self) -> str:
        return f"<Template {self.name} [{self.document_type}]>"


class LegalDocument(BaseModel):
    """Dokumen legal spesifik untuk satu client/transaksi."""
    __tablename__ = "legal_documents"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document_templates.id", ondelete="SET NULL"),
        nullable=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True
    )
    document_number: Mapped[str] = mapped_column(String(100), nullable=True)
    document_type: Mapped[DocumentType] = mapped_column(
        SAEnum(DocumentType), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=True)          # Rendered content
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(DocumentStatus), default=DocumentStatus.DRAFT, nullable=False
    )
    signed_date: Mapped[Date] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Date] = mapped_column(Date, nullable=True)
    notary_name: Mapped[str] = mapped_column(String(200), nullable=True)
    file_url: Mapped[str] = mapped_column(String(500), nullable=True)  # URL ke file PDF
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    template: Mapped["DocumentTemplate"] = relationship(
        "DocumentTemplate", back_populates="documents"
    )

    def __repr__(self) -> str:
        return f"<LegalDoc {self.title} [{self.status}]>"
