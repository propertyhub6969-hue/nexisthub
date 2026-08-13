from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.cashbook import CashDirection, CashAccountKind


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
    account_id: Optional[uuid.UUID] = None
    account_name: Optional[str] = None
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


# ── Rekening Kas/Bank (multi-rekening) ────────────────────────────
class CashAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    kind: CashAccountKind = CashAccountKind.BANK
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    opening_balance: Decimal = Decimal(0)
    opening_date: Optional[date] = None
    is_default: bool = False
    notes: Optional[str] = None


class CashAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    kind: Optional[CashAccountKind] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    opening_balance: Optional[Decimal] = None
    opening_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CashAccountResponse(BaseModel):
    id: uuid.UUID
    name: str
    kind: CashAccountKind
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    opening_balance: Decimal
    opening_date: Optional[date] = None
    is_default: bool
    is_active: bool
    balance: Decimal = Decimal(0)   # dihitung: saldo_awal + masuk − keluar ± transfer
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class CashAccountsSummary(BaseModel):
    accounts: list[CashAccountResponse]
    total_balance: Decimal
    unassigned_balance: Decimal   # saldo entri yang belum diberi rekening


class CashTransferCreate(BaseModel):
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    date: date
    notes: Optional[str] = None


class CashTransferResponse(BaseModel):
    id: uuid.UUID
    from_account_id: Optional[uuid.UUID] = None
    to_account_id: Optional[uuid.UUID] = None
    from_account_name: Optional[str] = None
    to_account_name: Optional[str] = None
    amount: Decimal
    date: date
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EntryAccountUpdate(BaseModel):
    account_id: Optional[uuid.UUID] = None   # None = lepaskan rekening


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


# ── Biaya menunggu bayar (pengeluaran diajukan, belum masuk Buku Kas) ──
class PendingExpenseRow(BaseModel):
    ref: str                 # "<sumber>:<id>" — kunci unik lintas tabel (expenses & notary_fees)
    id: uuid.UUID
    description: str
    category: str
    category_label: str
    amount: Decimal
    expense_date: Optional[date] = None
    project_name: Optional[str] = None
    unit_label: Optional[str] = None
    source: str              # "utilitas" | "opname" | "biaya" | "notaris"
    client_name: Optional[str] = None      # untuk biaya notaris
    notary_name: Optional[str] = None
    utility_kind: Optional[str] = None    # PLN/PDAM bila sumbernya utilitas
    utility_status: Optional[str] = None  # belum/diajukan/terpasang
    applied_date: Optional[date] = None
    installed_date: Optional[date] = None
    days_waiting: Optional[int] = None


class PendingExpenseList(BaseModel):
    rows: list[PendingExpenseRow]
    total_amount: Decimal


class MarkExpensePaidRequest(BaseModel):
    refs: list[str]                    # dari PendingExpenseRow.ref
    paid_date: Optional[date] = None   # kosong = hari ini
