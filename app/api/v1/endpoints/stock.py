import uuid
from datetime import datetime, date
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
from app.models.stock import StockMovement, MovementType, MovementSource
from app.models.procurement import PurchaseOrder
from app.schemas.stock import StockInCreate, StockOutCreate, MovementResponse, StockBalance

router = APIRouter()
NOTDEL = StockMovement.is_deleted == False  # noqa: E712


async def _movements(db, tenant_id, project_id):
    r = await db.execute(
        select(StockMovement).where(
            StockMovement.tenant_id == tenant_id, StockMovement.project_id == project_id, NOTDEL
        ).order_by(StockMovement.movement_date.desc(), StockMovement.created_at.desc())
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
async def stock_balance(project_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Saldo stok per material (agregat masuk/keluar/sisa + HPP rata2)."""
    movs = await _movements(db, ctx.tenant_id, project_id)
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


@router.get("/stock/movements", response_model=list[MovementResponse])
async def list_movements(
    project_id: uuid.UUID = Query(...), material: Optional[str] = Query(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    movs = await _movements(db, ctx.tenant_id, project_id)
    if material:
        movs = [m for m in movs if m.material_name == material]
    return movs


@router.post("/stock/in", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def stock_in(payload: StockInCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    m = StockMovement(
        tenant_id=ctx.tenant_id, movement_type=MovementType.IN,
        source=MovementSource.PO if payload.po_id else MovementSource.DIRECT,
        **payload.model_dump(),
    )
    db.add(m); await db.flush(); await db.refresh(m)
    return m


@router.post("/stock/receive-po/{po_id}", response_model=list[MovementResponse])
async def receive_po(po_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Terima seluruh item PO ke stok proyek (barang datang di lokasi)."""
    po = (await db.execute(
        select(PurchaseOrder).options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == po_id, PurchaseOrder.tenant_id == ctx.tenant_id, PurchaseOrder.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if po is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="PO tidak ditemukan")
    if po.project_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="PO belum punya proyek untuk lokasi stok")
    created = []
    for it in po.items:
        m = StockMovement(
            tenant_id=ctx.tenant_id, project_id=po.project_id, material_name=it.item_name, unit=it.unit,
            movement_type=MovementType.IN, source=MovementSource.PO, quantity=it.quantity,
            unit_price=it.unit_price, po_id=po.id, movement_date=date.today(),
        )
        db.add(m); created.append(m)
    from app.models.procurement import POStatus
    po.status = POStatus.RECEIVED
    await db.flush()
    for m in created:
        await db.refresh(m)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "RECEIVE", "stock_movements", po.id,
                       new_data={"po": po.po_number, "items": len(created)})
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


@router.delete("/stock/movements/{mid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_movement(mid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    m = (await db.execute(select(StockMovement).where(StockMovement.id == mid, StockMovement.tenant_id == ctx.tenant_id, NOTDEL))).scalar_one_or_none()
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Mutasi tidak ditemukan")
    m.is_deleted = True; m.deleted_at = datetime.utcnow()
