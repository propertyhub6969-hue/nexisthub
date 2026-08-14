import type { BankLetterData } from '../types'

const esc = (s?: string | null) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const nl2br = (s: string) => esc(s).replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;').replace(/\n/g, '<br/>')
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

// Cetak Surat Permohonan ke Bank. Teks (subject+body) sudah terisi variabel dari server.
export function printBankLetter(data: BankLetterData, logoUrl?: string): void {
  const kopBaris = [data.company_address, [data.company_city].filter(Boolean).join(''), data.company_phone ? `Telp. ${data.company_phone}` : '']
    .filter(Boolean).map(esc).join(' &middot; ')
  const tempat = data.letter_city ? `${esc(data.letter_city)}, ` : ''
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(data.subject || 'Surat ke Bank')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; color: #1a1a1a; margin: 0; padding: 32px 40px; font-size: 13px; line-height: 1.55; }
  .kop { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 18px; }
  .logo { width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
  .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .kop h1 { font-size: 18px; margin: 0 0 2px; color: #1e3a5f; }
  .kop .sub { font-size: 11px; color: #444; }
  .meta { text-align: right; margin-bottom: 6px; }
  .subject { font-weight: bold; text-decoration: underline; margin: 14px 0 16px; }
  .body { white-space: normal; }
  .ttd { margin-top: 40px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="kop">
    ${logoUrl ? `<div class="logo"><img src="${esc(logoUrl)}" alt="Logo" onerror="this.parentNode.style.display='none'"/></div>` : ''}
    <div>
      <h1>${esc(data.company_name)}</h1>
      ${kopBaris ? `<div class="sub">${kopBaris}</div>` : ''}
    </div>
  </div>
  <div class="meta">${tempat}${fmtDate(data.date)}</div>
  <div class="subject">Perihal: ${esc(data.subject)}</div>
  <div class="body">${nl2br(data.body)}</div>
</body></html>`
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
