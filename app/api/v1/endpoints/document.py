import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Request, Form
from fastapi.responses import Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.core import storage
from app.api.deps import get_current_context, AuthContext, require_role
from app.models.user import UserRole, User
from app.models.document import (
    Document, DocumentHandover, HandoverEvent, DocStatus,
    CertificateSplitBatch, CertificateSplitBatchItem, SplitBatchStatus,
    DocumentProgressLog, ProgressEvent,
)
from app.models.property import Unit, Project
from app.models.marketing import Client
from app.models.tax import Notary
from app.models.kpr import Bank
from app.schemas.document import (
    DocumentCreate, DocumentUpdate, DocumentResponse, DocumentBulkCreate,
    HandoverCreate, HandoverResponse, UnitHandoverResult,
    SplitBatchCreate, SplitBatchUpdate, SplitBatchAddUnits, SplitBatchLinkResult,
    SplitBatchResponse, SplitBatchItemResponse,
    ProgressLogCreate, ProgressLogResponse,
)

router = APIRouter()

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


# ── Penguasaan dokumen ASLI (fisik): status = kejadian serah-terima TERAKHIR ──
HNOTDEL = DocumentHandover.is_deleted == False  # noqa: E712
_CUSTODY = {
    HandoverEvent.AMBIL: "diambil",
    HandoverEvent.SERAH_NOTARIS: "notaris",
    HandoverEvent.TERIMA_PEMBELI: "pembeli",
    HandoverEvent.TAHAN_BANK: "bank",
    HandoverEvent.KEMBALI_ARSIP: "arsip",
}


