from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.kpr import KprStage, BankSubmissionStatus


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
    submitted_date: Optional[date] = None
    bank_submission_date: Optional[date] = None
    sp3k_date: Optional[date] = None
    akad_date: Optional[date] = None
    notes: Optional[str] = None
    # PIC bank + ttd — HANYA berlaku selagi stage='berkas_masuk_bank' (dikunci backend di tahap lain)
    pic_bank_name: Optional[str] = Field(None, max_length=200)
    pic_bank_signature: Optional[str] = None


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
    # Penolakan
    rejected_date: Optional[date] = None
    rejection_reason: Optional[str] = None
    is_rejected: bool = False
    pic_bank_name: Optional[str] = None
    pic_bank_signature: Optional[str] = None
    has_sp3k_file: bool = False
    sp3k_file_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DisburseRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    pay_date: Optional[date] = None
    notes: Optional[str] = None


class RejectRequest(BaseModel):
    reason: Optional[str] = None
    rejected_date: Optional[date] = None
    cascade_release_unit: bool = False   # bebaskan unit + tandai pembeli batal


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


# ── Tautan bagikan ke Bank (tanpa login) ───────────────────────────
class BankShareLinkCreate(BaseModel):
    bank_id: uuid.UUID
    expires_days: int = 30


class BankShareLinkResponse(BaseModel):
    id: uuid.UUID
    token: str
    bank_id: uuid.UUID
    bank_name_snapshot: Optional[str] = None
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_accessed_at: Optional[datetime] = None
    access_count: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Kiriman dari Bank (menunggu persetujuan) ────────────────────────
class BankSubmissionResponse(BaseModel):
    id: uuid.UUID
    kpr_application_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    unit_label: Optional[str] = None
    bank_name: Optional[str] = None
    submitted_stage: KprStage
    submitted_sp3k_number: Optional[str] = None
    submitted_sp3k_date: Optional[date] = None
    submitted_notes: Optional[str] = None
    has_file: bool = False
    file_name: Optional[str] = None
    status: BankSubmissionStatus
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BankSubmissionRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


# ── Halaman publik Bank (tautan bertoken) ───────────────────────────
class PublicBankRow(BaseModel):
    kpr_application_id: uuid.UUID
    client_name: str
    unit_label: Optional[str] = None
    project_name: Optional[str] = None
    stage: KprStage
    doc_total: int = 0
    doc_terbit: int = 0
    tax_total: int = 0
    tax_settled: int = 0
    kpr_days: Optional[int] = None


class PublicBankPageResponse(BaseModel):
    bank_name: str
    rows: list[PublicBankRow]
