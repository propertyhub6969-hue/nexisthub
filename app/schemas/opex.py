import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class OpexCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class OpexCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class OpexCategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    sort_order: int
    is_active: bool

    class Config:
        from_attributes = True


class OperationalExpenseCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., gt=0)
    expense_date: Optional[date] = None
    opex_category_id: Optional[uuid.UUID] = None
    cash_account_id: Optional[uuid.UUID] = None
    is_paid: bool = True
    notes: Optional[str] = None


class OperationalExpenseUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[Decimal] = Field(None, gt=0)
    expense_date: Optional[date] = None
    opex_category_id: Optional[uuid.UUID] = None
    cash_account_id: Optional[uuid.UUID] = None
    is_paid: Optional[bool] = None
    notes: Optional[str] = None


class OperationalExpenseResponse(BaseModel):
    id: uuid.UUID
    description: str
    amount: Decimal
    expense_date: Optional[date] = None
    opex_category_id: Optional[uuid.UUID] = None
    category_name: Optional[str] = None
    cash_account_id: Optional[uuid.UUID] = None
    is_paid: bool
    paid_at: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OpexCategoryTotal(BaseModel):
    name: str
    total: Decimal


class OpexList(BaseModel):
    rows: list[OperationalExpenseResponse]
    total: Decimal
    total_unpaid: Decimal
    by_category: list[OpexCategoryTotal]
