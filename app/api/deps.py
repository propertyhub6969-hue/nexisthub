import uuid
from dataclasses import dataclass
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User, UserRole
from app.models.tenant import Tenant

security = HTTPBearer()


@dataclass
class AuthContext:
    """Identity extracted from a validated access token."""
    user_id: uuid.UUID
    tenant_id: uuid.UUID


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Extract and validate user ID from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(credentials.credentials)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    token_type: str = payload.get("type")
    if token_type != "access":
        raise credentials_exception

    return user_id


async def get_current_context(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthContext:
    """Validate the access token and return the caller's user + tenant identity."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise credentials_exception

    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")
    if user_id is None or tenant_id is None:
        raise credentials_exception

    try:
        return AuthContext(user_id=uuid.UUID(user_id), tenant_id=uuid.UUID(tenant_id))
    except (ValueError, TypeError):
        raise credentials_exception


async def get_current_user(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Load the authenticated user's row so role and active status are always live.

    Unlike get_current_context (token-only, cheap), this hits the DB — use it for
    role-gated actions where a demotion/deactivation must take effect immediately.
    """
    user = (
        await db.execute(
            select(User).where(User.id == ctx.user_id, User.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User tidak ditemukan atau non-aktif",
        )
    return user


def require_role(*roles: UserRole):
    """Dependency factory: allow only the given roles. Returns the loaded User."""
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Anda tidak memiliki akses untuk aksi ini",
            )
        return user
    return checker


def require_feature(*modules: str):
    """Dependency factory: tolak bila TIDAK ada satu pun `modules` di feature_flags tenant.

    `feature_flags = None` artinya SEMUA modul aktif (default tenant lama) → selalu lolos.
    """
    async def checker(
        ctx: AuthContext = Depends(get_current_context),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one_or_none()
        if tenant is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Tenant tidak ditemukan")
        flags = tenant.feature_flags
        if flags is None:
            return  # semua modul aktif
        if not any(m in flags for m in modules):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Modul '{modules[0]}' tidak termasuk paket langganan Anda",
            )
    return checker


def guard(*write_roles: UserRole, read: tuple = ()):
    """RBAC level-router yang sadar-metode.

    - write_roles: role yang boleh SEMUA method (baca & tulis).
    - read: role tambahan yang HANYA boleh baca (GET/HEAD/OPTIONS).
    Role di luar keduanya → 403. Isolasi antar-tenant tetap via tenant_id di query.
    """
    read_roles = set(write_roles) | set(read)

    async def checker(request: Request, user: User = Depends(get_current_user)) -> None:
        allowed = read_roles if request.method in ("GET", "HEAD", "OPTIONS") else set(write_roles)
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Role Anda tidak memiliki akses untuk aksi ini",
            )
    return checker


async def require_platform_admin(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Control Plane: hanya super-admin platform (lintas-tenant). SENGAJA tak scope tenant_id.

    Ini satu-satunya jalur yang boleh melihat/mengubah data lintas tenant — dijaga ketat.
    """
    user = (await db.execute(select(User).where(User.id == ctx.user_id))).scalar_one_or_none()
    if user is None or not user.is_active or not user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Khusus super-admin platform",
        )
    return user


# Reusable dependency tuple
CurrentUserDep = Depends(get_current_user_id)
CurrentContextDep = Depends(get_current_context)
DBDep = Depends(get_db)
