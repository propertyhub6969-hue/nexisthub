import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date, DateTime, Boolean, Integer, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin
from app.models.document import HandoverEvent


class TaxType(str, enum.Enum):
    PPH = "pph"       # PPh Final pengalihan hak
    BPHTB = "bphtb"   # Bea Perolehan Hak atas Tanah & Bangunan
    PPN = "ppn"       # PPN


class TaxStatus(str, enum.Enum):
    BELUM = "belum"       # Belum dibayar
    DIBAYAR = "dibayar"   # Sudah dibayar (ada NTPN)
    VALIDASI = "validasi" # Sudah divalidasi kantor pajak
    DTP = "dtp"           # Ditanggung Pemerintah
    BEBAS = "bebas"       # Bebas pajak


class Notary(BaseModel, SoftDeleteMixin):
    """Master data notaris/PPAT rekanan."""
    __tablename__ = "notaries"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sk_number: Mapped[str] = mapped_column(String(200), nullable=True)   # No. SK Notaris (dulu 'office')
    ktp: Mapped[str] = mapped_column(String(30), nullable=True)          # No. KTP notaris
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Notary {self.name}>"


class TaxRecord(BaseModel, SoftDeleteMixin):
    """Catatan pajak per pembeli/transaksi (PPh/BPHTB/PPN) + bukti (ID Billing, NTPN)."""
    __tablename__ = "tax_records"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    notary_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notaries.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    tax_type: Mapped[TaxType] = mapped_column(SAEnum(TaxType), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False, server_default="komersial")  # subsidi | komersial (PPh subsidi 1%, komersial 2.5%)
    base_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)  # Nilai AJB (dasar pengenaan pajak)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)  # null utk DTP/bebas
    id_billing: Mapped[str] = mapped_column(String(50), nullable=True)    # kode billing DJP
    ntpn: Mapped[str] = mapped_column(String(50), nullable=True)          # bukti setelah bayar
    tax_date: Mapped[Date] = mapped_column(Date, nullable=True)
    status: Mapped[TaxStatus] = mapped_column(
        SAEnum(TaxStatus), default=TaxStatus.BELUM, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    # Bukti pembayaran/validasi pajak (SSP dll), disimpan di DB; file_data deferred agar tak ikut di query list
    file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)  # LEGACY
    file_key: Mapped[str] = mapped_column(String(600), nullable=True)
    # Bukti ID Billing (kode billing DJP sebelum bayar) — terpisah dari bukti bayar; dipakai utk PPh
    id_billing_file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    id_billing_file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    id_billing_file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    id_billing_file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)  # LEGACY
    id_billing_file_key: Mapped[str] = mapped_column(String(600), nullable=True)
    # Bukti validasi pajak (dari kantor pajak) — terpisah; dipakai utk PPh
    validation_file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    validation_file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    validation_file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    validation_file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)  # LEGACY
    validation_file_key: Mapped[str] = mapped_column(String(600), nullable=True)

    notary: Mapped["Notary"] = relationship("Notary")

    @property
    def has_file(self) -> bool:
        return self.file_name is not None

    @property
    def has_id_billing_file(self) -> bool:
        return self.id_billing_file_name is not None

    @property
    def has_validation_file(self) -> bool:
        return self.validation_file_name is not None

    @property
    def notary_name(self):
        return self.notary.name if self.notary else None

    def __repr__(self) -> str:
        return f"<TaxRecord {self.tax_type} [{self.status}]>"


