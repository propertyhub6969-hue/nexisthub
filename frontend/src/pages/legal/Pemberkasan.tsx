import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Loader2, Scale, Landmark, Info } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { filingService } from '../../services/filing'
import type { FilingSummaryItem, KprStage } from '../../types'

const kprStageLabel: Record<KprStage, string> = {
  collect_berkas: 'Collect Berkas',
  berkas_masuk_bank: 'Berkas di Bank',
  sp3k: 'SP3K',
  akad_kredit: 'Akad Kredit',
  pencairan: 'Pencairan',
}

// Urutan tahap KPR + penjelasannya (untuk tombol Informasi)
const KPR_STAGES: { key: KprStage; label: string; desc: string }[] = [
  { key: 'collect_berkas', label: 'Collect Berkas', desc: 'Mengumpulkan berkas persyaratan pembeli (KTP, KK, slip gaji, dll).' },
  { key: 'berkas_masuk_bank', label: 'Berkas Masuk Bank', desc: 'Berkas diajukan/diserahkan ke bank untuk diproses.' },
  { key: 'sp3k', label: 'SP3K', desc: 'Surat Penegasan Persetujuan Penyediaan Kredit — bank menyetujui pengajuan.' },
  { key: 'akad_kredit', label: 'Akad Kredit', desc: 'Penandatanganan akad kredit antara pembeli dan bank.' },
  { key: 'pencairan', label: 'Pencairan', desc: 'Dana KPR dicairkan bank ke developer (bisa bertahap + retensi).' },
]

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
  const [projectFilter, setProjectFilter] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)

  useEffect(() => {
    filingService.summary()
      .then(setItems)
      .catch(() => setError('Gagal memuat ringkasan pemberkasan.'))
      .finally(() => setLoading(false))
  }, [])

  // daftar proyek (unik) dari data untuk dropdown filter
  const projectNames = Array.from(new Set(items.map((i) => i.project_name).filter(Boolean) as string[])).sort()

  const filtered = items.filter((it) =>
    (!search || it.full_name.toLowerCase().includes(search.toLowerCase())) &&
    (!projectFilter || it.project_name === projectFilter)
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Ringkasan kelengkapan dokumen, pajak, dan tahap KPR untuk semua pembeli — klik ikon untuk buka detailnya.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Cari nama pembeli..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-52" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">Semua proyek</option>
          {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="btn-secondary flex items-center gap-2 text-sm"
          title="Keterangan tahap Status Berkas KPR"
        >
          <Info size={14} /> Keterangan Status KPR
        </button>
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

      {/* Modal keterangan tahap Status Berkas KPR */}
      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title="Keterangan Status Berkas KPR">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Tahap pemberkasan KPR berjalan berurutan dari atas ke bawah:</p>
          <ol className="space-y-2.5">
            {KPR_STAGES.map((s, i) => (
              <li key={s.key} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">{i + 1}</span>
                <div>
                  <Badge label={s.label} variant="blue" />
                  <p className="text-sm text-slate-600 mt-1">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Modal>
    </div>
  )
}
