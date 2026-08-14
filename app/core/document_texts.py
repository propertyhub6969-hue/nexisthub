"""Teks dokumen per-tenant: default bawaan + pengisian variabel.
Dipakai fitur 'Teks Dokumen' (Setting) & cetak dokumen. Pola generik via doc_key."""
import re
from sqlalchemy import select
from app.models.document_text import DocumentText

# Daftar putih variabel per dokumen — supaya UI bisa tampilkan chip & tak ada token ngawur.
DOC_VARIABLES = {
    "surat_permohonan_bank": [
        "nama_pembeli", "nik", "alamat_pembeli", "bank", "proyek", "unit",
        "harga_jual", "plafon", "tenor", "bunga", "perusahaan", "kota", "tanggal",
    ],
}

# Teks standar bawaan (dipakai bila tenant belum menyesuaikan).
DEFAULT_TEXTS = {
    "surat_permohonan_bank": {
        "subject": "Permohonan Fasilitas KPR a.n. {{nama_pembeli}}",
        "body": (
            "Kepada Yth.\n"
            "Pimpinan {{bank}}\n"
            "di Tempat\n\n"
            "Dengan hormat,\n\n"
            "Bersama surat ini, kami {{perusahaan}} selaku pengembang mengajukan permohonan "
            "fasilitas Kredit Pemilikan Rumah (KPR) untuk konsumen kami berikut:\n\n"
            "Nama\t: {{nama_pembeli}}\n"
            "NIK\t: {{nik}}\n"
            "Alamat\t: {{alamat_pembeli}}\n"
            "Proyek / Unit\t: {{proyek}} / {{unit}}\n"
            "Harga Jual\t: {{harga_jual}}\n"
            "Plafon Diajukan\t: {{plafon}}\n\n"
            "Besar harapan kami permohonan ini dapat diproses. Atas perhatian dan kerja samanya, "
            "kami ucapkan terima kasih.\n\n"
            "Hormat kami,\n"
            "{{perusahaan}}"
        ),
    },
}


async def get_doc_text(db, tenant_id, doc_key: str):
    """Kembalikan (subject, body) tersimpan tenant, atau default bawaan bila belum ada/kosong."""
    row = (await db.execute(select(DocumentText).where(
        DocumentText.tenant_id == tenant_id, DocumentText.doc_key == doc_key))).scalar_one_or_none()
    d = DEFAULT_TEXTS.get(doc_key, {"subject": "", "body": ""})
    subject = (row.subject if row and row.subject else None) or d["subject"]
    body = (row.body if row and row.body else None) or d["body"]
    return subject, body


def fill_vars(text: str, ctx: dict) -> str:
    """Ganti {{key}} dengan ctx[key]. Token tak dikenal dikosongkan agar tak bocor ke hasil."""
    if not text:
        return ""
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: str(ctx.get(m.group(1), "")), text)
