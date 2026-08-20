import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2, Star, Check, Tags } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import MoneyInput from '../../components/ui/MoneyInput'
import { platformService } from '../../services/platform'
import type { Plan, PlanInput } from '../../types'

const fmtRp = (n?: number | null) => n == null ? null : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const emptyPlan = (): PlanInput => ({ name: '', price: undefined, price_note: '/bulan', description: '', features: [], highlight: false, is_active: true, sort_order: 0 })

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<{ id?: string; data: PlanInput } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => { setLoading(true); platformService.listPlans().then(setPlans).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(load, [])

  const openNew = () => setEdit({ data: emptyPlan() })
  const openEdit = (p: Plan) => setEdit({ id: p.id, data: { name: p.name, price: p.price ?? undefined, price_note: p.price_note ?? '/bulan', description: p.description ?? '', features: p.features ?? [], highlight: p.highlight, is_active: p.is_active, sort_order: p.sort_order } })

  const save = async () => {
    if (!edit || !edit.data.name.trim()) return
    setSaving(true)
    try {
      const payload = { ...edit.data, features: (edit.data.features ?? []).filter((f) => f.trim()) }
      if (edit.id) await platformService.updatePlan(edit.id, payload)
      else await platformService.createPlan(payload)
      setEdit(null); load()
    } finally { setSaving(false) }
  }

  const del = async (p: Plan) => { if (confirm(`Hapus paket "${p.name}"?`)) { await platformService.deletePlan(p.id); load() } }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Tags size={20} /> Paket &amp; Harga</h1>
          <p className="text-sm text-slate-500">Katalog paket langganan NexistHub. Kelola sendiri — nama, harga, dan fitur.</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm inline-flex items-center gap-1.5"><Plus size={15} /> Paket Baru</button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : plans.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">Belum ada paket. Klik <b>Paket Baru</b>.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div key={p.id} className={`card p-5 flex flex-col ${p.highlight ? 'ring-2 ring-brand-400' : ''} ${!p.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-slate-900">{p.name}</h3>
                    {p.highlight && <span className="inline-flex items-center gap-0.5 text-[10px] bg-brand-50 text-brand-700 rounded-full px-2 py-0.5"><Star size={10} className="fill-brand-500 text-brand-500" /> Populer</span>}
                    {!p.is_active && <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">Nonaktif</span>}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-900">{fmtRp(p.price) ?? 'Khusus'}</span>
                    <span className="text-xs text-slate-400">{p.price_note}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-brand-600 p-1" title="Edit"><Pencil size={15} /></button>
                  <button onClick={() => del(p)} className="text-slate-400 hover:text-red-600 p-1" title="Hapus"><Trash2 size={15} /></button>
                </div>
              </div>
              {p.description && <p className="text-sm text-slate-500 mt-2">{p.description}</p>}
              <ul className="mt-3 space-y-1.5 flex-1">
                {(p.features ?? []).map((f, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-start gap-1.5"><Check size={14} className="text-emerald-500 mt-0.5 shrink-0" /> {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit Paket' : 'Paket Baru'} size="md">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Nama paket</label><input className="input" value={edit.data.name} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, name: e.target.value } })} /></div>
              <div><label className="label">Urutan</label><input type="number" className="input" value={edit.data.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, sort_order: Number(e.target.value) } })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Harga (kosongkan = khusus)</label><MoneyInput value={edit.data.price ?? undefined} onChange={(v) => setEdit({ ...edit, data: { ...edit.data, price: v } })} /></div>
              <div><label className="label">Keterangan harga</label><input className="input" value={edit.data.price_note ?? ''} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, price_note: e.target.value } })} placeholder="/bulan atau Hubungi kami" /></div>
            </div>
            <div><label className="label">Deskripsi singkat</label><input className="input" value={edit.data.description ?? ''} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, description: e.target.value } })} /></div>
            <div>
              <label className="label">Fitur (satu per baris)</label>
              <textarea className="input min-h-[120px]" value={(edit.data.features ?? []).join('\n')} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, features: e.target.value.split('\n') } })} placeholder={'Properti & unit\nKeuangan lengkap\ns/d 3 proyek'} />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer"><input type="checkbox" checked={!!edit.data.highlight} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, highlight: e.target.checked } })} /> Tandai "Populer"</label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer"><input type="checkbox" checked={edit.data.is_active !== false} onChange={(e) => setEdit({ ...edit, data: { ...edit.data, is_active: e.target.checked } })} /> Aktif</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary" onClick={() => setEdit(null)} disabled={saving}>Batal</button>
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : 'Simpan'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
