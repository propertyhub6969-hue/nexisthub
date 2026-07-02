from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
import uuid

from app.models.expense import ExpenseCategory


# ── Template ──────────────────────────────────────────────────────
class RabLineIn(BaseModel):
    category: ExpenseCategory
    amount: Decimal = Field(0, ge=0)


class RabLineResponse(RabLineIn):
    id: uuid.UUID

    class Config:
        from_attributes = True


class RabTemplateCreate(BaseModel):
    project_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = None
    lines: List[RabLineIn] = []


class RabTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    notes: Optional[str] = None
    lines: Optional[List[RabLineIn]] = None


class RabTemplateResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    notes: Optional[str] = None
    lines: List[RabLineResponse] = []
    total: Decimal = Decimal(0)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Adjustment ────────────────────────────────────────────────────
class AdjustmentIn(BaseModel):
    category: ExpenseCategory
    description: Optional[str] = Field(None, max_length=200)
    amount: Decimal


class AdjustmentResponse(AdjustmentIn):
    id: uuid.UUID
    unit_id: uuid.UUID

    class Config:
        from_attributes = True


class SetTemplate(BaseModel):
    rab_template_id: Optional[uuid.UUID] = None


class CatAmount(BaseModel):
    category: ExpenseCategory
    amount: Decimal


class UnitRabResponse(BaseModel):
    unit_id: uuid.UUID
    rab_template_id: Optional[uuid.UUID] = None
    template_name: Optional[str] = None
    effective: List[CatAmount] = []   # RAB efektif per kategori (template + penyesuaian)
    effective_total: Decimal = Decimal(0)
    adjustments: List[AdjustmentResponse] = []


# ── Kebocoran (Leakage) ───────────────────────────────────────────
class LeakageRow(BaseModel):
    unit_id: uuid.UUID
    unit_label: str
    rab_total: Decimal
    realisasi_total: Decimal
    selisih: Decimal   # rab - realisasi (negatif = over/kebocoran)


class LeakageCat(BaseModel):
    category: ExpenseCategory
    rab: Decimal
    realisasi: Decimal
    selisih: Decimal


class LeakageDetail(BaseModel):
    unit_id: uuid.UUID
    unit_label: str
    rows: List[LeakageCat]
    rab_total: Decimal
    realisasi_total: Decimal
    selisih: Decimal
