import uuid
import math
import secrets
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Request
from fastapi.responses import Response
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import date, datetime, timedelta, timezone

from app.core.database import get_db
from app.core.audit import record_audit
from app.core import storage
from app.api.deps import get_current_context, AuthContext, require_role
from app.models.property import (
    Project, Unit, UnitStatus, SiteplanShareLink, UnitBookingRequest, BookingRequestStatus,
    UnitUtility, UtilityKind, UtilityStatus,
)
from app.models.expense import Expense, ExpenseCategory
from app.core.cashbook import sync_expense_cashbook
from app.models.marketing import Client, ClientStatus, Prospect, ProspectStatus
from app.models.user import User, UserRole
from app.schemas.marketing import Paginated
from app.schemas.property import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    UnitCreate, UnitUpdate, UnitResponse, UnitPosition, BastRequest,
    UnitBulkGenerate, UnitBulkResult,
    SiteplanShareLinkCreate, SiteplanShareLinkResponse,
    BookingRequestResponse, BookingRejectRequest,
    UtilityUpsert, UtilityResponse, UtilityUnitRow, UtilitySummary,
)
from app.core.notify import notify_roles
from app.models.notification import NotificationKind

router = APIRouter()

MAX_SITEPLAN_BYTES = 8 * 1024 * 1024  # 8 MB

_UTIL_LABEL = {UtilityKind.PLN: "Listrik PLN", UtilityKind.PDAM: "Air PDAM"}
_UTIL_EXPENSE_CAT = {UtilityKind.PLN: ExpenseCategory.KELISTRIKAN, UtilityKind.PDAM: ExpenseCategory.AIR_PDAM}

# Yang berhak menindak tagihan biaya — sama dengan persetujuan pembayaran (payment.py::APPROVERS).
EXPENSE_APPROVERS = (UserRole.OWNER, UserRole.ADMIN, UserRole.FINANCE)


def _rp(n) -> str:
    """Format rupiah singkat utk isi notifikasi (mis. Rp 1.500.000)."""
    try:
        return "Rp " + f"{int(Decimal(n or 0)):,}".replace(",", ".")
    except Exception:
        return "Rp 0"



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


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])  # hapus data properti = owner/admin
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
    project.siteplan_key = storage.build_key(ctx.tenant_id, "siteplan", project.id, file.filename)
    await storage.put(project.siteplan_key, data, ctype)
    project.siteplan_data = None
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
        select(Project.siteplan_size, Project.siteplan_type, Project.updated_at, Project.siteplan_key).where(
            Project.id == project_id, Project.tenant_id == ctx.tenant_id)
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Siteplan belum ada")
    size, ctype, updated, fkey = meta
    etag = f'"sp-{size}-{int(updated.timestamp())}"'
    cache_headers = {"ETag": etag, "Cache-Control": "private, max-age=60, must-revalidate"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=cache_headers)
    if fkey:
        data = await storage.get(fkey)
    else:
        data = (await db.execute(
            select(Project.siteplan_data).where(
                Project.id == project_id, Project.tenant_id == ctx.tenant_id)
        )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Siteplan belum ada")
    return Response(content=data, media_type=ctype or "image/png", headers=cache_headers)


@router.delete("/projects/{project_id}/siteplan", response_model=ProjectResponse,
               dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])  # hapus siteplan = owner/admin
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


