import uuid
from typing import Optional
from pydantic import BaseModel


class DocumentTextResponse(BaseModel):
    doc_key: str
    bank_id: Optional[uuid.UUID] = None   # None = cakupan default (semua bank)
    subject: str
    body: str
    is_custom: bool               # True = cakupan ini punya baris sendiri (bukan fallback)
    default_subject: str
    default_body: str
    variables: list[str]          # daftar putih variabel utk dokumen ini


class DocTextScope(BaseModel):
    bank_id: Optional[uuid.UUID] = None
    bank_name: str
    is_custom: bool


class DocTextScopeList(BaseModel):
    doc_key: str
    scopes: list[DocTextScope]


class DocumentTextUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None


class BankLetterData(BaseModel):
    subject: str
    body: str                     # sudah terisi variabel, teks polos (newline dipertahankan)
    company_name: str
    company_address: Optional[str] = None
    company_city: Optional[str] = None
    company_phone: Optional[str] = None
    letter_city: Optional[str] = None
    date: str                     # ISO
