from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.stock import MovementType, MovementSource


class StockInCreate(BaseModel):
    project_id: uuid.UUID
    material_name: str = Field(..., min_length=1, max_length=200)
    unit: Optional[str] = Field(None, max_length=50)
    quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal = Field(0, ge=0)
    movement_date: Optional[date] = None
    po_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class StockOutCreate(BaseModel):
    project_id: uuid.UUID
    material_name: str = Field(..., min_length=1, max_length=200)
    unit: Optional[str] = Field(None, max_length=50)
    quantity: Decimal = Field(..., gt=0)
    unit_id: Optional[uuid.UUID] = None  # unit tujuan; kosong = umum proyek
    movement_date: Optional[date] = None
    notes: Optional[str] = None


class MovementResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    material_name: str
    unit: Optional[str] = None
    movement_type: MovementType
    source: MovementSource
    quantity: Decimal
    unit_price: Decimal
    unit_id: Optional[uuid.UUID] = None
    po_id: Optional[uuid.UUID] = None
    movement_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StockBalance(BaseModel):
    material_name: str
    unit: Optional[str] = None
    qty_in: Decimal
    qty_out: Decimal
    balance: Decimal
    avg_price: Decimal
    value: Decimal
