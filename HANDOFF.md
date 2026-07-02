# NexistHub — Summary Handoff

_Diperbarui: 2026-07-02_

ERP multi-tenant untuk **developer properti** (rumah **subsidi + komersial**, bangun sendiri) — Kalimantan & Sulawesi. Dikembangkan bertahap per "Session/Fase" via cowork.

---

## 1. Visi & Arsitektur Target
- **SaaS SILO multi-tenant**: satu codebase, tiap pelanggan (perusahaan developer) punya **database sendiri**, diakses lewat **domain/subdomain sendiri** (custom domain via CNAME + auto-SSL). "Fondasi sendiri" walau semua kita yang kelola.
- **Kustomisasi per klien = feature-flag/modul on-off**, BUKAN kode bercabang.
- **Langganan** bulanan/tahunan (dikelola dari Control Plane — belum dibuat).
- Prinsip: **produk dulu, platform menyusul**. 5–10 pelanggan pertama = provisioning manual.
- `tenant_id` masih ada di semua tabel (cadangan; belum dibersihkan).

## 2. Tech Stack & Infra
- **Backend**: FastAPI + SQLAlchemy 2 (async) + PostgreSQL + Alembic. Auth JWT (token bawa `sub`+`tenant_id`; dependency `get_current_context` → `AuthContext`).
- **Frontend**: React + Vite + TypeScript + TailwindCSS (axios; `services/*` per modul).
- **Deploy**: Docker Compose (`docker-compose.prod.yml`) via **Coolify**, live di **https://app.nexisthub.id** (HTTP→HTTPS).
  - Container: `nexisthub_backend` (:8000), `nexisthub_frontend` (nginx SPA + proxy `/api/`), `nexisthub_db` (Postgres, host :5434).
  - **Kode di-COPY ke image (bukan volume)** → WAJIB rebuild tiap perubahan.
- **Lokasi**: `/opt/nexisthub` di server `vps.nadinata.org`.
- **Git**: remote SSH `git@github.com:propertyhub6969-hue/nexisthub.git`, push aktif via SSH deploy key `/root/.ssh/nexisthub_deploy`. Claude bisa `git push` sendiri; user sinkron lokal via `git pull`.

### Perintah operasional
```bash
cd /opt/nexisthub
# rebuild + deploy backend (jalankan alembic upgrade otomatis)
docker compose -f docker-compose.prod.yml up -d --build backend
# rebuild + deploy frontend (tsc && vite build)
docker compose -f docker-compose.prod.yml build frontend && docker compose -f docker-compose.prod.yml up -d frontend
# buat migrasi (autogenerate) via container mount
docker run --rm --network nexisthub_network -v /opt/nexisthub:/app -w /app --env-file .env -e POSTGRES_HOST=db \
  nexisthub-backend alembic revision --autogenerate -m "pesan"
```
> ⚠️ Alembic reuse enum antar-migrasi: WAJIB `postgresql.ENUM(..., create_type=False)` (bukan `sa.Enum(create_type=False)`). Kolom `is_deleted` NOT NULL di tabel lama: tambah `server_default=sa.false()`.

