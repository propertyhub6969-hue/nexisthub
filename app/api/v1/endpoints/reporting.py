import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.marketing import Lead, Prospect, Client, ProspectStatus, ClientStatus
from app.models.property import Project, Unit, UnitStatus
from app.models.payment import Payment, PaymentSchedule, ScheduleStatus, PaymentSource, PaymentApprovalStatus
from app.models.kpr import KprApplication, KprStage
from app.models.construction import UnitConstruction, ConstructionStage, ConstructionProgressLog
from app.models.tax import TaxRecord, TaxType, TaxStatus, MonthlyTaxShareLink, NotaryFee
from app.models.document import Document
from app.models.cashbook import CashBookEntry, AccountCategory, CashDirection

router = APIRouter()

# Tahap yang menandakan pengajuan sudah DISETUJUI bank (SP3K = surat persetujuan kredit ke atas).
APPROVED_STAGES = (KprStage.SP3K, KprStage.AKAD_KREDIT, KprStage.PENCAIRAN)


class DashboardStats(BaseModel):
    leads_total: int
    prospects_active: int
    clients_total: int
    units_total: int
    units_available: int
    units_booked: int
    units_sold: int
    payments_this_month: Decimal
    total_contract: Decimal
    total_paid: Decimal
    outstanding: Decimal
    overdue_count: int


async def _count(db, model, *conds) -> int:
    return await db.scalar(select(func.count()).select_from(model).where(*conds)) or 0


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    t = ctx.tenant_id
    month_start = date.today().replace(day=1)

    leads_total = await _count(db, Lead, Lead.tenant_id == t)
    prospects_active = await _count(db, Prospect, Prospect.tenant_id == t, Prospect.status == ProspectStatus.ACTIVE)
    clients_total = await _count(db, Client, Client.tenant_id == t, Client.is_deleted == False)  # noqa: E712

    units_total = await _count(db, Unit, Unit.tenant_id == t)
    units_available = await _count(db, Unit, Unit.tenant_id == t, Unit.status == UnitStatus.AVAILABLE)
    units_booked = await _count(db, Unit, Unit.tenant_id == t, Unit.status == UnitStatus.BOOKED)
    units_sold = await _count(db, Unit, Unit.tenant_id == t,
                              Unit.status.in_([UnitStatus.SOLD, UnitStatus.HANDOVER]))

    _approved = Payment.approval_status == PaymentApprovalStatus.APPROVED
    payments_this_month = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == t, Payment.is_deleted == False,  # noqa: E712
            Payment.payment_date >= month_start, _approved)
    ))
    total_contract = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Client.contract_value), 0)).where(
            Client.tenant_id == t, Client.is_deleted == False,  # noqa: E712
            Client.status != ClientStatus.INACTIVE)
    ))
    total_paid = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == t, Payment.is_deleted == False, _approved)  # noqa: E712
    ))
    overdue_count = await _count(db, PaymentSchedule, PaymentSchedule.tenant_id == t,
                                 PaymentSchedule.is_deleted == False,  # noqa: E712
                                 PaymentSchedule.status == ScheduleStatus.PENDING,
                                 PaymentSchedule.due_date < date.today())

    return DashboardStats(
        leads_total=leads_total, prospects_active=prospects_active, clients_total=clients_total,
        units_total=units_total, units_available=units_available, units_booked=units_booked, units_sold=units_sold,
        payments_this_month=payments_this_month, total_contract=total_contract, total_paid=total_paid,
        outstanding=total_contract - total_paid, overdue_count=overdue_count,
    )


# ═══════════════════════ LAPORAN: REJECTION-RATE KPR PER BANK ═══════════════════════
class KprRejectionBank(BaseModel):
    bank_id: Optional[uuid.UUID]
    bank_name: str
    total: int          # total pengajuan (semua tahap) ke bank ini
    rejected: int       # jumlah ditolak
    approved: int       # sudah disetujui (SP3K/Akad/Pencairan), belum ditolak
    in_process: int     # masih proses, belum ada keputusan
    rejection_rate: float   # rejected / total * 100 (dibulatkan 1 desimal)
    avg_days_to_akad: Optional[float] = None  # rata² lama pemberkasan Collect Berkas→Akad (hari)
    akad_samples: int = 0                      # jumlah pengajuan yang dipakai utk rata² durasi


class KprRejectionReport(BaseModel):
    banks: list[KprRejectionBank]
    total: int
    rejected: int
    approved: int
    in_process: int
    rejection_rate: float
    avg_days_to_akad: Optional[float] = None
    akad_samples: int = 0


