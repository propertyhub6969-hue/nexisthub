"""Buat / promosikan akun super-admin platform (Control Plane).

Jalankan di dalam container backend, mis.:
    docker exec nexisthub_backend python scripts/make_superadmin.py admin@nexisthub.id
Password: argumen ke-2, atau di-generate acak & ditampilkan sekali.
Idempotent: kalau user sudah ada, hanya set is_platform_admin=True (dan reset password bila diberi).
"""
import asyncio
import secrets
import sys

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole

PLATFORM_SLUG = "platform"


async def main(email: str, password: str | None):
    generated = None
    if not password:
        generated = secrets.token_urlsafe(12)
        password = generated
    async with AsyncSessionLocal() as db:
        # tenant "platform" sbg wadah super-admin (User.tenant_id NOT NULL)
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == PLATFORM_SLUG))).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(name="Platform", slug=PLATFORM_SLUG, status=TenantStatus.ACTIVE,
                            company_name="NexistHub Platform", is_active=True)
            db.add(tenant); await db.flush()

        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            user = User(email=email, hashed_password=get_password_hash(password),
                        full_name="Platform Admin", role=UserRole.OWNER,
                        tenant_id=tenant.id, is_active=True, is_platform_admin=True)
            db.add(user)
            action = "DIBUAT"
        else:
            user.is_platform_admin = True
            user.is_active = True
            if generated is None:  # password diberi eksplisit → reset
                user.hashed_password = get_password_hash(password)
            action = "DIPROMOSIKAN jadi super-admin"
        await db.commit()

    print(f"OK: {email} {action}.")
    if generated is not None and action == "DIBUAT":
        print(f"PASSWORD (simpan, tampil sekali): {generated}")
    elif generated is not None:
        print("(user sudah ada; password TIDAK diubah — beri argumen password bila mau reset)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/make_superadmin.py <email> [password]"); sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
