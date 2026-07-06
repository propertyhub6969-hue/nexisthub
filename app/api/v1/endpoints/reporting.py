import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends
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

    # plafon KPR terbaru per pembeli
    kpr_rows = (await db.execute(
        select(KprApplication.client_id, KprApplication.plafond)
        .where(KprApplication.tenant_id == t, KprApplication.is_deleted == False)  # noqa: E712
        .order_by(KprApplication.client_id, KprApplication.created_at.desc())
    )).all()
    plafond_by_client: dict = {}
    for cid, plaf in kpr_rows:
        if cid not in plafond_by_client:   # baris pertama per client = terbaru (created_at desc)
            plafond_by_client[cid] = Decimal(plaf or 0)

    kpr_plafond_total = Decimal(0)
    buyer_remaining = Decimal(0)
    retention_remaining = Decimal(0)
    for cid, price in clients:
        price = Decimal(price or 0)
        plafond = plafond_by_client.get(cid, Decimal(0))
        b_paid = buyer_by_client.get(cid, Decimal(0))
        bank_paid = bank_by_client.get(cid, Decimal(0))
        kpr_plafond_total += plafond
        buyer_remaining += max(price - b_paid - plafond, Decimal(0))
        if plafond > 0:
            retention_remaining += max(plafond - bank_paid, Decimal(0))

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
