from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal
import uuid

from app.models.property import ProjectStatus, UnitStatus


# ── Project ───────────────────────────────────────────────────────
class ProjectBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=100)
    total_units: Optional[int] = Field(None, ge=0)
    siteplan_image: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    status: ProjectStatus = ProjectStatus.SELLING


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=100)
    total_units: Optional[int] = Field(None, ge=0)
    siteplan_image: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None


class ProjectResponse(ProjectBase):
    id: uuid.UUID
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Unit ──────────────────────────────────────────────────────────
class UnitBase(BaseModel):
    block: Optional[str] = Field(None, max_length=50)
    unit_number: str = Field(..., min_length=1, max_length=50)
    unit_type: Optional[str] = Field(None, max_length=100)
    land_area: Optional[Decimal] = Field(None, ge=0)
    building_area: Optional[Decimal] = Field(None, ge=0)
    price: Optional[Decimal] = Field(None, ge=0)
    position_x: Optional[Decimal] = None
    position_y: Optional[Decimal] = None
    notes: Optional[str] = None


class UnitCreate(UnitBase):
    project_id: uuid.UUID
    status: UnitStatus = UnitStatus.AVAILABLE


class UnitUpdate(BaseModel):
    block: Optional[str] = Field(None, max_length=50)
    unit_number: Optional[str] = Field(None, min_length=1, max_length=50)
    unit_type: Optional[str] = Field(None, max_length=100)
    land_area: Optional[Decimal] = Field(None, ge=0)
    building_area: Optional[Decimal] = Field(None, ge=0)
    price: Optional[Decimal] = Field(None, ge=0)
    position_x: Optional[Decimal] = None
    position_y: Optional[Decimal] = None
    notes: Optional[str] = None
    status: Optional[UnitStatus] = None


class UnitResponse(UnitBase):
    id: uuid.UUID
    project_id: uuid.UUID
    status: UnitStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
