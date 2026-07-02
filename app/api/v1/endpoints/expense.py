import uuid
from datetime import datetime
from decimal import Decimal
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext
from app.models.expense import Expense
from app.models.stock import StockMovement, MovementType
from app.models.property import Unit
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse, CostRow, CostSummary

router = APIRouter()
NOTDEL = Expense.is_deleted == False  # noqa: E712


async def _get_expense(db, tenant_id, eid) -> Expense:
    e = (await db.execute(
        select(Expense).options(selectinload(Expense.vendor))
        .where(Expense.id == eid, Expense.tenant_id == tenant_id, NOTDEL)
    )).scalar_one_or_none()
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Biaya tidak ditemukan")
    return e


@router.get("/expenses", response_model=list[ExpenseResponse])
async def list_expenses(
    project_id: uuid.UUID = Query(...), unit_id: Optional[uuid.UUID] = Query(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    conds = [Expense.project_id == project_id, Expense.tenant_id == ctx.tenant_id, NOTDEL]
    if unit_id:
        conds.append(Expense.unit_id == unit_id)
    r = await db.execute(
        select(Expense).options(selectinload(Expense.vendor)).where(*conds)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
    )
    return r.scalars().all()


@router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(payload: ExpenseCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    e = Expense(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(e); await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "expenses", e.id,
                       new_data={"category": e.category.value, "amount": str(e.amount)})
    return await _get_expense(db, ctx.tenant_id, e.id)


@router.patch("/expenses/{eid}", response_model=ExpenseResponse)
async def update_expense(eid: uuid.UUID, payload: ExpenseUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    e = await _get_expense(db, ctx.tenant_id, eid)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(e, f, v)
    await db.flush()
    return await _get_expense(db, ctx.tenant_id, eid)


@router.delete("/expenses/{eid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(eid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    e = await _get_expense(db, ctx.tenant_id, eid)
    e.is_deleted = True; e.deleted_at = datetime.utcnow()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "expenses", eid,
                       old_data={"category": e.category.value, "amount": str(e.amount)})


@router.get("/cost-summary", response_model=CostSummary)
async def cost_summary(project_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Rollup biaya per unit & umum proyek: material (distribusi stok) + biaya (ledger)."""
    t = ctx.tenant_id
    material = defaultdict(Decimal); expense = defaultdict(Decimal)

    movs = (await db.execute(select(StockMovement).where(
        StockMovement.tenant_id == t, StockMovement.project_id == project_id,
        StockMovement.movement_type == MovementType.OUT, StockMovement.is_deleted == False))).scalars().all()  # noqa: E712
    for m in movs:
        material[m.unit_id] += Decimal(m.quantity) * Decimal(m.unit_price)

    exps = (await db.execute(select(Expense).where(
        Expense.tenant_id == t, Expense.project_id == project_id, NOTDEL))).scalars().all()
    for e in exps:
        expense[e.unit_id] += Decimal(e.amount)

    # label unit
    unit_ids = {k for k in list(material) + list(expense) if k is not None}
    labels = {}
    if unit_ids:
        us = (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()
        labels = {u.id: "-".join(x for x in [u.block, u.unit_number] if x) for u in us}

    rows = []
    for uid in sorted(unit_ids, key=lambda x: labels.get(x, "")):
        mat = material.get(uid, Decimal(0)); exp = expense.get(uid, Decimal(0))
        rows.append(CostRow(unit_id=uid, unit_label=labels.get(uid, "?"), material_cost=mat, expense_cost=exp, total=mat + exp))
    # umum (unit_id None)
    umum_mat = material.get(None, Decimal(0)); umum_exp = expense.get(None, Decimal(0))
    if umum_mat or umum_exp:
        rows.append(CostRow(unit_id=None, unit_label="Umum Proyek", material_cost=umum_mat, expense_cost=umum_exp, total=umum_mat + umum_exp))

    total_mat = sum(material.values(), Decimal(0)); total_exp = sum(expense.values(), Decimal(0))
    return CostSummary(project_id=project_id, rows=rows, total_material=total_mat, total_expense=total_exp, grand_total=total_mat + total_exp)
