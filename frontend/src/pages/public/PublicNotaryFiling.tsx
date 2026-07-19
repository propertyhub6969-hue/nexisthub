import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, AlertTriangle, Send, Check, Scale, FileSignature, ArrowLeftRight } from 'lucide-react'
import { taxService } from '../../services/tax'
import NexistLogo from '../../components/ui/NexistLogo'
import Modal from '../../components/ui/Modal'
import MoneyInput from '../../components/ui/MoneyInput'
import type { PublicNotaryPage, PublicNotaryClientRow, TaxType, TaxStatus, NotaryHandoverEvent } from '../../types'

const HANDOVER_LABEL: Record<NotaryHandoverEvent, string> = {
  ambil: 'Diambil dari arsip',
  serah_notaris: 'Diserahkan ke notaris',
  terima_pembeli: 'Diterima pembeli (cash)',
  tahan_bank: 'Diserahkan ke bank (KPR/agunan)',
  kembali_arsip: 'Kembali ke arsip',
}

const TAX_TYPES: { key: TaxType; label: string }[] = [
  { key: 'pph', label: 'PPh' },
  { key: 'bphtb', label: 'BPHTB' },
  { key: 'ppn', label: 'PPN' },
]
const TAX_STATUSES: { key: TaxStatus; label: string }[] = [
  { key: 'belum', label: 'Belum' },
  { key: 'dibayar', label: 'Dibayar' },
  { key: 'validasi', label: 'Validasi' },
  { key: 'dtp', label: 'DTP' },
  { key: 'bebas', label: 'Bebas' },
]
const taxTypeLabel = (t: TaxType) => TAX_TYPES.find((x) => x.key === t)?.label ?? t
const taxStatusLabel = (s: TaxStatus) => TAX_STATUSES.find((x) => x.key === s)?.label ?? s
const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

