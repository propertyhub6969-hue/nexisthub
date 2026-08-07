import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.core.audit import record_audit
from app.core.cashbook import sync_expense_cashbook
from app.core.notify import notify_roles
from app.models.cashbook import AccountCategory, CashBookEntry, CashDirection
from app.models.expense import Expense
from app.models.marketing import Client
from app.models.notification import NotificationKind
from app.models.property import Project, Unit, UnitUtility
from app.models.user import UserRole
from app.schemas.marketing import Paginated
from app.schemas.cashbook import (
    CategoryResponse, CashBookEntryResponse, CashBookSummary, CashBookCategoryTotal, CashBookMonth,
    PendingExpenseRow, PendingExpenseList, MarkExpensePaidRequest,
)

router = APIRouter()


def _paginate(items, total, page, size):
    import math
    return {"items": items, "total": total, "page": page, "size": size, "pages": math.ceil(total / size) if size else 0}


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Peta akun (Fase B1 — daftar pendek). Kategori bawaan sistem (code terisi) di-seed otomatis per tenant."""
    r = await db.execute(
        select(AccountCategory).where(AccountCategory.tenant_id == ctx.tenant_id, AccountCategory.is_deleted == False)  # noqa: E712
        .order_by(AccountCategory.direction, AccountCategory.name)
    )
    return r.scalars().all()


@router.get("/entries", response_model=Paginated[CashBookEntryResponse])
async def list_entries(
    direction: Optional[CashDirection] = Query(None),
    category_id: Optional[uuid.UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Daftar baris Buku Kas (otomatis dari pembayaran disetujui & biaya dibayar), terbaru dulu."""
    conds = [CashBookEntry.tenant_id == ctx.tenant_id]
    if direction:
        conds.append(CashBookEntry.direction == direction)
    if category_id:
        conds.append(CashBookEntry.category_id == category_id)
    if date_from:
        conds.append(CashBookEntry.date >= date_from)
    if date_to:
        conds.append(CashBookEntry.date <= date_to)

    total = await db.scalar(select(func.count()).select_from(CashBookEntry).where(*conds))
    rows = (await db.execute(
        select(CashBookEntry, Client.full_name, Project.name)
        .select_from(CashBookEntry)
        .options(selectinload(CashBookEntry.category))
        .outerjoin(Client, Client.id == CashBookEntry.client_id)
        .outerjoin(Project, Project.id == CashBookEntry.project_id)
        .where(*conds)
        .order_by(CashBookEntry.date.desc(), CashBookEntry.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )).all()

    items = []
    for entry, client_name, project_name in rows:
        item = CashBookEntryResponse.model_validate(entry).model_copy(update={
            "client_name": client_name, "project_name": project_name,
        })
        items.append(item)
    return _paginate(items, total or 0, page, size)


@router.get("/summary", response_model=CashBookSummary)
async def cashbook_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Rekap Buku Kas: total masuk/keluar, per kategori, tren bulanan (maks 12 bulan terakhir ada transaksi)."""
    t = ctx.tenant_id
    conds = [CashBookEntry.tenant_id == t]
    if date_from:
        conds.append(CashBookEntry.date >= date_from)
    if date_to:
        conds.append(CashBookEntry.date <= date_to)

    total_in = Decimal(await db.scalar(
        select(func.coalesce(func.sum(CashBookEntry.amount), 0)).where(*conds, CashBookEntry.direction == CashDirection.IN)
    ))
    total_out = Decimal(await db.scalar(
        select(func.coalesce(func.sum(CashBookEntry.amount), 0)).where(*conds, CashBookEntry.direction == CashDirection.OUT)
    ))

    cat_rows = (await db.execute(
        select(CashBookEntry.category_id, AccountCategory.name, CashBookEntry.direction,
               func.coalesce(func.sum(CashBookEntry.amount), 0))
        .select_from(CashBookEntry)
        .outerjoin(AccountCategory, AccountCategory.id == CashBookEntry.category_id)
        .where(*conds)
        .group_by(CashBookEntry.category_id, AccountCategory.name, CashBookEntry.direction)
    )).all()
    by_category = [
        CashBookCategoryTotal(category_id=cid, category_name=name or "Belum dikategorikan", direction=direction, total=Decimal(total))
        for cid, name, direction, total in cat_rows
    ]
    by_category.sort(key=lambda r: (r.direction.value, -r.total))

    ym = func.to_char(CashBookEntry.date, "YYYY-MM")
    month_rows = (await db.execute(
        select(
            ym.label("ym"),
            func.coalesce(func.sum(CashBookEntry.amount).filter(CashBookEntry.direction == CashDirection.IN), 0),
            func.coalesce(func.sum(CashBookEntry.amount).filter(CashBookEntry.direction == CashDirection.OUT), 0),
        )
        .select_from(CashBookEntry)
        .where(*conds)
        .group_by(ym).order_by(ym)
    )).all()
    months = [CashBookMonth(month=m, total_in=Decimal(i), total_out=Decimal(o)) for m, i, o in month_rows][-12:]

    return CashBookSummary(
        total_in=total_in, total_out=total_out, saldo=total_in - total_out,
        by_category=by_category, months=months,
    )


# ═══════════════ BIAYA MENUNGGU BAYAR (pengeluaran diajukan) ═══════════════
# Pengeluaran lahir berstatus DIAJUKAN (is_paid=False) dan BELUM masuk Buku Kas —
# lihat sync_expense_cashbook. Keuangan yang menandainya lunas beserta tanggal bayar
# sebenarnya (di lapangan tanggal bayar sering beda dari tanggal pasang/opname).
# Cakupan saat ini: biaya utilitas & opname borongan. Sengaja dinamai umum supaya
# bisa diperluas ke seluruh jenis biaya tanpa mengganti nama menu.

_EXP_LABEL = {
    "material": "Material", "upah": "Upah", "kontraktor": "Kontraktor",
    "kelistrikan": "Kelistrikan", "air_pdam": "Air / PDAM",
    "operasional": "Operasional", "perizinan": "Perizinan", "lain": "Lain-lain",
}


def _unit_label(u) -> Optional[str]:
    if u is None:
        return None
    return f"{u.block}-{u.unit_number}" if u.block else u.unit_number


@router.get("/pending-expenses", response_model=PendingExpenseList)
async def list_pending_expenses(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Pengeluaran yang sudah diajukan tapi belum ditandai lunas oleh keuangan."""
    rows = (await db.execute(
        select(Expense, UnitUtility, Unit, Project)
        .outerjoin(UnitUtility, UnitUtility.id == Expense.utility_id)
        .outerjoin(Unit, Unit.id == Expense.unit_id)
        .outerjoin(Project, Project.id == Expense.project_id)
        .where(Expense.tenant_id == ctx.tenant_id, Expense.is_paid == False,  # noqa: E712
               Expense.is_deleted == False)                                    # noqa: E712
        .order_by(Expense.expense_date.desc())
    )).all()

    today = date.today()
    out, total = [], Decimal(0)
    for exp, util, unit, proj in rows:
        total += Decimal(exp.amount or 0)
        cat = exp.category.value if exp.category else "lain"
        ref = (util.applied_date if util else None) or exp.expense_date
        out.append(PendingExpenseRow(
            id=exp.id, description=exp.description or "-", category=cat,
            category_label=_EXP_LABEL.get(cat, cat), amount=Decimal(exp.amount or 0),
            expense_date=exp.expense_date,
            project_name=proj.name if proj else None, unit_label=_unit_label(unit),
            source="utilitas" if util else ("opname" if exp.contract_id else "biaya"),
            utility_kind=util.kind.value if util else None,
            utility_status=util.status.value if util else None,
            applied_date=util.applied_date if util else None,
            installed_date=util.installed_date if util else None,
            days_waiting=(today - ref).days if ref else None,
        ))
    return PendingExpenseList(rows=out, total_amount=total)


@router.get("/pending-expenses/count")
async def pending_expenses_count(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Jumlah tagihan menunggu bayar — untuk badge sidebar."""
    n = (await db.execute(
        select(func.count()).select_from(Expense).where(
            Expense.tenant_id == ctx.tenant_id, Expense.is_paid == False,  # noqa: E712
            Expense.is_deleted == False)                                    # noqa: E712
    )).scalar() or 0
    return {"count": int(n)}


@router.post("/pending-expenses/mark-paid")
async def mark_expenses_paid(
    payload: MarkExpensePaidRequest,
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Tandai sekelompok pengeluaran LUNAS dengan tanggal bayar sebenarnya → masuk Buku Kas."""
    if not payload.ids:
        return {"marked": 0}
    pd = payload.paid_date or date.today()
    rows = (await db.execute(select(Expense).where(
        Expense.id.in_(payload.ids), Expense.tenant_id == ctx.tenant_id,
        Expense.is_paid == False, Expense.is_deleted == False,  # noqa: E712
    ))).scalars().all()
    for e in rows:
        e.is_paid = True
        e.paid_at = pd
    await db.flush()
    for e in rows:
        await sync_expense_cashbook(db, ctx.tenant_id, e)   # baru di sini uang tercatat keluar
    if rows:
        await record_audit(db, ctx.tenant_id, ctx.user_id, "PAY", "expenses", None,
                           new_data={"count": len(rows), "paid_date": str(pd),
                                     "ids": [str(e.id) for e in rows]})
        # beri tahu pengaju bahwa tagihannya sudah dibayar
        await notify_roles(
            db, ctx.tenant_id, (UserRole.PRODUKSI,), NotificationKind.EXPENSE_PAID,
            title="Biaya sudah dibayar",
            body=f"{len(rows)} tagihan ditandai lunas ({pd.strftime('%d/%m/%Y')})",
            link="/utilitas", actor_id=ctx.user_id,
        )
    return {"marked": len(rows), "paid_date": str(pd)}
