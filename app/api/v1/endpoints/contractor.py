import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.core.cashbook import sync_expense_cashbook
from app.api.deps import get_current_context, AuthContext, require_role
from app.models.contractor import ContractorContract, ContractWorkItem, WorkStageTemplate, WorkStageTemplateLine
from app.models.expense import Expense, ExpenseCategory
from app.models.property import Unit
from app.models.user import UserRole
from app.schemas.contractor import (
    ContractCreate, ContractUpdate, ContractResponse, OpnameCreate, OpnameResponse,
    PendingOpnameRow, MarkPaidRequest, WorkItemBreakdown,
    StageTemplateCreate, StageTemplateUpdate, StageTemplateResponse, StageTemplateLineOut,
)

router = APIRouter()
CNOTDEL = ContractorContract.is_deleted == False  # noqa: E712
ENOTDEL = Expense.is_deleted == False  # noqa: E712


def _lbl(u: Unit):
    return "-".join(x for x in [u.block, u.unit_number] if x) or "?"


async def _sync_items(db, tenant_id, contract: ContractorContract, items) -> None:
    """Replace-all bagian pekerjaan kontrak (pola sama RabTemplateLine). Bila items non-kosong,
    total_value kontrak diset = Σ nilai bagian. items=None → tak diubah (biarkan total manual)."""
    if items is None:
        return
    await db.execute(sa_delete(ContractWorkItem).where(ContractWorkItem.contract_id == contract.id))
    for i, it in enumerate(items):
        db.add(ContractWorkItem(tenant_id=tenant_id, contract_id=contract.id, name=it.name, value=it.value, position=i))
    if items:
        contract.total_value = sum((Decimal(it.value or 0) for it in items), Decimal(0))
    await db.flush()


async def _to_response(db, c: ContractorContract, unit: Unit) -> ContractResponse:
    # Opname per (bagian, status bayar) — 1 query
    rows = (await db.execute(
        select(Expense.work_item_id, Expense.is_paid, func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.contract_id == c.id, ENOTDEL).group_by(Expense.work_item_id, Expense.is_paid)
    )).all()
    paid_by_item: dict = {}
    sub_by_item: dict = {}
    paid = submitted = Decimal(0)
    un_paid = un_sub = Decimal(0)
    for wid, is_paid, total in rows:
        total = Decimal(total)
        if is_paid:
            paid += total
            if wid is None: un_paid += total
            else: paid_by_item[wid] = paid_by_item.get(wid, Decimal(0)) + total
        else:
            submitted += total
            if wid is None: un_sub += total
            else: sub_by_item[wid] = sub_by_item.get(wid, Decimal(0)) + total

    witems = (await db.execute(
        select(ContractWorkItem).where(ContractWorkItem.contract_id == c.id).order_by(ContractWorkItem.position)
    )).scalars().all()
    breakdown = []
    for w in witems:
        wp = paid_by_item.get(w.id, Decimal(0)); ws = sub_by_item.get(w.id, Decimal(0))
        breakdown.append(WorkItemBreakdown(
            id=w.id, name=w.name, value=Decimal(w.value or 0),
            paid=wp, submitted=ws, remaining=Decimal(w.value or 0) - wp - ws,
        ))

    total = Decimal(c.total_value or 0)
    return ContractResponse(
        id=c.id, project_id=c.project_id, unit_id=c.unit_id, unit_label=_lbl(unit),
        vendor_id=c.vendor_id, vendor_name=c.vendor_name, pengawas=c.pengawas,
        rab_category=c.rab_category or 'upah', title=c.title,
        total_value=total, paid=paid, submitted=submitted, remaining=total - paid - submitted,
        items=breakdown, unassigned_paid=un_paid, unassigned_submitted=un_sub,
        notes=c.notes, created_at=c.created_at, updated_at=c.updated_at,
    )


