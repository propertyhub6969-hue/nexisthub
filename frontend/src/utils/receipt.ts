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
}

const fmtRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-')
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Cetak kuitansi + QR code. QR berisi data inti (nama|unit|jumlah|tanggal|no) untuk verifikasi anti-penipuan.
export async function printReceipt(data: ReceiptData): Promise<void> {
  const qrPayload = [
    data.receiptNo ?? '',
    data.name,
    data.unit,
    String(data.amount),
    (data.date ?? '').slice(0, 10),
  ].join('|')
  const qr = await QRCode.toDataURL(qrPayload, { width: 200, margin: 1, errorCorrectionLevel: 'M' })

  const row = (label: string, value: string) =>
    `<tr><td class="lbl">${label}</td><td class="sep">:</td><td class="val">${value}</td></tr>`

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kuitansi ${esc(data.receiptNo ?? '')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; }
  .receipt { max-width: 420px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 22px; }
  .head { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 14px; }
  .head h1 { font-size: 18px; margin: 0; letter-spacing: 1px; }
  .head p { font-size: 12px; color: #64748b; margin: 4px 0 0; }
  table { width: 100%; font-size: 13px; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  .lbl { color: #64748b; width: 38%; }
  .sep { width: 12px; color: #94a3b8; }
  .val { font-weight: 500; }
  .amount { margin: 14px 0; text-align: center; }
  .amount .big { font-size: 22px; font-weight: 700; color: #0f172a; }
  .amount .lbl2 { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .qr { text-align: center; margin-top: 16px; padding-top: 14px; border-top: 1px dashed #cbd5e1; }
  .qr img { width: 120px; height: 120px; }
  .qr p { font-size: 10px; color: #94a3b8; margin: 6px 0 0; }
  .foot { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 12px; }
  @media print { body { padding: 0; } .receipt { border: none; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="receipt">
    <div class="head">
      <h1>KUITANSI PEMBAYARAN</h1>
      <p>No. ${esc(data.receiptNo ?? '-')}${data.project ? ' &middot; ' + esc(data.project) : ''}</p>
    </div>
    <table>
      ${row('Tanggal', fmtDate(data.date))}
      ${row('Nama Pembeli', esc(data.name))}
      ${row('Kode Unit', esc(data.unit || '-'))}
      ${data.purpose ? row('Jenis', esc(data.purpose)) : ''}
      ${data.method ? row('Metode', esc(data.method)) : ''}
      ${data.source ? row('Sumber', esc(data.source)) : ''}
    </table>
    <div class="amount">
      <div class="lbl2">Jumlah Diterima</div>
      <div class="big">${fmtRp(data.amount)}</div>
    </div>
    <div class="qr">
      <img src="${qr}" alt="QR verifikasi" />
      <p>Pindai QR untuk verifikasi keaslian data kuitansi.</p>
    </div>
    <div class="foot">Kuitansi ini sah tanpa tanda tangan basah bila QR cocok dengan data sistem.</div>
  </div>
</body></html>`

  const w = window.open('', '_blank', 'width=460,height=720')
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak kuitansi.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
