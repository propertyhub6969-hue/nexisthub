import uuid
import math
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.marketing import Lead, Prospect, Client, LeadStatus, ProspectStatus, ClientStatus
from app.models.property import Unit, UnitStatus
from app.core.audit import record_audit
from app.schemas.marketing import (
    Paginated,
    LeadCreate, LeadUpdate, LeadResponse,
    ProspectCreate, ProspectUpdate, ProspectResponse,
    ClientCreate, ClientUpdate, ClientResponse,
)

router = APIRouter()


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
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
):
    """List leads for the current tenant (paginated, searchable)."""
    conditions = [Lead.tenant_id == ctx.tenant_id]
    if search:
        term = f"%{search}%"
        conditions.append(or_(Lead.full_name.ilike(term), Lead.phone.ilike(term)))
    if status_filter:
        conditions.append(Lead.status == status_filter)

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
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
):
    conditions = [Prospect.tenant_id == ctx.tenant_id]
    if search:
        term = f"%{search}%"
        conditions.append(or_(Prospect.full_name.ilike(term), Prospect.phone.ilike(term)))
    if status_filter:
        conditions.append(Prospect.status == status_filter)

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
        unit_type=prospect.unit_type, contract_value=prospect.budget,
        notes=prospect.notes, status=ClientStatus.ACTIVE,
    )
    db.add(client)
    prospect.status = ProspectStatus.WON
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "clients", client.id,
                       new_data={"from_prospect": str(prospect_id), "full_name": client.full_name})
    return await _get_client(db, ctx.tenant_id, client.id)


# ═══════════════════════ CLIENTS ═══════════════════════
@router.get("/clients", response_model=Paginated[ClientResponse])
async def list_clients(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
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

    total = await db.scalar(select(func.count()).select_from(Client).where(*conditions))
    result = await db.execute(
        select(Client).options(selectinload(Client.marketing_user)).where(*conditions)
        .order_by(Client.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    return _paginate(result.scalars().all(), total or 0, page, size)


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
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "clients", client.id, new_data=payload)
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


def _unit_status_for_client(client: Client):
    """Status unit yang seharusnya berdasarkan status pembeli."""
    if client.status == ClientStatus.INACTIVE:
        return UnitStatus.AVAILABLE
    if client.status == ClientStatus.COMPLETED:
        return UnitStatus.SOLD
    return UnitStatus.BOOKED  # active → dipesan


async def _set_unit_status(db, tenant_id, unit_id, new_status):
    if not unit_id:
        return
    u = (await db.execute(select(Unit).where(Unit.id == unit_id, Unit.tenant_id == tenant_id))).scalar_one_or_none()
    if u:
        u.status = new_status


async def _get_client(db: AsyncSession, tenant_id: uuid.UUID, client_id: uuid.UUID) -> Client:
    result = await db.execute(
        select(Client).options(selectinload(Client.marketing_user))
        .where(Client.id == client_id, Client.tenant_id == tenant_id, Client.is_deleted == False)  # noqa: E712
    )
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Client tidak ditemukan")
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
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "clients", client_id, new_data=data)
    return await _get_client(db, ctx.tenant_id, client_id)


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
                       old_data={"full_name": client.full_name})
