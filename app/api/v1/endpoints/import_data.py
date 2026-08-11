"""Importir data dari Excel (migrasi data klien).

Alur: unduh template terisi → klien lengkapi → upload → PRATINJAU (insert/update/error)
→ TERAPKAN (upsert). Sheet pertama yang didukung: UNIT (kunci: Proyek + Blok + Nomor Unit).
Pembeli & Pembayaran menyusul.
"""
import io
import uuid
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
from app.core.audit import record_audit
from app.api.deps import get_current_context, AuthContext
from app.models.property import Project, Unit, UnitStatus

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
