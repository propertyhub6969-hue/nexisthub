import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext, require_role
from app.models.contractor import ContractorContract
from app.models.expense import Expense, ExpenseCategory
from app.models.property import Unit
from app.models.user import UserRole
from app.schemas.contractor import (
    ContractCreate, ContractUpdate, ContractResponse, OpnameCreate, OpnameResponse,
    PendingOpnameRow, MarkPaidRequest,
)

router = APIRouter()
CNOTDEL = ContractorContract.is_deleted == False  # noqa: E712
ENOTDEL = Expense.is_deleted == False  # noqa: E712


def _lbl(u: Unit):
    return "-".join(x for x in [u.block, u.unit_number] if x) or "?"


async def _paid_submitted(db, contract_id) -> tuple[Decimal, Decimal]:
    """(dibayar, diajukan) — Σ opname is_paid=True vs is_paid=False."""
    rows = (await db.execute(
        select(Expense.is_paid, func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.contract_id == contract_id, ENOTDEL).group_by(Expense.is_paid)
    )).all()
    paid = submitted = Decimal(0)
    for is_paid, total in rows:
        if is_paid:
            paid = Decimal(total)
        else:
            submitted = Decimal(total)
    return paid, submitted


async def _to_response(db, c: ContractorContract, unit: Unit) -> ContractResponse:
    paid, submitted = await _paid_submitted(db, c.id)
    total = Decimal(c.total_value or 0)
    return ContractResponse(
        id=c.id, project_id=c.project_id, unit_id=c.unit_id, unit_label=_lbl(unit),
        vendor_id=c.vendor_id, vendor_name=c.vendor_name, pengawas=c.pengawas,
        rab_category=c.rab_category or 'upah', title=c.title,
        total_value=total, paid=paid, submitted=submitted, remaining=total - paid - submitted,
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
    c = ContractorContract(tenant_id=ctx.tenant_id, project_id=unit.project_id, **payload.model_dump())
    db.add(c); await db.flush()
    c = await _load(db, ctx.tenant_id, c.id)
    return await _to_response(db, c, unit)


@router.patch("/contracts/{cid}", response_model=ContractResponse)
async def update_contract(cid: uuid.UUID, payload: ContractUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    c = await _load(db, ctx.tenant_id, cid)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, f, v)
    await db.flush()
    c = await _load(db, ctx.tenant_id, cid)
    unit = (await db.execute(select(Unit).where(Unit.id == c.unit_id))).scalar_one_or_none()
    return await _to_response(db, c, unit or Unit(block=None, unit_number="?"))


@router.delete("/contracts/{cid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contract(cid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    c = await _load(db, ctx.tenant_id, cid)
    c.is_deleted = True; c.deleted_at = datetime.utcnow()


# ── Opname mingguan (= Expense kategori kontraktor) ──
@router.get("/contracts/{cid}/opname", response_model=list[OpnameResponse])
async def list_opname(cid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    await _load(db, ctx.tenant_id, cid)
    r = await db.execute(
        select(Expense).where(Expense.contract_id == cid, Expense.tenant_id == ctx.tenant_id, ENOTDEL)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
    )
    return r.scalars().all()


@router.post("/contracts/{cid}/opname", response_model=ContractResponse, status_code=status.HTTP_201_CREATED)
async def add_opname(cid: uuid.UUID, payload: OpnameCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    c = await _load(db, ctx.tenant_id, cid)
    e = Expense(
        tenant_id=ctx.tenant_id, project_id=c.project_id, unit_id=c.unit_id, contract_id=c.id,
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


# ── Pengajuan pembayaran (opname belum dibayar) — level proyek ──
@router.get("/opname/pending", response_model=list[PendingOpnameRow])
async def pending_opname(project_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Semua opname DIAJUKAN (belum dibayar) di satu proyek — bahan Surat Pengajuan Pembayaran."""
    rows = (await db.execute(
        select(Expense, ContractorContract, Unit)
        .join(ContractorContract, ContractorContract.id == Expense.contract_id)
        .join(Unit, Unit.id == Expense.unit_id)
        .where(Expense.tenant_id == ctx.tenant_id, Expense.project_id == project_id,
               Expense.is_paid == False, ENOTDEL, CNOTDEL)  # noqa: E712
        .order_by(Unit.block, Unit.unit_number, Expense.expense_date)
    )).all()
    out = []
    for e, c, u in rows:
        out.append(PendingOpnameRow(
            id=e.id, unit_id=u.id, unit_label=_lbl(u),
            contractor_name=c.vendor_name or c.contractor_name, title=c.title,
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
    if rows:
        await record_audit(db, ctx.tenant_id, ctx.user_id, "PAY", "contractor_opname", None,
                           new_data={"count": len(rows), "paid_date": str(pd), "ids": [str(e.id) for e in rows]})
    return {"marked": len(rows), "paid_date": str(pd)}
