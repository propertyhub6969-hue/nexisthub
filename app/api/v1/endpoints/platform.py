import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_password_hash
from app.api.deps import require_platform_admin
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole
from app.schemas.platform import (
    FEATURE_MODULES, TenantAdminResponse, TenantProvision, TenantAdminUpdate,
    ResetOwnerPassword, TenantUserRow,
)

router = APIRouter()


def _slugify(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower().strip()).strip('-')
    return slug[:100] or "tenant"


async def _unique_slug(db, base: str) -> str:
    slug, i = base, 1
    while (await db.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none():
        slug = f"{base}-{i}"; i += 1
    return slug


async def _owner_email(db, tenant_id) -> str | None:
    r = await db.execute(
        select(User.email).where(User.tenant_id == tenant_id, User.role == UserRole.OWNER).limit(1)
    )
    return r.scalar_one_or_none()


async def _to_resp(db, t: Tenant) -> TenantAdminResponse:
    cnt = await db.scalar(select(func.count()).select_from(User).where(User.tenant_id == t.id))
    resp = TenantAdminResponse.model_validate(t)
    resp.user_count = cnt or 0
    resp.owner_email = await _owner_email(db, t.id)
    return resp


@router.get("/modules", response_model=list[str])
async def list_modules(_: User = Depends(require_platform_admin)):
    """Daftar modul yang bisa di-flag per tenant."""
    return FEATURE_MODULES


@router.get("/tenants", response_model=list[TenantAdminResponse])
async def list_tenants(_: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)):
    tenants = (await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))).scalars().all()
    return [await _to_resp(db, t) for t in tenants]


@router.post("/tenants", response_model=TenantAdminResponse, status_code=status.HTTP_201_CREATED)
async def provision_tenant(payload: TenantProvision, _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)):
    # email owner unik lintas semua tenant
    if (await db.execute(select(User).where(User.email == payload.owner_email))).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email owner sudah terpakai")
    slug = await _unique_slug(db, _slugify(payload.slug or payload.name))
    if payload.feature_flags is not None:
        bad = [f for f in payload.feature_flags if f not in FEATURE_MODULES]
        if bad:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Modul tak dikenal: {bad}")
    tenant = Tenant(
        name=payload.name, slug=slug, company_name=payload.name,
        status=payload.status, subscription_plan=payload.subscription_plan,
        expires_at=payload.expires_at, feature_flags=payload.feature_flags, is_active=True,
    )
    db.add(tenant); await db.flush()
    owner = User(
        email=payload.owner_email, hashed_password=get_password_hash(payload.owner_password),
        full_name=payload.owner_full_name, role=UserRole.OWNER, tenant_id=tenant.id, is_active=True,
    )
    db.add(owner); await db.flush()
    return await _to_resp(db, tenant)


@router.get("/tenants/{tid}", response_model=TenantAdminResponse)
async def get_tenant(tid: uuid.UUID, _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(Tenant).where(Tenant.id == tid))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tenant tidak ditemukan")
    return await _to_resp(db, t)


@router.get("/tenants/{tid}/users", response_model=list[TenantUserRow])
async def tenant_users(tid: uuid.UUID, _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(User).where(User.tenant_id == tid).order_by(User.role))).scalars().all()
    return rows


@router.patch("/tenants/{tid}", response_model=TenantAdminResponse)
async def update_tenant(tid: uuid.UUID, payload: TenantAdminUpdate, _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(Tenant).where(Tenant.id == tid))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tenant tidak ditemukan")
    data = payload.model_dump(exclude_unset=True)
    if data.get("feature_flags") is not None:
        bad = [f for f in data["feature_flags"] if f not in FEATURE_MODULES]
        if bad:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Modul tak dikenal: {bad}")
    for f, v in data.items():
        setattr(t, f, v)
    await db.flush()
    return await _to_resp(db, t)


@router.post("/tenants/{tid}/reset-owner-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_owner_password(tid: uuid.UUID, payload: ResetOwnerPassword, _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)):
    owner = (await db.execute(
        select(User).where(User.tenant_id == tid, User.role == UserRole.OWNER).limit(1)
    )).scalar_one_or_none()
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Owner tenant tidak ditemukan")
    owner.hashed_password = get_password_hash(payload.new_password)
    await db.flush()
