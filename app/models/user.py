import uuid
import enum
from sqlalchemy import String, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class UserRole(str, enum.Enum):
    OWNER = "owner"           # Pemilik perusahaan - full access
    ADMIN = "admin"           # Admin - semua fitur kecuali billing
    MANAGER = "manager"       # Manager - bisa approve, lihat report
    PRODUKSI = "produksi"     # Produksi - akses Konstruksi & Procurement saja
    MARKETING = "marketing"   # Marketing - akses grup Marketing & Properti saja (dulu 'staff')
    VIEWER = "viewer"         # Read-only access


class User(BaseModel):
    """
    User belongs to a Tenant.
    One Tenant can have many Users with different roles.
    """
    __tablename__ = "users"

    # Identity
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Platform super-admin (vendor-side Control Plane) — lintas-tenant, BUKAN role tenant biasa
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Role
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole), default=UserRole.MARKETING, nullable=False
    )

    # Multi-tenant FK
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")

    def __repr__(self) -> str:
        return f"<User {self.email} [{self.role}]>"
