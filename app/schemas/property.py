from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
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
    has_siteplan: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Siteplan ──────────────────────────────────────────────────────
class UnitPosition(BaseModel):
    unit_id: uuid.UUID
    position_x: Optional[Decimal] = None
    position_y: Optional[Decimal] = None


# ── Unit ──────────────────────────────────────────────────────────
class PriceItem(BaseModel):
    """Satu baris rincian harga unit (mis. Harga Dasar, Hook, Lebih Tanah, Booking Fee)."""
    label: str = Field(..., min_length=1, max_length=100)
    amount: Decimal = Field(0, ge=0)


class UnitBase(BaseModel):
    block: Optional[str] = Field(None, max_length=50)
    unit_number: str = Field(..., min_length=1, max_length=50)
    unit_type: Optional[str] = Field(None, max_length=100)
    land_area: Optional[Decimal] = Field(None, ge=0)
    building_area: Optional[Decimal] = Field(None, ge=0)
    price: Optional[Decimal] = Field(None, ge=0)          # total NET (= Σ price_breakdown − discount)
    price_breakdown: Optional[list[PriceItem]] = None     # rincian harga per baris
    discount: Optional[Decimal] = Field(None, ge=0)       # potongan harga (Rp)
    position_x: Optional[Decimal] = None
    position_y: Optional[Decimal] = None
    notes: Optional[str] = None


class UnitCreate(UnitBase):
    project_id: uuid.UUID
    status: UnitStatus = UnitStatus.AVAILABLE


class UnitBulkGenerate(BaseModel):
    """Buat banyak unit sekaligus: Blok {block} No {start_number..start_number+count-1}."""
    project_id: uuid.UUID
    block: Optional[str] = Field(None, max_length=50)
    start_number: int = Field(1, ge=1)
    count: int = Field(..., ge=1, le=500)
    pad: Optional[int] = Field(None, ge=0, le=6)   # jumlah digit (leading zero); None = auto sesuai nomor terbesar
    unit_type: Optional[str] = Field(None, max_length=100)
    land_area: Optional[Decimal] = Field(None, ge=0)
    building_area: Optional[Decimal] = Field(None, ge=0)
    price: Optional[Decimal] = Field(None, ge=0)


class UnitUpdate(BaseModel):
    block: Optional[str] = Field(None, max_length=50)
    unit_number: Optional[str] = Field(None, min_length=1, max_length=50)
    unit_type: Optional[str] = Field(None, max_length=100)
    land_area: Optional[Decimal] = Field(None, ge=0)
    building_area: Optional[Decimal] = Field(None, ge=0)
    price: Optional[Decimal] = Field(None, ge=0)
    price_breakdown: Optional[list[PriceItem]] = None
    discount: Optional[Decimal] = Field(None, ge=0)
    position_x: Optional[Decimal] = None
    position_y: Optional[Decimal] = None
    notes: Optional[str] = None
    status: Optional[UnitStatus] = None


class UnitResponse(UnitBase):
    id: uuid.UUID
    project_id: uuid.UUID
    status: UnitStatus
    bast_number: Optional[str] = None
    bast_date: Optional[date] = None
    bast_user_name: Optional[str] = None
    buyer_name: Optional[str] = None          # pembeli aktif unit ini (dihitung saat fetch)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UnitBulkResult(BaseModel):
    created: int
    skipped: int
    units: list[UnitResponse]


class BastRequest(BaseModel):
    bast_date: Optional[date] = None
    notes: Optional[str] = None
