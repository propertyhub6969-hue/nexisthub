import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_password_hash
from app.core import storage
from app.api.deps import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.schemas.user import (
    TeamMemberCreate, TeamMemberUpdate, TeamMemberResponse, TeamMemberResetPassword, ASSIGNABLE_ROLES,
    TenantProfileUpdate, TenantProfileResponse,
)

MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB

router = APIRouter()

# Only owner/admin may manage the team.
ManagerDep = Depends(require_role(UserRole.OWNER, UserRole.ADMIN))


def _assert_can_assign(actor: User, roles: list[UserRole]) -> None:
    """Validate that `actor` is allowed to grant EVERY role in `roles` (peran utama + tambahan)."""
    for role in roles:
        if role not in ASSIGNABLE_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role tidak dapat diberikan (OWNER hanya diset saat registrasi)",
            )
    # An admin may not create/appoint another admin (baik sbg peran utama maupun tambahan) — only the owner can.
    if actor.role == UserRole.ADMIN and UserRole.ADMIN in roles:
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
    # An admin may not modify another admin — cek peran EFEKTIF target (utama + tambahan),
    # supaya proteksi ini tak bisa dilewati dgn menjadikan seseorang admin lewat peran tambahan.
    if actor.role == UserRole.ADMIN and UserRole.ADMIN.value in target.all_roles():
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
    extra_roles = [r for r in (payload.additional_roles or []) if r != payload.role]
    _assert_can_assign(actor, [payload.role, *extra_roles])

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
        additional_roles=[r.value for r in extra_roles] or None,
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
        _assert_can_assign(actor, [payload.role])
        member.role = payload.role
    if payload.additional_roles is not None:
        extra_roles = [r for r in payload.additional_roles if r != member.role]
        _assert_can_assign(actor, extra_roles)
        member.additional_roles = [r.value for r in extra_roles] or None
    if payload.full_name is not None:
        member.full_name = payload.full_name
    if payload.phone is not None:
        member.phone = payload.phone
    if payload.is_active is not None:
        member.is_active = payload.is_active

    await db.commit()
    await db.refresh(member)
    return member


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: uuid.UUID,
    payload: TeamMemberResetPassword,
    actor: User = ManagerDep,
    db: AsyncSession = Depends(get_db),
):
    """Admin/owner set ulang password anggota tim (mis. anggota lupa password) — tanpa perlu eskalasi ke platform admin."""
    member = await _get_member(db, actor.tenant_id, user_id)
    _assert_can_modify_target(actor, member)
    member.hashed_password = get_password_hash(payload.password)
    await db.commit()


# ── Profil perusahaan (nama, alamat, logo) — dipakai kop dokumen cetak ──
async def _get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    t = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tenant tidak ditemukan")
    return t


@router.get("/tenant", response_model=TenantProfileResponse)
async def get_tenant_profile(actor: User = ManagerDep, db: AsyncSession = Depends(get_db)):
    return await _get_tenant(db, actor.tenant_id)


@router.patch("/tenant", response_model=TenantProfileResponse)
async def update_tenant_profile(payload: TenantProfileUpdate, actor: User = ManagerDep, db: AsyncSession = Depends(get_db)):
    t = await _get_tenant(db, actor.tenant_id)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, f, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.post("/tenant/logo", response_model=TenantProfileResponse)
async def upload_tenant_logo(file: UploadFile = File(...), actor: User = ManagerDep, db: AsyncSession = Depends(get_db)):
    """Unggah logo perusahaan — dipakai di kop dokumen cetak (BAST, Kwitansi, Pengajuan Pembayaran)."""
    t = await _get_tenant(db, actor.tenant_id)
    data = await file.read()
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran logo maksimal 2 MB")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File harus berupa gambar")
    t.logo_key = storage.build_key(t.id, "tenant-logo", t.id, file.filename)
    await storage.put(t.logo_key, data, file.content_type)
    t.logo_name = file.filename
    t.logo_type = file.content_type or "application/octet-stream"
    t.logo_size = len(data)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/tenant/logo", response_model=TenantProfileResponse)
async def delete_tenant_logo(actor: User = ManagerDep, db: AsyncSession = Depends(get_db)):
    t = await _get_tenant(db, actor.tenant_id)
    t.logo_key = None
    t.logo_name = None
    t.logo_type = None
    t.logo_size = None
    await db.commit()
    await db.refresh(t)
    return t
