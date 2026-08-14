from typing import Optional
from pydantic import BaseModel


class DocumentTextResponse(BaseModel):
    doc_key: str
    subject: str
    body: str
    is_custom: bool               # True = tenant sudah menyesuaikan (bukan default)
    default_subject: str
    default_body: str
    variables: list[str]          # daftar putih variabel utk dokumen ini


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
