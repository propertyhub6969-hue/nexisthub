import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Plus, Trash2, Pencil, Loader2, ArrowLeft } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { propertyService } from '../../services/property'
import type { Project, Unit, UnitCreate, UnitStatus } from '../../types'

const statusConfig: Record<UnitStatus, { label: string; variant: 'green' | 'yellow' | 'blue' | 'orange' }> = {
  available: { label: 'Tersedia',     variant: 'green' },
  booked:    { label: 'Booking/DP',   variant: 'yellow' },
  sold:      { label: 'Akad/Terjual', variant: 'blue' },
  handover:  { label: 'Serah Terima', variant: 'orange' },
}

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

const emptyForm = (projectId: string): UnitCreate => ({
  project_id: projectId, block: '', unit_number: '', unit_type: '',
  land_area: undefined, building_area: undefined, price: undefined, status: 'available',
})

export default function ProjectUnits() {
  const { projectId = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<UnitCreate>(emptyForm(projectId))
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [proj, res] = await Promise.all([
        propertyService.getProject(projectId),
        propertyService.listUnits({ project_id: projectId, size: 500 }),
      ])
      setProject(proj)
      setUnits(res.items)
    } catch {
      setError('Gagal memuat data unit.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const counts = units.reduce((acc, u) => { acc[u.status] = (acc[u.status] || 0) + 1; return acc }, {} as Record<string, number>)
  const shown = statusFilter ? units.filter((u) => u.status === statusFilter) : units

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm(projectId))
    setModalOpen(true)
  }

  function openEdit(u: Unit) {
    setEditingId(u.id)
    setForm({
      project_id: projectId,
      block: u.block ?? '',
      unit_number: u.unit_number,
      unit_type: u.unit_type ?? '',
      land_area: u.land_area,
      building_area: u.building_area,
      price: u.price,
      status: u.status,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm(projectId))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: UnitCreate = { ...form }
      ;(['land_area', 'building_area', 'price'] as const).forEach((k) => { if (!payload[k]) delete payload[k] })
      const rec = payload as unknown as Record<string, unknown>
      ;['block', 'unit_type'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (editingId) {
        await propertyService.updateUnit(editingId, payload)
      } else {
        await propertyService.createUnit(payload)
      }
      closeModal()
      await load()
    } catch {
      setError('Gagal menyimpan unit.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus unit ini?')) return
    try {
      await propertyService.deleteUnit(id)
      setUnits((prev) => prev.filter((u) => u.id !== id))
    } catch {
      setError('Gagal menghapus unit.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/property/projects" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-1">
            <ArrowLeft size={14} /> Daftar Proyek
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">{project?.name ?? 'Unit'}</h1>
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreate}>
          <Plus size={14} />
          Tambah Unit
        </button>
      </div>

      {/* Ringkasan status (klik untuk filter) */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatusFilter('')}
          className={`card px-3 py-2 text-sm ${statusFilter === '' ? 'ring-2 ring-brand-500' : ''}`}>
          Semua <span className="font-semibold">{units.length}</span>
        </button>
        {(Object.keys(statusConfig) as UnitStatus[]).map((k) => (
          <button key={k} onClick={() => setStatusFilter(statusFilter === k ? '' : k)}
            className={`card px-3 py-2 text-sm flex items-center gap-2 ${statusFilter === k ? 'ring-2 ring-brand-500' : ''}`}>
            <Badge label={statusConfig[k].label} variant={statusConfig[k].variant} />
            <span className="font-semibold">{counts[k] || 0}</span>
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Blok', 'No. Unit', 'Tipe', 'LT / LB', 'Harga', 'Status', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">{units.length === 0 ? 'Belum ada unit. Klik "Tambah Unit".' : 'Tidak ada unit dengan status ini.'}</td></tr>
            ) : (
              shown.map((u) => {
                const s = statusConfig[u.status]
                return (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{u.block ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{u.unit_number}</td>
                    <td className="px-4 py-3 text-slate-500">{u.unit_type ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {u.land_area ? `${Number(u.land_area)} m²` : '—'} / {u.building_area ? `${Number(u.building_area)} m²` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmt(u.price)}</td>
                    <td className="px-4 py-3">{s && <Badge label={s.label} variant={s.variant} />}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openEdit(u)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Edit">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDelete(u.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Edit Unit' : 'Tambah Unit'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Blok / Cluster</label>
              <input className="input" placeholder="A" value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })} />
            </div>
            <div>
              <label className="label">No. Unit / Kavling *</label>
              <input className="input" required value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Tipe</label>
              <input className="input" placeholder="36/72" value={form.unit_type} onChange={(e) => setForm({ ...form, unit_type: e.target.value })} />
            </div>
            <div>
              <label className="label">LT (m²)</label>
              <input className="input" type="number" min={0} value={form.land_area ?? ''} onChange={(e) => setForm({ ...form, land_area: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <label className="label">LB (m²)</label>
              <input className="input" type="number" min={0} value={form.building_area ?? ''} onChange={(e) => setForm({ ...form, building_area: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Harga (Rp)</label>
              <input className="input" type="number" min={0} value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as UnitStatus })}>
                {(Object.keys(statusConfig) as UnitStatus[]).map((k) => (
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
