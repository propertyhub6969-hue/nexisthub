from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Generic, TypeVar, List
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.marketing import LeadStatus, ProspectStatus, ClientStatus, ClientPaymentType


# ── Generic pagination ────────────────────────────────────────────
T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    pages: int


# ── Lead ──────────────────────────────────────────────────────────
class LeadBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    source: Optional[str] = Field(None, max_length=100)
    interest: Optional[str] = Field(None, max_length=200)
    interested_project_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class LeadCreate(LeadBase):
    status: LeadStatus = LeadStatus.NEW
    assigned_to: Optional[uuid.UUID] = None


class LeadUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    source: Optional[str] = Field(None, max_length=100)
    interest: Optional[str] = Field(None, max_length=200)
    interested_project_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    status: Optional[LeadStatus] = None
    assigned_to: Optional[uuid.UUID] = None


class LeadResponse(LeadBase):
    id: uuid.UUID
    status: LeadStatus
    assigned_to: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Prospect ──────────────────────────────────────────────────────
class ProspectBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    unit_type: Optional[str] = Field(None, max_length=100)
    budget: Optional[Decimal] = None
    notes: Optional[str] = None


class ProspectCreate(ProspectBase):
    lead_id: Optional[uuid.UUID] = None
    status: ProspectStatus = ProspectStatus.ACTIVE
    assigned_to: Optional[uuid.UUID] = None


class ProspectUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    unit_type: Optional[str] = Field(None, max_length=100)
    budget: Optional[Decimal] = None
    notes: Optional[str] = None
    status: Optional[ProspectStatus] = None
    assigned_to: Optional[uuid.UUID] = None


class ProspectResponse(ProspectBase):
    id: uuid.UUID
    lead_id: Optional[uuid.UUID] = None
    status: ProspectStatus
    assigned_to: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Client ────────────────────────────────────────────────────────
class ClientBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    nik: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    unit_number: Optional[str] = Field(None, max_length=50)
    unit_type: Optional[str] = Field(None, max_length=100)
    project_id: Optional[uuid.UUID] = None
    unit_id: Optional[uuid.UUID] = None
    contract_value: Optional[Decimal] = None
    contract_date: Optional[date] = None
    payment_type: Optional[ClientPaymentType] = None
    promo: Optional[str] = Field(None, max_length=200)
    signature: Optional[str] = None
    notes: Optional[str] = None


class ClientCreate(ClientBase):
    prospect_id: Optional[uuid.UUID] = None
    status: ClientStatus = ClientStatus.ACTIVE


class ClientUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    nik: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    unit_number: Optional[str] = Field(None, max_length=50)
    unit_type: Optional[str] = Field(None, max_length=100)
    project_id: Optional[uuid.UUID] = None
    unit_id: Optional[uuid.UUID] = None
    contract_value: Optional[Decimal] = None
    contract_date: Optional[date] = None
    payment_type: Optional[ClientPaymentType] = None
    promo: Optional[str] = Field(None, max_length=200)
    signature: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[ClientStatus] = None


class ClientResponse(ClientBase):
    id: uuid.UUID
    prospect_id: Optional[uuid.UUID] = None
    marketing_user_id: Optional[uuid.UUID] = None
    marketing_name: Optional[str] = None
    status: ClientStatus
    # Dihitung saat fetch (bukan kolom DB): sisa piutang & tahap KPR berjalan
    remaining: Optional[Decimal] = None
    kpr_stage: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
