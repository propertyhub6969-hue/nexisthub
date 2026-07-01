import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, Loader2, Scale } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { taxService } from '../../services/tax'
import type { Notary, NotaryCreate } from '../../types'

const emptyForm: NotaryCreate = { name: '', office: '', phone: '', address: '' }

export default function Notaries() {
  const [items, setItems] = useState<Notary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<NotaryCreate>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await taxService.listNotaries()) }
    catch { setError('Gagal memuat data notaris.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  function openCreate() { setEditingId(null); setForm(emptyForm); setModalOpen(true) }
  function openEdit(n: Notary) {
    setEditingId(n.id)
    setForm({ name: n.name, office: n.office ?? '', phone: n.phone ?? '', address: n.address ?? '' })
    setModalOpen(true)
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...form }
      const rec = p as unknown as Record<string, unknown>
      ;['office', 'phone', 'address'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (editingId) await taxService.updateNotary(editingId, p)
      else await taxService.createNotary(p)
      setModalOpen(false); await load()
    } catch { setError('Gagal menyimpan notaris.') } finally { setSaving(false) }
  }
  async function handleDelete(id: string) {
    if (!confirm('Hapus (arsipkan) notaris ini?')) return
    try { await taxService.deleteNotary(id); setItems((p) => p.filter((n) => n.id !== id)) }
    catch { setError('Gagal menghapus notaris.') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Scale size={16} /> Notaris / PPAT Rekanan</h2>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreate}><Plus size={14} /> Tambah Notaris</button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>{['Nama', 'Kantor', 'No. HP', ''].map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada notaris. Tambahkan rekanan notaris/PPAT Anda.</td></tr>
            ) : items.map((n) => (
              <tr key={n.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{n.name}</td>
                <td className="px-4 py-3 text-slate-500">{n.office ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{n.phone ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => openEdit(n)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={15} /></button>
                    <button onClick={() => handleDelete(n.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Notaris' : 'Tambah Notaris'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Nama Notaris *</label>
            <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Nama Kantor / PPAT</label>
            <input className="input" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">No. HP</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Alamat</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
