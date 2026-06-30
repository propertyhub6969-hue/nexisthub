from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token
)
from app.schemas.auth import UserRegister, UserLogin, Token, TokenRefresh, UserResponse

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user (and create their tenant)."""
    # TODO Session 2: check duplicate email, create Tenant + User in DB
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Will be implemented in Session 2 after database models are ready"
    )


@router.post("/login", response_model=Token)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """Login with email + password, return JWT tokens."""
    # TODO Session 2: query user from DB, verify password
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Will be implemented in Session 2 after database models are ready"
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(payload: TokenRefresh):
    """Refresh access token using refresh token."""
    token_data = decode_token(payload.refresh_token)
    if not token_data or token_data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    user_id = token_data.get("sub")
    access_token = create_access_token(subject=user_id)
    new_refresh_token = create_refresh_token(subject=user_id)

    return Token(access_token=access_token, refresh_token=new_refresh_token)


@router.get("/status")
async def auth_status():
    """Health check for auth service."""
    return {"status": "ok", "service": "auth"}
