from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.tenant import Tenant

router = APIRouter()


@router.get("/tenant/{slug}")
async def tenant_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    """Info publik tenant (untuk branding halaman login per subdomain). Tanpa auth.

    Hanya expose data non-sensitif: nama & slug. 404 bila tak ada / nonaktif.
    """
    t = (await db.execute(
        select(Tenant).where(Tenant.slug == slug)
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Office Digital tidak ditemukan")
    return {"name": t.name, "slug": t.slug}