async def _load(db, tenant_id, cid) -> ContractorContract:
    c = (await db.execute(
        select(ContractorContract).options(selectinload(ContractorContract.vendor))
        .where(ContractorContract.id == cid, ContractorContract.tenant_id == tenant_id, CNOTDEL)
    )).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Kontrak borongan tidak ditemukan")
    return c


@router.get("/contracts", response_model=list[ContractResponse])
async def list_contracts(
    project_id: Optional[uuid.UUID] = Query(None), unit_id: Optional[uuid.UUID] = Query(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    conds = [ContractorContract.tenant_id == ctx.tenant_id, CNOTDEL]
    if project_id:
        conds.append(ContractorContract.project_id == project_id)
    if unit_id:
        conds.append(ContractorContract.unit_id == unit_id)
    r = await db.execute(select(ContractorContract).options(selectinload(ContractorContract.vendor)).where(*conds).order_by(ContractorContract.created_at.desc()))
    contracts = r.scalars().all()
    uids = {c.unit_id for c in contracts}
    units = {}
    if uids:
        us = (await db.execute(select(Unit).where(Unit.id.in_(uids)))).scalars().all()
        units = {u.id: u for u in us}
    out = []
    for c in contracts:
        u = units.get(c.unit_id)
        out.append(await _to_response(db, c, u) if u else await _to_response(db, c, Unit(block=None, unit_number="?")))
    return out


@router.post("/contracts", response_model=ContractResponse, status_code=status.HTTP_201_CREATED)
async def create_contract(payload: ContractCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    unit = (await db.execute(select(Unit).where(Unit.id == payload.unit_id, Unit.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    c = ContractorContract(tenant_id=ctx.tenant_id, project_id=unit.project_id, **payload.model_dump(exclude={"items"}))
    db.add(c); await db.flush()
    await _sync_items(db, ctx.tenant_id, c, payload.items)
    c = await _load(db, ctx.tenant_id, c.id)
    return await _to_response(db, c, unit)


@router.patch("/contracts/{cid}", response_model=ContractResponse)
async def update_contract(cid: uuid.UUID, payload: ContractUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    c = await _load(db, ctx.tenant_id, cid)
    for f, v in payload.model_dump(exclude_unset=True, exclude={"items"}).items():
        setattr(c, f, v)
    await db.flush()
    await _sync_items(db, ctx.tenant_id, c, payload.items)  # None → tak diubah
    c = await _load(db, ctx.tenant_id, cid)
    unit = (await db.execute(select(Unit).where(Unit.id == c.unit_id))).scalar_one_or_none()
    return await _to_response(db, c, unit or Unit(block=None, unit_number="?"))


@router.delete("/contracts/{cid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contract(cid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Hapus kontrak borongan — ikut hapus semua opname-nya (kalau tidak, opname jadi anak yatim:
    tetap terhitung di resume upah/RAB meski kontraknya sendiri sudah hilang dari daftar)."""
    c = await _load(db, ctx.tenant_id, cid)
    c.is_deleted = True; c.deleted_at = datetime.utcnow()
    opnames = (await db.execute(select(Expense).where(Expense.contract_id == cid, ENOTDEL))).scalars().all()
    now = datetime.utcnow()
    for e in opnames:
        e.is_deleted = True; e.deleted_at = now
    await db.flush()
    for e in opnames:
        await sync_expense_cashbook(db, ctx.tenant_id, e)
    if opnames:
        await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "contractor_opname", None,
                           old_data={"contract_id": str(cid), "count": len(opnames)})


# ── Opname mingguan (= Expense kategori kontraktor) ──
@router.get("/contracts/{cid}/opname", response_model=list[OpnameResponse])
async def list_opname(cid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    await _load(db, ctx.tenant_id, cid)
    rows = (await db.execute(
        select(Expense, ContractWorkItem.name)
        .outerjoin(ContractWorkItem, ContractWorkItem.id == Expense.work_item_id)
        .where(Expense.contract_id == cid, Expense.tenant_id == ctx.tenant_id, ENOTDEL)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
    )).all()
    return [
        OpnameResponse(
            id=e.id, amount=e.amount, expense_date=e.expense_date, description=e.description,
            is_paid=e.is_paid, paid_at=e.paid_at, work_item_id=e.work_item_id, work_item_name=wname,
        ) for e, wname in rows
    ]


@router.post("/contracts/{cid}/opname", response_model=ContractResponse, status_code=status.HTTP_201_CREATED)
async def add_opname(cid: uuid.UUID, payload: OpnameCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    c = await _load(db, ctx.tenant_id, cid)
    if payload.work_item_id is not None:  # bagian harus milik kontrak ini
        ok = (await db.execute(select(ContractWorkItem.id).where(
            ContractWorkItem.id == payload.work_item_id, ContractWorkItem.contract_id == cid
        ))).scalar_one_or_none()
        if ok is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Bagian pekerjaan tidak ditemukan di kontrak ini")
    e = Expense(
        tenant_id=ctx.tenant_id, project_id=c.project_id, unit_id=c.unit_id, contract_id=c.id,
        work_item_id=payload.work_item_id,
        # kategori RAB opname ikut pilihan kontrak (upah=tukang, kontraktor=borongan pihak ketiga)
        category=ExpenseCategory(c.rab_category or "upah"), description=payload.description or "Opname borongan",
        # is_paid=False → opname baru = DIAJUKAN (menunggu dibayar keuangan). Biaya tetap accrual (dihitung saat opname).
        amount=payload.amount, expense_date=payload.expense_date, is_paid=False, paid_at=None,
    )
    db.add(e); await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "contractor_opname", e.id,
                       new_data={"contract": str(cid), "amount": str(payload.amount)})
    unit = (await db.execute(select(Unit).where(Unit.id == c.unit_id))).scalar_one_or_none()
    return await _to_response(db, c, unit or Unit(block=None, unit_number="?"))


@router.delete("/opname/{eid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opname(eid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    e = (await db.execute(select(Expense).where(Expense.id == eid, Expense.tenant_id == ctx.tenant_id, ENOTDEL))).scalar_one_or_none()
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Opname tidak ditemukan")
    e.is_deleted = True; e.deleted_at = datetime.utcnow()
    await db.flush()
    await sync_expense_cashbook(db, ctx.tenant_id, e)


# ── Pengajuan pembayaran (opname belum dibayar) — level proyek ──
@router.get("/opname/pending", response_model=list[PendingOpnameRow])
async def pending_opname(project_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Semua opname DIAJUKAN (belum dibayar) di satu proyek — bahan Surat Pengajuan Pembayaran."""
    rows = (await db.execute(
        select(Expense, ContractorContract, Unit, ContractWorkItem.name)
        .join(ContractorContract, ContractorContract.id == Expense.contract_id)
        .join(Unit, Unit.id == Expense.unit_id)
        .outerjoin(ContractWorkItem, ContractWorkItem.id == Expense.work_item_id)
        .where(Expense.tenant_id == ctx.tenant_id, Expense.project_id == project_id,
               Expense.is_paid == False, ENOTDEL, CNOTDEL)  # noqa: E712
        .order_by(Unit.block, Unit.unit_number, Expense.expense_date)
    )).all()
    out = []
    for e, c, u, wname in rows:
        out.append(PendingOpnameRow(
            id=e.id, unit_id=u.id, unit_label=_lbl(u),
            contractor_name=c.vendor_name or c.contractor_name, title=c.title, work_item_name=wname,
            expense_date=e.expense_date, description=e.description, amount=Decimal(e.amount or 0),
        ))
    return out


@router.post("/opname/mark-paid")
async def mark_opname_paid(
    payload: MarkPaidRequest,
    _user=Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Tandai sekelompok opname sebagai DIBAYAR (setelah keuangan realisasikan). Owner/admin/manager saja."""
    pd = payload.paid_date or date.today()
    rows = (await db.execute(
        select(Expense).where(
            Expense.id.in_(payload.ids), Expense.tenant_id == ctx.tenant_id,
            Expense.is_paid == False, ENOTDEL)  # noqa: E712
    )).scalars().all()
    for e in rows:
        e.is_paid = True
        e.paid_at = pd
    await db.flush()
    for e in rows:
        await sync_expense_cashbook(db, ctx.tenant_id, e)
    if rows:
        await record_audit(db, ctx.tenant_id, ctx.user_id, "PAY", "contractor_opname", None,
                           new_data={"count": len(rows), "paid_date": str(pd), "ids": [str(e.id) for e in rows]})
    return {"marked": len(rows), "paid_date": str(pd)}


# ═══════════════════════ TEMPLATE TAHAPAN BORONGAN (reusable, %+Rp) ═══════════════════════
WSTNOTDEL = WorkStageTemplate.is_deleted == False  # noqa: E712


def _tpl_to_response(t: WorkStageTemplate) -> StageTemplateResponse:
    lines = sorted(t.lines, key=lambda l: l.position)
    return StageTemplateResponse(
        id=t.id, name=t.name, mode=t.mode or "rp",
        lines=[StageTemplateLineOut(id=l.id, name=l.name, value=Decimal(l.value or 0)) for l in lines],
        total=sum((Decimal(l.value or 0) for l in lines), Decimal(0)),
    )


async def _load_tpl(db, tenant_id, tid) -> WorkStageTemplate:
    t = (await db.execute(
        select(WorkStageTemplate).options(selectinload(WorkStageTemplate.lines))
        .where(WorkStageTemplate.id == tid, WorkStageTemplate.tenant_id == tenant_id, WSTNOTDEL)
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template tahapan tidak ditemukan")
    return t


@router.get("/stage-templates", response_model=list[StageTemplateResponse])
async def list_stage_templates(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(WorkStageTemplate).options(selectinload(WorkStageTemplate.lines))
        .where(WorkStageTemplate.tenant_id == ctx.tenant_id, WSTNOTDEL).order_by(WorkStageTemplate.name)
    )
    return [_tpl_to_response(t) for t in r.scalars().all()]


@router.post("/stage-templates", response_model=StageTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_stage_template(payload: StageTemplateCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = WorkStageTemplate(tenant_id=ctx.tenant_id, name=payload.name, mode=payload.mode)
    for i, ln in enumerate(payload.lines):
        t.lines.append(WorkStageTemplateLine(tenant_id=ctx.tenant_id, name=ln.name, value=ln.value, position=i))
    db.add(t); await db.flush()
    return _tpl_to_response(await _load_tpl(db, ctx.tenant_id, t.id))


@router.patch("/stage-templates/{tid}", response_model=StageTemplateResponse)
async def update_stage_template(tid: uuid.UUID, payload: StageTemplateUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = await _load_tpl(db, ctx.tenant_id, tid)
    data = payload.model_dump(exclude_unset=True, exclude={"lines"})
    for f, v in data.items():
        setattr(t, f, v)
    if payload.lines is not None:
        await db.execute(sa_delete(WorkStageTemplateLine).where(WorkStageTemplateLine.template_id == tid))
        t.lines = []
        for i, ln in enumerate(payload.lines):
            t.lines.append(WorkStageTemplateLine(tenant_id=ctx.tenant_id, name=ln.name, value=ln.value, position=i))
    await db.flush()
    return _tpl_to_response(await _load_tpl(db, ctx.tenant_id, tid))


@router.delete("/stage-templates/{tid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stage_template(tid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = await _load_tpl(db, ctx.tenant_id, tid)
    t.is_deleted = True; t.deleted_at = datetime.utcnow()
