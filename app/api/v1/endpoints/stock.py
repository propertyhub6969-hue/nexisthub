import uuid
from datetime import datetime, date
from decimal import Decimal
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext
from app.models.stock import StockMovement, MovementType, MovementSource
from app.models.procurement import PurchaseOrder, POStatus
from app.models.property import Project
from app.models.warehouse import Warehouse
from app.models.user import User
from app.schemas.stock import (
    StockInCreate, StockOutCreate, StockReturnVendorCreate, StockReturnUnitCreate,
    StockTransferCreate, MovementResponse, StockBalance,
)
from app.schemas.procurement import ReceivePO

router = APIRouter()
NOTDEL = StockMovement.is_deleted == False  # noqa: E712


def _one_location(project_id, warehouse_id, what: str = "Lokasi"):
    """Validasi: tepat SATU lokasi terisi (proyek ATAU gudang)."""
    if bool(project_id) == bool(warehouse_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail=f"{what} harus diisi tepat satu: proyek ATAU gudang")


async def _movements(db, tenant_id, project_id=None, warehouse_id=None):
    """Mutasi pada satu LOKASI (proyek atau gudang)."""
    loc = (StockMovement.project_id == project_id) if project_id else (StockMovement.warehouse_id == warehouse_id)
    r = await db.execute(
        select(StockMovement).where(StockMovement.tenant_id == tenant_id, loc, NOTDEL)
        .order_by(StockMovement.movement_date.desc(), StockMovement.created_at.desc())
    )
    return r.scalars().all()


def _avg_price(movements, name, unit):
    """HPP rata-rata tertimbang dari barang masuk material tsb."""
    qty = Decimal(0); val = Decimal(0)
    for m in movements:
        if m.movement_type == MovementType.IN and m.material_name == name and (m.unit or "") == (unit or ""):
            qty += Decimal(m.quantity); val += Decimal(m.quantity) * Decimal(m.unit_price)
    return (val / qty) if qty > 0 else Decimal(0)


def _balance_qty(movements, name, unit):
    bal = Decimal(0)
    for m in movements:
        if m.material_name == name and (m.unit or "") == (unit or ""):
            bal += Decimal(m.quantity) if m.movement_type == MovementType.IN else -Decimal(m.quantity)
    return bal