@router.get("/kpr-rejection", response_model=KprRejectionReport)
async def kpr_rejection(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Rejection-rate pengajuan KPR per bank — bantu developer pilih bank penyalur yang paling tinggi approval-nya."""
    t = ctx.tenant_id
    rows = (await db.execute(
        select(KprApplication).options(selectinload(KprApplication.bank))
        .where(KprApplication.tenant_id == t, KprApplication.is_deleted == False)  # noqa: E712
    )).scalars().all()

    # agregasi per bank
    buckets: dict[Optional[uuid.UUID], dict] = {}
    for k in rows:
        key = k.bank_id
        b = buckets.setdefault(key, {
            "bank_id": key,
            "bank_name": (k.bank.name if k.bank else "(Tanpa bank)"),
            "total": 0, "rejected": 0, "approved": 0, "in_process": 0,
            "akad_days_sum": 0, "akad_samples": 0,
        })
        b["total"] += 1
        if k.rejected_date is not None:
            b["rejected"] += 1
        elif k.stage in APPROVED_STAGES:
            b["approved"] += 1
        else:
            b["in_process"] += 1
        # durasi pemberkasan: Collect Berkas (submitted_date) → Akad (akad_date)
        if k.submitted_date is not None and k.akad_date is not None:
            days = (k.akad_date - k.submitted_date).days
            if days >= 0:
                b["akad_days_sum"] += days
                b["akad_samples"] += 1

    def rate(rejected: int, total: int) -> float:
        return round(rejected / total * 100, 1) if total else 0.0

    def avg_days(b: dict) -> Optional[float]:
        return round(b["akad_days_sum"] / b["akad_samples"], 1) if b["akad_samples"] else None

    banks = [
        KprRejectionBank(
            bank_id=b["bank_id"], bank_name=b["bank_name"], total=b["total"],
            rejected=b["rejected"], approved=b["approved"], in_process=b["in_process"],
            rejection_rate=rate(b["rejected"], b["total"]),
            avg_days_to_akad=avg_days(b), akad_samples=b["akad_samples"],
        )
        for b in buckets.values()
    ]
    # urutkan: rejection-rate tertinggi dulu, lalu terbanyak pengajuan; bank tanpa nama di akhir
    banks.sort(key=lambda x: (x.bank_id is None, -x.rejection_rate, -x.total, x.bank_name.lower()))

    total = sum(b.total for b in banks)
    rejected = sum(b.rejected for b in banks)
    approved = sum(b.approved for b in banks)
    in_process = sum(b.in_process for b in banks)
    akad_days_sum = sum(bk["akad_days_sum"] for bk in buckets.values())
    akad_samples = sum(bk["akad_samples"] for bk in buckets.values())

    return KprRejectionReport(
        banks=banks, total=total, rejected=rejected, approved=approved, in_process=in_process,
        rejection_rate=rate(rejected, total),
        avg_days_to_akad=(round(akad_days_sum / akad_samples, 1) if akad_samples else None),
        akad_samples=akad_samples,
    )


# ═══════════════════════ LAPORAN: ARUS KAS (pembeli vs bank + retensi) ═══════════════════════
class CashflowMonth(BaseModel):
    month: str              # "YYYY-MM"
    from_buyer: Decimal
    from_bank: Decimal
    total: Decimal


class CashflowCategoryTotal(BaseModel):
    category_name: str
    direction: str                # 'in' | 'out'
    total: Decimal


class CashflowOutMonth(BaseModel):
    month: str                    # "YYYY-MM"
    by_category: list[Decimal]    # sejajar dgn out_category_names
    total: Decimal


class CashflowBreakdownItem(BaseModel):
    label: str
    total: Decimal


class CashflowReport(BaseModel):
    total_contract: Decimal       # total nilai kontrak (pembeli aktif)
    from_buyer: Decimal           # kas masuk dari pembeli (DP/cicilan)
    from_bank: Decimal            # kas masuk dari bank (pencairan KPR)
    total_in: Decimal             # total kas masuk
    kpr_plafond_total: Decimal    # total komitmen plafon KPR
    buyer_remaining: Decimal      # sisa kewajiban pembeli (piutang pembeli)
    retention_remaining: Decimal  # retensi menunggu pencairan bank
    months: list[CashflowMonth]   # tren bulanan (kronologis, maks 12 bln terakhir yang ada transaksi)
    # Ringkasan Buku Kas per kategori (ledger riil: pembayaran approved + biaya/notaris dibayar).
    # Beda basis dgn angka penjualan di atas — ini termasuk kas KELUAR.
    ledger_in: Decimal = Decimal(0)
    ledger_out: Decimal = Decimal(0)
    ledger_saldo: Decimal = Decimal(0)
    by_category: list[CashflowCategoryTotal] = []
    # Tren bulanan kas KELUAR dipecah per kategori (kolom = out_category_names)
    out_category_names: list[str] = []
    out_months: list[CashflowOutMonth] = []
    # Rincian kategori Biaya Notaris/Legal per jenis jasa (AJB, BBN, Balik Nama, dst)
    notary_breakdown: list[CashflowBreakdownItem] = []


@router.get("/cashflow", response_model=CashflowReport)
async def cashflow(
    cat_from: Optional[date] = Query(None),   # filter periode KHUSUS ringkasan kategori (ledger)
    cat_to: Optional[date] = Query(None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Arus kas se-tenant: kas masuk dari pembeli vs bank, ditambah sisa kewajiban pembeli & retensi bank."""
    t = ctx.tenant_id
    # hanya pembayaran yang sudah disetujui finance — pending/rejected belum dihitung sbg kas
    notdel_p = (Payment.is_deleted == False) & (Payment.approval_status == PaymentApprovalStatus.APPROVED)  # noqa: E712

    # Hanya hitung pembayaran milik PEMBELI yang masih ada (bukan soft-deleted/orphan). Pembatalan
    # deal pakai status INACTIVE (tetap terhitung sbg kas diterima), soft-delete = data keliru → dikecualikan.
    async def _sum_payments(source: PaymentSource) -> Decimal:
        return Decimal(await db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment).join(Client, Client.id == Payment.client_id)
            .where(Payment.tenant_id == t, Payment.source == source, notdel_p,
                   Client.is_deleted == False)  # noqa: E712
        ))

    from_buyer = await _sum_payments(PaymentSource.PEMBELI)
    from_bank = await _sum_payments(PaymentSource.BANK)
    total_in = from_buyer + from_bank

    total_contract = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Client.contract_value), 0)).where(
            Client.tenant_id == t, Client.is_deleted == False,  # noqa: E712
            Client.status != ClientStatus.INACTIVE)
    ))

    # Sisa kewajiban pembeli & retensi — dihitung per-pembeli lalu dijumlah (clamp ≥ 0),
    # konsisten dgn ringkasan pembayaran per-pembeli (harga − dari_pembeli − plafon; plafon − dari_bank).
    clients = (await db.execute(
        select(Client.id, Client.contract_value).where(
            Client.tenant_id == t, Client.is_deleted == False,  # noqa: E712
            Client.status != ClientStatus.INACTIVE)
    )).all()

    buyer_rows = (await db.execute(
        select(Payment.client_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.tenant_id == t, Payment.source == PaymentSource.PEMBELI, notdel_p)
        .group_by(Payment.client_id)
    )).all()
    bank_rows = (await db.execute(
        select(Payment.client_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.tenant_id == t, Payment.source == PaymentSource.BANK, notdel_p)
        .group_by(Payment.client_id)
    )).all()
    buyer_by_client = {cid: Decimal(v) for cid, v in buyer_rows}
    bank_by_client = {cid: Decimal(v) for cid, v in bank_rows}

    # plafon KPR terbaru per pembeli — hanya DIHITUNG sbg komitmen bila stage ≥ Akad Kredit
    # (sebelum akad pinjaman belum final → plafon belum menutup kewajiban pembeli / belum retensi).
    kpr_rows = (await db.execute(
        select(KprApplication.client_id, KprApplication.plafond, KprApplication.stage)
        .where(KprApplication.tenant_id == t, KprApplication.is_deleted == False)  # noqa: E712
        .order_by(KprApplication.client_id, KprApplication.created_at.desc())
    )).all()
    committed_by_client: dict = {}
    for cid, plaf, stage in kpr_rows:
        if cid not in committed_by_client:   # baris pertama per client = terbaru (created_at desc)
            committed_by_client[cid] = Decimal(plaf or 0) if stage in (KprStage.AKAD_KREDIT, KprStage.PENCAIRAN) else Decimal(0)

    kpr_plafond_total = Decimal(0)
    buyer_remaining = Decimal(0)
    retention_remaining = Decimal(0)
    for cid, price in clients:
        price = Decimal(price or 0)
        committed = committed_by_client.get(cid, Decimal(0))
        b_paid = buyer_by_client.get(cid, Decimal(0))
        bank_paid = bank_by_client.get(cid, Decimal(0))
        kpr_plafond_total += committed
        buyer_remaining += max(price - b_paid - committed, Decimal(0))
        if committed > 0:
            retention_remaining += max(committed - bank_paid, Decimal(0))

    # Tren bulanan (kas masuk per bulan, pisah sumber)
    ym = func.to_char(Payment.payment_date, "YYYY-MM")
    month_rows = (await db.execute(
        select(
            ym.label("ym"),
            func.coalesce(func.sum(Payment.amount).filter(Payment.source == PaymentSource.PEMBELI), 0),
            func.coalesce(func.sum(Payment.amount).filter(Payment.source == PaymentSource.BANK), 0),
        )
        .select_from(Payment).join(Client, Client.id == Payment.client_id)
        .where(Payment.tenant_id == t, notdel_p, Payment.payment_date.isnot(None),
               Client.is_deleted == False)  # noqa: E712
        .group_by(ym).order_by(ym)
    )).all()
    months = [
        CashflowMonth(month=m, from_buyer=Decimal(fb), from_bank=Decimal(bk), total=Decimal(fb) + Decimal(bk))
        for m, fb, bk in month_rows
    ][-12:]   # maks 12 bulan terakhir yang ada transaksi

    # Ringkasan Buku Kas per kategori (ledger riil — termasuk kas keluar biaya/notaris).
    # Filter periode opsional berlaku KHUSUS di sini (angka penjualan di atas tetap all-time).
    cat_conds = [CashBookEntry.tenant_id == t]
    if cat_from:
        cat_conds.append(CashBookEntry.date >= cat_from)
    if cat_to:
        cat_conds.append(CashBookEntry.date <= cat_to)
    cat_rows = (await db.execute(
        select(AccountCategory.name, CashBookEntry.direction, func.coalesce(func.sum(CashBookEntry.amount), 0))
        .select_from(CashBookEntry)
        .outerjoin(AccountCategory, AccountCategory.id == CashBookEntry.category_id)
        .where(*cat_conds)
        .group_by(AccountCategory.name, CashBookEntry.direction)
    )).all()
    by_category = [
        CashflowCategoryTotal(category_name=name or "Belum dikategorikan", direction=direction.value, total=Decimal(total))
        for name, direction, total in cat_rows
    ]
    by_category.sort(key=lambda r: (r.direction, -r.total))
    ledger_in = sum((c.total for c in by_category if c.direction == CashDirection.IN.value), Decimal(0))
    ledger_out = sum((c.total for c in by_category if c.direction == CashDirection.OUT.value), Decimal(0))

    # Tren bulanan kas KELUAR per kategori (hormati filter periode yg sama)
    ymc = func.to_char(CashBookEntry.date, "YYYY-MM")
    out_rows = (await db.execute(
        select(ymc.label("ym"), AccountCategory.name, func.coalesce(func.sum(CashBookEntry.amount), 0))
        .select_from(CashBookEntry)
        .outerjoin(AccountCategory, AccountCategory.id == CashBookEntry.category_id)
        .where(*cat_conds, CashBookEntry.direction == CashDirection.OUT)
        .group_by(ymc, AccountCategory.name).order_by(ymc)
    )).all()
    cat_totals: dict = {}
    month_map: dict = {}
    for ym, name, total in out_rows:
        nm = name or "Belum dikategorikan"
        cat_totals[nm] = cat_totals.get(nm, Decimal(0)) + Decimal(total)
        month_map.setdefault(ym, {})[nm] = Decimal(total)
    out_category_names = [nm for nm, _ in sorted(cat_totals.items(), key=lambda x: -x[1])]
    out_months = [
        CashflowOutMonth(
            month=ym,
            by_category=[month_map[ym].get(nm, Decimal(0)) for nm in out_category_names],
            total=sum(month_map[ym].values(), Decimal(0)),
        )
        for ym in sorted(month_map.keys())[-12:]
    ]

    # Rincian kategori Biaya Notaris/Legal per jenis jasa (join balik ke NotaryFee via source_id)
    notary_rows = (await db.execute(
        select(NotaryFee.description, func.coalesce(func.sum(CashBookEntry.amount), 0))
        .select_from(CashBookEntry)
        .join(NotaryFee, NotaryFee.id == CashBookEntry.source_id)
        .where(*cat_conds, CashBookEntry.source_type == "notary_fee")
        .group_by(NotaryFee.description).order_by(func.coalesce(func.sum(CashBookEntry.amount), 0).desc())
    )).all()
    notary_breakdown = [CashflowBreakdownItem(label=desc or "—", total=Decimal(total)) for desc, total in notary_rows]

    return CashflowReport(
        total_contract=total_contract, from_buyer=from_buyer, from_bank=from_bank, total_in=total_in,
        kpr_plafond_total=kpr_plafond_total, buyer_remaining=buyer_remaining,
        retention_remaining=retention_remaining, months=months,
        ledger_in=ledger_in, ledger_out=ledger_out, ledger_saldo=ledger_in - ledger_out,
        by_category=by_category, out_category_names=out_category_names, out_months=out_months,
        notary_breakdown=notary_breakdown,
    )


