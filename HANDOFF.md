# NexistHub — Summary Handoff

_Diperbarui: 2026-07-04_

ERP multi-tenant untuk **developer properti** (rumah **subsidi + komersial**, bangun sendiri) — Kalimantan & Sulawesi. Dikembangkan bertahap per "Session/Fase" via cowork.

---

## 1. Visi & Arsitektur Target
- **SaaS SILO multi-tenant**: satu codebase, tiap pelanggan (perusahaan developer) punya **database sendiri**, diakses lewat **domain/subdomain sendiri** (custom domain via CNAME + auto-SSL). "Fondasi sendiri" walau semua kita yang kelola.
- **Kustomisasi per klien = feature-flag/modul on-off**, BUKAN kode bercabang.
- **Langganan** bulanan/tahunan (dikelola dari Control Plane — belum dibuat).
- Prinsip: **produk dulu, platform menyusul**. 5–10 pelanggan pertama = provisioning manual.
- **`tenant_id` DIPERTAHANKAN** (keputusan final): bukan kolom mati — dipakai sebagai filter isolasi di hampir semua query (dari JWT via `AuthContext`). Dalam shared-DB sekarang inilah satu-satunya boundary antar-pelanggan; nanti tetap sebagai defense-in-depth di mode silo. Jangan dicabut.

## 2. Tech Stack & Infra
- **Backend**: FastAPI + SQLAlchemy 2 (async) + PostgreSQL + Alembic. Auth JWT (token bawa `sub`+`tenant_id`; dependency `get_current_context` → `AuthContext`; `get_current_user`/`require_role(...)` muat user dari DB untuk cek role live).
- **Frontend**: React + Vite + TypeScript + TailwindCSS (axios; `services/*` per modul). Komponen reusable: `MoneyInput` (pemisah ribuan titik), `Modal`, `Badge`, `SignaturePad`.
- **⚠️ DEPLOY — BUKAN Coolify.** `app.nexisthub.id` dijalankan **`docker compose` MANUAL** dari `/opt/nexisthub` (project `nexisthub`, file `docker-compose.prod.yml`) — container `nexisthub_frontend/backend/db` TAK punya label Coolify, hanya numpang Traefik-nya Coolify (network `coolify`) untuk routing+SSL. **Tombol Redeploy di Coolify TIDAK berpengaruh.** Coolify dashboard sendiri di `http://72.60.43.158:8000`.
  - Container: `nexisthub_backend` (:8000, entrypoint jalankan `alembic upgrade` lalu uvicorn), `nexisthub_frontend` (nginx SPA + proxy `/api/`→backend, `client_max_body_size 12M`), `nexisthub_db` (Postgres, host :5434).
  - **Kode di-COPY ke image (bukan volume)** → WAJIB rebuild tiap perubahan.
- **Lokasi**: `/opt/nexisthub` di VPS (IP 72.60.43.158, `vps.nadinata.org`). Disk 193GB (sisa ±91GB per 2026-07-03).
- **Git**: remote SSH `git@github.com:propertyhub6969-hue/nexisthub.git`, push aktif via SSH deploy key. Alembic head saat ini: **`b0c1d2e3f4a5`** (±46 migrasi; terakhir: `units.price_breakdown` JSON = rincian harga unit). PPh punya 3 bukti terpisah: kolom **Bukti**=validasi pajak, kolom **Status**=bukti bayar, kolom **ID Billing**=bukti billing. ⚠️ Enum `userrole` pakai label = NAMA member UPPERCASE (OWNER/ADMIN/…); tambah value pakai uppercase (`ADD VALUE 'PRODUKSI'`) via `autocommit_block`. ⚠️ `frontend/src/lib/` di-gitignore — helper FE taruh di `frontend/src/utils/`. ⚠️ **HATI-HATI revision id**: pernah bentrok (id `e1f2a3b4c5d6` sudah dipakai `add_client_payment_type`) → backend crash-loop. Sebelum buat migrasi, cek `grep -rl <id> alembic/versions/`.

