"""Importir data dari Excel (migrasi data klien).

Alur: unduh template terisi → klien lengkapi → upload → PRATINJAU (insert/update/error)
→ TERAPKAN (upsert). Sheet pertama yang didukung: UNIT (kunci: Proyek + Blok + Nomor Unit).
Pembeli & Pembayaran menyusul.
"""
import io
import os
import uuid
import zipfile
import mimetypes
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core import storage
from app.core.audit import record_audit
from app.core.unit_status import unit_status_for_client, set_unit_status
from app.api.deps import get_current_context, AuthContext
from app.models.property import Project, Unit, UnitStatus
from app.models.marketing import Client, ClientStatus, ClientPaymentType
from app.models.document import Document, DocStatus

_MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB / file (samakan dgn modul Dokumen)

router = APIRouter()

# ── peta status ID ↔ enum ──
STATUS_TO_LABEL = {UnitStatus.AVAILABLE: "Tersedia", UnitStatus.BOOKED: "Booking",
                   UnitStatus.SOLD: "Terjual", UnitStatus.HANDOVER: "Serah Terima"}
LABEL_TO_STATUS = {v.lower(): k for k, v in STATUS_TO_LABEL.items()}
LABEL_TO_STATUS.update({"available": UnitStatus.AVAILABLE, "booked": UnitStatus.BOOKED,
                        "sold": UnitStatus.SOLD, "handover": UnitStatus.HANDOVER})

# header UNIT → field internal (dicocokkan longgar: lower, tanpa "*", by kata kunci)
def _norm_header(h) -> str:
    return str(h or "").strip().lower().replace("*", "").strip()

def _field_of(h: str) -> Optional[str]:
    n = _norm_header(h)
    if n.startswith("proyek"): return "project"
    if n.startswith("blok"): return "block"
    if n.startswith("nomor unit") or n == "unit" or n.startswith("no unit"): return "unit_number"
    if n.startswith("tipe"): return "unit_type"
    if n.startswith("luas tanah"): return "land_area"
    if n.startswith("luas bangunan"): return "building_area"
    if n.startswith("harga"): return "price"
    if n.startswith("diskon"): return "discount"
    if n.startswith("status"): return "status"
    return None


def _to_decimal(v) -> Optional[Decimal]:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return Decimal(str(v))
    s = str(v).strip().replace("Rp", "").replace("rp", "").strip()
    if s == "":
        return None
    # buang pemisah ribuan bila ada (1.234.567 atau 1,234,567)
    if s.count(".") > 1 or (s.count(",") > 1):
        s = s.replace(".", "").replace(",", "")
    else:
        s = s.replace(",", ".") if ("," in s and "." not in s) else s.replace(",", "")
    return Decimal(s)


def _to_date(v) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(s)


# peta label ID pembeli ↔ enum
PT_TO_LABEL = {ClientPaymentType.CASH: "Cash", ClientPaymentType.KPR: "KPR"}
LABEL_TO_PT = {"cash": ClientPaymentType.CASH, "kpr": ClientPaymentType.KPR,
               "tunai": ClientPaymentType.CASH}
CST_TO_LABEL = {ClientStatus.ACTIVE: "Aktif", ClientStatus.COMPLETED: "Selesai",
                ClientStatus.INACTIVE: "Batal"}
LABEL_TO_CST = {"aktif": ClientStatus.ACTIVE, "selesai": ClientStatus.COMPLETED,
                "batal": ClientStatus.INACTIVE, "active": ClientStatus.ACTIVE,
                "completed": ClientStatus.COMPLETED, "inactive": ClientStatus.INACTIVE,
                "nonaktif": ClientStatus.INACTIVE}


class ImportRow(BaseModel):
    row: int
    action: str            # insert | update | error
    label: str             # "Daiyan Permai / A / 036"
    errors: list[str] = []
    note: Optional[str] = None   # ringkasan perubahan (update)


class ImportPreview(BaseModel):
    sheet: str = "UNIT"
    total: int
    to_insert: int
    to_update: int
    error_count: int
    rows: list[ImportRow]


class ImportCommitResult(BaseModel):
    batch_id: str
    inserted: int
    updated: int
    error_count: int
    rows: list[ImportRow]


async def _load_maps(db: AsyncSession, tenant_id):
    """peta nama-proyek→id dan (proyek,blok,unit)→Unit."""
    projs = (await db.execute(
        select(Project.id, Project.name).where(Project.tenant_id == tenant_id))).all()
    proj_by_name = {name.strip().lower(): pid for pid, name in projs}
    units = (await db.execute(
        select(Unit).where(Unit.tenant_id == tenant_id))).scalars().all()
    unit_by_key = {}
    for u in units:
        key = (u.project_id, (u.block or "").strip().lower(), (u.unit_number or "").strip().lower())
        unit_by_key[key] = u
    return proj_by_name, unit_by_key


