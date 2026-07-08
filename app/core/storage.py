"""Object storage (MinIO) untuk file arsip — dokumen legalitas, bukti bayar, PPJB/AJB, pajak, siteplan.

Ganti penyimpanan blob di Postgres agar DB tetap ramping (backup cepat, penting di mode SILO).
Isolasi per tenant lewat prefix key: {tenant_id}/{kategori}/{record_id}/{uuid}-{namafile}.
Kredensial & endpoint dari env (MINIO_*). Panggilan SDK sinkron → dibungkus thread agar tak blok event loop.
"""
import io
import os
import uuid
from functools import lru_cache

import anyio
from minio import Minio

BUCKET = os.getenv("MINIO_BUCKET", "nexisthub")


@lru_cache
def _client() -> Minio:
    return Minio(
        os.getenv("MINIO_ENDPOINT", "s3.nexisthub.id"),
        access_key=os.getenv("MINIO_ACCESS_KEY", ""),
        secret_key=os.getenv("MINIO_SECRET_KEY", ""),
        secure=os.getenv("MINIO_SECURE", "true").lower() != "false",
    )


def is_enabled() -> bool:
    return bool(os.getenv("MINIO_ACCESS_KEY"))


def build_key(tenant_id, category: str, record_id, filename: str | None) -> str:
    safe = os.path.basename(filename or "file").replace("\\", "_")
    return f"{tenant_id}/{category}/{record_id}/{uuid.uuid4().hex}-{safe}"


def _put_sync(key: str, data: bytes, content_type: str | None) -> None:
    c = _client()
    if not c.bucket_exists(BUCKET):
        c.make_bucket(BUCKET)
    c.put_object(BUCKET, key, io.BytesIO(data), length=len(data),
                 content_type=content_type or "application/octet-stream")


def _get_sync(key: str) -> bytes:
    resp = _client().get_object(BUCKET, key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def _delete_sync(key: str) -> None:
    try:
        _client().remove_object(BUCKET, key)
    except Exception:
        pass


async def put(key: str, data: bytes, content_type: str | None) -> None:
    await anyio.to_thread.run_sync(_put_sync, key, data, content_type)


async def get(key: str) -> bytes:
    return await anyio.to_thread.run_sync(_get_sync, key)


async def delete(key: str) -> None:
    await anyio.to_thread.run_sync(_delete_sync, key)
