from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.payment import ScheduleStatus, PaymentMethod, PaymentSource, PaymentPurpose


# ── Payment Schedule (Termin) ─────────────────────────────────────
class ScheduleBase(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    sequence: int = 0
    amount: Decimal = Field(..., ge=0)
    due_date: Optional[date] = None
    notes: Optional[str] = None


class ScheduleCreate(ScheduleBase):
    client_id: uuid.UUID
    status: ScheduleStatus = ScheduleStatus.PENDING


class ScheduleUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=100)
    sequence: Optional[int] = None
    amount: Optional[Decimal] = Field(None, ge=0)
    due_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[ScheduleStatus] = None
    reason: Optional[str] = None   # alasan (wajib bila mengubah nominal termin) — tak disimpan ke kolom, hanya utk audit


class ScheduleResponse(ScheduleBase):
    id: uuid.UUID
    client_id: uuid.UUID
    status: ScheduleStatus
    is_overdue: bool
    paid: Decimal = Decimal(0)         # akumulasi pembayaran ke termin ini
    remaining: Decimal = Decimal(0)    # sisa = amount − paid (min 0)
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
    purpose: Optional[PaymentPurpose] = None
    receipt_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None


class PaymentCreate(PaymentBase):
    client_id: uuid.UUID
    schedule_id: Optional[uuid.UUID] = None


class PaymentUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, ge=0)
    payment_date: Optional[date] = None
    method: Optional[PaymentMethod] = None
    source: Optional[PaymentSource] = None
    purpose: Optional[PaymentPurpose] = None
    receipt_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    schedule_id: Optional[uuid.UUID] = None
    reason: Optional[str] = None   # alasan (wajib bila mengubah nominal/sumber/tgl/termin) — tak disimpan ke kolom, hanya utk audit


class PaymentResponse(PaymentBase):
    id: uuid.UUID
    client_id: uuid.UUID
    schedule_id: Optional[uuid.UUID] = None
    kpr_id: Optional[uuid.UUID] = None
    has_file: bool = False
    file_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Summary ───────────────────────────────────────────────────────
class PaymentSummary(BaseModel):
    client_id: uuid.UUID
    price: Decimal
    total_paid: Decimal          # kas diterima = dari pembeli + dari bank
    remaining: Decimal           # legacy: price − total_paid
    progress_percent: float
    schedule_count: int
    schedule_paid: int
    schedule_pending: int
    overdue_count: int
    # Pisah 2 sudut pandang (pencairan bertahap + retensi):
    from_buyer: Decimal = Decimal(0)          # uang diterima dari pembeli (DP/cicilan)
    from_bank: Decimal = Decimal(0)           # pencairan KPR yang sudah cair
    kpr_plafond: Decimal = Decimal(0)         # komitmen plafon KPR (0 bila cash)
    buyer_remaining: Decimal = Decimal(0)     # sisa KEWAJIBAN PEMBELI = price − dari pembeli − plafon KPR
    retention_remaining: Decimal = Decimal(0)  # RETENSI menunggu pencairan bank = plafon − sudah cair
    has_kpr: bool = False