def _read_unit_rows(contents: bytes):
    """baca sheet UNIT → daftar (row_num, dict field mentah). Error kalau sheet tak ada."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="File bukan Excel (.xlsx) yang valid.")
    ws = None
    for name in wb.sheetnames:
        if name.strip().lower() == "unit":
            ws = wb[name]; break
    if ws is None:
        raise HTTPException(status_code=400, detail="Sheet 'UNIT' tidak ditemukan di file.")
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header = next(rows_iter)
    except StopIteration:
        return []
    col_map = {}
    for i, h in enumerate(header):
        f = _field_of(h)
        if f:
            col_map[f] = i
    if "project" not in col_map or "unit_number" not in col_map:
        raise HTTPException(status_code=400, detail="Header 'Proyek' dan 'Nomor Unit' wajib ada di sheet UNIT.")
    out = []
    rnum = 1
    for raw in rows_iter:
        rnum += 1
        def g(field):
            idx = col_map.get(field)
            return raw[idx] if (idx is not None and idx < len(raw)) else None
        d = {f: g(f) for f in ["project", "block", "unit_number", "unit_type",
                               "land_area", "building_area", "price", "discount", "status"]}
        # lewati baris kosong total
        if all((v is None or str(v).strip() == "") for v in d.values()):
            continue
        out.append((rnum, d))
    return out


def _classify(rows, proj_by_name, unit_by_key):
    """→ (parsed list of (row_num, kind, payload, unit_obj_or_None, ImportRow))"""
    parsed = []
    for rnum, d in rows:
        errors = []
        pname = str(d["project"] or "").strip()
        unum = str(d["unit_number"] or "").strip()
        block = (str(d["block"]).strip() if d["block"] not in (None, "") else None)
        label = " / ".join(x for x in [pname or "?", block or "", unum or "?"] if x != "")
        pid = proj_by_name.get(pname.lower()) if pname else None
        if not pname:
            errors.append("Proyek kosong")
        elif pid is None:
            errors.append(f"Proyek '{pname}' tidak ada di sistem")
        if not unum:
            errors.append("Nomor Unit kosong")

        vals = {}
        for f, lbl in [("land_area", "Luas Tanah"), ("building_area", "Luas Bangunan"),
                       ("price", "Harga"), ("discount", "Diskon")]:
            try:
                vals[f] = _to_decimal(d[f])
            except (InvalidOperation, ValueError):
                errors.append(f"{lbl} bukan angka: '{d[f]}'")
                vals[f] = None

        st = None
        if d["status"] not in (None, ""):
            st = LABEL_TO_STATUS.get(str(d["status"]).strip().lower())
            if st is None:
                errors.append(f"Status tidak dikenal: '{d['status']}'")
        vals["status"] = st
        vals["unit_type"] = (str(d["unit_type"]).strip() if d["unit_type"] not in (None, "") else None)

        if errors:
            parsed.append((rnum, "error", None, None, ImportRow(row=rnum, action="error", label=label, errors=errors)))
            continue

        key = (pid, (block or "").strip().lower(), unum.strip().lower())
        existing = unit_by_key.get(key)
        payload = {"project_id": pid, "block": block, "unit_number": unum, **vals}
        if existing:
            changed = []
            for f in ["unit_type", "land_area", "building_area", "price", "discount", "status"]:
                nv = vals[f]
                if nv is None:
                    continue  # kosong = jangan timpa
                cur = getattr(existing, f)
                if f in ("land_area", "building_area", "price", "discount"):
                    cur = Decimal(str(cur)) if cur is not None else None
                if cur != nv:
                    changed.append(f)
            note = ("Ubah: " + ", ".join(changed)) if changed else "Tidak ada perubahan"
            parsed.append((rnum, "update", payload, existing, ImportRow(row=rnum, action="update", label=label, note=note)))
        else:
            parsed.append((rnum, "insert", payload, None, ImportRow(row=rnum, action="insert", label=label)))
    return parsed


@router.post("/units/preview", response_model=ImportPreview)
async def preview_units(
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    contents = await file.read()
    rows = _read_unit_rows(contents)
    proj_by_name, unit_by_key = await _load_maps(db, ctx.tenant_id)
    parsed = _classify(rows, proj_by_name, unit_by_key)
    ins = sum(1 for p in parsed if p[1] == "insert")
    upd = sum(1 for p in parsed if p[1] == "update")
    err = sum(1 for p in parsed if p[1] == "error")
    return ImportPreview(total=len(parsed), to_insert=ins, to_update=upd, error_count=err,
                         rows=[p[4] for p in parsed])


@router.post("/units/commit", response_model=ImportCommitResult)
async def commit_units(
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    contents = await file.read()
    rows = _read_unit_rows(contents)
    proj_by_name, unit_by_key = await _load_maps(db, ctx.tenant_id)
    parsed = _classify(rows, proj_by_name, unit_by_key)
    batch_id = str(uuid.uuid4())
    inserted = updated = 0
    new_units = []
    for rnum, kind, payload, existing, rowres in parsed:
        if kind == "insert":
            u = Unit(tenant_id=ctx.tenant_id, project_id=payload["project_id"],
                     block=payload["block"], unit_number=payload["unit_number"],
                     unit_type=payload["unit_type"], land_area=payload["land_area"],
                     building_area=payload["building_area"], price=payload["price"],
                     discount=payload["discount"],
                     status=payload["status"] or UnitStatus.AVAILABLE)
            db.add(u); new_units.append(u); inserted += 1
        elif kind == "update":
            for f in ["unit_type", "land_area", "building_area", "price", "discount", "status"]:
                nv = payload[f]
                if nv is not None:
                    setattr(existing, f, nv)
            updated += 1
    if inserted or updated:
        await db.flush()
        await record_audit(db, ctx.tenant_id, ctx.user_id, "IMPORT", "units", uuid.UUID(batch_id),
                           new_data={"batch": batch_id, "inserted": inserted, "updated": updated})
        await db.commit()
    err = sum(1 for p in parsed if p[1] == "error")
    return ImportCommitResult(batch_id=batch_id, inserted=inserted, updated=updated,
                              error_count=err, rows=[p[4] for p in parsed])


# ═══════════════════════ UNDUH TEMPLATE (terisi data saat ini) ═══════════════════════
_FONT = "Arial"
_hdr_fill = PatternFill("solid", fgColor="1E3A5F")
_hdr_key = PatternFill("solid", fgColor="D9C9A0")
_key_cell = PatternFill("solid", fgColor="F3EEE0")
_ex_fill = PatternFill("solid", fgColor="FFF7D6")
_thin = Side(style="thin", color="D0D0D0")
_border = Border(left=_thin, right=_thin, top=_thin, bottom=_thin)


def _cell(ws, r, c, v, *, bold=False, color="000000", italic=False, fill=None, align="left", numfmt=None):
    x = ws.cell(row=r, column=c, value=v)
    x.font = Font(name=_FONT, bold=bold, color=color, size=10, italic=italic)
    x.alignment = Alignment(horizontal=align, vertical="center")
    if fill: x.fill = fill
    if numfmt: x.number_format = numfmt
    x.border = _border
    return x


def _headers(ws, cols):
    for i, (title, width, is_key, req) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width
        c = ws.cell(row=1, column=i, value=title + (" *" if req else ""))
        c.font = Font(name=_FONT, bold=True, size=10, color=("3A3120" if is_key else "FFFFFF"))
        c.fill = _hdr_key if is_key else _hdr_fill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = _border
    ws.row_dimensions[1].height = 28
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}1"


def _dv(ws, values, col_idx, first, last):
    d = DataValidation(type="list", formula1='"' + ",".join(values) + '"', allow_blank=True)
    ws.add_data_validation(d)
    L = get_column_letter(col_idx)
    d.add(f"{L}{first}:{L}{last}")


def _build_template(projects, units) -> bytes:
    wb = openpyxl.Workbook()
    # Petunjuk
    ws = wb.active; ws.title = "Petunjuk"; ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3; ws.column_dimensions["B"].width = 30; ws.column_dimensions["C"].width = 90
    t = ws.cell(row=1, column=2, value="TEMPLATE IMPOR DATA — NEXISTHUB")
    t.font = Font(name=_FONT, bold=True, color="FFFFFF", size=13); ws.merge_cells("B1:C1")
    ws["B1"].fill = _hdr_fill; ws["C1"].fill = _hdr_fill; ws.row_dimensions[1].height = 26
    tips = [
        ("Cara kerja", "Lengkapi sheet UNIT (sudah terisi data Anda). Upload kembali → pratinjau (diperbarui/baru/error) → Terapkan."),
        ("Kolom KUNCI (krem)", "Proyek + Blok + Nomor Unit = penanda. JANGAN diubah — dipakai untuk MEMPERBARUI unit yang ada (bukan membuat dobel)."),
        ("Kolom kosong", "Isi yang kosong (tipe, luas, harga). Dibiarkan kosong = nilai lama tidak diubah."),
        ("Format angka", "Angka polos tanpa 'Rp'/titik. Contoh: 185000000."),
        ("Status (dropdown)", "Tersedia · Booking · Terjual · Serah Terima"),
        ("Nama proyek (persis)", " · ".join(projects)),
    ]
    r = 3
    for a, b in tips:
        ca = ws.cell(row=r, column=2, value=a); ca.font = Font(name=_FONT, bold=True, size=10)
        ca.alignment = Alignment(vertical="top", wrap_text=True)
        cb = ws.cell(row=r, column=3, value=b); cb.font = Font(name=_FONT, size=10)
        cb.alignment = Alignment(vertical="top", wrap_text=True); ws.row_dimensions[r].height = 30
        r += 1
    # UNIT
    wu = wb.create_sheet("UNIT"); wu.sheet_view.showGridLines = False
    ucols = [("Proyek", 20, True, True), ("Blok", 8, True, False), ("Nomor Unit", 12, True, True),
             ("Tipe", 10, False, False), ("Luas Tanah (m²)", 14, False, False),
             ("Luas Bangunan (m²)", 16, False, False), ("Harga (Rp)", 16, False, False),
             ("Diskon (Rp)", 14, False, False), ("Status", 15, False, False)]
    _headers(wu, ucols)
    row = 2
    for u in units:
        _cell(wu, row, 1, u["proyek"], fill=_key_cell)
        _cell(wu, row, 2, u["blok"], fill=_key_cell, align="center")
        _cell(wu, row, 3, u["unit"], fill=_key_cell, align="center", bold=True)
        _cell(wu, row, 4, u["tipe"], align="center")
        _cell(wu, row, 5, u["lt"], align="right", numfmt="#,##0.##")
        _cell(wu, row, 6, u["lb"], align="right", numfmt="#,##0.##")
        _cell(wu, row, 7, u["harga"], align="right", numfmt="#,##0")
        _cell(wu, row, 8, u["diskon"], align="right", numfmt="#,##0")
        _cell(wu, row, 9, u["status"], align="center")
        row += 1
    _dv(wu, ["Tersedia", "Booking", "Terjual", "Serah Terima"], 9, 2, row + 500)
    _dv(wu, projects, 1, 2, row + 500)
    bio = io.BytesIO(); wb.save(bio); bio.seek(0)
    return bio.getvalue()


@router.get("/units/template")
async def download_units_template(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Template Excel UNIT SUDAH TERISI data unit tenant saat ini (ekspor-terisi)."""
    projs = (await db.execute(
        select(Project.id, Project.name).where(Project.tenant_id == ctx.tenant_id).order_by(Project.name))).all()
    pmap = {pid: name for pid, name in projs}
    pnames = [name for _, name in projs]
    units = (await db.execute(
        select(Unit).where(Unit.tenant_id == ctx.tenant_id)
        .order_by(Unit.project_id, Unit.block, Unit.unit_number))).scalars().all()
    rows = []
    for u in units:
        rows.append({
            "proyek": pmap.get(u.project_id, ""), "blok": u.block or "", "unit": u.unit_number or "",
            "tipe": u.unit_type or "", "lt": float(u.land_area) if u.land_area is not None else None,
            "lb": float(u.building_area) if u.building_area is not None else None,
            "harga": float(u.price) if u.price is not None else None,
            "diskon": float(u.discount) if u.discount is not None else None,
            "status": STATUS_TO_LABEL.get(u.status, "Tersedia"),
        })
    data = _build_template(pnames, rows)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Template_Import_Unit.xlsx"'})


