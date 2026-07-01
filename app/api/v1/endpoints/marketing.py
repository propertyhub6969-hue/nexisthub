import uuid
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.marketing import Lead, Prospect, Client
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
    conditions = [Client.tenant_id == ctx.tenant_id]
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
        select(Client).where(*conditions)
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
    client = Client(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(client)
    await db.flush()
    await db.refresh(client)
    return client


async def _get_client(db: AsyncSession, tenant_id: uuid.UUID, client_id: uuid.UUID) -> Client:
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id)
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
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    await db.flush()
    await db.refresh(client)
    return client


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    client = await _get_client(db, ctx.tenant_id, client_id)
    await db.delete(client)
