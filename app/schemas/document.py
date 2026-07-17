from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import uuid

from app.models.document import DocStatus, HandoverEvent


class DocumentBase(BaseModel):
    doc_type: str = Field(..., min_length=1, max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    address: Optional[str] = Field(None, max_length=300)   # alamat objek (mis. alamat PBB)
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
    unit_id: Optional[uuid.UUID] = None      # dokumen legalitas unit
    client_id: Optional[uuid.UUID] = None    # berkas pembeli
    items: list[DocumentBulkItem] = Field(..., min_length=1, max_length=50)

    @model_validator(mode="after")
    def _one_owner(self):
        if bool(self.unit_id) == bool(self.client_id):
            raise ValueError("Entry batch harus melekat ke SATU: unit_id ATAU client_id")
        return self


class DocumentUpdate(BaseModel):
    doc_type: Optional[str] = Field(None, min_length=1, max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    address: Optional[str] = Field(None, max_length=300)
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
    # penguasaan dokumen ASLI (fisik) — turunan dari kejadian serah-terima TERAKHIR
    custody_status: str = "arsip"            # arsip | diambil | notaris | pembeli | bank
    custody_holder: Optional[str] = None     # nama notaris/bank/pembeli yang memegang
    custody_since: Optional[date] = None     # sejak kapan status ini
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Serah-terima dokumen ASLI (fisik) ──
class HandoverCreate(BaseModel):
    event: HandoverEvent
    at: Optional[date] = None                # kosong = hari ini
    notary_id: Optional[uuid.UUID] = None    # wajib bila event = serah_notaris
    bank_id: Optional[uuid.UUID] = None      # wajib bila event = tahan_bank
    client_id: Optional[uuid.UUID] = None    # wajib bila event = terima_pembeli
    received_by: Optional[str] = Field(None, max_length=200)  # PIC penerima (mis. staf notaris yg ttd)
    signature: Optional[str] = None                            # ttd digital PIC penerima (data URL base64)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _tujuan_wajib(self):
        need = {
            HandoverEvent.SERAH_NOTARIS: ("notary_id", "Notaris"),
            HandoverEvent.TAHAN_BANK: ("bank_id", "Bank"),
            HandoverEvent.TERIMA_PEMBELI: ("client_id", "Pembeli"),
        }.get(self.event)
        if need and getattr(self, need[0]) is None:
            raise ValueError(f"{need[1]} wajib dipilih untuk kejadian ini")
        return self


class HandoverResponse(BaseModel):
    id: uuid.UUID
    event: HandoverEvent
    at: date
    by_user_name: Optional[str] = None       # pencatat (akun sistem)
    notary_name: Optional[str] = None
    bank_name: Optional[str] = None
    client_name: Optional[str] = None
    received_by: Optional[str] = None        # PIC penerima yang ttd
    signature: Optional[str] = None          # ttd digital (data URL) — tampil di riwayat
    notes: Optional[str] = None
    has_proof: bool = False
    proof_name: Optional[str] = None
    created_at: datetime


class UnitHandoverResult(BaseModel):
    """Hasil serah-terima 1 PAKET (semua dokumen asli milik satu unit)."""
    affected: int                 # jumlah dokumen yang tercatat
    doc_types: list[str] = []     # jenis dokumen yang ikut diserahkan
    has_proof: bool = False
