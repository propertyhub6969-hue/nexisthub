import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class WarehouseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    address: Optional[str] = None
    notes: Optional[str] = None


class WarehouseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    address: Optional[str] = None
    notes: Optional[str] = None


class WarehouseResponse(BaseModel):
    id: uuid.UUID
    name: str
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
