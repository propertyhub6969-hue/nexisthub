import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, AlertTriangle, Send, Check, Landmark } from 'lucide-react'
import { kprService } from '../../services/kpr'
import NexistLogo from '../../components/ui/NexistLogo'
import type { PublicBankPage, KprStage } from '../../types'

const STAGES: { key: KprStage; label: string }[] = [
  { key: 'collect_berkas', label: 'Collect Berkas' },
  { key: 'berkas_masuk_bank', label: 'Berkas Masuk Bank' },
  { key: 'sp3k', label: 'SP3K' },
  { key: 'akad_kredit', label: 'Akad Kredit' },
  { key: 'pencairan', label: 'Pencairan' },
]
const stageLabel = (s: KprStage) => STAGES.find((x) => x.key === s)?.label ?? s

interface RowForm {
  stage: KprStage
  sp3k_number: string
  sp3k_date: string
  file: File | null
}

// Halaman publik (tanpa login) — dibuka pihak bank lewat tautan bertoken. Lihat status pemberkasan
// pembeli yang ditanganinya & kirim update (menunggu persetujuan developer, belum langsung mengubah data).
export default function PublicBankFiling() {
  const { token = '' } = useParams()
  const [page, setPage] = useState<PublicBankPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forms, setForms] = useState<Record<string, RowForm>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [rowError, setRowError] = useState<Record<string, string>>({})

  useEffect(() => {
    kprService.publicBankPage(token)
      .then((p) => {
        setPage(p)
        const init: Record<string, RowForm> = {}
        for (const r of p.rows) init[r.kpr_application_id] = { stage: r.stage, sp3k_number: '', sp3k_date: '', file: null }
        setForms(init)
      })
      .catch((err) => setError(
        err?.response?.status === 404
          ? 'Tautan tidak ditemukan, sudah dicabut, atau sudah kedaluwarsa. Silakan hubungi pihak yang membagikan tautan ini.'
          : 'Gagal memuat data.'
      ))
      .finally(() => setLoading(false))
  }, [token])

  function setForm(id: string, patch: Partial<RowForm>) {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function submitRow(id: string) {
    const f = forms[id]
    if (!f) return
    setSubmitting(id); setRowError((prev) => ({ ...prev, [id]: '' }))
    try {
      await kprService.publicBankSubmit(token, {
        kpr_application_id: id, stage: f.stage,
        sp3k_number: f.sp3k_number || undefined, sp3k_date: f.sp3k_date || undefined, file: f.file,
      })
      setSent((prev) => new Set(prev).add(id))
    } catch {
      setRowError((prev) => ({ ...prev, [id]: 'Gagal mengirim. Coba lagi.' }))
    } finally { setSubmitting(null) }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-2">
        <NexistLogo size={24} />
        <span className="text-sm text-slate-400">Status Pemberkasan — akses tautan bank</span>
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
              <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Landmark size={20} className="text-brand-600" /> {page.bank_name}</h1>
              <p className="text-sm text-slate-500">Status pemberkasan pembeli yang ditangani {page.bank_name}. Kirim update progres — akan ditinjau developer sebelum resmi tercatat.</p>
            </div>

            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Pembeli', 'Unit / Proyek', 'Tahap Saat Ini', 'Dokumen', 'Pajak', 'Umur', 'Kirim Update', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {page.rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada pembeli.</td></tr>
                  ) : page.rows.map((r) => {
                    const f = forms[r.kpr_application_id]
                    const isSent = sent.has(r.kpr_application_id)
                    return (
                      <tr key={r.kpr_application_id} className="hover:bg-slate-50 align-top">
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.client_name}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{[r.unit_label, r.project_name].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{stageLabel(r.stage)}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.doc_terbit}/{r.doc_total}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.tax_settled}/{r.tax_total}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.kpr_days != null ? `${r.kpr_days} hari` : '—'}</td>
                        <td className="px-4 py-3 min-w-[280px]">
                          {isSent ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><Check size={13} /> Terkirim, menunggu persetujuan</span>
                          ) : f ? (
                            <div className="flex flex-col gap-1.5">
                              <select className="input text-xs py-1" value={f.stage} onChange={(e) => setForm(r.kpr_application_id, { stage: e.target.value as KprStage })}>
                                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                              </select>
                              <div className="flex gap-1.5">
                                <input className="input text-xs py-1" placeholder="No. SP3K" value={f.sp3k_number} onChange={(e) => setForm(r.kpr_application_id, { sp3k_number: e.target.value })} />
                                <input className="input text-xs py-1" type="date" value={f.sp3k_date} onChange={(e) => setForm(r.kpr_application_id, { sp3k_date: e.target.value })} />
                              </div>
                              <input className="input text-xs py-1" type="file" accept="image/*,application/pdf" onChange={(e) => setForm(r.kpr_application_id, { file: e.target.files?.[0] ?? null })} />
                              {rowError[r.kpr_application_id] && <p className="text-xs text-red-600">{rowError[r.kpr_application_id]}</p>}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {!isSent && (
                            <button
                              onClick={() => submitRow(r.kpr_application_id)}
                              disabled={submitting === r.kpr_application_id}
                              className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-brand-600 text-white px-2.5 py-1.5 hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
                            >
                              {submitting === r.kpr_application_id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Kirim
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
