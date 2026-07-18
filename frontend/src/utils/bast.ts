export interface BastData {
  bastNumber?: string
  bastDate?: string       // ISO
  petugas?: string        // user yang menyerahkan
  buyer?: string          // pembeli / penerima
  project?: string
  unit: string            // blok-nomor
  unitType?: string
  landArea?: number
  buildingArea?: number
  price?: number
  logoUrl?: string        // URL logo perusahaan (opsional) — placeholder "LOGO" bila kosong
}

const fmtRp = (n?: number) => n == null ? '-' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-')
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Cetak Berita Acara Serah Terima (BAST) — dokumen A4 portrait.
export function printBast(data: BastData): void {
  const row = (label: string, value: string) =>
    `<tr><td class="lbl">${label}</td><td class="sep">:</td><td class="val">${value}</td></tr>`

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>BAST ${esc(data.bastNumber ?? '')}</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; padding: 24px; font-size: 13px; line-height: 1.6; }
  .doc { max-width: 720px; margin: 0 auto; }
  .head { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .logo { width: 60px; height: 60px; border: 1px dashed #bbb; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #999; text-align: center; overflow: hidden; }
  .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .head .co b { font-size: 15px; } .head .co span { color: #555; font-size: 12px; }
  h1 { text-align: center; font-size: 16px; letter-spacing: 1px; margin: 18px 0 2px; }
  .sub { text-align: center; font-size: 12px; color: #444; margin-bottom: 18px; }
  table.kv { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.kv td { padding: 2px 0; vertical-align: top; }
  .lbl { width: 34%; } .sep { width: 12px; } .val { font-weight: 600; }
  .sect { margin-top: 14px; }
  .sect b { display: block; margin-bottom: 4px; }
  p.stmt { text-align: justify; margin: 14px 0; }
  .sign { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
  .sign .box { width: 44%; }
  .sign .line { margin-top: 60px; border-top: 1px solid #111; padding-top: 4px; font-weight: 600; }
  @media print { body { padding: 0; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="doc">
    <div class="head">
      <div class="logo">${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="Logo" onerror="this.outerHTML='LOGO'" />` : 'LOGO'}</div>
      <div class="co"><b>${esc(data.project || 'Developer Properti')}</b><br/><span>Berita Acara Serah Terima Unit</span></div>
    </div>
    <h1>BERITA ACARA SERAH TERIMA (BAST)</h1>
    <div class="sub">Nomor: ${esc(data.bastNumber ?? '-')}</div>

    <p>Pada hari ini, <b>${fmtDate(data.bastDate)}</b>, bertempat di lokasi proyek <b>${esc(data.project || '-')}</b>, telah dilakukan serah terima unit antara:</p>

    <div class="sect">
      <b>PIHAK YANG MENYERAHKAN (Developer)</b>
      <table class="kv">${row('Nama Petugas', esc(data.petugas || '-'))}${row('Bertindak untuk', esc(data.project || 'Developer'))}</table>
    </div>
    <div class="sect">
      <b>PIHAK YANG MENERIMA (Pembeli)</b>
      <table class="kv">${row('Nama Pembeli', esc(data.buyer || '-'))}</table>
    </div>
    <div class="sect">
      <b>OBJEK SERAH TERIMA</b>
      <table class="kv">
        ${row('Proyek', esc(data.project || '-'))}
        ${row('Unit / Kavling', esc(data.unit || '-'))}
        ${row('Tipe', esc(data.unitType || '-'))}
        ${row('Luas Tanah (LT)', data.landArea != null ? Number(data.landArea) + ' m²' : '-')}
        ${row('Luas Bangunan (LB)', data.buildingArea != null ? Number(data.buildingArea) + ' m²' : '-')}
        ${row('Harga', fmtRp(data.price))}
      </table>
    </div>

    <p class="stmt">Dengan ditandatanganinya Berita Acara ini, PIHAK YANG MENERIMA menyatakan telah menerima unit tersebut di atas dalam keadaan baik dan sesuai, serta serah terima dinyatakan SELESAI. Berita Acara ini dibuat rangkap dua, masing-masing pihak memegang satu berkas yang sama kekuatan hukumnya.</p>

    <div class="sign">
      <div class="box">Yang Menerima,<div class="line">${esc(data.buyer || '(...................)')}</div></div>
      <div class="box">Yang Menyerahkan,<div class="line">${esc(data.petugas || '(...................)')}</div></div>
    </div>
  </div>
</body></html>`

  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak BAST.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}
