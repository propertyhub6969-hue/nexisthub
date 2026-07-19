import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Check, X, Eye, Inbox } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { taxService } from '../../services/tax'
import type { NotarySubmission, NotarySubmissionKind } from '../../types'

const kindLabel: Record<NotarySubmissionKind, string> = {
  ppjb_ajb: 'PPJB / AJB',
  tax: 'Pajak',
  fee: 'Biaya Notaris',
}
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'
const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

function summarize(s: NotarySubmission): string {
  if (s.kind === 'ppjb_ajb') {
    const parts = []
    if (s.ppjb_number) parts.push(`PPJB ${s.ppjb_number}`)
    if (s.ajb_number) parts.push(`AJB ${s.ajb_number}`)
    return parts.join(' · ') || '—'
  }
  if (s.kind === 'tax') {
    return `${s.tax_type?.toUpperCase() ?? '—'} · ${fmtRp(s.tax_amount)}${s.tax_id_billing ? ` · ${s.tax_id_billing}` : ''}`
  }
  return `${s.fee_description ?? '—'} · ${fmtRp(s.fee_amount)}`
}

export default function NotarySubmissions() {
  const [items, setItems] = useState<NotarySubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<NotarySubmission | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try { setItems(await taxService.listNotarySubmissions('pending')) }
    catch { setError('Gagal memuat daftar kiriman notaris.') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleAccept(s: NotarySubmission) {
    setBusyId(s.id); setError('')
    try {
      await taxService.acceptNotarySubmission(s.id)
      setItems((prev) => prev.filter((x) => x.id !== s.id))
    } catch { setError('Gagal menerima kiriman.') } finally { setBusyId(null) }
  }

  function openReject(s: NotarySubmission) { setRejectReason(''); setRejectTarget(s) }
  async function submitReject(e: React.FormEvent) {
    e.preventDefault()
    if (!rejectTarget || !rejectReason.trim()) return
    setSaving(true)
    try {
      await taxService.rejectNotarySubmission(rejectTarget.id, rejectReason.trim())
      setItems((prev) => prev.filter((x) => x.id !== rejectTarget.id))
      setRejectTarget(null)
    } catch { setError('Gagal menolak kiriman.') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Inbox size={20} className="text-brand-600" /> Kiriman Notaris</h1>
        <p className="text-sm text-slate-500">Update PPJB/AJB, pajak, & biaya notaris dari notaris lewat tautan — tinjau sebelum resmi masuk ke data pembeli.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Pembeli', 'Notaris', 'Jenis', 'Isi Kiriman', 'File', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">Tidak ada kiriman menunggu persetujuan.</td></tr>
                ) : items.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link to={`/marketing/clients/${s.client_id}/tax`} className="font-medium text-slate-900 hover:text-brand-600">{s.client_name}</Link>
                      {s.unit_label && <div className="text-xs text-slate-400">{s.unit_label}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{s.notary_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700">{kindLabel[s.kind]}{s.target_id && <span className="ml-1 text-xs text-slate-400">(perbarui)</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600 max-w-[280px]">
                      <p className="truncate" title={summarize(s)}>{summarize(s)}</p>
                      {s.submitted_notes && <p className="text-xs text-slate-400 truncate" title={s.submitted_notes}>{s.submitted_notes}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {s.has_ppjb_file && (
                          <button onClick={() => taxService.openSubmissionFile(s.id, 'ppjb')} className="text-brand-600 hover:underline text-xs" title="Lihat file PPJB">PPJB</button>
                        )}
                        {s.has_ajb_file && (
                          <button onClick={() => taxService.openSubmissionFile(s.id, 'ajb')} className="text-brand-600 hover:underline text-xs" title="Lihat file AJB">AJB</button>
                        )}
                        {s.has_file && (
                          <button onClick={() => taxService.openSubmissionFile(s.id, 'main')} className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs" title={s.file_name}>
                            <Eye size={13} /> Bukti
                          </button>
                        )}
                        {!s.has_ppjb_file && !s.has_ajb_file && !s.has_file && <span className="text-slate-400 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleAccept(s)}
                          disabled={busyId === s.id}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Terima
                        </button>
                        <button
                          onClick={() => openReject(s)}
                          disabled={busyId === s.id}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-red-50 text-red-600 border border-red-200 px-2.5 py-1.5 hover:bg-red-100 disabled:opacity-50"
                        >
                          <X size={12} /> Tolak
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={rejectTarget !== null} onClose={() => setRejectTarget(null)} title="Tolak Kiriman — wajib isi alasan">
        <form onSubmit={submitReject} className="space-y-3">
          <p className="text-sm text-slate-600">
            Menolak kiriman <b>{rejectTarget && kindLabel[rejectTarget.kind]}</b> dari <b>{rejectTarget?.notary_name}</b> untuk <b>{rejectTarget?.client_name}</b>. Data pembeli ini tidak akan berubah.
          </p>
          <div>
            <label className="label">Alasan penolakan *</label>
            <textarea className="input" rows={2} required autoFocus placeholder="mis. salah kirim ke pembeli lain, data tidak sesuai"
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary text-sm" onClick={() => setRejectTarget(null)}>Batal</button>
            <button type="submit" className="text-sm flex items-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2 font-medium hover:bg-red-700 disabled:opacity-50" disabled={saving || !rejectReason.trim()}>
              {saving && <Loader2 size={14} className="animate-spin" />}Tolak
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