### Perintah operasional
```bash
cd /opt/nexisthub
git add ... && git commit && git push origin main       # simpan
# DEPLOY (ini yang benar — bukan Coolify). Backend jalankan alembic upgrade otomatis saat start.
docker compose -f docker-compose.prod.yml up -d --build           # rebuild BE+FE
docker compose -f docker-compose.prod.yml up -d --build frontend  # frontend saja
# cek migrasi head (di dalam container mount host):
docker run --rm -v "$PWD:/app" -w /app nexisthub-backend alembic heads
```
> ⚠️ Migrasi ditulis MANUAL (bukan autogenerate). Reuse enum antar-migrasi: WAJIB `postgresql.ENUM(..., create_type=False)`. Enum baru: `sa.Enum('A','B', name='...').create(op.get_bind(), checkfirst=True)` sebelum `add_column`. Uji import backend sebelum deploy: `docker run --rm -v "$PWD:/app" -w /app nexisthub-backend python -c "import app.api.v1.api"`.

## 3. Modul yang Sudah Jadi (semua live & teruji)
| Modul | Isi |
|---|---|
| **Auth & Tenant** | register (tenant+owner), login, /auth/me (kembalikan role), JWT+tenant scoping |
| **Role & Tim (RBAC)** | menu Pengaturan→Tim (owner/admin): tambah anggota (password awal manual), ubah role, aktif/nonaktif; role dari DB (bukan JWT) → efek live; guard owner tak bisa diubah. Role: owner/admin/manager/**produksi**/**marketing**/viewer. Akses menu dibatasi (enforcement FRONTEND: `utils/access.ts` `ROLE_PATHS`+`canAccessPath` → Sidebar saring menu & child; DashboardLayout redirect ke `defaultPathFor(role)`): **produksi**=Dashboard/Konstruksi/Procurement; **marketing** (dulu 'staff')=grup Marketing & Properti saja. owner/admin/manager/viewer = akses penuh. **Backend guard AKTIF utk Konstruksi & Procurement** (`api.py` `dependencies=[require_role(owner,admin,manager,produksi)]` pada router construction/contractor/procurement/stock/expense/rab) → marketing & viewer dapat 403. FE `utils/access.ts` menyamakan (area /construction,/procurement dibatasi PROD_ROLES, viewer ikut tak lihat). Endpoint LAIN masih terbuka utk semua login (belum di-guard). Sidebar: grup **Produksi**(Konstruksi/Procurement); urutan Dashboard·Marketing(+Pemberkasan)·Properti·Produksi·Master Data·Reports |
| **Dashboard** | angka real: leads, unit, uang masuk bln ini, sisa piutang, termin telat + **grafik penjualan 12 bulan** (bar chart tanpa library, `GET /reporting/sales-monthly`) |
| **CRM / Marketing** | Leads (+kategori Cold/Warm/Hot, filter proyek/kategori), Prospek (+properti diminati, status Closing/Batal), Pembeli + **konversi funnel** (data + properti diminati terbawa Lead→Prospek→Pembeli), WhatsApp link |
| **Pembeli (pusat transaksi)** | tabel: tanggal, harga jual, **sisa piutang**, **cara beli (Cash/KPR)**, **status berkas KPR** (incl. Ditolak), **Status Bayar (Lunas/Belum Lunas)**; filter proyek/unit, toggle kolom, aksi via dropdown ⋮. Form: identitas + marketing(auto login) + proyek/kavling (anti-dobel 409) + ttd digital + PPJB/AJB (nomor+file) |
| **Properti** | Proyek→Unit; **LT read-only (dari Dokumen Legalitas)**; **Generate Unit Massal** (tombol di halaman unit → modal blok/nomor mulai/jumlah + default tipe/harga/LT/LB → `POST /property/units/bulk-generate`, idempotent skip nomor duplikat per blok, cap 500, auto zero-pad); **Rincian Harga unit** (form Tambah/Edit Unit: baris komponen Harga Dasar/Hook/Lebih Tanah/Booking Fee dll, `units.price_breakdown` JSON, `unit.price` = Σ rincian otomatis); **BAST/serah terima** (tombol per unit → nomor auto BAST-000001 + tgl + petugas login → status Serah Terima; cetak dokumen A4). **Siteplan interaktif** (upload denah + marker unit per status, zoom/pan, auto-tata grid, caching gambar) |
| **Pembayaran & Cicilan** | per Pembeli: termin + uang masuk; **jenis pembayaran** (DP/Booking Fee/Cicilan/Realisasi KPR/Pelunasan), **no kwitansi otomatis** (KW-000001), **upload bukti transfer** (muncul saat metode Transfer), **cetak kuitansi + QR** (nama/unit/jumlah/tgl, landscape, terbilang). Ringkasan **PISAH 2 angka**: Sisa Kewajiban Pembeli vs **Retensi menunggu pencairan bank**. **Pembayaran SEBAGIAN didukung**: termin = rencana, pembayaran = realisasi (akumulasi per `schedule_id`); schedule expose `paid`/`remaining`; status UI Lunas/Sebagian/Belum; dropdown "Untuk Termin" hanya tampilkan termin belum lunas (+label sisa), lunas otomatis hilang; peringatan lembut bila nominal > sisa termin |
| **Pemberkasan** | menu sendiri (read-only): ringkasan dokumen (X/Y terbit) + pajak (X/Y lunas) + tahap KPR lintas SEMUA pembeli |
| **Dokumen & Legalitas** | **Berkas Pembeli** (KTP/KK/NPWP, per pembeli) · **Dokumen Legalitas unit** (SHM/SLF/IMB-PBG/PBB, menu Properti→Dokumen Legalitas, per UNIT, +field LT→sinkron ke unit) · read-only auto-tampil di halaman pembeli · **Entry Cepat** (tombol → 1 form checklist multi-baris: `POST /legal/documents/bulk` upsert per jenis, isi status/nomor/tgl/LT + lampiran file per baris, simpan sekali) · **PBB punya field Alamat** (`documents.address`, muncul khusus jenis PBB di form satuan & Entry Cepat) |
| **Pajak & Notaris** | PPh/BPHTB/PPN (ID Billing+NTPN+status incl DTP/bebas, **+upload bukti per baris**) + PPJB/AJB (nomor+file) + master Notaris + rincian biaya notaris |
| **KPR** | 5 tahap + master Bank; field bertahap; **Pencairan Bertahap** (multi + total cair + **retensi**=plafon−cair; tiap pencairan→uang masuk Bank, read-only di menu Pembayaran); **KPR Ditolak** (alasan+tgl, cascade opsional bebaskan unit/batal pembeli, ajukan ulang bank lain, riwayat pengajuan, data dipertahankan) |
| **Master Data** (dulu "Legal") | master Notaris & Bank |
| **Procurement / Stok / Biaya / RAB / Konstruksi / Borongan** | (lengkap dari sesi sebelumnya — vendor/PO, stok+distribusi HPP rata², rollup biaya unit/umum, RAB+kebocoran, progres konstruksi, opname borongan) |
| **Audit + Soft-delete** | catat create/update/delete/BAST/REJECT + siapa/kapan; data penting diarsip (tak hilang). Audit punya `client_id` → panel **"Riwayat Data Pembeli"** di halaman Pembayaran menampilkan SEMUA aktivitas pembeli (data pembeli + pembayaran + termin, incl. hapus) dengan nominal. **Alasan wajib** (`audit_logs.reason`): hapus pembayaran/termin WAJIB alasan (query param, 422 bila kosong); edit pembayaran wajib alasan bila ubah nominal/sumber/tgl/termin (400), edit termin bila ubah nominal; edit sepele bebas. Alasan tampil di Riwayat. Nomor kwitansi (KW-xxxxxx) sengaja **tak dipakai ulang** walau ada yang dihapus (hitung termasuk terhapus) |

