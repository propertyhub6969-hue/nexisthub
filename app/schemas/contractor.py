from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, date
from decimal import Decimal
import uuid


class WorkItemIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    value: Decimal = Field(0, ge=0)


class WorkItemBreakdown(BaseModel):
    id: uuid.UUID
    name: str
    value: Decimal
    paid: Decimal
    submitted: Decimal
    remaining: Decimal


class ContractCreate(BaseModel):
    unit_id: uuid.UUID
    vendor_id: Optional[uuid.UUID] = None
    pengawas: Optional[str] = Field(None, max_length=200)
    rab_category: Literal['upah', 'kontraktor'] = 'upah'
    title: Optional[str] = Field(None, max_length=200)
    total_value: Decimal = Field(0, ge=0)
    notes: Optional[str] = None
    items: Optional[list[WorkItemIn]] = None  # bila diisi → total_value = Σ nilai bagian


class ContractUpdate(BaseModel):
    vendor_id: Optional[uuid.UUID] = None
    pengawas: Optional[str] = Field(None, max_length=200)
    rab_category: Optional[Literal['upah', 'kontraktor']] = None
    title: Optional[str] = Field(None, max_length=200)
    total_value: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None
    items: Optional[list[WorkItemIn]] = None  # replace-all; kosong [] = hapus semua bagian


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
    items: list[WorkItemBreakdown] = []          # bagian pekerjaan (kosong = kontrak tak dipecah)
    unassigned_paid: Decimal = Decimal(0)        # opname umum (tak ditautkan bagian) — sudah dibayar
    unassigned_submitted: Decimal = Decimal(0)   # opname umum — diajukan
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OpnameCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    expense_date: Optional[date] = None
    description: Optional[str] = Field(None, max_length=200)
    work_item_id: Optional[uuid.UUID] = None  # opsional — tautkan opname ke bagian pekerjaan


class OpnameResponse(BaseModel):
    id: uuid.UUID
    amount: Decimal
    expense_date: Optional[date] = None
    description: str
    is_paid: bool = False
    paid_at: Optional[date] = None
    work_item_id: Optional[uuid.UUID] = None
    work_item_name: Optional[str] = None


class PendingOpnameRow(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    unit_label: str
    contractor_name: Optional[str] = None
    title: Optional[str] = None
    work_item_name: Optional[str] = None
    expense_date: Optional[date] = None
    description: str
    amount: Decimal


class MarkPaidRequest(BaseModel):
    ids: list[uuid.UUID] = Field(..., min_length=1)
    paid_date: Optional[date] = None


# ── Template Tahapan Borongan (reusable, %+Rp) ──
class StageTemplateLineIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    value: Decimal = Field(0, ge=0)  # Rp (mode rp) atau persen (mode percent)


class StageTemplateLineOut(BaseModel):
    id: uuid.UUID
    name: str
    value: Decimal


class StageTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    mode: Literal['rp', 'percent'] = 'rp'
    lines: list[StageTemplateLineIn] = []


class StageTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    mode: Optional[Literal['rp', 'percent']] = None
    lines: Optional[list[StageTemplateLineIn]] = None


class StageTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    mode: str
    lines: list[StageTemplateLineOut] = []
    total: Decimal  # Σ nilai baris (Rp) atau Σ persen
