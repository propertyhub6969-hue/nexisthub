import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Integer, LargeBinary, Date, JSON, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class ProjectStatus(str, enum.Enum):
    PLANNING = "planning"     # Perencanaan / pra-jual
    SELLING = "selling"       # Sedang dijual
    SOLD_OUT = "sold_out"     # Habis terjual
    INACTIVE = "inactive"


class UnitStatus(str, enum.Enum):
    AVAILABLE = "available"   # Tersedia
    BOOKED = "booked"         # Booking / DP
    SOLD = "sold"             # Akad / Terjual
    HANDOVER = "handover"     # Serah terima


class Project(BaseModel):
    """Proyek / perumahan milik developer."""
    __tablename__ = "projects"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    province: Mapped[str] = mapped_column(String(100), nullable=True)
    total_units: Mapped[int] = mapped_column(Integer, nullable=True)     # target jumlah unit
    siteplan_image: Mapped[str] = mapped_column(String(500), nullable=True)  # LEGACY: URL/path (tak dipakai; gambar kini di siteplan_data)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(ProjectStatus), default=ProjectStatus.SELLING, nullable=False
    )
    # Gambar siteplan disimpan di DB (belum ada MinIO); siteplan_data deferred agar tak ikut di query list
    siteplan_type: Mapped[str] = mapped_column(String(100), nullable=True)
    siteplan_size: Mapped[int] = mapped_column(Integer, nullable=True)
    siteplan_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)  # LEGACY
    siteplan_key: Mapped[str] = mapped_column(String(600), nullable=True)

    units: Mapped[list["Unit"]] = relationship(
        "Unit", back_populates="project", cascade="all, delete-orphan"
    )

    @property
    def has_siteplan(self) -> bool:
        return self.siteplan_size is not None

    def __repr__(self) -> str:
        return f"<Project {self.name} [{self.status}]>"


class Unit(BaseModel):
    """Unit / kavling di dalam sebuah proyek."""
    __tablename__ = "units"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    block: Mapped[str] = mapped_column(String(50), nullable=True)          # Blok / cluster (opsional)
    unit_number: Mapped[str] = mapped_column(String(50), nullable=False)   # Nomor kavling/unit
    unit_type: Mapped[str] = mapped_column(String(100), nullable=True)     # Tipe (36/60, dll)
    land_area: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)     # Luas tanah (m2)
    building_area: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True) # Luas bangunan (m2)
    price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)   # total NET (= Σ price_breakdown − discount)
    price_breakdown: Mapped[list] = mapped_column(JSON, nullable=True)    # rincian harga: [{label, amount}]
    discount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)  # potongan harga (Rp), dikurangkan dari Σ price_breakdown
    status: Mapped[UnitStatus] = mapped_column(
        SAEnum(UnitStatus), default=UnitStatus.AVAILABLE, nullable=False
    )
    rab_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rab_templates.id", ondelete="SET NULL"),
        nullable=True, index=True
    )  # RAB tipe yang dipakai unit ini
    # Posisi untuk siteplan interaktif (mis. persen 0-100 relatif terhadap gambar)
    position_x: Mapped[float] = mapped_column(Numeric(8, 4), nullable=True)
    position_y: Mapped[float] = mapped_column(Numeric(8, 4), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    # BAST (Berita Acara Serah Terima) — status Serah Terima diset via BAST, bukan manual
    bast_number: Mapped[str] = mapped_column(String(50), nullable=True)   # auto: BAST-000001
    bast_date: Mapped[Date] = mapped_column(Date, nullable=True)
    bast_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )  # user yang melakukan serah terima

    project: Mapped["Project"] = relationship("Project", back_populates="units")
    bast_user: Mapped["User"] = relationship("User", foreign_keys=[bast_user_id])

    def __repr__(self) -> str:
        return f"<Unit {self.unit_number} [{self.status}]>"


class SiteplanShareLink(BaseModel):
    """Tautan bertoken (tanpa login) utk 1 PROYEK — agen/mitra lihat siteplan & status unit
    terkini, lalu bisa MENGAJUKAN booking (menunggu persetujuan developer).
    Pola sama BankShareLink/NotaryShareLink. Sengaja TAK menampilkan data pembeli."""
    __tablename__ = "siteplan_share_links"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=True)
    label: Mapped[str] = mapped_column(String(120), nullable=True)   # utk siapa (mis. "Agen Budi") — memudahkan cabut
    show_price: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
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
        return f"<SiteplanShareLink {self.project_name_snapshot} [{self.token[:8]}...]>"


class BookingRequestStatus(str, enum.Enum):
    PENDING = "pending"      # menunggu ditinjau developer
    ACCEPTED = "accepted"    # diterima → unit ditandai Booking/DP
    REJECTED = "rejected"


class UnitBookingRequest(BaseModel):
    """Permintaan booking unit dari agen lewat tautan siteplan — TIDAK langsung mengubah
    status unit. Developer terima/tolak dulu (pola 'kiriman menunggu persetujuan')."""
    __tablename__ = "unit_booking_requests"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    share_link_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("siteplan_share_links.id", ondelete="SET NULL"), nullable=True, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Data dari agen (pihak luar, tanpa akun)
    agent_name: Mapped[str] = mapped_column(String(150), nullable=False)
    agent_phone: Mapped[str] = mapped_column(String(30), nullable=True)
    prospect_name: Mapped[str] = mapped_column(String(150), nullable=True)   # calon pembeli
    prospect_phone: Mapped[str] = mapped_column(String(30), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    status: Mapped[BookingRequestStatus] = mapped_column(
        SAEnum(BookingRequestStatus), default=BookingRequestStatus.PENDING, nullable=False, index=True
    )
    reviewed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<UnitBookingRequest {self.agent_name} unit={self.unit_id} [{self.status}]>"
