import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class SaleCategory(str, enum.Enum):
    SUBSIDI = "subsidi"
    KOMERSIAL = "komersial"


class PaymentType(str, enum.Enum):
    CASH_KERAS = "cash_keras"       # Cash keras (lunas cepat)
    CASH_BERTAHAP = "cash_bertahap" # Cash bertahap / inhouse
    KPR = "kpr"                     # KPR bank (termasuk subsidi/FLPP)


class SaleStatus(str, enum.Enum):
    BOOKING = "booking"     # Booking / DP masuk
    PROSES = "proses"       # Proses (berkas/KPR berjalan)
    AKAD = "akad"           # Akad kredit / jual beli
    LUNAS = "lunas"         # Lunas
    BATAL = "batal"         # Batal / cancel


class Sale(BaseModel):
    """Transaksi penjualan sebuah unit ke seorang pembeli (Client)."""
    __tablename__ = "sales"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    # unit & pembeli — SET NULL agar riwayat penjualan tak hilang bila data induk dihapus
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    sale_number: Mapped[str] = mapped_column(String(50), nullable=True)  # No. booking/SPR (opsional)
    category: Mapped[SaleCategory] = mapped_column(
        SAEnum(SaleCategory), default=SaleCategory.KOMERSIAL, nullable=False
    )
    payment_type: Mapped[PaymentType] = mapped_column(
        SAEnum(PaymentType), default=PaymentType.KPR, nullable=False
    )
    price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)  # Harga jual/transaksi
    booking_date: Mapped[Date] = mapped_column(Date, nullable=True)
    akad_date: Mapped[Date] = mapped_column(Date, nullable=True)
    status: Mapped[SaleStatus] = mapped_column(
        SAEnum(SaleStatus), default=SaleStatus.BOOKING, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    unit: Mapped["Unit"] = relationship("Unit")
    client: Mapped["Client"] = relationship("Client")

    @property
    def unit_label(self):
        if not self.unit:
            return None
        prefix = f"{self.unit.block}-" if self.unit.block else ""
        return f"{prefix}{self.unit.unit_number}"

    @property
    def project_id(self):
        return self.unit.project_id if self.unit else None

    @property
    def client_name(self):
        return self.client.full_name if self.client else None

    def __repr__(self) -> str:
        return f"<Sale {self.sale_number or self.id} [{self.status}]>"
