import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2, Pencil, Loader2, Wallet } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { saleService } from '../../services/sale'
import { propertyService } from '../../services/property'
import { marketingService } from '../../services/marketing'
import type {
  Sale, SaleCreate, SaleStatus, SaleCategory, PaymentType,
  Project, Unit, Client,
} from '../../types'

const statusConfig: Record<SaleStatus, { label: string; variant: 'yellow' | 'blue' | 'orange' | 'green' | 'red' }> = {
  booking: { label: 'Booking', variant: 'yellow' },
  proses:  { label: 'Proses',  variant: 'blue' },
  akad:    { label: 'Akad',    variant: 'orange' },
  lunas:   { label: 'Lunas',   variant: 'green' },
  batal:   { label: 'Batal',   variant: 'red' },
}
const categoryConfig: Record<SaleCategory, { label: string; variant: 'blue' | 'gray' }> = {
  subsidi:   { label: 'Subsidi',   variant: 'blue' },
  komersial: { label: 'Komersial', variant: 'gray' },
}
const paymentLabel: Record<PaymentType, string> = {
  cash_keras: 'Cash Keras', cash_bertahap: 'Cash Bertahap', kpr: 'KPR',
}

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

const emptyForm: SaleCreate = {
  unit_id: '', client_id: '', category: 'komersial', payment_type: 'kpr',
  price: undefined, status: 'booking', booking_date: '', sale_number: '',
}

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<SaleCreate>(emptyForm)
  const [formProject, setFormProject] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await saleService.list({ search: term || undefined, size: 100 })
      setSales(res.items)
    } catch {
      setError('Gagal memuat data penjualan.')
    } finally {
      setLoading(false)
    }
  }, [])

  // data pendukung form (sekali)
  const loadRefs = useCallback(async () => {
    try {
      const [c, p, u] = await Promise.all([
        marketingService.listClients({ size: 500 }),
        propertyService.listProjects({ size: 500 }),
        propertyService.listUnits({ size: 500 }),
      ])
      setClients(c.items); setProjects(p.items); setUnits(u.items)
    } catch { /* biarkan; error utama sudah ditangani */ }
  }, [])

  useEffect(() => { loadRefs() }, [loadRefs])
  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  function openCreate() {
    setEditingId(null); setForm(emptyForm); setFormProject(''); setModalOpen(true)
    loadRefs()
  }
  function openEdit(s: Sale) {
    setEditingId(s.id)
    setForm({
      unit_id: s.unit_id ?? '', client_id: s.client_id ?? '',
      sale_number: s.sale_number ?? '', category: s.category, payment_type: s.payment_type,
      price: s.price, status: s.status, booking_date: s.booking_date ?? '', akad_date: s.akad_date ?? '',
    })
    setFormProject(s.project_id ?? '')
    setModalOpen(true)
    loadRefs()
  }
  function closeModal() { setModalOpen(false); setEditingId(null); setForm(emptyForm); setFormProject('') }

  // unit yang bisa dipilih: unit di proyek terpilih yang tersedia (+ unit saat ini bila edit)
  const selectableUnits = units.filter(
    (u) => u.project_id === formProject && (u.status === 'available' || u.id === form.unit_id)
  )

  function onSelectUnit(unitId: string) {
    const u = units.find((x) => x.id === unitId)
    setForm((f) => ({ ...f, unit_id: unitId, price: f.price ?? u?.price }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.unit_id || !form.client_id) { setError('Pilih unit dan pembeli dulu.'); return }
    setSaving(true)
    try {
      const payload: SaleCreate = { ...form }
      if (!payload.price) delete payload.price
      const rec = payload as unknown as Record<string, unknown>
      ;['sale_number', 'booking_date', 'akad_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (editingId) await saleService.update(editingId, payload)
      else await saleService.create(payload)
      closeModal()
      await Promise.all([load(search), loadRefs()])
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Gagal menyimpan penjualan.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus/batalkan penjualan ini? Unit akan dibebaskan kembali.')) return
    try {
      await saleService.remove(id)
      await Promise.all([load(search), loadRefs()])
    } catch {
      setError('Gagal menghapus penjualan.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Cari no. booking..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreate}>
          <Plus size={14} /> Tambah Penjualan
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['No.', 'Unit', 'Pembeli', 'Kategori', 'Bayar', 'Harga', 'Status', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada penjualan. Klik "Tambah Penjualan".</td></tr>
            ) : (
              sales.map((s) => {
                const st = statusConfig[s.status]; const cat = categoryConfig[s.category]
                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{s.sale_number ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.unit_label ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.client_name ?? '—'}</td>
                    <td className="px-4 py-3">{cat && <Badge label={cat.label} variant={cat.variant} />}</td>
                    <td className="px-4 py-3 text-slate-500">{paymentLabel[s.payment_type]}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(s.price)}</td>
                    <td className="px-4 py-3">{st && <Badge label={st.label} variant={st.variant} />}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link to={`/sales/${s.id}/payments`} className="text-slate-400 hover:text-brand-600 transition-colors" title="Pembayaran & Cicilan"><Wallet size={15} /></Link>
                        <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Edit"><Pencil size={15} /></button>
                        <button onClick={() => handleDelete(s.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus/Batal"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Edit Penjualan' : 'Tambah Penjualan'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Proyek *</label>
              <select className="input" value={formProject} onChange={(e) => { setFormProject(e.target.value); setForm((f) => ({ ...f, unit_id: '' })) }}>
                <option value="">Pilih proyek...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unit *</label>
              <select className="input" value={form.unit_id} onChange={(e) => onSelectUnit(e.target.value)} disabled={!formProject}>
                <option value="">{formProject ? 'Pilih unit...' : 'Pilih proyek dulu'}</option>
                {selectableUnits.map((u) => (
                  <option key={u.id} value={u.id}>{[u.block, u.unit_number].filter(Boolean).join('-')} {u.unit_type ? `(${u.unit_type})` : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Pembeli *</label>
            <select className="input" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">Pilih pembeli...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            {clients.length === 0 && <p className="text-xs text-amber-600 mt-1">Belum ada pembeli. Tambahkan dulu di menu Marketing → Pembeli.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Kategori</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as SaleCategory })}>
                {(Object.keys(categoryConfig) as SaleCategory[]).map((k) => <option key={k} value={k}>{categoryConfig[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipe Pembayaran</label>
              <select className="input" value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value as PaymentType })}>
                {(Object.keys(paymentLabel) as PaymentType[]).map((k) => <option key={k} value={k}>{paymentLabel[k]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Harga Jual (Rp)</label>
              <input className="input" type="number" min={0} value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SaleStatus })}>
                {(Object.keys(statusConfig) as SaleStatus[]).map((k) => <option key={k} value={k}>{statusConfig[k].label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">No. Booking</label>
              <input className="input" value={form.sale_number} onChange={(e) => setForm({ ...form, sale_number: e.target.value })} />
            </div>
            <div>
              <label className="label">Tgl Booking</label>
              <input className="input" type="date" value={form.booking_date} onChange={(e) => setForm({ ...form, booking_date: e.target.value })} />
            </div>
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