# ═══════════════════════ PEMBELI & KONTRAK ═══════════════════════
def _client_field_of(h: str) -> Optional[str]:
    n = _norm_header(h)
    if "ppjb" in n: return "ppjb_number"
    if "ajb" in n: return "ajb_number"
    if n.startswith("nama"): return "full_name"
    if n.startswith("nik"): return "nik"
    if n.startswith("no. hp") or n.startswith("no hp") or n.startswith("hp") or "telepon" in n or n.startswith("telp"): return "phone"
    if n.startswith("email"): return "email"
    if n.startswith("alamat"): return "address"
    if n.startswith("proyek"): return "project"
    if n.startswith("nomor unit") or n.startswith("no unit") or n == "unit": return "unit_number"
    if "pembayaran" in n or "cara beli" in n: return "payment_type"
    if "nilai kontrak" in n or n.startswith("harga") or n.startswith("kontrak"): return "contract_value"
    if n.startswith("tanggal"): return "contract_date"
    if n.startswith("status"): return "status"
    return None


def _read_client_rows(contents: bytes):
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="File bukan Excel (.xlsx) yang valid.")
    ws = None
    for name in wb.sheetnames:
        if name.strip().lower().startswith("pembeli"):
            ws = wb[name]; break
    if ws is None:
        raise HTTPException(status_code=400, detail="Sheet 'PEMBELI' tidak ditemukan di file.")
    it = ws.iter_rows(values_only=True)
    try:
        header = next(it)
    except StopIteration:
        return []
    col_map = {}
    for i, h in enumerate(header):
        f = _client_field_of(h)
        if f and f not in col_map:
            col_map[f] = i
    if "full_name" not in col_map:
        raise HTTPException(status_code=400, detail="Header 'Nama Pembeli' wajib ada di sheet PEMBELI.")
    fields = ["full_name", "nik", "phone", "email", "address", "project", "unit_number",
              "payment_type", "contract_value", "contract_date", "ppjb_number", "ajb_number", "status"]
    out = []
    rnum = 1
    for raw in it:
        rnum += 1
        d = {f: (raw[col_map[f]] if (f in col_map and col_map[f] < len(raw)) else None) for f in fields}
        if all((v is None or str(v).strip() == "") for v in d.values()):
            continue
        # lewati baris contoh
        if str(d.get("full_name") or "").strip().upper().startswith("CONTOH"):
            continue
        out.append((rnum, d))
    return out


