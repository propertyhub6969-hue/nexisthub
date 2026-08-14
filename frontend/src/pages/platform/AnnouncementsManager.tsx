import { useEffect, useState } from 'react'
import { Loader2, Megaphone, Trash2, Plus, Eye, EyeOff } from 'lucide-react'
import { announcementService } from '../../services/announcement'
import type { AnnouncementAdmin, AnnouncementCreate, AnnouncementKind } from '../../types'

const KIND_LABEL: Record<AnnouncementKind, string> = { feature: 'Fitur Baru', info: 'Info', warning: 'Perhatian' }
const KIND_CLS: Record<AnnouncementKind, string> = {
  feature: 'bg-indigo-50 text-indigo-700', info: 'bg-blue-50 text-blue-700', warning: 'bg-amber-50 text-amber-700',
}
const emptyForm = (): AnnouncementCreate => ({ title: '', body: '', kind: 'feature', is_active: true })

export default function AnnouncementsManager() {
  const [rows, setRows] = useState<AnnouncementAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<AnnouncementCreate>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const load = () => { setLoading(true); announcementService.list().then(setRows).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(load, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) return
    setSaving(true)
    try { await announcementService.create(form); setForm(emptyForm()); setOpen(false); load() } finally { setSaving(false) }
  }
  const toggle = async (a: AnnouncementAdmin) => { await announcementService.update(a.id, { is_active: !a.is_active }); load() }
  const remove = async (a: AnnouncementAdmin) => { if (confirm(`Hapus pengumuman "${a.title}"?`)) { await announcementService.remove(a.id); load() } }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Megaphone size={18} /> Pengumuman ke Semua Tenant</h2>
        <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => { setForm(emptyForm()); setOpen((v) => !v) }}>
          <Plus size={15} /> Buat Pengumuman
        </button>
      </div>
      <p className="text-xs text-slate-500 -mt-1">Muncul sebagai popup "Kabar Terbaru" untuk setiap pengguna di semua tenant, sekali per orang.</p>

      {open && (
        <form onSubmit={submit} className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="sm:col-span-3">
              <label className="label">Judul</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} required />
            </div>
            <div>
              <label className="label">Jenis</label>
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AnnouncementKind })}>
                <option value="feature">Fitur Baru</option>
                <option value="info">Info</option>
                <option value="warning">Perhatian</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Isi</label>
            <textarea className="input min-h-[80px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required
              placeholder="Contoh: Kini tersedia Ekualisasi Pajak di menu Laporan — sandingkan Penjualan dengan DPP PPh & PPN…" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-1.5" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />} Terbitkan
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-6 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-slate-400 text-sm">Belum ada pengumuman.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((a) => (
            <div key={a.id} className="flex items-start gap-3 py-2.5">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_CLS[a.kind]}`}>{KIND_LABEL[a.kind]}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${a.is_active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{a.title}</p>
                <p className="text-xs text-slate-500 line-clamp-1">{a.body}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {new Date(a.created_at).toLocaleDateString('id-ID')} · sudah dilihat & ditutup {a.dismiss_count} orang
                </p>
              </div>
              <button className="text-slate-400 hover:text-slate-700 p-1" title={a.is_active ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggle(a)}>
                {a.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              <button className="text-slate-400 hover:text-red-600 p-1" title="Hapus" onClick={() => remove(a)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
