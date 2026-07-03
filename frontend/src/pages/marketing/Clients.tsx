import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2, Pencil, Loader2, Wallet, Scale, Landmark, Columns3 } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SignaturePad from '../../components/ui/SignaturePad'
import { marketingService } from '../../services/marketing'
import { propertyService } from '../../services/property'
import { authService } from '../../services/auth'
import type { Client, ClientCreate, ClientStatus, ClientPaymentType, KprStage, Project, Unit, UserResponse } from '../../types'

// Kolom yang bisa disembunyikan lewat tombol "Kolom" (Nama/Status/Aksi selalu tampil)
type ToggleColKey = 'tanggal' | 'phone' | 'proyek' | 'unit' | 'harga' | 'piutang' | 'cara_beli' | 'kpr_stage'
interface ColDef { key: ToggleColKey | 'nama' | 'status' | 'aksi'; label: string; toggleable: boolean }
const ALL_COLUMNS: ColDef[] = [
  { key: 'tanggal', label: 'Tanggal', toggleable: true },
  { key: 'nama', label: 'Nama Pembeli', toggleable: false },
  { key: 'phone', label: 'No. HP', toggleable: true },
  { key: 'proyek', label: 'Proyek', toggleable: true },
  { key: 'unit', label: 'No. Unit', toggleable: true },
  { key: 'harga', label: 'Harga Jual', toggleable: true },
  { key: 'piutang', label: 'Sisa Piutang', toggleable: true },
  { key: 'cara_beli', label: 'Cara Beli', toggleable: true },
  { key: 'kpr_stage', label: 'Status Berkas KPR', toggleable: true },
  { key: 'status', label: 'Status', toggleable: false },
  { key: 'aksi', label: '', toggleable: false },
]
const DEFAULT_VISIBLE_COLS: Record<ToggleColKey, boolean> = {
  tanggal: true, phone: true, proyek: true, unit: true, harga: true, piutang: true, cara_beli: true, kpr_stage: true,
}
const COLS_STORAGE_KEY = 'nexisthub_clients_visible_cols'
function loadVisibleCols(): Record<ToggleColKey, boolean> {
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY)
    if (raw) return { ...DEFAULT_VISIBLE_COLS, ...JSON.parse(raw) }
  } catch { /* abaikan, pakai default */ }
  return DEFAULT_VISIBLE_COLS
}

const statusConfig: Record<ClientStatus, { label: string; variant: 'green' | 'blue' | 'gray' }> = {
  active:    { label: 'Aktif',    variant: 'green' },
  completed: { label: 'Selesai',  variant: 'blue' },
  inactive:  { label: 'Nonaktif', variant: 'gray' },
}

const paymentTypeConfig: Record<ClientPaymentType, { label: string; variant: 'blue' | 'gray' }> = {
  cash: { label: 'Cash', variant: 'gray' },
  kpr:  { label: 'KPR',  variant: 'blue' },
}

const kprStageLabel: Record<KprStage, string> = {
  collect_berkas: 'Collect Berkas',
  berkas_masuk_bank: 'Berkas di Bank',
  sp3k: 'SP3K',
  akad_kredit: 'Akad Kredit',
  pencairan: 'Pencairan',
}

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

