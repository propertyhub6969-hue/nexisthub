from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.cashbook import CashDirection


# ── Kategori Akun (Fase B1 — daftar pendek, bukan CoA penuh) ──────
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    direction: CashDirection
    notes: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    notes: Optional[str] = None


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    direction: CashDirection
    code: Optional[str] = None   # terisi = kategori bawaan sistem (auto-mapping), tak bisa dihapus
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Baris Buku Kas ─────────────────────────────────────────────────
class CashBookEntryResponse(BaseModel):
    id: uuid.UUID
    date: date
    direction: CashDirection
    amount: Decimal
    category_id: Optional[uuid.UUID] = None
    category_name: Optional[str] = None
    source_type: str
    source_id: uuid.UUID
    description: str
    client_id: Optional[uuid.UUID] = None
    client_name: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Rekap ────────────────────────────────────────────────────────
class CashBookCategoryTotal(BaseModel):
    category_id: Optional[uuid.UUID] = None
    category_name: str
    direction: CashDirection
    total: Decimal


class CashBookMonth(BaseModel):
    month: str   # "YYYY-MM"
    total_in: Decimal
    total_out: Decimal


class CashBookSummary(BaseModel):
    total_in: Decimal
    total_out: Decimal
    saldo: Decimal          # total_in − total_out (periode difilter, bukan saldo kas absolut)
    by_category: list[CashBookCategoryTotal]
    months: list[CashBookMonth]
