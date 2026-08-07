import { useEffect, useState, useCallback } from 'react'
import { Loader2, Zap, Droplets, CheckCircle2, Wallet, Home, Search, X } from 'lucide-react'
import UtilityModal from '../../components/property/UtilityModal'
import { propertyService } from '../../services/property'
import type { Project, UtilitySummary, UtilityStatus, UtilityUnitRow } from '../../types'

const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

const ST: Record<UtilityStatus, { label: string; cls: string }> = {
  belum: { label: 'Belum', cls: 'bg-slate-100 text-slate-500' },
  diajukan: { label: 'Diajukan', cls: 'bg-amber-100 text-amber-700' },
  terpasang: { label: 'Terpasang', cls: 'bg-emerald-100 text-emerald-700' },
}
const StatusPill = ({ s }: { s?: UtilityStatus }) => {
  const cfg = ST[s ?? 'belum']
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
}

function StatCard({ icon, label, value, accent, hint }: {
  icon: React.ReactNode; label: string; value: string; accent?: string; hint?: string
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className={`font-display text-lg font-bold truncate ${accent ?? 'text-slate-900'}`}>{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
    </div>
  )
}

/** Rekap kesiapan utilitas (PLN & PDAM) per proyek — untuk tim produksi:
 *  unit mana yang belum bisa diserahterimakan karena listrik/air belum masuk. */
export default function Utilities() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState<UtilitySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const [q, setQ] = useState('')
  const [editUnit, setEditUnit] = useState<UtilityUnitRow | null>(null)

  useEffect(() => {
    propertyService.listProjects({ size: 500 })
      .then((r) => {
        setProjects(r.items)
        if (r.items.length && !projectId) setProjectId(r.items[0].id)
      })
      .catch(() => setError('Gagal memuat daftar proyek.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(() => {
    if (!projectId) return
    setLoading(true); setError('')
    propertyService.utilitiesSummary(projectId, onlyIncomplete)
      .then(setData).catch(() => setError('Gagal memuat rekap utilitas.')).finally(() => setLoading(false))
  }, [projectId, onlyIncomplete])
  useEffect(load, [load])

  const query = q.trim().toLowerCase()
  const rows = (data?.rows ?? []).filter((r) => !query || r.unit_label.toLowerCase().includes(query))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Zap size={20} className="text-amber-500" /> Utilitas Unit
        </h1>
        <p className="text-sm text-slate-500">
          Kesiapan sambungan <b>PLN &amp; PDAM</b> per unit. Keduanya wajib terpasang sebelum unit bisa diserahterimakan (BAST).
        </p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <select className="input max-w-xs" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.length === 0 && <option value="">Belum ada proyek</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9 pr-8" placeholder="Cari no. unit…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={onlyIncomplete} onChange={(e) => setOnlyIncomplete(e.target.checked)} className="rounded border-slate-300" />
          Hanya yang belum lengkap
        </label>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {loading ? (
        <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard icon={<Home size={17} className="text-slate-400" />} label="Total Unit" value={String(data.total_units)} />
            <StatCard icon={<Zap size={17} className="text-amber-500" />} label="PLN Terpasang"
              value={`${data.pln_terpasang} / ${data.total_units}`} accent="text-amber-600" />
            <StatCard icon={<Droplets size={17} className="text-blue-500" />} label="PDAM Terpasang"
              value={`${data.pdam_terpasang} / ${data.total_units}`} accent="text-blue-600" />
            <StatCard icon={<CheckCircle2 size={17} className="text-emerald-500" />} label="Siap Serah Terima"
              value={String(data.ready)} accent="text-emerald-600" hint="PLN & PDAM terpasang" />
            <StatCard icon={<Wallet size={17} className="text-slate-400" />} label="Total Biaya Utilitas"
              value={fmtRp(data.total_cost)} hint="masuk biaya proyek" />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Unit', 'Status Unit', 'Listrik PLN', 'Air PDAM', 'Siap Serah Terima', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {onlyIncomplete ? 'Semua unit sudah lengkap utilitasnya. 🎉' : 'Belum ada unit.'}
                  </td></tr>
                ) : rows.map((r) => (
                  <tr key={r.unit_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{r.unit_label}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap capitalize">{r.unit_status}</td>
                    <td className="px-4 py-2.5"><StatusPill s={r.pln} /></td>
                    <td className="px-4 py-2.5"><StatusPill s={r.pdam} /></td>
                    <td className="px-4 py-2.5">
                      {r.ready
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={13} /> Siap</span>
                        : <span className="text-xs text-slate-400">Belum</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setEditUnit(r)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline whitespace-nowrap">
                        <Zap size={12} /> Atur
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editUnit && (
        <UtilityModal
          unitId={editUnit.unit_id}
          unitLabel={editUnit.unit_label}
          onClose={() => setEditUnit(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