async def _attach_custody(db, tenant_id, docs) -> None:
    """Tempelkan custody_status/holder/since ke tiap Document (field transien utk response)."""
    for d in docs:
        d.custody_status, d.custody_holder, d.custody_since = "arsip", None, None
    ids = [d.id for d in docs]
    if not ids:
        return
    # kejadian terakhir per dokumen (urut tanggal lalu waktu catat)
    rows = (await db.execute(
        select(DocumentHandover, Notary.name, Bank.name, Client.full_name)
        .outerjoin(Notary, Notary.id == DocumentHandover.notary_id)
        .outerjoin(Bank, Bank.id == DocumentHandover.bank_id)
        .outerjoin(Client, Client.id == DocumentHandover.client_id)
        .where(DocumentHandover.document_id.in_(ids), DocumentHandover.tenant_id == tenant_id, HNOTDEL)
        .order_by(DocumentHandover.at, DocumentHandover.created_at)
    )).all()
    latest: dict = {}
    for h, nname, bname, cname in rows:
        latest[h.document_id] = (h, nname, bname, cname)  # baris terakhir menang = terbaru
    for d in docs:
        got = latest.get(d.id)
        if not got:
            continue
        h, nname, bname, cname = got
        d.custody_status = _CUSTODY.get(h.event, "arsip")
        d.custody_holder = nname or bname or cname
        d.custody_since = h.at


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
    project_id: uuid.UUID = Query(None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Daftar dokumen — beri client_id (berkas pembeli), unit_id (legalitas unit),
    ATAU project_id (perizinan proyek & sertifikat induk)."""
    if not client_id and not unit_id and not project_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Sertakan client_id, unit_id, atau project_id")
    conds = [Document.tenant_id == ctx.tenant_id, Document.is_deleted == False]  # noqa: E712
    if client_id:
        conds.append(Document.client_id == client_id)
    if unit_id:
        conds.append(Document.unit_id == unit_id)
    if project_id:
        conds.append(Document.project_id == project_id)
    r = await db.execute(select(Document).where(*conds).order_by(Document.created_at))
    docs = r.scalars().all()
    await _attach_custody(db, ctx.tenant_id, docs)
    return docs


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
    await _attach_custody(db, ctx.tenant_id, [d])
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
    await _attach_custody(db, ctx.tenant_id, result)
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
    await _attach_custody(db, ctx.tenant_id, [d])
    return d


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])  # hapus dokumen legalitas = owner/admin
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
    d.file_key = storage.build_key(ctx.tenant_id, "documents", d.id, file.filename)
    await storage.put(d.file_key, data, file.content_type)
    d.file_data = None  # file baru → MinIO
    d.file_name = file.filename
    d.file_type = file.content_type or "application/octet-stream"
    d.file_size = len(data)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "documents", doc_id,
                       new_data={"file_name": file.filename, "size": len(data)})
    await db.refresh(d)
    await _attach_custody(db, ctx.tenant_id, [d])
    return d


@router.get("/documents/{doc_id}/file")
async def download_file(
    doc_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    meta = (await db.execute(
        select(Document.file_size, Document.file_type, Document.file_name, Document.updated_at, Document.file_key).where(
            Document.id == doc_id, Document.tenant_id == ctx.tenant_id, Document.is_deleted == False)  # noqa: E712
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
            select(Document.file_data).where(Document.id == doc_id, Document.tenant_id == ctx.tenant_id)
        )).scalar_one_or_none()
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, ctype, fname, etag)


# ═══════════ RIWAYAT TAHAPAN PROSES (perizinan proyek/sertifikat) ═══════════
# Status Document = turunan event TERAKHIR di sini (pola sama custody_status/DocumentHandover).
# DITOLAK tetap dianggap "proses" (masih berjalan, mis. tinggal revisi) — bukan reset ke "belum".
_PROGRESS_TO_STATUS = {
    ProgressEvent.DIAJUKAN: DocStatus.PROSES,
    ProgressEvent.DIPROSES: DocStatus.PROSES,
    ProgressEvent.REVISI: DocStatus.PROSES,
    ProgressEvent.DITOLAK: DocStatus.PROSES,
    ProgressEvent.TERBIT: DocStatus.TERBIT,
}


async def _progress_rows(db, tenant_id, doc_id) -> list[ProgressLogResponse]:
    rows = (await db.execute(
        select(DocumentProgressLog, User.full_name)
        .outerjoin(User, User.id == DocumentProgressLog.by_user_id)
        .where(DocumentProgressLog.document_id == doc_id, DocumentProgressLog.tenant_id == tenant_id)
        .order_by(DocumentProgressLog.event_date.desc(), DocumentProgressLog.created_at.desc())
    )).all()
    return [
        ProgressLogResponse(
            id=p.id, event=p.event, event_date=p.event_date, institution=p.institution,
            notes=p.notes, by_user_name=uname, created_at=p.created_at,
        ) for p, uname in rows
    ]


@router.get("/documents/{doc_id}/progress", response_model=list[ProgressLogResponse])
async def list_progress(doc_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Riwayat tahapan proses dokumen (terbaru dulu)."""
    await _get_doc(db, ctx.tenant_id, doc_id)
    return await _progress_rows(db, ctx.tenant_id, doc_id)


@router.post("/documents/{doc_id}/progress", response_model=ProgressLogResponse, status_code=status.HTTP_201_CREATED)
async def add_progress(doc_id: uuid.UUID, payload: ProgressLogCreate,
                       ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Catat satu tahapan (diajukan/diproses/revisi/ditolak/terbit). Status dokumen ikut disinkron;
    TERBIT juga mengisi doc_date otomatis dari tanggal kejadian ini."""
    d = await _get_doc(db, ctx.tenant_id, doc_id)
    when = payload.event_date or date.today()
    p = DocumentProgressLog(
        tenant_id=ctx.tenant_id, document_id=doc_id, event=payload.event, event_date=when,
        institution=payload.institution, notes=payload.notes, by_user_id=ctx.user_id,
    )
    db.add(p)
    d.status = _PROGRESS_TO_STATUS[payload.event]
    if payload.event == ProgressEvent.TERBIT:
        d.doc_date = when
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "document_progress_logs", p.id,
                       new_data={"document": str(doc_id), "event": p.event.value, "at": str(when)})
    rows = await _progress_rows(db, ctx.tenant_id, doc_id)
    return next(r for r in rows if r.id == p.id)


@router.delete("/progress/{log_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])
async def delete_progress(log_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Hapus catatan tahapan yang salah. Status dokumen dihitung ulang dari sisa riwayat terbaru
    (kosong sama sekali = status dibiarkan apa adanya, tidak direset). Owner/admin saja."""
    p = (await db.execute(
        select(DocumentProgressLog).where(DocumentProgressLog.id == log_id, DocumentProgressLog.tenant_id == ctx.tenant_id)
    )).scalar_one_or_none()
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Riwayat tidak ditemukan")
    doc_id = p.document_id
    await db.delete(p)
    await db.flush()
    remaining = (await db.execute(
        select(DocumentProgressLog).where(DocumentProgressLog.document_id == doc_id, DocumentProgressLog.tenant_id == ctx.tenant_id)
        .order_by(DocumentProgressLog.event_date.desc(), DocumentProgressLog.created_at.desc())
    )).scalars().first()
    if remaining is not None:
        d = await _get_doc(db, ctx.tenant_id, doc_id)
        d.status = _PROGRESS_TO_STATUS[remaining.event]
        if remaining.event == ProgressEvent.TERBIT:
            d.doc_date = remaining.event_date
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "document_progress_logs", log_id)


# ═══════════ BATCH PEMECAHAN SERTIFIKAT INDUK (BPN) ═══════════
async def _get_batch(db, tenant_id, batch_id) -> CertificateSplitBatch:
    b = (await db.execute(
        select(CertificateSplitBatch).where(
            CertificateSplitBatch.id == batch_id, CertificateSplitBatch.tenant_id == tenant_id,
            CertificateSplitBatch.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Batch pemecahan tidak ditemukan")
    return b


async def _batch_response(db, tenant_id, batch: CertificateSplitBatch) -> SplitBatchResponse:
    master = (await db.execute(
        select(Document.name).where(Document.id == batch.master_document_id, Document.tenant_id == tenant_id)
    )).scalar_one_or_none()
    rows = (await db.execute(
        select(CertificateSplitBatchItem, Unit.unit_number, Unit.block, Document.status)
        .join(Unit, Unit.id == CertificateSplitBatchItem.unit_id)
        .outerjoin(Document, Document.id == CertificateSplitBatchItem.result_document_id)
        .where(CertificateSplitBatchItem.batch_id == batch.id)
        .order_by(Unit.block, Unit.unit_number)
    )).all()
    items = [
        SplitBatchItemResponse(
            id=it.id, unit_id=it.unit_id, unit_number=unum, block=blk,
            result_document_id=it.result_document_id, result_status=dstatus,
        ) for it, unum, blk, dstatus in rows
    ]
    return SplitBatchResponse(
        id=batch.id, project_id=batch.project_id, master_document_id=batch.master_document_id,
        master_document_name=master, batch_number=batch.batch_number, status=batch.status,
        submitted_date=batch.submitted_date, sk_number=batch.sk_number, sk_date=batch.sk_date,
        has_sk_file=batch.has_sk_file, sk_file_name=batch.sk_file_name, notes=batch.notes,
        items=items, created_at=batch.created_at, updated_at=batch.updated_at,
    )


async def _validate_units_in_project(db, tenant_id, project_id, unit_ids: list[uuid.UUID]) -> None:
    found = (await db.execute(
        select(Unit.id).where(Unit.id.in_(unit_ids), Unit.tenant_id == tenant_id, Unit.project_id == project_id)
    )).scalars().all()
    missing = set(unit_ids) - set(found)
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"{len(missing)} unit tidak ditemukan di proyek ini")


@router.get("/projects/{project_id}/split-batches", response_model=list[SplitBatchResponse])
async def list_split_batches(
    project_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Daftar batch pemecahan sertifikat untuk satu proyek (terbaru dulu)."""
    rows = (await db.execute(
        select(CertificateSplitBatch).where(
            CertificateSplitBatch.project_id == project_id, CertificateSplitBatch.tenant_id == ctx.tenant_id,
            CertificateSplitBatch.is_deleted == False)  # noqa: E712
        .order_by(CertificateSplitBatch.created_at.desc())
    )).scalars().all()
    return [await _batch_response(db, ctx.tenant_id, b) for b in rows]


@router.post("/split-batches", response_model=SplitBatchResponse, status_code=status.HTTP_201_CREATED)
async def create_split_batch(
    payload: SplitBatchCreate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Ajukan batch pemecahan: pilih sertifikat INDUK + unit-unit yang diikutkan."""
    master = (await db.execute(
        select(Document).where(Document.id == payload.master_document_id, Document.tenant_id == ctx.tenant_id,
                               Document.is_deleted == False)  # noqa: E712
    )).scalar_one_or_none()
    if master is None or master.project_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Sertifikat induk tidak valid (harus dokumen level proyek)")
    await _validate_units_in_project(db, ctx.tenant_id, master.project_id, payload.unit_ids)

    n = (await db.execute(select(func.count()).select_from(CertificateSplitBatch).where(
        CertificateSplitBatch.tenant_id == ctx.tenant_id))).scalar()
    batch = CertificateSplitBatch(
        tenant_id=ctx.tenant_id, project_id=master.project_id, master_document_id=master.id,
        batch_number=f"SPLIT-{(n or 0) + 1:06d}",
        submitted_date=payload.submitted_date, notes=payload.notes,
    )
    db.add(batch)
    await db.flush()
    for uid in payload.unit_ids:
        db.add(CertificateSplitBatchItem(batch_id=batch.id, unit_id=uid))
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "certificate_split_batches", batch.id,
                       new_data={"batch_number": batch.batch_number, "units": len(payload.unit_ids)})
    await db.refresh(batch)
    return await _batch_response(db, ctx.tenant_id, batch)


@router.patch("/split-batches/{batch_id}", response_model=SplitBatchResponse)
async def update_split_batch(
    batch_id: uuid.UUID,
    payload: SplitBatchUpdate,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Perbarui status pipeline (diajukan → pengukuran → SK terbit → selesai) & nomor SK."""
    b = await _get_batch(db, ctx.tenant_id, batch_id)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(b, f, v)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "certificate_split_batches", batch_id,
                       new_data={"status": b.status.value})
    await db.refresh(b)
    return await _batch_response(db, ctx.tenant_id, b)


@router.post("/split-batches/{batch_id}/units", response_model=SplitBatchResponse)
async def add_split_batch_units(
    batch_id: uuid.UUID,
    payload: SplitBatchAddUnits,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Tambah unit ke batch yang sudah ada (unit yang sudah ada di batch ini diabaikan)."""
    b = await _get_batch(db, ctx.tenant_id, batch_id)
    await _validate_units_in_project(db, ctx.tenant_id, b.project_id, payload.unit_ids)
    existing = (await db.execute(
        select(CertificateSplitBatchItem.unit_id).where(CertificateSplitBatchItem.batch_id == batch_id)
    )).scalars().all()
    new_ids = [uid for uid in payload.unit_ids if uid not in set(existing)]
    for uid in new_ids:
        db.add(CertificateSplitBatchItem(batch_id=batch_id, unit_id=uid))
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "certificate_split_batches", batch_id,
                       new_data={"units_added": len(new_ids)})
    return await _batch_response(db, ctx.tenant_id, b)


@router.delete("/split-batches/{batch_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_split_batch_item(
    batch_id: uuid.UUID,
    item_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Keluarkan satu unit dari batch (mis. salah pilih sebelum diajukan)."""
    await _get_batch(db, ctx.tenant_id, batch_id)
    item = (await db.execute(
        select(CertificateSplitBatchItem).where(
            CertificateSplitBatchItem.id == item_id, CertificateSplitBatchItem.batch_id == batch_id)
    )).scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Baris unit tidak ditemukan")
    await db.delete(item)
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "certificate_split_batch_items", item_id)


@router.patch("/split-batches/{batch_id}/items/{item_id}", response_model=SplitBatchResponse)
async def link_split_batch_result(
    batch_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: SplitBatchLinkResult,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Tautkan sertifikat PECAHAN (Document unit yang sudah diupload) ke satu unit dalam batch."""
    b = await _get_batch(db, ctx.tenant_id, batch_id)
    item = (await db.execute(
        select(CertificateSplitBatchItem).where(
            CertificateSplitBatchItem.id == item_id, CertificateSplitBatchItem.batch_id == batch_id)
    )).scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Baris unit tidak ditemukan")
    doc = (await db.execute(
        select(Document).where(Document.id == payload.result_document_id, Document.tenant_id == ctx.tenant_id,
                               Document.unit_id == item.unit_id)
    )).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Dokumen tidak ditemukan atau bukan milik unit ini")
    doc.parent_document_id = b.master_document_id  # jejak silsilah induk → pecahan
    item.result_document_id = doc.id
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "certificate_split_batch_items", item_id,
                       new_data={"result_document_id": str(doc.id)})
    return await _batch_response(db, ctx.tenant_id, b)


@router.post("/split-batches/{batch_id}/sk-file", response_model=SplitBatchResponse)
async def upload_split_batch_sk_file(
    batch_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Unggah scan SK pemecahan BPN untuk batch ini."""
    b = await _get_batch(db, ctx.tenant_id, batch_id)
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
    b.sk_file_key = storage.build_key(ctx.tenant_id, "split-batches", b.id, file.filename)
    await storage.put(b.sk_file_key, data, file.content_type)
    b.sk_file_name = file.filename
    b.sk_file_type = file.content_type or "application/octet-stream"
    b.sk_file_size = len(data)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "certificate_split_batches", batch_id,
                       new_data={"sk_file_name": file.filename})
    return await _batch_response(db, ctx.tenant_id, b)


@router.get("/split-batches/{batch_id}/sk-file")
async def download_split_batch_sk_file(
    batch_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    b = await _get_batch(db, ctx.tenant_id, batch_id)
    if not b.sk_file_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File SK tidak ditemukan")
    etag = file_etag(b.sk_file_size or 0, b.updated_at)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = await storage.get(b.sk_file_key)
    return cached_file_response(data, b.sk_file_type, b.sk_file_name, etag)


@router.delete("/split-batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])
async def delete_split_batch(
    batch_id: uuid.UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Hapus (arsipkan) batch pemecahan. Owner/admin saja."""
    b = await _get_batch(db, ctx.tenant_id, batch_id)
    b.is_deleted = True
    b.deleted_at = datetime.utcnow()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "certificate_split_batches", batch_id,
                       new_data={"batch_number": b.batch_number})


# ═══════════ SERAH-TERIMA DOKUMEN ASLI (fisik) ═══════════
# Siklus: Di arsip → Di notaris → (Diterima pembeli [cash] | Ditahan bank [KPR agunan]).
# Mencatat = SALES (termasuk marketing, via guard router). Menghapus riwayat = owner/admin.
async def _get_handover(db, tenant_id, hid) -> DocumentHandover:
    h = (await db.execute(
        select(DocumentHandover).where(DocumentHandover.id == hid,
                                       DocumentHandover.tenant_id == tenant_id, HNOTDEL)
    )).scalar_one_or_none()
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Catatan serah-terima tidak ditemukan")
    return h


async def _handover_rows(db, tenant_id, doc_id) -> list[HandoverResponse]:
    rows = (await db.execute(
        select(DocumentHandover, User.full_name, Notary.name, Bank.name, Client.full_name)
        .outerjoin(User, User.id == DocumentHandover.by_user_id)
        .outerjoin(Notary, Notary.id == DocumentHandover.notary_id)
        .outerjoin(Bank, Bank.id == DocumentHandover.bank_id)
        .outerjoin(Client, Client.id == DocumentHandover.client_id)
        .where(DocumentHandover.document_id == doc_id, DocumentHandover.tenant_id == tenant_id, HNOTDEL)
        .order_by(DocumentHandover.at.desc(), DocumentHandover.created_at.desc())
    )).all()
    return [
        HandoverResponse(
            id=h.id, event=h.event, at=h.at, by_user_name=uname, notary_name=nname,
            bank_name=bname, client_name=cname, received_by=h.received_by, signature=h.signature, notes=h.notes,
            has_proof=h.proof_name is not None, proof_name=h.proof_name, created_at=h.created_at,
        ) for h, uname, nname, bname, cname in rows
    ]


@router.get("/documents/{doc_id}/handovers", response_model=list[HandoverResponse])
async def list_handovers(doc_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Riwayat penguasaan dokumen asli (terbaru dulu)."""
    await _get_doc(db, ctx.tenant_id, doc_id)
    return await _handover_rows(db, ctx.tenant_id, doc_id)


@router.post("/documents/{doc_id}/handovers", response_model=HandoverResponse, status_code=status.HTTP_201_CREATED)
async def add_handover(doc_id: uuid.UUID, payload: HandoverCreate,
                       ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Catat kejadian serah-terima dokumen asli. PIC = user yang login (otomatis)."""
    await _get_doc(db, ctx.tenant_id, doc_id)
    # tujuan harus milik tenant ini
    for oid, model, label in ((payload.notary_id, Notary, "Notaris"), (payload.bank_id, Bank, "Bank"),
                              (payload.client_id, Client, "Pembeli")):
        if oid is None:
            continue
        ok = (await db.execute(select(model.id).where(model.id == oid, model.tenant_id == ctx.tenant_id))).scalar_one_or_none()
        if ok is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"{label} tidak ditemukan")
    h = DocumentHandover(
        tenant_id=ctx.tenant_id, document_id=doc_id, event=payload.event,
        at=payload.at or date.today(), by_user_id=ctx.user_id,
        notary_id=payload.notary_id, bank_id=payload.bank_id, client_id=payload.client_id,
        received_by=payload.received_by, signature=payload.signature, notes=payload.notes,
    )
    db.add(h); await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "document_handovers", h.id,
                       new_data={"document": str(doc_id), "event": h.event.value, "at": str(h.at)})
    rows = await _handover_rows(db, ctx.tenant_id, doc_id)
    return next(r for r in rows if r.id == h.id)  # entri yg baru dibuat (nama tujuan sudah ter-resolve)


@router.post("/handovers/{hid}/proof", response_model=HandoverResponse)
async def upload_handover_proof(hid: uuid.UUID, file: UploadFile = File(...),
                                ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Unggah bukti serah-terima (foto berita acara bertanda tangan). Maks 10 MB."""
    h = await _get_handover(db, ctx.tenant_id, hid)
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
    h.proof_key = storage.build_key(ctx.tenant_id, "handovers", h.id, file.filename)
    await storage.put(h.proof_key, data, file.content_type)
    h.proof_name = file.filename
    h.proof_type = file.content_type or "application/octet-stream"
    h.proof_size = len(data)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPLOAD", "document_handovers", h.id,
                       new_data={"proof": file.filename, "size": len(data)})
    return HandoverResponse(id=h.id, event=h.event, at=h.at, notes=h.notes,
                            has_proof=True, proof_name=h.proof_name, created_at=h.created_at)


@router.get("/handovers/{hid}/proof")
async def get_handover_proof(hid: uuid.UUID, request: Request,
                             ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Lihat/unduh bukti serah-terima."""
    h = await _get_handover(db, ctx.tenant_id, hid)
    if not h.proof_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bukti tidak ditemukan")
    etag = file_etag(h.proof_size or 0, h.updated_at)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = await storage.get(h.proof_key)
    return cached_file_response(data, h.proof_type, h.proof_name, etag)


@router.delete("/handovers/{hid}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role(UserRole.OWNER, UserRole.ADMIN))])  # hapus riwayat = owner/admin
async def delete_handover(hid: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Hapus catatan serah-terima yang salah (arsipkan). Owner/admin saja."""
    h = await _get_handover(db, ctx.tenant_id, hid)
    h.is_deleted = True; h.deleted_at = datetime.utcnow()
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "DELETE", "document_handovers", hid)


@router.post("/units/{unit_id}/handovers", response_model=UnitHandoverResult, status_code=status.HTTP_201_CREATED)
async def add_unit_handover(
    unit_id: uuid.UUID,
    event: HandoverEvent = Form(...),
    at: Optional[date] = Form(None),
    notary_id: Optional[uuid.UUID] = Form(None),
    bank_id: Optional[uuid.UUID] = Form(None),
    client_id: Optional[uuid.UUID] = Form(None),
    received_by: Optional[str] = Form(None),
    signature: Optional[str] = Form(None),   # ttd digital PIC penerima (data URL base64)
    notes: Optional[str] = Form(None),
    doc_ids: list[uuid.UUID] = Form([]),     # dokumen yang ikut paket; kosong = semua dokumen unit
    file: Optional[UploadFile] = File(None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
):
    """Serah-terima 1 PAKET: catat kejadian yang sama untuk SEMUA dokumen asli milik unit ini.
    Dokumen asli memang berpindah sekaligus (mis. ke notaris untuk AJB), jadi 1 aksi + 1 bukti.
    Di balik layar tetap 1 entri per dokumen → badge & riwayat tiap dokumen tetap akurat."""
    unit = (await db.execute(select(Unit).where(Unit.id == unit_id, Unit.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unit tidak ditemukan")
    # validasi tujuan wajib — samakan dgn aturan per-dokumen
    need = {HandoverEvent.SERAH_NOTARIS: (notary_id, "Notaris"),
            HandoverEvent.TAHAN_BANK: (bank_id, "Bank"),
            HandoverEvent.TERIMA_PEMBELI: (client_id, "Pembeli")}.get(event)
    if need and need[0] is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{need[1]} wajib dipilih untuk kejadian ini")
    for oid, model, label in ((notary_id, Notary, "Notaris"), (bank_id, Bank, "Bank"), (client_id, Client, "Pembeli")):
        if oid is None:
            continue
        ok = (await db.execute(select(model.id).where(model.id == oid, model.tenant_id == ctx.tenant_id))).scalar_one_or_none()
        if ok is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"{label} tidak ditemukan")

    conds = [Document.unit_id == unit_id, Document.tenant_id == ctx.tenant_id,
             Document.is_deleted == False]  # noqa: E712
    if doc_ids:
        conds.append(Document.id.in_(doc_ids))   # hanya dokumen yang dipilih (mis. SHM+PBB ke notaris, PBG ke bank)
    docs = (await db.execute(select(Document).where(*conds).order_by(Document.created_at))).scalars().all()
    if not docs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Tidak ada dokumen terpilih untuk diserahkan")

    # bukti diunggah SEKALI, dipakai bersama semua entri paket ini
    pkey = pname = ptype = None
    psize = None
    if file is not None:
        data = await file.read()
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ukuran file maksimal 10 MB")
        pkey = storage.build_key(ctx.tenant_id, "handovers", unit_id, file.filename)
        await storage.put(pkey, data, file.content_type)
        pname, ptype, psize = file.filename, file.content_type or "application/octet-stream", len(data)

    when = at or date.today()
    for d in docs:
        db.add(DocumentHandover(
            tenant_id=ctx.tenant_id, document_id=d.id, event=event, at=when, by_user_id=ctx.user_id,
            notary_id=notary_id, bank_id=bank_id, client_id=client_id,
            received_by=received_by, signature=signature, notes=notes,
            proof_key=pkey, proof_name=pname, proof_type=ptype, proof_size=psize,
        ))
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "document_handovers", unit_id,
                       new_data={"paket_unit": str(unit_id), "event": event.value, "at": str(when),
                                 "jumlah_dokumen": len(docs)})
    return UnitHandoverResult(affected=len(docs), doc_types=[d.doc_type for d in docs], has_proof=pname is not None)
