import QRCode from 'qrcode'

export interface ReceiptData {
  receiptNo?: string
  name: string          // nama pembeli
  unit: string          // kode unit
  project?: string
  amount: number        // jumlah bayar
  date?: string         // tanggal bayar (ISO)
  method?: string
  purpose?: string
  source?: string
  logoUrl?: string       // URL logo perusahaan (opsional) — placeholder "LOGO" bila kosong
}

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-')
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Angka → terbilang (Bahasa Indonesia), untuk kuitansi.
export function terbilang(value: number): string {
  const n = Math.floor(Math.abs(value))
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
  function toWords(x: number): string {
    if (x < 12) return satuan[x]
    if (x < 20) return toWords(x - 10) + ' belas'
    if (x < 100) return toWords(Math.floor(x / 10)) + ' puluh' + (x % 10 ? ' ' + satuan[x % 10] : '')
    if (x < 200) return 'seratus' + (x - 100 ? ' ' + toWords(x - 100) : '')
    if (x < 1000) return satuan[Math.floor(x / 100)] + ' ratus' + (x % 100 ? ' ' + toWords(x % 100) : '')
    if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + toWords(x - 1000) : '')
    if (x < 1e6) return toWords(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + toWords(x % 1000) : '')
    if (x < 1e9) return toWords(Math.floor(x / 1e6)) + ' juta' + (x % 1e6 ? ' ' + toWords(x % 1e6) : '')
    if (x < 1e12) return toWords(Math.floor(x / 1e9)) + ' miliar' + (x % 1e9 ? ' ' + toWords(x % 1e9) : '')
    return toWords(Math.floor(x / 1e12)) + ' triliun' + (x % 1e12 ? ' ' + toWords(x % 1e12) : '')
  }
  const w = toWords(n).trim().replace(/\s+/g, ' ')
  const cap = w ? w.charAt(0).toUpperCase() + w.slice(1) : 'Nol'
  return cap + ' rupiah'
}

// Cetak kuitansi (LANDSCAPE) + QR code. QR berisi data inti untuk verifikasi anti-penipuan.
export async function printReceipt(data: ReceiptData): Promise<void> {
  const qrPayload = [
    data.receiptNo ?? '',
    data.name,
    data.unit,
    String(data.amount),
    (data.date ?? '').slice(0, 10),
  ].join('|')
  const qr = await QRCode.toDataURL(qrPayload, { width: 220, margin: 1, errorCorrectionLevel: 'M' })

  const row = (label: string, value: string) =>
    `<tr><td class="lbl">${label}</td><td class="sep">:</td><td class="val">${value}</td></tr>`

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kuitansi ${esc(data.receiptNo ?? '')}</title>
<style>
  @page { size: A5 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; }
  .receipt { width: 100%; max-width: 780px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 26px; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 12px; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo { width: 64px; height: 64px; border: 1px dashed #cbd5e1; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #94a3b8; text-align: center; line-height: 1.2; overflow: hidden; }
  .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .brand .co { font-size: 13px; color: #64748b; }
  .brand .co b { display: block; font-size: 15px; color: #0f172a; }
  .title { text-align: right; }
  .title h1 { font-size: 20px; margin: 0; letter-spacing: 1px; }
  .title p { font-size: 12px; color: #64748b; margin: 4px 0 0; }
  .body { display: flex; gap: 26px; }
  .col-left { flex: 1.2; }
  .col-right { flex: 1; border-left: 1px dashed #cbd5e1; padding-left: 24px; text-align: center; }
  table { width: 100%; font-size: 13px; border-collapse: collapse; }
  td { padding: 4px 0; vertical-align: top; }
  .lbl { color: #64748b; width: 34%; }
  .sep { width: 12px; color: #94a3b8; }
  .val { font-weight: 500; }
  .amt-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .amt-big { font-size: 24px; font-weight: 700; color: #0f172a; margin: 4px 0; }
  .terbilang { font-size: 12px; font-style: italic; color: #475569; margin-bottom: 14px; }
  .qr img { width: 128px; height: 128px; }
  .qr p { font-size: 10px; color: #94a3b8; margin: 6px 0 0; }
  .foot { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
  @media print { body { padding: 0; } .receipt { border: none; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="receipt">
    <div class="head">
      <div class="brand">
        <div class="logo">${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="Logo" onerror="this.outerHTML='LOGO&lt;br/&gt;PERUSAHAAN'" />` : 'LOGO<br/>PERUSAHAAN'}</div>
        <div class="co"><b>${esc(data.project || 'Developer Properti')}</b>Kuitansi Pembayaran</div>
      </div>
      <div class="title">
        <h1>KUITANSI</h1>
        <p>No. ${esc(data.receiptNo ?? '-')}</p>
      </div>
    </div>
    <div class="body">
      <div class="col-left">
        <table>
          ${row('Tanggal', fmtDate(data.date))}
          ${row('Nama Pembeli', esc(data.name))}
          ${row('Kode Unit', esc(data.unit || '-'))}
          ${data.purpose ? row('Jenis', esc(data.purpose)) : ''}
          ${data.method ? row('Metode', esc(data.method)) : ''}
          ${data.source ? row('Sumber', esc(data.source)) : ''}
        </table>
      </div>
      <div class="col-right">
        <div class="amt-lbl">Jumlah Diterima</div>
        <div class="amt-big">${fmtRp(data.amount)}</div>
        <div class="terbilang">Terbilang: ${esc(terbilang(data.amount))}</div>
        <div class="qr">
          <img src="${qr}" alt="QR verifikasi" />
          <p>Pindai QR untuk verifikasi data kuitansi.</p>
        </div>
      </div>
    </div>
    <div class="foot">Kuitansi sah tanpa tanda tangan basah bila QR cocok dengan data sistem.</div>
  </div>
</body></html>`

  const w = window.open('', '_blank', 'width=900,height=620')
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak kuitansi.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