const emptyForm: ClientCreate = {
  full_name: '', phone: '', nik: '', address: '', project_id: '', unit_id: '',
  contract_value: undefined, contract_date: '', payment_type: undefined, promo: '', signature: '', status: 'active',
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [me, setMe] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ClientCreate>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [visibleCols, setVisibleCols] = useState<Record<ToggleColKey, boolean>>(loadVisibleCols)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const [projectFilter, setProjectFilter] = useState('')
  const [unitFilter, setUnitFilter] = useState('')

  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name
  const unitLabel = (u?: Unit) => u ? [u.block, u.unit_number].filter(Boolean).join('-') : undefined
  const unitNumberById = (id?: string) => unitLabel(units.find((u) => u.id === id))

  useEffect(() => {
    localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(visibleCols))
  }, [visibleCols])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function toggleCol(key: ToggleColKey) {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const load = useCallback(async (term: string) => {
    setLoading(true); setError('')
    try {
      const res = await marketingService.listClients({ search: term || undefined, size: 500 })
      setClients(res.items)
    } catch { setError('Gagal memuat data pembeli.') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {})
    propertyService.listUnits({ size: 500 }).then((r) => setUnits(r.items)).catch(() => {})
    authService.me().then(setMe).catch(() => {})
  }, [])

  const firstLoad = useRef(true)
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      load(search)          // load pertama langsung, tanpa jeda
      return
    }
    const t = setTimeout(() => load(search), 300)  // debounce hanya untuk pencarian
    return () => clearTimeout(t)
  }, [search, load])

  function openCreate() { setEditingId(null); setForm(emptyForm); setModalOpen(true) }
  function openEdit(c: Client) {
    setEditingId(c.id)
    setForm({
      full_name: c.full_name, phone: c.phone ?? '', nik: c.nik ?? '', address: c.address ?? '',
      project_id: c.project_id ?? '', unit_id: c.unit_id ?? '',
      contract_value: c.contract_value, contract_date: c.contract_date ?? '',
      payment_type: c.payment_type,
      promo: c.promo ?? '', signature: c.signature ?? '', status: c.status,
    })
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setEditingId(null); setForm(emptyForm) }

  // pilih unit → harga otomatis dari data unit
  function onSelectUnit(unitId: string) {
    const u = units.find((x) => x.id === unitId)
    setForm((f) => ({ ...f, unit_id: unitId, contract_value: u?.price != null ? Number(u.price) : f.contract_value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const payload: ClientCreate = { ...form }
      if (!payload.contract_value) delete payload.contract_value
      const rec = payload as unknown as Record<string, unknown>
      ;['phone', 'nik', 'address', 'project_id', 'unit_id', 'contract_date', 'payment_type', 'promo', 'signature'].forEach((k) => {
        if (rec[k] === '') delete rec[k]
      })
      if (editingId) await marketingService.updateClient(editingId, payload)
      else await marketingService.createClient(payload)
      closeModal(); await load(search)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Gagal menyimpan pembeli.')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus pembeli ini?')) return
    try { await marketingService.deleteClient(id); setClients((prev) => prev.filter((c) => c.id !== id)) }
    catch { setError('Gagal menghapus pembeli.') }
  }

  const formUnits = units.filter((u) => u.project_id === form.project_id)

  const filterUnits = units.filter((u) => !projectFilter || u.project_id === projectFilter)
  const filteredClients = clients.filter((c) =>
    (!projectFilter || c.project_id === projectFilter) && (!unitFilter || c.unit_id === unitFilter)
  )
  const visibleColumns = ALL_COLUMNS.filter((c) => !c.toggleable || visibleCols[c.key as ToggleColKey])

  function renderCell(c: Client, key: ColDef['key']) {
    switch (key) {
      case 'tanggal':
        return <span className="text-slate-500 text-xs whitespace-nowrap">{c.contract_date ? new Date(c.contract_date).toLocaleDateString('id-ID') : '—'}</span>
      case 'nama':
        return <span className="font-medium text-slate-900">{c.full_name}</span>
      case 'phone':
        return <span className="text-slate-600">{c.phone ?? '—'}</span>
      case 'proyek':
        return <span className="text-slate-500">{projectName(c.project_id) ?? '—'}</span>
      case 'unit':
        return <span className="text-slate-500">{unitNumberById(c.unit_id) ?? c.unit_number ?? '—'}</span>
      case 'harga':
        return <span className="text-slate-600 whitespace-nowrap">{fmt(c.contract_value)}</span>
      case 'piutang':
        return <span className="text-slate-600 whitespace-nowrap">{c.contract_value == null ? '—' : fmt(c.remaining)}</span>
      case 'cara_beli': {
        const pt = c.payment_type ? paymentTypeConfig[c.payment_type] : null
        return pt ? <Badge label={pt.label} variant={pt.variant} /> : <span className="text-slate-400">—</span>
      }
      case 'kpr_stage':
        return c.kpr_stage ? <Badge label={kprStageLabel[c.kpr_stage]} variant="blue" /> : <span className="text-slate-400">—</span>
      case 'status': {
        const s = statusConfig[c.status]
        return s ? <Badge label={s.label} variant={s.variant} /> : null
      }
      case 'aksi':
        return (
          <div className="flex items-center justify-end gap-3">
            <Link to={`/marketing/clients/${c.id}/payments`} className="text-slate-400 hover:text-brand-600 transition-colors" title="Pembayaran & Cicilan"><Wallet size={15} /></Link>
            <Link to={`/marketing/clients/${c.id}/tax`} className="text-slate-400 hover:text-brand-600 transition-colors" title="Pajak & Notaris"><Scale size={15} /></Link>
            <Link to={`/marketing/clients/${c.id}/kpr`} className="text-slate-400 hover:text-brand-600 transition-colors" title="KPR"><Landmark size={15} /></Link>
            <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Edit"><Pencil size={15} /></button>
            <button onClick={() => handleDelete(c.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus"><Trash2 size={15} /></button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8 w-56" placeholder="Cari nama atau unit..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-40" value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setUnitFilter('') }}>
            <option value="">Semua Proyek</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input w-40" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="">Semua Unit</option>
            {filterUnits.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
          </select>
          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setColMenuOpen((v) => !v)} className="btn-secondary flex items-center gap-2 text-sm">
              <Columns3 size={14} /> Kolom
            </button>
            {colMenuOpen && (
              <div className="absolute left-0 mt-2 w-56 card p-2 z-20">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Tampilkan Kolom</p>
                {ALL_COLUMNS.filter((c) => c.toggleable).map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleCols[c.key as ToggleColKey]}
                      onChange={() => toggleCol(c.key as ToggleColKey)}
                      className="rounded border-slate-300"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreate}>
          <Plus size={14} /> Tambah Pembeli
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {visibleColumns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : filteredClients.length === 0 ? (
              <tr><td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-slate-400 text-sm">
                {clients.length === 0 ? 'Belum ada pembeli.' : 'Tidak ada pembeli sesuai filter.'}
              </td></tr>
            ) : (
              filteredClients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-4 py-3">{renderCell(c, col.key)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Edit Pembeli' : 'Tambah Pembeli'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Nama Lengkap *</label>
            <input className="input" required minLength={2} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">No. HP</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">NIK (KTP)</label>
              <input className="input" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Alamat</label>
            <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Marketing</label>
            <input className="input bg-slate-50" value={me?.full_name ?? '—'} readOnly title="Otomatis dari user yang login" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Proyek</label>
              <select className="input" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value, unit_id: '' })}>
                <option value="">Pilih proyek...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">No. Unit / Kavling</label>
              <select className="input" value={form.unit_id} onChange={(e) => onSelectUnit(e.target.value)} disabled={!form.project_id}>
                <option value="">{form.project_id ? 'Pilih unit...' : 'Pilih proyek dulu'}</option>
                {formUnits.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)} {u.unit_type ? `(${u.unit_type})` : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Harga Jual (Rp)</label>
              <input className="input" type="number" min={0} value={form.contract_value ?? ''} onChange={(e) => setForm({ ...form, contract_value: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <label className="label">Tanggal *</label>
              <input className="input" type="date" required value={form.contract_date} onChange={(e) => setForm({ ...form, contract_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Cara Beli</label>
              <select className="input" value={form.payment_type ?? ''} onChange={(e) => setForm({ ...form, payment_type: (e.target.value || undefined) as ClientPaymentType | undefined })}>
                <option value="">Pilih...</option>
                <option value="cash">Cash</option>
                <option value="kpr">KPR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Promo</label>
              <input className="input" placeholder="mis. Free biaya KPR" value={form.promo} onChange={(e) => setForm({ ...form, promo: e.target.value })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}>
                {(Object.keys(statusConfig) as ClientStatus[]).map((k) => <option key={k} value={k}>{statusConfig[k].label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Tanda Tangan Digital</label>
            <SignaturePad value={form.signature} onChange={(d) => setForm({ ...form, signature: d })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={closeModal}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingId ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
