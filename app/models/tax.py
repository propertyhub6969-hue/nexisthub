import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date, Boolean, Integer, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


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