async def _load_client_maps(db: AsyncSession, tenant_id):
    projs = (await db.execute(select(Project.id, Project.name).where(Project.tenant_id == tenant_id))).all()
    proj_by_name = {name.strip().lower(): pid for pid, name in projs}
    # unit per (project, unit_number) — bisa >1 kalau nomor sama beda blok
    units = (await db.execute(select(Unit.id, Unit.project_id, Unit.unit_number).where(Unit.tenant_id == tenant_id))).all()
    unit_by_pu = {}
    for uid, pid, unum in units:
        unit_by_pu.setdefault((pid, (unum or "").strip().lower()), []).append(uid)
    clients = (await db.execute(select(Client).where(Client.tenant_id == tenant_id, Client.is_deleted == False))).scalars().all()  # noqa: E712
    by_nik = {}
    by_unit = {}
    for c in clients:
        if c.nik:
            by_nik[c.nik.strip()] = c
        if c.unit_id and c.status != ClientStatus.INACTIVE:
            by_unit[c.unit_id] = c
    return proj_by_name, unit_by_pu, by_nik, by_unit


def _classify_clients(rows, proj_by_name, unit_by_pu, by_nik, by_unit):
    """→ list (row_num, kind, payload, existing_client, resolved_unit_id, ImportRow)."""
    parsed = []
    for rnum, d in rows:
        errors = []
        name = str(d["full_name"] or "").strip()
        if not name:
            errors.append("Nama kosong")
        nik = (str(d["nik"]).strip() if d["nik"] not in (None, "") else None)
        pname = str(d["project"] or "").strip()
        unum = (str(d["unit_number"]).strip() if d["unit_number"] not in (None, "") else None)
        label = name or "?"
        pid = proj_by_name.get(pname.lower()) if pname else None
        if pname and pid is None:
            errors.append(f"Proyek '{pname}' tidak ada")

        resolved_unit = None
        if unum:
            if pid is None:
                errors.append("Nomor Unit diisi tapi Proyek kosong/salah")
            else:
                cand = unit_by_pu.get((pid, unum.lower()), [])
                if len(cand) == 0:
                    errors.append(f"Unit '{unum}' tak ada di proyek {pname}")
                elif len(cand) > 1:
                    errors.append(f"Unit '{unum}' ambigu (ada di >1 blok) — pakai importir Unit dulu")
                else:
                    resolved_unit = cand[0]

        pt = None
        if d["payment_type"] not in (None, ""):
            pt = LABEL_TO_PT.get(str(d["payment_type"]).strip().lower())
            if pt is None:
                errors.append(f"Tipe Pembayaran tak dikenal: '{d['payment_type']}'")
        st = None
        if d["status"] not in (None, ""):
            st = LABEL_TO_CST.get(str(d["status"]).strip().lower())
            if st is None:
                errors.append(f"Status tak dikenal: '{d['status']}'")
        try:
            cval = _to_decimal(d["contract_value"])
        except (InvalidOperation, ValueError):
            errors.append(f"Nilai Kontrak bukan angka: '{d['contract_value']}'"); cval = None
        try:
            cdate = _to_date(d["contract_date"])
        except ValueError:
            errors.append(f"Tanggal Kontrak tak valid: '{d['contract_date']}' (pakai dd/mm/yyyy)"); cdate = None

        # cari existing: NIK dulu, lalu unit
        existing = None
        if nik and nik in by_nik:
            existing = by_nik[nik]
        elif resolved_unit and resolved_unit in by_unit:
            existing = by_unit[resolved_unit]

        # bentrok unit: unit sudah dipakai pembeli aktif LAIN
        if resolved_unit and resolved_unit in by_unit and (existing is None or by_unit[resolved_unit].id != existing.id):
            errors.append(f"Unit '{unum}' sudah dipakai pembeli lain ({by_unit[resolved_unit].full_name})")

        if errors:
            parsed.append((rnum, "error", None, None, None, ImportRow(row=rnum, action="error", label=label, errors=errors)))
            continue

        payload = {"full_name": name, "nik": nik,
                   "phone": (str(d["phone"]).strip() if d["phone"] not in (None, "") else None),
                   "email": (str(d["email"]).strip() if d["email"] not in (None, "") else None),
                   "address": (str(d["address"]).strip() if d["address"] not in (None, "") else None),
                   "project_id": pid, "unit_id": resolved_unit, "unit_number": unum,
                   "payment_type": pt, "contract_value": cval, "contract_date": cdate,
                   "ppjb_number": (str(d["ppjb_number"]).strip() if d["ppjb_number"] not in (None, "") else None),
                   "ajb_number": (str(d["ajb_number"]).strip() if d["ajb_number"] not in (None, "") else None),
                   "status": st}
        if existing:
            parsed.append((rnum, "update", payload, existing, resolved_unit,
                           ImportRow(row=rnum, action="update", label=label, note="Cocok " + ("NIK" if (nik and nik in by_nik) else "unit"))))
        else:
            parsed.append((rnum, "insert", payload, None, resolved_unit,
                           ImportRow(row=rnum, action="insert", label=label)))
    return parsed


