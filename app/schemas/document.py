from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
import uuid

from app.models.document import DocStatus


class DocumentBase(BaseModel):
    doc_type: str = Field(..., min_length=1, max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    status: DocStatus = DocStatus.BELUM
    doc_date: Optional[date] = None
    notes: Optional[str] = None


class DocumentCreate(DocumentBase):
    client_id: uuid.UUID


class DocumentUpdate(BaseModel):
    doc_type: Optional[str] = Field(None, min_length=1, max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    status: Optional[DocStatus] = None
    doc_date: Optional[date] = None
    notes: Optional[str] = None


class DocumentResponse(DocumentBase):
    id: uuid.UUID
    client_id: uuid.UUID
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    has_file: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