## 4. Keputusan Kunci (arsitektur & bisnis)
- **Alur (b)**: PEMBELI = pusat transaksi. Pembayaran/pajak/dokumen/KPR/BAST menempel ke Pembeli/Unit.
- **Sinkronisasi status Unit** (`app/core/unit_status.py`): status Pembeli → Unit (Aktif→Booking, Selesai→Terjual, Batal→Tersedia). KPR capai **Akad/Pencairan** → pembeli Selesai + unit Terjual otomatis. **BAST** → unit Serah Terima. **KPR Ditolak (cascade)** → pembeli Batal + unit Tersedia lagi.
- **Retensi bank**: setelah akad, pembeli = LUNAS (kewajiban beralih ke bank), tapi kas developer belum 100% (bank cair bertahap, ada retensi). Karena itu ringkasan pembayaran pisah **Sisa Kewajiban Pembeli** (=harga−dari_pembeli−plafon KPR) vs **Retensi** (=plafon−sudah_cair). Asumsi: DP + Plafon KPR = Harga Jual.
- **Single source of truth pencairan**: dikelola HANYA di modul KPR; baris uang masuk Bank read-only di menu Pembayaran (tandai "dari KPR").
- **Dokumen legalitas = milik UNIT** (SHM/dll ada sebelum pembeli, tak hilang saat pembeli batal). LT valid dari sertifikat → sinkron ke Unit (read-only di kelola unit).
- **File** disimpan di **Postgres (LargeBinary)** + caching ETag/Cache-Control (`app/core/files.py`). Migrasi ke MinIO ditunda.
- **Histori jangan hilang**: transaksional soft-delete + audit. KPR ditolak = TANDAI (bukan hapus) demi analitik.

