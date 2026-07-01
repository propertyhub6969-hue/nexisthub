import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Date, Integer, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class DocStatus(str, enum.Enum):
    BELUM = "belum"     # Belum ada
    PROSES = "proses"   # Dalam proses
    TERBIT = "terbit"   # Terbit / selesai


class Document(BaseModel, SoftDeleteMixin):
    """Dokumen/berkas legalitas per pembeli (checklist + file tersimpan di DB)."""
    __tablename__ = "documents"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    doc_type: Mapped[str] = mapped_column(String(100), nullable=False)   # KTP, KK, NPWP, PPJB, AJB, Sertifikat, IMB, dll
    name: Mapped[str] = mapped_column(String(200), nullable=True)        # keterangan tambahan
    status: Mapped[DocStatus] = mapped_column(
        SAEnum(DocStatus), default=DocStatus.BELUM, nullable=False
    )
    doc_date: Mapped[Date] = mapped_column(Date, nullable=True)
    # file (disimpan di DB; file_data deferred agar tak ikut di query list)
    file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    @property
    def has_file(self) -> bool:
        return self.file_name is not None

    def __repr__(self) -> str:
        return f"<Document {self.doc_type} [{self.status}]>"
