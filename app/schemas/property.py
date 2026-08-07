from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.property import ProjectStatus, UnitStatus, UtilityKind, UtilityStatus


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


# ── Tautan Siteplan (agen) & permintaan booking ──────────────────────
class SiteplanShareLinkCreate(BaseModel):
    project_id: uuid.UUID
    label: Optional[str] = Field(None, max_length=120)   # utk siapa (mis. "Agen Budi")
    show_price: bool = True
    expires_days: int = 30


class SiteplanShareLinkResponse(BaseModel):
    id: uuid.UUID
    token: str
    project_id: uuid.UUID
    project_name_snapshot: Optional[str] = None
    label: Optional[str] = None
    show_price: bool
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_accessed_at: Optional[datetime] = None
    access_count: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class BookingRequestResponse(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    unit_label: Optional[str] = None
    project_id: Optional[uuid.UUID] = None    # utk prefill form Pembeli
    project_name: Optional[str] = None
    unit_price: Optional[Decimal] = None      # harga unit → prefill nilai kontrak
    prospect_id: Optional[uuid.UUID] = None   # prospek yg dibuat otomatis saat diterima
    unit_status: Optional[str] = None      # status unit SAAT INI (bisa sudah berubah sejak diajukan)
    agent_name: str
    agent_phone: Optional[str] = None
    prospect_name: Optional[str] = None
    prospect_phone: Optional[str] = None
    notes: Optional[str] = None
    status: str
    link_label: Optional[str] = None
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    created_at: datetime


class BookingRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


# ── Halaman publik siteplan (tautan bertoken) ────────────────────────
class PublicSiteplanUnit(BaseModel):
    id: uuid.UUID
    label: str                       # "blok-nomor"
    unit_type: Optional[str] = None
    land_area: Optional[Decimal] = None
    building_area: Optional[Decimal] = None
    price: Optional[Decimal] = None  # None bila tautan disetel tanpa harga
    status: str
    position_x: Optional[Decimal] = None
    position_y: Optional[Decimal] = None


class PublicSiteplanResponse(BaseModel):
    project_name: str
    location: Optional[str] = None
    has_siteplan: bool
    show_price: bool
    units: list[PublicSiteplanUnit]


# ── Utilitas unit (PLN/PDAM) ─────────────────────────────────────────
class UtilityUpsert(BaseModel):
    kind: UtilityKind
    status: UtilityStatus = UtilityStatus.BELUM
    customer_no: Optional[str] = Field(None, max_length=60)
    power_va: Optional[int] = Field(None, ge=0)
    applied_date: Optional[date] = None
    installed_date: Optional[date] = None
    cost: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None


class UtilityResponse(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    kind: UtilityKind
    status: UtilityStatus
    customer_no: Optional[str] = None
    power_va: Optional[int] = None
    applied_date: Optional[date] = None
    installed_date: Optional[date] = None
    cost: Optional[Decimal] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class UtilityUnitRow(BaseModel):
    """Ringkasan utilitas per unit — untuk daftar/rekap proyek."""
    unit_id: uuid.UUID
    unit_label: str
    unit_status: str
    pln: Optional[UtilityStatus] = None
    pdam: Optional[UtilityStatus] = None
    ready: bool = False      # kedua utilitas terpasang → siap serah terima


class UtilitySummary(BaseModel):
    total_units: int
    pln_terpasang: int
    pdam_terpasang: int
    ready: int               # unit yang PLN & PDAM sudah terpasang
    total_cost: Decimal
    rows: list[UtilityUnitRow]
