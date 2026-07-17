import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, Pencil, Loader2, Building2, LayoutGrid, Landmark } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { propertyService } from '../../services/property'
import { useAuth } from '../../context/AuthContext'
import type { Project, ProjectCreate, ProjectStatus } from '../../types'

const statusConfig: Record<ProjectStatus, { label: string; variant: 'blue' | 'green' | 'gray' | 'yellow' }> = {
  planning: { label: 'Perencanaan', variant: 'yellow' },
  selling:  { label: 'Dijual',      variant: 'blue' },
  sold_out: { label: 'Habis Terjual', variant: 'green' },
  inactive: { label: 'Nonaktif',    variant: 'gray' },
}

const emptyForm: ProjectCreate = { name: '', city: '', province: '', address: '', total_units: undefined, status: 'selling' }

export default function Projects() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canDelete = user?.role === 'owner' || user?.role === 'admin'  // hapus data properti = owner/admin
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ProjectCreate>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await propertyService.listProjects({ search: term || undefined, size: 100 })
      setProjects(res.items)
    } catch {
      setError('Gagal memuat data proyek.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(p: Project) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      city: p.city ?? '',
      province: p.province ?? '',
      address: p.address ?? '',
      total_units: p.total_units,
      status: p.status,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: ProjectCreate = { ...form }
      if (!payload.total_units) delete payload.total_units
      const rec = payload as unknown as Record<string, unknown>
      ;['city', 'province', 'address'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (editingId) {
        await propertyService.updateProject(editingId, payload)
      } else {
        await propertyService.createProject(payload)
      }
      closeModal()
      await load(search)
    } catch {
      setError('Gagal menyimpan proyek.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus proyek ini? Semua unit di dalamnya ikut terhapus.')) return
    try {
      await propertyService.deleteProject(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch {
      setError('Gagal menghapus proyek.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8"
            placeholder="Cari nama proyek atau kota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreate}>
          <Plus size={14} />
          Tambah Proyek
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Proyek', 'Lokasi', 'Target Unit', 'Status', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada proyek. Klik "Tambah Proyek" untuk mulai.</td></tr>
            ) : (
              projects.map((p) => {
                const s = statusConfig[p.status]
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/property/projects/${p.id}/units`)}
                        className="flex items-center gap-2 font-medium text-slate-900 hover:text-brand-600 transition-colors"
                      >
                        <Building2 size={15} className="text-slate-400" />
                        {p.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{[p.city, p.province].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.total_units ?? '—'}</td>
                    <td className="px-4 py-3">{s && <Badge label={s.label} variant={s.variant} />}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => navigate(`/property/projects/${p.id}/units`)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Kelola Unit">
                          <LayoutGrid size={15} />
                        </button>
                        <button onClick={() => navigate(`/property/projects/${p.id}/legal-splitting`)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Legal & Perizinan">
                          <Landmark size={15} />
                        </button>
                        <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Edit">
                          <Pencil size={15} />
                        </button>
                        {canDelete && (
                          <button onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Edit Proyek' : 'Tambah Proyek'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Nama Proyek *</label>
            <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Kota</label>
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="label">Provinsi</label>
              <input className="input" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Alamat</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Target Jumlah Unit</label>
              <input className="input" type="number" min={0} value={form.total_units ?? ''} onChange={(e) => setForm({ ...form, total_units: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
                {(Object.keys(statusConfig) as ProjectStatus[]).map((k) => (
                  <option key={k} value={k}>{statusConfig[k].label}</option>
                ))}
              </select>
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
