import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.api.deps import get_current_context, AuthContext
from app.models.document import Document
from app.models.property import Unit
from app.models.marketing import Client
from app.schemas.document import DocumentCreate, DocumentUpdate, DocumentResponse, DocumentBulkCreate

router = APIRouter()

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


async def _get_doc(db, tenant_id, doc_id) -> Document:
    d = (await db.execute(
        select(Document).where(Document.id == doc_id, Document.tenant_id == tenant_id,
                               Document.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dokumen tidak ditemukan")
    return d


@router.get("/documents", response_model=list[DocumentResponse])
async def list_documents(
    client_id: uuid.UUID = Query(None),
    unit_id: uuid.UUID = Query(None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Daftar dokumen — beri client_id (berkas pembeli) ATAU unit_id (legalitas unit)."""
    if not client_id and not unit_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Sertakan client_id atau unit_id")
    conds = [Document.tenant_id == ctx.tenant_id, Document.is_deleted == False]  # noqa: E712
    if client_id:
        conds.append(Document.client_id == client_id)
    if unit_id:
        conds.append(Document.unit_id == unit_id)
    r = await db.execute(select(Document).where(*conds).order_by(Document.created_at))
    return r.scalars().all()


async def _sync_unit_land_area(db, tenant_id, d: Document) -> None:
    """LT dari dokumen legalitas = sumber valid → sinkronkan ke Unit.land_area."""
    if d.unit_id is None or d.land_area is None:
        return
    u = (await db.execute(select(Unit).where(Unit.id == d.unit_id, Unit.tenant_id == tenant_id))).scalar_one_or_none()
    if u is not None:
        u.land_area = d.land_area


@router.post("/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    payload: DocumentCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    d = Document(tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(d)
    await db.flush()
    await _sync_unit_land_area(db, ctx.tenant_id, d)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "documents", d.id, new_data=payload)
    await db.refresh(d)
    return d


@router.post("/documents/bulk", response_model=list[DocumentResponse], status_code=status.HTTP_201_CREATED)
async def bulk_upsert_documents(
    payload: DocumentBulkCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Entry dokumen dalam satu form (checklist) — untuk legalitas unit (unit_id) ATAU berkas pembeli (client_id).
    Per jenis: kalau sudah ada → di-update, kalau belum → dibuat. File diunggah terpisah (per baris)."""
    if payload.unit_id:
        owner = (await db.execute(
            select(Unit).where(Unit.id == payload.unit_id, Unit.tenant_id == ctx.tenant_id)
        )).scalar_one_or_none()
        if owner is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
        owner_filter = Document.unit_id == payload.unit_id
        owner_kwargs = {"unit_id": payload.unit_id}
    else:
        owner = (await db.execute(
            select(Client).where(Client.id == payload.client_id, Client.tenant_id == ctx.tenant_id,
                                 Client.is_deleted == False)  # noqa: E712
        )).scalar_one_or_none()
        if owner is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembeli tidak ditemukan")
        owner_filter = Document.client_id == payload.client_id
        owner_kwargs = {"client_id": payload.client_id}

    # dokumen yang sudah ada (untuk merge per jenis)
    existing = (await db.execute(
        select(Document).where(
            owner_filter, Document.tenant_id == ctx.tenant_id,
            Document.is_deleted == False)  # noqa: E712
    )).scalars().all()
    by_type = {d.doc_type.strip().lower(): d for d in existing}

    result: list[Document] = []
    for item in payload.items:
        data = item.model_dump()
        key = item.doc_type.strip().lower()
        d = by_type.get(key)
        if d is not None:                       # jenis sudah ada → update
            for f, v in data.items():
                setattr(d, f, v)
            action = "UPDATE"
        else:                                   # baru → buat
            d = Document(tenant_id=ctx.tenant_id, **owner_kwargs, **data)
            db.add(d)
            by_type[key] = d
            action = "CREATE"
        await db.flush()
        await _sync_unit_land_area(db, ctx.tenant_id, d)
        await record_audit(db, ctx.tenant_id, ctx.user_id, action, "documents", d.id,
                           new_data={"doc_type": d.doc_type, "status": d.status.value})
        result.append(d)

    for d in result:
        await db.refresh(d)
    return result


@router.patch("/documents/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: uuid.UUID,
    payload: DocumentUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    d = await _get_doc(db, ctx.tenant_id, doc_id)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(d, f, v)
    await db.flush()
    await _sync_unit_land_area(db, ctx.tenant_id, d)
    await db.refresh(d)
    return d


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    d = await _get_doc(db, ctx.tenant_id, doc_id)
    d.is_deleted = True
    d.deleted_at = datetime.utcnow()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "documents", doc_id,
                       old_data={"doc_type": d.doc_type, "file_name": d.file_name})


@router.post("/documents/{doc_id}/file", response_model=DocumentResponse)
async def upload_file(
    doc_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    d = await _get_doc(db, ctx.tenant_id, doc_id)
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
    d.file_data = data
    d.file_name = file.filename
    d.file_type = file.content_type or "application/octet-stream"
    d.file_size = len(data)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "documents", doc_id,
                       new_data={"file_name": file.filename, "size": len(data)})
    await db.refresh(d)
    return d


@router.get("/documents/{doc_id}/file")
async def download_file(
    doc_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    meta = (await db.execute(
        select(Document.file_size, Document.file_type, Document.file_name, Document.updated_at).where(
            Document.id == doc_id, Document.tenant_id == ctx.tenant_id, Document.is_deleted == False)  # noqa: E712
    )).first()
    if meta is None or meta[0] is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    size, ctype, fname, updated = meta
    etag = file_etag(size, updated)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = (await db.execute(
        select(Document.file_data).where(Document.id == doc_id, Document.tenant_id == ctx.tenant_id)
    )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, ctype, fname, etag)