@router.post("/clients/preview", response_model=ImportPreview)
async def preview_clients(
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    contents = await file.read()
    rows = _read_client_rows(contents)
    maps = await _load_client_maps(db, ctx.tenant_id)
    parsed = _classify_clients(rows, *maps)
    ins = sum(1 for p in parsed if p[1] == "insert")
    upd = sum(1 for p in parsed if p[1] == "update")
    err = sum(1 for p in parsed if p[1] == "error")
    return ImportPreview(sheet="PEMBELI", total=len(parsed), to_insert=ins, to_update=upd,
                         error_count=err, rows=[p[5] for p in parsed])


@router.post("/clients/commit", response_model=ImportCommitResult)
async def commit_clients(
    file: UploadFile = File(...),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    contents = await file.read()
    rows = _read_client_rows(contents)
    maps = await _load_client_maps(db, ctx.tenant_id)
    parsed = _classify_clients(rows, *maps)
    batch_id = str(uuid.uuid4())
    inserted = updated = 0
    upd_fields = ["full_name", "nik", "phone", "email", "address", "project_id", "unit_id",
                  "unit_number", "payment_type", "contract_value", "contract_date",
                  "ppjb_number", "ajb_number", "status"]
    for rnum, kind, payload, existing, unit_id, rowres in parsed:
        if kind == "insert":
            c = Client(tenant_id=ctx.tenant_id, marketing_user_id=ctx.user_id,
                       status=payload["status"] or ClientStatus.ACTIVE,
                       **{k: payload[k] for k in upd_fields if k != "status"})
            db.add(c); await db.flush()
            if c.unit_id:
                await set_unit_status(db, ctx.tenant_id, c.unit_id, unit_status_for_client(c))
            inserted += 1
        elif kind == "update":
            for f in upd_fields:
                nv = payload[f]
                if nv is not None:
                    setattr(existing, f, nv)
            await db.flush()
            if existing.unit_id:
                await set_unit_status(db, ctx.tenant_id, existing.unit_id, unit_status_for_client(existing))
            updated += 1
    if inserted or updated:
        await record_audit(db, ctx.tenant_id, ctx.user_id, "IMPORT", "clients", uuid.UUID(batch_id),
                           new_data={"batch": batch_id, "inserted": inserted, "updated": updated})
        await db.commit()
    err = sum(1 for p in parsed if p[1] == "error")
    return ImportCommitResult(batch_id=batch_id, inserted=inserted, updated=updated,
                              error_count=err, rows=[p[5] for p in parsed])


@router.get("/clients/template")
async def download_clients_template(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Template PEMBELI & KONTRAK — terisi pembeli tenant saat ini (bila ada)."""
    projs = (await db.execute(
        select(Project.id, Project.name).where(Project.tenant_id == ctx.tenant_id).order_by(Project.name))).all()
    pmap = {pid: name for pid, name in projs}
    pnames = [name for _, name in projs]
    # nomor unit dari unit_id
    clients = (await db.execute(
        select(Client).where(Client.tenant_id == ctx.tenant_id, Client.is_deleted == False))).scalars().all()  # noqa: E712
    unit_ids = [c.unit_id for c in clients if c.unit_id]
    unum_map = {}
    if unit_ids:
        for uid, unum in (await db.execute(select(Unit.id, Unit.unit_number).where(Unit.id.in_(unit_ids)))).all():
            unum_map[uid] = unum
    rows = []
    for c in clients:
        rows.append({
            "nama": c.full_name or "", "nik": c.nik or "", "hp": c.phone or "", "email": c.email or "",
            "alamat": c.address or "", "proyek": pmap.get(c.project_id, ""),
            "unit": unum_map.get(c.unit_id) or (c.unit_number or ""),
            "bayar": PT_TO_LABEL.get(c.payment_type, "") if c.payment_type else "",
            "kontrak": float(c.contract_value) if c.contract_value is not None else None,
            "tgl": c.contract_date.strftime("%d/%m/%Y") if c.contract_date else "",
            "ppjb": c.ppjb_number or "", "ajb": c.ajb_number or "",
            "status": CST_TO_LABEL.get(c.status, "Aktif"),
        })
    data = _build_client_template(pnames, rows)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Template_Import_Pembeli.xlsx"'})


def _build_client_template(projects, clients) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = "Petunjuk"; ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3; ws.column_dimensions["B"].width = 26; ws.column_dimensions["C"].width = 92
    t = ws.cell(row=1, column=2, value="TEMPLATE IMPOR — PEMBELI & KONTRAK")
    t.font = Font(name=_FONT, bold=True, color="FFFFFF", size=13); ws.merge_cells("B1:C1")
    ws["B1"].fill = _hdr_fill; ws["C1"].fill = _hdr_fill; ws.row_dimensions[1].height = 26
    tips = [
        ("Cara kerja", "Lengkapi sheet PEMBELI. Upload → pratinjau (baru/perbarui/error) → Terapkan."),
        ("Pencocokan (anti-dobel)", "Sistem cocokkan lewat NIK; kalau NIK kosong, lewat Proyek+Nomor Unit. Cocok = diperbarui; tidak = ditambah."),
        ("Nomor Unit", "Harus sudah ada (impor Unit dulu). Menautkan pembeli ke unit → status unit otomatis (Dipesan/Terjual)."),
        ("Tipe Pembayaran", "Cash · KPR"),
        ("Status", "Aktif · Selesai · Batal"),
        ("Format", "Tanggal dd/mm/yyyy · angka polos tanpa 'Rp'/titik."),
        ("Nama proyek (persis)", " · ".join(projects)),
    ]
    r = 3
    for a, b in tips:
        ca = ws.cell(row=r, column=2, value=a); ca.font = Font(name=_FONT, bold=True, size=10)
        ca.alignment = Alignment(vertical="top", wrap_text=True)
        cb = ws.cell(row=r, column=3, value=b); cb.font = Font(name=_FONT, size=10)
        cb.alignment = Alignment(vertical="top", wrap_text=True); ws.row_dimensions[r].height = 28
        r += 1
    wp = wb.create_sheet("PEMBELI"); wp.sheet_view.showGridLines = False
    cols = [("Nama Pembeli", 22, False, True), ("NIK (KTP)", 20, False, False), ("No. HP", 15, False, False),
            ("Email", 20, False, False), ("Alamat", 24, False, False), ("Proyek", 18, True, False),
            ("Nomor Unit", 12, True, False), ("Tipe Pembayaran", 15, False, False),
            ("Nilai Kontrak (Rp)", 16, False, False), ("Tanggal Kontrak", 15, False, False),
            ("No. PPJB", 14, False, False), ("No. AJB", 14, False, False), ("Status", 12, False, False)]
    _headers(wp, cols)
    row = 2
    for c in clients:
        _cell(wp, row, 1, c["nama"])
        _cell(wp, row, 2, c["nik"])
        _cell(wp, row, 3, c["hp"])
        _cell(wp, row, 4, c["email"])
        _cell(wp, row, 5, c["alamat"])
        _cell(wp, row, 6, c["proyek"], fill=_key_cell)
        _cell(wp, row, 7, c["unit"], fill=_key_cell, align="center")
        _cell(wp, row, 8, c["bayar"], align="center")
        _cell(wp, row, 9, c["kontrak"], align="right", numfmt="#,##0")
        _cell(wp, row, 10, c["tgl"], align="center")
        _cell(wp, row, 11, c["ppjb"])
        _cell(wp, row, 12, c["ajb"])
        _cell(wp, row, 13, c["status"], align="center")
        row += 1
    _dv(wp, ["Cash", "KPR"], 8, 2, row + 500)
    _dv(wp, ["Aktif", "Selesai", "Batal"], 13, 2, row + 500)
    _dv(wp, projects, 6, 2, row + 500)
    bio = io.BytesIO(); wb.save(bio); bio.seek(0)
    return bio.getvalue()


# ═══════════════════════ DOKUMEN LEGALITAS UNIT (manifest + ZIP) ═══════════════════════
# doc_type kanonik (samakan dgn preset FE LegalDocuments) supaya dokumen impor tampil di UI.
DOC_CANON = {
    "shm": "Sertifikat SHM", "sertifikat shm": "Sertifikat SHM",
    "hgb": "Sertifikat HGB", "sertifikat hgb": "Sertifikat HGB",
    "slf": "SLF",
    "pbg": "IMB / PBG", "imb": "IMB / PBG", "imb/pbg": "IMB / PBG", "imb / pbg": "IMB / PBG",
    "pbb": "PBB",
}
LEGAL_DOC_TYPES = ["Sertifikat SHM", "Sertifikat HGB", "SLF", "IMB / PBG", "PBB"]
LABEL_TO_DOCST = {"belum": DocStatus.BELUM, "proses": DocStatus.PROSES, "terbit": DocStatus.TERBIT}
DOCST_TO_LABEL = {DocStatus.BELUM: "Belum", DocStatus.PROSES: "Proses", DocStatus.TERBIT: "Terbit"}


def _doc_field_of(h: str) -> Optional[str]:
    n = _norm_header(h)
    if n.startswith("jenis"): return "doc_type"
    if n.startswith("proyek"): return "project"
    if n.startswith("blok"): return "block"
    if n.startswith("nomor unit") or n.startswith("no unit") or n == "unit": return "unit_number"
    if "nomor dokumen" in n or n.startswith("no. dok") or n.startswith("no dok"): return "doc_number"
    if n.startswith("tanggal"): return "doc_date"
    if n.startswith("status"): return "status"
    if "nama file" in n or n == "file" or n.startswith("file"): return "file_name"
    return None


def _read_doc_rows(contents: bytes):
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="File bukan Excel (.xlsx) yang valid.")
    ws = None
    for name in wb.sheetnames:
        if name.strip().lower().startswith("dokumen"):
            ws = wb[name]; break
    if ws is None:
        raise HTTPException(status_code=400, detail="Sheet 'DOKUMEN' tidak ditemukan di file.")
    it = ws.iter_rows(values_only=True)
    try:
        header = next(it)
    except StopIteration:
        return []
    col_map = {}
    for i, h in enumerate(header):
        f = _doc_field_of(h)
        if f and f not in col_map:
            col_map[f] = i
    if "doc_type" not in col_map or "unit_number" not in col_map:
        raise HTTPException(status_code=400, detail="Header 'Jenis Dokumen' & 'Nomor Unit' wajib ada di sheet DOKUMEN.")
    fields = ["doc_type", "project", "block", "unit_number", "doc_number", "doc_date", "status", "file_name"]
    out = []
    rnum = 1
    for raw in it:
        rnum += 1
        d = {f: (raw[col_map[f]] if (f in col_map and col_map[f] < len(raw)) else None) for f in fields}
        if all((v is None or str(v).strip() == "") for v in d.values()):
            continue
        if str(d.get("doc_type") or "").strip().upper().startswith("CONTOH"):
            continue
        out.append((rnum, d))
    return out


async def _load_doc_maps(db: AsyncSession, tenant_id):
    projs = (await db.execute(select(Project.id, Project.name, Project.id).where(Project.tenant_id == tenant_id))).all()
    proj_by_name = {name.strip().lower(): pid for pid, name, _ in projs}
    units = (await db.execute(select(Unit.id, Unit.project_id, Unit.block, Unit.unit_number).where(Unit.tenant_id == tenant_id))).all()
    unit_by_key = {}   # (pid, block, unum) -> unit_id
    unit_by_pu = {}    # (pid, unum) -> [unit_id]
    for uid, pid, block, unum in units:
        bl = (block or "").strip().lower(); un = (unum or "").strip().lower()
        unit_by_key[(pid, bl, un)] = uid
        unit_by_pu.setdefault((pid, un), []).append(uid)
    docs = (await db.execute(
        select(Document).where(Document.tenant_id == tenant_id, Document.is_deleted == False,  # noqa: E712
                               Document.unit_id.isnot(None)))).scalars().all()
    existing = {}
    for dc in docs:
        existing[(dc.unit_id, dc.doc_type)] = dc
    return proj_by_name, unit_by_key, unit_by_pu, existing


def _classify_docs(rows, proj_by_name, unit_by_key, unit_by_pu, existing, zip_names, has_archive):
    """→ list (row_num, kind, payload, existing_doc, ImportRow). zip_names: basename→fullname."""
    parsed = []
    seen = {}  # (unit_id, doc_type) dalam batch → agar dobel di file jadi update
    for rnum, d in rows:
        errors = []
        raw_type = str(d["doc_type"] or "").strip()
        canon = DOC_CANON.get(raw_type.lower())
        if not raw_type:
            errors.append("Jenis Dokumen kosong")
        elif canon is None:
            errors.append(f"Jenis Dokumen tak dikenal: '{raw_type}' (SHM/HGB/SLF/PBG/PBB)")
        pname = str(d["project"] or "").strip()
        unum = str(d["unit_number"] or "").strip()
        block = (str(d["block"]).strip() if d["block"] not in (None, "") else None)
        pid = proj_by_name.get(pname.lower()) if pname else None
        label = f"{canon or raw_type or '?'} — {pname or '?'}/{unum or '?'}"
        if not pname:
            errors.append("Proyek kosong")
        elif pid is None:
            errors.append(f"Proyek '{pname}' tidak ada")
        if not unum:
            errors.append("Nomor Unit kosong")

        unit_id = None
        if pid is not None and unum:
            if block is not None:
                unit_id = unit_by_key.get((pid, block.lower(), unum.lower()))
                if unit_id is None:
                    errors.append(f"Unit {block}/{unum} tak ada di {pname}")
            else:
                cand = unit_by_pu.get((pid, unum.lower()), [])
                if len(cand) == 0:
                    errors.append(f"Unit '{unum}' tak ada di {pname}")
                elif len(cand) > 1:
                    errors.append(f"Unit '{unum}' ambigu (>1 blok) — isi kolom Blok")
                else:
                    unit_id = cand[0]

        st = None
        if d["status"] not in (None, ""):
            st = LABEL_TO_DOCST.get(str(d["status"]).strip().lower())
            if st is None:
                errors.append(f"Status tak dikenal: '{d['status']}'")
        try:
            ddate = _to_date(d["doc_date"])
        except ValueError:
            errors.append(f"Tanggal tak valid: '{d['doc_date']}'"); ddate = None

        fname = (str(d["file_name"]).strip() if d["file_name"] not in (None, "") else None)
        zip_full = None
        if fname:
            if not has_archive:
                errors.append("Nama File diisi tapi ZIP belum diunggah")
            else:
                hit = zip_names.get(os.path.basename(fname).lower())
                if hit is None:
                    errors.append(f"File '{fname}' tak ada di ZIP")
                elif isinstance(hit, list) and len(hit) > 1:
                    errors.append(f"Nama file '{fname}' dobel di ZIP")
                else:
                    zip_full = hit[0] if isinstance(hit, list) else hit

        if errors:
            parsed.append((rnum, "error", None, None, ImportRow(row=rnum, action="error", label=label, errors=errors)))
            continue

        payload = {"unit_id": unit_id, "doc_type": canon, "name": (str(d["doc_number"]).strip() if d["doc_number"] not in (None, "") else None),
                   "doc_date": ddate, "status": st, "file_name": fname, "zip_full": zip_full}
        key = (unit_id, canon)
        ex = existing.get(key) or seen.get(key)
        note = "Lampirkan file" if fname else "Metadata saja"
        if ex is not None:
            parsed.append((rnum, "update", payload, ex, ImportRow(row=rnum, action="update", label=label, note=note)))
        else:
            seen[key] = True
            parsed.append((rnum, "insert", payload, None, ImportRow(row=rnum, action="insert", label=label, note=note)))
    return parsed


def _read_zip_names(archive_bytes: Optional[bytes]):
    if not archive_bytes:
        return {}
    try:
        zf = zipfile.ZipFile(io.BytesIO(archive_bytes))
    except Exception:
        raise HTTPException(status_code=400, detail="Arsip ZIP tidak valid.")
    names = {}
    for n in zf.namelist():
        if n.endswith("/"):
            continue
        base = os.path.basename(n).lower()
        names.setdefault(base, []).append(n)
    return names


@router.post("/documents/preview", response_model=ImportPreview)
async def preview_documents(
    manifest: UploadFile = File(...),
    archive: Optional[UploadFile] = File(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    contents = await manifest.read()
    rows = _read_doc_rows(contents)
    arc = await archive.read() if archive is not None else None
    zip_names = _read_zip_names(arc)
    maps = await _load_doc_maps(db, ctx.tenant_id)
    parsed = _classify_docs(rows, *maps, zip_names, arc is not None)
    ins = sum(1 for p in parsed if p[1] == "insert")
    upd = sum(1 for p in parsed if p[1] == "update")
    err = sum(1 for p in parsed if p[1] == "error")
    return ImportPreview(sheet="DOKUMEN", total=len(parsed), to_insert=ins, to_update=upd,
                         error_count=err, rows=[p[4] for p in parsed])


@router.post("/documents/commit", response_model=ImportCommitResult)
async def commit_documents(
    manifest: UploadFile = File(...),
    archive: Optional[UploadFile] = File(None),
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    contents = await manifest.read()
    rows = _read_doc_rows(contents)
    arc = await archive.read() if archive is not None else None
    zf = zipfile.ZipFile(io.BytesIO(arc)) if arc else None
    zip_names = _read_zip_names(arc)
    proj_by_name, unit_by_key, unit_by_pu, existing = await _load_doc_maps(db, ctx.tenant_id)
    # project_id tiap unit (utk isi Document.project_id)
    unit_pid = {}
    for (pid, bl, un), uid in unit_by_key.items():
        unit_pid[uid] = pid
    parsed = _classify_docs(rows, proj_by_name, unit_by_key, unit_by_pu, existing, zip_names, arc is not None)
    batch_id = str(uuid.uuid4())
    inserted = updated = 0
    created = {}  # (unit_id, doc_type) → Document baru dlm batch ini
    for rnum, kind, payload, ex, rowres in parsed:
        if kind == "error":
            continue
        key = (payload["unit_id"], payload["doc_type"])
        doc = ex or created.get(key)
        if doc is None:
            doc = Document(tenant_id=ctx.tenant_id, unit_id=payload["unit_id"],
                           project_id=unit_pid.get(payload["unit_id"]), doc_type=payload["doc_type"],
                           status=payload["status"] or DocStatus.TERBIT)
            db.add(doc); await db.flush(); created[key] = doc; inserted += 1
        else:
            updated += 1
        if payload["name"] is not None:
            doc.name = payload["name"]
        if payload["doc_date"] is not None:
            doc.doc_date = payload["doc_date"]
        if payload["status"] is not None:
            doc.status = payload["status"]
        # lampirkan file dari ZIP
        if payload["zip_full"] and zf is not None:
            data = zf.read(payload["zip_full"])
            if len(data) > _MAX_FILE_BYTES:
                # lewati file kelebihan ukuran tapi metadata tetap tersimpan
                rowres.note = (rowres.note or "") + " (file >10MB dilewati)"
            else:
                fn = os.path.basename(payload["file_name"])
                key_obj = storage.build_key(ctx.tenant_id, "documents", doc.id, fn)
                await storage.put(key_obj, data, mimetypes.guess_type(fn)[0])
                doc.file_key = key_obj
                doc.file_data = None
                doc.file_name = fn
                doc.file_type = mimetypes.guess_type(fn)[0] or "application/octet-stream"
                doc.file_size = len(data)
    if inserted or updated:
        await record_audit(db, ctx.tenant_id, ctx.user_id, "IMPORT", "documents", uuid.UUID(batch_id),
                           new_data={"batch": batch_id, "inserted": inserted, "updated": updated})
        await db.commit()
    err = sum(1 for p in parsed if p[1] == "error")
    return ImportCommitResult(batch_id=batch_id, inserted=inserted, updated=updated,
                              error_count=err, rows=[p[4] for p in parsed])


@router.get("/documents/template")
async def download_documents_template(
    ctx: AuthContext = Depends(get_current_context), db: AsyncSession = Depends(get_db),
):
    """Template manifest DOKUMEN legalitas unit — terisi dokumen legalitas yang sudah ada (bila ada)."""
    projs = (await db.execute(
        select(Project.id, Project.name).where(Project.tenant_id == ctx.tenant_id).order_by(Project.name))).all()
    pmap = {pid: name for pid, name in projs}
    pnames = [name for _, name in projs]
    docs = (await db.execute(
        select(Document).where(Document.tenant_id == ctx.tenant_id, Document.is_deleted == False,  # noqa: E712
                               Document.unit_id.isnot(None), Document.doc_type.in_(LEGAL_DOC_TYPES)))).scalars().all()
    uids = [dc.unit_id for dc in docs if dc.unit_id]
    umap = {}
    if uids:
        for uid, block, unum, pid in (await db.execute(
                select(Unit.id, Unit.block, Unit.unit_number, Unit.project_id).where(Unit.id.in_(uids)))).all():
            umap[uid] = (block or "", unum or "", pmap.get(pid, ""))
    rows = []
    for dc in docs:
        blk, unum, pnm = umap.get(dc.unit_id, ("", "", ""))
        rows.append({"jenis": dc.doc_type, "proyek": pnm, "blok": blk, "unit": unum,
                     "nomor": dc.name or "", "tgl": dc.doc_date.strftime("%d/%m/%Y") if dc.doc_date else "",
                     "status": DOCST_TO_LABEL.get(dc.status, "Terbit"),
                     "file": dc.file_name or ""})
    data = _build_doc_template(pnames, rows)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Template_Import_Dokumen.xlsx"'})


def _build_doc_template(projects, docs) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = "Petunjuk"; ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3; ws.column_dimensions["B"].width = 26; ws.column_dimensions["C"].width = 94
    t = ws.cell(row=1, column=2, value="TEMPLATE IMPOR — DOKUMEN LEGALITAS UNIT")
    t.font = Font(name=_FONT, bold=True, color="FFFFFF", size=13); ws.merge_cells("B1:C1")
    ws["B1"].fill = _hdr_fill; ws["C1"].fill = _hdr_fill; ws.row_dimensions[1].height = 26
    tips = [
        ("Cara kerja", "Isi manifest DOKUMEN (1 baris = 1 dokumen unit). Untuk melampirkan scan: tulis Nama File, kumpulkan semua file jadi 1 ZIP, upload manifest + ZIP. Nomor/tanggal saja tanpa file juga boleh (Nama File dikosongkan)."),
        ("Jenis Dokumen", "SHM · HGB · SLF · PBG (IMB) · PBB"),
        ("Kunci pencocokan", "Proyek + (Blok) + Nomor Unit + Jenis → dokumen unit diperbarui bila sudah ada, atau dibuat baru. Isi Blok bila nomor unit dobel antar-blok."),
        ("Nama File", "Nama persis file di dalam ZIP (mis. Daiyan_036_SHM.pdf). Maks 10MB/file."),
        ("Status", "Belum · Proses · Terbit (default Terbit)"),
        ("Format", "Tanggal dd/mm/yyyy."),
        ("Nama proyek (persis)", " · ".join(projects)),
    ]
    r = 3
    for a, b in tips:
        ca = ws.cell(row=r, column=2, value=a); ca.font = Font(name=_FONT, bold=True, size=10)
        ca.alignment = Alignment(vertical="top", wrap_text=True)
        cb = ws.cell(row=r, column=3, value=b); cb.font = Font(name=_FONT, size=10)
        cb.alignment = Alignment(vertical="top", wrap_text=True); ws.row_dimensions[r].height = 30
        r += 1
    wd = wb.create_sheet("DOKUMEN"); wd.sheet_view.showGridLines = False
    cols = [("Jenis Dokumen", 16, False, True), ("Proyek", 18, True, True), ("Blok", 8, True, False),
            ("Nomor Unit", 12, True, True), ("Nomor Dokumen", 20, False, False),
            ("Tanggal", 14, False, False), ("Status", 12, False, False), ("Nama File", 26, False, False)]
    _headers(wd, cols)
    row = 2
    if not docs:
        # baris contoh (dihapus otomatis saat impor karena diawali CONTOH)
        ex = ["SHM", projects[0] if projects else "", "", "036", "12.34.56", "20/05/2025", "Terbit", "Daiyan_036_SHM.pdf"]
        for i, v in enumerate(ex, start=1):
            _cell(wd, row, i, v, fill=_ex_fill, italic=True, align="center" if i in (1, 3, 4, 6, 7) else "left")
        row += 1
    for dc in docs:
        _cell(wd, row, 1, dc["jenis"], align="center")
        _cell(wd, row, 2, dc["proyek"], fill=_key_cell)
        _cell(wd, row, 3, dc["blok"], fill=_key_cell, align="center")
        _cell(wd, row, 4, dc["unit"], fill=_key_cell, align="center")
        _cell(wd, row, 5, dc["nomor"])
        _cell(wd, row, 6, dc["tgl"], align="center")
        _cell(wd, row, 7, dc["status"], align="center")
        _cell(wd, row, 8, dc["file"])
        row += 1
    _dv(wd, ["SHM", "HGB", "SLF", "PBG", "PBB"], 1, 2, row + 500)
    _dv(wd, ["Belum", "Proses", "Terbit"], 7, 2, row + 500)
    _dv(wd, projects, 2, 2, row + 500)
    bio = io.BytesIO(); wb.save(bio); bio.seek(0)
    return bio.getvalue()
