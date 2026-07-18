import re
import uuid
from datetime import date
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
from app.models.payment import Payment, PaymentSchedule, ScheduleStatus, PaymentSource
from app.models.kpr import KprApplication, KprStage
from app.models.construction import UnitConstruction, ConstructionStage, ConstructionProgressLog
from app.models.tax import TaxRecord, TaxType
from app.models.document import Document

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

    payments_this_month = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == t, Payment.is_deleted == False,  # noqa: E712
            Payment.payment_date >= month_start)
    ))
    total_contract = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Client.contract_value), 0)).where(
            Client.tenant_id == t, Client.is_deleted == False,  # noqa: E712
            Client.status != ClientStatus.INACTIVE)
    ))
    total_paid = Decimal(await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.tenant_id == t, Payment.is_deleted == False)  # noqa: E712
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


class CashflowReport(BaseModel):
    total_contract: Decimal       # total nilai kontrak (pembeli aktif)
    from_buyer: Decimal           # kas masuk dari pembeli (DP/cicilan)
    from_bank: Decimal            # kas masuk dari bank (pencairan KPR)
    total_in: Decimal             # total kas masuk
    kpr_plafond_total: Decimal    # total komitmen plafon KPR
    buyer_remaining: Decimal      # sisa kewajiban pembeli (piutang pembeli)
    retention_remaining: Decimal  # retensi menunggu pencairan bank
    months: list[CashflowMonth]   # tren bulanan (kronologis, maks 12 bln terakhir yang ada transaksi)


@router.get("/cashflow", response_model=CashflowReport)
async def cashflow(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Arus kas se-tenant: kas masuk dari pembeli vs bank, ditambah sisa kewajiban pembeli & retensi bank."""
    t = ctx.tenant_id
    notdel_p = Payment.is_deleted == False  # noqa: E712

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

    return CashflowReport(
        total_contract=total_contract, from_buyer=from_buyer, from_bank=from_bank, total_in=total_in,
        kpr_plafond_total=kpr_plafond_total, buyer_remaining=buyer_remaining,
        retention_remaining=retention_remaining, months=months,
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
    # kas masuk per pembeli
    pay_rows = (await db.execute(
        select(Payment.client_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.tenant_id == t, Payment.is_deleted == False)  # noqa: E712
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

    # sudah dibayar per schedule (pembayaran yang dialokasikan ke termin ini)
    paid_rows = (await db.execute(
        select(Payment.schedule_id, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.tenant_id == t, Payment.is_deleted == False,  # noqa: E712
               Payment.schedule_id.isnot(None))
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
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Penjualan per bulan (unit terjual + nilai) berdasarkan tanggal kontrak pembeli
    (fallback tanggal entri). Opsional filter per proyek. Maks 12 bulan terakhir yang ada penjualan."""
    t = ctx.tenant_id
    ym = func.to_char(func.coalesce(Client.contract_date, func.date(Client.created_at)), "YYYY-MM")
    conds = [Client.tenant_id == t, Client.is_deleted == False,  # noqa: E712
             Client.status != ClientStatus.INACTIVE]
    if project_id:
        conds.append(Client.project_id == project_id)
    rows = (await db.execute(
        select(ym.label("ym"), func.count(), func.coalesce(func.sum(Client.contract_value), 0))
        .where(*conds).group_by(ym).order_by(ym)
    )).all()
    return [SalesMonthly(month=m, count=c, value=Decimal(v)) for m, c, v in rows][-12:]


# ═══════════════════════ LAPORAN: PAJAK BULANAN (PPh) ═══════════════════════
SHM_RE = re.compile(r'shm|hgb|sertifikat', re.I)
PBB_RE = re.compile(r'pbb', re.I)


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


@router.get("/monthly-tax", response_model=MonthlyTaxReport)
async def monthly_tax(
    month: str = Query(..., description="YYYY-MM"),
    project_id: Optional[uuid.UUID] = Query(None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Rekap PPh bulanan per pembeli (nama/NIK/lokasi/tipe/kategori/AJB/jumlah/NTPN/No. SiKumbang/notaris)
    — utk lapor ke akuntan/kantor pajak. Hanya baris PPh yang SUDAH ada tanggalnya (tax_date) di bulan
    terpilih; baris belum bayar (tanpa tanggal) sengaja tak ikut."""
    t = ctx.tenant_id
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

    # KIR = No. SiKasep/SiKumbang — dari KPR TERBARU per klien (kosong utk pembeli cash)
    sikumbang_by_client: dict = {}
    if client_ids:
        kpr_rows = (await db.execute(
            select(KprApplication.client_id, KprApplication.sikasep_number, KprApplication.created_at)
            .where(KprApplication.client_id.in_(client_ids), KprApplication.is_deleted == False)  # noqa: E712
            .order_by(KprApplication.created_at.desc())
        )).all()
        for cid, sikasep, _ca in kpr_rows:
            if cid not in sikumbang_by_client:
                sikumbang_by_client[cid] = sikasep

    # Jumlah PPN per klien (tak terikat bulan — cukup nilai PPN klien ybs, kalau ada)
    ppn_by_client: dict = {}
    if client_ids:
        ppn_rows = (await db.execute(
            select(TaxRecord.client_id, TaxRecord.amount)
            .where(TaxRecord.client_id.in_(client_ids), TaxRecord.tenant_id == t,
                   TaxRecord.is_deleted == False, TaxRecord.tax_type == TaxType.PPN)  # noqa: E712
        )).all()
        ppn_by_client = {cid: amt for cid, amt in ppn_rows}

    # No. SHM & No. PBB — dari Dokumen Legalitas unit (doc_type teks bebas, dicocokkan pola sama FE)
    shm_by_unit: dict = {}
    pbb_by_unit: dict = {}
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
            ppn_amount=ppn_by_client.get(r.client_id), ntpn=r.ntpn,
            shm_number=shm_by_unit.get(c.unit_id) if c.unit_id else None,
            pbb_number=pbb_by_unit.get(c.unit_id) if c.unit_id else None,
            sikumbang_number=sikumbang_by_client.get(r.client_id),
            notary_name=r.notary.name if r.notary else None, tax_date=r.tax_date,
        ))

    return MonthlyTaxReport(
        month=month, rows=result_rows, total_count=len(result_rows),
        total_base_amount=sum((x.base_amount or Decimal(0) for x in result_rows), Decimal(0)),
        total_amount=sum((x.amount or Decimal(0) for x in result_rows), Decimal(0)),
        total_ppn_amount=sum((x.ppn_amount or Decimal(0) for x in result_rows), Decimal(0)),
    )
