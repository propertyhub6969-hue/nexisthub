import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, Pencil, Loader2, Building2, LayoutGrid, Landmark, Share2, Copy, Check, ExternalLink } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { propertyService } from '../../services/property'
import { useAuth } from '../../context/AuthContext'
import { hasAnyRole } from '../../utils/access'
import type { Project, ProjectCreate, ProjectStatus, SiteplanShareLink } from '../../types'

const statusConfig: Record<ProjectStatus, { label: string; variant: 'blue' | 'green' | 'gray' | 'yellow' }> = {
  planning: { label: 'Perencanaan', variant: 'yellow' },
  selling:  { label: 'Dijual',      variant: 'blue' },
  sold_out: { label: 'Habis Terjual', variant: 'green' },
  inactive: { label: 'Nonaktif',    variant: 'gray' },
}

const emptyForm: ProjectCreate = { name: '', city: '', province: '', address: '', total_units: undefined, status: 'selling' }

export default function Projects() {
  const navigate = useNavigate()
  // ── Bagikan Siteplan ke agen (tautan bertoken, tanpa login) ──
  const [shareProject, setShareProject] = useState<Project | null>(null)
  const [links, setLinks] = useState<SiteplanShareLink[]>([])
  const [shareLabel, setShareLabel] = useState('')
  const [shareDays, setShareDays] = useState(30)
  const [sharePrice, setSharePrice] = useState(true)
  const [shareSaving, setShareSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function openShare(p: Project) {
    setShareProject(p); setShareLabel(''); setShareDays(30); setSharePrice(true); setLinks([])
    try { setLinks(await propertyService.listSiteplanShareLinks(p.id)) } catch { /* diam */ }
  }
  async function createShareLink() {
    if (!shareProject) return
    setShareSaving(true)
    try {
      await propertyService.createSiteplanShareLink({
        project_id: shareProject.id, label: shareLabel.trim() || undefined,
        show_price: sharePrice, expires_days: shareDays,
      })
      setLinks(await propertyService.listSiteplanShareLinks(shareProject.id))
      setShareLabel('')
    } catch { /* toast global sudah menampilkan error */ } finally { setShareSaving(false) }
  }
  async function revokeShareLink(id: string) {
    if (!shareProject) return
    try {
      await propertyService.revokeSiteplanShareLink(id)
      setLinks(await propertyService.listSiteplanShareLinks(shareProject.id))
    } catch { /* diam */ }
  }
  const shareUrl = (token: string) => `${window.location.origin}/public/siteplan/${token}`
  function copyLink(id: string, token: string) {
    navigator.clipboard.writeText(shareUrl(token))
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000)
  }
  const { user } = useAuth()
  const canDelete = hasAnyRole(user, ['owner', 'admin'])  // hapus data properti = owner/admin
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
                        <button onClick={() => openShare(p)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Bagikan Siteplan ke agen">
                          <Share2 size={15} />
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
    
      {/* Bagikan Siteplan ke agen */}
      <Modal open={!!shareProject} onClose={() => setShareProject(null)} title={`Bagikan Siteplan — ${shareProject?.name ?? ''}`} size="lg">
        <p className="text-sm text-slate-500">
          Buat tautan yang bisa dibuka agen/mitra <b>tanpa akun</b> — mereka lihat siteplan &amp; status unit
          terkini, lalu bisa <b>mengajukan booking</b> (menunggu persetujuan Anda). Data pembeli tidak ditampilkan.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Untuk siapa (opsional)</label>
            <input className="input" placeholder="mis. Agen Budi / Kantor XYZ" value={shareLabel} onChange={(e) => setShareLabel(e.target.value)} />
          </div>
          <div>
            <label className="label">Berlaku (hari)</label>
            <input className="input" type="number" min={1} max={365} value={shareDays} onChange={(e) => setShareDays(Number(e.target.value))} />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={sharePrice} onChange={(e) => setSharePrice(e.target.checked)} className="rounded border-slate-300" />
          Tampilkan harga unit di tautan
        </label>
        <div className="mt-3 flex justify-end">
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={createShareLink} disabled={shareSaving}>
            {shareSaving ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Buat Tautan
          </button>
        </div>

        {links.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tautan proyek ini</p>
            <div className="card divide-y divide-slate-100">
              {links.map((l) => (
                <div key={l.id} className="px-3 py-2.5 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 truncate">
                      {l.label || 'Tanpa label'}
                      {!l.show_price && <span className="ml-2 text-[10px] text-slate-400">(tanpa harga)</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      {l.is_active ? `Aktif s/d ${new Date(l.expires_at).toLocaleDateString('id-ID')}` : 'Tidak aktif'}
                      {' · '}{l.access_count}x dibuka
                    </p>
                  </div>
                  {l.is_active && (
                    <>
                      <button onClick={() => copyLink(l.id, l.token)} className="flex items-center gap-1 text-brand-600 hover:underline text-xs">
                        {copiedId === l.id ? <><Check size={13} /> Tersalin</> : <><Copy size={13} /> Salin</>}
                      </button>
                      <a href={shareUrl(l.token)} target="_blank" rel="noopener" className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-xs">
                        <ExternalLink size={13} /> Buka
                      </a>
                      <button onClick={() => revokeShareLink(l.id)} className="flex items-center gap-1 text-slate-400 hover:text-red-600 text-xs">
                        <Trash2 size={13} /> Cabut
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
</div>
  )
}
