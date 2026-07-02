from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.procurement import VendorStatus, POStatus, PaymentMethod


# ── Vendor ────────────────────────────────────────────────────────
class VendorBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    contact_name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    npwp: Optional[str] = Field(None, max_length=30)
    bank_name: Optional[str] = Field(None, max_length=100)
    bank_account: Optional[str] = Field(None, max_length=50)
    status: VendorStatus = VendorStatus.ACTIVE
    notes: Optional[str] = None


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    contact_name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    npwp: Optional[str] = Field(None, max_length=30)
    bank_name: Optional[str] = Field(None, max_length=100)
    bank_account: Optional[str] = Field(None, max_length=50)
    status: Optional[VendorStatus] = None
    notes: Optional[str] = None


class VendorResponse(VendorBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── PO Item ───────────────────────────────────────────────────────
class POItemIn(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=200)
    unit: Optional[str] = Field(None, max_length=50)
    quantity: Decimal = Field(0, ge=0)
    unit_price: Decimal = Field(0, ge=0)
    notes: Optional[str] = None


class POItemResponse(POItemIn):
    id: uuid.UUID
    total_price: Decimal

    class Config:
        from_attributes = True


# ── Purchase Order ────────────────────────────────────────────────
class POBase(BaseModel):
    vendor_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    unit_id: Optional[uuid.UUID] = None
    po_number: Optional[str] = Field(None, max_length=50)
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    status: POStatus = POStatus.DRAFT
    notes: Optional[str] = None


class POCreate(POBase):
    items: List[POItemIn] = []


class POUpdate(BaseModel):
    vendor_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    unit_id: Optional[uuid.UUID] = None
    po_number: Optional[str] = Field(None, max_length=50)
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    status: Optional[POStatus] = None
    notes: Optional[str] = None
    items: Optional[List[POItemIn]] = None


class POResponse(POBase):
    id: uuid.UUID
    total_amount: Decimal
    vendor_name: Optional[str] = None
    paid_amount: Decimal = Decimal(0)
    remaining: Decimal = Decimal(0)
    items: List[POItemResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Vendor Payment ────────────────────────────────────────────────
class VPBase(BaseModel):
    amount: Decimal = Field(..., ge=0)
    payment_date: Optional[date] = None
    method: PaymentMethod = PaymentMethod.TRANSFER
    notes: Optional[str] = None


class VPCreate(VPBase):
    purchase_order_id: uuid.UUID


class VPResponse(VPBase):
    id: uuid.UUID
    purchase_order_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
