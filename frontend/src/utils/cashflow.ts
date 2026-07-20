import type { CashflowReport } from '../types'

const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const esc = (s?: string) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const fmtMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${monthLabels[Number(m) - 1] ?? m} ${y}` }
const fmtDateID = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

// Cetak Laporan Arus Kas → PDF (via dialog print browser, A4 potrait).
export function printCashflow(rep: CashflowReport, opts: { tenantName?: string; catFrom?: string; catTo?: string } = {}): void {
  const now = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
  const periodNote = (opts.catFrom || opts.catTo)
    ? `Periode kategori: ${opts.catFrom ? fmtDateID(opts.catFrom) : 'awal'} – ${opts.catTo ? fmtDateID(opts.catTo) : 'kini'}`
    : 'Periode kategori: semua transaksi'

  const kv = (label: string, value: string, accent = '') =>
    `<tr><td>${esc(label)}</td><td class="r ${accent}">${esc(value)}</td></tr>`

  const catRows = rep.by_category.length === 0
    ? `<tr><td colspan="3" class="empty">Belum ada transaksi di Buku Kas.</td></tr>`
    : rep.by_category.map((c) =>
        `<tr><td>${esc(c.category_name)}</td><td>${c.direction === 'in' ? 'Masuk' : 'Keluar'}</td>` +
        `<td class="r ${c.direction === 'in' ? 'in' : 'out'}">${fmtRp(c.total)}</td></tr>`).join('')

  const outCols = rep.out_category_names
  const outTrend = rep.out_months.length === 0
    ? ''
    : `<h2>Tren Kas Keluar per Kategori (Bulanan)</h2>
       <table>
         <thead><tr><th>Bulan</th>${outCols.map((n) => `<th class="r">${esc(n)}</th>`).join('')}<th class="r">Total</th></tr></thead>
         <tbody>${rep.out_months.map((m) =>
           `<tr><td>${esc(fmtMonth(m.month))}</td>${m.by_category.map((v) => `<td class="r">${v ? fmtRp(v) : '—'}</td>`).join('')}` +
           `<td class="r out">${fmtRp(m.total)}</td></tr>`).join('')}</tbody>
       </table>`

  const notaryDetail = rep.notary_breakdown.length === 0
    ? ''
    : `<h2>Rincian Biaya Notaris/Legal (per jenis jasa)</h2>
       <table>
         <thead><tr><th>Jenis Jasa</th><th class="r">Total</th></tr></thead>
         <tbody>${rep.notary_breakdown.map((b) => `<tr><td>${esc(b.label)}</td><td class="r out">${fmtRp(b.total)}</td></tr>`).join('')}</tbody>
         <tfoot><tr><td>Total Biaya Notaris/Legal</td><td class="r out">${fmtRp(rep.notary_breakdown.reduce((s, b) => s + b.total, 0))}</td></tr></tfoot>
       </table>`

  const monthsIn = rep.months.length === 0
    ? `<tr><td colspan="4" class="empty">Belum ada transaksi kas masuk.</td></tr>`
    : rep.months.map((m) =>
        `<tr><td>${esc(fmtMonth(m.month))}</td><td class="r">${m.from_buyer ? fmtRp(m.from_buyer) : '—'}</td>` +
        `<td class="r">${m.from_bank ? fmtRp(m.from_bank) : '—'}</td><td class="r b">${fmtRp(m.total)}</td></tr>`).join('')

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan Arus Kas${opts.tenantName ? ' — ' + esc(opts.tenantName) : ''}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px; font-size: 11px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 12.5px; margin: 18px 0 6px; border-bottom: 2px solid #333; padding-bottom: 3px; }
  .sub { color: #555; font-size: 11px; margin-bottom: 2px; }
  .meta { color: #888; font-size: 10px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; }
  th { background: #f0f0f0; font-size: 10px; text-transform: uppercase; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  td.in { color: #047857; font-weight: 600; }
  td.out { color: #b91c1c; font-weight: 600; }
  td.b { font-weight: 700; }
  td.empty { text-align: center; color: #888; padding: 14px; }
  tfoot td { font-weight: 700; background: #fafafa; }
  .two { display: flex; gap: 16px; }
  .two > div { flex: 1; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } table { break-inside: auto; } tr { break-inside: avoid; } }
</style></head>
<body onload="window.focus(); window.print();">
  <h1>Laporan Arus Kas</h1>
  ${opts.tenantName ? `<div class="sub">${esc(opts.tenantName)}</div>` : ''}
  <div class="meta">Dicetak: ${esc(now)} &nbsp;·&nbsp; ${esc(periodNote)}</div>

  <div class="two">
    <div>
      <h2>Kas Masuk (Penjualan)</h2>
      <table>
        ${kv('Nilai Penjualan (pembeli aktif)', fmtRp(rep.total_contract))}
        ${kv('Dari Pembeli', fmtRp(rep.from_buyer))}
        ${kv('Dari Bank (KPR)', fmtRp(rep.from_bank))}
        ${kv('Total Kas Masuk', fmtRp(rep.total_in), 'in')}
      </table>
    </div>
    <div>
      <h2>Piutang &amp; Retensi</h2>
      <table>
        ${kv('Sisa Kewajiban Pembeli', fmtRp(rep.buyer_remaining))}
        ${kv('Retensi Menunggu Bank', fmtRp(rep.retention_remaining))}
        ${kv('Total Plafon KPR', fmtRp(rep.kpr_plafond_total))}
      </table>
    </div>
  </div>

  <h2>Ringkasan Buku Kas per Kategori</h2>
  <table>
    ${kv('Kas Masuk (ledger)', fmtRp(rep.ledger_in), 'in')}
    ${kv('Kas Keluar (ledger)', fmtRp(rep.ledger_out), 'out')}
    ${kv('Saldo', fmtRp(rep.ledger_saldo))}
  </table>
  <table>
    <thead><tr><th>Kategori</th><th>Arah</th><th class="r">Total</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>

  ${outTrend}

  ${notaryDetail}

  <h2>Arus Kas Masuk Bulanan</h2>
  <table>
    <thead><tr><th>Bulan</th><th class="r">Dari Pembeli</th><th class="r">Dari Bank</th><th class="r">Total</th></tr></thead>
    <tbody>${monthsIn}</tbody>
  </table>
</body></html>`

  const w = window.open('', '_blank', 'width=900,height=800')
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}
