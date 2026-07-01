from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.payment import ScheduleStatus, PaymentMethod, PaymentSource


# ── Payment Schedule (Termin) ─────────────────────────────────────
class ScheduleBase(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    sequence: int = 0
    amount: Decimal = Field(..., ge=0)
    due_date: Optional[date] = None
    notes: Optional[str] = None


class ScheduleCreate(ScheduleBase):
    sale_id: uuid.UUID
    status: ScheduleStatus = ScheduleStatus.PENDING


class ScheduleUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=100)
    sequence: Optional[int] = None
    amount: Optional[Decimal] = Field(None, ge=0)
    due_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[ScheduleStatus] = None


class ScheduleResponse(ScheduleBase):
    id: uuid.UUID
    sale_id: uuid.UUID
    status: ScheduleStatus
    is_overdue: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Payment (Uang Masuk) ──────────────────────────────────────────
class PaymentBase(BaseModel):
    amount: Decimal = Field(..., ge=0)
    payment_date: Optional[date] = None
    method: PaymentMethod = PaymentMethod.TRANSFER
    source: PaymentSource = PaymentSource.PEMBELI
    receipt_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None


class PaymentCreate(PaymentBase):
    sale_id: uuid.UUID
    schedule_id: Optional[uuid.UUID] = None


class PaymentUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, ge=0)
    payment_date: Optional[date] = None
    method: Optional[PaymentMethod] = None
    source: Optional[PaymentSource] = None
    receipt_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    schedule_id: Optional[uuid.UUID] = None


class PaymentResponse(PaymentBase):
    id: uuid.UUID
    sale_id: uuid.UUID
    schedule_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Summary ───────────────────────────────────────────────────────
class PaymentSummary(BaseModel):
    sale_id: uuid.UUID
    price: Decimal
    total_paid: Decimal
    remaining: Decimal
    progress_percent: float
    schedule_count: int
    schedule_paid: int
    schedule_pending: int
    overdue_count: int
