import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Loader2, Scale, Landmark } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { filingService } from '../../services/filing'
import type { FilingSummaryItem, KprStage } from '../../types'

const kprStageLabel: Record<KprStage, string> = {
  collect_berkas: 'Collect Berkas',
  berkas_masuk_bank: 'Berkas di Bank',
  sp3k: 'SP3K',
  akad_kredit: 'Akad Kredit',
  pencairan: 'Pencairan',
}

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
  const [search, setSearch] = useState('')

  useEffect(() => {
    filingService.summary()
      .then(setItems)
      .catch(() => setError('Gagal memuat ringkasan pemberkasan.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter((it) =>
    !search || it.full_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Ringkasan kelengkapan dokumen, pajak, dan tahap KPR untuk semua pembeli — klik ikon untuk buka detailnya.
      </p>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-8" placeholder="Cari nama pembeli..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                {items.length === 0 ? 'Belum ada pembeli.' : 'Tidak ada pembeli sesuai pencarian.'}
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
