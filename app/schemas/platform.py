import uuid
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from app.models.tenant import TenantStatus


# Daftar modul yang bisa di-flag on/off per tenant (Control Plane).
FEATURE_MODULES = [
    "marketing", "properti", "pembayaran", "kpr",
    "procurement", "konstruksi", "rab", "dokumen", "pajak", "laporan",
]


class TenantAdminResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    status: TenantStatus
    is_active: bool
    subscription_plan: str
    expires_at: Optional[date] = None
    feature_flags: Optional[List[str]] = None  # None = semua modul aktif
    user_count: int = 0
    owner_email: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    estimated_project_count: Optional[int] = None
    estimated_units_per_project: Optional[int] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TenantProvision(BaseModel):
    """Buat tenant baru + akun owner-nya sekaligus."""
    name: str = Field(..., min_length=2, max_length=200)
    slug: Optional[str] = Field(None, max_length=100)  # auto dari name bila kosong
    owner_full_name: str = Field(..., min_length=2, max_length=200)
    owner_email: EmailStr
    owner_password: str = Field(..., min_length=6, max_length=100)
    subscription_plan: str = Field("trial", max_length=50)
    status: TenantStatus = TenantStatus.TRIAL
    expires_at: Optional[date] = None
    feature_flags: Optional[List[str]] = None


class TenantAdminUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    status: Optional[TenantStatus] = None
    is_active: Optional[bool] = None
    subscription_plan: Optional[str] = Field(None, max_length=50)
    expires_at: Optional[date] = None
    feature_flags: Optional[List[str]] = None
    owner_email: Optional[EmailStr] = None  # ubah email akun OWNER tenant — bukan kolom Tenant


class ResetOwnerPassword(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=100)


class TenantUserRow(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True