## 3. Modul yang Sudah Jadi (semua live)
| Modul | Isi | Status |
|---|---|---|
| **Auth & Tenant** | register (buat tenant+owner), login, /auth/me, JWT+tenant scoping | ✅ |
| **Dashboard** | angka real: leads, unit, uang masuk bln ini, sisa piutang, termin telat | ✅ |
| **CRM / Marketing** | Leads, Prospek, Pembeli + **konversi funnel** (data terbawa), edit, link WhatsApp | ✅ |
| **Pembeli (pusat transaksi)** | identitas + alamat + marketing(auto dari login) + proyek/kavling (anti-dobel) + promo + **tanda tangan digital**; harga auto dari unit | ✅ |
| **Properti** | Proyek → Unit (LT/LB, harga, status Tersedia/Booking/Terjual, koordinat siteplan-ready) | ✅ |
| **Pembayaran & Cicilan** | per Pembeli: termin (DP→cicilan→pelunasan) + uang masuk (sumber **Pembeli & Bank**) + ringkasan sisa/progres | ✅ |
| **Pajak & Notaris** | PPh/BPHTB/PPN (ID Billing+NTPN+status incl DTP/bebas) + master Notaris + rincian biaya notaris | ✅ |
| **Dokumen** | checklist berkas per pembeli (PPJB/AJB/Sertifikat/dll) + **upload/lihat file** (disimpan di DB) | ✅ |
| **KPR** | 5 tahap (Collect Berkas→Berkas Masuk Bank→SP3K→Akad→Pencairan) + master Bank; **pencairan → auto uang masuk (Bank)** | ✅ |
| **Procurement** | Vendor + Purchase Order (item + alokasi proyek/unit) + pembayaran vendor | ✅ |
| **Stok Material** | barang masuk (PO/langsung) → **stok proyek** → **distribusi ke unit** (HPP rata²); sisa = kontrol kebocoran fisik | ✅ |
| **Biaya & Rollup** | ledger biaya (upah/kontraktor/operasional/dll) alokasi unit/umum → **rekap biaya per unit & umum proyek** | ✅ |
| **RAB & Kebocoran** | template RAB per tipe + **penyesuaian per unit** (tambahan mutu) → **laporan kebocoran** (realisasi vs RAB, per kategori) | ✅ |
| **Konstruksi** | progres pembangunan per unit (tahapan + %) untuk SiKumbang/KPR | ✅ |
| **Kontraktor Borongan** | kontrak borongan per unit (nilai total) + **opname mingguan** → terbayar/sisa; masuk rollup biaya | ✅ |
| **Audit trail** | catat create/update/delete + siapa/kapan; panel Riwayat | ✅ |
| **Soft-delete** | data penting (Pembeli, Pembayaran, Pajak, Dokumen, Stok, Biaya, dll) diarsip, tak hilang | ✅ |

## 4. Keputusan Kunci
- **Alur (b)**: PEMBELI = pusat transaksi (berkas deal). Pembayaran/pajak/dokumen/KPR menempel ke Pembeli. Modul "Penjualan" lama dipensiunkan.
- **Alokasi biaya**: tiap biaya punya `unit_id` boleh kosong → kosong = **biaya umum proyek**, terisi = **biaya unit**. Rollup akurat per unit + umum.
- **Material**: pola **stok + distribusi** (beli per lokasi → stok → bagi ke unit). Biaya material unit = distribusi × HPP rata².
- **RAB**: template per tipe (reuse) + penyesuaian per unit (kasus 1 unit beda mutu). Realisasi = material distribusi + biaya ledger.
- **Borongan**: opname mingguan = Biaya kategori Kontraktor (single source of truth, tanpa dobel) + kontrak lacak sisa.
- **Histori jangan hilang**: semua transaksional soft-delete + audit (untuk pemeriksaan pajak/KPR).

## 5. Catatan Penting
- **File dokumen disimpan di Postgres** (LargeBinary), bukan MinIO — NexistHub belum punya object storage sendiri (MinIO server = milik app lain). Bisa dimigrasi ke MinIO/S3 nanti.
- Data uji coba (email `*_probe`, `test_*`, dll) sudah dibersihkan; akun asli = tenant **PT. Nexist Indonesia** / `dinda@gmail.com` (jangan dihapus).
- Testing pola: tiap endpoint diuji end-to-end self-cleaning (buat→verifikasi→hapus tenant probe).

## 6. Belum Dibuat / Roadmap Berikutnya
- **Laporan** (penjualan, stok, keuangan, komisi) — menu Reports masih ComingSoon.
- **Role & izin** (owner/admin/manager/staff/viewer sudah di model, belum ditegakkan) + undang anggota tim ke tenant.
- **Siteplan interaktif** (peta unit klikable; model unit sudah punya position_x/y).
- **Agen & Komisi** (marketing freelance).
- **Platform/Control Plane**: routing DB per domain, provisioning otomatis (buat DB+subdomain+SSL), billing/langganan, feature-flag per tenant.
- Penyempurnaan: auto-refresh token (sesi logout ~30 mnt), master data (sumber lead/bank) configurable, dsb.

## 7. Cara Cepat Menjelajah (UI)
- **Dashboard** → ringkasan.
- **Marketing → Leads/Prospek/Pembeli**; ikon panah = konversi ke tahap berikut.
- **Pembeli**: ikon dompet=Pembayaran, timbangan=Pajak/Notaris/Dokumen, landmark=KPR.
- **Properti** → Proyek → Kelola Unit.
- **Konstruksi** → tab Progres & Kontraktor Borongan.
- **Procurement** → tab PO / Stok Material / Biaya & Rollup / RAB & Kebocoran / Vendor.
- **Legal** → master Notaris & Bank.
