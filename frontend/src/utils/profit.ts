import type { ProjectProfitReport, ProjectProfitDetail } from '../types'

const fmtRp = (n?: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const esc = (s?: string | null) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const pct = (v?: number | null) => v == null ? '—' : `${Number(v).toFixed(1)}%`
const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + f(x), 0)

/** Cetak Laporan Laba/Rugi Proyek → PDF (dialog print browser, A4 LANDSCAPE — tabelnya 9 kolom).
 *  Rincian per unit ikut tercetak bila proyeknya sedang dibuka di layar.
 *
 *  ★ Catatan dasar penyusunan SENGAJA ikut dicetak: laporan ini sering dibaca di luar
 *  aplikasi (pemilik, investor, bank). Tanpa penjelasan accrual & persediaan, angka
 *  "modal tertanam" dan margin 100% mudah disalahartikan. */
export function printProjectProfit(
  rep: ProjectProfitReport,
  opts: { tenantName?: string; detail?: ProjectProfitDetail | null } = {},
): void {
  const now = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
  const rows = rep.rows.filter((r) => r.units_total > 0 || r.revenue_contract > 0)

  const projRows = rows.length === 0
    ? `<tr><td colspan="9" class="empty">Belum ada data proyek.</td></tr>`
    : rows.map((r) => {
        const catatan = [
          r.units_sold > 0 && r.cost_sold === 0 ? 'biaya belum dicatat' : '',
          r.clients_without_unit > 0 ? `${r.clients_without_unit} pembeli tanpa unit` : '',
        ].filter(Boolean).join('; ')
        return `<tr>
          <td>${esc(r.project_name)}${catatan ? `<div class="note">${esc(catatan)}</div>` : ''}</td>
          <td class="r">${r.units_sold} / ${r.units_total}</td>
          <td class="r">${fmtRp(r.revenue_contract)}</td>
          <td class="r">${fmtRp(r.cost_sold)}</td>
          <td class="r">${fmtRp(r.cost_general)}</td>
          <td class="r">${fmtRp(r.cost_notary)}</td>
          <td class="r ${r.profit < 0 ? 'neg' : 'pos'}">${fmtRp(r.profit)}</td>
          <td class="r">${pct(r.margin_pct)}</td>
          <td class="r inv">${fmtRp(r.inventory_value)}</td>
        </tr>`
      }).join('')

  const d = opts.detail
  const unitRows = d?.rows.filter((u) => u.is_sold || u.cost_total !== 0) ?? []
  const detailSection = !d ? '' : `
    <h2>Rincian per Unit — ${esc(d.project_name)}</h2>
    <div class="sub">
      Biaya umum proyek ${fmtRp(d.cost_general)} &nbsp;·&nbsp; Biaya notaris ${fmtRp(d.cost_notary)}
      ${d.revenue_unattributed > 0 ? ` &nbsp;·&nbsp; Kontrak tanpa unit ${fmtRp(d.revenue_unattributed)}` : ''}
    </div>
    <table>
      <thead><tr>
        <th>Unit</th><th>Pembeli</th><th class="r">Harga Jual</th><th class="r">Material</th>
        <th class="r">Upah/Borongan</th><th class="r">Utilitas</th><th class="r">Lain</th>
        <th class="r">Total Biaya</th><th class="r">Laba</th><th class="r">Margin</th>
      </tr></thead>
      <tbody>${
        unitRows.length === 0
          ? `<tr><td colspan="10" class="empty">Belum ada unit dengan pendapatan atau biaya.</td></tr>`
          : unitRows.map((u) => `<tr>
              <td>${esc(u.unit_label)}</td>
              <td>${u.client_name ? esc(u.client_name) : `<span class="muted">${esc(u.unit_status)}</span>`}</td>
              <td class="r">${fmtRp(u.contract_value)}</td>
              <td class="r">${fmtRp(u.cost_material)}</td>
              <td class="r">${fmtRp(u.cost_upah)}</td>
              <td class="r">${fmtRp(u.cost_utilitas)}</td>
              <td class="r">${fmtRp(u.cost_lain)}</td>
              <td class="r">${fmtRp(u.cost_total)}</td>
              <td class="r ${(u.profit ?? 0) < 0 ? 'neg' : u.profit == null ? '' : 'pos'}">${u.profit == null ? '—' : fmtRp(u.profit)}</td>
              <td class="r">${pct(u.margin_pct)}${u.is_sold && u.cost_total === 0 ? ' *' : ''}</td>
            </tr>`).join('')
      }</tbody>
    </table>
    ${unitRows.some((u) => u.is_sold && u.cost_total === 0)
      ? `<div class="foot">* Unit terjual yang biayanya masih Rp 0 — margin tampak 100% karena biaya pembangunan belum dicatat, bukan karena tanpa modal.</div>` : ''}`

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan Laba Rugi Proyek${opts.tenantName ? ' — ' + esc(opts.tenantName) : ''}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 14px; font-size: 10.5px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 12.5px; margin: 16px 0 6px; border-bottom: 2px solid #333; padding-bottom: 3px; }
  .sub { color: #555; font-size: 10.5px; margin-bottom: 4px; }
  .meta { color: #888; font-size: 10px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th, td { border: 1px solid #bbb; padding: 4px 7px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-size: 9.5px; text-transform: uppercase; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  td.pos { color: #047857; font-weight: 600; }
  td.neg { color: #b91c1c; font-weight: 600; }
  td.inv { color: #b45309; }
  td.empty { text-align: center; color: #888; padding: 14px; }
  tfoot td { font-weight: 700; background: #fafafa; }
  .note { color: #b45309; font-size: 9px; margin-top: 1px; }
  .muted { color: #999; text-transform: capitalize; }
  .foot { color: #666; font-size: 9.5px; margin-top: 4px; }
  .basis { border: 1px solid #ddd; background: #fafafa; padding: 7px 10px; margin-bottom: 12px; font-size: 10px; line-height: 1.5; }
  .basis b { color: #111; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head>
<body onload="window.focus(); window.print();">
  <h1>Laporan Laba / Rugi Proyek</h1>
  ${opts.tenantName ? `<div class="sub">${esc(opts.tenantName)}</div>` : ''}
  <div class="meta">Dicetak: ${esc(now)}</div>

  <div class="basis">
    <b>Dasar penyusunan.</b> Laporan operasional, bukan laporan akuntansi formal — tidak ada jurnal maupun neraca.
    Biaya dihitung <b>saat terjadi</b> (basis akrual), bukan saat dibayar, sehingga angkanya sama dengan realisasi
    pada laporan RAB &amp; Kebocoran. Biaya unit yang <b>belum terjual tidak dikurangkan dari laba</b> dan disajikan
    terpisah sebagai <b>Modal Tertanam</b> — dananya belum hilang, hanya berubah menjadi bangunan.
    Pendapatan dihitung dari <b>nilai kontrak pembeli aktif</b> (bukan kas yang sudah diterima).
  </div>

  <h2>Ringkasan per Proyek</h2>
  <table>
    <thead><tr>
      <th>Proyek</th><th class="r">Terjual</th><th class="r">Nilai Kontrak</th><th class="r">Biaya Unit Terjual</th>
      <th class="r">Biaya Umum</th><th class="r">Notaris</th><th class="r">Laba / Rugi</th><th class="r">Margin</th>
      <th class="r">Modal Tertanam</th>
    </tr></thead>
    <tbody>${projRows}</tbody>
    <tfoot><tr>
      <td>TOTAL</td>
      <td class="r">${sum(rows, (r) => r.units_sold)} / ${sum(rows, (r) => r.units_total)}</td>
      <td class="r">${fmtRp(rep.revenue_contract)}</td>
      <td class="r">${fmtRp(sum(rows, (r) => r.cost_sold))}</td>
      <td class="r">${fmtRp(sum(rows, (r) => r.cost_general))}</td>
      <td class="r">${fmtRp(sum(rows, (r) => r.cost_notary))}</td>
      <td class="r ${rep.profit < 0 ? 'neg' : 'pos'}">${fmtRp(rep.profit)}</td>
      <td class="r">${pct(rep.revenue_contract ? (rep.profit / rep.revenue_contract) * 100 : null)}</td>
      <td class="r inv">${fmtRp(rep.inventory_value)}</td>
    </tr></tfoot>
  </table>
  <div class="foot">Kas yang sudah benar-benar diterima: <b>${fmtRp(rep.revenue_cash)}</b> dari nilai kontrak ${fmtRp(rep.revenue_contract)}.</div>

  ${detailSection}
</body></html>`

  const w = window.open('', '_blank', 'width=1000,height=800')
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}
