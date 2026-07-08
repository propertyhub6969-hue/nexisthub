import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Date, Integer, LargeBinary, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class DocStatus(str, enum.Enum):
    BELUM = "belum"     # Belum ada
    PROSES = "proses"   # Dalam proses
    TERBIT = "terbit"   # Terbit / selesai


class Document(BaseModel, SoftDeleteMixin):
    """Dokumen/berkas: melekat ke PEMBELI (berkas identitas KTP/KK/NPWP) ATAU ke UNIT
    (legalitas SHM/SLF/IMB-PBG/PBB — ada tanpa perlu pembeli). File tersimpan di DB."""
    __tablename__ = "documents"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=True, index=True   # opsional — diisi utk berkas pembeli
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"),
        nullable=True, index=True   # opsional — diisi utk dokumen legalitas unit
    )
    doc_type: Mapped[str] = mapped_column(String(100), nullable=False)   # KTP, KK, NPWP, SHM, SLF, IMB/PBG, PBB, dll
    name: Mapped[str] = mapped_column(String(200), nullable=True)        # nomor dokumen
    address: Mapped[str] = mapped_column(String(300), nullable=True)     # alamat objek — mis. alamat objek pajak (PBB)
    land_area: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)  # LT (m²) — utk dok legalitas unit (SHM); disinkron ke Unit.land_area
    status: Mapped[DocStatus] = mapped_column(
        SAEnum(DocStatus), default=DocStatus.BELUM, nullable=False
    )
    doc_date: Mapped[Date] = mapped_column(Date, nullable=True)
    # file (disimpan di DB; file_data deferred agar tak ikut di query list)
    file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)  # LEGACY (pra-MinIO)
    file_key: Mapped[str] = mapped_column(String(600), nullable=True)  # key objek MinIO (kalau terisi → file di MinIO)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    @property
    def has_file(self) -> bool:
        return self.file_name is not None

    def __repr__(self) -> str:
        return f"<Document {self.doc_type} [{self.status}]>"
