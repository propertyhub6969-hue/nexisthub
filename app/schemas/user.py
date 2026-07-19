import uuid
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole

# Roles an admin/owner may assign to a team member (peran utama MAUPUN tambahan).
# OWNER is intentionally excluded — ownership is set at registration only.
ASSIGNABLE_ROLES = {
    UserRole.ADMIN, UserRole.MANAGER, UserRole.PRODUKSI, UserRole.MARKETING,
    UserRole.FINANCE, UserRole.VIEWER,
}


class TeamMemberCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=200)
    password: str = Field(..., min_length=8, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    role: UserRole = UserRole.MARKETING
    # Peran tambahan opsional — utk staf rangkap tugas (mis. marketing yg juga produksi).
    additional_roles: Optional[List[UserRole]] = None


class TeamMemberUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    role: Optional[UserRole] = None
    additional_roles: Optional[List[UserRole]] = None
    is_active: Optional[bool] = None


class TeamMemberResetPassword(BaseModel):
    password: str = Field(..., min_length=8, max_length=100)


class TeamMemberResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    additional_roles: Optional[List[UserRole]] = None
    is_active: bool

    class Config:
        from_attributes = True


# ── Profil perusahaan tenant (dipakai kop dokumen cetak) ──
class TenantProfileUpdate(BaseModel):
    company_name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=100)


class TenantProfileResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    company_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    has_logo: bool = False
    logo_name: Optional[str] = None

    class Config:
        from_attributes = True
