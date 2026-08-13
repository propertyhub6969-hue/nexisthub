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
from app.core.cashbook import sync_expense_cashbook, sync_notary_fee_cashbook
from app.core.notify import notify_roles
from app.models.cashbook import AccountCategory, CashBookEntry, CashDirection, CashAccount, CashTransfer
from app.models.expense import Expense
from app.models.marketing import Client
from app.models.tax import NotaryFee, Notary
from app.models.notification import NotificationKind
from app.models.property import Project, Unit, UnitUtility
from app.models.user import UserRole
from app.schemas.marketing import Paginated
from app.schemas.cashbook import (
    CategoryResponse, CashBookEntryResponse, CashBookSummary, CashBookCategoryTotal, CashBookMonth,
    PendingExpenseRow, PendingExpenseList, MarkExpensePaidRequest,
    CashAccountCreate, CashAccountUpdate, CashAccountResponse, CashAccountsSummary,
    CashTransferCreate, CashTransferResponse, EntryAccountUpdate,
)
from fastapi import HTTPException, status as httpstatus

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
    account_id: Optional[uuid.UUID] = Query(None),
    unassigned: bool = Query(False, description="hanya entri yang belum berrekening"),
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
    if account_id:
        conds.append(CashBookEntry.account_id == account_id)
    if unassigned:
        conds.append(CashBookEntry.account_id.is_(None))
    if date_from:
        conds.append(CashBookEntry.date >= date_from)
    if date_to:
        conds.append(CashBookEntry.date <= date_to)

    total = await db.scalar(select(func.count()).select_from(CashBookEntry).where(*conds))
    rows = (await db.execute(
        select(CashBookEntry, Client.full_name, Project.name, CashAccount.name)
        .select_from(CashBookEntry)
        .options(selectinload(CashBookEntry.category))
        .outerjoin(Client, Client.id == CashBookEntry.client_id)
        .outerjoin(Project, Project.id == CashBookEntry.project_id)
        .outerjoin(CashAccount, CashAccount.id == CashBookEntry.account_id)
        .where(*conds)
        .order_by(CashBookEntry.date.desc(), CashBookEntry.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )).all()

    items = []
    for entry, client_name, project_name, account_name in rows:
        item = CashBookEntryResponse.model_validate(entry).model_copy(update={
            "client_name": client_name, "project_name": project_name, "account_name": account_name,
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
# Cakupan: SEMUA jalur pengeluaran — utilitas, opname borongan, biaya manual, dan
# biaya notaris. Ini VALIDASI, bukan persetujuan: tak ada jalur penolakan; setiap
# pengeluaran dianggap sah, langkah ini hanya mencatatkan kapan uangnya benar keluar.
# Kunci baris memakai "<sumber>:<id>" karena datanya lintas dua tabel.

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
    """Semua pengeluaran yang sudah diajukan tapi belum ditandai lunas keuangan.
    Mencakup empat jalur: utilitas, opname borongan, biaya manual, dan biaya notaris."""
    today = date.today()
    out: list[PendingExpenseRow] = []
    total = Decimal(0)

    # ── 1-3. dari tabel expenses (utilitas / opname / biaya manual) ──
    rows = (await db.execute(
        select(Expense, UnitUtility, Unit, Project)
        .outerjoin(UnitUtility, UnitUtility.id == Expense.utility_id)
        .outerjoin(Unit, Unit.id == Expense.unit_id)
        .outerjoin(Project, Project.id == Expense.project_id)
        .where(Expense.tenant_id == ctx.tenant_id, Expense.is_paid == False,  # noqa: E712
               Expense.is_deleted == False)                                    # noqa: E712
    )).all()
    for exp, util, unit, proj in rows:
        total += Decimal(exp.amount or 0)
        cat = exp.category.value if exp.category else "lain"
        ref_date = (util.applied_date if util else None) or exp.expense_date
        out.append(PendingExpenseRow(
            ref=f"expense:{exp.id}", id=exp.id, description=exp.description or "-",
            category=cat, category_label=_EXP_LABEL.get(cat, cat),
            amount=Decimal(exp.amount or 0), expense_date=exp.expense_date,
            project_name=proj.name if proj else None, unit_label=_unit_label(unit),
            source="utilitas" if util else ("opname" if exp.contract_id else "biaya"),
            utility_kind=util.kind.value if util else None,
            utility_status=util.status.value if util else None,
            applied_date=util.applied_date if util else None,
            installed_date=util.installed_date if util else None,
            days_waiting=(today - ref_date).days if ref_date else None,
        ))

    # ── 4. dari tabel notary_fees ──
    fees = (await db.execute(
        select(NotaryFee, Client, Notary)
        .outerjoin(Client, Client.id == NotaryFee.client_id)
        .outerjoin(Notary, Notary.id == NotaryFee.notary_id)
        .where(NotaryFee.tenant_id == ctx.tenant_id, NotaryFee.is_paid == False,  # noqa: E712
               NotaryFee.is_deleted == False)                                      # noqa: E712
    )).all()
    for fee, client, notary in fees:
        total += Decimal(fee.amount or 0)
        out.append(PendingExpenseRow(
            ref=f"notary:{fee.id}", id=fee.id, description=fee.description or "-",
            category="biaya_notaris", category_label="Biaya Notaris/Legal",
            amount=Decimal(fee.amount or 0), expense_date=fee.fee_date,
            source="notaris",
            client_name=client.full_name if client else None,
            notary_name=notary.name if notary else None,
            days_waiting=(today - fee.fee_date).days if fee.fee_date else None,
        ))

    out.sort(key=lambda r: (r.expense_date or date.min), reverse=True)
    return PendingExpenseList(rows=out, total_amount=total)


@router.get("/pending-expenses/count")
async def pending_expenses_count(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Jumlah tagihan menunggu bayar (semua jalur) — untuk badge sidebar."""
    n_exp = (await db.execute(
        select(func.count()).select_from(Expense).where(
            Expense.tenant_id == ctx.tenant_id, Expense.is_paid == False,  # noqa: E712
            Expense.is_deleted == False)                                    # noqa: E712
    )).scalar() or 0
    n_fee = (await db.execute(
        select(func.count()).select_from(NotaryFee).where(
            NotaryFee.tenant_id == ctx.tenant_id, NotaryFee.is_paid == False,  # noqa: E712
            NotaryFee.is_deleted == False)                                      # noqa: E712
    )).scalar() or 0
    return {"count": int(n_exp) + int(n_fee)}


@router.post("/pending-expenses/mark-paid")
async def mark_expenses_paid(
    payload: MarkExpensePaidRequest,
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Tandai sekelompok pengeluaran LUNAS dengan tanggal bayar sebenarnya → masuk Buku Kas.
    Ini VALIDASI keuangan, bukan persetujuan: tak ada jalur penolakan — semua pengeluaran
    dianggap sah, langkah ini hanya mencatatkan kapan uangnya benar-benar keluar."""
    if not payload.refs:
        return {"marked": 0}
    pd = payload.paid_date or date.today()

    exp_ids, fee_ids = [], []
    for ref in payload.refs:
        kind, _, rid = ref.partition(":")
        try:
            rid = uuid.UUID(rid)
        except ValueError:
            continue
        (exp_ids if kind == "expense" else fee_ids if kind == "notary" else []).append(rid)

    marked = 0
    if exp_ids:
        rows = (await db.execute(select(Expense).where(
            Expense.id.in_(exp_ids), Expense.tenant_id == ctx.tenant_id,
            Expense.is_paid == False, Expense.is_deleted == False,  # noqa: E712
        ))).scalars().all()
        for e in rows:
            e.is_paid = True
            e.paid_at = pd
        await db.flush()
        for e in rows:
            await sync_expense_cashbook(db, ctx.tenant_id, e)   # baru di sini uang tercatat keluar
        marked += len(rows)

    if fee_ids:
        fees = (await db.execute(select(NotaryFee).where(
            NotaryFee.id.in_(fee_ids), NotaryFee.tenant_id == ctx.tenant_id,
            NotaryFee.is_paid == False, NotaryFee.is_deleted == False,  # noqa: E712
        ))).scalars().all()
        for f in fees:
            f.is_paid = True
            f.paid_at = pd
        await db.flush()
        for f in fees:
            await sync_notary_fee_cashbook(db, ctx.tenant_id, f)
        marked += len(fees)

    if marked:
        await record_audit(db, ctx.tenant_id, ctx.user_id, "PAY", "expenses", None,
                           new_data={"count": marked, "paid_date": str(pd), "refs": payload.refs})
        # beri tahu pengaju bahwa tagihannya sudah dibayar
        await notify_roles(
            db, ctx.tenant_id, (UserRole.PRODUKSI, UserRole.MARKETING), NotificationKind.EXPENSE_PAID,
            title="Biaya sudah dibayar",
            body=f"{marked} tagihan ditandai lunas ({pd.strftime('%d/%m/%Y')})",
            link="/finance/biaya-menunggu-bayar", actor_id=ctx.user_id,
        )
    return {"marked": marked, "paid_date": str(pd)}


# ═══════════════════════ REKENING KAS/BANK (multi-rekening) ═══════════════════════
async def _compute_balances(db, tenant_id):
    """→ (dict account_id→saldo, unassigned_balance). saldo = saldo_awal + masuk − keluar ± transfer."""
    accts = (await db.execute(
        select(CashAccount).where(CashAccount.tenant_id == tenant_id, CashAccount.is_deleted == False)  # noqa: E712
        .order_by(CashAccount.sort_order, CashAccount.name))).scalars().all()
    bal = {a.id: Decimal(a.opening_balance or 0) for a in accts}
    # entri kas per rekening
    erows = (await db.execute(
        select(CashBookEntry.account_id, CashBookEntry.direction, func.coalesce(func.sum(CashBookEntry.amount), 0))
        .where(CashBookEntry.tenant_id == tenant_id).group_by(CashBookEntry.account_id, CashBookEntry.direction))).all()
    unassigned = Decimal(0)
    for acc_id, direction, total in erows:
        total = Decimal(total or 0)
        signed = total if direction == CashDirection.IN else -total
        if acc_id is None:
            unassigned += signed
        elif acc_id in bal:
            bal[acc_id] += signed
    # transfer
    for col, sign in ((CashTransfer.to_account_id, 1), (CashTransfer.from_account_id, -1)):
        trows = (await db.execute(
            select(col, func.coalesce(func.sum(CashTransfer.amount), 0))
            .where(CashTransfer.tenant_id == tenant_id, CashTransfer.is_deleted == False)  # noqa: E712
            .group_by(col))).all()
        for acc_id, total in trows:
            if acc_id in bal:
                bal[acc_id] += Decimal(total or 0) * sign
    return accts, bal, unassigned


@router.get("/accounts", response_model=CashAccountsSummary)
async def list_accounts(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    accts, bal, unassigned = await _compute_balances(db, ctx.tenant_id)
    out = []
    for a in accts:
        r = CashAccountResponse.model_validate(a).model_copy(update={"balance": bal.get(a.id, Decimal(0))})
        out.append(r)
    total = sum((bal.get(a.id, Decimal(0)) for a in accts), Decimal(0))
    return CashAccountsSummary(accounts=out, total_balance=total, unassigned_balance=unassigned)


async def _get_account(db, tenant_id, account_id) -> CashAccount:
    a = (await db.execute(select(CashAccount).where(
        CashAccount.id == account_id, CashAccount.tenant_id == tenant_id,
        CashAccount.is_deleted == False))).scalar_one_or_none()  # noqa: E712
    if a is None:
        raise HTTPException(status_code=httpstatus.HTTP_404_NOT_FOUND, detail="Rekening tidak ditemukan")
    return a


@router.post("/accounts", response_model=CashAccountResponse, status_code=httpstatus.HTTP_201_CREATED)
async def create_account(payload: CashAccountCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    data = payload.model_dump()
    if data.get("is_default"):
        await db.execute(CashAccount.__table__.update().where(CashAccount.tenant_id == ctx.tenant_id).values(is_default=False))
    a = CashAccount(tenant_id=ctx.tenant_id, **data)
    db.add(a); await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "cash_accounts", a.id, new_data={"name": a.name})
    await db.commit(); await db.refresh(a)
    return CashAccountResponse.model_validate(a).model_copy(update={"balance": Decimal(a.opening_balance or 0)})


@router.patch("/accounts/{account_id}", response_model=CashAccountResponse)
async def update_account(account_id: uuid.UUID, payload: CashAccountUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    a = await _get_account(db, ctx.tenant_id, account_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    await db.flush(); await db.commit()
    _, bal, _ = await _compute_balances(db, ctx.tenant_id)
    return CashAccountResponse.model_validate(a).model_copy(update={"balance": bal.get(a.id, Decimal(0))})


@router.post("/accounts/{account_id}/set-default", response_model=CashAccountResponse)
async def set_default_account(account_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    a = await _get_account(db, ctx.tenant_id, account_id)
    await db.execute(CashAccount.__table__.update().where(CashAccount.tenant_id == ctx.tenant_id).values(is_default=False))
    a.is_default = True
    await db.flush(); await db.commit()
    return CashAccountResponse.model_validate(a).model_copy(update={"balance": Decimal(0)})


@router.delete("/accounts/{account_id}", status_code=httpstatus.HTTP_204_NO_CONTENT)
async def delete_account(account_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    a = await _get_account(db, ctx.tenant_id, account_id)
    from datetime import datetime, timezone
    a.is_deleted = True; a.deleted_at = datetime.now(timezone.utc); a.is_active = False; a.is_default = False
    await db.commit()


# ── Transfer antar rekening ──
@router.get("/transfers", response_model=list[CashTransferResponse])
async def list_transfers(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    Frm = CashAccount.__table__.alias("frm"); To = CashAccount.__table__.alias("dst")
    rows = (await db.execute(
        select(CashTransfer, Frm.c.name, To.c.name)
        .outerjoin(Frm, Frm.c.id == CashTransfer.from_account_id)
        .outerjoin(To, To.c.id == CashTransfer.to_account_id)
        .where(CashTransfer.tenant_id == ctx.tenant_id, CashTransfer.is_deleted == False)  # noqa: E712
        .order_by(CashTransfer.date.desc(), CashTransfer.created_at.desc()).limit(200))).all()
    return [CashTransferResponse.model_validate(t).model_copy(update={"from_account_name": fn, "to_account_name": tn})
            for t, fn, tn in rows]


@router.post("/transfers", response_model=CashTransferResponse, status_code=httpstatus.HTTP_201_CREATED)
async def create_transfer(payload: CashTransferCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="Rekening asal & tujuan tak boleh sama.")
    await _get_account(db, ctx.tenant_id, payload.from_account_id)
    await _get_account(db, ctx.tenant_id, payload.to_account_id)
    t = CashTransfer(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(t); await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "TRANSFER", "cash_transfers", t.id,
                       new_data={"amount": str(t.amount)})
    await db.commit(); await db.refresh(t)
    return CashTransferResponse.model_validate(t)


# ── Pindahkan entri ke rekening lain (reassign) ──
@router.patch("/entries/{entry_id}/account", response_model=CashBookEntryResponse)
async def reassign_entry_account(entry_id: uuid.UUID, payload: EntryAccountUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    entry = (await db.execute(select(CashBookEntry).where(
        CashBookEntry.id == entry_id, CashBookEntry.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=httpstatus.HTTP_404_NOT_FOUND, detail="Baris kas tidak ditemukan")
    if payload.account_id is not None:
        await _get_account(db, ctx.tenant_id, payload.account_id)
    entry.account_id = payload.account_id
    await db.flush(); await db.commit()
    # re-fetch dgn relasi kategori + nama akun (hindari lazy-load di luar greenlet)
    row = (await db.execute(
        select(CashBookEntry, Client.full_name, Project.name, CashAccount.name)
        .options(selectinload(CashBookEntry.category))
        .outerjoin(Client, Client.id == CashBookEntry.client_id)
        .outerjoin(Project, Project.id == CashBookEntry.project_id)
        .outerjoin(CashAccount, CashAccount.id == CashBookEntry.account_id)
        .where(CashBookEntry.id == entry_id))).first()
    e, cname, pname, acc_name = row
    return CashBookEntryResponse.model_validate(e).model_copy(update={
        "client_name": cname, "project_name": pname, "account_name": acc_name})
