import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class AnnouncementKind(str, enum.Enum):
    INFO = "info"        # info umum
    FEATURE = "feature"  # fitur baru / what's new
    WARNING = "warning"  # perhatian (mis. maintenance)


class Announcement(BaseModel):
    """Pengumuman platform (global, lintas semua tenant) — ditulis super-admin, ditampilkan
    ke pengguna tenant sebagai popup 'Apa yang baru'. Bersifat sementara (punya jendela tayang)."""
    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[AnnouncementKind] = mapped_column(
        SAEnum(AnnouncementKind, native_enum=False, length=10),
        default=AnnouncementKind.INFO, nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)  # None = langsung tayang
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)    # None = tak kedaluwarsa
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<Announcement {self.title!r} [{self.kind}]>"


class AnnouncementDismissal(BaseModel):
    """Penanda satu user sudah menutup satu pengumuman → tak muncul lagi untuknya."""
    __tablename__ = "announcement_dismissals"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", name="uq_announcement_user"),)

    announcement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
