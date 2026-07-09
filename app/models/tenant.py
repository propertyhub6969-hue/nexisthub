import uuid
from datetime import date
from sqlalchemy import String, Boolean, Text, Integer, Enum as SAEnum, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import BaseModel
import enum


class TenantStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TRIAL = "trial"


class Tenant(BaseModel):
    """
    Root of multi-tenant architecture.
    Each property developer company = one Tenant.
    """
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[TenantStatus] = mapped_column(
        SAEnum(TenantStatus), default=TenantStatus.TRIAL, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Business info
    company_name: Mapped[str] = mapped_column(String(200), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    province: Mapped[str] = mapped_column(String(100), nullable=True)
    # Skala bisnis saat daftar (isian wajib di form register, bukan hitungan live dari Proyek/Unit)
    estimated_project_count: Mapped[int] = mapped_column(Integer, nullable=True)
    estimated_units_per_project: Mapped[int] = mapped_column(Integer, nullable=True)

    # Subscription
    subscription_plan: Mapped[str] = mapped_column(
        String(50), default="trial", nullable=False
    )
    expires_at: Mapped[date] = mapped_column(Date, nullable=True)  # akhir masa aktif langganan
    # Modul aktif per tenant (Control Plane feature-flag). None = semua aktif (default).
    feature_flags: Mapped[list] = mapped_column(JSONB, nullable=True)

    # Relationships
    users: Mapped[list["User"]] = relationship(
        "User", back_populates="tenant", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Tenant {self.name}>"
