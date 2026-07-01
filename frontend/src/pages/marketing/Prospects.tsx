import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Trash2, Loader2 } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { marketingService } from '../../services/marketing'
import type { Prospect, ProspectCreate, ProspectStatus } from '../../types'

const statusConfig: Record<ProspectStatus, { label: string; variant: 'blue' | 'yellow' | 'green' | 'red' }> = {
  active:      { label: 'Aktif',     variant: 'blue' },
  negotiation: { label: 'Negosiasi', variant: 'yellow' },
  won:         { label: 'Menang',    variant: 'green' },
  lost:        { label: 'Kalah',     variant: 'red' },
}

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

const emptyForm: ProspectCreate = { full_name: '', phone: '', email: '', unit_type: '', budget: undefined, status: 'active' }

export default function Prospects() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ProspectCreate>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await marketingService.listProspects({ search: term || undefined, size: 100 })
      setProspects(res.items)
    } catch {
      setError('Gagal memuat data prospect.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: ProspectCreate = { ...form }
      if (!payload.budget) delete payload.budget
      const rec = payload as unknown as Record<string, unknown>
      ;['phone', 'email', 'unit_type'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      await marketingService.createProspect(payload)
      setModalOpen(false)
      setForm(emptyForm)
      await load(search)
    } catch {
      setError('Gagal menyimpan prospect.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus prospect ini?')) return
    try {
      await marketingService.deleteProspect(id)
      setProspects((prev) => prev.filter((p) => p.id !== id))
    } catch {
      setError('Gagal menghapus prospect.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8"
            placeholder="Cari nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          Tambah Prospect
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Nama', 'Tipe Unit', 'Budget', 'Status', 'Tanggal', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : prospects.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada prospect.</td></tr>
            ) : (
              prospects.map((p) => {
                const s = statusConfig[p.status]
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.full_name}</td>
                    <td className="px-4 py-3 text-slate-500">{p.unit_type ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(p.budget)}</td>
                    <td className="px-4 py-3">{s && <Badge label={s.label} variant={s.variant} />}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(p.created_at).toLocaleDateString('id-ID')}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Prospect">
        <form onSubmit={handleCreate} className="space-y-3">
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
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipe Unit</label>
              <input className="input" placeholder="Tipe 36/72..." value={form.unit_type} onChange={(e) => setForm({ ...form, unit_type: e.target.value })} />
            </div>
            <div>
              <label className="label">Budget (Rp)</label>
              <input className="input" type="number" min={0} value={form.budget ?? ''} onChange={(e) => setForm({ ...form, budget: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProspectStatus })}>
              {(Object.keys(statusConfig) as ProspectStatus[]).map((k) => (
                <option key={k} value={k}>{statusConfig[k].label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Simpan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
