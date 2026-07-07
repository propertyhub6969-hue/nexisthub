from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
import uuid
from app.models.user import UserRole


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)
    full_name: str = Field(..., min_length=2, max_length=100)
    company_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    type: Optional[str] = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    role: UserRole
    is_platform_admin: bool = False
    # Konteks tenant (untuk gating FE) — None feature_flags = semua modul aktif
    tenant_name: Optional[str] = None
    tenant_slug: Optional[str] = None
    tenant_status: Optional[str] = None
    feature_flags: Optional[List[str]] = None

    class Config:
        from_attributes = True
