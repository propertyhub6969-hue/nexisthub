import uuid
import math
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import Response
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core import storage
from app.api.deps import get_current_context, AuthContext
from app.models.marketing import Lead, Prospect, Client, LeadStatus, ProspectStatus, ClientStatus
from app.models.property import Unit, UnitStatus
from app.models.payment import Payment
from app.models.kpr import KprApplication
from app.core.audit import record_audit
from app.core.unit_status import unit_status_for_client as _unit_status_for_client, set_unit_status as _set_unit_status
from app.schemas.marketing import (
    Paginated,
    LeadCreate, LeadUpdate, LeadResponse,
    ProspectCreate, ProspectUpdate, ProspectResponse,
    ClientCreate, ClientUpdate, ClientResponse,
)

router = APIRouter()

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


def _paginate(items, total, page, size):
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": math.ceil(total / size) if size else 0,
    }


# ═══════════════════════ LEADS ═══════════════════════
@router.get("/leads", response_model=Paginated[LeadResponse])
async def list_leads(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    project_id: Optional[uuid.UUID] = Query(None),
    temperature: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
):
    """List leads for the current tenant (paginated, searchable, filterable)."""
    conditions = [Lead.tenant_id == ctx.tenant_id]
    if search:
        term = f"%{search}%"
        conditions.append(or_(Lead.full_name.ilike(term), Lead.phone.ilike(term)))
    if status_filter:
        conditions.append(Lead.status == status_filter)
    if project_id:
        conditions.append(Lead.interested_project_id == project_id)
    if temperature:
        conditions.append(Lead.temperature == temperature)

    total = await db.scalar(select(func.count()).select_from(Lead).where(*conditions))
    result = await db.execute(
        select(Lead).where(*conditions)
        .order_by(Lead.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    return _paginate(result.scalars().all(), total or 0, page, size)


@router.post("/leads", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Create a new lead."""
    lead = Lead(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(lead)
    await db.flush()
    await db.refresh(lead)
    return lead


async def _get_lead(db: AsyncSession, tenant_id: uuid.UUID, lead_id: uuid.UUID) -> Lead:
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.tenant_id == tenant_id)
    )
    lead = result.scalar_one_or_none()
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Lead tidak ditemukan")
    return lead


@router.get("/leads/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    return await _get_lead(db, ctx.tenant_id, lead_id)


@router.patch("/leads/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: uuid.UUID,
    payload: LeadUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead(db, ctx.tenant_id, lead_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)
    await db.flush()
    await db.refresh(lead)
    return lead


@router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    lead = await _get_lead(db, ctx.tenant_id, lead_id)
    await db.delete(lead)


@router.post("/leads/{lead_id}/convert", response_model=ProspectResponse, status_code=status.HTTP_201_CREATED)
async def convert_lead(
    lead_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Jadikan lead → prospek (data terbawa). Lead ditandai 'qualified'."""
    lead = await _get_lead(db, ctx.tenant_id, lead_id)
    dup = (await db.execute(
        select(Prospect.id).where(Prospect.tenant_id == ctx.tenant_id, Prospect.lead_id == lead_id)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Lead ini sudah dikonversi jadi prospek")

    prospect = Prospect(
        tenant_id=ctx.tenant_id, lead_id=lead.id,
        full_name=lead.full_name, phone=lead.phone, email=lead.email,
        interested_project_id=lead.interested_project_id,
        notes=lead.interest, status=ProspectStatus.ACTIVE,
    )
    db.add(prospect)
    lead.status = LeadStatus.QUALIFIED
    await db.flush()
    await db.refresh(prospect)
    return prospect


# ═══════════════════════ PROSPECTS ═══════════════════════
@router.get("/prospects", response_model=Paginated[ProspectResponse])
async def list_prospects(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    project_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
):
    conditions = [Prospect.tenant_id == ctx.tenant_id]
    if search:
        term = f"%{search}%"
        conditions.append(or_(Prospect.full_name.ilike(term), Prospect.phone.ilike(term)))
    if status_filter:
        conditions.append(Prospect.status == status_filter)
    if project_id:
        conditions.append(Prospect.interested_project_id == project_id)

    total = await db.scalar(select(func.count()).select_from(Prospect).where(*conditions))
    result = await db.execute(
        select(Prospect).where(*conditions)
        .order_by(Prospect.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    return _paginate(result.scalars().all(), total or 0, page, size)


@router.post("/prospects", response_model=ProspectResponse, status_code=status.HTTP_201_CREATED)
async def create_prospect(
    payload: ProspectCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    prospect = Prospect(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(prospect)
    await db.flush()
    await db.refresh(prospect)
    return prospect


async def _get_prospect(db: AsyncSession, tenant_id: uuid.UUID, prospect_id: uuid.UUID) -> Prospect:
    result = await db.execute(
        select(Prospect).where(Prospect.id == prospect_id, Prospect.tenant_id == tenant_id)
    )
    prospect = result.scalar_one_or_none()
    if prospect is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Prospect tidak ditemukan")
    return prospect


@router.get("/prospects/{prospect_id}", response_model=ProspectResponse)
async def get_prospect(
    prospect_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    return await _get_prospect(db, ctx.tenant_id, prospect_id)


@router.patch("/prospects/{prospect_id}", response_model=ProspectResponse)
async def update_prospect(
    prospect_id: uuid.UUID,
    payload: ProspectUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    prospect = await _get_prospect(db, ctx.tenant_id, prospect_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prospect, field, value)
    await db.flush()
    await db.refresh(prospect)
    return prospect


@router.delete("/prospects/{prospect_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prospect(
    prospect_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    prospect = await _get_prospect(db, ctx.tenant_id, prospect_id)
    await db.delete(prospect)


@router.post("/prospects/{prospect_id}/convert", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def convert_prospect(
    prospect_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Jadikan prospek → pembeli (data + budget terbawa). Prospek ditandai 'won'."""
    prospect = await _get_prospect(db, ctx.tenant_id, prospect_id)
    dup = (await db.execute(
        select(Client.id).where(
            Client.tenant_id == ctx.tenant_id, Client.prospect_id == prospect_id,
            Client.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Prospek ini sudah dikonversi jadi pembeli")

    client = Client(
        tenant_id=ctx.tenant_id, prospect_id=prospect.id, marketing_user_id=ctx.user_id,
        full_name=prospect.full_name, phone=prospect.phone, email=prospect.email,
        project_id=prospect.interested_project_id,
        unit_type=prospect.unit_type, contract_value=prospect.budget,
        notes=prospect.notes, status=ClientStatus.ACTIVE,
    )
    db.add(client)
    prospect.status = ProspectStatus.WON
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "clients", client.id,
                       new_data={"from_prospect": str(prospect_id), "full_name": client.full_name}, client_id=client.id)
    return await _get_client(db, ctx.tenant_id, client.id)


# ═══════════════════════ CLIENTS ═══════════════════════
async def _attach_client_extras(db: AsyncSession, clients: list[Client]) -> None:
    """Set atribut transien (tak disimpan) remaining & kpr_stage per klien — 2 query bulk, bukan N+1."""
    if not clients:
        return
    ids = [c.id for c in clients]

    paid_rows = (await db.execute(
        select(Payment.client_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.client_id.in_(ids), Payment.is_deleted == False)  # noqa: E712
        .group_by(Payment.client_id)
    )).all()
    paid_by_client = {row[0]: row[1] for row in paid_rows}

    kpr_rows = (await db.execute(
        select(KprApplication.client_id, KprApplication.stage, KprApplication.rejected_date, KprApplication.created_at)
        .where(KprApplication.client_id.in_(ids), KprApplication.is_deleted == False)  # noqa: E712
        .order_by(KprApplication.created_at.desc())
    )).all()
    stage_by_client = {}
    rejected_by_client = {}
    for client_id, stage, rejected_date, _created_at in kpr_rows:
        if client_id not in stage_by_client:  # baris pertama per klien = KPR paling baru
            stage_by_client[client_id] = stage
            rejected_by_client[client_id] = rejected_date is not None

    # Label unit (blok-nomor) dari relasi unit_id — JANGAN andalkan FE memuat daftar unit
    # (unit dimuat lazy per-proyek, jadi kolom No.Unit kosong saat daftar dibuka tanpa filter).
    uids = {c.unit_id for c in clients if c.unit_id}
    unit_labels: dict = {}
    if uids:
        for uid, block, num in (await db.execute(
            select(Unit.id, Unit.block, Unit.unit_number).where(Unit.id.in_(uids))
        )).all():
            unit_labels[uid] = "-".join(x for x in [block, num] if x) or None

    for c in clients:
        price = c.contract_value or 0
        c.remaining = (price - paid_by_client.get(c.id, 0)) if c.contract_value is not None else None
        c.kpr_stage = stage_by_client.get(c.id)
        c.kpr_rejected = rejected_by_client.get(c.id, False)
        c.unit_label = unit_labels.get(c.unit_id) or c.unit_number  # fallback ke field teks lama


@router.get("/clients", response_model=Paginated[ClientResponse])
async def list_clients(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    project_id: Optional[uuid.UUID] = Query(None),
    unit_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
):
    conditions = [Client.tenant_id == ctx.tenant_id, Client.is_deleted == False]  # noqa: E712
    if search:
        term = f"%{search}%"
        conditions.append(or_(
            Client.full_name.ilike(term),
            Client.phone.ilike(term),
            Client.unit_number.ilike(term),
        ))
    if status_filter:
        conditions.append(Client.status == status_filter)
    if project_id:
        conditions.append(Client.project_id == project_id)
    if unit_id:
        conditions.append(Client.unit_id == unit_id)

    total = await db.scalar(select(func.count()).select_from(Client).where(*conditions))
    result = await db.execute(
        select(Client).options(selectinload(Client.marketing_user)).where(*conditions)
        .order_by(Client.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    items = result.scalars().all()
    await _attach_client_extras(db, items)
    return _paginate(items, total or 0, page, size)


@router.post("/clients", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    if payload.unit_id:
        await _assert_unit_free(db, ctx.tenant_id, payload.unit_id)
    # marketing otomatis = user yang login
    client = Client(tenant_id=ctx.tenant_id, marketing_user_id=ctx.user_id, **payload.model_dump())
    db.add(client)
    await db.flush()
    # sinkronkan status unit yang dipilih
    if client.unit_id:
        await _set_unit_status(db, ctx.tenant_id, client.unit_id, _unit_status_for_client(client))
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "clients", client.id, new_data=payload, client_id=client.id)
    return await _get_client(db, ctx.tenant_id, client.id)


async def _assert_unit_free(db, tenant_id, unit_id, exclude_id=None):
    """Pastikan satu unit/kavling hanya dipakai satu pembeli aktif (nonaktif/batal diabaikan)."""
    q = select(Client.id).where(
        Client.tenant_id == tenant_id, Client.unit_id == unit_id,
        Client.status != ClientStatus.INACTIVE, Client.is_deleted == False,  # noqa: E712
    )
    if exclude_id:
        q = q.where(Client.id != exclude_id)
    if (await db.execute(q)).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Unit/kavling sudah dipakai pembeli lain")


async def _get_client(db: AsyncSession, tenant_id: uuid.UUID, client_id: uuid.UUID) -> Client:
    result = await db.execute(
        select(Client).options(selectinload(Client.marketing_user))
        .where(Client.id == client_id, Client.tenant_id == tenant_id, Client.is_deleted == False)  # noqa: E712
    )
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Client tidak ditemukan")
    await _attach_client_extras(db, [client])
    return client


@router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    return await _get_client(db, ctx.tenant_id, client_id)


@router.patch("/clients/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: uuid.UUID,
    payload: ClientUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    client = await _get_client(db, ctx.tenant_id, client_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("unit_id") and data["unit_id"] != client.unit_id:
        await _assert_unit_free(db, ctx.tenant_id, data["unit_id"], exclude_id=client_id)
    old_unit_id = client.unit_id
    for field, value in data.items():
        setattr(client, field, value)
    await db.flush()
    # bebaskan unit lama bila unit berganti; set status unit sekarang
    if old_unit_id and old_unit_id != client.unit_id:
        await _set_unit_status(db, ctx.tenant_id, old_unit_id, UnitStatus.AVAILABLE)
    if client.unit_id:
        await _set_unit_status(db, ctx.tenant_id, client.unit_id, _unit_status_for_client(client))
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "clients", client_id, new_data=data, client_id=client_id)
    return await _get_client(db, ctx.tenant_id, client_id)


async def _upload_client_file(db, ctx, client_id, file, field_prefix: str, resource_label: str) -> Client:
    client = await _get_client(db, ctx.tenant_id, client_id)
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
    key = storage.build_key(ctx.tenant_id, "clients", client.id, file.filename)
    await storage.put(key, data, file.content_type)
    setattr(client, f"{field_prefix}_file_key", key)
    setattr(client, f"{field_prefix}_file_data", None)
    setattr(client, f"{field_prefix}_file_name", file.filename)
    setattr(client, f"{field_prefix}_file_type", file.content_type or "application/octet-stream")
    setattr(client, f"{field_prefix}_file_size", len(data))
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "clients", client_id,
                       new_data={f"{resource_label}_file_name": file.filename, "size": len(data)}, client_id=client_id)
    return await _get_client(db, ctx.tenant_id, client_id)


async def _download_client_file(db, tenant_id, client_id, field_prefix: str):
    type_col = getattr(Client, f"{field_prefix}_file_type")
    name_col = getattr(Client, f"{field_prefix}_file_name")
    key_col = getattr(Client, f"{field_prefix}_file_key")
    row = (await db.execute(
        select(type_col, name_col, key_col).where(
            Client.id == client_id, Client.tenant_id == tenant_id, Client.is_deleted == False)  # noqa: E712
    )).first()
    if row is None or row[1] is None:  # row[1] = file_name → tak ada file
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    ctype, fname, fkey = row
    if fkey:
        data = await storage.get(fkey)
    else:
        data = (await db.execute(
            select(getattr(Client, f"{field_prefix}_file_data")).where(
                Client.id == client_id, Client.tenant_id == tenant_id)
        )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return Response(
        content=data, media_type=ctype or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{fname or "file"}"'},
    )


@router.post("/clients/{client_id}/ppjb-file", response_model=ClientResponse)
async def upload_ppjb_file(
    client_id: uuid.UUID, file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Upload file PPJB (Perjanjian Pengikatan Jual Beli) satu pembeli."""
    return await _upload_client_file(db, ctx, client_id, file, "ppjb", "ppjb")


@router.get("/clients/{client_id}/ppjb-file")
async def download_ppjb_file(
    client_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    return await _download_client_file(db, ctx.tenant_id, client_id, "ppjb")


@router.post("/clients/{client_id}/ajb-file", response_model=ClientResponse)
async def upload_ajb_file(
    client_id: uuid.UUID, file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Upload file AJB (Akta Jual Beli) satu pembeli."""
    return await _upload_client_file(db, ctx, client_id, file, "ajb", "ajb")


@router.get("/clients/{client_id}/ajb-file")
async def download_ajb_file(
    client_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    return await _download_client_file(db, ctx.tenant_id, client_id, "ajb")


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    client = await _get_client(db, ctx.tenant_id, client_id)
    unit_id = client.unit_id
    # SOFT DELETE (arsip) — histori tak hilang
    client.is_deleted = True
    client.deleted_at = datetime.utcnow()
    await db.flush()
    # bebaskan unit-nya kembali
    await _set_unit_status(db, ctx.tenant_id, unit_id, UnitStatus.AVAILABLE)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "clients", client_id,
                       old_data={"full_name": client.full_name}, client_id=client_id)
