import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_context, AuthContext
from app.models.audit import AuditLog

router = APIRouter()


class AuditResponse(BaseModel):
    id: uuid.UUID
    action: str
    resource: str
    resource_id: Optional[str] = None
    old_data: Optional[str] = None
    new_data: Optional[str] = None
    user_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=list[AuditResponse])
async def list_audit(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
    resource: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    client_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Riwayat perubahan data (audit trail), terbaru dulu.
    `client_id` mengambil SEMUA riwayat terkait pembeli (data pembeli + pembayaran + termin)."""
    conditions = [AuditLog.tenant_id == ctx.tenant_id]
    if resource:
        conditions.append(AuditLog.resource == resource)
    if resource_id:
        conditions.append(AuditLog.resource_id == str(resource_id))
    if client_id:
        conditions.append(AuditLog.client_id == client_id)

    result = await db.execute(
        select(AuditLog).options(selectinload(AuditLog.user))
        .where(*conditions).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    return result.scalars().all()
