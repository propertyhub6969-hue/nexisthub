import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2, Pencil, Loader2, Wallet, Scale, Landmark } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SignaturePad from '../../components/ui/SignaturePad'
import { marketingService } from '../../services/marketing'
import { propertyService } from '../../services/property'
import { authService } from '../../services/auth'
import type { Client, ClientCreate, ClientStatus, ClientPaymentType, KprStage, Project, Unit, UserResponse } from '../../types'

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

  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name
  const unitLabel = (u?: Unit) => u ? [u.block, u.unit_number].filter(Boolean).join('-') : undefined
  const unitNumberById = (id?: string) => unitLabel(units.find((u) => u.id === id))

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Cari nama atau unit..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              {['Tanggal', 'Nama Pembeli', 'No. HP', 'Proyek', 'No. Unit', 'Harga Jual', 'Sisa Piutang', 'Cara Beli', 'Status Berkas KPR', 'Status', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada pembeli.</td></tr>
            ) : (
              clients.map((c) => {
                const s = statusConfig[c.status]
                const pt = c.payment_type ? paymentTypeConfig[c.payment_type] : null
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{c.contract_date ? new Date(c.contract_date).toLocaleDateString('id-ID') : '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.full_name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{projectName(c.project_id) ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{unitNumberById(c.unit_id) ?? c.unit_number ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(c.contract_value)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{c.contract_value == null ? '—' : fmt(c.remaining)}</td>
                    <td className="px-4 py-3">{pt ? <Badge label={pt.label} variant={pt.variant} /> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3">
                      {c.kpr_stage ? <Badge label={kprStageLabel[c.kpr_stage]} variant="blue" /> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">{s && <Badge label={s.label} variant={s.variant} />}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link to={`/marketing/clients/${c.id}/payments`} className="text-slate-400 hover:text-brand-600 transition-colors" title="Pembayaran & Cicilan"><Wallet size={15} /></Link>
                        <Link to={`/marketing/clients/${c.id}/tax`} className="text-slate-400 hover:text-brand-600 transition-colors" title="Pajak & Notaris"><Scale size={15} /></Link>
                        <Link to={`/marketing/clients/${c.id}/kpr`} className="text-slate-400 hover:text-brand-600 transition-colors" title="KPR"><Landmark size={15} /></Link>
                        <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Edit"><Pencil size={15} /></button>
                        <button onClick={() => handleDelete(c.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })
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
