import uuid
import math
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, delete as sa_delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext
from app.models.procurement import Vendor, PurchaseOrder, PurchaseOrderItem, VendorPayment
from app.schemas.marketing import Paginated
from app.schemas.procurement import (
    VendorCreate, VendorUpdate, VendorResponse,
    POCreate, POUpdate, POResponse,
    VPCreate, VPResponse,
)

router = APIRouter()
NOTDEL = lambda m: m.is_deleted == False  # noqa: E731, E712


def _paginate(items, total, page, size):
    return {"items": items, "total": total, "page": page, "size": size,
            "pages": math.ceil(total / size) if size else 0}


# ═══════════════════════ VENDORS ═══════════════════════
@router.get("/vendors", response_model=Paginated[VendorResponse])
async def list_vendors(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None), page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=500),
):
    conds = [Vendor.tenant_id == ctx.tenant_id, NOTDEL(Vendor)]
    if search:
        conds.append(or_(Vendor.name.ilike(f"%{search}%"), Vendor.category.ilike(f"%{search}%")))
    total = await db.scalar(select(func.count()).select_from(Vendor).where(*conds))
    r = await db.execute(select(Vendor).where(*conds).order_by(Vendor.name).offset((page - 1) * size).limit(size))
    return _paginate(r.scalars().all(), total or 0, page, size)


@router.post("/vendors", response_model=VendorResponse, status_code=status.HTTP_201_CREATED)
async def create_vendor(payload: VendorCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    v = Vendor(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(v); await db.flush(); await db.refresh(v)
    return v


async def _get_vendor(db, tenant_id, vid) -> Vendor:
    v = (await db.execute(select(Vendor).where(Vendor.id == vid, Vendor.tenant_id == tenant_id, NOTDEL(Vendor)))).scalar_one_or_none()
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Vendor tidak ditemukan")
    return v


@router.patch("/vendors/{vid}", response_model=VendorResponse)
async def update_vendor(vid: uuid.UUID, payload: VendorUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    v = await _get_vendor(db, ctx.tenant_id, vid)
    for f, val in payload.model_dump(exclude_unset=True).items():
        setattr(v, f, val)
    await db.flush(); await db.refresh(v)
    return v


@router.delete("/vendors/{vid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor(vid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    v = await _get_vendor(db, ctx.tenant_id, vid)
    v.is_deleted = True; v.deleted_at = datetime.utcnow()


# ═══════════════════════ PURCHASE ORDERS ═══════════════════════
def _attach_totals(po: PurchaseOrder):
    paid = sum((Decimal(p.amount) for p in po.payments if not p.is_deleted), Decimal(0))
    po.paid_amount = paid
    po.remaining = Decimal(po.total_amount or 0) - paid


def _sync_items(po: PurchaseOrder, items, tenant_id):
    total = Decimal(0)
    for it in items:
        line = Decimal(it.quantity or 0) * Decimal(it.unit_price or 0)
        total += line
        po.items.append(PurchaseOrderItem(
            tenant_id=tenant_id, item_name=it.item_name, unit=it.unit,
            quantity=it.quantity or 0, unit_price=it.unit_price or 0, total_price=line, notes=it.notes,
        ))
    po.total_amount = total


async def _load_po(db, tenant_id, po_id) -> PurchaseOrder:
    po = (await db.execute(
        select(PurchaseOrder).options(
            selectinload(PurchaseOrder.vendor), selectinload(PurchaseOrder.items),
            selectinload(PurchaseOrder.payments),
        ).where(PurchaseOrder.id == po_id, PurchaseOrder.tenant_id == tenant_id, NOTDEL(PurchaseOrder))
    )).scalar_one_or_none()
    if po is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="PO tidak ditemukan")
    _attach_totals(po)
    return po


@router.get("/purchase-orders", response_model=Paginated[POResponse])
async def list_pos(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None), project_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200),
):
    conds = [PurchaseOrder.tenant_id == ctx.tenant_id, NOTDEL(PurchaseOrder)]
    if search:
        conds.append(PurchaseOrder.po_number.ilike(f"%{search}%"))
    if project_id:
        conds.append(PurchaseOrder.project_id == project_id)
    if status_filter:
        conds.append(PurchaseOrder.status == status_filter)
    total = await db.scalar(select(func.count()).select_from(PurchaseOrder).where(*conds))
    r = await db.execute(
        select(PurchaseOrder).options(
            selectinload(PurchaseOrder.vendor), selectinload(PurchaseOrder.items), selectinload(PurchaseOrder.payments)
        ).where(*conds).order_by(PurchaseOrder.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    pos = r.scalars().all()
    for po in pos:
        _attach_totals(po)
    return _paginate(pos, total or 0, page, size)


@router.post("/purchase-orders", response_model=POResponse, status_code=status.HTTP_201_CREATED)
async def create_po(payload: POCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    data = payload.model_dump(exclude={"items"})
    po = PurchaseOrder(tenant_id=ctx.tenant_id, **data)
    _sync_items(po, payload.items, ctx.tenant_id)
    db.add(po)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "purchase_orders", po.id,
                       new_data={"po_number": po.po_number, "total": str(po.total_amount)})
    return await _load_po(db, ctx.tenant_id, po.id)


@router.get("/purchase-orders/{po_id}", response_model=POResponse)
async def get_po(po_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    return await _load_po(db, ctx.tenant_id, po_id)


@router.patch("/purchase-orders/{po_id}", response_model=POResponse)
async def update_po(po_id: uuid.UUID, payload: POUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    po = await _load_po(db, ctx.tenant_id, po_id)
    data = payload.model_dump(exclude_unset=True, exclude={"items"})
    for f, v in data.items():
        setattr(po, f, v)
    if payload.items is not None:
        await db.execute(sa_delete(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id))
        po.items = []
        _sync_items(po, payload.items, ctx.tenant_id)
    await db.flush()
    return await _load_po(db, ctx.tenant_id, po_id)


@router.delete("/purchase-orders/{po_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_po(po_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    po = await _load_po(db, ctx.tenant_id, po_id)
    po.is_deleted = True; po.deleted_at = datetime.utcnow()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "purchase_orders", po_id,
                       old_data={"po_number": po.po_number})


# ═══════════════════════ VENDOR PAYMENTS ═══════════════════════
@router.get("/vendor-payments", response_model=list[VPResponse])
async def list_vp(purchase_order_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(VendorPayment).where(
            VendorPayment.purchase_order_id == purchase_order_id, VendorPayment.tenant_id == ctx.tenant_id, NOTDEL(VendorPayment)
        ).order_by(VendorPayment.payment_date.desc(), VendorPayment.created_at.desc())
    )
    return r.scalars().all()


@router.post("/vendor-payments", response_model=VPResponse, status_code=status.HTTP_201_CREATED)
async def create_vp(payload: VPCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    await _load_po(db, ctx.tenant_id, payload.purchase_order_id)  # pastikan PO milik tenant
    vp = VendorPayment(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(vp); await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "vendor_payments", vp.id, new_data={"amount": str(vp.amount)})
    await db.refresh(vp)
    return vp


@router.delete("/vendor-payments/{vp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vp(vp_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    vp = (await db.execute(select(VendorPayment).where(VendorPayment.id == vp_id, VendorPayment.tenant_id == ctx.tenant_id, NOTDEL(VendorPayment)))).scalar_one_or_none()
    if vp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembayaran tidak ditemukan")
    vp.is_deleted = True; vp.deleted_at = datetime.utcnow()
