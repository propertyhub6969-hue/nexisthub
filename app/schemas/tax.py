from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.tax import TaxType, TaxStatus


# ── Notary ────────────────────────────────────────────────────────
class NotaryBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    office: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    notes: Optional[str] = None


class NotaryCreate(NotaryBase):
    pass


class NotaryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    office: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    notes: Optional[str] = None


class NotaryResponse(NotaryBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Tax Record ────────────────────────────────────────────────────
class TaxBase(BaseModel):
    tax_type: TaxType
    amount: Optional[Decimal] = Field(None, ge=0)
    id_billing: Optional[str] = Field(None, max_length=50)
    ntpn: Optional[str] = Field(None, max_length=50)
    tax_date: Optional[date] = None
    status: TaxStatus = TaxStatus.BELUM
    notary_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class TaxCreate(TaxBase):
    client_id: uuid.UUID


class TaxUpdate(BaseModel):
    tax_type: Optional[TaxType] = None
    amount: Optional[Decimal] = Field(None, ge=0)
    id_billing: Optional[str] = Field(None, max_length=50)
    ntpn: Optional[str] = Field(None, max_length=50)
    tax_date: Optional[date] = None
    status: Optional[TaxStatus] = None
    notary_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class TaxResponse(TaxBase):
    id: uuid.UUID
    client_id: uuid.UUID
    notary_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Notary Fee ────────────────────────────────────────────────────
class FeeBase(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., ge=0)
    fee_date: Optional[date] = None
    is_paid: bool = False
    notary_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class FeeCreate(FeeBase):
    client_id: uuid.UUID


class FeeUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[Decimal] = Field(None, ge=0)
    fee_date: Optional[date] = None
    is_paid: Optional[bool] = None
    notary_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class FeeResponse(FeeBase):
    id: uuid.UUID
    client_id: uuid.UUID
    notary_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
