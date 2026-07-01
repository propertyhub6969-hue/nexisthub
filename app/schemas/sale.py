from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.sale import SaleCategory, PaymentType, SaleStatus


class SaleBase(BaseModel):
    sale_number: Optional[str] = Field(None, max_length=50)
    category: SaleCategory = SaleCategory.KOMERSIAL
    payment_type: PaymentType = PaymentType.KPR
    price: Optional[Decimal] = Field(None, ge=0)
    booking_date: Optional[date] = None
    akad_date: Optional[date] = None
    notes: Optional[str] = None


class SaleCreate(SaleBase):
    unit_id: uuid.UUID
    client_id: uuid.UUID
    status: SaleStatus = SaleStatus.BOOKING


class SaleUpdate(BaseModel):
    sale_number: Optional[str] = Field(None, max_length=50)
    category: Optional[SaleCategory] = None
    payment_type: Optional[PaymentType] = None
    price: Optional[Decimal] = Field(None, ge=0)
    booking_date: Optional[date] = None
    akad_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[SaleStatus] = None
    unit_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None


class SaleResponse(SaleBase):
    id: uuid.UUID
    unit_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None
    status: SaleStatus
    created_at: datetime
    updated_at: datetime
    # enrichment (dari relasi)
    unit_label: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    client_name: Optional[str] = None

    class Config:
        from_attributes = True
