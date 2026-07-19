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
from app.models.cashbook import AccountCategory, CashBookEntry, CashDirection
from app.models.marketing import Client
from app.models.property import Project
from app.schemas.marketing import Paginated
from app.schemas.cashbook import CategoryResponse, CashBookEntryResponse, CashBookSummary, CashBookCategoryTotal, CashBookMonth

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
