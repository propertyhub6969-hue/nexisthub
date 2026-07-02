import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.construction import UnitConstruction, ConstructionStage
from app.models.property import Unit
from app.schemas.construction import (
    ConstructionUpsert, UnitConstructionRow, ConstructionSummary, ConstructionList,
)

router = APIRouter()


def _label(u: Unit):
    return "-".join(x for x in [u.block, u.unit_number] if x) or "?"


@router.get("/", response_model=ConstructionList)
async def list_construction(project_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    units = (await db.execute(
        select(Unit).where(Unit.project_id == project_id, Unit.tenant_id == ctx.tenant_id)
        .order_by(Unit.block, Unit.unit_number)
    )).scalars().all()
    cons = (await db.execute(
        select(UnitConstruction).where(UnitConstruction.project_id == project_id, UnitConstruction.tenant_id == ctx.tenant_id)
    )).scalars().all()
    cmap = {c.unit_id: c for c in cons}

    rows = []
    stage_counts = defaultdict(int)
    total_pct = 0
    done = 0
    for u in units:
        c = cmap.get(u.id)
        stage = c.stage if c else ConstructionStage.PERSIAPAN
        pct = c.percent if c else 0
        stage_counts[stage.value] += 1
        total_pct += pct
        if stage == ConstructionStage.SELESAI or pct >= 100:
            done += 1
        rows.append(UnitConstructionRow(
            unit_id=u.id, unit_label=_label(u), unit_type=u.unit_type,
            stage=stage, percent=pct,
            start_date=c.start_date if c else None, target_date=c.target_date if c else None,
            finish_date=c.finish_date if c else None, notes=c.notes if c else None,
        ))
    n = len(units)
    summary = ConstructionSummary(
        total_units=n, avg_percent=round(total_pct / n, 1) if n else 0.0,
        done_count=done, stage_counts=dict(stage_counts),
    )
    return ConstructionList(rows=rows, summary=summary)


@router.put("/unit/{unit_id}", response_model=UnitConstructionRow)
async def upsert_construction(unit_id: uuid.UUID, payload: ConstructionUpsert, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    unit = (await db.execute(select(Unit).where(Unit.id == unit_id, Unit.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    c = (await db.execute(select(UnitConstruction).where(UnitConstruction.unit_id == unit_id, UnitConstruction.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if c is None:
        c = UnitConstruction(tenant_id=ctx.tenant_id, project_id=unit.project_id, unit_id=unit_id)
        db.add(c)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, f, v)
    await db.flush(); await db.refresh(c)
    return UnitConstructionRow(
        unit_id=unit_id, unit_label=_label(unit), unit_type=unit.unit_type,
        stage=c.stage, percent=c.percent, start_date=c.start_date, target_date=c.target_date,
        finish_date=c.finish_date, notes=c.notes,
    )
