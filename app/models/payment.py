import uuid
import enum
from datetime import date, datetime
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Integer, Date, DateTime, LargeBinary
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


class PaymentApprovalStatus(str, enum.Enum):
    PENDING = "pending"     # baru dicatat, menunggu finance/owner/admin
    APPROVED = "approved"   # disetujui — final, dihitung sbg kas & laporan
    REJECTED = "rejected"   # ditolak — tidak dihitung, kembali ke staff utk diperbaiki


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
    kpr_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kpr_applications.id", ondelete="SET NULL"),
        nullable=True, index=True   # diisi utk pencairan KPR (dikelola di modul KPR, read-only di Pembayaran)
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
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)  # LEGACY (pra-MinIO)
    file_key: Mapped[str] = mapped_column(String(600), nullable=True)  # key objek MinIO

    # Persetujuan (Fase A) — pembayaran baru MENUNGGU, baru dihitung kas/laporan setelah approved.
    # Pencairan KPR (kpr_id terisi) dibuat auto-approved — sudah dikendalikan alur tahapan KPR sendiri.
    approval_status: Mapped[PaymentApprovalStatus] = mapped_column(
        SAEnum(PaymentApprovalStatus), default=PaymentApprovalStatus.PENDING, nullable=False
    )
    approver_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str] = mapped_column(Text, nullable=True)

    approver: Mapped["User"] = relationship("User", foreign_keys=[approver_id])

    @property
    def has_file(self) -> bool:
        return self.file_name is not None

    @property
    def approver_name(self) -> str | None:
        return self.approver.full_name if self.approver else None

    def __repr__(self) -> str:
        return f"<Payment {self.amount} [{self.source}]>"
