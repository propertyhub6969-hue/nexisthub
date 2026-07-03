from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.marketing import Client
from app.models.property import Project, Unit
from app.models.document import Document, DocStatus
from app.models.tax import TaxRecord, TaxStatus
from app.models.kpr import KprApplication
from app.schemas.filing import FilingSummaryItem

router = APIRouter()


@router.get("/summary", response_model=list[FilingSummaryItem])
async def filing_summary(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Ringkasan pemberkasan (dokumen+pajak+KPR) lintas pembeli — read-only, tanpa aksi edit."""
    clients = (await db.execute(
        select(Client).where(Client.tenant_id == ctx.tenant_id, Client.is_deleted == False)  # noqa: E712
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

    # Tahap KPR terbaru per pembeli
    kpr_rows = (await db.execute(
        select(KprApplication.client_id, KprApplication.stage, KprApplication.created_at)
        .where(KprApplication.client_id.in_(ids), KprApplication.is_deleted == False)  # noqa: E712
        .order_by(KprApplication.created_at.desc())
    )).all()
    kpr_stage: dict = {}
    for client_id, stage, _created_at in kpr_rows:
        kpr_stage.setdefault(client_id, stage)  # baris pertama per klien = paling baru

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
        ))
    return items
