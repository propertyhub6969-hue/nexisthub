import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import BaseModel


class NotificationKind(str, enum.Enum):
    """Jenis kejadian — dipakai utk ikon/warna di UI & penyaringan."""
    PAYMENT_SUBMITTED = "payment_submitted"    # marketing entry pembayaran → finance
    PAYMENT_APPROVED = "payment_approved"      # finance setujui → si penginput
    PAYMENT_REJECTED = "payment_rejected"      # finance tolak → si penginput
    BANK_SUBMISSION = "bank_submission"        # bank kirim update lewat tautan
    NOTARY_SUBMISSION = "notary_submission"    # notaris kirim update lewat tautan
    EXPENSE_SUBMITTED = "expense_submitted"    # produksi ajukan biaya (utilitas) → finance
    EXPENSE_PAID = "expense_paid"              # finance tandai lunas → si pengaju
    INFO = "info"


class Notification(BaseModel):
    """Riwayat notifikasi PER PENERIMA (fan-out: satu baris per user penerima).

    Sengaja fan-out — jumlah user per tenant kecil, dan status dibaca/belum jadi sederhana
    (tak perlu tabel status terpisah). Baris bersifat arsip: tak dihapus saat dibaca."""
    __tablename__ = "notifications"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )  # penerima
    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )  # pemicu (None = dari pihak luar/sistem, mis. kiriman bank lewat tautan)
    kind: Mapped[NotificationKind] = mapped_column(
        SAEnum(NotificationKind), default=NotificationKind.INFO, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=True)
    link: Mapped[str] = mapped_column(String(300), nullable=True)   # rute frontend utk "buka"
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Notification {self.kind} → {self.user_id}>"
