import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.notification import Notification, NotificationKind
from app.models.user import User


class NotificationResponse(BaseModel):
    id: uuid.UUID
    kind: NotificationKind
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    is_read: bool
    actor_name: Optional[str] = None
    created_at: datetime


router = APIRouter()


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    only_unread: bool = Query(False),
    limit: int = Query(30, le=100),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Riwayat notifikasi MILIK SAYA — terbaru dulu."""
    conds = [Notification.tenant_id == ctx.tenant_id, Notification.user_id == ctx.user_id]
    if only_unread:
        conds.append(Notification.is_read == False)  # noqa: E712
    rows = (await db.execute(
        select(Notification, User.full_name)
        .outerjoin(User, User.id == Notification.actor_id)
        .where(*conds)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )).all()
    return [
        NotificationResponse(
            id=n.id, kind=n.kind, title=n.title, body=n.body, link=n.link,
            is_read=n.is_read, actor_name=actor, created_at=n.created_at,
        )
        for n, actor in rows
    ]


@router.get("/unread-count")
async def unread_count(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Jumlah notifikasi belum dibaca — utk badge lonceng."""
    count = await db.scalar(select(func.count()).select_from(Notification).where(
        Notification.tenant_id == ctx.tenant_id, Notification.user_id == ctx.user_id,
        Notification.is_read == False))  # noqa: E712
    return {"count": count or 0}


@router.post("/{notif_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(notif_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Tandai satu notifikasi dibaca (hanya milik sendiri)."""
    n = (await db.execute(select(Notification).where(
        Notification.id == notif_id, Notification.tenant_id == ctx.tenant_id,
        Notification.user_id == ctx.user_id))).scalar_one_or_none()
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notifikasi tidak ditemukan")
    if not n.is_read:
        n.is_read = True
        n.read_at = datetime.now(timezone.utc)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Tandai semua notifikasi saya dibaca."""
    await db.execute(
        update(Notification)
        .where(Notification.tenant_id == ctx.tenant_id, Notification.user_id == ctx.user_id,
               Notification.is_read == False)  # noqa: E712
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
