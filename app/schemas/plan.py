import uuid
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, Field


class PlanBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    price: Optional[Decimal] = Field(None, ge=0)
    price_note: Optional[str] = Field("/bulan", max_length=60)
    description: Optional[str] = None
    features: Optional[List[str]] = None
    highlight: bool = False
    is_active: bool = True
    sort_order: int = 0


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    price: Optional[Decimal] = Field(None, ge=0)
    price_note: Optional[str] = Field(None, max_length=60)
    description: Optional[str] = None
    features: Optional[List[str]] = None
    highlight: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class PlanResponse(PlanBase):
    id: uuid.UUID

    class Config:
        from_attributes = True


from datetime import datetime


class PlanRequestCreate(BaseModel):
    plan_id: uuid.UUID
    note: Optional[str] = None


class PlanRequestResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    tenant_name: Optional[str] = None
    plan_id: Optional[uuid.UUID] = None
    plan_name: Optional[str] = None
    current_plan: Optional[str] = None
    note: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
