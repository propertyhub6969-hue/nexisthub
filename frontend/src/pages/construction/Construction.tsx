import { useEffect, useState, useCallback } from 'react'
import { Loader2, Pencil, HardHat, CheckCircle2, Plus, Trash2, Wallet } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { constructionService } from '../../services/construction'
import { propertyService } from '../../services/property'
import { procurementService } from '../../services/procurement'
import type {
  Project, Unit, Vendor, UnitConstructionRow, ConstructionSummary, ConstructionStage, ConstructionUpsert,
  ContractorContract, ContractCreate, Opname,
} from '../../types'

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
const fmt = (n?: number) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

export default function Construction() {
  const [tab, setTab] = useState<'progres' | 'borongan'>('progres')
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // progres
  const [rows, setRows] = useState<UnitConstructionRow[]>([])
  const [summary, setSummary] = useState<ConstructionSummary | null>(null)
  const [pModalOpen, setPModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<UnitConstructionRow | null>(null)
  const [pForm, setPForm] = useState<ConstructionUpsert>({})

  // borongan
  const [contracts, setContracts] = useState<ContractorContract[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [cModal, setCModal] = useState(false)
  const [cForm, setCForm] = useState<ContractCreate>({ unit_id: '', vendor_id: '', title: '', total_value: 0 })
  const [cEditId, setCEditId] = useState<string | null>(null)
  const [opModal, setOpModal] = useState(false)
  const [opContract, setOpContract] = useState<ContractorContract | null>(null)
  const [opList, setOpList] = useState<Opname[]>([])
  const [opAmount, setOpAmount] = useState<number | undefined>(undefined)
  const [opDate, setOpDate] = useState('')
  const [opDesc, setOpDesc] = useState('')

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => {
      setProjects(r.items); if (r.items.length) setProject((p) => p || r.items[0].id)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const loadProgres = useCallback(async (pid: string) => {
    if (!pid) { setRows([]); setSummary(null); return }
    const res = await constructionService.list(pid); setRows(res.rows); setSummary(res.summary)
  }, [])
  const loadBorongan = useCallback(async (pid: string) => {
    if (!pid) { setContracts([]); return }
    const [c, u, v] = await Promise.all([
      constructionService.listContracts(pid), propertyService.listUnits({ project_id: pid, size: 500 }), procurementService.listVendors(),
    ])
    setContracts(c); setUnits(u.items); setVendors(v)
  }, [])
  useEffect(() => { if (project && tab === 'progres') loadProgres(project) }, [project, tab, loadProgres])
  useEffect(() => { if (project && tab === 'borongan') loadBorongan(project) }, [project, tab, loadBorongan])

  // progres handlers
  function openEdit(r: UnitConstructionRow) {
    setEditRow(r); setPForm({ stage: r.stage, percent: r.percent, start_date: r.start_date ?? '', target_date: r.target_date ?? '', finish_date: r.finish_date ?? '', notes: r.notes ?? '' }); setPModalOpen(true)
  }
  async function submitProgres(e: React.FormEvent) {
    e.preventDefault(); if (!editRow) return; setSaving(true)
    try {
      const p = { ...pForm }; const rec = p as unknown as Record<string, unknown>
      ;['start_date', 'target_date', 'finish_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      await constructionService.upsert(editRow.unit_id, p); setPModalOpen(false); await loadProgres(project)
    } catch { setError('Gagal menyimpan progres.') } finally { setSaving(false) }
  }

  // borongan handlers
  function openCCreate() { setCEditId(null); setCForm({ unit_id: '', vendor_id: '', title: '', total_value: 0 }); setCModal(true) }
  function openCEdit(c: ContractorContract) { setCEditId(c.id); setCForm({ unit_id: c.unit_id, vendor_id: c.vendor_id ?? '', title: c.title ?? '', total_value: c.total_value, notes: c.notes }); setCModal(true) }
  async function submitContract(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...cForm }; if (p.vendor_id === '') delete p.vendor_id
      if (cEditId) await constructionService.updateContract(cEditId, p); else await constructionService.createContract(p)
      setCModal(false); await loadBorongan(project)
    } catch { setError('Gagal menyimpan kontrak.') } finally { setSaving(false) }
  }
  async function delContract(id: string) {
    if (!confirm('Hapus kontrak borongan ini?')) return
    try { await constructionService.deleteContract(id); await loadBorongan(project) } catch { setError('Gagal menghapus.') }
  }
  async function openOpname(c: ContractorContract) {
    setOpContract(c); setOpAmount(undefined); setOpDate(''); setOpDesc(''); setOpModal(true)
    setOpList(await constructionService.listOpname(c.id))
  }
  async function addOpname(e: React.FormEvent) {
    e.preventDefault(); if (!opContract || !opAmount) return; setSaving(true)
    try {
      const c = await constructionService.addOpname(opContract.id, { amount: opAmount, expense_date: opDate || undefined, description: opDesc || undefined })
      setOpContract(c); setOpList(await constructionService.listOpname(opContract.id)); await loadBorongan(project)
      setOpAmount(undefined); setOpDate(''); setOpDesc('')
    } catch { setError('Gagal mencatat opname.') } finally { setSaving(false) }
  }
  async function delOpname(id: string) {
    if (!opContract) return
    try { await constructionService.deleteOpname(id); setOpList(await constructionService.listOpname(opContract.id)); await loadBorongan(project) } catch { /* noop */ }
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200">
        {(['progres', 'borongan'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t === 'progres' ? 'Progres Pembangunan' : 'Kontraktor Borongan'}
          </button>
        ))}
      </div>

      <select className="input max-w-xs" value={project} onChange={(e) => setProject(e.target.value)}>
        <option value="">Pilih proyek...</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {tab === 'progres' ? (
        <>
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="card p-4"><p className="text-xs text-slate-500">Total Unit</p><p className="text-lg font-semibold text-slate-900">{summary.total_units}</p></div>
              <div className="card p-4"><p className="text-xs text-slate-500">Rata-rata Progres</p><p className="text-lg font-semibold text-brand-600">{summary.avg_percent}%</p></div>
              <div className="card p-4"><p className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 size={12} /> Selesai</p><p className="text-lg font-semibold text-emerald-600">{summary.done_count} / {summary.total_units}</p></div>
            </div>
          )}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900 flex items-center gap-2"><HardHat size={15} /> Progres per Unit</div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Unit', 'Tipe', 'Tahap', 'Progres', 'Mulai', 'Selesai', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">{project ? 'Belum ada unit.' : 'Pilih proyek dulu.'}</td></tr>
                ) : rows.map((r) => {
                  const s = stageCfg(r.stage)
                  return (
                    <tr key={r.unit_id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{r.unit_label}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.unit_type ?? '—'}</td>
                      <td className="px-4 py-2.5"><Badge label={s.label} variant={s.variant} /></td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${r.percent}%` }} /></div><span className="text-xs text-slate-500">{r.percent}%</span></div></td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(r.start_date)}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(r.finish_date)}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => openEdit(r)} className="text-slate-400 hover:text-brand-600" title="Update"><Pencil size={15} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-1" onClick={openCCreate} disabled={!project}><Plus size={14} /> Kontrak Borongan</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Unit', 'Kontraktor', 'Nilai Borongan', 'Terbayar', 'Sisa', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {contracts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada kontrak borongan.</td></tr>
                ) : contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.unit_label}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.vendor_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmt(c.total_value)}</td>
                    <td className="px-4 py-2.5 text-emerald-600">{fmt(c.paid)}</td>
                    <td className={`px-4 py-2.5 font-medium ${Number(c.remaining) > 0 ? 'text-amber-600' : 'text-slate-500'}`}>{fmt(c.remaining)}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-3">
                      <button onClick={() => openOpname(c)} className="text-slate-400 hover:text-brand-600" title="Opname mingguan"><Wallet size={15} /></button>
                      <button onClick={() => openCEdit(c)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => delContract(c.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal Progres */}
      <Modal open={pModalOpen} onClose={() => setPModalOpen(false)} title={`Progres — ${editRow?.unit_label ?? ''}`}>
        <form onSubmit={submitProgres} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Tahap</label>
              <select className="input" value={pForm.stage} onChange={(e) => setPForm({ ...pForm, stage: e.target.value as ConstructionStage })}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select></div>
            <div><label className="label">Progres (%)</label><input className="input" type="number" min={0} max={100} value={pForm.percent ?? 0} onChange={(e) => setPForm({ ...pForm, percent: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Mulai</label><input className="input" type="date" value={pForm.start_date} onChange={(e) => setPForm({ ...pForm, start_date: e.target.value })} /></div>
            <div><label className="label">Target</label><input className="input" type="date" value={pForm.target_date} onChange={(e) => setPForm({ ...pForm, target_date: e.target.value })} /></div>
            <div><label className="label">Selesai</label><input className="input" type="date" value={pForm.finish_date} onChange={(e) => setPForm({ ...pForm, finish_date: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setPModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Kontrak */}
      <Modal open={cModal} onClose={() => setCModal(false)} title={cEditId ? 'Edit Kontrak Borongan' : 'Kontrak Borongan'}>
        <form onSubmit={submitContract} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Unit *</label>
              <select className="input" required value={cForm.unit_id} onChange={(e) => setCForm({ ...cForm, unit_id: e.target.value })} disabled={!!cEditId}>
                <option value="">Pilih unit...</option>{units.map((u) => <option key={u.id} value={u.id}>{[u.block, u.unit_number].filter(Boolean).join('-')}</option>)}
              </select></div>
            <div><label className="label">Kontraktor</label>
              <select className="input" value={cForm.vendor_id} onChange={(e) => setCForm({ ...cForm, vendor_id: e.target.value })}>
                <option value="">Pilih...</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Judul</label><input className="input" placeholder="Borongan A-01" value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} /></div>
            <div><label className="label">Nilai Borongan (Rp) *</label><input className="input" type="number" min={0} required value={cForm.total_value || ''} onChange={(e) => setCForm({ ...cForm, total_value: Number(e.target.value) })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setCModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Opname */}
      <Modal open={opModal} onClose={() => setOpModal(false)} title={`Opname — ${opContract?.unit_label ?? ''}`}>
        {opContract && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="card p-2"><p className="text-xs text-slate-500">Nilai</p><p className="font-semibold">{fmt(opContract.total_value)}</p></div>
              <div className="card p-2"><p className="text-xs text-slate-500">Terbayar</p><p className="font-semibold text-emerald-600">{fmt(opContract.paid)}</p></div>
              <div className="card p-2"><p className="text-xs text-slate-500">Sisa</p><p className="font-semibold text-amber-600">{fmt(opContract.remaining)}</p></div>
            </div>
            <div className="space-y-1">
              {opList.length === 0 && <p className="text-xs text-slate-400">Belum ada opname.</p>}
              {opList.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1.5">
                  <span>{o.description}</span>
                  <span className="flex items-center gap-2"><span className="text-xs text-slate-400">{fmtDate(o.expense_date)}</span><span className="text-emerald-600 font-medium">{fmt(o.amount)}</span>
                    <button onClick={() => delOpname(o.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button></span>
                </div>
              ))}
            </div>
            <form onSubmit={addOpname} className="border-t border-slate-100 pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Nominal (Rp) *</label><input className="input" type="number" min={0} required value={opAmount ?? ''} onChange={(e) => setOpAmount(e.target.value ? Number(e.target.value) : undefined)} /></div>
                <div><label className="label">Tanggal</label><input className="input" type="date" value={opDate} onChange={(e) => setOpDate(e.target.value)} /></div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1"><label className="label">Keterangan</label><input className="input" placeholder="Opname minggu ke-..." value={opDesc} onChange={(e) => setOpDesc(e.target.value)} /></div>
                <button type="submit" className="btn-primary text-sm h-[38px]" disabled={saving}>Catat</button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  )
}
