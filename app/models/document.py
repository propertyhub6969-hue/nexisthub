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
    """Dokumen/berkas: melekat ke PEMBELI (berkas identitas KTP/KK/NPWP), ke UNIT
    (legalitas SHM/SLF/IMB-PBG/PBB), ATAU ke PROYEK (perizinan proyek: KKPR/Izin Lingkungan/PBG/SLF,
    dan sertifikat INDUK sebelum dipecah). File tersimpan di DB/MinIO."""
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
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True, index=True   # opsional — diisi utk perizinan proyek & sertifikat INDUK
    )
    parent_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True, index=True   # diisi di sertifikat PECAHAN → menunjuk ke sertifikat INDUK (project-level)
    )
    doc_type: Mapped[str] = mapped_column(String(100), nullable=False)   # KTP, KK, NPWP, SHM, SLF, IMB/PBG, PBB, HGB Induk, dll
    name: Mapped[str] = mapped_column(String(200), nullable=True)        # nomor dokumen
    address: Mapped[str] = mapped_column(String(300), nullable=True)     # alamat objek — mis. alamat objek pajak (PBB)
    land_area: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)  # LT (m²) — utk dok legalitas unit (SHM); disinkron ke Unit.land_area
    status: Mapped[DocStatus] = mapped_column(
        SAEnum(DocStatus), default=DocStatus.BELUM, nullable=False
    )
    doc_date: Mapped[Date] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Date] = mapped_column(Date, nullable=True)  # masa berlaku — HGB induk & sebagian izin lingkungan
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


class SplitBatchStatus(str, enum.Enum):
    """Pipeline pengajuan pemecahan sertifikat induk ke BPN."""
    DIAJUKAN = "diajukan"        # submit ke BPN
    PENGUKURAN = "pengukuran"    # proses ukur/petakan bidang
    SK_TERBIT = "sk_terbit"      # SK pemecahan terbit
    SELESAI = "selesai"          # semua sertifikat pecahan dlm batch sudah terbit
    DITOLAK = "ditolak"


class CertificateSplitBatch(BaseModel, SoftDeleteMixin):
    """Satu pengajuan pemecahan sertifikat INDUK yang mencakup banyak unit sekaligus."""
    __tablename__ = "certificate_split_batches"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    master_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False, index=True   # sertifikat INDUK yang dipecah
    )
    batch_number: Mapped[str] = mapped_column(String(50), nullable=True)  # auto: SPLIT-000001 (pola sama BAST)
    status: Mapped[SplitBatchStatus] = mapped_column(
        SAEnum(SplitBatchStatus), default=SplitBatchStatus.DIAJUKAN, nullable=False
    )
    submitted_date: Mapped[Date] = mapped_column(Date, nullable=True)
    sk_number: Mapped[str] = mapped_column(String(100), nullable=True)   # nomor SK pemecahan BPN
    sk_date: Mapped[Date] = mapped_column(Date, nullable=True)
    # bukti SK (scan) — MinIO, pola sama proof_key di DocumentHandover
    sk_file_key: Mapped[str] = mapped_column(String(600), nullable=True)
    sk_file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    sk_file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    sk_file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    master_document: Mapped["Document"] = relationship("Document", foreign_keys=[master_document_id])
    items: Mapped[list["CertificateSplitBatchItem"]] = relationship(
        "CertificateSplitBatchItem", back_populates="batch", cascade="all, delete-orphan"
    )

    @property
    def has_sk_file(self) -> bool:
        return self.sk_file_name is not None

    def __repr__(self) -> str:
        return f"<SplitBatch {self.batch_number} [{self.status}]>"


class CertificateSplitBatchItem(BaseModel):
    """Satu unit di dalam batch pemecahan — menautkan ke sertifikat PECAHAN begitu terbit."""
    __tablename__ = "certificate_split_batch_items"

    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("certificate_split_batches.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    result_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True   # kosong sampai sertifikat pecahan unit ini diupload
    )

    batch: Mapped["CertificateSplitBatch"] = relationship("CertificateSplitBatch", back_populates="items")
    unit: Mapped["Unit"] = relationship("Unit")
    result_document: Mapped["Document"] = relationship("Document", foreign_keys=[result_document_id])

    def __repr__(self) -> str:
        return f"<SplitBatchItem unit={self.unit_id}>"


class HandoverEvent(str, enum.Enum):
    """Kejadian penguasaan dokumen ASLI (fisik). Siklus: arsip → notaris → (pembeli | bank)."""
    AMBIL = "ambil"                    # diambil dari arsip oleh pegawai
    SERAH_NOTARIS = "serah_notaris"    # diserahkan ke notaris untuk diproses (AJB/balik nama)
    TERIMA_PEMBELI = "terima_pembeli"  # diserahkan ke pembeli (CASH) — penutup, keluar permanen
    TAHAN_BANK = "tahan_bank"          # ditahan bank sbg agunan (KPR) — penutup, tak kembali
    KEMBALI_ARSIP = "kembali_arsip"    # kembali ke arsip


class DocumentHandover(BaseModel, SoftDeleteMixin):
    """Log serah-terima dokumen ASLI (kertas fisik) — BUKAN file scan (file tetap di MinIO).
    Status penguasaan dokumen = kejadian TERAKHIR (tak ada kejadian = masih di arsip).
    Mencegah sertifikat asli hilang/nyangkut di notaris."""
    __tablename__ = "document_handovers"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event: Mapped[HandoverEvent] = mapped_column(SAEnum(HandoverEvent), nullable=False)
    at: Mapped[Date] = mapped_column(Date, nullable=False)
    by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )  # PIC pencatat — otomatis dari user login
    # tujuan (diisi sesuai event)
    notary_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notaries.id", ondelete="SET NULL"), nullable=True
    )
    bank_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("banks.id", ondelete="SET NULL"), nullable=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True
    )
    received_by: Mapped[str] = mapped_column(String(200), nullable=True)  # PIC penerima (mis. staf notaris yg ttd) — isian bebas, tanpa akun
    signature: Mapped[str] = mapped_column(Text, nullable=True)           # tanda tangan digital PIC penerima (data URL base64) — pola sama Client.signature
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    # bukti serah-terima (foto berita acara bertanda tangan) — pola sama ConstructionProgressLog
    proof_key: Mapped[str] = mapped_column(String(600), nullable=True)
    proof_name: Mapped[str] = mapped_column(String(255), nullable=True)
    proof_type: Mapped[str] = mapped_column(String(100), nullable=True)
    proof_size: Mapped[int] = mapped_column(Integer, nullable=True)

    @property
    def has_proof(self) -> bool:
        return self.proof_name is not None

    def __repr__(self) -> str:
        return f"<DocumentHandover {self.event} {self.at}>"
