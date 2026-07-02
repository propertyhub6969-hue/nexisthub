import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_password_hash
from app.api.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.user import (
    TeamMemberCreate, TeamMemberUpdate, TeamMemberResponse, ASSIGNABLE_ROLES,
)

router = APIRouter()

# Only owner/admin may manage the team.
ManagerDep = Depends(require_role(UserRole.OWNER, UserRole.ADMIN))


def _assert_can_assign(actor: User, role: UserRole) -> None:
    """Validate that `actor` is allowed to grant `role`."""
    if role not in ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role tidak dapat diberikan (OWNER hanya diset saat registrasi)",
        )
    # An admin may not create/appoint another admin — only the owner can.
    if actor.role == UserRole.ADMIN and role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya OWNER yang boleh mengangkat ADMIN",
        )


def _assert_can_modify_target(actor: User, target: User) -> None:
    """Validate that `actor` is allowed to modify `target`."""
    if target.id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tidak dapat mengubah akun sendiri di sini — gunakan menu profil",
        )
    if target.role == UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun OWNER tidak dapat diubah",
        )
    # An admin may not modify another admin.
    if actor.role == UserRole.ADMIN and target.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ADMIN tidak dapat mengubah ADMIN lain",
        )


async def _get_member(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> User:
    member = (
        await db.execute(
            select(User).where(User.id == user_id, User.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anggota tidak ditemukan")
    return member


@router.get("/users", response_model=list[TeamMemberResponse])
async def list_users(actor: User = ManagerDep, db: AsyncSession = Depends(get_db)):
    """List all team members within the caller's tenant."""
    rows = (
        await db.execute(
            select(User).where(User.tenant_id == actor.tenant_id).order_by(User.created_at)
        )
    ).scalars().all()
    return rows


@router.post("/users", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: TeamMemberCreate,
    actor: User = ManagerDep,
    db: AsyncSession = Depends(get_db),
):
    """Create a team member with an initial password (shared manually by the admin)."""
    _assert_can_assign(actor, payload.role)

    exists = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email sudah terdaftar",
        )

    member = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=payload.role,
        tenant_id=actor.tenant_id,
        is_active=True,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.patch("/users/{user_id}", response_model=TeamMemberResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: TeamMemberUpdate,
    actor: User = ManagerDep,
    db: AsyncSession = Depends(get_db),
):
    """Update a team member's name, role, or active status."""
    member = await _get_member(db, actor.tenant_id, user_id)
    _assert_can_modify_target(actor, member)

    if payload.role is not None:
        _assert_can_assign(actor, payload.role)
        member.role = payload.role
    if payload.full_name is not None:
        member.full_name = payload.full_name
    if payload.phone is not None:
        member.phone = payload.phone
    if payload.is_active is not None:
        member.is_active = payload.is_active

    await db.commit()
    await db.refresh(member)
    return member