class NotaryFee(BaseModel, SoftDeleteMixin):
    """Rincian biaya jasa notaris per pembeli (bisa banyak baris)."""
    __tablename__ = "notary_fees"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    notary_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notaries.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False)  # jasa AJB, BBN, dll
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    fee_date: Mapped[Date] = mapped_column(Date, nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    notary: Mapped["Notary"] = relationship("Notary")

    @property
    def notary_name(self):
        return self.notary.name if self.notary else None

    def __repr__(self) -> str:
        return f"<NotaryFee {self.description}>"


class NotaryShareLink(BaseModel):
    """Tautan bertoken (tanpa login) utk 1 notaris — notaris lihat PPJB/AJB, pajak, & biaya jasanya
    utk pembeli yang dia tangani, & kirim update (menunggu persetujuan developer). Pola sama BankShareLink."""
    __tablename__ = "notary_share_links"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    notary_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notaries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notary_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return f"<NotaryShareLink {self.notary_name_snapshot} [{self.token[:8]}...]>"


class NotarySubmissionKind(str, enum.Enum):
    PPJB_AJB = "ppjb_ajb"   # nomor & file PPJB/AJB milik Client
    TAX = "tax"             # baris TaxRecord baru/update
    FEE = "fee"             # baris NotaryFee baru/update
    CUSTODY = "custody"     # kejadian serah-terima dokumen ASLI (DocumentHandover baru)


class NotarySubmissionStatus(str, enum.Enum):
    PENDING = "pending"    # menunggu diterima/ditolak developer
    ACCEPTED = "accepted"  # sudah diterapkan
    REJECTED = "rejected"  # ditolak, tak menyentuh data


class NotarySubmission(BaseModel):
    """Kiriman dari notaris lewat tautan (belum resmi) — developer terima/tolak sebelum data berubah.
    Satu tabel lebar dgn diskriminator `kind` (bukan 3 tabel terpisah) krn tiap kiriman cuma isi
    SATU jenis data sekaligus; field yg tak relevan dgn `kind`-nya dibiarkan kosong."""
    __tablename__ = "notary_submissions"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notary_share_link_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notary_share_links.id", ondelete="SET NULL"), nullable=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[NotarySubmissionKind] = mapped_column(SAEnum(NotarySubmissionKind), nullable=False)
    # baris TaxRecord/NotaryFee yg diperbarui (kind=tax/fee) — kosong = usulan baris BARU
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)

    # kind=ppjb_ajb
    ppjb_number: Mapped[str] = mapped_column(String(100), nullable=True)
    ppjb_file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    ppjb_file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    ppjb_file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    ppjb_file_key: Mapped[str] = mapped_column(String(600), nullable=True)
    ajb_number: Mapped[str] = mapped_column(String(100), nullable=True)
    ajb_file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    ajb_file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    ajb_file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    ajb_file_key: Mapped[str] = mapped_column(String(600), nullable=True)

    # kind=tax
    tax_type: Mapped[TaxType] = mapped_column(SAEnum(TaxType), nullable=True)
    tax_category: Mapped[str] = mapped_column(String(20), nullable=True)
    tax_base_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)
    tax_id_billing: Mapped[str] = mapped_column(String(50), nullable=True)
    tax_ntpn: Mapped[str] = mapped_column(String(50), nullable=True)
    tax_date: Mapped[Date] = mapped_column(Date, nullable=True)
    tax_status: Mapped[TaxStatus] = mapped_column(SAEnum(TaxStatus), nullable=True)

    # kind=fee
    fee_description: Mapped[str] = mapped_column(String(200), nullable=True)
    fee_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)
    fee_date: Mapped[Date] = mapped_column(Date, nullable=True)

    # kind=custody — usulan kejadian serah-terima dokumen ASLI (jadi DocumentHandover baru saat diterima)
    custody_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    custody_event: Mapped[HandoverEvent] = mapped_column(SAEnum(HandoverEvent), nullable=True)
    custody_at: Mapped[Date] = mapped_column(Date, nullable=True)

    # bukti generik — bukti bayar pajak (kind=tax) ATAU bukti lain terkait kiriman
    file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    file_key: Mapped[str] = mapped_column(String(600), nullable=True)

    submitted_notes: Mapped[str] = mapped_column(Text, nullable=True)  # catatan dari notaris saat kirim
    status: Mapped[NotarySubmissionStatus] = mapped_column(
        SAEnum(NotarySubmissionStatus), default=NotarySubmissionStatus.PENDING, nullable=False
    )
    reviewed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str] = mapped_column(Text, nullable=True)  # mis. alasan tolak

    @property
    def has_ppjb_file(self) -> bool:
        return self.ppjb_file_name is not None

    @property
    def has_ajb_file(self) -> bool:
        return self.ajb_file_name is not None

    @property
    def has_file(self) -> bool:
        return self.file_name is not None

    def __repr__(self) -> str:
        return f"<NotarySubmission {self.kind} [{self.status}]>"


class MonthlyTaxShareLink(BaseModel):
    """Tautan bertoken (tanpa login) utk bagikan Laporan Pajak Bulanan ke pihak luar
    (mis. konsultan pajak) — scoped ke SATU bulan (+ opsional satu proyek), bisa expired/dicabut."""
    __tablename__ = "monthly_tax_share_links"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    month: Mapped[str] = mapped_column(String(7), nullable=False)   # "YYYY-MM"
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True   # kosong = semua proyek
    )
    project_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=True)  # "Semua Proyek" atau nama proyek, dicatat saat dibuat
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return f"<MonthlyTaxShareLink {self.month} [{self.token[:8]}...]>"
