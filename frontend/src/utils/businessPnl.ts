import type { BusinessPnL } from '../types'

const fmtRp = (n?: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const esc = (s?: string | null) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Cetak Laporan Laba/Rugi Usaha → PDF (dialog print browser, A4 potret).
 *  Disclaimer "manajerial" ikut dicetak karena sering dibaca di luar aplikasi (pemilik/investor/bank). */
export function printBusinessPnl(rep: BusinessPnL, opts: { tenantName?: string; periodLabel?: string } = {}): void {
  const now = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
  const rugi = rep.laba_usaha < 0
  const period = opts.periodLabel ?? String(rep.year)

  const row = (label: string, value?: number, opt: { neg?: boolean; strong?: boolean; indent?: boolean; total?: boolean } = {}) => `
    <tr class="${opt.strong ? 'strong' : ''} ${opt.total ? 'total' : ''}">
      <td class="${opt.indent ? 'ind' : ''}">${esc(label)}</td>
      <td class="r ${opt.neg ? 'neg' : ''}">${opt.neg && value ? '(' : ''}${fmtRp(value)}${opt.neg && value ? ')' : ''}</td>
    </tr>`

  const opexRows = rep.opex_by_category.map((o) => row(o.name, o.total, { neg: true, indent: true })).join('')
  const warn = rep.pendapatan > 0 && rep.hpp_total < rep.pendapatan * 0.1
    ? `<div class="warn">⚠ Beban pokok sangat kecil dibanding pendapatan — kemungkinan biaya pembangunan (RAB/realisasi) belum lengkap dicatat, sehingga laba terlihat lebih besar dari sebenarnya.</div>` : ''

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laba Rugi Usaha ${esc(period)}${opts.tenantName ? ' — ' + esc(opts.tenantName) : ''}</title>
<style>
  @page { size: A4 portrait; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px; font-size: 12px; }
  .kop { border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 4px; }
  .kop h1 { font-size: 18px; margin: 0; color: #1e3a5f; }
  .kop .co { font-size: 12px; color: #333; margin-top: 2px; }
  h2 { font-size: 14px; margin: 14px 0 2px; }
  .meta { color: #888; font-size: 10.5px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; max-width: 560px; }
  td { padding: 6px 4px; border-bottom: 1px solid #eee; }
  td.r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.ind { padding-left: 22px; color: #555; }
  td.neg { color: #b91c1c; }
  tr.strong td { border-top: 1px solid #999; border-bottom: none; font-weight: 700; padding-top: 8px; }
  tr.total td { border-top: 2px solid #1e3a5f; border-bottom: 2px solid #1e3a5f; font-size: 14px; font-weight: 700; padding: 9px 4px; }
  tr.total td.r { color: ${rugi ? '#b91c1c' : '#047857'}; }
  .basis { border: 1px solid #ddd; background: #fafafa; padding: 8px 12px; margin: 16px 0 0; font-size: 10.5px; line-height: 1.5; max-width: 560px; }
  .basis b { color: #111; }
  .warn { border: 1px solid #f0c36d; background: #fdf6e6; color: #92600a; padding: 8px 12px; margin: 12px 0 0; font-size: 10.5px; max-width: 560px; }
  .sign { margin-top: 40px; font-size: 12px; }
  @media print { body { padding: 0; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="kop">
    <h1>LAPORAN LABA / RUGI USAHA</h1>
    ${opts.tenantName ? `<div class="co">${esc(opts.tenantName)}</div>` : ''}
  </div>
  <div class="meta">Periode: <b>${esc(period)}</b> &nbsp;·&nbsp; Dicetak: ${esc(now)}</div>

  <table>
    ${row(`Pendapatan (${rep.units_sold} unit terjual)`, rep.pendapatan)}
    ${row('Beban Pokok — biaya bangun unit', rep.hpp_unit, { neg: true, indent: true })}
    ${row('Beban Pokok — jasa notaris', rep.hpp_notaris, { neg: true, indent: true })}
    ${row('Laba Kotor', rep.laba_kotor, { strong: true })}
    ${row('Biaya Operasional', rep.biaya_operasional, { neg: true })}
    ${opexRows}
    ${row(rugi ? 'RUGI USAHA' : 'LABA USAHA BERSIH', rep.laba_usaha, { total: true, neg: rugi })}
  </table>
  ${warn}

  <div class="basis">
    <b>Dasar penyusunan.</b> Laporan manajerial, bukan laporan akuntansi formal. <b>Pendapatan</b> diakui saat akad
    (unit yang terjual pada periode ini); <b>beban pokok</b> = biaya membangun unit tersebut (basis akrual) + alokasi
    biaya umum proyek + jasa notaris. Unit yang <b>belum terjual tidak dikurangkan</b> dari laba (disajikan sebagai
    persediaan). <b>Biaya operasional</b> = pengeluaran overhead perusahaan pada periode ini.
  </div>

  <div class="sign">Mengetahui,<br/><br/><br/>( ______________________ )</div>
</body></html>`

  const w = window.open('', '_blank', 'width=800,height=1000')
  if (!w) { alert('Popup diblokir. Izinkan popup untuk mencetak.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}
