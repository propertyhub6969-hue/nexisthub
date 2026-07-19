import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Check, X, Eye, Inbox } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { kprService } from '../../services/kpr'
import type { BankSubmission, KprStage } from '../../types'

const stageLabel: Record<KprStage, string> = {
  collect_berkas: 'Collect Berkas',
  berkas_masuk_bank: 'Berkas Masuk Bank',
  sp3k: 'SP3K',
  akad_kredit: 'Akad Kredit',
  pencairan: 'Pencairan',
}
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'
const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

export default function BankSubmissions() {
  const [items, setItems] = useState<BankSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<BankSubmission | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try { setItems(await kprService.listBankSubmissions('pending')) }
    catch { setError('Gagal memuat daftar kiriman bank.') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleAccept(s: BankSubmission) {
    setBusyId(s.id); setError('')
    try {
      await kprService.acceptBankSubmission(s.id)
      setItems((prev) => prev.filter((x) => x.id !== s.id))
    } catch { setError('Gagal menerima kiriman.') } finally { setBusyId(null) }
  }

  function openReject(s: BankSubmission) { setRejectReason(''); setRejectTarget(s) }
  async function submitReject(e: React.FormEvent) {
    e.preventDefault()
    if (!rejectTarget || !rejectReason.trim()) return
    setSaving(true)
    try {
      await kprService.rejectBankSubmission(rejectTarget.id, rejectReason.trim())
      setItems((prev) => prev.filter((x) => x.id !== rejectTarget.id))
      setRejectTarget(null)
    } catch { setError('Gagal menolak kiriman.') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Inbox size={20} className="text-brand-600" /> Kiriman Bank</h1>
        <p className="text-sm text-slate-500">Update progres pemberkasan dari bank lewat tautan — tinjau sebelum resmi masuk ke data KPR pembeli.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Pembeli', 'Bank', 'Tahap Diajukan', 'Plafon', 'Tenor', 'No. SP3K', 'Tgl SP3K', 'Catatan', 'File', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400 text-sm">Tidak ada kiriman menunggu persetujuan.</td></tr>
              ) : items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link to={`/marketing/clients/${s.client_id}/kpr`} className="font-medium text-slate-900 hover:text-brand-600">{s.client_name}</Link>
                    {s.unit_label && <div className="text-xs text-slate-400">{s.unit_label}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{s.bank_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{stageLabel[s.submitted_stage]}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtRp(s.submitted_plafond)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.submitted_tenor_months != null ? `${s.submitted_tenor_months} bln` : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.submitted_sp3k_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(s.submitted_sp3k_date)}</td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-[220px]">
                    {s.submitted_notes ? <span className="line-clamp-2" title={s.submitted_notes}>{s.submitted_notes}</span> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.has_file ? (
                      <button onClick={() => kprService.openSubmissionFile(s.id)} className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs" title={s.file_name}>
                        <Eye size={13} /> Lihat
                      </button>
                    ) : <span className="text-slate-400 text-xs">—</span>}
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
        )}
      </div>

      <Modal open={rejectTarget !== null} onClose={() => setRejectTarget(null)} title="Tolak Kiriman — wajib isi alasan">
        <form onSubmit={submitReject} className="space-y-3">
          <p className="text-sm text-slate-600">
            Menolak kiriman dari <b>{rejectTarget?.bank_name}</b> untuk <b>{rejectTarget?.client_name}</b>. Data KPR pembeli ini tidak akan berubah.
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
