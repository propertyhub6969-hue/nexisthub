import type { SalesFormData } from '../types'

const esc = (s?: string | null) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const nl2br = (s?: string | null) => esc(s).replace(/\n/g, '<br/>')
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

// Cetak Form Penjualan / Formulir Pemesanan Unit. Data terkunci sistem; ketentuan & penandatangan editable.
export function printSalesForm(data: SalesFormData, logoUrl?: string): void {
  const row = (label: string, value?: string | null) =>
    value ? `<tr><td class="lbl">${esc(label)}</td><td class="sep">:</td><td class="val">${esc(value)}</td></tr>` : ''
  const kopBaris = [data.company_address, data.company_city, data.company_phone ? `Telp. ${data.company_phone}` : '']
    .filter(Boolean).map(esc).join(' &middot; ')
  const signer = data.signer_name || data.company_name
  const signerTitle = data.signer_title || ''

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Form Penjualan</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; color: #1a1a1a; margin: 0; font-size: 13px; line-height: 1.5; }
  .kop { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 14px; }
  .kop img { width: 58px; height: 58px; object-fit: contain; }
  .kop h1 { font-size: 17px; margin: 0 0 2px; color: #1e3a5f; }
  .kop .sub { font-size: 11px; color: #444; }
  .doctitle { text-align: center; font-size: 15px; font-weight: bold; text-decoration: underline; margin: 6px 0 14px; }
  h2 { font-size: 13px; margin: 14px 0 4px; color: #1e3a5f; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; }
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv td { padding: 2px 0; vertical-align: top; }
  .lbl { color: #475569; width: 32%; }
  .sep { width: 12px; }
  .val { font-weight: 500; }
  .kk { font-size: 12px; }
  .ttd { margin-top: 30px; display: flex; justify-content: space-between; }
  .ttd .box { width: 45%; text-align: center; }
  .ttd .space { height: 56px; }
  .ttd .nm { font-weight: 600; border-top: 1px solid #94a3b8; padding-top: 2px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="kop">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" onerror="this.style.display='none'"/>` : ''}
    <div><h1>${esc(data.company_name)}</h1>${kopBaris ? `<div class="sub">${kopBaris}</div>` : ''}</div>
  </div>
  <div class="doctitle">FORMULIR PENJUALAN / PEMESANAN UNIT</div>
  <div style="text-align:right;font-size:12px;margin-bottom:6px;">Tanggal: ${fmtDate(data.date)}</div>

  <h2>Data Pemesan</h2>
  <table class="kv">
    ${row('Nama', data.nama)}${row('NIK', data.nik)}${row('Alamat', data.alamat)}${row('No. Telp', data.telp)}
  </table>

  <h2>Data Unit</h2>
  <table class="kv">
    ${row('Proyek', data.proyek)}${row('Blok / Unit', data.unit_label)}${row('Tipe', data.tipe)}
    ${row('Luas Tanah', data.lt)}${row('Luas Bangunan', data.lb)}${row('Harga Jual', data.harga_jual)}
    ${row('Promo / Diskon', data.diskon)}
  </table>

  <h2>Pembayaran</h2>
  <table class="kv">
    ${row('Cara Bayar', data.cara_bayar)}${row('Bank KPR', data.bank)}${row('Plafon KPR', data.plafon)}${row('Marketing', data.marketing)}
  </table>

  <h2>Syarat &amp; Ketentuan</h2>
  <div class="kk">${nl2br(data.ketentuan)}</div>

  <div class="ttd">
    <div class="box">Pemesan,<div class="space"></div><div class="nm">${esc(data.nama)}</div></div>
    <div class="box">${signerTitle ? esc(signerTitle) + ',' : 'Hormat kami,'}<div class="space"></div><div class="nm">${esc(signer)}</div></div>
  </div>
</body></html>`
  const w = window.open('', '_blank', 'width=820,height=1000')
  if (!w) return
  w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => w.print(), 300)
}
