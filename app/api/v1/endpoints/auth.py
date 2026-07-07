from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token
)
from app.schemas.auth import UserRegister, UserLogin, Token, TokenRefresh, UserResponse
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole
from app.api.deps import get_current_context, AuthContext
from datetime import date
import re

router = APIRouter()


def _tenant_block_reason(tenant: Tenant | None) -> str | None:
    """Alasan tenant tak boleh login (langganan). None = boleh."""
    if tenant is None:
        return "Tenant tidak ditemukan"
    if not tenant.is_active:
        return "Langganan dinonaktifkan. Hubungi admin."
    if tenant.status == TenantStatus.SUSPENDED:
        return "Akun disuspend. Hubungi admin."
    if tenant.expires_at and tenant.expires_at < date.today():
        return "Masa langganan telah berakhir. Hubungi admin untuk perpanjangan."
    return None


def slugify(name: str) -> str:
    """Convert company name to URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug[:100]


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user and create their Tenant."""
    # Check email already exists
    result = await db.execute(select(User).where(User.email == payload.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create Tenant
    company = payload.company_name or f"{payload.full_name}'s Company"
    base_slug = slugify(company)

    # Ensure slug is unique
    slug = base_slug
    counter = 1
    while True:
        result = await db.execute(select(Tenant).where(Tenant.slug == slug))
        if not result.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    tenant = Tenant(
        name=company,
        slug=slug,
        status=TenantStatus.TRIAL,
        company_name=company,
    )
    db.add(tenant)
    await db.flush()  # get tenant.id

    # Create User as OWNER of tenant
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=UserRole.OWNER,
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


@router.post("/login", response_model=Token)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """Login and return access + refresh tokens."""
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password salah"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun tidak aktif"
        )

    # Gate langganan tenant (super-admin platform lolos: tenant 'platform' selalu aktif)
    tenant = (await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))).scalar_one_or_none()
    reason = _tenant_block_reason(tenant)
    if reason and not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    access_token = create_access_token({"sub": str(user.id), "tenant_id": str(user.tenant_id)})
    refresh_token = create_refresh_token({"sub": str(user.id), "tenant_id": str(user.tenant_id)})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(
    payload: TokenRefresh,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token."""
    token_data = decode_token(payload.refresh_token)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token tidak valid"
        )

    result = await db.execute(select(User).where(User.id == token_data["sub"]))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User tidak ditemukan"
        )

    # Gate langganan juga saat refresh → suspend berlaku dalam ≤ masa access token
    tenant = (await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))).scalar_one_or_none()
    reason = _tenant_block_reason(tenant)
    if reason and not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    access_token = create_access_token({"sub": str(user.id), "tenant_id": str(user.tenant_id)})
    refresh_token = create_refresh_token({"sub": str(user.id), "tenant_id": str(user.tenant_id)})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
async def get_me(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Return the currently authenticated user."""
    result = await db.execute(select(User).where(User.id == ctx.user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User tidak ditemukan",
        )
    tenant = (await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))).scalar_one_or_none()
    resp = UserResponse.model_validate(user)
    if tenant is not None:
        resp.tenant_name = tenant.name
        resp.tenant_slug = tenant.slug
        resp.tenant_status = tenant.status.value
        resp.feature_flags = tenant.feature_flags
    return resp
