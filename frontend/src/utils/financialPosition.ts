import type { FinancialPosition } from '../types'

const fmtRp = (n?: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const esc = (s?: string | null) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Cetak Posisi Keuangan → PDF (dialog print browser, A4 potret). Snapshot manajerial + disclaimer. */
export function printFinancialPosition(rep: FinancialPosition, opts: { tenantName?: string } = {}): void {
  const now = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
  const neg = rep.kekayaan_bersih < 0

  const row = (label: string, hint: string, value?: number, o: { strong?: boolean; total?: boolean; danger?: boolean } = {}) => `
    <tr class="${o.strong ? 'strong' : ''} ${o.total ? 'total' : ''}">
      <td>${esc(label)}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</td>
      <td class="r ${o.danger ? 'neg' : ''}">${fmtRp(value)}</td>
    </tr>`

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Posisi Keuangan${opts.tenantName ? ' — ' + esc(opts.tenantName) : ''}</title>
<style>
  @page { size: A4 portrait; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px; font-size: 12px; }
  .kop { border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 4px; }
  .kop h1 { font-size: 18px; margin: 0; color: #1e3a5f; }
  .kop .co { font-size: 12px; color: #333; margin-top: 2px; }
  .meta { color: #888; font-size: 10.5px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; max-width: 560px; }
  td { padding: 6px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.neg { color: #b91c1c; }
  .hint { color: #999; font-size: 10px; font-weight: normal; }
  .sec td { border: none; padding-top: 14px; font-weight: 700; color: #1e3a5f; font-size: 12.5px; }
  tr.strong td { border-top: 1px solid #999; border-bottom: none; font-weight: 700; padding-top: 8px; }
  tr.total td { border-top: 2px solid #1e3a5f; border-bottom: 2px solid #1e3a5f; font-size: 14px; font-weight: 700; padding: 9px 4px; }
  tr.total td.r { color: ${neg ? '#b91c1c' : '#047857'}; }
  .basis { border: 1px solid #ddd; background: #fafafa; padding: 8px 12px; margin: 16px 0 0; font-size: 10.5px; line-height: 1.5; max-width: 560px; }
  .basis b { color: #111; }
  @media print { body { padding: 0; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="kop">
    <h1>POSISI KEUANGAN</h1>
    ${opts.tenantName ? `<div class="co">${esc(opts.tenantName)}</div>` : ''}
  </div>
  <div class="meta">Per: ${esc(now)}</div>

  <table>
    <tr class="sec"><td colspan="2">HARTA / ASET</td></tr>
    ${row('Kas & Bank', 'saldo riil semua rekening', rep.kas_bank)}
    ${row('Persediaan / Modal Tertanam', 'biaya unit belum terjual', rep.persediaan)}
    ${row('Piutang Pembeli', 'sisa kontrak belum dibayar pembeli', rep.piutang_pembeli)}
    ${row('Retensi di Bank', 'dana ditahan bank, belum cair', rep.retensi_bank)}
    ${row('Total Harta', '', rep.total_aset, { strong: true })}

    <tr class="sec"><td colspan="2">KEWAJIBAN</td></tr>
    ${row('Biaya proyek belum dibayar', '', rep.biaya_belum_dibayar, { danger: true })}
    ${row('Hutang ke Notaris', '', rep.hutang_notaris, { danger: true })}
    ${row('Biaya operasional belum dibayar', '', rep.opex_belum_dibayar, { danger: true })}
    ${row('Total Kewajiban', '', rep.total_kewajiban, { strong: true, danger: true })}

    ${row('KEKAYAAN BERSIH USAHA', '', rep.kekayaan_bersih, { total: true, danger: neg })}
  </table>

  <div class="basis">
    <b>Dasar penyusunan.</b> Potret manajerial, bukan neraca akuntansi formal. <b>Persediaan / Modal Tertanam</b> = biaya membangun
    unit yang belum terjual — dananya belum hilang, hanya berubah menjadi bangunan. <b>Piutang</b> = sisa kewajiban pembeli;
    <b>Retensi</b> = plafon KPR yang belum dicairkan bank. Kekayaan Bersih = Total Harta − Total Kewajiban.
  </div>
</body></html>`

  const w = window.open('', '_blank', 'width=800,height=1000')
  if (!w) { alert('Popup diblokir. Izinkan popup untuk mencetak.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}
