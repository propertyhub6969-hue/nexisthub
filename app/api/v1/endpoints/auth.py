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
import re

router = APIRouter()


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
   