from pydantic import BaseModel
from typing import Optional
import uuid


class FilingSummaryItem(BaseModel):
    """Ringkasan pemberkasan (dokumen+pajak+KPR) satu pembeli — read-only, dihitung saat fetch."""
    client_id: uuid.UUID
    full_name: str
    project_name: Optional[str] = None
    unit_label: Optional[str] = None
    doc_total: int = 0
    doc_terbit: int = 0
    tax_total: int = 0
    tax_settled: int = 0
    kpr_stage: Optional[str] = None
    bank_name: Optional[str] = None
    kpr_days: Optional[int] = None   # lama pemberkasan (Collect Berkas → Akad; bila belum akad = s/d hari ini)
    kpr_akad: bool = False           # True bila sudah akad (durasi final); False = masih berjalan
