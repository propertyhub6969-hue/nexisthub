import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date, Boolean
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
    office: Mapped[str] = mapped_column(String(200), nullable=True)   # Nama kantor / PPAT
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
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)  # null utk DTP/bebas
    id_billing: Mapped[str] = mapped_column(String(50), nullable=True)    # kode billing DJP
    ntpn: Mapped[str] = mapped_column(String(50), nullable=True)          # bukti setelah bayar
    tax_date: Mapped[Date] = mapped_column(Date, nullable=True)
    status: Mapped[TaxStatus] = mapped_column(
        SAEnum(TaxStatus), default=TaxStatus.BELUM, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    notary: Mapped["Notary"] = relationship("Notary")

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
