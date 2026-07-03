import uuid
import enum
from datetime import date
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Integer, Date, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class ScheduleStatus(str, enum.Enum):
    PENDING = "pending"   # Belum lunas
    PAID = "paid"         # Lunas


class PaymentMethod(str, enum.Enum):
    TRANSFER = "transfer"
    TUNAI = "tunai"
    LAINNYA = "lainnya"


class PaymentSource(str, enum.Enum):
    PEMBELI = "pembeli"   # Uang dari pembeli (DP, cicilan cash)
    BANK = "bank"         # Pencairan KPR dari bank


class PaymentPurpose(str, enum.Enum):
    DP = "dp"                             # Uang Muka / DP
    BOOKING_FEE = "booking_fee"           # Booking Fee
    CICILAN_TERMIN = "cicilan_termin"     # Cicilan / Angsuran Termin
    REALISASI_KPR = "realisasi_kpr"       # Pencairan/Realisasi KPR dari bank
    PELUNASAN_TERMIN = "pelunasan_termin"  # Pelunasan (termin akhir)


class PaymentSchedule(BaseModel, SoftDeleteMixin):
    """Satu baris jadwal angsuran (termin) di bawah sebuah penjualan: DP / Angsuran / Pelunasan."""
    __tablename__ = "payment_schedules"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=True, index=True
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=True, index=True   # (lama) opsional, alur pindah ke client
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)   # "DP", "Angsuran 1", "Pelunasan"
    sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    due_date: Mapped[Date] = mapped_column(Date, nullable=True)
    status: Mapped[ScheduleStatus] = mapped_column(
        SAEnum(ScheduleStatus), default=ScheduleStatus.PENDING, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    @property
    def is_overdue(self) -> bool:
        return (self.status == ScheduleStatus.PENDING
                and self.due_date is not None and self.due_date < date.today())

    def __repr__(self) -> str:
        return f"<PaymentSchedule {self.label} [{self.status}]>"


class Payment(BaseModel, SoftDeleteMixin):
    """Pencatatan uang masuk (dari pembeli atau pencairan bank)."""
    __tablename__ = "payments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=True, index=True
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=True, index=True   # (lama) opsional
    )
    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_schedules.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    payment_date: Mapped[Date] = mapped_column(Date, nullable=True)
    method: Mapped[PaymentMethod] = mapped_column(
        SAEnum(PaymentMethod), default=PaymentMethod.TRANSFER, nullable=False
    )
    source: Mapped[PaymentSource] = mapped_column(
        SAEnum(PaymentSource), default=PaymentSource.PEMBELI, nullable=False
    )
    purpose: Mapped[PaymentPurpose] = mapped_column(
        SAEnum(PaymentPurpose), nullable=True
    )  # Jenis pembayaran: DP/Booking Fee/Cicilan/Realisasi KPR/Pelunasan
    receipt_number: Mapped[str] = mapped_column(String(50), nullable=True)  # No. kwitansi — auto-generate saat create
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    # Bukti transfer, disimpan di DB; file_data deferred agar tak ikut di query list
    file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)

    @property
    def has_file(self) -> bool:
        return self.file_name is not None

    def __repr__(self) -> str:
        return f"<Payment {self.amount} [{self.source}]>"
