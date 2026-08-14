import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.announcement import Announcement, AnnouncementDismissal
from app.schemas.announcement import AnnouncementPublic

router = APIRouter()


@router.get("/active", response_model=list[AnnouncementPublic])
async def active_announcements(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Pengumuman aktif dalam jendela tayang yang BELUM ditutup user ini (untuk popup)."""
    now = datetime.now(timezone.utc)
    dismissed = select(AnnouncementDismissal.announcement_id).where(AnnouncementDismissal.user_id == ctx.user_id)
    rows = (await db.execute(
        select(Announcement).where(
            Announcement.is_active == True,  # noqa: E712
            (Announcement.starts_at == None) | (Announcement.starts_at <= now),  # noqa: E711
            (Announcement.ends_at == None) | (Announcement.ends_at >= now),      # noqa: E711
            Announcement.id.notin_(dismissed),
        ).order_by(Announcement.created_at.desc())
    )).scalars().all()
    return rows


@router.post("/{announcement_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_announcement(announcement_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Tandai satu pengumuman sudah ditutup oleh user ini → tak muncul lagi. Idempoten."""
    stmt = pg_insert(AnnouncementDismissal).values(
        id=uuid.uuid4(), announcement_id=announcement_id, user_id=ctx.user_id,
    ).on_conflict_do_nothing(constraint="uq_announcement_user")
    await db.execute(stmt)
    await db.commit()
