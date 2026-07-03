from typing import Optional
from fastapi import Request
from fastapi.responses import Response
from starlette.status import HTTP_304_NOT_MODIFIED

# File arsip (dokumen/pajak/pembayaran) jarang berubah → cache 1 jam + revalidate via ETag.
# Efek: klik "Lihat" ke-2 dst. instan dari cache browser, tak unduh ulang blob dari DB.
CACHE_HEADERS = {"Cache-Control": "private, max-age=3600, must-revalidate"}


def file_etag(size: Optional[int], updated_at) -> str:
    ts = int(updated_at.timestamp()) if updated_at else 0
    return f'"f-{size or 0}-{ts}"'


def not_modified_response(request: Request, etag: str) -> Optional[Response]:
    """Kembalikan 304 (tanpa baca blob) bila ETag klien cocok; else None."""
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=HTTP_304_NOT_MODIFIED, headers={"ETag": etag, **CACHE_HEADERS})
    return None


def cached_file_response(data: bytes, ctype: Optional[str], fname: Optional[str], etag: str) -> Response:
    return Response(
        content=data,
        media_type=ctype or "application/octet-stream",
        headers={"ETag": etag, **CACHE_HEADERS,
                 "Content-Disposition": f'inline; filename="{fname or "file"}"'},
    )
