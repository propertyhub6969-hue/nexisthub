import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, Pencil, Loader2, MessageCircle, ArrowRightCircle } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { marketingService } from '../../services/marketing'
import { propertyService } from '../../services/property'
import { waLink } from '../../utils/phone'
import type { Lead, LeadCreate, LeadStatus, Project } from '../../types'

const statusConfig: Record<LeadStatus, { label: string; variant: 'blue' | 'yellow' | 'green' | 'gray' }> = {
  new:         { label: 'Baru',         variant: 'blue' },
  contacted:   { label: 'Dihubungi',    variant: 'yellow' },
  qualified:   { label: 'Tervalidasi',  variant: 'green' },
  unqualified: { label: 'Tidak Sesuai', variant: 'gray' },
}

const SOURCE_OPTIONS = [
  'Instagram',
  'Visit Lokasi',
  'Facebook',
  'Iklan Social Media',
  'Youtube',
  'Teman',
  'Marketing Inhouse',
  'Marketing Freelance',
]

const emptyForm: LeadCreate = { full_name: '', phone: '', email: '', source: '', interested_project_id: '', status: 'new' }

export default function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<LeadCreate>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {})
  }, [])

  const load = useCallback(async (term: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await marketingService.listLeads({ search: term || undefined, size: 100 })
      setLeads(res.items)
    } catch {
      setError('Gagal memuat data lead.')
    } finally {
      setLoading(false)
    }
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

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(lead: Lead) {
    setEditingId(lead.id)
    setForm({
      full_name: lead.full_name,
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      source: lead.source ?? '',
      interested_project_id: lead.interested_project_id ?? '',
      status: lead.status,
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
      const payload: LeadCreate = { ...form }
      // buang field opsional yang kosong
      const rec = payload as unknown as Record<string, unknown>
      Object.keys(rec).forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (editingId) {
        await marketingService.updateLead(editingId, payload)
      } else {
        await marketingService.createLead(payload)
      }
      closeModal()
      await load(search)
    } catch {
      setError('Gagal menyimpan lead. Periksa isian Anda.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus lead ini?')) return
    try {
      await marketingService.deleteLead(id)
      setLeads((prev) => prev.filter((l) => l.id !== id))
    } catch {
      setError('Gagal menghapus lead.')
    }
  }

  async function handleConvert(lead: Lead) {
    if (!confirm(`Jadikan "${lead.full_name}" sebagai Prospek? Datanya akan terbawa.`)) return
    try {
      await marketingService.convertLead(lead.id)
      navigate('/marketing/prospects')
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(d || 'Gagal konversi lead.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8"
            placeholder="Cari nama atau nomor HP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreate}>
          <Plus size={14} />
          Tambah Lead
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Nama', 'No. HP', 'Email', 'Sumber', 'Properti Diminati', 'Status', 'Tanggal', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  <Loader2 size={18} className="inline animate-spin" />
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Belum ada lead. Klik "Tambah Lead" untuk mulai.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const s = statusConfig[lead.status]
                return (
                  <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{lead.full_name}</td>
                    <td className="px-4 py-3">
                      {lead.phone ? (
                        <a
                          href={waLink(lead.phone)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:underline"
                          title="Chat via WhatsApp"
                        >
                          <MessageCircle size={14} />
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{lead.email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{lead.source ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{projectName(lead.interested_project_id) ?? '—'}</td>
                    <td className="px-4 py-3">{s && <Badge label={s.label} variant={s.variant} />}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(lead.created_at).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleConvert(lead)}
                          className="text-slate-400 hover:text-emerald-600 transition-colors"
                          title="Jadikan Prospek"
                        >
                          <ArrowRightCircle size={15} />
                        </button>
                        <button
                          onClick={() => openEdit(lead)}
                          className="text-slate-400 hover:text-brand-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                          title="Hapus"
                        >
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

      {/* Create / Edit modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Edit Lead' : 'Tambah Lead'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Nama Lengkap *</label>
            <input className="input" required minLength={2}
              value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
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
              <label className="label">Sumber</label>
              <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                <option value="">Pilih sumber...</option>
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Properti Diminati</label>
              <select className="input" value={form.interested_project_id} onChange={(e) => setForm({ ...form, interested_project_id: e.target.value })}>
                <option value="">Pilih proyek...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })}>
              {(Object.keys(statusConfig) as LeadStatus[]).map((k) => (
                <option key={k} value={k}>{statusConfig[k].label}</option>
              ))}
            </select>
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
