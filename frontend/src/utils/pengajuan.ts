import { terbilang } from './receipt'

export interface PengajuanRow {
  unit_label: string
  contractor_name?: string
  expense_date?: string
  description: string
  amount: number
}
export interface PengajuanData {
  project: string
  company?: string
  date?: string // ISO, default hari ini
  rows: PengajuanRow[]
}

const fmtRp = (n?: number) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-')
const esc = (s: string) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Cetak Surat Pengajuan Pembayaran opname borongan — rekap per proyek (semua unit), A4 portrait.
export function printPengajuan(data: PengajuanData): void {
  // kelompokkan per unit (+kontraktor)
  const groups = new Map<string, { unit_label: string; contractor?: string; rows: PengajuanRow[]; subtotal: number }>()
  for (const r of data.rows) {
    const key = `${r.unit_label}||${r.contractor_name ?? ''}`
    let g = groups.get(key)
    if (!g) { g = { unit_label: r.unit_label, contractor: r.contractor_name, rows: [], subtotal: 0 }; groups.set(key, g) }
    g.rows.push(r); g.subtotal += Number(r.amount || 0)
  }
  const grand = data.rows.reduce((s, r) => s + Number(r.amount || 0), 0)

  const groupsHtml = [...groups.values()].map((g) => {
    const lines = g.rows.map((r) => `
      <tr>
        <td class="c">${fmtDate(r.expense_date)}</td>
        <td>${esc(r.description)}</td>
        <td class="r">${fmtRp(r.amount)}</td>
      </tr>`).join('')
    return `
      <tr class="grp"><td colspan="3"><b>${esc(g.unit_label)}</b>${g.contractor ? ` — ${esc(g.contractor)}` : ''}</td></tr>
      ${lines}
      <tr class="sub"><td colspan="2" class="r">Subtotal ${esc(g.unit_label)}</td><td class="r">${fmtRp(g.subtotal)}</td></tr>`
  }).join('')

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Pengajuan Pembayaran — ${esc(data.project)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; padding: 24px; font-size: 12.5px; line-height: 1.5; }
  .doc { max-width: 720px; margin: 0 auto; }
  .head { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .logo { width: 56px; height: 56px; border: 1px dashed #bbb; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #999; }
  .head .co b { font-size: 15px; } .head .co span { color: #555; font-size: 12px; }
  h1 { text-align: center; font-size: 15px; letter-spacing: 1px; margin: 16px 0 2px; }
  .sub { text-align: center; font-size: 12px; color: #444; margin-bottom: 14px; }
  table.op { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.op th, table.op td { border: 1px solid #999; padding: 4px 8px; vertical-align: top; }
  table.op th { background: #f0f0f0; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  td.r, th.r { text-align: right; } td.c { text-align: center; white-space: nowrap; }
  tr.grp td { background: #f7f7f7; font-size: 12px; }
  tr.sub td { font-weight: 600; background: #fafafa; }
  tr.grand td { font-weight: 700; font-size: 13px; border-top: 2px solid #111; }
  .terbilang { margin-top: 8px; font-style: italic; }
  .sign { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; gap: 12px; }
  .sign .box { flex: 1; } .sign .role { font-size: 12px; }
  .sign .line { margin-top: 58px; border-top: 1px solid #111; padding-top: 4px; font-weight: 600; font-size: 12px; }
  @media print { body { padding: 0; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="doc">
    <div class="head">
      <div class="logo">LOGO</div>
      <div class="co"><b>${esc(data.company || data.project || 'Developer Properti')}</b><br/><span>Pengajuan Pembayaran Borongan</span></div>
    </div>
    <h1>SURAT PENGAJUAN PEMBAYARAN</h1>
    <div class="sub">Proyek: ${esc(data.project || '-')} &nbsp;·&nbsp; Tanggal: ${fmtDate(data.date || new Date().toISOString())}</div>

    <table class="op">
      <thead><tr><th style="width:120px">Tanggal</th><th>Uraian Opname</th><th class="r" style="width:150px">Nominal</th></tr></thead>
      <tbody>
        ${groupsHtml || '<tr><td colspan="3" style="text-align:center;color:#888">Tidak ada opname yang diajukan.</td></tr>'}
        <tr class="grand"><td colspan="2" class="r">TOTAL PENGAJUAN</td><td class="r">${fmtRp(grand)}</td></tr>
      </tbody>
    </table>
    <div class="terbilang">Terbilang: <b>${esc(terbilang(grand))}</b></div>

    <div class="sign">
      <div class="box"><div class="role">Diajukan oleh,</div><div class="line">(...................)</div></div>
      <div class="box"><div class="role">Mengetahui,</div><div class="line">(...................)</div></div>
      <div class="box"><div class="role">Bagian Keuangan,</div><div class="line">(...................)</div></div>
    </div>
  </div>
</body></html>`

  const w = window.open('', '_blank', 'width=820,height=920')
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak pengajuan.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}
