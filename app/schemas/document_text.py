import uuid
from typing import Optional
from pydantic import BaseModel


class DocumentTextResponse(BaseModel):
    doc_key: str
    bank_id: Optional[uuid.UUID] = None   # None = cakupan default (semua bank)
    subject: str
    body: str
    signer_name: Optional[str] = None
    signer_title: Optional[str] = None
    is_custom: bool               # True = cakupan ini punya baris sendiri (bukan fallback)
    default_subject: str
    default_body: str
    variables: list[str]          # daftar putih variabel utk dokumen ini
    has_subject: bool = True
    has_signer: bool = False
    per_bank: bool = False


class DocTextScope(BaseModel):
    bank_id: Optional[uuid.UUID] = None
    bank_name: str
    is_custom: bool


class DocTextScopeList(BaseModel):
    doc_key: str
    scopes: list[DocTextScope]


class DocTypeMeta(BaseModel):
    key: str
    label: str
    per_bank: bool
    has_subject: bool
    has_signer: bool


class DocumentTextUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    signer_name: Optional[str] = None
    signer_title: Optional[str] = None


class KuitansiText(BaseModel):
    ketentuan: str
    company_name: str = ""
    signer_name: Optional[str] = None
    signer_title: Optional[str] = None


class SalesFormData(BaseModel):
    company_name: str
    company_address: Optional[str] = None
    company_city: Optional[str] = None
    company_phone: Optional[str] = None
    date: str
    # pembeli
    nama: str
    nik: Optional[str] = None
    alamat: Optional[str] = None
    telp: Optional[str] = None
    # unit
    proyek: Optional[str] = None
    unit_label: Optional[str] = None
    tipe: Optional[str] = None
    lt: Optional[str] = None
    lb: Optional[str] = None
    harga_jual: Optional[str] = None
    diskon: Optional[str] = None       # gabungan promo (teks) + potongan (Rp)
    cara_bayar: Optional[str] = None
    bank: Optional[str] = None         # kalau KPR
    plafon: Optional[str] = None
    marketing: Optional[str] = None
    ketentuan: str
    signer_name: Optional[str] = None
    signer_title: Optional[str] = None


class BankLetterData(BaseModel):
    subject: str
    body: str                     # sudah terisi variabel, teks polos (newline dipertahankan)
    company_name: str
    company_address: Optional[str] = None
    company_city: Optional[str] = None
    company_phone: Optional[str] = None
    letter_city: Optional[str] = None
    date: str                     # ISO
