import { useEffect, useState, useCallback } from 'react'
import { Loader2, Pencil, HardHat, CheckCircle2 } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { constructionService } from '../../services/construction'
import { propertyService } from '../../services/property'
import type { Project, UnitConstructionRow, ConstructionSummary, ConstructionStage, ConstructionUpsert } from '../../types'

const STAGES: { key: ConstructionStage; label: string; variant: 'gray' | 'yellow' | 'blue' | 'orange' | 'green' }[] = [
  { key: 'persiapan', label: 'Persiapan', variant: 'gray' },
  { key: 'pondasi', label: 'Pondasi', variant: 'yellow' },
  { key: 'struktur', label: 'Struktur', variant: 'yellow' },
  { key: 'dinding', label: 'Dinding', variant: 'blue' },
  { key: 'atap', label: 'Atap', variant: 'blue' },
  { key: 'finishing', label: 'Finishing', variant: 'orange' },
  { key: 'selesai', label: 'Selesai', variant: 'green' },
]
const stageCfg = (s: ConstructionStage) => STAGES.find((x) => x.key === s) ?? STAGES[0]
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

export default function Construction() {
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState('')
  const [rows, setRows] = useState<UnitConstructionRow[]>([])
  const [summary, setSummary] = useState<ConstructionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<UnitConstructionRow | null>(null)
  const [form, setForm] = useState<ConstructionUpsert>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => {
      setProjects(r.items); if (r.items.length) setProject((p) => p || r.items[0].id)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const load = useCallback(async (pid: string) => {
    if (!pid) { setRows([]); setSummary(null); return }
    const res = await constructionService.list(pid)
    setRows(res.rows); setSummary(res.summary)
  }, [])
  useEffect(() => { if (project) load(project) }, [project, load])

  function openEdit(r: UnitConstructionRow) {
    setEditRow(r)
    setForm({ stage: r.stage, percent: r.percent, start_date: r.start_date ?? '', target_date: r.target_date ?? '', finish_date: r.finish_date ?? '', notes: r.notes ?? '' })
    setModalOpen(true)
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!editRow) return
    setSaving(true)
    try {
      const p = { ...form }; const rec = p as unknown as Record<string, unknown>
      ;['start_date', 'target_date', 'finish_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      await constructionService.upsert(editRow.unit_id, p)
      setModalOpen(false); await load(project)
    } catch { setError('Gagal menyimpan progres.') } finally { setSaving(false) }
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  return (
    <div className="space-y-4">
      <select className="input max-w-xs" value={project} onChange={(e) => setProject(e.target.value)}>
        <option value="">Pilih proyek...</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="card p-4"><p className="text-xs text-slate-500">Total Unit</p><p className="text-lg font-semibold text-slate-900">{summary.total_units}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Rata-rata Progres</p><p className="text-lg font-semibold text-brand-600">{summary.avg_percent}%</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 size={12} /> Selesai</p><p className="text-lg font-semibold text-emerald-600">{summary.done_count} / {summary.total_units}</p></div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900 flex items-center gap-2"><HardHat size={15} /> Progres Pembangunan per Unit</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Unit', 'Tipe', 'Tahap', 'Progres', 'Mulai', 'Selesai', ''].map((h, i) => (
            <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">{project ? 'Belum ada unit di proyek ini.' : 'Pilih proyek dulu.'}</td></tr>
            ) : rows.map((r) => {
              const s = stageCfg(r.stage)
              return (
                <tr key={r.unit_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{r.unit_label}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.unit_type ?? '—'}</td>
                  <td className="px-4 py-2.5"><Badge label={s.label} variant={s.variant} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${r.percent}%` }} /></div>
                      <span className="text-xs text-slate-500">{r.percent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(r.start_date)}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(r.finish_date)}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => openEdit(r)} className="text-slate-400 hover:text-brand-600" title="Update progres"><Pencil size={15} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Progres — ${editRow?.unit_label ?? ''}`}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Tahap</label>
              <select className="input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as ConstructionStage })}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select></div>
            <div><label className="label">Progres (%)</label><input className="input" type="number" min={0} max={100} value={form.percent ?? 0} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Mulai</label><input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className="label">Target</label><input className="input" type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
            <div><label className="label">Selesai</label><input className="input" type="date" value={form.finish_date} onChange={(e) => setForm({ ...form, finish_date: e.target.value })} /></div>
          </div>
          <div><label className="label">Catatan</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
