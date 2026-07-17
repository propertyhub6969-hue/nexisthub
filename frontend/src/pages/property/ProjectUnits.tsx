import { useEffect, useState, useCallback } from 'react'
import { today } from '../../utils/date'
import { useParams, Link } from 'react-router-dom'
import { Plus, Trash2, Pencil, Loader2, ArrowLeft, Map, FileSignature, Printer, Boxes, X } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import DateInput from '../../components/ui/DateInput'
import MoneyInput from '../../components/ui/MoneyInput'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { propertyService } from '../../services/property'
import { useAuth } from '../../context/AuthContext'
import { printBast } from '../../utils/bast'
import type { Project, Unit, UnitCreate, UnitStatus, UnitBulkGenerate, PriceItem } from '../../types'

const PRICE_PRESETS = ['Harga Dasar', 'Hook', 'Lebih Tanah', 'Lebih Bangunan', 'Booking Fee']

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
  const { user } = useAuth()
  const canDelete = user?.role === 'owner' || user?.role === 'admin'  // hapus data properti = owner/admin
  const [project, setProject] = useState<Project | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<UnitCreate>(emptyForm(projectId))
  const [priceRows, setPriceRows] = useState<PriceItem[]>([{ label: 'Harga Dasar', amount: 0 }])
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const priceTotal = priceRows.reduce((a, r) => a + (Number(r.amount) || 0), 0)

  // BAST
  const [bastModal, setBastModal] = useState(false)
  const [bastUnit, setBastUnit] = useState<Unit | null>(null)
  const [bastDate, setBastDate] = useState('')
  const [savingBast, setSavingBast] = useState(false)

  // Generate unit massal
  const emptyGen = (): UnitBulkGenerate => ({ project_id: projectId, block: '', start_number: 1, count: 10 })
  const [genModal, setGenModal] = useState(false)
  const [genForm, setGenForm] = useState<UnitBulkGenerate>(emptyGen())
  const [genSaving, setGenSaving] = useState(false)
  const [genMsg, setGenMsg] = useState('')

  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [counts, setCounts] = useState<Record<string, number>>({})

  const load = useCallback(async (pg: number, status: string) => {
    setLoading(true)
    setError('')
    try {
      const [proj, res, stats] = await Promise.all([
        propertyService.getProject(projectId),
        propertyService.listUnits({ project_id: projectId, status: status || undefined, page: pg, size: 25 }),
        propertyService.unitStats(projectId),
      ])
      setProject(proj)
      setUnits(res.items); setTotal(res.total); setPages(res.pages)
      setCounts(stats.by_status)
    } catch {
      setError('Gagal memuat data unit.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load(page, statusFilter) }, [load, page, statusFilter])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm(projectId))
    setPriceRows([{ label: 'Harga Dasar', amount: 0 }])
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
    // muat rincian; kalau belum ada, satu baris 'Harga Dasar' = harga lama
    setPriceRows(u.price_breakdown?.length ? u.price_breakdown.map((p) => ({ label: p.label, amount: Number(p.amount) })) : [{ label: 'Harga Dasar', amount: Number(u.price ?? 0) }])
    setModalOpen(true)
  }

  function setPriceRow(i: number, patch: Partial<PriceItem>) {
    setPriceRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addPriceRow() { setPriceRows((prev) => [...prev, { label: '', amount: 0 }]) }
  function removePriceRow(i: number) { setPriceRows((prev) => prev.filter((_, idx) => idx !== i)) }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm(projectId))
    setPriceRows([{ label: 'Harga Dasar', amount: 0 }])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const filled = priceRows.filter((r) => r.label.trim() && Number(r.amount) > 0)
      const payload: UnitCreate = { ...form, price: priceTotal, price_breakdown: filled }
      ;(['land_area', 'building_area'] as const).forEach((k) => { if (!payload[k]) delete payload[k] })
      const rec = payload as unknown as Record<string, unknown>
      ;['block', 'unit_type'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (editingId) {
        await propertyService.updateUnit(editingId, payload)
      } else {
        await propertyService.createUnit(payload)
      }
      closeModal()
      await load(page, statusFilter)
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
      await load(page, statusFilter)
    } catch {
      setError('Gagal menghapus unit.')
    }
  }

  // ── Generate unit massal ──
  function openGenerate() {
    setGenForm(emptyGen())
    setGenMsg('')
    setGenModal(true)
  }
  const genPad = String(Math.max(genForm.start_number, genForm.start_number + genForm.count - 1)).length
  const genFmt = (n: number) => `${genForm.block ? genForm.block.trim() + '-' : ''}${String(n).padStart(genPad, '0')}`
  const genPreview = genForm.count > 0
    ? `${genFmt(genForm.start_number)} … ${genFmt(genForm.start_number + genForm.count - 1)}`
    : '—'

  async function submitGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenSaving(true); setError('')
    try {
      const payload: UnitBulkGenerate = { ...genForm, block: genForm.block?.trim() || undefined }
      const rec = payload as unknown as Record<string, unknown>
      ;['unit_type', 'land_area', 'building_area', 'price'].forEach((k) => { if (!rec[k]) delete rec[k] })
      const res = await propertyService.bulkGenerateUnits(payload)
      await load(page, statusFilter)
      setGenMsg(`${res.created} unit dibuat${res.skipped ? `, ${res.skipped} dilewati (nomor sudah ada)` : ''}.`)
      // reset jumlah agar tidak sengaja generate ganda; biarkan modal terbuka menampilkan hasil
      setGenForm((f) => ({ ...f, start_number: f.start_number + f.count }))
    } catch {
      setError('Gagal generate unit.')
    } finally {
      setGenSaving(false)
    }
  }

  // ── BAST ──
  function openBast(u: Unit) {
    setBastUnit(u); setBastDate(u.bast_date ?? new Date().toISOString().slice(0, 10)); setBastModal(true)
  }
  async function submitBast(e: React.FormEvent) {
    e.preventDefault()
    if (!bastUnit) return
    setSavingBast(true); setError('')
    try {
      await propertyService.createBast(bastUnit.id, { bast_date: bastDate || undefined })
      setBastModal(false)
      await load(page, statusFilter)
    } catch { setError('Gagal membuat BAST.') } finally { setSavingBast(false) }
  }
  function doPrintBast(u: Unit) {
    printBast({
      bastNumber: u.bast_number, bastDate: u.bast_date, petugas: u.bast_user_name ?? user?.full_name,
      buyer: u.buyer_name, project: project?.name, unit: [u.block, u.unit_number].filter(Boolean).join('-'),
      unitType: u.unit_type, landArea: u.land_area, buildingArea: u.building_area, price: u.price,
    })
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
        <div className="flex items-center gap-2">
          <Link to={`/property/projects/${projectId}/siteplan`} className="btn-secondary flex items-center gap-2 text-sm">
            <Map size={14} />
            Siteplan
          </Link>
          <button className="btn-secondary flex items-center gap-2 text-sm" onClick={openGenerate}>
            <Boxes size={14} />
            Generate Massal
          </button>
          <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreate}>
            <Plus size={14} />
            Tambah Unit
          </button>
        </div>
      </div>

      {/* Ringkasan status (klik untuk filter) */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setStatusFilter(''); setPage(1) }}
          className={`card px-3 py-2 text-sm ${statusFilter === '' ? 'ring-2 ring-brand-500' : ''}`}>
          Semua <span className="font-semibold">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
        </button>
        {(Object.keys(statusConfig) as UnitStatus[]).map((k) => (
          <button key={k} onClick={() => { setStatusFilter(statusFilter === k ? '' : k); setPage(1) }}
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
              {['Blok', 'No. Unit', 'Tipe', 'LT / LB', 'Harga', 'Status', 'BAST', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : units.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">{statusFilter ? 'Tidak ada unit dengan status ini.' : 'Belum ada unit. Klik "Tambah Unit".'}</td></tr>
            ) : (
              units.map((u) => {
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
                      {u.bast_number ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">{u.bast_number}</span>
                          <button onClick={() => doPrintBast(u)} className="text-slate-400 hover:text-brand-600" title="Cetak BAST"><Printer size={14} /></button>
                        </div>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openBast(u)} className="text-slate-400 hover:text-emerald-600 transition-colors" title={u.bast_number ? 'Ubah BAST' : 'Serah Terima (BAST)'}>
                          <FileSignature size={15} />
                        </button>
                        <button onClick={() => openEdit(u)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Edit">
                          <Pencil size={15} />
                        </button>
                        {canDelete && (
                          <button onClick={() => handleDelete(u.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus">
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
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
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
              <input className="input bg-slate-50 text-slate-500" type="number" value={form.land_area ?? ''} readOnly title="Diambil otomatis dari Dokumen Legalitas unit" />
              <p className="text-[11px] text-slate-400 mt-1">Otomatis dari Dokumen Legalitas (SHM). Ubah di menu Properti → Dokumen Legalitas.</p>
            </div>
            <div>
              <label className="label">LB (m²)</label>
              <input className="input" type="number" min={0} value={form.building_area ?? ''} onChange={(e) => setForm({ ...form, building_area: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </div>
          {/* Rincian Harga (Harga Dasar, Hook, Lebih Tanah, Booking Fee, dll) */}
          <div>
            <label className="label">Rincian Harga (Rp)</label>
            <datalist id="price-presets">{PRICE_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
            <div className="space-y-2">
              {priceRows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input flex-1" list="price-presets" placeholder="Komponen (mis. Hook)" value={r.label} onChange={(e) => setPriceRow(i, { label: e.target.value })} />
                  <div className="w-40 shrink-0"><MoneyInput value={r.amount || undefined} onChange={(v) => setPriceRow(i, { amount: v ?? 0 })} /></div>
                  <button type="button" onClick={() => removePriceRow(i)} className="text-slate-400 hover:text-red-600 shrink-0" title="Hapus baris" disabled={priceRows.length === 1}><X size={16} /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <button type="button" onClick={addPriceRow} className="text-sm text-brand-600 hover:underline flex items-center gap-1"><Plus size={13} /> Tambah baris</button>
              <span className="text-sm font-semibold text-slate-900">Total: {fmt(priceTotal)}</span>
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input max-w-[240px]" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as UnitStatus })}>
              {/* Serah Terima diset lewat BAST, bukan manual — tampil hanya bila unit memang sudah handover */}
              {(Object.keys(statusConfig) as UnitStatus[]).filter((k) => k !== 'handover' || form.status === 'handover').map((k) => (
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

      {/* Modal BAST */}
      <Modal open={bastModal} onClose={() => setBastModal(false)} title={bastUnit?.bast_number ? 'Ubah BAST' : 'Buat BAST (Serah Terima)'}>
        <form onSubmit={submitBast} className="space-y-3">
          <p className="text-sm text-slate-500">
            Unit <b>{bastUnit ? [bastUnit.block, bastUnit.unit_number].filter(Boolean).join('-') : '—'}</b>
            {bastUnit?.buyer_name ? <> · pembeli <b>{bastUnit.buyer_name}</b></> : <span className="text-amber-600"> · belum ada pembeli terkait unit</span>}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tanggal BAST</label>
              <DateInput className="input" max={today()} value={bastDate} onChange={(v) => setBastDate(v)} />
            </div>
            <div>
              <label className="label">No. BAST</label>
              <p className="text-sm text-slate-500 py-2">{bastUnit?.bast_number ?? 'Dibuat otomatis setelah simpan'}</p>
            </div>
          </div>
          <div>
            <label className="label">Petugas (Yang Menyerahkan)</label>
            <input className="input bg-slate-50" value={bastUnit?.bast_user_name ?? user?.full_name ?? '—'} readOnly title="Otomatis dari user yang login" />
          </div>
          <p className="text-xs text-slate-400">Menyimpan BAST akan menandai unit sebagai <b>Serah Terima</b>. Setelah tersimpan, BAST bisa dicetak dari kolom BAST.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setBastModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={savingBast}>
              {savingBast && <Loader2 size={14} className="animate-spin" />}Simpan BAST
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Generate Unit Massal */}
      <Modal open={genModal} onClose={() => setGenModal(false)} title="Generate Unit Massal">
        <form onSubmit={submitGenerate} className="space-y-3">
          <p className="text-sm text-slate-500">
            Buat banyak unit sekaligus. Nomor yang sudah ada di blok yang sama otomatis dilewati (tak menimpa unit lama).
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Blok / Cluster</label>
              <input className="input" placeholder="A (opsional)" value={genForm.block ?? ''} onChange={(e) => setGenForm({ ...genForm, block: e.target.value })} />
            </div>
            <div>
              <label className="label">Nomor mulai *</label>
              <input className="input" type="number" min={1} required value={genForm.start_number}
                onChange={(e) => setGenForm({ ...genForm, start_number: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
            <div>
              <label className="label">Jumlah unit *</label>
              <input className="input" type="number" min={1} max={500} required value={genForm.count}
                onChange={(e) => setGenForm({ ...genForm, count: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
            Akan dibuat <b>{genForm.count}</b> unit: <b>{genPreview}</b>
          </div>

          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider pt-1">Nilai default (opsional, sama untuk semua unit)</p>
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="label">Tipe</label>
              <input className="input" placeholder="36/72" value={genForm.unit_type ?? ''} onChange={(e) => setGenForm({ ...genForm, unit_type: e.target.value })} />
            </div>
            <div>
              <label className="label">LT (m²)</label>
              <input className="input" type="number" min={0} value={genForm.land_area ?? ''}
                onChange={(e) => setGenForm({ ...genForm, land_area: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <label className="label">LB (m²)</label>
              <input className="input" type="number" min={0} value={genForm.building_area ?? ''}
                onChange={(e) => setGenForm({ ...genForm, building_area: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </div>
          <div>
            <label className="label">Harga (Rp)</label>
            <MoneyInput value={genForm.price} onChange={(v) => setGenForm({ ...genForm, price: v })} />
          </div>
          <p className="text-[11px] text-slate-400">LT bisa disinkron ulang otomatis dari Dokumen Legalitas (SHM) nanti. Semua unit dibuat berstatus <b>Tersedia</b>.</p>

          {genMsg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{genMsg}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setGenModal(false)}>Tutup</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={genSaving}>
              {genSaving && <Loader2 size={14} className="animate-spin" />}Generate {genForm.count} Unit
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