@router.get("/stock", response_model=list[StockBalance])
async def stock_balance(
    project_id: Optional[uuid.UUID] = Query(None), warehouse_id: Optional[uuid.UUID] = Query(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Saldo stok per material di satu LOKASI (proyek ATAU gudang): masuk/keluar/sisa + HPP rata2."""
    _one_location(project_id, warehouse_id)
    movs = await _movements(db, ctx.tenant_id, project_id, warehouse_id)
    agg = defaultdict(lambda: {"in": Decimal(0), "out": Decimal(0), "in_val": Decimal(0)})
    for m in movs:
        key = (m.material_name, m.unit or "")
        if m.movement_type == MovementType.IN:
            agg[key]["in"] += Decimal(m.quantity)
            agg[key]["in_val"] += Decimal(m.quantity) * Decimal(m.unit_price)
        else:
            agg[key]["out"] += Decimal(m.quantity)
    out = []
    for (name, unit), a in sorted(agg.items()):
        avg = (a["in_val"] / a["in"]) if a["in"] > 0 else Decimal(0)
        bal = a["in"] - a["out"]
        out.append(StockBalance(
            material_name=name, unit=unit or None, qty_in=a["in"], qty_out=a["out"],
            balance=bal, avg_price=avg, value=bal * avg,
        ))
    return out


async def _label_counterparts(db, tenant_id, movs):
    """Isi counterpart_label: untuk baris transfer, tampilkan nama lokasi LAWAN-nya."""
    tids = {m.transfer_id for m in movs if m.transfer_id}
    if not tids:
        return
    others = (await db.execute(
        select(StockMovement).where(
            StockMovement.tenant_id == tenant_id, StockMovement.transfer_id.in_(tids), NOTDEL)
    )).scalars().all()
    pids = {o.project_id for o in others if o.project_id}
    wids = {o.warehouse_id for o in others if o.warehouse_id}
    pnames = {r[0]: r[1] for r in (await db.execute(select(Project.id, Project.name).where(Project.id.in_(pids)))).all()} if pids else {}
    wnames = {r[0]: r[1] for r in (await db.execute(select(Warehouse.id, Warehouse.name).where(Warehouse.id.in_(wids)))).all()} if wids else {}
    by_tid: dict = {}
    for o in others:
        by_tid.setdefault(o.transfer_id, []).append(o)
    for m in movs:
        if not m.transfer_id:
            continue
        for o in by_tid.get(m.transfer_id, []):
            if o.id == m.id:
                continue  # lewati diri sendiri → sisanya = lokasi lawan
            m.counterpart_label = pnames.get(o.project_id) or wnames.get(o.warehouse_id)


@router.get("/stock/movements", response_model=list[MovementResponse])
async def list_movements(
    project_id: Optional[uuid.UUID] = Query(None), warehouse_id: Optional[uuid.UUID] = Query(None),
    material: Optional[str] = Query(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    _one_location(project_id, warehouse_id)
    movs = await _movements(db, ctx.tenant_id, project_id, warehouse_id)
    if material:
        movs = [m for m in movs if m.material_name == material]
    # resolve nama PIC penerima (transien)
    uids = list({m.received_by_id for m in movs if m.received_by_id})
    names = {}
    if uids:
        rows = (await db.execute(select(User.id, User.full_name).where(User.id.in_(uids)))).all()
        names = {r[0]: r[1] for r in rows}
    for m in movs:
        m.received_by_name = names.get(m.received_by_id)
    await _label_counterparts(db, ctx.tenant_id, movs)
    return movs


@router.post("/stock/in", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def stock_in(payload: StockInCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Barang masuk ke satu LOKASI (proyek atau gudang)."""
    _one_location(payload.project_id, payload.warehouse_id)
    m = StockMovement(
        tenant_id=ctx.tenant_id, movement_type=MovementType.IN,
        source=MovementSource.PO if payload.po_id else MovementSource.DIRECT,
        **payload.model_dump(),
    )
    db.add(m); await db.flush(); await db.refresh(m)
    return m


@router.post("/stock/transfer", response_model=list[MovementResponse], status_code=status.HTTP_201_CREATED)
async def stock_transfer(payload: StockTransferCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Pindah material antar-LOKASI (gudang↔proyek, proyek↔proyek).
    BUKAN biaya — cuma pindah tempat. Membuat 2 baris (OUT di asal, IN di tujuan) terikat transfer_id sama.
    HPP rata2 lokasi asal ikut terbawa → biaya unit tetap akurat saat nanti didistribusikan."""
    _one_location(payload.from_project_id, payload.from_warehouse_id, "Lokasi asal")
    _one_location(payload.to_project_id, payload.to_warehouse_id, "Lokasi tujuan")
    if (payload.from_project_id and payload.from_project_id == payload.to_project_id) or \
       (payload.from_warehouse_id and payload.from_warehouse_id == payload.to_warehouse_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Lokasi asal dan tujuan tidak boleh sama")

    movs = await _movements(db, ctx.tenant_id, payload.from_project_id, payload.from_warehouse_id)
    bal = _balance_qty(movs, payload.material_name, payload.unit or "")
    if Decimal(payload.quantity) > bal:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"Stok tidak cukup di lokasi asal (sisa {bal} {payload.unit or ''})")
    price = _avg_price(movs, payload.material_name, payload.unit or "")

    tid = uuid.uuid4()
    common = dict(
        tenant_id=ctx.tenant_id, transfer_id=tid, material_name=payload.material_name, unit=payload.unit,
        quantity=payload.quantity, unit_price=price, movement_date=payload.movement_date, notes=payload.notes,
    )
    out = StockMovement(movement_type=MovementType.OUT, source=MovementSource.TRANSFER_OUT,
                        project_id=payload.from_project_id, warehouse_id=payload.from_warehouse_id, **common)
    inn = StockMovement(movement_type=MovementType.IN, source=MovementSource.TRANSFER_IN,
                        project_id=payload.to_project_id, warehouse_id=payload.to_warehouse_id, **common)
    db.add_all([out, inn]); await db.flush()
    await db.refresh(out); await db.refresh(inn)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "TRANSFER", "stock_movements", tid,
                       new_data={"material": payload.material_name, "qty": str(payload.quantity)})
    return [out, inn]


async def _recompute_po_status(db, tenant_id, po_id):
    """Set status PO dari total penerimaan per item: penuh->RECEIVED, sebagian->PARTIAL, belum->ORDERED."""
    po = (await db.execute(
        select(PurchaseOrder).options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == po_id, PurchaseOrder.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if po is None or po.status == POStatus.CANCELLED or not po.items:
        return
    rows = (await db.execute(
        select(StockMovement.po_item_id, func.coalesce(func.sum(StockMovement.quantity), 0))
        .where(StockMovement.tenant_id == tenant_id, StockMovement.po_id == po_id,
               StockMovement.movement_type == MovementType.IN, StockMovement.is_deleted == False)  # noqa: E712
        .group_by(StockMovement.po_item_id)
    )).all()
    recv = {r[0]: Decimal(r[1]) for r in rows}
    # kurangkan retur ke vendor yg mengoreksi penerimaan PO ini — jangan sampai tetap ke-mark RECEIVED penuh
    ret_rows = (await db.execute(
        select(StockMovement.po_item_id, func.coalesce(func.sum(StockMovement.quantity), 0))
        .where(StockMovement.tenant_id == tenant_id, StockMovement.po_id == po_id,
               StockMovement.movement_type == MovementType.OUT, StockMovement.source == MovementSource.RETURN_VENDOR,
               StockMovement.is_deleted == False)  # noqa: E712
        .group_by(StockMovement.po_item_id)
    )).all()
    for pid, qty in ret_rows:
        recv[pid] = recv.get(pid, Decimal(0)) - Decimal(qty)
    total_recv = sum(recv.values(), Decimal(0))
    all_full = all(recv.get(it.id, Decimal(0)) >= Decimal(it.quantity or 0) for it in po.items)
    if total_recv > 0 and all_full:
        po.status = POStatus.RECEIVED
    elif total_recv > 0:
        po.status = POStatus.PARTIAL
    else:
        po.status = POStatus.ORDERED


@router.post("/stock/receive-po/{po_id}", response_model=list[MovementResponse])
async def receive_po(po_id: uuid.UUID, payload: ReceivePO, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Terima item PO ke stok (boleh sebagian). Tujuan = GUDANG bila po.warehouse_id diisi, else PROYEK.
    Tiap penerimaan = satu DO/surat jalan."""
    po = (await db.execute(
        select(PurchaseOrder).options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == po_id, PurchaseOrder.tenant_id == ctx.tenant_id, PurchaseOrder.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if po is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="PO tidak ditemukan")
    if po.warehouse_id is None and po.project_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="PO belum punya tujuan (gudang atau proyek) untuk lokasi stok")
    dest = dict(warehouse_id=po.warehouse_id) if po.warehouse_id else dict(project_id=po.project_id)
    items_by_id = {it.id: it for it in po.items}
    created = []
    for r in payload.items:
        qty = Decimal(r.quantity or 0)
        if qty <= 0:
            continue
        it = items_by_id.get(r.po_item_id)
        if it is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Item PO tidak ditemukan")
        m = StockMovement(
            tenant_id=ctx.tenant_id, material_name=it.item_name, unit=it.unit, **dest,
            movement_type=MovementType.IN, source=MovementSource.PO, quantity=qty,
            unit_price=it.unit_price, po_id=po.id, po_item_id=it.id, do_number=payload.do_number,
            received_by_id=ctx.user_id, movement_date=payload.receive_date or date.today(),
        )
        db.add(m); created.append(m)
    await db.flush()
    await _recompute_po_status(db, ctx.tenant_id, po.id)
    await db.flush()
    for m in created:
        await db.refresh(m)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "RECEIVE", "stock_movements", po.id,
                       new_data={"po": po.po_number, "do": payload.do_number, "items": len(created)})
    return created


@router.post("/stock/out", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def stock_out(payload: StockOutCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Distribusi material dari stok ke unit (atau umum proyek)."""
    movs = await _movements(db, ctx.tenant_id, payload.project_id)
    bal = _balance_qty(movs, payload.material_name, payload.unit or "")
    if Decimal(payload.quantity) > bal:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"Stok tidak cukup (sisa {bal} {payload.unit or ''})")
    avg = _avg_price(movs, payload.material_name, payload.unit or "")
    m = StockMovement(
        tenant_id=ctx.tenant_id, movement_type=MovementType.OUT, source=MovementSource.DISTRIBUTION,
        unit_price=avg, **payload.model_dump(),
    )
    db.add(m); await db.flush(); await db.refresh(m)
    return m


@router.post("/stock/return-vendor", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def return_to_vendor(payload: StockReturnVendorCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Retur ke vendor — barang baru diterima rusak/salah, dikembalikan sebelum dipakai. Bukan pemakaian proyek.
    Bisa dari lokasi mana pun (proyek atau gudang)."""
    _one_location(payload.project_id, payload.warehouse_id)
    movs = await _movements(db, ctx.tenant_id, payload.project_id, payload.warehouse_id)
    bal = _balance_qty(movs, payload.material_name, payload.unit or "")
    if Decimal(payload.quantity) > bal:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"Stok tidak cukup (sisa {bal} {payload.unit or ''})")
    price = payload.unit_price if payload.unit_price is not None else _avg_price(movs, payload.material_name, payload.unit or "")
    data = payload.model_dump(exclude={"unit_price"})
    m = StockMovement(
        tenant_id=ctx.tenant_id, movement_type=MovementType.OUT, source=MovementSource.RETURN_VENDOR,
        unit_price=price, **data,
    )
    db.add(m); await db.flush()
    if m.po_id:
        await _recompute_po_status(db, ctx.tenant_id, m.po_id)
        await db.flush()
    await db.refresh(m)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "RETURN", "stock_movements", m.id, reason=payload.notes)
    return m


@router.post("/stock/return-unit", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def return_from_unit(payload: StockReturnUnitCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Retur dari unit ke gudang — material terkirim ke unit ternyata sisa/tak terpakai."""
    movs = await _movements(db, ctx.tenant_id, payload.project_id)
    price = payload.unit_price if payload.unit_price is not None else _avg_price(movs, payload.material_name, payload.unit or "")
    data = payload.model_dump(exclude={"unit_price"})
    m = StockMovement(
        tenant_id=ctx.tenant_id, movement_type=MovementType.IN, source=MovementSource.RETURN_UNIT,
        unit_price=price, **data,
    )
    db.add(m); await db.flush(); await db.refresh(m)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "RETURN", "stock_movements", m.id, reason=payload.notes)
    return m


@router.delete("/stock/movements/{mid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_movement(mid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    m = (await db.execute(select(StockMovement).where(StockMovement.id == mid, StockMovement.tenant_id == ctx.tenant_id, NOTDEL))).scalar_one_or_none()
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Mutasi tidak ditemukan")
    now = datetime.utcnow()
    if m.transfer_id:
        # Transfer = sepasang OUT/IN → hapus KEDUA sisi, kalau tidak saldo lokasi jadi pincang.
        pair = (await db.execute(select(StockMovement).where(
            StockMovement.tenant_id == ctx.tenant_id, StockMovement.transfer_id == m.transfer_id, NOTDEL
        ))).scalars().all()
        for x in pair:
            x.is_deleted = True; x.deleted_at = now
        return
    m.is_deleted = True; m.deleted_at = now
    if m.po_id:  # penerimaan PO dibatalkan → status PO dihitung ulang
        await db.flush()
        await _recompute_po_status(db, ctx.tenant_id, m.po_id)
