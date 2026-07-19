import secrets
import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone, date

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Request
from fastapi.responses import Response
from app.core.files import file_etag, not_modified_response, cached_file_response
from app.core import storage
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext
from app.models.tax import (
    Notary, TaxRecord, NotaryFee, NotaryShareLink, NotarySubmission,
    NotarySubmissionKind, NotarySubmissionStatus,
)
from app.models.marketing import Client, BalikNamaStatus
from app.models.property import Unit, Project
from app.models.user import User
from app.models.document import Document, DocumentHandover, HandoverEvent
from app.schemas.tax import (
    NotaryCreate, NotaryUpdate, NotaryResponse,
    TaxCreate, TaxUpdate, TaxResponse, TaxBulkCreate,
    FeeCreate, FeeUpdate, FeeResponse, FeeBulkCreate,
    NotaryShareLinkCreate, NotaryShareLinkResponse,
    NotarySubmissionResponse, NotarySubmissionRejectRequest,
    NotaryDebtFeeRow, NotaryDebtGroup, NotaryDebtResponse,
    NotaryWorklistRow, NotaryWorklistResponse, BalikNamaUpdate,
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


@router.post("/notary-fees/bulk", response_model=list[FeeResponse], status_code=status.HTTP_201_CREATED)
async def bulk_create_fees(payload: FeeBulkCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Entry cepat: beberapa baris biaya notaris (Jasa PPJB/AJB/BBN dst) sekaligus. Selalu baris BARU
    (beda dgn entry cepat pajak) — uraian bebas teks, tak ada "jenis" unik utk dijadikan kunci update."""
    result: list[NotaryFee] = []
    for item in payload.items:
        f = NotaryFee(tenant_id=ctx.tenant_id, client_id=payload.client_id, **item.model_dump())
        db.add(f)
        await db.flush()
        await record_audit(db, ctx.tenant_id, ctx.user_id, "CREATE", "notary_fees", f.id,
                           new_data={"description": f.description, "amount": str(f.amount)})
        result.append(f)

    ids = [f.id for f in result]
    rows = (await db.execute(
        select(NotaryFee).options(selectinload(NotaryFee.notary)).where(NotaryFee.id.in_(ids))
    )).scalars().all()
    order = {fid: i for i, fid in enumerate(ids)}
    rows.sort(key=lambda f: order[f.id])
    return rows


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


def _lbl(u: Unit) -> str:
    return "-".join(x for x in [u.block, u.unit_number] if x) or "?"


async def _get_notary(db, tenant_id, notary_id) -> Notary:
    n = (await db.execute(select(Notary).where(Notary.id == notary_id, Notary.tenant_id == tenant_id, NOTDEL(Notary)))).scalar_one_or_none()
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notaris tidak ditemukan")
    return n


# ═══════════════════════ TAUTAN BAGIKAN KE NOTARIS (tanpa login) ═══════════════════════
@router.get("/notary-share", response_model=list[NotaryShareLinkResponse])
async def list_notary_share_links(notary_id: uuid.UUID = Query(None), ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Daftar tautan yang pernah dibuat tenant ini (termasuk expired/dicabut, utk histori)."""
    conds = [NotaryShareLink.tenant_id == ctx.tenant_id]
    if notary_id:
        conds.append(NotaryShareLink.notary_id == notary_id)
    r = await db.execute(select(NotaryShareLink).where(*conds).order_by(NotaryShareLink.created_at.desc()))
    return r.scalars().all()


@router.post("/notary-share", response_model=NotaryShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_notary_share_link(payload: NotaryShareLinkCreate, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Buat tautan bertoken (tanpa login) utk 1 notaris lihat PPJB/AJB, pajak, & biaya jasanya, & kirim update."""
    notary = await _get_notary(db, ctx.tenant_id, payload.notary_id)
    days = max(1, min(365, payload.expires_days))
    link = NotaryShareLink(
        tenant_id=ctx.tenant_id, token=secrets.token_urlsafe(32), notary_id=notary.id,
        notary_name_snapshot=notary.name, created_by=ctx.user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=days),
    )
    db.add(link)
    await db.flush(); await db.refresh(link)
    return link


@router.delete("/notary-share/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_notary_share_link(link_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    link = (await db.execute(select(NotaryShareLink).where(NotaryShareLink.id == link_id, NotaryShareLink.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tautan tidak ditemukan")
    link.revoked_at = datetime.now(timezone.utc)
    await db.flush()


# ═══════════════════════ KIRIMAN DARI NOTARIS (menunggu persetujuan) ═══════════════════════
async def _submission_response(db, tenant_id, sub: NotarySubmission) -> NotarySubmissionResponse:
    c = (await db.execute(select(Client).where(Client.id == sub.client_id))).scalar_one_or_none()
    client_name = c.full_name if c else "?"
    unit_label = None
    if c and c.unit_id:
        u = (await db.execute(select(Unit).where(Unit.id == c.unit_id))).scalar_one_or_none()
        if u:
            unit_label = _lbl(u)
    notary_name = None
    if sub.notary_share_link_id:
        notary_name = await db.scalar(select(NotaryShareLink.notary_name_snapshot).where(NotaryShareLink.id == sub.notary_share_link_id))
    reviewer_name = None
    if sub.reviewed_by:
        reviewer_name = await db.scalar(select(User.full_name).where(User.id == sub.reviewed_by))
    custody_document_type = None
    if sub.custody_document_id:
        custody_document_type = await db.scalar(select(Document.doc_type).where(Document.id == sub.custody_document_id))
    return NotarySubmissionResponse(
        id=sub.id, client_id=sub.client_id, client_name=client_name, unit_label=unit_label,
        notary_name=notary_name, kind=sub.kind, target_id=sub.target_id,
        ppjb_number=sub.ppjb_number, has_ppjb_file=sub.has_ppjb_file,
        ajb_number=sub.ajb_number, has_ajb_file=sub.has_ajb_file,
        tax_type=sub.tax_type, tax_category=sub.tax_category, tax_base_amount=sub.tax_base_amount,
        tax_amount=sub.tax_amount, tax_id_billing=sub.tax_id_billing, tax_ntpn=sub.tax_ntpn,
        tax_date=sub.tax_date, tax_status=sub.tax_status,
        fee_description=sub.fee_description, fee_amount=sub.fee_amount, fee_date=sub.fee_date,
        custody_document_type=custody_document_type, custody_event=sub.custody_event, custody_at=sub.custody_at,
        has_file=sub.has_file, file_name=sub.file_name, submitted_notes=sub.submitted_notes,
        status=sub.status, reviewer_name=reviewer_name, reviewed_at=sub.reviewed_at,
        review_notes=sub.review_notes, created_at=sub.created_at,
    )


@router.get("/notary-submissions", response_model=list[NotarySubmissionResponse])
async def list_notary_submissions(
    status_filter: str = Query("pending", alias="status"),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Kiriman dari notaris lewat tautan — default hanya yang menunggu persetujuan."""
    conds = [NotarySubmission.tenant_id == ctx.tenant_id]
    if status_filter and status_filter != "all":
        conds.append(NotarySubmission.status == NotarySubmissionStatus(status_filter))
    rows = (await db.execute(
        select(NotarySubmission).where(*conds).order_by(NotarySubmission.created_at.desc())
    )).scalars().all()
    return [await _submission_response(db, ctx.tenant_id, s) for s in rows]


@router.get("/notary-submissions/pending-count")
async def notary_submissions_pending_count(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(NotarySubmission).where(
        NotarySubmission.tenant_id == ctx.tenant_id, NotarySubmission.status == NotarySubmissionStatus.PENDING))
    return {"count": count or 0}


async def _get_submission(db, tenant_id, sub_id) -> NotarySubmission:
    sub = (await db.execute(
        select(NotarySubmission).where(NotarySubmission.id == sub_id, NotarySubmission.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Kiriman tidak ditemukan")
    return sub


@router.get("/notary-submissions/{sub_id}/file")
async def download_notary_submission_file(
    sub_id: uuid.UUID, request: Request, kind: str = Query("main"),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Lihat file yang dikirim notaris SEBELUM diterima. kind: main (bukti pajak) | ppjb | ajb."""
    sub = await _get_submission(db, ctx.tenant_id, sub_id)
    field = {"ppjb": ("ppjb_file_key", "ppjb_file_type", "ppjb_file_name", "ppjb_file_size"),
             "ajb": ("ajb_file_key", "ajb_file_type", "ajb_file_name", "ajb_file_size"),
             "main": ("file_key", "file_type", "file_name", "file_size")}.get(kind)
    if field is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="kind tidak dikenal")
    fkey, ftype, fname, fsize = (getattr(sub, f) for f in field)
    if not fkey:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    etag = file_etag(fsize, sub.updated_at)
    nm = not_modified_response(request, etag)
    if nm is not None:
        return nm
    data = await storage.get(fkey)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File tidak ditemukan")
    return cached_file_response(data, ftype, fname, etag)


@router.post("/notary-submissions/{sub_id}/accept", response_model=NotarySubmissionResponse)
async def accept_notary_submission(sub_id: uuid.UUID, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Terima kiriman notaris — baru di titik ini data PPJB/AJB/pajak/biaya resmi berubah/tercatat."""
    sub = await _get_submission(db, ctx.tenant_id, sub_id)
    if sub.status != NotarySubmissionStatus.PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Kiriman ini sudah diproses")
    c = (await db.execute(select(Client).where(Client.id == sub.client_id, Client.tenant_id == ctx.tenant_id, NOTDEL(Client)))).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembeli tidak ditemukan")
    notary_id = None
    if sub.notary_share_link_id:
        notary_id = await db.scalar(select(NotaryShareLink.notary_id).where(NotaryShareLink.id == sub.notary_share_link_id))

    if sub.kind == NotarySubmissionKind.PPJB_AJB:
        if sub.ppjb_number:
            c.ppjb_number = sub.ppjb_number
        if sub.has_ppjb_file:
            c.ppjb_file_name = sub.ppjb_file_name; c.ppjb_file_type = sub.ppjb_file_type
            c.ppjb_file_size = sub.ppjb_file_size; c.ppjb_file_key = sub.ppjb_file_key
        if sub.ajb_number:
            c.ajb_number = sub.ajb_number
        if sub.has_ajb_file:
            c.ajb_file_name = sub.ajb_file_name; c.ajb_file_type = sub.ajb_file_type
            c.ajb_file_size = sub.ajb_file_size; c.ajb_file_key = sub.ajb_file_key
    elif sub.kind == NotarySubmissionKind.TAX:
        tr = None
        if sub.target_id:
            tr = (await db.execute(select(TaxRecord).where(TaxRecord.id == sub.target_id, TaxRecord.tenant_id == ctx.tenant_id, NOTDEL(TaxRecord)))).scalar_one_or_none()
        if tr is None:
            tr = TaxRecord(tenant_id=ctx.tenant_id, client_id=sub.client_id, notary_id=notary_id)
            db.add(tr)
        if sub.tax_type: tr.tax_type = sub.tax_type
        if sub.tax_category: tr.category = sub.tax_category
        if sub.tax_base_amount is not None: tr.base_amount = sub.tax_base_amount
        if sub.tax_amount is not None: tr.amount = sub.tax_amount
        if sub.tax_id_billing: tr.id_billing = sub.tax_id_billing
        if sub.tax_ntpn: tr.ntpn = sub.tax_ntpn
        if sub.tax_date: tr.tax_date = sub.tax_date
        if sub.tax_status: tr.status = sub.tax_status
        if not tr.notary_id and notary_id: tr.notary_id = notary_id
        if sub.has_file:
            tr.file_name = sub.file_name; tr.file_type = sub.file_type
            tr.file_size = sub.file_size; tr.file_key = sub.file_key
    elif sub.kind == NotarySubmissionKind.FEE:
        nf = None
        if sub.target_id:
            nf = (await db.execute(select(NotaryFee).where(NotaryFee.id == sub.target_id, NotaryFee.tenant_id == ctx.tenant_id, NOTDEL(NotaryFee)))).scalar_one_or_none()
        if nf is None:
            nf = NotaryFee(tenant_id=ctx.tenant_id, client_id=sub.client_id, notary_id=notary_id, description=sub.fee_description or "Biaya notaris", amount=sub.fee_amount or 0)
            db.add(nf)
        if sub.fee_description: nf.description = sub.fee_description
        if sub.fee_amount is not None: nf.amount = sub.fee_amount
        if sub.fee_date: nf.fee_date = sub.fee_date
        if not nf.notary_id and notary_id: nf.notary_id = notary_id
    elif sub.kind == NotarySubmissionKind.CUSTODY:
        dh = DocumentHandover(
            tenant_id=ctx.tenant_id, document_id=sub.custody_document_id,
            event=sub.custody_event, at=sub.custody_at,
            by_user_id=ctx.user_id, notary_id=notary_id, client_id=sub.client_id,
        )
        db.add(dh)

    sub.status = NotarySubmissionStatus.ACCEPTED
    sub.reviewed_by = ctx.user_id
    sub.reviewed_at = datetime.now(timezone.utc)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "ACCEPT", "notary_submissions", sub_id,
                       new_data={"kind": sub.kind.value}, client_id=sub.client_id)
    return await _submission_response(db, ctx.tenant_id, sub)


@router.post("/notary-submissions/{sub_id}/reject", response_model=NotarySubmissionResponse)
async def reject_notary_submission(sub_id: uuid.UUID, payload: NotarySubmissionRejectRequest, ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Tolak kiriman notaris — wajib alasan. Tak menyentuh data PPJB/AJB/pajak/biaya."""
    sub = await _get_submission(db, ctx.tenant_id, sub_id)
    if sub.status != NotarySubmissionStatus.PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Kiriman ini sudah diproses")
    sub.status = NotarySubmissionStatus.REJECTED
    sub.reviewed_by = ctx.user_id
    sub.reviewed_at = datetime.now(timezone.utc)
    sub.review_notes = payload.reason.strip()
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "REJECT", "notary_submissions", sub_id,
                       reason=payload.reason.strip())
    return await _submission_response(db, ctx.tenant_id, sub)


# ═══════════════════════ PEMANTAUAN NOTARIS ═══════════════════════
# Dua sisi satu hubungan: (1) hutang jasa yg belum dibayar developer, (2) pekerjaan
# pemberkasan yg masih tertahan di notaris. Keduanya aging-first — yg menua naik ke atas.

@router.get("/notary-performance/debts", response_model=NotaryDebtResponse)
async def notary_debts(ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Hutang developer ke notaris = biaya jasa (NotaryFee) yang belum dibayar, dikelompokkan per notaris."""
    today = date.today()
    rows = (await db.execute(
        select(NotaryFee, Client.full_name, Notary.name, Unit.block, Unit.unit_number)
        .join(Client, Client.id == NotaryFee.client_id)
        .outerjoin(Notary, Notary.id == NotaryFee.notary_id)
        .outerjoin(Unit, Unit.id == Client.unit_id)
        .where(NotaryFee.tenant_id == ctx.tenant_id, NotaryFee.is_paid == False, NOTDEL(NotaryFee))  # noqa: E712
    )).all()

    groups: dict = {}
    for fee, client_name, notary_name, block, unit_number in rows:
        g = groups.get(fee.notary_id)
        if g is None:
            g = groups[fee.notary_id] = {
                "notary_id": fee.notary_id, "notary_name": notary_name or "Tanpa notaris",
                "total": Decimal(0), "count": 0,
                "a0": Decimal(0), "a1": Decimal(0), "a2": Decimal(0), "fees": [],
            }
        amt = fee.amount or Decimal(0)
        g["total"] += amt
        g["count"] += 1
        days = (today - fee.fee_date).days if fee.fee_date else None
        if days is None or days <= 30:
            g["a0"] += amt
        elif days <= 60:
            g["a1"] += amt
        else:
            g["a2"] += amt
        label = "-".join(x for x in [block, unit_number] if x) or None
        g["fees"].append(NotaryDebtFeeRow(
            id=fee.id, client_id=fee.client_id, client_name=client_name, unit_label=label,
            description=fee.description, amount=amt, fee_date=fee.fee_date, days_outstanding=days,
        ))

    group_models = []
    for g in groups.values():
        g["fees"].sort(key=lambda f: (f.days_outstanding is None, -(f.days_outstanding or 0)))
        group_models.append(NotaryDebtGroup(
            notary_id=g["notary_id"], notary_name=g["notary_name"], total=g["total"], count=g["count"],
            aging_0_30=g["a0"], aging_31_60=g["a1"], aging_60_plus=g["a2"], fees=g["fees"],
        ))
    group_models.sort(key=lambda x: x.total, reverse=True)
    grand = sum((g.total for g in group_models), Decimal(0))
    return NotaryDebtResponse(grand_total=grand, groups=group_models)


_TERMINAL_HANDOVER = {HandoverEvent.TAHAN_BANK, HandoverEvent.TERIMA_PEMBELI, HandoverEvent.KEMBALI_ARSIP}


@router.get("/notary-performance/worklist", response_model=NotaryWorklistResponse)
async def notary_worklist(
    notary_id: uuid.UUID = Query(None),
    only_macet: bool = Query(False),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Pekerjaan notaris yang BELUM selesai. Selesai = dokumen asli sudah mendarat di tujuan akhir
    (bank/arsip/pembeli). Macet = >15 hari tanpa kejadian bertanggal baru."""
    today = date.today()

    # 1) Peta pembeli → notaris (dari pajak lebih dulu, lalu biaya) + tanggal aktivitas terbaru
    notary_of: dict = {}
    activity: dict = {}
    trows = (await db.execute(
        select(TaxRecord.client_id, TaxRecord.notary_id, TaxRecord.tax_date)
        .where(TaxRecord.tenant_id == ctx.tenant_id, NOTDEL(TaxRecord))
    )).all()
    frows = (await db.execute(
        select(NotaryFee.client_id, NotaryFee.notary_id, NotaryFee.fee_date)
        .where(NotaryFee.tenant_id == ctx.tenant_id, NOTDEL(NotaryFee))
    )).all()
    for cid, nid, d in list(trows) + list(frows):
        if nid and cid not in notary_of:
            notary_of[cid] = nid
        if d and (cid not in activity or d > activity[cid]):
            activity[cid] = d

    client_ids = list(notary_of.keys())
    if not client_ids:
        return NotaryWorklistResponse(macet_count=0, total=0, rows=[])

    notary_name_of = {nid: name for nid, name in (await db.execute(
        select(Notary.id, Notary.name).where(Notary.id.in_(set(notary_of.values())))
    )).all()}

    clients = {c.id: c for c in (await db.execute(
        select(Client).where(Client.id.in_(client_ids), Client.tenant_id == ctx.tenant_id, NOTDEL(Client))
    )).scalars()}

    unit_ids = [c.unit_id for c in clients.values() if c.unit_id]
    units = {u.id: u for u in (await db.execute(select(Unit).where(Unit.id.in_(unit_ids)))).scalars()} if unit_ids else {}
    proj_ids = {c.project_id for c in clients.values() if c.project_id}
    proj_names = {pid: name for pid, name in (await db.execute(
        select(Project.id, Project.name).where(Project.id.in_(proj_ids))
    )).all()} if proj_ids else {}

    # Kejadian serah-terima dokumen asli TERAKHIR per unit
    handover_by_unit: dict = {}
    if unit_ids:
        hrows = (await db.execute(
            select(DocumentHandover.event, DocumentHandover.at, Document.unit_id)
            .join(Document, Document.id == DocumentHandover.document_id)
            .where(Document.unit_id.in_(unit_ids), DocumentHandover.tenant_id == ctx.tenant_id, NOTDEL(DocumentHandover))
            .order_by(DocumentHandover.at.asc(), DocumentHandover.created_at.asc())
        )).all()
        for event, at, uid in hrows:
            handover_by_unit[uid] = (event, at)  # asc → yang terakhir = terbaru

    result = []
    macet = 0
    for cid, c in clients.items():
        nid = notary_of.get(cid)
        if notary_id and nid != notary_id:
            continue
        hv = handover_by_unit.get(c.unit_id) if c.unit_id else None
        last_event, last_at = (hv[0], hv[1]) if hv else (None, None)
        if last_event in _TERMINAL_HANDOVER:
            continue  # SELESAI — dokumen asli sudah mendarat

        if c.balik_nama_status != BalikNamaStatus.SELESAI:
            stage, stage_label = "belum_balik_nama", "Belum balik nama"
        else:
            stage, stage_label = "belum_serah", "Belum serah dokumen asli"

        candidates = [d for d in [c.balik_nama_date, last_at, activity.get(cid), c.contract_date] if d]
        last_activity = max(candidates) if candidates else (c.created_at.date() if c.created_at else None)
        days_idle = (today - last_activity).days if last_activity else None
        is_macet = days_idle is not None and days_idle > 15
        if only_macet and not is_macet:
            continue
        if is_macet:
            macet += 1

        u = units.get(c.unit_id) if c.unit_id else None
        label = "-".join(x for x in [u.block, u.unit_number] if x) if u else (c.unit_number or None)
        result.append(NotaryWorklistRow(
            client_id=cid, client_name=c.full_name, unit_label=label,
            project_name=proj_names.get(c.project_id),
            notary_id=nid, notary_name=notary_name_of.get(nid),
            payment_type=(c.payment_type.value if c.payment_type else None),
            balik_nama_status=c.balik_nama_status, balik_nama_date=c.balik_nama_date,
            last_handover_event=(last_event.value if last_event else None), last_handover_date=last_at,
            stage=stage, stage_label=stage_label,
            last_activity=last_activity, days_idle=days_idle, is_macet=is_macet,
        ))

    result.sort(key=lambda r: (not r.is_macet, -(r.days_idle or 0)))
    return NotaryWorklistResponse(macet_count=macet, total=len(result), rows=result)


@router.patch("/clients/{client_id}/balik-nama")
async def update_balik_nama(client_id: uuid.UUID, payload: BalikNamaUpdate,
                            ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db)):
    """Catat status balik nama sertifikat unit (BELUM/PROSES/SELESAI) — aksi staf internal."""
    c = (await db.execute(select(Client).where(Client.id == client_id, Client.tenant_id == ctx.tenant_id, NOTDEL(Client)))).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pembeli tidak ditemukan")
    c.balik_nama_status = payload.status
    # tanggal: pakai kiriman, atau default hari ini saat maju ke PROSES/SELESAI (utk aging)
    c.balik_nama_date = payload.date or (date.today() if payload.status != BalikNamaStatus.BELUM else None)
    await db.flush()
    await record_audit(db, ctx.tenant_id, ctx.user_id, "UPDATE", "clients", client_id,
                       new_data={"balik_nama_status": payload.status.value}, client_id=client_id)
    return {"status": c.balik_nama_status.value, "date": c.balik_nama_date.isoformat() if c.balik_nama_date else None}
