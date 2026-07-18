import type { MonthlyTaxReport } from '../types'

const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const esc = (s?: string) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

const categoryLabel: Record<string, string> = { subsidi: 'Subsidi', komersial: 'Komersial' }
const COLS = ['Nama', 'NIK KTP', 'Lokasi', 'No Unit', 'Jenis', 'Nilai AJB', 'Jumlah PPh', 'Jumlah PPN', 'Jumlah BPHTB', 'NTPN', 'No SHM', 'No PBB', 'KIR', 'Notaris']

function rowValues(r: MonthlyTaxReport['rows'][number]): string[] {
  return [
    r.name, r.nik ?? '—', r.location ?? '—', r.unit_number ?? '—',
    r.category ? categoryLabel[r.category] ?? r.category : '—',
    fmtRp(r.base_amount), fmtRp(r.amount), fmtRp(r.ppn_amount), fmtRp(r.bphtb_amount),
    r.ntpn ?? '—', r.shm_number ?? '—', r.pbb_number ?? '—', r.sikumbang_number ?? '—', r.notary_name ?? '—',
  ]
}

// Cetak tabel Pajak Bulanan, A4 landscape.
export function printMonthlyTax(report: MonthlyTaxReport, monthLabel: string, projectLabel: string): void {
  const rowsHtml = report.rows.length === 0
    ? `<tr><td colspan="${COLS.length}" style="text-align:center;color:#888;padding:16px">Tidak ada data.</td></tr>`
    : report.rows.map((r) => `<tr>${rowValues(r).map((v, i) => `<td class="${i >= 5 && i <= 8 ? 'r' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Pajak Bulanan — ${esc(monthLabel)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px; font-size: 10.5px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  .sub { color: #555; font-size: 11px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; white-space: nowrap; }
  th { background: #f0f0f0; font-size: 9.5px; text-transform: uppercase; }
  td.r, th.r { text-align: right; }
  tfoot td { font-weight: 700; background: #fafafa; }
  @media print { body { padding: 0; } }
</style></head>
<body onload="window.focus(); window.print();">
  <h1>Rekap Pajak Bulanan (PPh)</h1>
  <div class="sub">Periode: ${esc(monthLabel)} &nbsp;·&nbsp; Proyek: ${esc(projectLabel)} &nbsp;·&nbsp; ${report.total_count} transaksi</div>
  <table>
    <thead><tr>${COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr>
      <td colspan="5">Total</td>
      <td class="r">${fmtRp(report.total_base_amount)}</td>
      <td class="r">${fmtRp(report.total_amount)}</td>
      <td class="r">${fmtRp(report.total_ppn_amount)}</td>
      <td class="r">${fmtRp(report.total_bphtb_amount)}</td>
      <td colspan="5"></td>
    </tr></tfoot>
  </table>
</body></html>`

  const w = window.open('', '_blank', 'width=1100,height=800')
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}

// Unduh tabel Pajak Bulanan sbg CSV (bisa dibuka langsung di Excel).
export function downloadMonthlyTaxCsv(report: MonthlyTaxReport, monthLabel: string): void {
  const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [
    COLS.map(csvEsc).join(','),
    ...report.rows.map((r) => rowValues(r).map(csvEsc).join(',')),
  ]
  const csv = '﻿' + lines.join('\r\n')  // BOM biar Excel baca UTF-8 (nama/karakter khusus) dgn benar
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pajak-bulanan-${monthLabel.replace(/\s+/g, '-').toLowerCase()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
