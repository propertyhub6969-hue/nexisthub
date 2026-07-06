import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Scale, Landmark } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { filingService } from '../../services/filing'
import type { FilingSummaryItem, KprStage } from '../../types'

// Tahap KPR (urut) + warna badge untuk chip filter
const KPR_STAGES: { key: KprStage; label: string; variant: 'gray' | 'yellow' | 'blue' | 'orange' | 'green' }[] = [
  { key: 'collect_berkas', label: 'Collect Berkas', variant: 'gray' },
  { key: 'berkas_masuk_bank', label: 'Berkas di Bank', variant: 'yellow' },
  { key: 'sp3k', label: 'SP3K', variant: 'blue' },
  { key: 'akad_kredit', label: 'Akad Kredit', variant: 'orange' },
  { key: 'pencairan', label: 'Pencairan', variant: 'green' },
]
const kprStageLabel: Record<KprStage, string> = Object.fromEntries(KPR_STAGES.map((s) => [s.key, s.label])) as Record<KprStage, string>

function completionBadge(done: number, total: number, doneLabel: string) {
  if (total === 0) return <span className="text-slate-400 text-sm">Belum ada</span>
  if (done === total) return <Badge label={`${done}/${total} ${doneLabel}`} variant="green" />
  if (done === 0) return <Badge label={`${done}/${total}`} variant="red" />
  return <Badge label={`${done}/${total}`} variant="yellow" />
}

export default function Pemberkasan() {
  const [items, setItems] = useState<FilingSummaryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [stageFilter, setStageFilter] = useState<KprStage | ''>('')

  useEffect(() => {
    filingService.summary()
      .then(setItems)
      .catch(() => setError('Gagal memuat ringkasan pemberkasan.'))
      .finally(() => setLoading(false))
  }, [])

  const projectNames = Array.from(new Set(items.map((i) => i.project_name).filter(Boolean) as string[])).sort()

  // baris yang cocok filter proyek (dasar hitungan chip tahap KPR)
  const byProject = items.filter((it) => !projectFilter || it.project_name === projectFilter)
  const stageCount = (k: KprStage) => byProject.filter((it) => it.kpr_stage === k).length

  const filtered = byProject.filter((it) => !stageFilter || it.kpr_stage === stageFilter)

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Ringkasan kelengkapan dokumen, pajak, dan tahap KPR untuk semua pembeli — klik ikon untuk buka detailnya.
      </p>

      {/* Filter proyek (dropdown) */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-56" value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setStageFilter('') }}>
          <option value="">Semua proyek</option>
          {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Filter tahap Status Berkas KPR (chip berhitung) */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStageFilter('')}
          className={`card px-3 py-2 text-sm ${stageFilter === '' ? 'ring-2 ring-brand-500' : ''}`}>
          Semua <span className="font-semibold">{byProject.length}</span>
        </button>
        {KPR_STAGES.map((s) => (
          <button key={s.key} onClick={() => setStageFilter(stageFilter === s.key ? '' : s.key)}
            className={`card px-3 py-2 text-sm flex items-center gap-2 ${stageFilter === s.key ? 'ring-2 ring-brand-500' : ''}`}>
            <Badge label={s.label} variant={s.variant} />
            <span className="font-semibold">{stageCount(s.key)}</span>
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Nama Pembeli', 'Proyek', 'Unit', 'Dokumen', 'Pajak', 'Status Berkas KPR', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                {items.length === 0 ? 'Belum ada pembeli.' : 'Tidak ada pembeli sesuai filter.'}
              </td></tr>
            ) : (
              filtered.map((it) => (
                <tr key={it.client_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{it.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{it.project_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{it.unit_label ?? '—'}</td>
                  <td className="px-4 py-3">{completionBadge(it.doc_terbit, it.doc_total, 'Terbit')}</td>
                  <td className="px-4 py-3">{completionBadge(it.tax_settled, it.tax_total, 'Lunas')}</td>
                  <td className="px-4 py-3">
                    {it.kpr_stage ? <Badge label={kprStageLabel[it.kpr_stage]} variant="blue" /> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link to={`/marketing/clients/${it.client_id}/tax`} className="text-slate-400 hover:text-brand-600 transition-colors" title="Dokumen & Pajak">
                        <Scale size={15} />
                      </Link>
                      <Link to={`/marketing/clients/${it.client_id}/kpr`} className="text-slate-400 hover:text-brand-600 transition-colors" title="KPR">
                        <Landmark size={15} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
