"""Klien Xendit Invoice API (pembayaran langganan tenant).
Auth: HTTP Basic — secret key sebagai username, password kosong.
Nonaktif otomatis bila XENDIT_SECRET_KEY kosong (fitur bayar-online mati, billing manual tetap jalan)."""
import base64
import httpx
from app.core.config import settings


def is_enabled() -> bool:
    return bool(settings.XENDIT_SECRET_KEY)


def _auth_header() -> dict:
    token = base64.b64encode(f"{settings.XENDIT_SECRET_KEY}:".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}


async def create_invoice(*, external_id: str, amount: float, description: str,
                         payer_email: str | None = None, success_redirect_url: str | None = None) -> dict:
    """Buat invoice Xendit (halaman bayar hosted). Kembalikan dict {id, invoice_url, status}."""
    body = {
        "external_id": external_id,
        "amount": int(round(amount)),
        "currency": "IDR",
        "description": description,
        "invoice_duration": 86400 * 7,   # link berlaku 7 hari
    }
    if payer_email:
        body["payer_email"] = payer_email
    if success_redirect_url:
        body["success_redirect_url"] = success_redirect_url
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{settings.XENDIT_BASE_URL}/v2/invoices", json=body, headers=_auth_header())
        r.raise_for_status()
        return r.json()