# ═══════════════════════ LAPORAN: REKAP PENJUALAN PER PROYEK ═══════════════════════
class SalesProject(BaseModel):
    project_id: uuid.UUID
    project_name: str
    units_total: int
    units_available: int
    units_booked: int
    units_sold: int          # sold + handover
    buyers: int              # pembeli aktif/selesai (bukan batal)
    contract_value: Decimal
    cash_in: Decimal
    remaining: Decimal


class SalesRecapReport(BaseModel):
    projects: list[SalesProject]
    units_total: int
    units_sold: int
    buyers: int
    contract_value: Decimal
    cash_in: Decimal
    remaining: Decimal


@router.get("/sales-recap", response_model=SalesRecapReport)
async def sales_recap(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Rekap penjualan per proyek: status unit, jumlah pembeli, nilai kontrak, kas masuk, sisa."""
    t = ctx.tenant_id

    projects = (await db.execute(
        select(Project.id, Project.name).where(Project.tenant_id == t).order_by(Project.name)
    )).all()

    # jumlah unit per (proyek, status)
    unit_rows = (await db.execute(
        select(Unit.project_id, Unit.status, func.count()).where(Unit.tenant_id == t)
        .group_by(Unit.project_id, Unit.status)
    )).all()
    units_by_proj: dict = {}
    for pid, st, cnt in unit_rows:
        d = units_by_proj.setdefault(pid, {s: 0 for s in UnitStatus})
        d[st] = cnt

    # pembeli aktif/selesai per proyek + nilai kontrak
    client_rows = (await db.execute(
        select(Client.id, Client.project_id, Client.contract_value).where(
            Client.tenant_id == t, Client.is_deleted == False,  # noqa: E712
            Client.status != ClientStatus.INACTIVE)
    )).all()
    # kas masuk per pembeli (hanya yang sudah disetujui finance)
    pay_rows = (await db.execute(
        select(Payment.client_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.tenant_id == t, Payment.is_deleted == False,  # noqa: E712
               Payment.approval_status == PaymentApprovalStatus.APPROVED)
        .group_by(Payment.client_id)
    )).all()
    paid_by_client = {cid: Decimal(v) for cid, v in pay_rows}

    buyers_by_proj: dict = {}
    contract_by_proj: dict = {}
    cash_by_proj: dict = {}
    for cid, pid, cv in client_rows:
        buyers_by_proj[pid] = buyers_by_proj.get(pid, 0) + 1
        contract_by_proj[pid] = contract_by_proj.get(pid, Decimal(0)) + Decimal(cv or 0)
        cash_by_proj[pid] = cash_by_proj.get(pid, Decimal(0)) + paid_by_client.get(cid, Decimal(0))

    rows: list[SalesProject] = []
    for pid, name in projects:
        u = units_by_proj.get(pid, {})
        available = u.get(UnitStatus.AVAILABLE, 0)
        booked = u.get(UnitStatus.BOOKED, 0)
        sold = u.get(UnitStatus.SOLD, 0) + u.get(UnitStatus.HANDOVER, 0)
        contract = contract_by_proj.get(pid, Decimal(0))
        cash = cash_by_proj.get(pid, Decimal(0))
        rows.append(SalesProject(
            project_id=pid, project_name=name,
            units_total=available + booked + sold, units_available=available,
            units_booked=booked, units_sold=sold,
            buyers=buyers_by_proj.get(pid, 0),
            contract_value=contract, cash_in=cash, remaining=contract - cash,
        ))

    return SalesRecapReport(
        projects=rows,
        units_total=sum(r.units_total for r in rows),
        units_sold=sum(r.units_sold for r in rows),
        buyers=sum(r.buyers for r in rows),
        contract_value=sum((r.contract_value for r in rows), Decimal(0)),
        cash_in=sum((r.cash_in for r in rows), Decimal(0)),
        remaining=sum((r.remaining for r in rows), Decimal(0)),
    )


# ═══════════════════════ LAPORAN: PROGRES KONSTRUKSI ═══════════════════════
CONSTRUCTION_REMINDER_DAYS = 7  # samakan dgn frontend Construction.tsx isLate()


class ConstructionProject(BaseModel):
    project_id: uuid.UUID
    project_name: str
    units_total: int
    avg_percent: float
    done: int            # selesai (stage=selesai atau percent>=100)
    in_progress: int     # sudah mulai, belum selesai
    not_started: int     # persiapan & 0%
    overdue_target: int  # target_date lewat & belum selesai
    late_update: int     # belum update progres > 7 hari (unit belum selesai)


class ConstructionProgressReport(BaseModel):
    projects: list[ConstructionProject]
    units_total: int
    done: int
    overdue_target: int
    late_update: int
    avg_percent: float
    stage_counts: dict[str, int]


@router.get("/construction-progress", response_model=ConstructionProgressReport)
async def construction_progress(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Progres pembangunan per proyek: rata-rata %, tahap, selesai & keterlambatan.
    Unit tanpa baris UnitConstruction dianggap tahap persiapan / 0% (konsisten dgn list_construction)."""
    t = ctx.tenant_id
    today = date.today()

    projects = (await db.execute(
        select(Project.id, Project.name).where(Project.tenant_id == t).order_by(Project.name)
    )).all()
    proj_name = {pid: name for pid, name in projects}

    units = (await db.execute(
        select(Unit.id, Unit.project_id).where(Unit.tenant_id == t)
    )).all()

    cons = (await db.execute(
        select(UnitConstruction.unit_id, UnitConstruction.stage, UnitConstruction.percent,
               UnitConstruction.start_date, UnitConstruction.target_date, UnitConstruction.finish_date)
        .where(UnitConstruction.tenant_id == t)
    )).all()
    cmap = {r[0]: r for r in cons}

    log_rows = (await db.execute(
        select(ConstructionProgressLog.unit_id, func.max(ConstructionProgressLog.log_date))
        .where(ConstructionProgressLog.tenant_id == t, ConstructionProgressLog.is_deleted == False)  # noqa: E712
        .group_by(ConstructionProgressLog.unit_id)
    )).all()
    last_log = {uid: d for uid, d in log_rows}

    # akumulator per proyek
    agg: dict = {pid: {"units": 0, "pct_sum": 0, "done": 0, "in_progress": 0,
                       "not_started": 0, "overdue_target": 0, "late_update": 0}
                 for pid, _ in projects}
    stage_counts = {s.value: 0 for s in ConstructionStage}

    for uid, pid in units:
        a = agg.get(pid)
        if a is None:  # unit proyek yg tak ada di daftar (harusnya tak terjadi)
            continue
        c = cmap.get(uid)
        stage = c[1] if c else ConstructionStage.PERSIAPAN
        pct = c[2] if c else 0
        target = c[4] if c else None
        start = c[3] if c else None
        is_done = stage == ConstructionStage.SELESAI or pct >= 100

        a["units"] += 1
        a["pct_sum"] += pct
        stage_counts[stage.value] += 1
        if is_done:
            a["done"] += 1
        elif stage == ConstructionStage.PERSIAPAN and pct == 0:
            a["not_started"] += 1
        else:
            a["in_progress"] += 1

        if not is_done and target is not None and target < today:
            a["overdue_target"] += 1
        if not is_done:
            ref = last_log.get(uid) or start
            if ref is not None and (today - ref).days > CONSTRUCTION_REMINDER_DAYS:
                a["late_update"] += 1

    rows: list[ConstructionProject] = []
    for pid, _ in projects:
        a = agg[pid]
        n = a["units"]
        rows.append(ConstructionProject(
            project_id=pid, project_name=proj_name[pid],
            units_total=n, avg_percent=round(a["pct_sum"] / n, 1) if n else 0.0,
            done=a["done"], in_progress=a["in_progress"], not_started=a["not_started"],
            overdue_target=a["overdue_target"], late_update=a["late_update"],
        ))

    total_units = sum(r.units_total for r in rows)
    total_pct = sum(a["pct_sum"] for a in agg.values())
    return ConstructionProgressReport(
        projects=rows,
        units_total=total_units,
        done=sum(r.done for r in rows),
        overdue_target=sum(r.overdue_target for r in rows),
        late_update=sum(r.late_update for r in rows),
        avg_percent=round(total_pct / total_units, 1) if total_units else 0.0,
        stage_counts=stage_counts,
    )


# ═══════════════════════ LAPORAN: TUNGGAKAN / AGING PIUTANG ═══════════════════════
class AgingClient(BaseModel):
    client_id: uuid.UUID
    full_name: str
    project_name: Optional[str]
    unit_label: Optional[str]
    overdue_count: int       # jumlah termin telat
    outstanding: Decimal     # total tunggakan (nominal termin − sudah dibayar)
    max_days: int            # keterlambatan terlama (hari)
    bucket: str              # kategori umur berdasarkan max_days


class AgingReport(BaseModel):
    clients: list[AgingClient]
    total_outstanding: Decimal
    bucket_1_30: Decimal
    bucket_31_60: Decimal
    bucket_61_90: Decimal
    bucket_90p: Decimal
    overdue_clients: int
    overdue_schedules: int


def _aging_bucket(days: int) -> str:
    if days <= 30:
        return "1-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    return "90+"


@router.get("/aging", response_model=AgingReport)
async def aging(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Tunggakan/aging piutang: termin (schedule) yang PENDING & lewat jatuh tempo, dikelompokkan umur & per pembeli."""
    t = ctx.tenant_id
    today = date.today()

    sched_rows = (await db.execute(
        select(PaymentSchedule.id, PaymentSchedule.client_id, PaymentSchedule.amount, PaymentSchedule.due_date)
        .where(PaymentSchedule.tenant_id == t, PaymentSchedule.is_deleted == False,  # noqa: E712
               PaymentSchedule.status == ScheduleStatus.PENDING,
               PaymentSchedule.client_id.isnot(None),
               PaymentSchedule.due_date.isnot(None), PaymentSchedule.due_date < today)
    )).all()

    # sudah dibayar per schedule (pembayaran yang dialokasikan ke termin ini, hanya yang disetujui)
    paid_rows = (await db.execute(
        select(Payment.schedule_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.tenant_id == t, Payment.is_deleted == False,  # noqa: E712
               Payment.schedule_id.isnot(None), Payment.approval_status == PaymentApprovalStatus.APPROVED)
        .group_by(Payment.schedule_id)
    )).all()
    paid_by_sched = {sid: Decimal(v) for sid, v in paid_rows}

    # info pembeli + proyek + unit (untuk label)
    cli_rows = (await db.execute(
        select(Client.id, Client.full_name, Project.name, Unit.block, Unit.unit_number)
        .select_from(Client)
        .outerjoin(Project, Project.id == Client.project_id)
        .outerjoin(Unit, Unit.id == Client.unit_id)
        .where(Client.tenant_id == t)
    )).all()
    cli_info = {
        cid: (name, proj, (f"{blk} " if blk else "") + (unum or "") if unum or blk else None)
        for cid, name, proj, blk, unum in cli_rows
    }

    per_client: dict = {}
    bucket_totals = {"1-30": Decimal(0), "31-60": Decimal(0), "61-90": Decimal(0), "90+": Decimal(0)}
    for sid, cid, amount, due in sched_rows:
        outstanding = Decimal(amount or 0) - paid_by_sched.get(sid, Decimal(0))
        if outstanding <= 0:
            continue
        days = (today - due).days
        bucket_totals[_aging_bucket(days)] += outstanding
        c = per_client.setdefault(cid, {"outstanding": Decimal(0), "count": 0, "max_days": 0})
        c["outstanding"] += outstanding
        c["count"] += 1
        c["max_days"] = max(c["max_days"], days)

    clients: list[AgingClient] = []
    for cid, c in per_client.items():
        name, proj, unit_label = cli_info.get(cid, (None, None, None))
        clients.append(AgingClient(
            client_id=cid, full_name=name or "—", project_name=proj, unit_label=unit_label,
            overdue_count=c["count"], outstanding=c["outstanding"], max_days=c["max_days"],
            bucket=_aging_bucket(c["max_days"]),
        ))
    # yang paling parah dulu (nominal terbesar), lalu terlama
    clients.sort(key=lambda x: (-x.outstanding, -x.max_days))

    return AgingReport(
        clients=clients,
        total_outstanding=sum((c.outstanding for c in clients), Decimal(0)),
        bucket_1_30=bucket_totals["1-30"], bucket_31_60=bucket_totals["31-60"],
        bucket_61_90=bucket_totals["61-90"], bucket_90p=bucket_totals["90+"],
        overdue_clients=len(clients),
        overdue_schedules=sum(c.overdue_count for c in clients),
    )


# ═══════════════════════ GRAFIK PENJUALAN PER BULAN ═══════════════════════
class SalesMonthly(BaseModel):
    month: str        # "YYYY-MM"
    count: int        # jumlah unit terjual (pembeli) bulan itu
    value: Decimal    # nilai penjualan (Σ harga jual)


@router.get("/sales-monthly", response_model=list[SalesMonthly])
async def sales_monthly(
    project_id: Optional[uuid.UUID] = Query(None),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Penjualan per bulan (unit terjual + nilai) berdasarkan tanggal kontrak pembeli
    (fallback tanggal entri). Opsional filter per proyek & tahun.
    Tanpa `year` → 12 bulan terakhir yang ada penjualan (rolling). Dengan `year` → Jan-Des penuh
    tahun itu (termasuk bulan tanpa penjualan), supaya sumbu grafik konsisten satu tahun."""
    t = ctx.tenant_id
    date_col = func.coalesce(Client.contract_date, func.date(Client.created_at))
    ym = func.to_char(date_col, "YYYY-MM")
    conds = [Client.tenant_id == t, Client.is_deleted == False,  # noqa: E712
             Client.status != ClientStatus.INACTIVE]
    if project_id:
        conds.append(Client.project_id == project_id)
    if year:
        conds.append(func.extract("year", date_col) == year)
    rows = (await db.execute(
        select(ym.label("ym"), func.count(), func.coalesce(func.sum(Client.contract_value), 0))
        .where(*conds).group_by(ym).order_by(ym)
    )).all()
    by_month = {m: SalesMonthly(month=m, count=c, value=Decimal(v)) for m, c, v in rows}
    if year:
        return [by_month.get(f"{year}-{mo:02d}") or SalesMonthly(month=f"{year}-{mo:02d}", count=0, value=Decimal(0)) for mo in range(1, 13)]
    return list(by_month.values())[-12:]


# ═══════════════════════ LAPORAN: PAJAK BULANAN (PPh) ═══════════════════════
SHM_RE = re.compile(r'shm|hgb|sertifikat', re.I)
PBB_RE = re.compile(r'pbb', re.I)
SIKASEP_RE = re.compile(r'sikasep|sikumbang', re.I)


class MonthlyTaxRow(BaseModel):
    client_id: uuid.UUID
    name: str
    nik: Optional[str] = None
    location: Optional[str] = None       # nama proyek
    unit_number: Optional[str] = None    # blok-nomor
    category: Optional[str] = None       # subsidi | komersial
    base_amount: Optional[Decimal] = None  # Nilai AJB
    amount: Optional[Decimal] = None       # Jumlah PPh
    ppn_amount: Optional[Decimal] = None   # Jumlah PPN (dari TaxRecord PPN klien ini, bila ada)
    bphtb_amount: Optional[Decimal] = None  # Jumlah BPHTB (dari TaxRecord BPHTB klien ini, bila ada)
    ntpn: Optional[str] = None
    shm_number: Optional[str] = None     # dari Dokumen Legalitas unit (SHM/HGB)
    pbb_number: Optional[str] = None     # dari Dokumen Legalitas unit (PBB)
    sikumbang_number: Optional[str] = None  # KIR — No. SiKasep/SiKumbang, dari KPR pembeli (kosong utk cash)
    notary_name: Optional[str] = None
    tax_date: Optional[date] = None


class MonthlyTaxReport(BaseModel):
    month: str
    rows: list[MonthlyTaxRow]
    total_count: int
    total_base_amount: Decimal
    total_amount: Decimal
    total_ppn_amount: Decimal
    total_bphtb_amount: Decimal


async def _build_monthly_tax_report(db: AsyncSession, t: uuid.UUID, month: str, project_id: Optional[uuid.UUID]) -> MonthlyTaxReport:
    """Rekap PPh bulanan per pembeli (nama/NIK/lokasi/kategori/AJB/jumlah/NTPN/No. SiKumbang/notaris)
    — utk lapor ke akuntan/kantor pajak. Hanya baris PPh yang SUDAH ada tanggalnya (tax_date) di bulan
    terpilih; baris belum bayar (tanpa tanggal) sengaja tak ikut. Dipakai endpoint biasa & tautan publik."""
    try:
        year, mon = int(month[:4]), int(month[5:7])
    except (ValueError, IndexError):
        year = mon = 0
    if not (1 <= mon <= 12):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Format bulan harus YYYY-MM")
    start = date(year, mon, 1)
    end = date(year + 1, 1, 1) if mon == 12 else date(year, mon + 1, 1)

    conds = [
        TaxRecord.tenant_id == t, TaxRecord.is_deleted == False,  # noqa: E712
        TaxRecord.tax_type == TaxType.PPH,
        TaxRecord.tax_date.isnot(None), TaxRecord.tax_date >= start, TaxRecord.tax_date < end,
    ]
    rows = (await db.execute(
        select(TaxRecord).options(selectinload(TaxRecord.notary)).where(*conds).order_by(TaxRecord.tax_date)
    )).scalars().all()

    client_ids = {r.client_id for r in rows}
    clients: dict = {}
    if client_ids:
        cconds = [Client.id.in_(client_ids)]
        if project_id:
            cconds.append(Client.project_id == project_id)
        for c in (await db.execute(select(Client).where(*cconds))).scalars().all():
            clients[c.id] = c

    unit_ids = {c.unit_id for c in clients.values() if c.unit_id}
    units: dict = {}
    if unit_ids:
        for u in (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all():
            units[u.id] = u

    proj_ids = {c.project_id for c in clients.values() if c.project_id}
    proj_names: dict = {}
    if proj_ids:
        for pid, pname in (await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))).all():
            proj_names[pid] = pname

    # Jumlah PPN & BPHTB per klien (tak terikat bulan — cukup nilai klien ybs, kalau ada)
    ppn_by_client: dict = {}
    bphtb_by_client: dict = {}
    if client_ids:
        ppn_rows = (await db.execute(
            select(TaxRecord.client_id, TaxRecord.amount)
            .where(TaxRecord.client_id.in_(client_ids), TaxRecord.tenant_id == t,
                   TaxRecord.is_deleted == False, TaxRecord.tax_type == TaxType.PPN)  # noqa: E712
        )).all()
        ppn_by_client = {cid: amt for cid, amt in ppn_rows}
        bphtb_rows = (await db.execute(
            select(TaxRecord.client_id, TaxRecord.amount)
            .where(TaxRecord.client_id.in_(client_ids), TaxRecord.tenant_id == t,
                   TaxRecord.is_deleted == False, TaxRecord.tax_type == TaxType.BPHTB)  # noqa: E712
        )).all()
        bphtb_by_client = {cid: amt for cid, amt in bphtb_rows}

    # No. SHM & No. PBB & No. SiKasep/SiKumbang — dari Dokumen Legalitas unit (doc_type teks bebas, dicocokkan pola sama FE)
    shm_by_unit: dict = {}
    pbb_by_unit: dict = {}
    sikumbang_by_unit: dict = {}
    if unit_ids:
        doc_rows = (await db.execute(
            select(Document.unit_id, Document.doc_type, Document.name)
            .where(Document.unit_id.in_(unit_ids), Document.tenant_id == t, Document.is_deleted == False)  # noqa: E712
        )).all()
        for uid, doc_type, dname in doc_rows:
            if SHM_RE.search(doc_type or '') and uid not in shm_by_unit:
                shm_by_unit[uid] = dname
            elif PBB_RE.search(doc_type or '') and uid not in pbb_by_unit:
                pbb_by_unit[uid] = dname
            elif SIKASEP_RE.search(doc_type or '') and uid not in sikumbang_by_unit:
                sikumbang_by_unit[uid] = dname

    result_rows: list[MonthlyTaxRow] = []
    for r in rows:
        c = clients.get(r.client_id)
        if c is None:   # tersaring project_id, atau klien sudah dihapus
            continue
        u = units.get(c.unit_id) if c.unit_id else None
        result_rows.append(MonthlyTaxRow(
            client_id=r.client_id, name=c.full_name, nik=c.nik,
            location=proj_names.get(c.project_id),
            unit_number=("-".join(x for x in [u.block, u.unit_number] if x) if u else None),
            category=r.category, base_amount=r.base_amount, amount=r.amount,
            ppn_amount=ppn_by_client.get(r.client_id), bphtb_amount=bphtb_by_client.get(r.client_id), ntpn=r.ntpn,
            shm_number=shm_by_unit.get(c.unit_id) if c.unit_id else None,
            pbb_number=pbb_by_unit.get(c.unit_id) if c.unit_id else None,
            sikumbang_number=sikumbang_by_unit.get(c.unit_id) if c.unit_id else None,
            notary_name=r.notary.name if r.notary else None, tax_date=r.tax_date,
        ))

    return MonthlyTaxReport(
        month=month, rows=result_rows, total_count=len(result_rows),
        total_base_amount=sum((x.base_amount or Decimal(0) for x in result_rows), Decimal(0)),
        total_amount=sum((x.amount or Decimal(0) for x in result_rows), Decimal(0)),
        total_ppn_amount=sum((x.ppn_amount or Decimal(0) for x in result_rows), Decimal(0)),
        total_bphtb_amount=sum((x.bphtb_amount or Decimal(0) for x in result_rows), Decimal(0)),
    )


@router.get("/monthly-tax", response_model=MonthlyTaxReport)
async def monthly_tax(
    month: str = Query(..., description="YYYY-MM"),
    project_id: Optional[uuid.UUID] = Query(None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    return await _build_monthly_tax_report(db, ctx.tenant_id, month, project_id)


# ═══════════════════════ CHECKLIST PAJAK BELUM DIURUS ═══════════════════════
# "Selesai" = ada TaxRecord dgn status validasi/dtp/bebas (terminal). "Belum" = tak ada baris
# sama sekali, ATAU ada baris tapi status masih belum/dibayar (masih berjalan, belum tuntas).
TAX_COMPLETE_STATUSES = (TaxStatus.VALIDASI, TaxStatus.DTP, TaxStatus.BEBAS)


class TaxChecklistItem(BaseModel):
    has_record: bool
    status: str   # nilai TaxStatus, atau 'belum_ada' bila tak ada baris sama sekali
    is_complete: bool


class TaxChecklistRow(BaseModel):
    client_id: uuid.UUID
    full_name: str
    unit_label: Optional[str] = None
    project_name: Optional[str] = None
    contract_date: Optional[date] = None
    days_since_contract: Optional[int] = None
    pph: TaxChecklistItem
    bphtb: TaxChecklistItem
    ppn: TaxChecklistItem
    incomplete_count: int   # 0-3, dari pph/bphtb/ppn yang belum tuntas


class TaxChecklistReport(BaseModel):
    rows: list[TaxChecklistRow]
    total_clients: int
    total_incomplete_clients: int


def _tax_item(rec: Optional[TaxRecord]) -> TaxChecklistItem:
    if rec is None:
        return TaxChecklistItem(has_record=False, status="belum_ada", is_complete=False)
    return TaxChecklistItem(has_record=True, status=rec.status.value, is_complete=rec.status in TAX_COMPLETE_STATUSES)


@router.get("/tax-checklist", response_model=TaxChecklistReport)
async def tax_checklist(
    project_id: Optional[uuid.UUID] = Query(None),
    only_incomplete: bool = Query(True, description="Hanya tampilkan pembeli dgn minimal 1 jenis pajak belum tuntas"),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Checklist per-pembeli: status PPh/BPHTB/PPN mana yang belum diurus (tak ada baris,
    atau masih belum/dibayar — belum divalidasi/DTP/bebas). Pembeli batal (INACTIVE) dikecualikan."""
    t = ctx.tenant_id
    cconds = [Client.tenant_id == t, Client.is_deleted == False, Client.status != ClientStatus.INACTIVE]  # noqa: E712
    if project_id:
        cconds.append(Client.project_id == project_id)
    clients = (await db.execute(select(Client).where(*cconds).order_by(Client.contract_date))).scalars().all()
    if not clients:
        return TaxChecklistReport(rows=[], total_clients=0, total_incomplete_clients=0)

    client_ids = [c.id for c in clients]
    tax_rows = (await db.execute(
        select(TaxRecord).where(TaxRecord.tenant_id == t, TaxRecord.client_id.in_(client_ids),
                                TaxRecord.is_deleted == False)  # noqa: E712
    )).scalars().all()
    by_key: dict = {(r.client_id, r.tax_type): r for r in tax_rows}

    unit_ids = {c.unit_id for c in clients if c.unit_id}
    units = {u.id: u for u in (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars().all()} if unit_ids else {}
    proj_ids = {c.project_id for c in clients if c.project_id}
    proj_names = dict((await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))).all()) if proj_ids else {}

    today = date.today()
    rows: list[TaxChecklistRow] = []
    for c in clients:
        pph = _tax_item(by_key.get((c.id, TaxType.PPH)))
        bphtb = _tax_item(by_key.get((c.id, TaxType.BPHTB)))
        ppn = _tax_item(by_key.get((c.id, TaxType.PPN)))
        incomplete = sum(1 for it in (pph, bphtb, ppn) if not it.is_complete)
        if only_incomplete and incomplete == 0:
            continue
        u = units.get(c.unit_id) if c.unit_id else None
        rows.append(TaxChecklistRow(
            client_id=c.id, full_name=c.full_name,
            unit_label=("-".join(x for x in [u.block, u.unit_number] if x) if u else None),
            project_name=proj_names.get(c.project_id),
            contract_date=c.contract_date,
            days_since_contract=(today - c.contract_date).days if c.contract_date else None,
            pph=pph, bphtb=bphtb, ppn=ppn, incomplete_count=incomplete,
        ))
    rows.sort(key=lambda r: (-(r.days_since_contract or 0), -r.incomplete_count))

    return TaxChecklistReport(
        rows=rows, total_clients=len(clients),
        total_incomplete_clients=sum(1 for c in clients
            if sum(1 for tt in (TaxType.PPH, TaxType.BPHTB, TaxType.PPN)
                   if not _tax_item(by_key.get((c.id, tt))).is_complete) > 0),
    )


# ── Tautan bagikan Laporan Pajak Bulanan ke pihak luar (mis. konsultan pajak), tanpa login ──
class ShareLinkCreate(BaseModel):
    month: str
    project_id: Optional[uuid.UUID] = None
    expires_days: int = 30


class ShareLinkResponse(BaseModel):
    id: uuid.UUID
    token: str
    month: str
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_accessed_at: Optional[datetime] = None
    access_count: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/monthly-tax/share", response_model=list[ShareLinkResponse])
async def list_monthly_tax_share_links(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Daftar tautan bagikan yang pernah dibuat tenant ini (termasuk yang sudah expired/dicabut, utk histori)."""
    rows = (await db.execute(
        select(MonthlyTaxShareLink).where(MonthlyTaxShareLink.tenant_id == ctx.tenant_id)
        .order_by(MonthlyTaxShareLink.created_at.desc())
    )).scalars().all()
    return rows


@router.post("/monthly-tax/share", response_model=ShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_monthly_tax_share_link(payload: ShareLinkCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Buat tautan bertoken (tanpa login) utk bagikan Laporan Pajak Bulanan satu bulan ke pihak luar."""
    proj_name = None
    if payload.project_id:
        proj_name = await db.scalar(select(Project.name).where(Project.id == payload.project_id, Project.tenant_id == ctx.tenant_id))
        if proj_name is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Proyek tidak ditemukan")
    days = max(1, min(365, payload.expires_days))
    link = MonthlyTaxShareLink(
        tenant_id=ctx.tenant_id, token=secrets.token_urlsafe(32), month=payload.month,
        project_id=payload.project_id, project_name_snapshot=proj_name or "Semua Proyek",
        created_by=ctx.user_id, expires_at=datetime.now(timezone.utc) + timedelta(days=days),
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return link


@router.delete("/monthly-tax/share/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_monthly_tax_share_link(link_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Cabut tautan bagikan — begitu dicabut, tautan tak bisa diakses lagi (walau belum expired)."""
    link = (await db.execute(
        select(MonthlyTaxShareLink).where(MonthlyTaxShareLink.id == link_id, MonthlyTaxShareLink.tenant_id == ctx.tenant_id)
    )).scalar_one_or_none()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan")
    link.revoked_at = datetime.now(timezone.utc)
    await db.flush()
