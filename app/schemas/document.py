from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.document import DocStatus


class DocumentBase(BaseModel):
    doc_type: str = Field(..., min_length=1, max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    status: DocStatus = DocStatus.BELUM
    doc_date: Optional[date] = None
    land_area: Optional[Decimal] = Field(None, ge=0)   # LT (m²) — utk dok legalitas unit
    notes: Optional[str] = None


class DocumentCreate(DocumentBase):
    client_id: Optional[uuid.UUID] = None   # berkas pembeli
    unit_id: Optional[uuid.UUID] = None      # dokumen legalitas unit

    @model_validator(mode="after")
    def _one_owner(self):
        if bool(self.client_id) == bool(self.unit_id):
            raise ValueError("Dokumen harus melekat ke SATU: client_id ATAU unit_id")
        return self


class DocumentBulkItem(DocumentBase):
    """Satu baris dokumen dalam entry batch (checklist legalitas unit)."""
    pass


class DocumentBulkCreate(BaseModel):
    unit_id: uuid.UUID
    items: list[DocumentBulkItem] = Field(..., min_length=1, max_length=50)


class DocumentUpdate(BaseModel):
    doc_type: Optional[str] = Field(None, min_length=1, max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    status: Optional[DocStatus] = None
    doc_date: Optional[date] = None
    land_area: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None


class DocumentResponse(DocumentBase):
    id: uuid.UUID
    client_id: Optional[uuid.UUID] = None
    unit_id: Optional[uuid.UUID] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    has_file: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
