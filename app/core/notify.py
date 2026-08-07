"""Kirim notifikasi ke pengguna (riwayat tersimpan, bukan sekadar badge).

Prinsip:
- Fan-out: satu baris per PENERIMA → status dibaca/belum jadi sederhana & per-orang.
- Penerima dipilih per PERAN (ikut peran tambahan / multi-role), bukan daftar user manual.
- Notifikasi TAK PERNAH menggagalkan aksi utama — kegagalan di sini hanya dicatat, tak dilempar.
"""
import uuid
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationKind
from app.models.user import User, UserRole

# Yang berhak memvalidasi uang: menyetujui pembayaran masuk & menandai pengeluaran lunas.
EXPENSE_APPROVERS = (UserRole.OWNER, UserRole.ADMIN, UserRole.FINANCE)


def rp(n) -> str:
    """Format rupiah singkat utk isi notifikasi (mis. Rp 1.500.000)."""
    try:
        return "Rp " + f"{int(Decimal(n or 0)):,}".replace(",", ".")
    except Exception:
        return "Rp 0"


async def users_with_roles(db: AsyncSession, tenant_id, roles: Iterable[UserRole]) -> list[uuid.UUID]:
    """ID user aktif di tenant yg punya salah satu peran (termasuk lewat additional_roles)."""
    wanted = {r.value if isinstance(r, UserRole) else str(r) for r in roles}
    rows = (await db.execute(
        select(User.id, User.role, User.additional_roles).where(
            User.tenant_id == tenant_id, User.is_active == True)  # noqa: E712
    )).all()
    out = []
    for uid, role, extra in rows:
        have = {role.value if hasattr(role, "value") else str(role)} | set(extra or [])
        if have & wanted:
            out.append(uid)
    return out


async def notify(
    db: AsyncSession,
    tenant_id,
    user_ids: Iterable[uuid.UUID],
    kind: NotificationKind,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    actor_id: Optional[uuid.UUID] = None,
) -> int:
    """Buat notifikasi utk tiap penerima. Pemicu (actor) tak dinotifikasi ke dirinya sendiri."""
    n = 0
    try:
        for uid in user_ids:
            if actor_id and uid == actor_id:
                continue
            db.add(Notification(
                tenant_id=tenant_id, user_id=uid, actor_id=actor_id,
                kind=kind, title=title, body=body, link=link,
            ))
            n += 1
        if n:
            await db.flush()
    except Exception:  # notifikasi gagal TIDAK boleh membatalkan aksi utama
        return 0
    return n


async def notify_roles(
    db: AsyncSession, tenant_id, roles: Iterable[UserRole], kind: NotificationKind,
    title: str, body: Optional[str] = None, link: Optional[str] = None, actor_id=None,
) -> int:
    """Pintasan: kirim ke semua user dgn peran tertentu (mis. finance/owner/admin)."""
    try:
        uids = await users_with_roles(db, tenant_id, roles)
    except Exception:
        return 0
    return await notify(db, tenant_id, uids, kind, title, body, link, actor_id)
