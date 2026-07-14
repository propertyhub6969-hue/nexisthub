import uuid
from datetime import datetime
from decimal import Decimal
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.rab import RabTemplate, RabTemplateLine, UnitRabAdjustment
from app.models.expense import Expense
from app.models.stock import StockMovement, MovementType, MovementSource
from app.models.property import Unit
from app.schemas.rab import (
    RabTemplateCreate, RabTemplateUpdate, RabTemplateResponse,
    AdjustmentIn, AdjustmentResponse, SetTemplate, CatAmount, UnitRabResponse,
    LeakageRow, LeakageCat, LeakageDetail,
)

router = APIRouter()
TNOTDEL = RabTemplate.is_deleted == False  # noqa: E712
ANOTDEL = UnitRabAdjustment.is_deleted == False  # noqa: E712


def _tpl_total(t: RabTemplate):
    t.total = sum((Decimal(l.amount) for l in t.lines), Decimal(0))


async def _load_tpl(db, tenant_id, tid) -> RabTemplate:
    t = (await db.execute(
        select(RabTemplate).options(selectinload(RabTemplate.lines))
        .where(RabTemplate.id == tid, RabTemplate.tenant_id == tenant_id, TNOTDEL)
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template RAB tidak ditemukan")
    _tpl_total(t)
    return t


# ═══════════════════════ TEMPLATES ═══════════════════════
@router.get("/rab-templates", response_model=list[RabTemplateResponse])
async def list_templates(project_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(RabTemplate).options(selectinload(RabTemplate.lines))
        .where(RabTemplate.project_id == project_id, RabTemplate.tenant_id == ctx.tenant_id, TNOTDEL)
        .order_by(RabTemplate.name)
    )
    tpls = r.scalars().all()
    for t in tpls:
        _tpl_total(t)
    return tpls


@router.post("/rab-templates", response_model=RabTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(payload: RabTemplateCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = RabTemplate(tenant_id=ctx.tenant_id, project_id=payload.project_id, name=payload.name, notes=payload.notes)
    for ln in payload.lines:
        t.lines.append(RabTemplateLine(tenant_id=ctx.tenant_id, category=ln.category, amount=ln.amount))
    db.add(t); await db.flush()
    return await _load_tpl(db, ctx.tenant_id, t.id)


@router.patch("/rab-templates/{tid}", response_model=RabTemplateResponse)
async def update_template(tid: uuid.UUID, payload: RabTemplateUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = await _load_tpl(db, ctx.tenant_id, tid)
    data = payload.model_dump(exclude_unset=True, exclude={"lines"})
    for f, v in data.items():
        setattr(t, f, v)
    if payload.lines is not None:
        await db.execute(sa_delete(RabTemplateLine).where(RabTemplateLine.template_id == tid))
        t.lines = []
        for ln in payload.lines:
            t.lines.append(RabTemplateLine(tenant_id=ctx.tenant_id, category=ln.category, amount=ln.amount))
    await db.flush()
    return await _load_tpl(db, ctx.tenant_id, tid)


@router.delete("/rab-templates/{tid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(tid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = await _load_tpl(db, ctx.tenant_id, tid)
    t.is_deleted = True; t.deleted_at = datetime.utcnow()


# ═══════════════════════ UNIT RAB ═══════════════════════
async def _get_unit(db, tenant_id, unit_id) -> Unit:
    u = (await db.execute(select(Unit).where(Unit.id == unit_id, Unit.tenant_id == tenant_id))).scalar_one_or_none()
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    return u


async def _effective_map(db, tenant_id, unit: Unit):
    """RAB efektif unit per kategori = baris template + penyesuaian."""
    eff = defaultdict(Decimal)
    if unit.rab_template_id:
        lines = (await db.execute(select(RabTemplateLine).where(RabTemplateLine.template_id == unit.rab_template_id))).scalars().all()
        for ln in lines:
            eff[ln.category.value] += Decimal(ln.amount)
    adjs = (await db.execute(select(UnitRabAdjustment).where(UnitRabAdjustment.unit_id == unit.id, ANOTDEL))).scalars().all()
    for a in adjs:
        eff[a.category.value] += Decimal(a.amount)
    return eff, adjs


@router.get("/units/{unit_id}/rab", response_model=UnitRabResponse)
async def get_unit_rab(unit_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    eff, adjs = await _effective_map(db, ctx.tenant_id, unit)
    tname = None
    if unit.rab_template_id:
        t = (await db.execute(select(RabTemplate).where(RabTemplate.id == unit.rab_template_id))).scalar_one_or_none()
        tname = t.name if t else None
    return UnitRabResponse(
        unit_id=unit_id, rab_template_id=unit.rab_template_id, template_name=tname,
        effective=[CatAmount(category=k, amount=v) for k, v in eff.items()],
        effective_total=sum(eff.values(), Decimal(0)),
        adjustments=adjs,
    )


@router.patch("/units/{unit_id}/rab", response_model=UnitRabResponse)
async def set_unit_template(unit_id: uuid.UUID, payload: SetTemplate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    unit.rab_template_id = payload.rab_template_id
    await db.flush()
    return await get_unit_rab(unit_id, ctx, db)


@router.post("/units/{unit_id}/rab/adjustments", response_model=AdjustmentResponse, status_code=status.HTTP_201_CREATED)
async def add_adjustment(unit_id: uuid.UUID, payload: AdjustmentIn, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    await _get_unit(db, ctx.tenant_id, unit_id)
    a = UnitRabAdjustment(tenant_id=ctx.tenant_id, unit_id=unit_id, **payload.model_dump())
    db.add(a); await db.flush(); await db.refresh(a)
    return a


@router.delete("/rab-adjustments/{aid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_adjustment(aid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    a = (await db.execute(select(UnitRabAdjustment).where(UnitRabAdjustment.id == aid, UnitRabAdjustment.tenant_id == ctx.tenant_id, ANOTDEL))).scalar_one_or_none()
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Penyesuaian tidak ditemukan")
    a.is_deleted = True; a.deleted_at = datetime.utcnow()


# ═══════════════════════ KEBOCORAN ═══════════════════════
async def _realisasi_map(db, tenant_id, project_id):
    """dict[unit_id or None][category] = Decimal realisasi (material stok + expenses)."""
    res = defaultdict(lambda: defaultdict(Decimal))
    movs = (await db.execute(select(StockMovement).where(
        StockMovement.tenant_id == tenant_id, StockMovement.project_id == project_id,
        StockMovement.is_deleted == False))).scalars().all()  # noqa: E712
    # BUKAN biaya: retur ke vendor (koreksi stok) & transfer keluar (cuma pindah lokasi, belum dipakai)
    NOT_A_COST = (MovementSource.RETURN_VENDOR, MovementSource.TRANSFER_OUT)
    for m in movs:
        if m.movement_type == MovementType.OUT and m.source not in NOT_A_COST:
            res[m.unit_id]["material"] += Decimal(m.quantity) * Decimal(m.unit_price)
        elif m.movement_type == MovementType.IN and m.source == MovementSource.RETURN_UNIT:
            # retur dari unit balik ke gudang -> kurangkan biaya material unit asal retur
            res[m.unit_id]["material"] -= Decimal(m.quantity) * Decimal(m.unit_price)
    exps = (await db.execute(select(Expense).where(
        Expense.tenant_id == tenant_id, Expense.project_id == project_id, Expense.is_deleted == False))).scalars().all()  # noqa: E712
    for e in exps:
        res[e.unit_id][e.category.value] += Decimal(e.amount)
    return res


@router.get("/leakage", response_model=list[LeakageRow])
async def leakage(project_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = ctx.tenant_id
    units = (await db.execute(select(Unit).where(Unit.project_id == project_id, Unit.tenant_id == t))).scalars().all()
    # template lines map
    tpls = (await db.execute(select(RabTemplate).options(selectinload(RabTemplate.lines)).where(RabTemplate.project_id == project_id, RabTemplate.tenant_id == t, TNOTDEL))).scalars().all()
    tpl_total = {tp.id: sum((Decimal(l.amount) for l in tp.lines), Decimal(0)) for tp in tpls}
    adjs = (await db.execute(select(UnitRabAdjustment).where(UnitRabAdjustment.tenant_id == t, ANOTDEL))).scalars().all()
    adj_by_unit = defaultdict(Decimal)
    for a in adjs:
        adj_by_unit[a.unit_id] += Decimal(a.amount)
    real = await _realisasi_map(db, t, project_id)

    rows = []
    for u in sorted(units, key=lambda x: "-".join(y for y in [x.block, x.unit_number] if y)):
        rab = tpl_total.get(u.rab_template_id, Decimal(0)) + adj_by_unit.get(u.id, Decimal(0))
        realz = sum(real.get(u.id, {}).values(), Decimal(0))
        if rab == 0 and realz == 0:
            continue
        rows.append(LeakageRow(
            unit_id=u.id, unit_label="-".join(y for y in [u.block, u.unit_number] if y) or "?",
            rab_total=rab, realisasi_total=realz, selisih=rab - realz,
        ))
    return rows


@router.get("/leakage/{unit_id}", response_model=LeakageDetail)
async def leakage_detail(unit_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    unit = await _get_unit(db, ctx.tenant_id, unit_id)
    eff, _ = await _effective_map(db, ctx.tenant_id, unit)
    real = await _realisasi_map(db, ctx.tenant_id, unit.project_id)
    runit = real.get(unit_id, {})
    cats = sorted(set(list(eff.keys()) + list(runit.keys())))
    rows = []
    for c in cats:
        rb = eff.get(c, Decimal(0)); rz = runit.get(c, Decimal(0))
        rows.append(LeakageCat(category=c, rab=rb, realisasi=rz, selisih=rb - rz))
    rab_total = sum(eff.values(), Decimal(0)); real_total = sum(runit.values(), Decimal(0))
    return LeakageDetail(
        unit_id=unit_id, unit_label="-".join(y for y in [unit.block, unit.unit_number] if y) or "?",
        rows=rows, rab_total=rab_total, realisasi_total=real_total, selisih=rab_total - real_total,
    )