@router.get("/units/stats")
async def unit_stats(
    project_id: uuid.UUID = Query(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Hitung unit per status untuk 1 proyek (ringkasan; tak terpengaruh paginasi tabel)."""
    rows = (await db.execute(
        select(Unit.status, func.count())
        .where(Unit.tenant_id == ctx.tenant_id, Unit.project_id == project_id)
        .group_by(Unit.status)
    )).all()
    by: dict = {}
    for st, cnt in rows:
        key = st.value if hasattr(st, "value") else str(st).lower()
        by[key] = cnt
    return {"total": sum(by.values()), "by_status": by}


def _apply_price_breakdown(data: dict, current_discount: Optional[Decimal] = None) -> None:
    """Bila `price_breakdown` diisi → simpan sbg JSON [{label, amount}] & set price = totalnya
    DIKURANGI diskon (data["discount"] bila diisi request ini, kalau tidak pakai current_discount
    yang sudah tersimpan). Bila kosong/None (dan key ada) → kosongkan rincian (harga pakai field manual)."""
    if "price_breakdown" not in data:
        return
    pb = data.get("price_breakdown")
    if pb:
        items = [{"label": str(i["label"]).strip(), "amount": float(i["amount"] or 0)} for i in pb]
        data["price_breakdown"] = items
        total = sum((Decimal(str(i["amount"])) for i in items), Decimal(0))
        discount = data["discount"] if "discount" in data else current_discount
        discount = Decimal(str(discount)) if discount else Decimal(0)
        data["price"] = max(Decimal(0), total - discount)
    else:
        data["price_breakdown"] = None


@router.post("/units", response_model=UnitResponse, status_code=status.HTTP_201_CREATED)
async def create_unit(
    payload: UnitCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    # pastikan project milik tenant ini
    await _get_project(db, ctx.tenant_id, payload.project_id)
    data = payload.model_dump()
    _apply_price_breakdown(data)
    unit = Unit(tenant_id=ctx.tenant_id, **data)
    db.add(unit)
    await db.flush()
    await db.refresh(unit)
    await _attach_unit_extras(db, ctx.tenant_id, [unit])
    return unit


@router.post("/units/bulk-generate", response_model=UnitBulkResult, status_code=status.HTTP_201_CREATED)
async def bulk_generate_units(
    payload: UnitBulkGenerate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Buat banyak unit sekaligus (Blok {block} No {start..start+count-1}) dengan default tipe/harga/luas.
    Aman & idempotent: nomor yang sudah ada di blok yang sama DILEWATI (tak menimpa/hapus unit lama)."""
    await _get_project(db, ctx.tenant_id, payload.project_id)
    block = (payload.block or "").strip() or None

    # nomor yang sudah dipakai di blok yang sama (skip agar tak dobel)
    existing_rows = await db.execute(
        select(Unit.unit_number).where(
            Unit.tenant_id == ctx.tenant_id, Unit.project_id == payload.project_id,
            (Unit.block == block) if block is not None else Unit.block.is_(None),
        )
    )
    existing = {str(n) for (n,) in existing_rows.all()}

    end = payload.start_number + payload.count - 1
    pad = payload.pad if payload.pad is not None else len(str(end))

    created_units: list[Unit] = []
    skipped = 0
    for n in range(payload.start_number, end + 1):
        num_str = str(n).zfill(pad)
        if num_str in existing or str(n) in existing:  # sudah ada → lewati
            skipped += 1
            continue
        existing.add(num_str)
        created_units.append(Unit(
            tenant_id=ctx.tenant_id, project_id=payload.project_id,
            block=block, unit_number=num_str, unit_type=payload.unit_type,
            land_area=payload.land_area, building_area=payload.building_area,
            price=payload.price, status=UnitStatus.AVAILABLE,
        ))

    if created_units:
        db.add_all(created_units)
        await db.flush()
        for u in created_units:
            await db.refresh(u)
        await _attach_unit_extras(db, ctx.tenant_id, created_units)

    return UnitBulkResult(created=len(created_units), skipped=skipped, units=created_units)


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
    data = payload.model_dump(exclude_unset=True)
    _apply_price_breakdown(data, current_discount=unit.discount)
    for field, value in data.items():
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
    """Buat BAST (serah terima) → nomor otomatis, petugas = user login, status unit → Serah Terima.

    DIBLOKIR bila utilitas (PLN/PDAM) belum terpasang — rumah tak layak diserahterimakan
    kalau listrik/air belum menyala. Kalau di lapangan sudah terpasang, catat dulu di
    panel Utilitas unit tersebut."""
    unit = await _get_unit(db, ctx.tenant_id, unit_id)

    utils = (await db.execute(select(UnitUtility).where(
        UnitUtility.unit_id == unit.id, UnitUtility.tenant_id == ctx.tenant_id))).scalars().all()
    by_kind = {u.kind: u.status for u in utils}
    belum = [_UTIL_LABEL[k] for k in (UtilityKind.PLN, UtilityKind.PDAM)
             if by_kind.get(k) != UtilityStatus.TERPASANG]
    if belum:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Belum bisa serah terima — {' & '.join(belum)} belum terpasang. "
                   f"Catat dulu di panel Utilitas unit {_unit_label(unit)}.")

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


@router.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])  # hapus unit = owner/admin
async def delete_unit(
    unit_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    await db.delete(unit)


# ═══════════════════════ TAUTAN SITEPLAN (agen, tanpa login) ═══════════════════════
# Agen/mitra lihat siteplan & status unit terkini, lalu bisa MENGAJUKAN booking.
# Sengaja TAK menampilkan data pembeli. Booking tak langsung mengubah status unit.

def _unit_label(u: Unit) -> str:
    return "-".join(x for x in [u.block, u.unit_number] if x) or "?"


@router.get("/siteplan-share", response_model=list[SiteplanShareLinkResponse])
async def list_siteplan_share_links(
    project_id: uuid.UUID = Query(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Daftar tautan siteplan tenant ini (termasuk kedaluwarsa/dicabut, utk histori)."""
    conds = [SiteplanShareLink.tenant_id == ctx.tenant_id]
    if project_id:
        conds.append(SiteplanShareLink.project_id == project_id)
    r = await db.execute(select(SiteplanShareLink).where(*conds).order_by(SiteplanShareLink.created_at.desc()))
    return r.scalars().all()


@router.post("/siteplan-share", response_model=SiteplanShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_siteplan_share_link(
    payload: SiteplanShareLinkCreate,
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Buat tautan bertoken utk bagikan siteplan 1 proyek ke agen/mitra."""
    project = (await db.execute(select(Project).where(
        Project.id == payload.project_id, Project.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Proyek tidak ditemukan")
    days = max(1, min(365, payload.expires_days))
    link = SiteplanShareLink(
        tenant_id=ctx.tenant_id, token=secrets.token_urlsafe(32), project_id=project.id,
        project_name_snapshot=project.name, label=(payload.label or None),
        show_price=payload.show_price, created_by=ctx.user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=days),
    )
    db.add(link)
    await db.flush(); await db.refresh(link)
    return link


@router.delete("/siteplan-share/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_siteplan_share_link(
    link_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    link = (await db.execute(select(SiteplanShareLink).where(
        SiteplanShareLink.id == link_id, SiteplanShareLink.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan")
    link.revoked_at = datetime.now(timezone.utc)
    await db.flush()


# ── Antrean permintaan booking dari agen ──
async def _booking_rows(db, tenant_id, conds) -> list[BookingRequestResponse]:
    rows = (await db.execute(
        select(UnitBookingRequest, Unit, Project.name, SiteplanShareLink.label, User.full_name)
        .join(Unit, Unit.id == UnitBookingRequest.unit_id)
        .outerjoin(Project, Project.id == Unit.project_id)
        .outerjoin(SiteplanShareLink, SiteplanShareLink.id == UnitBookingRequest.share_link_id)
        .outerjoin(User, User.id == UnitBookingRequest.reviewed_by)
        .where(*conds)
        .order_by(UnitBookingRequest.created_at.desc())
    )).all()
    return [
        BookingRequestResponse(
            id=b.id, unit_id=b.unit_id, unit_label=_unit_label(u), project_name=pname,
            project_id=u.project_id, prospect_id=b.prospect_id, unit_price=u.price,
            unit_status=u.status.value, agent_name=b.agent_name, agent_phone=b.agent_phone,
            prospect_name=b.prospect_name, prospect_phone=b.prospect_phone, notes=b.notes,
            status=b.status.value, link_label=llabel, reviewer_name=rname,
            reviewed_at=b.reviewed_at, review_notes=b.review_notes, created_at=b.created_at,
        )
        for b, u, pname, llabel, rname in rows
    ]


@router.get("/booking-requests", response_model=list[BookingRequestResponse])
async def list_booking_requests(
    status_filter: str = Query("pending", alias="status"),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Permintaan booking dari agen — default hanya yang menunggu ditinjau."""
    conds = [UnitBookingRequest.tenant_id == ctx.tenant_id]
    if status_filter and status_filter != "all":
        try:
            conds.append(UnitBookingRequest.status == BookingRequestStatus(status_filter))
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Status tak dikenal")
    return await _booking_rows(db, ctx.tenant_id, conds)


@router.get("/booking-requests/pending-count")
async def booking_requests_pending_count(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    count = await db.scalar(select(func.count()).select_from(UnitBookingRequest).where(
        UnitBookingRequest.tenant_id == ctx.tenant_id,
        UnitBookingRequest.status == BookingRequestStatus.PENDING))
    return {"count": count or 0}


async def _get_booking(db, tenant_id, bid) -> UnitBookingRequest:
    b = (await db.execute(select(UnitBookingRequest).where(
        UnitBookingRequest.id == bid, UnitBookingRequest.tenant_id == tenant_id))).scalar_one_or_none()
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Permintaan booking tidak ditemukan")
    if b.status != BookingRequestStatus.PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Permintaan ini sudah diproses")
    return b


@router.post("/booking-requests/{bid}/accept", response_model=BookingRequestResponse)
async def accept_booking_request(
    bid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Terima permintaan → unit ditandai Booking/DP. Pembeli tetap dibuat manual lewat menu Pembeli
    (booking hanya menahan unit, belum ada kontrak)."""
    b = await _get_booking(db, ctx.tenant_id, bid)
    unit = (await db.execute(select(Unit).where(Unit.id == b.unit_id, Unit.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    if unit.status != UnitStatus.AVAILABLE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail=f"Unit {_unit_label(unit)} sudah tidak tersedia (status: {unit.status.value})")
    unit.status = UnitStatus.BOOKED
    b.status = BookingRequestStatus.ACCEPTED
    b.reviewed_by = ctx.user_id
    b.reviewed_at = datetime.now(timezone.utc)

    # Calon pembeli otomatis masuk corong CRM sbg PROSPEK — supaya tak tercecer & bisa di-follow-up.
    # (Belum jadi Pembeli: harga/tanggal kontrak/cara beli belum ada — staf lanjutkan lewat "Jadikan Pembeli".)
    if b.prospect_id is None and (b.prospect_name or b.prospect_phone):
        catatan = [f"Dari booking agen {b.agent_name}" + (f" ({b.agent_phone})" if b.agent_phone else "")]
        catatan.append(f"Unit diminati: {_unit_label(unit)}")
        if b.notes:
            catatan.append(f"Catatan agen: {b.notes}")
        pros = Prospect(
            tenant_id=ctx.tenant_id,
            full_name=(b.prospect_name or f"(via agen {b.agent_name})"),
            phone=b.prospect_phone,
            interested_project_id=unit.project_id,
            unit_type=unit.unit_type,
            budget=unit.price,
            status=ProspectStatus.ACTIVE,
            notes=" · ".join(catatan),
        )
        db.add(pros)
        await db.flush()
        b.prospect_id = pros.id

    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "ACCEPT", "unit_booking_requests", bid,
                       new_data={"unit": _unit_label(unit), "agent": b.agent_name,
                                 "prospect_id": str(b.prospect_id) if b.prospect_id else None})
    rows = await _booking_rows(db, ctx.tenant_id, [UnitBookingRequest.id == bid])
    return rows[0]


@router.post("/booking-requests/{bid}/cancel", response_model=BookingRequestResponse)
async def cancel_booking_request(
    bid: uuid.UUID, payload: BookingRejectRequest,
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Batalkan booking yang SUDAH diterima (mis. calon mundur / tak ada pembayaran) → unit dilepas
    kembali jadi Tersedia. Prospek yang terlanjur dibuat TIDAK dihapus — calonnya tetap data CRM
    yang sah & bisa ditawari unit lain."""
    b = (await db.execute(select(UnitBookingRequest).where(
        UnitBookingRequest.id == bid, UnitBookingRequest.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Permintaan booking tidak ditemukan")
    if b.status != BookingRequestStatus.ACCEPTED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Hanya booking yang sudah diterima yang bisa dibatalkan")

    unit = (await db.execute(select(Unit).where(Unit.id == b.unit_id, Unit.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    released = False
    if unit is not None:
        # PENGAMAN: jangan lepas unit yang sudah punya data Pembeli / sudah akad — itu bukan lagi
        # sekadar "ditahan booking", dan melepasnya diam-diam bisa merusak data penjualan.
        has_client = await db.scalar(select(func.count()).select_from(Client).where(
            Client.unit_id == unit.id, Client.tenant_id == ctx.tenant_id, Client.is_deleted == False))  # noqa: E712
        if has_client:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Unit {_unit_label(unit)} sudah punya data Pembeli — batalkan lewat menu Pembeli, bukan dari sini.")
        if unit.status == UnitStatus.BOOKED:
            unit.status = UnitStatus.AVAILABLE
            released = True

    b.status = BookingRequestStatus.CANCELLED
    b.reviewed_by = ctx.user_id
    b.reviewed_at = datetime.now(timezone.utc)
    b.review_notes = payload.reason.strip()
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CANCEL", "unit_booking_requests", bid,
                       new_data={"unit": _unit_label(unit) if unit else None, "unit_dilepas": released},
                       reason=payload.reason.strip())
    rows = await _booking_rows(db, ctx.tenant_id, [UnitBookingRequest.id == bid])
    return rows[0]


@router.post("/booking-requests/{bid}/reject", response_model=BookingRequestResponse)
async def reject_booking_request(
    bid: uuid.UUID, payload: BookingRejectRequest,
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Tolak permintaan — wajib alasan. Status unit tak berubah."""
    b = await _get_booking(db, ctx.tenant_id, bid)
    b.status = BookingRequestStatus.REJECTED
    b.reviewed_by = ctx.user_id
    b.reviewed_at = datetime.now(timezone.utc)
    b.review_notes = payload.reason.strip()
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "REJECT", "unit_booking_requests", bid,
                       reason=payload.reason.strip())
    rows = await _booking_rows(db, ctx.tenant_id, [UnitBookingRequest.id == bid])
    return rows[0]


# ═══════════════════════ UTILITAS UNIT (PLN / PDAM) ═══════════════════════
# Biaya ditanggung developer & WAJIB terpasang sebelum serah terima (guard di endpoint BAST).
# Biaya pemasangan TIDAK disimpan ganda: nilainya melahirkan/menyunting satu baris Expense
# supaya ikut terhitung di biaya proyek, RAB vs realisasi, & Buku Kas.



async def _sync_utility_expense(db, tenant_id, util: UnitUtility, unit: Unit) -> str | None:
    """Biaya utilitas → satu baris Expense (dibuat/diperbarui/dihapus mengikuti nilai biaya).

    Biaya lahir berstatus DIAJUKAN (is_paid=False) — belum masuk Buku Kas. Yang menandai
    lunas adalah keuangan, lewat menu Biaya Menunggu Bayar, dengan tanggal bayar sebenarnya
    (di lapangan tanggal bayar sering beda dari tanggal pasang). Pola ini sama dengan opname
    borongan, lihat contractor.py::add_opname.

    Mengembalikan alasan notifikasi ke keuangan ("baru"/"ubah") bila ada yang perlu ditindak,
    atau None bila tak ada tagihan baru (mis. biaya dikosongkan, atau tak ada perubahan nominal).
    """
    exp = (await db.execute(select(Expense).where(
        Expense.utility_id == util.id, Expense.tenant_id == tenant_id))).scalar_one_or_none()
    if not util.cost or Decimal(util.cost) <= 0:
        if exp is not None:
            exp.is_deleted = True
            exp.deleted_at = datetime.utcnow()
            await sync_expense_cashbook(db, tenant_id, exp)
        return None
    if exp is None:
        exp = Expense(tenant_id=tenant_id, utility_id=util.id, is_paid=False, paid_at=None)
        db.add(exp)
        reason = "baru"
    else:
        # nominal berubah setelah keuangan membayar → tetap lunas (keputusan keuangan berdiri),
        # tapi mereka perlu tahu supaya bisa mencocokkan selisihnya.
        reason = "ubah" if Decimal(exp.amount or 0) != Decimal(util.cost) else None
        if exp.is_deleted:  # biaya dihidupkan lagi setelah sempat dikosongkan
            exp.is_paid = False
            exp.paid_at = None
            reason = "baru"
    exp.is_deleted = False
    exp.deleted_at = None
    exp.project_id = unit.project_id
    exp.unit_id = unit.id
    exp.category = _UTIL_EXPENSE_CAT[util.kind]
    exp.description = f"Pasang {_UTIL_LABEL[util.kind]} — unit {_unit_label(unit)}"
    exp.amount = util.cost
    exp.expense_date = util.installed_date or util.applied_date or date.today()
    await db.flush()
    await sync_expense_cashbook(db, tenant_id, exp)
    return reason


@router.get("/units/{unit_id}/utilities", response_model=list[UtilityResponse])
async def list_unit_utilities(
    unit_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Utilitas satu unit. Selalu mengembalikan 2 baris (PLN & PDAM) — yang belum dicatat
    dikembalikan sebagai status 'belum' tanpa disimpan, supaya form di UI selalu lengkap."""
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    rows = (await db.execute(select(UnitUtility).where(
        UnitUtility.unit_id == unit.id, UnitUtility.tenant_id == ctx.tenant_id))).scalars().all()
    by_kind = {r.kind: r for r in rows}
    out = []
    for k in (UtilityKind.PLN, UtilityKind.PDAM):
        r = by_kind.get(k)
        out.append(r if r is not None else UtilityResponse(
            id=uuid.UUID(int=0), unit_id=unit.id, kind=k, status=UtilityStatus.BELUM))
    return out


@router.put("/units/{unit_id}/utilities", response_model=UtilityResponse)
async def upsert_unit_utility(
    unit_id: uuid.UUID, payload: UtilityUpsert,
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Simpan utilitas satu jenis (PLN atau PDAM) untuk sebuah unit — buat bila belum ada."""
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    util = (await db.execute(select(UnitUtility).where(
        UnitUtility.unit_id == unit.id, UnitUtility.kind == payload.kind,
        UnitUtility.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if util is None:
        util = UnitUtility(tenant_id=ctx.tenant_id, unit_id=unit.id, kind=payload.kind)
        db.add(util)
    for f, v in payload.model_dump(exclude={"kind"}).items():
        setattr(util, f, v)
    # tanggal terpasang otomatis terisi bila ditandai terpasang tapi tanggalnya kosong
    if util.status == UtilityStatus.TERPASANG and util.installed_date is None:
        util.installed_date = date.today()
    await db.flush()
    reason = await _sync_utility_expense(db, ctx.tenant_id, util, unit)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPSERT", "unit_utilities", util.id,
                       new_data={"unit": _unit_label(unit), "jenis": util.kind.value, "status": util.status.value})
    if reason:
        await notify_roles(
            db, ctx.tenant_id, EXPENSE_APPROVERS, NotificationKind.EXPENSE_SUBMITTED,
            title=("Biaya utilitas diajukan" if reason == "baru" else "Nominal biaya utilitas diubah"),
            body=f"{_UTIL_LABEL[util.kind]} unit {_unit_label(unit)} — {_rp(util.cost)}",
            link="/finance/biaya-menunggu-bayar", actor_id=ctx.user_id,
        )
    await db.refresh(util)
    return util


@router.get("/utilities/summary", response_model=UtilitySummary)
async def utilities_summary(
    project_id: uuid.UUID = Query(...),
    only_incomplete: bool = Query(False),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Rekap kesiapan utilitas per unit dalam satu proyek — untuk tahu unit mana yang
    belum siap serah terima karena listrik/air belum masuk."""
    units = (await db.execute(
        select(Unit).where(Unit.project_id == project_id, Unit.tenant_id == ctx.tenant_id)
        .order_by(Unit.block, Unit.unit_number)
    )).scalars().all()
    if not units:
        return UtilitySummary(total_units=0, pln_terpasang=0, pdam_terpasang=0, ready=0,
                              total_cost=Decimal(0), rows=[])
    uids = [u.id for u in units]
    utils = (await db.execute(select(UnitUtility).where(
        UnitUtility.unit_id.in_(uids), UnitUtility.tenant_id == ctx.tenant_id))).scalars().all()
    by_unit: dict = {}
    total_cost = Decimal(0)
    for x in utils:
        by_unit.setdefault(x.unit_id, {})[x.kind] = x.status
        total_cost += Decimal(x.cost or 0)

    rows, pln_ok, pdam_ok, ready = [], 0, 0, 0
    for u in units:
        m = by_unit.get(u.id, {})
        pln = m.get(UtilityKind.PLN)
        pdam = m.get(UtilityKind.PDAM)
        is_ready = pln == UtilityStatus.TERPASANG and pdam == UtilityStatus.TERPASANG
        if pln == UtilityStatus.TERPASANG: pln_ok += 1
        if pdam == UtilityStatus.TERPASANG: pdam_ok += 1
        if is_ready: ready += 1
        if only_incomplete and is_ready:
            continue
        rows.append(UtilityUnitRow(
            unit_id=u.id, unit_label=_unit_label(u), unit_status=u.status.value,
            pln=pln, pdam=pdam, ready=is_ready,
        ))
    return UtilitySummary(total_units=len(units), pln_terpasang=pln_ok, pdam_terpasang=pdam_ok,
                          ready=ready, total_cost=total_cost, rows=rows)
