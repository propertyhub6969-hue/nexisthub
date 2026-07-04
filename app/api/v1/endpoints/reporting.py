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
from app.models.property import Unit, UnitStatus
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


class KprRejectionReport(BaseModel):
    banks: list[KprRejectionBank]
    total: int
    rejected: int
    approved: int
    in_process: int
    rejection_rate: float


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
        })
        b["total"] += 1
        if k.rejected_date is not None:
            b["rejected"] += 1
        elif k.stage in APPROVED_STAGES:
            b["approved"] += 1
        else:
            b["in_process"] += 1

    def rate(rejected: int, total: int) -> float:
        return round(rejected / total * 100, 1) if total else 0.0

    banks = [
        KprRejectionBank(**b, rejection_rate=rate(b["rejected"], b["total"]))
        for b in buckets.values()
    ]
    # urutkan: rejection-rate tertinggi dulu, lalu terbanyak pengajuan; bank tanpa nama di akhir
    banks.sort(key=lambda x: (x.bank_id is None, -x.rejection_rate, -x.total, x.bank_name.lower()))

    total = sum(b.total for b in banks)
    rejected = sum(b.rejected for b in banks)
    approved = sum(b.approved for b in banks)
    in_process = sum(b.in_process for b in banks)

    return KprRejectionReport(
        banks=banks, total=total, rejected=rejected, approved=approved, in_process=in_process,
        rejection_rate=rate(rejected, total),
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

    async def _sum_payments(source: PaymentSource) -> Decimal:
        return Decimal(await db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.tenant_id == t, Payment.source == source, notdel_p)
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
        .where(Payment.tenant_id == t, notdel_p, Payment.payment_date.isnot(None))
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
