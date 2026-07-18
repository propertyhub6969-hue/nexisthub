import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Request
from fastapi.responses import Response
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.core import storage
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext
from app.models.tax import Notary, TaxRecord, NotaryFee
from app.schemas.tax import (
    NotaryCreate, NotaryUpdate, NotaryResponse,
    TaxCreate, TaxUpdate, TaxResponse, TaxBulkCreate,
    FeeCreate, FeeUpdate, FeeResponse,
)

router = APIRouter()

NOTDEL = lambda m: m.is_deleted == False  # noqa: E731, E712
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


async def _soft_delete(db, obj):
    obj.is_deleted = True
    obj.deleted_at = datetime.utcnow()


# ═══════════════════════ NOTARIES ═══════════════════════
@router.get("/notaries", response_model=list[NotaryResponse])
async def list_notaries(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Notary).where(Notary.tenant_id == ctx.tenant_id, NOTDEL(Notary)).order_by(Notary.name))
    return r.scalars().all()


@router.post("/notaries", response_model=NotaryResponse, status_code=status.HTTP_201_CREATED)
async def create_notary(payload: NotaryCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    n = Notary(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(n); await db.flush(); await db.refresh(n)
    return n


async def _get_notary(db, tenant_id, notary_id) -> Notary:
    n = (await db.execute(select(Notary).where(Notary.id == notary_id, Notary.tenant_id == tenant_id, NOTDEL(Notary)))).scalar_one_or_none()
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notaris tidak ditemukan")
    return n


@router.patch("/notaries/{notary_id}", response_model=NotaryResponse)
async def update_notary(notary_id: uuid.UUID, payload: NotaryUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    n = await _get_notary(db, ctx.tenant_id, notary_id)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(n, f, v)
    await db.flush(); await db.refresh(n)
    return n


@router.delete("/notaries/{notary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notary(notary_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    n = await _get_notary(db, ctx.tenant_id, notary_id)
    await _soft_delete(db, n)


# ═══════════════════════ TAX RECORDS ═══════════════════════
@router.get("/tax-records", response_model=list[TaxResponse])
async def list_tax(client_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(TaxRecord).options(selectinload(TaxRecord.notary))
        .where(TaxRecord.client_id == client_id, TaxRecord.tenant_id == ctx.tenant_id, NOTDEL(TaxRecord))
        .order_by(TaxRecord.tax_type)
    )
    return r.scalars().all()


async def _load_tax(db, tenant_id, tax_id) -> TaxRecord:
    t = (await db.execute(
        select(TaxRecord).options(selectinload(TaxRecord.notary))
        .where(TaxRecord.id == tax_id, TaxRecord.tenant_id == tenant_id, NOTDEL(TaxRecord))
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Data pajak tidak ditemukan")
    return t


@router.post("/tax-records", response_model=TaxResponse, status_code=status.HTTP_201_CREATED)
async def create_tax(payload: TaxCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = TaxRecord(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(t); await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "tax_records", t.id, new_data=payload)
    return await _load_tax(db, ctx.tenant_id, t.id)


@router.post("/tax-records/bulk", response_model=list[TaxResponse], status_code=status.HTTP_201_CREATED)
async def bulk_upsert_tax(payload: TaxBulkCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Entry cepat: checklist pajak (PPh/PPN/BPHTB) dalam satu form. Per jenis: sudah ada → update, belum → buat."""
    existing = (await db.execute(
        select(TaxRecord).where(TaxRecord.client_id == payload.client_id, TaxRecord.tenant_id == ctx.tenant_id, NOTDEL(TaxRecord))
    )).scalars().all()
    by_type = {t.tax_type: t for t in existing}

    result: list[TaxRecord] = []
    for item in payload.items:
        data = item.model_dump()
        t = by_type.get(item.tax_type)
        if t is not None:                        # jenis sudah ada → update
            for f, v in data.items():
                setattr(t, f, v)
            action = "UPDATE"
        else:                                     # baru → buat
            t = TaxRecord(tenant_id=ctx.tenant_id, client_id=payload.client_id, **data)
            db.add(t)
            by_type[item.tax_type] = t
            action = "CREATE"
        await db.flush()
        await record_audit(db, ctx.tenant_id, ctx.user_id, action, "tax_records", t.id,
                           new_data={"tax_type": t.tax_type.value, "amount": str(t.amount)})
        result.append(t)

    ids = [t.id for t in result]
    rows = (await db.execute(
        select(TaxRecord).options(selectinload(TaxRecord.notary)).where(TaxRecord.id.in_(ids))
    )).scalars().all()
    order = {tid: i for i, tid in enumerate(ids)}
    rows.sort(key=lambda r: order[r.id])
    return rows


@router.patch("/tax-records/{tax_id}", response_model=TaxResponse)
async def update_tax(tax_id: uuid.UUID, payload: TaxUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = await _load_tax(db, ctx.tenant_id, tax_id)
    data = payload.model_dump(exclude_unset=True)
    for f, v in data.items():
        setattr(t, f, v)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "tax_records", tax_id, new_data=data)
    return await _load_tax(db, ctx.tenant_id, tax_id)


@router.delete("/tax-records/{tax_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tax(tax_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    t = await _load_tax(db, ctx.tenant_id, tax_id)
    await _soft_delete(db, t)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "tax_records", tax_id,
                       old_data={"tax_type": t.tax_type.value, "ntpn": t.ntpn})


@router.post("/tax-records/{tax_id}/file", response_model=TaxResponse)
async def upload_tax_file(
    tax_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Upload bukti pajak (SSP/bukti bayar/bukti validasi) untuk satu baris pajak."""
    t = await _load_tax(db, ctx.tenant_id, tax_id)
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
    t.file_key = storage.build_key(ctx.tenant_id, "tax", t.id, file.filename)
    await storage.put(t.file_key, data, file.content_type)
    t.file_data = None
    t.file_name = file.filename
    t.file_type = file.content_type or "application/octet-stream"
    t.file_size = len(data)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "tax_records", tax_id,
                       new_data={"file_name": file.filename, "size": len(data)})
    return await _load_tax(db, ctx.tenant_id, tax_id)


@router.get("/tax-records/{tax_id}/file")
async def download_tax_file(
    tax_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    meta = (await db.execute(
        select(TaxRecord.file_size, TaxRecord.file_type, TaxRecord.file_name, TaxRecord.updated_at, TaxRecord.file_key).where(
            TaxRecord.id == tax_id, TaxRecord.tenant_id == ctx.tenant_id, NOTDEL(TaxRecord))
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    size, ctype, fname, updated, fkey = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    if fkey:
        data = await storage.get(fkey)
    else:
        data = (await db.execute(
            select(TaxRecord.file_data).where(TaxRecord.id == tax_id, TaxRecord.tenant_id == ctx.tenant_id)
        )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, ctype, fname, etag)


@router.post("/tax-records/{tax_id}/id-billing-file", response_model=TaxResponse)
async def upload_tax_id_billing_file(
    tax_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Upload bukti ID Billing (kode billing DJP) — terpisah dari bukti bayar; dipakai utk PPh."""
    t = await _load_tax(db, ctx.tenant_id, tax_id)
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
    t.id_billing_file_key = storage.build_key(ctx.tenant_id, "tax", t.id, file.filename)
    await storage.put(t.id_billing_file_key, data, file.content_type)
    t.id_billing_file_data = None
    t.id_billing_file_name = file.filename
    t.id_billing_file_type = file.content_type or "application/octet-stream"
    t.id_billing_file_size = len(data)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "tax_records", tax_id,
                       new_data={"id_billing_file_name": file.filename, "size": len(data)})
    return await _load_tax(db, ctx.tenant_id, tax_id)


@router.get("/tax-records/{tax_id}/id-billing-file")
async def download_tax_id_billing_file(
    tax_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    meta = (await db.execute(
        select(TaxRecord.id_billing_file_size, TaxRecord.id_billing_file_type,
               TaxRecord.id_billing_file_name, TaxRecord.updated_at, TaxRecord.id_billing_file_key).where(
            TaxRecord.id == tax_id, TaxRecord.tenant_id == ctx.tenant_id, NOTDEL(TaxRecord))
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    size, ctype, fname, updated, fkey = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    if fkey:
        data = await storage.get(fkey)
    else:
        data = (await db.execute(
            select(TaxRecord.id_billing_file_data).where(TaxRecord.id == tax_id, TaxRecord.tenant_id == ctx.tenant_id)
        )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, ctype, fname, etag)


@router.post("/tax-records/{tax_id}/validation-file", response_model=TaxResponse)
async def upload_tax_validation_file(
    tax_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Upload bukti validasi pajak (dari kantor pajak) — terpisah dari bukti bayar & ID Billing; dipakai utk PPh."""
    t = await _load_tax(db, ctx.tenant_id, tax_id)
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
    t.validation_file_key = storage.build_key(ctx.tenant_id, "tax", t.id, file.filename)
    await storage.put(t.validation_file_key, data, file.content_type)
    t.validation_file_data = None
    t.validation_file_name = file.filename
    t.validation_file_type = file.content_type or "application/octet-stream"
    t.validation_file_size = len(data)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "tax_records", tax_id,
                       new_data={"validation_file_name": file.filename, "size": len(data)})
    return await _load_tax(db, ctx.tenant_id, tax_id)


@router.get("/tax-records/{tax_id}/validation-file")
async def download_tax_validation_file(
    tax_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    meta = (await db.execute(
        select(TaxRecord.validation_file_size, TaxRecord.validation_file_type,
               TaxRecord.validation_file_name, TaxRecord.updated_at, TaxRecord.validation_file_key).where(
            TaxRecord.id == tax_id, TaxRecord.tenant_id == ctx.tenant_id, NOTDEL(TaxRecord))
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    size, ctype, fname, updated, fkey = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    if fkey:
        data = await storage.get(fkey)
    else:
        data = (await db.execute(
            select(TaxRecord.validation_file_data).where(TaxRecord.id == tax_id, TaxRecord.tenant_id == ctx.tenant_id)
        )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, ctype, fname, etag)


# ═══════════════════════ NOTARY FEES ═══════════════════════
@router.get("/notary-fees", response_model=list[FeeResponse])
async def list_fees(client_id: uuid.UUID = Query(...), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    r = await db.execute(
        select(NotaryFee).options(selectinload(NotaryFee.notary))
        .where(NotaryFee.client_id == client_id, NotaryFee.tenant_id == ctx.tenant_id, NOTDEL(NotaryFee))
        .order_by(NotaryFee.created_at)
    )
    return r.scalars().all()


async def _load_fee(db, tenant_id, fee_id) -> NotaryFee:
    f = (await db.execute(
        select(NotaryFee).options(selectinload(NotaryFee.notary))
        .where(NotaryFee.id == fee_id, NotaryFee.tenant_id == tenant_id, NOTDEL(NotaryFee))
    )).scalar_one_or_none()
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Biaya notaris tidak ditemukan")
    return f


@router.post("/notary-fees", response_model=FeeResponse, status_code=status.HTTP_201_CREATED)
async def create_fee(payload: FeeCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    f = NotaryFee(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(f); await db.flush()
    return await _load_fee(db, ctx.tenant_id, f.id)


@router.patch("/notary-fees/{fee_id}", response_model=FeeResponse)
async def update_fee(fee_id: uuid.UUID, payload: FeeUpdate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    f = await _load_fee(db, ctx.tenant_id, fee_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(f, k, v)
    await db.flush()
    return await _load_fee(db, ctx.tenant_id, fee_id)


@router.delete("/notary-fees/{fee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fee(fee_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    f = await _load_fee(db, ctx.tenant_id, fee_id)
    await _soft_delete(db, f)
