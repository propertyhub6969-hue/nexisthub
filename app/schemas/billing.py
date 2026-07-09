import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field
from app.models.billing import InvoiceStatus


class InvoiceCreate(BaseModel):
    period_start: date
    period_end: date
    plan: Optional[str] = Field(None, max_length=50)
    amount: Decimal = Field(0, ge=0)
    method: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None


class MarkPaid(BaseModel):
    method: Optional[str] = Field(None, max_length=50)
    paid_at: Optional[date] = None


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    period_start: date
    period_end: date
    plan: Optional[str] = None
    amount: Decimal
    status: InvoiceStatus
    method: Optional[str] = None
    paid_at: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SubscriptionResponse(BaseModel):
    tenant_name: str
    slug: str
    plan: str
    status: str
    is_active: bool
    expires_at: Optional[date] = None
    days_left: Optional[int] = None  # None bila tak ada expires_at


class RevenueTrendPoint(BaseModel):
    month: str  # YYYY-MM
    amount: Decimal


class RevenueSummary(BaseModel):
    """Pendapatan Nexist sendiri dari langganan tenant (bukan data bisnis internal tenant)."""
    total_paid: Decimal          # akumulasi semua invoice lunas, sepanjang waktu
    paid_this_month: Decimal     # invoice lunas dgn paid_at di bulan berjalan
    outstanding: Decimal         # invoice belum lunas (status unpaid)
    mrr_estimate: Decimal        # jumlah invoice lunas TERBARU per tenant aktif/trial (estimasi, bukan recurring asli)
    trend: List[RevenueTrendPoint] = []  # 12 bulan terakhir, berdasar paid_at
