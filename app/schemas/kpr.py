from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.kpr import KprStage


# ── Bank ──────────────────────────────────────────────────────────
class BankBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = None


class BankCreate(BankBase):
    pass


class BankUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    notes: Optional[str] = None


class BankResponse(BankBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── KPR Application ────────────────────────────────────────────────
class KprBase(BaseModel):
    bank_id: Optional[uuid.UUID] = None
    stage: KprStage = KprStage.COLLECT_BERKAS
    plafond: Optional[Decimal] = Field(None, ge=0)
    tenor_months: Optional[int] = Field(None, ge=0)
    interest_rate: Optional[Decimal] = Field(None, ge=0)
    sp3k_number: Optional[str] = Field(None, max_length=100)
    sikasep_number: Optional[str] = Field(None, max_length=100)
    submitted_date: Optional[date] = None      # Tgl Collect Berkas
    bank_submission_date: Optional[date] = None  # Tgl Pengajuan ke Bank
    sp3k_date: Optional[date] = None
    akad_date: Optional[date] = None
    notes: Optional[str] = None


class KprCreate(KprBase):
    client_id: uuid.UUID


class KprUpdate(BaseModel):
    bank_id: Optional[uuid.UUID] = None
    stage: Optional[KprStage] = None
    plafond: Optional[Decimal] = Field(None, ge=0)
    tenor_months: Optional[int] = Field(None, ge=0)
    interest_rate: Optional[Decimal] = Field(None, ge=0)
    sp3k_number: Optional[str] = Field(None, max_length=100)
    sikasep_number: Optional[str] = Field(None, max_length=100)
    submitted_date: Optional[date] = None
    bank_submission_date: Optional[date] = None
    sp3k_date: Optional[date] = None
    akad_date: Optional[date] = None
    notes: Optional[str] = None


class KprResponse(KprBase):
    id: uuid.UUID
    client_id: uuid.UUID
    bank_name: Optional[str] = None
    pencairan_date: Optional[date] = None
    pencairan_amount: Optional[Decimal] = None
    pencairan_payment_id: Optional[uuid.UUID] = None
    # Pencairan bertahap: total yang sudah cair & retensi (plafon − total cair) — dihitung saat fetch
    total_disbursed: Decimal = Decimal(0)
    retention: Decimal = Decimal(0)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DisburseRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    pay_date: Optional[date] = None
    notes: Optional[str] = None


# ── Pencairan (satu tahap) ────────────────────────────────────────
class DisbursementResponse(BaseModel):
    id: uuid.UUID
    amount: Decimal
    payment_date: Optional[date] = None
    notes: Optional[str] = None
    has_file: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