// Halaman publik (tanpa login) — dibuka pihak notaris lewat tautan bertoken. Lihat PPJB/AJB, pajak,
// & biaya jasanya utk pembeli yang dia tangani, & kirim update (menunggu persetujuan developer).
export default function PublicNotaryFiling() {
  const { token = '' } = useParams()
  const [page, setPage] = useState<PublicNotaryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailRow, setDetailRow] = useState<PublicNotaryClientRow | null>(null)

  useEffect(() => {
    taxService.publicNotaryPage(token)
      .then(setPage)
      .catch((err) => setError(
        err?.response?.status === 404
          ? 'Tautan tidak ditemukan, sudah dicabut, atau sudah kedaluwarsa. Silakan hubungi pihak yang membagikan tautan ini.'
          : 'Gagal memuat data.'
      ))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-2">
        <NexistLogo size={24} />
        <span className="text-sm text-slate-400">Status Pemberkasan — akses tautan notaris</span>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        {loading ? (
          <div className="card p-16 text-center text-slate-400"><Loader2 size={24} className="inline animate-spin" /></div>
        ) : error ? (
          <div className="card p-10 flex flex-col items-center text-center gap-2">
            <AlertTriangle size={32} className="text-amber-500" />
            <p className="text-sm text-slate-600 max-w-md">{error}</p>
          </div>
        ) : !page ? null : (
          <>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Scale size={20} className="text-brand-600" /> {page.notary_name}</h1>
              <p className="text-sm text-slate-500">PPJB/AJB, pajak, & biaya jasa untuk pembeli yang Anda tangani. Klik "Kirim Update" untuk mengirim nomor/status/bukti — akan ditinjau developer sebelum resmi tercatat.</p>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Pembeli', 'Unit / Proyek', 'PPJB', 'AJB', 'Pajak', 'Biaya', 'Serah-Terima Asli', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {page.rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada pembeli.</td></tr>
                  ) : page.rows.map((r) => (
                    <tr key={r.client_id} className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.client_name}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{[r.unit_label, r.project_name].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.ppjb_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.ajb_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.tax_records.length} baris</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.fees.length} baris</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {r.last_handover_event ? (
                          <>
                            {HANDOVER_LABEL[r.last_handover_event]}
                            <div className="text-xs text-slate-400">{fmtDate(r.last_handover_date)}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetailRow(r)}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-brand-600 text-white px-2.5 py-1.5 hover:bg-brand-700 whitespace-nowrap"
                        >
                          <Send size={12} /> Kirim Update
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {detailRow && <ClientSubmitModal token={token} row={detailRow} onClose={() => setDetailRow(null)} />}
    </div>
  )
}

function ClientSubmitModal({ token, row, onClose }: { token: string; row: PublicNotaryClientRow; onClose: () => void }) {
  const [sentKinds, setSentKinds] = useState<Set<string>>(new Set())

  // ── PPJB & AJB ──
  const [ppjbNumber, setPpjbNumber] = useState(row.ppjb_number ?? '')
  const [ppjbFile, setPpjbFile] = useState<File | null>(null)
  const [ajbNumber, setAjbNumber] = useState(row.ajb_number ?? '')
  const [ajbFile, setAjbFile] = useState<File | null>(null)
  const [savingPpjbAjb, setSavingPpjbAjb] = useState(false)
  const [errPpjbAjb, setErrPpjbAjb] = useState('')

  async function submitPpjbAjb() {
    setSavingPpjbAjb(true); setErrPpjbAjb('')
    try {
      await taxService.publicNotarySubmit(token, {
        client_id: row.client_id, kind: 'ppjb_ajb',
        ppjb_number: ppjbNumber || undefined, ppjb_file: ppjbFile,
        ajb_number: ajbNumber || undefined, ajb_file: ajbFile,
      })
      setSentKinds((p) => new Set(p).add('ppjb_ajb'))
    } catch { setErrPpjbAjb('Gagal mengirim. Coba lagi.') } finally { setSavingPpjbAjb(false) }
  }

  // ── Pajak ──
  const [taxTarget, setTaxTarget] = useState('')
  const [taxType, setTaxType] = useState<TaxType>('pph')
  const [taxCategory, setTaxCategory] = useState('komersial')
  const [taxAmount, setTaxAmount] = useState<number | undefined>(undefined)
  const [taxIdBilling, setTaxIdBilling] = useState('')
  const [taxNtpn, setTaxNtpn] = useState('')
  const [taxDate, setTaxDate] = useState('')
  const [taxStatus, setTaxStatus] = useState<TaxStatus>('belum')
  const [taxFile, setTaxFile] = useState<File | null>(null)
  const [savingTax, setSavingTax] = useState(false)
  const [errTax, setErrTax] = useState('')

  async function submitTax() {
    setSavingTax(true); setErrTax('')
    try {
      await taxService.publicNotarySubmit(token, {
        client_id: row.client_id, kind: 'tax', target_id: taxTarget || undefined,
        tax_type: taxType, tax_category: taxCategory, tax_amount: taxAmount,
        tax_id_billing: taxIdBilling || undefined, tax_ntpn: taxNtpn || undefined,
        tax_date: taxDate || undefined, tax_status: taxStatus, file: taxFile,
      })
      setSentKinds((p) => new Set(p).add('tax'))
      setTaxTarget(''); setTaxAmount(undefined); setTaxIdBilling(''); setTaxNtpn(''); setTaxDate(''); setTaxFile(null)
    } catch { setErrTax('Gagal mengirim. Coba lagi.') } finally { setSavingTax(false) }
  }

  // ── Biaya Notaris ──
  const [feeTarget, setFeeTarget] = useState('')
  const [feeDescription, setFeeDescription] = useState('')
  const [feeAmount, setFeeAmount] = useState<number | undefined>(undefined)
  const [feeDate, setFeeDate] = useState('')
  const [savingFee, setSavingFee] = useState(false)
  const [errFee, setErrFee] = useState('')

  async function submitFee() {
    if (!feeDescription.trim() || !feeAmount) return
    setSavingFee(true); setErrFee('')
    try {
      await taxService.publicNotarySubmit(token, {
        client_id: row.client_id, kind: 'fee', target_id: feeTarget || undefined,
        fee_description: feeDescription.trim(), fee_amount: feeAmount, fee_date: feeDate || undefined,
      })
      setSentKinds((p) => new Set(p).add('fee'))
      setFeeTarget(''); setFeeDescription(''); setFeeAmount(undefined); setFeeDate('')
    } catch { setErrFee('Gagal mengirim. Coba lagi.') } finally { setSavingFee(false) }
  }

  // ── Serah-Terima Dokumen Asli ──
  const [custodyDocId, setCustodyDocId] = useState('')
  const [custodyEvent, setCustodyEvent] = useState<NotaryHandoverEvent>('serah_notaris')
  const [custodyAt, setCustodyAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [savingCustody, setSavingCustody] = useState(false)
  const [errCustody, setErrCustody] = useState('')

  async function submitCustody() {
    if (!custodyDocId || !custodyAt) return
    setSavingCustody(true); setErrCustody('')
    try {
      await taxService.publicNotarySubmit(token, {
        client_id: row.client_id, kind: 'custody',
        custody_document_id: custodyDocId, custody_event: custodyEvent, custody_at: custodyAt,
      })
      setSentKinds((p) => new Set(p).add('custody'))
      setCustodyDocId(''); setCustodyAt('')
    } catch { setErrCustody('Gagal mengirim. Coba lagi.') } finally { setSavingCustody(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Kirim Update — ${row.client_name}`} size="lg">
      <div className="space-y-5">
        {/* PPJB & AJB */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><FileSignature size={14} /> PPJB & AJB</p>
          {sentKinds.has('ppjb_ajb') ? (
            <p className="text-xs text-emerald-600 flex items-center gap-1"><Check size={13} /> Terkirim, menunggu persetujuan</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">No. PPJB</label>
                  <input className="input text-xs py-1.5" value={ppjbNumber} onChange={(e) => setPpjbNumber(e.target.value)} />
                  <input className="text-xs mt-1" type="file" onChange={(e) => setPpjbFile(e.target.files?.[0] ?? null)} />
                </div>
                <div>
                  <label className="label text-xs">No. AJB</label>
                  <input className="input text-xs py-1.5" value={ajbNumber} onChange={(e) => setAjbNumber(e.target.value)} />
                  <input className="text-xs mt-1" type="file" onChange={(e) => setAjbFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
              {errPpjbAjb && <p className="text-xs text-red-600">{errPpjbAjb}</p>}
              <div className="flex justify-end">
                <button onClick={submitPpjbAjb} disabled={savingPpjbAjb} className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-brand-600 text-white px-2.5 py-1.5 hover:bg-brand-700 disabled:opacity-50">
                  {savingPpjbAjb ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Kirim PPJB/AJB
                </button>
              </div>
            </>
          )}
        </div>

        {/* Perpajakan */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-800">Perpajakan</p>
          {row.tax_records.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400"><tr>{['Jenis', 'Jumlah', 'ID Billing', 'NTPN', 'Status'].map((h, i) => (
                  <th key={i} className="text-left font-semibold py-1 pr-2">{h}</th>))}</tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {row.tax_records.map((t) => (
                    <tr key={t.id}>
                      <td className="py-1 pr-2 text-slate-600">{taxTypeLabel(t.tax_type)}</td>
                      <td className="py-1 pr-2 text-slate-600">{fmtRp(t.amount)}</td>
                      <td className="py-1 pr-2 text-slate-500">{t.id_billing || '—'}</td>
                      <td className="py-1 pr-2 text-slate-500">{t.ntpn || '—'}</td>
                      <td className="py-1 pr-2 text-slate-500">{taxStatusLabel(t.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sentKinds.has('tax') && <p className="text-xs text-emerald-600 flex items-center gap-1"><Check size={13} /> Kiriman terakhir terkirim, menunggu persetujuan</p>}
          <p className="text-xs text-slate-400">Kirim baris baru, atau pilih baris di atas untuk diperbarui.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <select className="input text-xs py-1.5" value={taxTarget} onChange={(e) => setTaxTarget(e.target.value)}>
              <option value="">+ Baris baru</option>
              {row.tax_records.map((t) => <option key={t.id} value={t.id}>Perbarui: {taxTypeLabel(t.tax_type)} ({fmtRp(t.amount)})</option>)}
            </select>
            <select className="input text-xs py-1.5" value={taxType} onChange={(e) => setTaxType(e.target.value as TaxType)}>
              {TAX_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select className="input text-xs py-1.5" value={taxCategory} onChange={(e) => setTaxCategory(e.target.value)}>
              <option value="komersial">Komersial</option>
              <option value="subsidi">Subsidi</option>
            </select>
            <MoneyInput className="input text-xs py-1.5" placeholder="Jumlah" value={taxAmount} onChange={setTaxAmount} />
            <input className="input text-xs py-1.5" placeholder="ID Billing" value={taxIdBilling} onChange={(e) => setTaxIdBilling(e.target.value)} />
            <input className="input text-xs py-1.5" placeholder="NTPN" value={taxNtpn} onChange={(e) => setTaxNtpn(e.target.value)} />
            <input className="input text-xs py-1.5" type="date" value={taxDate} onChange={(e) => setTaxDate(e.target.value)} />
            <select className="input text-xs py-1.5" value={taxStatus} onChange={(e) => setTaxStatus(e.target.value as TaxStatus)}>
              {TAX_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input className="text-xs py-1.5" type="file" onChange={(e) => setTaxFile(e.target.files?.[0] ?? null)} />
          </div>
          {errTax && <p className="text-xs text-red-600">{errTax}</p>}
          <div className="flex justify-end">
            <button onClick={submitTax} disabled={savingTax} className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-brand-600 text-white px-2.5 py-1.5 hover:bg-brand-700 disabled:opacity-50">
              {savingTax ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Kirim Pajak
            </button>
          </div>
        </div>

        {/* Biaya Notaris */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-800">Biaya Notaris</p>
          {row.fees.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400"><tr>{['Uraian', 'Nominal', 'Tanggal', 'Status'].map((h, i) => (
                  <th key={i} className="text-left font-semibold py-1 pr-2">{h}</th>))}</tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {row.fees.map((f) => (
                    <tr key={f.id}>
                      <td className="py-1 pr-2 text-slate-600">{f.description}</td>
                      <td className="py-1 pr-2 text-slate-600">{fmtRp(f.amount)}</td>
                      <td className="py-1 pr-2 text-slate-500">{fmtDate(f.fee_date)}</td>
                      <td className="py-1 pr-2 text-slate-500">{f.is_paid ? 'Dibayar' : 'Belum'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sentKinds.has('fee') && <p className="text-xs text-emerald-600 flex items-center gap-1"><Check size={13} /> Kiriman terakhir terkirim, menunggu persetujuan</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select className="input text-xs py-1.5 col-span-2 sm:col-span-1" value={feeTarget} onChange={(e) => setFeeTarget(e.target.value)}>
              <option value="">+ Baris baru</option>
              {row.fees.map((f) => <option key={f.id} value={f.id}>Perbarui: {f.description}</option>)}
            </select>
            <input className="input text-xs py-1.5 col-span-2 sm:col-span-1" placeholder="Uraian (mis. jasa AJB)" value={feeDescription} onChange={(e) => setFeeDescription(e.target.value)} />
            <MoneyInput className="input text-xs py-1.5" placeholder="Nominal" value={feeAmount} onChange={setFeeAmount} />
            <input className="input text-xs py-1.5" type="date" value={feeDate} onChange={(e) => setFeeDate(e.target.value)} />
          </div>
          {errFee && <p className="text-xs text-red-600">{errFee}</p>}
          <div className="flex justify-end">
            <button onClick={submitFee} disabled={savingFee || !feeDescription.trim() || !feeAmount} className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-brand-600 text-white px-2.5 py-1.5 hover:bg-brand-700 disabled:opacity-50">
              {savingFee ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Kirim Biaya
            </button>
          </div>
        </div>

        {/* Serah-Terima Dokumen Asli */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><ArrowLeftRight size={14} /> Serah-Terima Dokumen Asli</p>
          {row.last_handover_event && (
            <p className="text-xs text-slate-500">
              Kejadian terakhir: {HANDOVER_LABEL[row.last_handover_event]} — {fmtDate(row.last_handover_date)}
            </p>
          )}
          {sentKinds.has('custody') && <p className="text-xs text-emerald-600 flex items-center gap-1"><Check size={13} /> Terkirim, menunggu persetujuan</p>}
          {row.documents.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada dokumen legalitas untuk unit ini.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <select className="input text-xs py-1.5" value={custodyDocId} onChange={(e) => setCustodyDocId(e.target.value)}>
                  <option value="">Pilih dokumen…</option>
                  {row.documents.map((d) => <option key={d.id} value={d.id}>{d.doc_type}</option>)}
                </select>
                <select className="input text-xs py-1.5" value={custodyEvent} onChange={(e) => setCustodyEvent(e.target.value as NotaryHandoverEvent)}>
                  {(Object.keys(HANDOVER_LABEL) as NotaryHandoverEvent[]).map((k) => <option key={k} value={k}>{HANDOVER_LABEL[k]}</option>)}
                </select>
                <input className="input text-xs py-1.5" type="date" value={custodyAt} onChange={(e) => setCustodyAt(e.target.value)} />
              </div>
              {errCustody && <p className="text-xs text-red-600">{errCustody}</p>}
              <div className="flex justify-end">
                <button onClick={submitCustody} disabled={savingCustody || !custodyDocId || !custodyAt} className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-brand-600 text-white px-2.5 py-1.5 hover:bg-brand-700 disabled:opacity-50">
                  {savingCustody ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Kirim Serah-Terima
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
