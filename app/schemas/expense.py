from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.expense import ExpenseCategory


class ExpenseBase(BaseModel):
    project_id: uuid.UUID
    unit_id: Optional[uuid.UUID] = None
    vendor_id: Optional[uuid.UUID] = None
    category: ExpenseCategory = ExpenseCategory.LAIN
    description: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., ge=0)
    expense_date: Optional[date] = None
    is_paid: bool = True
    notes: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    unit_id: Optional[uuid.UUID] = None
    vendor_id: Optional[uuid.UUID] = None
    category: Optional[ExpenseCategory] = None
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[Decimal] = Field(None, ge=0)
    expense_date: Optional[date] = None
    is_paid: Optional[bool] = None
    notes: Optional[str] = None


class ExpenseResponse(ExpenseBase):
    id: uuid.UUID
    vendor_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Rollup biaya ──────────────────────────────────────────────────
class CostRow(BaseModel):
    unit_id: Optional[uuid.UUID] = None
    unit_label: str
    material_cost: Decimal   # dari distribusi stok
    expense_cost: Decimal    # dari ledger biaya
    total: Decimal


class CostSummary(BaseModel):
    project_id: uuid.UUID
    rows: List[CostRow]
    total_material: Decimal
    total_expense: Decimal
    grand_total: Decimal
