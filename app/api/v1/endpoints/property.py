import uuid
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Request
from fastapi.responses import Response
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import date

from app.core.database import get_db
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext
from app.models.property import Project, Unit, UnitStatus
from app.models.marketing import Client, ClientStatus
from app.models.user import User
from app.schemas.marketing import Paginated
from app.schemas.property import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    UnitCreate, UnitUpdate, UnitResponse, UnitPosition, BastRequest,
)

router = APIRouter()

MAX_SITEPLAN_BYTES = 8 * 1024 * 1024  # 8 MB


def _paginate(items, total, page, size):
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": math.ceil(total / size) if size else 0,
    }


# ═══════════════════════ PROJECTS ═══════════════════════
@router.get("/projects", response_model=Paginated[ProjectResponse])
async def list_projects(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
):
    conditions = [Project.tenant_id == ctx.tenant_id]
    if search:
        term = f"%{search}%"
        conditions.append(or_(Project.name.ilike(term), Project.city.ilike(term)))
    if status_filter:
        conditions.append(Project.status == status_filter)

    total = await db.scalar(select(func.count()).select_from(Project).where(*conditions))
    result = await db.execute(
        select(Project).where(*conditions)
        .order_by(Project.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    return _paginate(result.scalars().all(), total or 0, page, size)


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    project = Project(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project


async def _get_project(db: AsyncSession, tenant_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.tenant_id == tenant_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Proyek tidak ditemukan")
    return project


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    return await _get_project(db, ctx.tenant_id, project_id)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(db, ctx.tenant_id, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.flush()
    await db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project(db, ctx.tenant_id, project_id)
    await db.delete(project)


# ═══════════════════════ SITEPLAN ═══════════════════════
@router.post("/projects/{project_id}/siteplan", response_model=ProjectResponse)
async def upload_siteplan(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Upload/ganti gambar siteplan proyek (disimpan di DB)."""
    project = await _get_project(db, ctx.tenant_id, project_id)
    ctype = file.content_type or ""
    if not ctype.startswith("image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File harus berupa gambar")
    data = await file.read()
    if len(data) > MAX_SITEPLAN_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran gambar maksimal 8 MB")
    project.siteplan_data = data
    project.siteplan_type = ctype
    project.siteplan_size = len(data)
    await db.flush()
    await db.refresh(project)
    return project


@router.get("/projects/{project_id}/siteplan")
async def get_siteplan(
    project_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Ambil gambar siteplan proyek (dengan ETag agar kunjungan berikutnya cepat/304)."""
    # Ambil metadata dulu (tanpa blob) untuk hitung ETag & cek If-None-Match
    meta = (await db.execute(
        select(Project.siteplan_size, Project.siteplan_type, Project.updated_at).where(
            Project.id == project_id, Project.tenant_id == ctx.tenant_id)
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Siteplan belum ada")
    size, ctype, updated = meta
    etag = f'"sp-{size}-{int(updated.timestamp())}"'
    cache_headers = {"ETag": etag, "Cache-Control": "private, max-age=60, must-revalidate"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=cache_headers)
    data = (await db.execute(
        select(Project.siteplan_data).where(
            Project.id == project_id, Project.tenant_id == ctx.tenant_id)
    )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Siteplan belum ada")
    return Response(content=data, media_type=ctype or "image/png", headers=cache_headers)


@router.delete("/projects/{project_id}/siteplan", response_model=ProjectResponse)
async def delete_siteplan(
    project_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Hapus gambar siteplan proyek (posisi unit tetap tersimpan)."""
    project = await _get_project(db, ctx.tenant_id, project_id)
    project.siteplan_data = None
    project.siteplan_type = None
    project.siteplan_size = None
    await db.flush()
    await db.refresh(project)
    return project


@router.put("/projects/{project_id}/unit-positions", response_model=list[UnitResponse])
async def save_unit_positions(
    project_id: uuid.UUID,
    positions: list[UnitPosition],
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Simpan posisi banyak unit sekaligus (koordinat siteplan, persen 0-100)."""
    await _get_project(db, ctx.tenant_id, project_id)
    if not positions:
        return []
    ids = [p.unit_id for p in positions]
    units = (await db.execute(
        select(Unit).where(
            Unit.id.in_(ids), Unit.project_id == project_id, Unit.tenant_id == ctx.tenant_id)
    )).scalars().all()
    by_id = {u.id: u for u in units}
    for p in positions:
        u = by_id.get(p.unit_id)
        if u is not None:
            u.position_x = p.position_x
            u.position_y = p.position_y
    await db.flush()
    for u in units:
        await db.refresh(u)
    return units


# ═══════════════════════ UNITS ═══════════════════════
async def _attach_unit_extras(db: AsyncSession, tenant_id, units: list[Unit]) -> None:
    """Set atribut transien: buyer_name (pembeli aktif unit) & bast_user_name (petugas serah terima)."""
    if not units:
        return
    ids = [u.id for u in units]
    brows = (await db.execute(
        select(Client.unit_id, Client.full_name).where(
            Client.unit_id.in_(ids), Client.tenant_id == tenant_id,
            Client.status != ClientStatus.INACTIVE, Client.is_deleted == False)  # noqa: E712
    )).all()
    buyer = {r[0]: r[1] for r in brows}
    uids = list({u.bast_user_id for u in units if u.bast_user_id})
    users = {}
    if uids:
        urows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(uids)))).all()
        users = {r[0]: r[1] for r in urows}
    for u in units:
        u.buyer_name = buyer.get(u.id)
        u.bast_user_name = users.get(u.bast_user_id)


@router.get("/units", response_model=Paginated[UnitResponse])
async def list_units(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
    project_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=500),
):
    """List units for the tenant, optionally scoped to a project (untuk siteplan)."""
    conditions = [Unit.tenant_id == ctx.tenant_id]
    if project_id:
        conditions.append(Unit.project_id == project_id)
    if search:
        term = f"%{search}%"
        conditions.append(or_(Unit.unit_number.ilike(term), Unit.block.ilike(term)))
    if status_filter:
        conditions.append(Unit.status == status_filter)

    total = await db.scalar(select(func.count()).select_from(Unit).where(*conditions))
    result = await db.execute(
        select(Unit).where(*conditions)
        .order_by(Unit.block, Unit.unit_number)
        .offset((page - 1) * size).limit(size)
    )
    items = result.scalars().all()
    await _attach_unit_extras(db, ctx.tenant_id, items)
    return _paginate(items, total or 0, page, size)


@router.post("/units", response_model=UnitResponse, status_code=status.HTTP_201_CREATED)
async def create_unit(
    payload: UnitCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    # pastikan project milik tenant ini
    await _get_project(db, ctx.tenant_id, payload.project_id)
    unit = Unit(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(unit)
    await db.flush()
    await db.refresh(unit)
    await _attach_unit_extras(db, ctx.tenant_id, [unit])
    return unit


async def _get_unit(db: AsyncSession, tenant_id: uuid.UUID, unit_id: uuid.UUID) -> Unit:
    result = await db.execute(
        select(Unit).where(Unit.id == unit_id, Unit.tenant_id == tenant_id)
    )
    unit = result.scalar_one_or_none()
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    await _attach_unit_extras(db, tenant_id, [unit])
    return unit


@router.get("/units/{unit_id}", response_model=UnitResponse)
async def get_unit(
    unit_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    return await _get_unit(db, ctx.tenant_id, unit_id)


@router.patch("/units/{unit_id}", response_model=UnitResponse)
async def update_unit(
    unit_id: uuid.UUID,
    payload: UnitUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(unit, field, value)
    await db.flush()
    await db.refresh(unit)
    await _attach_unit_extras(db, ctx.tenant_id, [unit])
    return unit


@router.post("/units/{unit_id}/bast", response_model=UnitResponse)
async def create_bast(
    unit_id: uuid.UUID,
    payload: BastRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Buat BAST (serah terima) → nomor otomatis, petugas = user login, status unit → Serah Terima."""
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    if unit.bast_number is None:
        n = await db.scalar(select(func.count()).select_from(Unit).where(
            Unit.tenant_id == ctx.tenant_id, Unit.bast_number.isnot(None)))
        unit.bast_number = f"BAST-{(n or 0) + 1:06d}"
    unit.bast_date = payload.bast_date or date.today()
    unit.bast_user_id = ctx.user_id
    unit.status = UnitStatus.HANDOVER
    if payload.notes:
        unit.notes = payload.notes
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "BAST", "units", unit_id,
                       new_data={"bast_number": unit.bast_number, "date": str(unit.bast_date)})
    await db.refresh(unit)
    await _attach_unit_extras(db, ctx.tenant_id, [unit])
    return unit


@router.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit(
    unit_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    await db.delete(unit)
