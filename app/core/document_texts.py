"""Teks dokumen per-tenant: default bawaan + pengisian variabel + terbilang.
Dipakai fitur 'Teks Dokumen' (Setting) & cetak surat ke bank. Generik via doc_key, opsional per bank."""
import re
from decimal import Decimal
from sqlalchemy import select
from app.models.document_text import DocumentText

# ── Registry jenis dokumen ──
# per_bank: template bisa dikhususkan per bank. has_subject: punya kolom Perihal.
# has_signer: punya nama & jabatan penandatangan yang bisa diatur.
DOC_TYPES = {
    "surat_spr": {"label": "Surat Pesanan Rumah (SPR)", "per_bank": True, "has_subject": True, "has_signer": False},
    "surat_pencairan_awal": {"label": "Permohonan Pencairan Awal", "per_bank": True, "has_subject": True, "has_signer": False},
    "surat_pencairan_retensi": {"label": "Permohonan Pencairan Retensi", "per_bank": True, "has_subject": True, "has_signer": False},
    "kuitansi": {"label": "Kuitansi", "per_bank": False, "has_subject": False, "has_signer": True},
    "form_penjualan": {"label": "Form Penjualan", "per_bank": False, "has_subject": False, "has_signer": True},
}
BANK_LETTER_DOCS = {k: v["label"] for k, v in DOC_TYPES.items() if v["per_bank"]}

# Daftar putih variabel per dokumen — utk chip di editor & mencegah token ngawur.
_COMMON = ["nama_pembeli", "nik", "alamat_pembeli", "bank", "proyek", "alamat_proyek",
           "unit", "blok", "no_unit", "tipe", "lt", "lb",
           "harga_jual", "perusahaan", "kota", "tanggal"]
_REKENING = ["nomor_rekening", "nama_bank_rekening"]
DOC_VARIABLES = {
    "surat_spr": _COMMON,
    "surat_pencairan_awal": _COMMON + ["plafon", "tanggal_akad", "jumlah_pencairan", "terbilang_pencairan"] + _REKENING,
    "surat_pencairan_retensi": _COMMON + ["plafon", "tanggal_akad", "jumlah_retensi", "terbilang_retensi"] + _REKENING,
    "kuitansi": ["nama_pembeli", "unit", "proyek", "perusahaan"],
    "form_penjualan": ["nama_pembeli", "unit", "proyek", "harga_jual", "perusahaan"],
}

DEFAULT_TEXTS = {
    "surat_spr": {
        "subject": "Surat Pesanan Rumah a.n. {{nama_pembeli}}",
        "body": (
            "Yang bertanda tangan di bawah ini:\n\n"
            "Nama\t: {{nama_pembeli}}\n"
            "NIK\t: {{nik}}\n"
            "Alamat\t: {{alamat_pembeli}}\n\n"
            "Dengan ini memesan 1 (satu) unit rumah pada {{perusahaan}} dengan rincian:\n\n"
            "Proyek\t: {{proyek}}\n"
            "Unit\t: {{unit}}\n"
            "Harga\t: {{harga_jual}}\n\n"
            "Pemesanan ini kami ajukan sebagai kelengkapan permohonan KPR pada {{bank}}. "
            "Demikian surat pesanan ini kami buat dengan sebenarnya.\n\n"
            "Hormat kami,\n\n\n"
            "{{nama_pembeli}}"
        ),
    },
    "surat_pencairan_awal": {
        "subject": "Permohonan Pencairan Dana KPR a.n. {{nama_pembeli}}",
        "body": (
            "Kepada Yth.\n"
            "Pimpinan {{bank}}\n"
            "di Tempat\n\n"
            "Dengan hormat,\n\n"
            "Sehubungan telah dilaksanakannya akad kredit pada {{tanggal_akad}} untuk pembelian unit "
            "di {{proyek}} / {{unit}} atas nama {{nama_pembeli}}, dengan ini kami {{perusahaan}} "
            "mengajukan permohonan pencairan dana KPR sebesar:\n\n"
            "{{jumlah_pencairan}}\n"
            "({{terbilang_pencairan}})\n\n"
            "Mohon dana ditransfer ke rekening kami:\n"
            "Bank\t: {{nama_bank_rekening}}\n"
            "No. Rekening\t: {{nomor_rekening}}\n"
            "Atas Nama\t: {{perusahaan}}\n\n"
            "Demikian permohonan ini kami sampaikan. Atas perhatiannya kami ucapkan terima kasih.\n\n"
            "Hormat kami,\n"
            "{{perusahaan}}"
        ),
    },
    "surat_pencairan_retensi": {
        "subject": "Permohonan Pencairan Retensi a.n. {{nama_pembeli}}",
        "body": (
            "Kepada Yth.\n"
            "Pimpinan {{bank}}\n"
            "di Tempat\n\n"
            "Dengan hormat,\n\n"
            "Sehubungan telah selesainya pembangunan unit di {{proyek}} / {{unit}} atas nama "
            "{{nama_pembeli}} (akad kredit {{tanggal_akad}}), dengan ini kami {{perusahaan}} "
            "mengajukan permohonan pencairan dana retensi sebesar:\n\n"
            "{{jumlah_retensi}}\n"
            "({{terbilang_retensi}})\n\n"
            "Mohon dana ditransfer ke rekening kami:\n"
            "Bank\t: {{nama_bank_rekening}}\n"
            "No. Rekening\t: {{nomor_rekening}}\n"
            "Atas Nama\t: {{perusahaan}}\n\n"
            "Demikian permohonan ini kami sampaikan. Atas perhatiannya kami ucapkan terima kasih.\n\n"
            "Hormat kami,\n"
            "{{perusahaan}}"
        ),
    },
    "kuitansi": {
        "subject": "",
        "body": (
            "Pembayaran dianggap sah setelah dana diterima dan tervalidasi oleh {{perusahaan}}. "
            "Kuitansi ini merupakan bukti pembayaran yang sah."
        ),
    },
    "form_penjualan": {
        "subject": "",
        "body": (
            "1. Pemesan telah membaca dan menyetujui harga serta cara pembayaran yang tercantum.\n"
            "2. Tanda jadi/uang muka yang telah dibayarkan tidak dapat dikembalikan apabila "
            "pemesan membatalkan pembelian secara sepihak.\n"
            "3. Serah terima unit dilakukan setelah kewajiban pembayaran diselesaikan sesuai kesepakatan.\n"
            "4. Hal-hal lain yang belum diatur akan dituangkan dalam PPJB/AJB."
        ),
    },
}


