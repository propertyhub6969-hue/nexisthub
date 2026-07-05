import uuid
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole

# Roles an admin/owner may assign to a team member.
# OWNER is intentionally excluded — ownership is set at registration only.
ASSIGNABLE_ROLES = {UserRole.ADMIN, UserRole.MANAGER, UserRole.PRODUKSI, UserRole.STAFF, UserRole.VIEWER}


class TeamMemberCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=200)
    password: str = Field(..., min_length=8, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    role: UserRole = UserRole.STAFF


class TeamMemberUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class TeamMemberResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    is_active: bool

    class Config:
        from_attributes = True
