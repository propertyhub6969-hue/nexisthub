from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.tax import TaxType, TaxStatus, NotarySubmissionKind, NotarySubmissionStatus


# ── Notary ────────────────────────────────────────────────────────
class NotaryBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    sk_number: Optional[str] = Field(None, max_length=200)   # No. SK Notaris
    ktp: Optional[str] = Field(None, max_length=30)          # No. KTP notaris
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    notes: Optional[str] = None


class NotaryCreate(NotaryBase):
    pass


class NotaryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    sk_number: Optional[str] = Field(None, max_length=200)
    ktp: Optional[str] = Field(None, max_length=30)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    notes: Optional[str] = None


class NotaryResponse(NotaryBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Tax Record ────────────────────────────────────────────────────
class TaxBase(BaseModel):
    tax_type: TaxType
    category: Literal['subsidi', 'komersial'] = 'komersial'
    base_amount: Optional[Decimal] = Field(None, ge=0)   # Nilai AJB (dasar pengenaan)
    amount: Optional[Decimal] = Field(None, ge=0)
    id_billing: Optional[str] = Field(None, max_length=50)
    ntpn: Optional[str] = Field(None, max_length=50)
    tax_date: Optional[date] = None
    status: TaxStatus = TaxStatus.BELUM
    notary_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class TaxCreate(TaxBase):
    client_id: uuid.UUID


class TaxBulkItem(TaxBase):
    """Satu baris pajak dalam entry cepat (checklist PPh/PPN/BPHTB)."""
    pass


class TaxBulkCreate(BaseModel):
    client_id: uuid.UUID
    items: list[TaxBulkItem] = Field(..., min_length=1, max_length=10)


class TaxUpdate(BaseModel):
    tax_type: Optional[TaxType] = None
    category: Optional[Literal['subsidi', 'komersial']] = None
    base_amount: Optional[Decimal] = Field(None, ge=0)
    amount: Optional[Decimal] = Field(None, ge=0)
    id_billing: Optional[str] = Field(None, max_length=50)
    ntpn: Optional[str] = Field(None, max_length=50)
    tax_date: Optional[date] = None
    status: Optional[TaxStatus] = None
    notary_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class TaxResponse(TaxBase):
    id: uuid.UUID
    client_id: uuid.UUID
    notary_name: Optional[str] = None
    has_file: bool = False
    file_name: Optional[str] = None
    has_id_billing_file: bool = False
    id_billing_file_name: Optional[str] = None
    has_validation_file: bool = False
    validation_file_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Notary Fee ────────────────────────────────────────────────────
class FeeBase(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., ge=0)
    fee_date: Optional[date] = None
    is_paid: bool = False
    notary_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class FeeCreate(FeeBase):
    client_id: uuid.UUID


class FeeBulkItem(FeeBase):
    """Satu baris biaya dalam entry cepat (checklist Jasa PPJB/AJB/BBN dst)."""
    pass


class FeeBulkCreate(BaseModel):
    client_id: uuid.UUID
    items: list[FeeBulkItem] = Field(..., min_length=1, max_length=20)


class FeeUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[Decimal] = Field(None, ge=0)
    fee_date: Optional[date] = None
    is_paid: Optional[bool] = None
    notary_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class FeeResponse(FeeBase):
    id: uuid.UUID
    client_id: uuid.UUID
    notary_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Tautan bagikan ke Notaris ────────────────────────────────────────
class NotaryShareLinkCreate(BaseModel):
    notary_id: uuid.UUID
    expires_days: int = 30


class NotaryShareLinkResponse(BaseModel):
    id: uuid.UUID
    token: str
    notary_id: uuid.UUID
    notary_name_snapshot: Optional[str] = None
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_accessed_at: Optional[datetime] = None
    access_count: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Kiriman dari Notaris (menunggu persetujuan) ──────────────────────
class NotarySubmissionResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    unit_label: Optional[str] = None
    notary_name: Optional[str] = None
    kind: NotarySubmissionKind
    target_id: Optional[uuid.UUID] = None
    ppjb_number: Optional[str] = None
    has_ppjb_file: bool = False
    ajb_number: Optional[str] = None
    has_ajb_file: bool = False
    tax_type: Optional[TaxType] = None
    tax_category: Optional[str] = None
    tax_base_amount: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    tax_id_billing: Optional[str] = None
    tax_ntpn: Optional[str] = None
    tax_date: Optional[date] = None
    tax_status: Optional[TaxStatus] = None
    fee_description: Optional[str] = None
    fee_amount: Optional[Decimal] = None
    fee_date: Optional[date] = None
    has_file: bool = False
    file_name: Optional[str] = None
    submitted_notes: Optional[str] = None
    status: NotarySubmissionStatus
    reviewer_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotarySubmissionRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


# ── Halaman publik Notaris (tautan bertoken) ─────────────────────────
class PublicNotaryTaxRow(BaseModel):
    id: uuid.UUID
    tax_type: TaxType
    category: str
    amount: Optional[Decimal] = None
    id_billing: Optional[str] = None
    ntpn: Optional[str] = None
    tax_date: Optional[date] = None
    status: TaxStatus


class PublicNotaryFeeRow(BaseModel):
    id: uuid.UUID
    description: str
    amount: Decimal
    fee_date: Optional[date] = None
    is_paid: bool


class PublicNotaryClientRow(BaseModel):
    client_id: uuid.UUID
    client_name: str
    unit_label: Optional[str] = None
    project_name: Optional[str] = None
    ppjb_number: Optional[str] = None
    has_ppjb_file: bool = False
    ajb_number: Optional[str] = None
    has_ajb_file: bool = False
    tax_records: list[PublicNotaryTaxRow] = []
    fees: list[PublicNotaryFeeRow] = []


class PublicNotaryPageResponse(BaseModel):
    notary_name: str
    rows: list[PublicNotaryClientRow]
