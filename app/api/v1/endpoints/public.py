from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core import storage
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.models.tenant import Tenant
from app.models.tax import MonthlyTaxShareLink
from app.api.v1.endpoints.reporting import _build_monthly_tax_report, MonthlyTaxReport

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
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Kantor Digital tidak ditemukan")
    return {"name": t.name, "slug": t.slug}


@router.get("/tenant-logo/{slug}")
async def tenant_logo(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Logo perusahaan tenant — non-sensitif (branding), dilayani tanpa auth supaya bisa dipakai
    langsung sbg <img src> di dokumen cetak (BAST/Kwitansi/Pengajuan Pembayaran)."""
    meta = (await db.execute(
        select(Tenant.logo_size, Tenant.logo_type, Tenant.logo_name, Tenant.updated_at, Tenant.logo_key)
        .where(Tenant.slug == slug)
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Logo tidak ditemukan")
    size, ctype, fname, updated, fkey = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = await storage.get(fkey)
    return cached_file_response(data, ctype, fname, etag)


@router.get("/monthly-tax/{token}", response_model=MonthlyTaxReport)
async def public_monthly_tax(token: str, db: AsyncSession = Depends(get_db)):
    """Laporan Pajak Bulanan lewat tautan bertoken (tanpa login) — utk pihak luar (mis. konsultan pajak).
    404 bila token salah/sudah dicabut/kedaluwarsa. Setiap akses dicatat (last_accessed_at + access_count)."""
    link = (await db.execute(
        select(MonthlyTaxShareLink).where(MonthlyTaxShareLink.token == token)
    )).scalar_one_or_none()
    if link is None or not link.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan, sudah dicabut, atau kedaluwarsa")
    link.last_accessed_at = datetime.now(timezone.utc)
    link.access_count += 1
    await db.flush()
    return await _build_monthly_tax_report(db, link.tenant_id, link.month, link.project_id)
