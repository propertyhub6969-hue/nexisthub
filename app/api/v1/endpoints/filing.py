from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.marketing import Client, ClientPaymentType
from app.models.property import Project, Unit
from app.models.document import Document, DocStatus
from app.models.tax import TaxRecord, TaxStatus
from app.models.kpr import KprApplication, Bank
from app.schemas.filing import FilingSummaryItem

router = APIRouter()


@router.get("/summary", response_model=list[FilingSummaryItem])
async def filing_summary(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Ringkasan pemberkasan (dokumen+pajak+KPR) lintas pembeli — read-only, tanpa aksi edit.
    Hanya pembeli cara beli KPR (kolom kpr_stage/bank/durasi tak relevan utk pembeli cash)."""
    clients = (await db.execute(
        select(Client).where(Client.tenant_id == ctx.tenant_id, Client.is_deleted == False,  # noqa: E712
                             Client.payment_type == ClientPaymentType.KPR)
        .order_by(Client.created_at.desc())
    )).scalars().all()
    if not clients:
        return []
    ids = [c.id for c in clients]

    project_ids = {c.project_id for c in clients if c.project_id}
    unit_ids = {c.unit_id for c in clients if c.unit_id}
    projects = {
        p.id: p for p in (await db.execute(select(Project).where(Project.id.in_(project_ids)))).scalars().all()
    } if project_ids else {}
    units = {
        u.id: u for u in (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()
    } if unit_ids else {}

    # Rollup dokumen per pembeli (total + jumlah berstatus terbit)
    doc_rows = (await db.execute(
        select(Document.client_id, Document.status, func.count())
        .where(Document.client_id.in_(ids), Document.is_deleted == False)  # noqa: E712
        .group_by(Document.client_id, Document.status)
    )).all()
    doc_total: dict = {}
    doc_terbit: dict = {}
    for client_id, doc_status, cnt in doc_rows:
        doc_total[client_id] = doc_total.get(client_id, 0) + cnt
        if doc_status == DocStatus.TERBIT:
            doc_terbit[client_id] = doc_terbit.get(client_id, 0) + cnt

    # Rollup pajak per pembeli (total + jumlah bukan "belum")
    tax_rows = (await db.execute(
        select(TaxRecord.client_id, TaxRecord.status, func.count())
        .where(TaxRecord.client_id.in_(ids), TaxRecord.is_deleted == False)  # noqa: E712
        .group_by(TaxRecord.client_id, TaxRecord.status)
    )).all()
    tax_total: dict = {}
    tax_settled: dict = {}
    for client_id, tax_status, cnt in tax_rows:
        tax_total[client_id] = tax_total.get(client_id, 0) + cnt
        if tax_status != TaxStatus.BELUM:
            tax_settled[client_id] = tax_settled.get(client_id, 0) + cnt

    # Tahap KPR + bank + tanggal (untuk durasi pemberkasan) terbaru per pembeli
    kpr_rows = (await db.execute(
        select(KprApplication.client_id, KprApplication.stage, KprApplication.bank_id,
               KprApplication.submitted_date, KprApplication.akad_date, KprApplication.created_at)
        .where(KprApplication.client_id.in_(ids), KprApplication.is_deleted == False)  # noqa: E712
        .order_by(KprApplication.created_at.desc())
    )).all()
    kpr_stage: dict = {}
    kpr_bank_id: dict = {}
    kpr_akad_date: dict = {}  # akad_date pengajuan TERBARU (yang berhasil), utk ujung durasi
    kpr_start: dict = {}      # submitted_date PALING AWAL — mulai berkas dikumpulkan (lintas pengajuan/penolakan)
    kpr_days: dict = {}
    kpr_akad: dict = {}
    today = date.today()
    for client_id, stage, bank_id, submitted_date, akad_date, _created_at in kpr_rows:
        if client_id not in kpr_stage:  # baris pertama per klien = paling baru
            kpr_stage[client_id] = stage
            kpr_bank_id[client_id] = bank_id
            kpr_akad_date[client_id] = akad_date
            kpr_akad[client_id] = akad_date is not None
        # durasi pemberkasan dihitung dari pengajuan PERTAMA (proses berlanjut walau ditolak & ajukan ulang)
        if submitted_date is not None:
            cur = kpr_start.get(client_id)
            if cur is None or submitted_date < cur:
                kpr_start[client_id] = submitted_date
    for client_id, start in kpr_start.items():
        end = kpr_akad_date.get(client_id) or today  # akad pengajuan terbaru, atau hari ini bila belum akad
        d = (end - start).days
        kpr_days[client_id] = d if d >= 0 else None
    # nama bank
    bank_ids = {b for b in kpr_bank_id.values() if b}
    bank_names = {
        b.id: b.name for b in (await db.execute(select(Bank).where(Bank.id.in_(bank_ids)))).scalars().all()
    } if bank_ids else {}

    items = []
    for c in clients:
        proj = projects.get(c.project_id)
        unit = units.get(c.unit_id)
        unit_label = None
        if unit:
            unit_label = f"{unit.block}-{unit.unit_number}" if unit.block else unit.unit_number
        items.append(FilingSummaryItem(
            client_id=c.id, full_name=c.full_name,
            project_name=proj.name if proj else None,
            unit_label=unit_label,
            doc_total=doc_total.get(c.id, 0), doc_terbit=doc_terbit.get(c.id, 0),
            tax_total=tax_total.get(c.id, 0), tax_settled=tax_settled.get(c.id, 0),
            kpr_stage=kpr_stage.get(c.id),
            bank_name=bank_names.get(kpr_bank_id.get(c.id)),
            kpr_days=kpr_days.get(c.id),
            kpr_akad=kpr_akad.get(c.id, False),
        ))
    return items
