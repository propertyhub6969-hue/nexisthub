import uuid
from dataclasses import dataclass
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User, UserRole

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


# Reusable dependency tuple
CurrentUserDep = Depends(get_current_user_id)
CurrentContextDep = Depends(get_current_context)
DBDep = Depends(get_db)