async def _resolve_row(db, tenant_id, doc_key: str, bank_id=None):
    """Baris pemenang: template bank spesifik (bila ada isi) → default tenant (bank NULL)."""
    row = None
    if bank_id is not None:
        row = (await db.execute(select(DocumentText).where(
            DocumentText.tenant_id == tenant_id, DocumentText.doc_key == doc_key,
            DocumentText.bank_id == bank_id))).scalar_one_or_none()
        if row is None or not (row.subject or row.body):
            row = None
    if row is None:
        row = (await db.execute(select(DocumentText).where(
            DocumentText.tenant_id == tenant_id, DocumentText.doc_key == doc_key,
            DocumentText.bank_id.is_(None)))).scalar_one_or_none()
    return row


async def get_doc_text(db, tenant_id, doc_key: str, bank_id=None):
    """(subject, body) dgn fallback ke bawaan sistem."""
    d = DEFAULT_TEXTS.get(doc_key, {"subject": "", "body": ""})
    row = await _resolve_row(db, tenant_id, doc_key, bank_id)
    subject = (row.subject if row and row.subject else None) or d["subject"]
    body = (row.body if row and row.body else None) or d["body"]
    return subject, body


async def get_doc_full(db, tenant_id, doc_key: str, bank_id=None):
    """(subject, body, signer_name, signer_title) — signer dari baris pemenang (boleh None)."""
    d = DEFAULT_TEXTS.get(doc_key, {"subject": "", "body": ""})
    row = await _resolve_row(db, tenant_id, doc_key, bank_id)
    subject = (row.subject if row and row.subject else None) or d["subject"]
    body = (row.body if row and row.body else None) or d["body"]
    return subject, body, (row.signer_name if row else None), (row.signer_title if row else None)


def fill_vars(text: str, ctx: dict) -> str:
    if not text:
        return ""
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: str(ctx.get(m.group(1), "")), text)


# ── Terbilang (Bahasa Indonesia) ──
_SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan",
           "sepuluh", "sebelas"]


def _terbilang_int(n: int) -> str:
    if n < 12:
        return _SATUAN[n]
    if n < 20:
        return _terbilang_int(n - 10) + " belas"
    if n < 100:
        return _terbilang_int(n // 10) + " puluh" + ((" " + _terbilang_int(n % 10)) if n % 10 else "")
    if n < 200:
        return "seratus" + ((" " + _terbilang_int(n - 100)) if n > 100 else "")
    if n < 1000:
        return _terbilang_int(n // 100) + " ratus" + ((" " + _terbilang_int(n % 100)) if n % 100 else "")
    if n < 2000:
        return "seribu" + ((" " + _terbilang_int(n - 1000)) if n > 1000 else "")
    if n < 1_000_000:
        return _terbilang_int(n // 1000) + " ribu" + ((" " + _terbilang_int(n % 1000)) if n % 1000 else "")
    if n < 1_000_000_000:
        return _terbilang_int(n // 1_000_000) + " juta" + ((" " + _terbilang_int(n % 1_000_000)) if n % 1_000_000 else "")
    if n < 1_000_000_000_000:
        return _terbilang_int(n // 1_000_000_000) + " miliar" + ((" " + _terbilang_int(n % 1_000_000_000)) if n % 1_000_000_000 else "")
    return _terbilang_int(n // 1_000_000_000_000) + " triliun" + ((" " + _terbilang_int(n % 1_000_000_000_000)) if n % 1_000_000_000_000 else "")


def terbilang_rupiah(value) -> str:
    if value is None:
        return "-"
    n = int(Decimal(value))
    if n == 0:
        return "nol rupiah"
    words = _terbilang_int(n).strip().replace("  ", " ")
    return words + " rupiah"
