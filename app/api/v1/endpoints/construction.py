import math
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, Form, UploadFile, File
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.api.deps import get_current_context, AuthContext
from app.models.construction import UnitConstruction, ConstructionStage, ConstructionProgressLog
from app.models.property import Unit
from app.models.user import User
from app.models.expense import Expense, ExpenseCategory
from app.models.rab import RabTemplateLine, UnitRabAdjustment
from app.schemas.construction import (
    ConstructionUpsert, UnitConstructionRow, ConstructionSummary, ConstructionList, ProgressLogResponse,
    UpahResumeRow,
)

router = APIRouter()
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
LOGNOTDEL = ConstructionProgressLog.is_deleted == False  # noqa: E712


def _label(u: Unit):
    return "-".join(x for x in [u.block, u.unit_number] if x) or "?"


async def _get_or_create(db, tenant_id, project_id, unit_id) -> UnitConstruction:
    c = (await db.execute(
        select(UnitConstruction).where(UnitConstruction.unit_id == unit_id, UnitConstruction.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if c is None:
        c = UnitConstruction(tenant_id=tenant_id, project_id=project_id, unit_id=unit_id)
        db.add(c)
    return c


@router.get("/", response_model=ConstructionList)
async def list_construction(
    project_id: uuid.UUID = Query(...),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=500),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    base_conds = [Unit.project_id == project_id, Unit.tenant_id == ctx.tenant_id]

    # ── Ringkasan: SELURUH unit proyek, tak terpengaruh pencarian/paginasi di bawah ──
    all_units = (await db.execute(select(Unit).where(*base_conds))).scalars().all()
    cons = (await db.execute(
        select(UnitConstruction).where(UnitConstruction.project_id == project_id, UnitConstruction.tenant_id == ctx.tenant_id)
    )).scalars().all()
    cmap = {c.unit_id: c for c in cons}
    log_rows = (await db.execute(
        select(ConstructionProgressLog.unit_id, func.max(ConstructionProgressLog.log_date))
        .join(Unit, Unit.id == ConstructionProgressLog.unit_id)
        .where(Unit.project_id == project_id, ConstructionProgressLog.tenant_id == ctx.tenant_id, LOGNOTDEL)
        .group_by(ConstructionProgressLog.unit_id)
    )).all()
    last_log = {r[0]: r[1] for r in log_rows}

    stage_counts = defaultdict(int)
    total_pct = 0
    done = 0
    late = 0
    today_ = date.today()
    for u in all_units:
        c = cmap.get(u.id)
        stage = c.stage if c else ConstructionStage.PERSIAPAN
        pct = c.percent if c else 0
        stage_counts[stage.value] += 1
        total_pct += pct
        if stage == ConstructionStage.SELESAI or pct >= 100:
            done += 1
        ref = last_log.get(u.id) or (c.start_date if c else None)
        if stage != ConstructionStage.SELESAI and ref and (today_ - ref).days > 7:
            late += 1
    n = len(all_units)
    summary = ConstructionSummary(
        total_units=n, avg_percent=round(total_pct / n, 1) if n else 0.0,
        done_count=done, stage_counts=dict(stage_counts), late_count=late,
    )

    # ── Baris tabel: dicari (no. unit/blok) & dipaginasi ──
    row_conds = list(base_conds)
    if search:
        term = f"%{search}%"
        row_conds.append(or_(Unit.unit_number.ilike(term), Unit.block.ilike(term)))
    total = await db.scalar(select(func.count()).select_from(Unit).where(*row_conds))
    page_units = (await db.execute(
        select(Unit).where(*row_conds).order_by(Unit.block, Unit.unit_number)
        .offset((page - 1) * size).limit(size)
    )).scalars().all()

    rows = []
    for u in page_units:
        c = cmap.get(u.id)
        stage = c.stage if c else ConstructionStage.PERSIAPAN
        pct = c.percent if c else 0
        rows.append(UnitConstructionRow(
            unit_id=u.id, unit_label=_label(u), unit_type=u.unit_type,
            stage=stage, percent=pct,
            start_date=c.start_date if c else None, target_date=c.target_date if c else None,
            finish_date=c.finish_date if c else None, notes=c.notes if c else None,
            last_log_date=last_log.get(u.id),
        ))

    return ConstructionList(
        rows=rows, summary=summary,
        total=total or 0, page=page, size=size, pages=math.ceil((total or 0) / size) if size else 0,
    )


@router.put("/unit/{unit_id}", response_model=UnitConstructionRow)
async def upsert_construction(unit_id: uuid.UUID, payload: ConstructionUpsert, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    unit = (await db.execute(select(Unit).where(Unit.id == unit_id, Unit.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    c = await _get_or_create(db, ctx.tenant_id, unit.project_id, unit_id)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, f, v)
    await db.flush(); await db.refresh(c)
    return UnitConstructionRow(
        unit_id=unit_id, unit_label=_label(unit), unit_type=unit.unit_type,
        stage=c.stage, percent=c.percent, start_date=c.start_date, target_date=c.target_date,
        finish_date=c.finish_date, notes=c.notes,
    )


# ── Log Progres Mingguan (riwayat berfoto) ──
@router.get("/unit/{unit_id}/logs", response_model=list[ProgressLogResponse])
async def list_progress_logs(unit_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    logs = (await db.execute(
        select(ConstructionProgressLog).where(
            ConstructionProgressLog.unit_id == unit_id, ConstructionProgressLog.tenant_id == ctx.tenant_id, LOGNOTDEL
        ).order_by(ConstructionProgressLog.log_date.desc(), ConstructionProgressLog.created_at.desc())
    )).scalars().all()
    uids = list({l.uploaded_by_id for l in logs if l.uploaded_by_id})
    names = {}
    if uids:
        rows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(uids)))).all()
        names = {r[0]: r[1] for r in rows}
    return [
        ProgressLogResponse(
            id=l.id, unit_id=l.unit_id, log_date=l.log_date, stage=l.stage, percent=l.percent,
            notes=l.notes, uploaded_by_name=names.get(l.uploaded_by_id), has_photo=l.photo_key is not None,
            created_at=l.created_at,
        ) for l in logs
    ]


@router.post("/unit/{unit_id}/logs", response_model=ProgressLogResponse, status_code=status.HTTP_201_CREATED)
async def add_progress_log(
    unit_id: uuid.UUID,
    log_date: Optional[date] = Form(None),
    stage: Optional[ConstructionStage] = Form(None),
    percent: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Catat entri log progres mingguan (riwayat, tak menimpa) + sinkron status terkini unit (UnitConstruction)."""
    unit = (await db.execute(select(Unit).where(Unit.id == unit_id, Unit.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    if percent is not None and not (0 <= percent <= 100):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Persen harus 0-100")

    log = ConstructionProgressLog(
        tenant_id=ctx.tenant_id, unit_id=unit_id, log_date=log_date or date.today(),
        stage=stage, percent=percent, notes=notes, uploaded_by_id=ctx.user_id,
    )
    db.add(log); await db.flush()

    if file is not None:
        data = await file.read()
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
        log.photo_key = storage.build_key(ctx.tenant_id, "construction", log.id, file.filename)
        await storage.put(log.photo_key, data, file.content_type)
        log.photo_name = file.filename
        log.photo_type = file.content_type or "application/octet-stream"
        log.photo_size = len(data)

    # sinkron status terkini unit — supaya list_construction/Dashboard tak perlu berubah
    if stage is not None or percent is not None:
        c = await _get_or_create(db, ctx.tenant_id, unit.project_id, unit_id)
        if stage is not None:
            c.stage = stage
        if percent is not None:
            c.percent = percent

    await db.flush(); await db.refresh(log)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "construction_progress_logs", log.id,
                       new_data={"unit_id": str(unit_id), "log_date": str(log.log_date), "has_photo": file is not None})
    return ProgressLogResponse(
        id=log.id, unit_id=log.unit_id, log_date=log.log_date, stage=log.stage, percent=log.percent,
        notes=log.notes, uploaded_by_name=None, has_photo=log.photo_key is not None, created_at=log.created_at,
    )


@router.get("/logs/{log_id}/photo")
async def get_progress_photo(log_id: uuid.UUID, request: Request, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    meta = (await db.execute(
        select(ConstructionProgressLog.photo_size, ConstructionProgressLog.photo_type,
               ConstructionProgressLog.photo_name, ConstructionProgressLog.updated_at, ConstructionProgressLog.photo_key)
        .where(ConstructionProgressLog.id == log_id, ConstructionProgressLog.tenant_id == ctx.tenant_id, LOGNOTDEL)
    )).first()
    if meta is None or meta[4] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Foto tidak ditemukan")
    size, ctype, fname, updated, fkey = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = await storage.get(fkey)
    return cached_file_response(data, ctype, fname, etag)


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_progress_log(log_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    log = (await db.execute(
        select(ConstructionProgressLog).where(ConstructionProgressLog.id == log_id, ConstructionProgressLog.tenant_id == ctx.tenant_id, LOGNOTDEL)
    )).scalar_one_or_none()
    if log is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Log tidak ditemukan")
    log.is_deleted = True; log.deleted_at = datetime.utcnow()
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "construction_progress_logs", log_id)


# ═══════════════════════ RESUME UPAH per KAVLING (upah vs RAB tenaga kerja) ═══════════════════════
@router.get("/upah-resume", response_model=list[UpahResumeRow])
async def upah_resume(project_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Per kavling: realisasi upah (minggu berjalan + kumulatif akrual) vs RAB tenaga kerja (kategori upah).
    Selisih = upah_total − RAB (minus = di bawah anggaran = aman)."""
    t = ctx.tenant_id
    units = (await db.execute(select(Unit).where(Unit.project_id == project_id, Unit.tenant_id == t))).scalars().all()
    if not units:
        return []

    # RAB upah per unit = baris template (kategori upah) + penyesuaian (kategori upah)
    tpl_ids = {u.rab_template_id for u in units if u.rab_template_id}
    tpl_upah: dict = defaultdict(Decimal)
    if tpl_ids:
        lines = (await db.execute(
            select(RabTemplateLine).where(RabTemplateLine.template_id.in_(tpl_ids), RabTemplateLine.category == ExpenseCategory.UPAH)
        )).scalars().all()
        for ln in lines:
            tpl_upah[ln.template_id] += Decimal(ln.amount)
    adj_upah: dict = defaultdict(Decimal)
    adjs = (await db.execute(
        select(UnitRabAdjustment).where(
            UnitRabAdjustment.tenant_id == t, UnitRabAdjustment.category == ExpenseCategory.UPAH,
            UnitRabAdjustment.is_deleted == False)  # noqa: E712
    )).scalars().all()
    for a in adjs:
        adj_upah[a.unit_id] += Decimal(a.amount)

    # Realisasi upah per unit (akrual: semua opname upah, dibayar/diajukan) + bucket minggu berjalan
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Senin minggu ini
    rows = (await db.execute(
        select(
            Expense.unit_id,
            func.coalesce(func.sum(Expense.amount), 0),
            func.coalesce(func.sum(Expense.amount).filter(Expense.expense_date >= week_start), 0),
        ).where(
            Expense.tenant_id == t, Expense.project_id == project_id,
            Expense.category == ExpenseCategory.UPAH, Expense.is_deleted == False)  # noqa: E712
        .group_by(Expense.unit_id)
    )).all()
    real_total: dict = {}
    real_week: dict = {}
    for uid, tot, wk in rows:
        real_total[uid] = Decimal(tot); real_week[uid] = Decimal(wk)

    out = []
    for u in units:
        rab = tpl_upah.get(u.rab_template_id, Decimal(0)) + adj_upah.get(u.id, Decimal(0))
        total = real_total.get(u.id, Decimal(0))
        week = real_week.get(u.id, Decimal(0))
        if rab == 0 and total == 0:
            continue  # kavling tanpa RAB upah & tanpa realisasi → tak relevan
        selisih = total - rab
        out.append(UpahResumeRow(
            unit_id=u.id, unit_label=_label(u),
            upah_minggu=week, upah_total=total, rab_tenaga_kerja=rab,
            selisih=selisih, status=("lewat" if (rab > 0 and total > rab) else "aman"),
        ))
    out.sort(key=lambda r: r.unit_label)
    return out
