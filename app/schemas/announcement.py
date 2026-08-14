import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator

Kind = Literal["info", "feature", "warning"]


def _coerce_kind(v):
    return v.value if hasattr(v, "value") else v


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    body: str = Field(..., min_length=1)
    kind: Kind = "info"
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    body: Optional[str] = Field(None, min_length=1)
    kind: Optional[Kind] = None
    is_active: Optional[bool] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class AnnouncementResponse(BaseModel):
    """Untuk super-admin (control plane)."""
    id: uuid.UUID
    title: str
    body: str
    kind: Kind
    is_active: bool
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    created_at: datetime
    dismiss_count: int = 0

    _vk = field_validator("kind", mode="before")(_coerce_kind)

    class Config:
        from_attributes = True


class AnnouncementPublic(BaseModel):
    """Untuk pengguna tenant (popup)."""
    id: uuid.UUID
    title: str
    body: str
    kind: Kind

    _vk = field_validator("kind", mode="before")(_coerce_kind)

    class Config:
        from_attributes = True