## 5. Ditunda / Roadmap Berikutnya
- **Laporan** (menu Reports, halaman `frontend/src/pages/Reports.tsx` **bertab**; endpoint di `app/api/v1/endpoints/reporting.py`): SUDAH JADI & deployed (2026-07-04) — (1) **Rejection-rate KPR per bank** `GET /api/v1/reporting/kpr-rejection` (kartu + tabel per bank + bar rate; "disetujui"=tahap SP3K/Akad/Pencairan); (2) **Arus Kas** `GET /api/v1/reporting/cashflow` (kas masuk pembeli vs bank, total kontrak, sisa kewajiban pembeli & retensi — per-pembeli dijumlah clamp ≥0; tren bulanan 12 bln; **kas masuk hanya pembeli non-deleted** — pembayaran orphan/pembeli terhapus dikecualikan); (3) **Rekap Penjualan** `GET /api/v1/reporting/sales-recap` (per proyek: status unit available/booked/sold+handover, jumlah pembeli, nilai kontrak, kas masuk, sisa); (4) **Tunggakan/Aging** `GET /api/v1/reporting/aging` (termin PENDING lewat jatuh tempo, outstanding=nominal−sudah dibayar, bucket umur 1-30/31-60/61-90/90+, per pembeli). Semua tab konsisten (total_in cashflow = cash_in sales-recap). **Sisa laporan berikutnya**: progres proyek/konstruksi. **Catatan data**: ada 1 pembayaran orphan (client None, 500rb) + pembeli test 'Rizal' soft-deleted (500rb) di tenant PT Nexist — noise lama, sudah dikecualikan dari laporan; belum dibersihkan dari DB.
- **Arsitektur = modular monolith (BUKAN microservice) — keputusan sadar** (dibahas 2026-07-04): 1 app FastAPI + 1 SPA + 1 Postgres; modular per-router. Microservice DITOLAK utk stage ini (domain sangat transaksional/ACID lintas-modul: Pembeli↔Pembayaran↔KPR↔Unit↔retensi; tim kecil; provisioning manual). Isolasi pelanggan dicapai via SILO DB-per-tenant + feature-flag, BUKAN pecah service. Kalau kelak perlu, pisah 1–2 komponen (worker/queue) via strangler, bukan rewrite. Estimasi kalau dipaksa full microservice: 3–6 bulan + beban ops permanen, tanpa fitur bisnis baru.
- **Agen & Komisi**: DITUNDA sampai user survey ke developer (skema komisi belum pasti).
- **Optimasi skala (DITUNDA — fokus business process dulu)**: paginasi server-side + UI (SEMUA list ambil `size:500` render semua baris, TANPA paginasi — **bug laten: record ke-501+ per tenant tak tampil**); dropdown lazy (Clients/Leads ambil semua unit tiap buka); indeks DB; React Query caching. Ambang mulai: ±300+ record/modul per tenant.
- **MinIO (file storage)**: pindah blob→object storage saat total file mendekati beberapa GB / backup DB berat. MinIO SUDAH ada di VPS (milik app lain, `s3-minio.nexisthub.id`); isolasi per `{tenant_id}/...`. Self-hosted (data tetap di VPS).
- **Platform/Control Plane**: routing DB per domain, provisioning otomatis, billing, feature-flag.
- Penyempurnaan: auto-refresh token; bundle FE >500KB (code-split); LB unit juga dari dokumen (opsional).

## 6. Cara Cepat Menjelajah (UI)
- **Marketing → Leads/Prospek/Pembeli**; ikon panah = konversi. Pembeli: aksi via dropdown ⋮ (Pembayaran/Pajak&Notaris/KPR/Edit/Hapus).
- **Properti → Proyek & Unit** (BAST per unit) / **Dokumen Legalitas** (per unit) / Siteplan (dari halaman unit).
- **Pemberkasan** → dashboard kelengkapan lintas pembeli.
- **Konstruksi / Procurement** → tab-tab.
- **Master Data** → Notaris & Bank. **Pengaturan → Tim** (owner/admin).

## 7. Akun & Data
- Akun asli = tenant **PT. Nexist Indonesia** / `dinda@gmail.com` (owner) — jangan dihapus.
- Testing pola: uji endpoint end-to-end lalu **bersihkan data uji** (jangan tinggalkan jejak di data pelanggan asli).
