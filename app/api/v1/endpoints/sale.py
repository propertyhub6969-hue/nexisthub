import uuid
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.sale import Sale, SaleStatus
from app.models.property import Unit, UnitStatus
from app.models.marketing import Client
from app.schemas.marketing import Paginated
from app.schemas.sale import SaleCreate, SaleUpdate, SaleResponse

router = APIRouter()

# status unit yang dianggap "tidak tersedia untuk dijual lagi"
_OCCUPIED = {UnitStatus.BOOKED, UnitStatus.SOLD, UnitStatus.HANDOVER}


def _paginate(items, total, page, size):
    return {"items": items, "total": total, "page": page, "size": size,
            "pages": math.ceil(total / size) if size else 0}


def _unit_status_for(sale_status: SaleStatus):
    """Map status penjualan → status unit yang seharusnya."""
    if sale_status in (SaleStatus.AKAD, SaleStatus.LUNAS):
        return UnitStatus.SOLD
    if sale_status in (SaleStatus.BOOKING, SaleStatus.PROSES):
        return UnitStatus.BOOKED
    if sale_status == SaleStatus.BATAL:
        return UnitStatus.AVAILABLE
    return None


async def _get_unit(db, tenant_id, unit_id) -> Unit:
    u = (await db.execute(select(Unit).where(Unit.id == unit_id, Unit.tenant_id == tenant_id))).scalar_one_or_none()
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    return u


async def _load_sale(db, tenant_id, sale_id) -> Sale:
    result = await db.execute(
        select(Sale)
        .options(selectinload(Sale.unit), selectinload(Sale.client))
        .where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
    )
    sale = result.scalar_one_or_none()
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Penjualan tidak ditemukan")
    return sale


@router.get("/", response_model=Paginated[SaleResponse])
async def list_sales(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = Query(None),
    project_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    conditions = [Sale.tenant_id == ctx.tenant_id]
    if search:
        conditions.append(Sale.sale_number.ilike(f"%{search}%"))
    if status_filter:
        conditions.append(Sale.status == status_filter)
    if category:
        conditions.append(Sale.category == category)
    if project_id:
        conditions.append(Sale.unit_id.in_(
            select(Unit.id).where(Unit.project_id == project_id, Unit.tenant_id == ctx.tenant_id)
        ))

    total = await db.scalar(select(func.count()).select_from(Sale).where(*conditions))
    result = await db.execute(
        select(Sale).options(selectinload(Sale.unit), selectinload(Sale.client))
        .where(*conditions).order_by(Sale.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    return _paginate(result.scalars().all(), total or 0, page, size)


@router.post("/", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    payload: SaleCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    unit = await _get_unit(db, ctx.tenant_id, payload.unit_id)
    if unit.status in _OCCUPIED:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Unit sudah dipesan/terjual")

    # pastikan client milik tenant ini
    client = (await db.execute(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == ctx.tenant_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembeli (client) tidak ditemukan")

    sale = Sale(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(sale)

    new_unit_status = _unit_status_for(sale.status)
    if new_unit_status:
        unit.status = new_unit_status

    await db.flush()
    return await _load_sale(db, ctx.tenant_id, sale.id)


@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(
    sale_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    return await _load_sale(db, ctx.tenant_id, sale_id)


@router.patch("/{sale_id}", response_model=SaleResponse)
async def update_sale(
    sale_id: uuid.UUID,
    payload: SaleUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx.tenant_id, sale_id)
    data = payload.model_dump(exclude_unset=True)

    for field, value in data.items():
        setattr(sale, field, value)

    # sinkronkan status unit bila status penjualan berubah
    if "status" in data and sale.unit is not None:
        new_unit_status = _unit_status_for(sale.status)
        if new_unit_status:
            sale.unit.status = new_unit_status

    await db.flush()
    return await _load_sale(db, ctx.tenant_id, sale.id)


@router.delete("/{sale_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sale(
    sale_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx.tenant_id, sale_id)
    # bebaskan kembali unit-nya
    if sale.unit is not None and sale.unit.status in _OCCUPIED:
        sale.unit.status = UnitStatus.AVAILABLE
    await db.delete(sale)
