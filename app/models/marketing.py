import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Integer, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class LeadStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    UNQUALIFIED = "unqualified"


class ProspectStatus(str, enum.Enum):
    ACTIVE = "active"
    NEGOTIATION = "negotiation"
    WON = "won"
    LOST = "lost"


class ClientStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    INACTIVE = "inactive"


class Lead(BaseModel):
    """Calon pembeli yang baru pertama kali kontak."""
    __tablename__ = "leads"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=True)   # Instagram, referral, walk-in, dll
    interest: Mapped[str] = mapped_column(String(200), nullable=True) # (lama) teks bebas minat
    interested_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True, index=True
    )  # Properti/proyek yang diminati
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[LeadStatus] = mapped_column(
        SAEnum(LeadStatus), default=LeadStatus.NEW, nullable=False
    )
    assigned_to: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    def __repr__(self) -> str:
        return f"<Lead {self.full_name} [{self.status}]>"


class Prospect(BaseModel):
    """Lead yang sudah qualified dan sedang dalam proses penjualan."""
    __tablename__ = "prospects"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    unit_type: Mapped[str] = mapped_column(String(100), nullable=True)   # Tipe unit (36/72, 45/90, dll)
    budget: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)
    status: Mapped[ProspectStatus] = mapped_column(
        SAEnum(ProspectStatus), default=ProspectStatus.ACTIVE, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    def __repr__(self) -> str:
        return f"<Prospect {self.full_name} [{self.status}]>"


class Client(BaseModel, SoftDeleteMixin):
    """Pembeli yang sudah deal / tanda tangan kontrak."""
    __tablename__ = "clients"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    prospect_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("prospects.id", ondelete="SET NULL"),
        nullable=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    nik: Mapped[str] = mapped_column(String(20), nullable=True)          # KTP
    address: Mapped[str] = mapped_column(Text, nullable=True)            # Alamat pembeli
    unit_number: Mapped[str] = mapped_column(String(50), nullable=True)  # (lama) nomor unit teks
    unit_type: Mapped[str] = mapped_column(String(100), nullable=True)
    # relasi properti
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    # marketing = user yang login saat input (auto)
    marketing_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    contract_value: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)
    contract_date: Mapped[Date] = mapped_column(Date, nullable=True)
    promo: Mapped[str] = mapped_column(String(200), nullable=True)       # Promo (teks bebas)
    signature: Mapped[str] = mapped_column(Text, nullable=True)          # Tanda tangan digital (data URL base64)
    status: Mapped[ClientStatus] = mapped_column(
        SAEnum(ClientStatus), default=ClientStatus.ACTIVE, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    marketing_user: Mapped["User"] = relationship("User", foreign_keys=[marketing_user_id])

    @property
    def marketing_name(self):
        return self.marketing_user.full_name if self.marketing_user else None

    def __repr__(self) -> str:
        return f"<Client {self.full_name} unit={self.unit_number}>"
