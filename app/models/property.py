import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Integer, LargeBinary, Date, JSON
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
    siteplan_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=True, deferred=True)

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
    price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)   # total (= Σ price_breakdown bila diisi)
    price_breakdown: Mapped[list] = mapped_column(JSON, nullable=True)    # rincian harga: [{label, amount}]
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
