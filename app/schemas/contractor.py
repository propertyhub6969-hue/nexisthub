from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, date
from decimal import Decimal
import uuid


class ContractCreate(BaseModel):
    unit_id: uuid.UUID
    vendor_id: Optional[uuid.UUID] = None
    pengawas: Optional[str] = Field(None, max_length=200)
    rab_category: Literal['upah', 'kontraktor'] = 'upah'
    title: Optional[str] = Field(None, max_length=200)
    total_value: Decimal = Field(0, ge=0)
    notes: Optional[str] = None


class ContractUpdate(BaseModel):
    vendor_id: Optional[uuid.UUID] = None
    pengawas: Optional[str] = Field(None, max_length=200)
    rab_category: Optional[Literal['upah', 'kontraktor']] = None
    title: Optional[str] = Field(None, max_length=200)
    total_value: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None


class ContractResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    unit_id: uuid.UUID
    unit_label: str
    vendor_id: Optional[uuid.UUID] = None
    vendor_name: Optional[str] = None
    pengawas: Optional[str] = None
    rab_category: str = 'upah'
    title: Optional[str] = None
    total_value: Decimal
    paid: Decimal        # opname yang sudah dibayar keuangan
    submitted: Decimal   # opname diajukan, belum dibayar
    remaining: Decimal   # sisa nilai kontrak yang belum di-opname
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OpnameCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    expense_date: Optional[date] = None
    description: Optional[str] = Field(None, max_length=200)


class OpnameResponse(BaseModel):
    id: uuid.UUID
    amount: Decimal
    expense_date: Optional[date] = None
    description: str
    is_paid: bool = False
    paid_at: Optional[date] = None

    class Config:
        from_attributes = True


class PendingOpnameRow(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    unit_label: str
    contractor_name: Optional[str] = None
    title: Optional[str] = None
    expense_date: Optional[date] = None
    description: str
    amount: Decimal


class MarkPaidRequest(BaseModel):
    ids: list[uuid.UUID] = Field(..., min_length=1)
    paid_date: Optional[date] = None
