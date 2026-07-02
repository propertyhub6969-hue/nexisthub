import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Upload, ImageOff, Trash2, Save, MapPin, Eye, Pencil } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { propertyService } from '../../services/property'
import type { Project, Unit, UnitStatus } from '../../types'

const statusConfig: Record<UnitStatus, { label: string; dot: string; variant: 'green' | 'yellow' | 'blue' | 'orange' }> = {
  available: { label: 'Tersedia',     dot: 'bg-emerald-500', variant: 'green' },
  booked:    { label: 'Booking/DP',   dot: 'bg-amber-500',   variant: 'yellow' },
  sold:      { label: 'Akad/Terjual', dot: 'bg-blue-600',    variant: 'blue' },
  handover:  { label: 'Serah Terima', dot: 'bg-orange-500',  variant: 'orange' },
}

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

type Pos = { x: number; y: number }

export default function Siteplan() {
  const { projectId = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [pos, setPos] = useState<Record<string, Pos>>({})
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [selectedUnplaced, setSelectedUnplaced] = useState<string | null>(null)
  const [activeUnit, setActiveUnit] = useState<Unit | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const mapRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<string | null>(null)
  const movedRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
      const p: Record<string, Pos> = {}
      res.items.forEach((u) => {
        if (u.position_x != null && u.position_y != null) p[u.id] = { x: Number(u.position_x), y: Number(u.position_y) }
      })
      setPos(p)
      if (proj.has_siteplan) {
        const url = await propertyService.getSiteplanUrl(projectId)
        setImgUrl(url)
      }
    } catch {
      setError('Gagal memuat data siteplan.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])
  // Bersihkan object URL saat berganti/unmount
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl) }, [imgUrl])

  const placed = units.filter((u) => pos[u.id])
  const unplaced = units.filter((u) => !pos[u.id])

  function pctFromEvent(clientX: number, clientY: number): Pos {
    const rect = mapRef.current!.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    return { x: Math.max(0, Math.min(100, +x.toFixed(2))), y: Math.max(0, Math.min(100, +y.toFixed(2))) }
  }

  // ── Drag marker (edit mode) ──
  function startDrag(e: React.MouseEvent, unitId: string) {
    if (mode !== 'edit') return
    e.stopPropagation()
    e.preventDefault()
    draggingRef.current = unitId
    movedRef.current = false
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', endDrag)
  }
  function onDrag(e: MouseEvent) {
    const id = draggingRef.current
    if (!id || !mapRef.current) return
    movedRef.current = true
    const np = pctFromEvent(e.clientX, e.clientY)
    setPos((prev) => ({ ...prev, [id]: np }))
  }
  function endDrag() {
    if (draggingRef.current && movedRef.current) setDirty(true)
    draggingRef.current = null
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', endDrag)
  }

  // ── Klik peta: taruh unit yang dipilih dari tray ──
  function onMapClick(e: React.MouseEvent) {
    if (mode !== 'edit' || !selectedUnplaced) return
    const np = pctFromEvent(e.clientX, e.clientY)
    const id = selectedUnplaced
    setPos((prev) => ({ ...prev, [id]: np }))
    setSelectedUnplaced(null)
    setDirty(true)
  }

  function onMarkerClick(e: React.MouseEvent, u: Unit) {
    e.stopPropagation()
    if (mode === 'edit') return          // di mode atur, klik = drag, bukan info
    if (movedRef.current) return
    setActiveUnit(u)
  }

  function removePlacement(unitId: string) {
    setPos((prev) => { const n = { ...prev }; delete n[unitId]; return n })
    setDirty(true)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await propertyService.uploadSiteplan(projectId, file)
      if (imgUrl) URL.revokeObjectURL(imgUrl)
      const url = await propertyService.getSiteplanUrl(projectId)
      setImgUrl(url)
      setProject((p) => (p ? { ...p, has_siteplan: true } : p))
    } catch {
      setError('Gagal mengunggah gambar. Pastikan berupa gambar (maks 8 MB).')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteImage() {
    if (!confirm('Hapus gambar siteplan? Posisi unit tetap tersimpan.')) return
    try {
      await propertyService.deleteSiteplan(projectId)
      if (imgUrl) URL.revokeObjectURL(imgUrl)
      setImgUrl(null)
      setProject((p) => (p ? { ...p, has_siteplan: false } : p))
    } catch {
      setError('Gagal menghapus gambar.')
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = units.map((u) => ({
        unit_id: u.id,
        position_x: pos[u.id]?.x ?? null,
        position_y: pos[u.id]?.y ?? null,
      }))
      await propertyService.saveUnitPositions(projectId, payload)
      setDirty(false)
    } catch {
      setError('Gagal menyimpan posisi.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-slate-400"><Loader2 size={22} className="inline animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/property/projects/${projectId}/units`} className="text-slate-400 hover:text-slate-600" title="Kembali ke Unit">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Siteplan — {project?.name}</h2>
            <p className="text-xs text-slate-400">{placed.length} unit terpetakan · {unplaced.length} belum</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => { setMode('view'); setSelectedUnplaced(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${mode === 'view' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            ><Eye size={14} /> Lihat</button>
            <button
              onClick={() => { setMode('edit'); setActiveUnit(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${mode === 'edit' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            ><Pencil size={14} /> Atur</button>
          </div>
          {mode === 'edit' && (
            <button onClick={handleSave} disabled={!dirty || saving}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan Posisi
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {/* Legend + upload actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          {(Object.keys(statusConfig) as UnitStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${statusConfig[s].dot}`} /> {statusConfig[s].label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="btn-secondary flex items-center gap-2 text-sm">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {imgUrl ? 'Ganti Gambar' : 'Unggah Siteplan'}
          </button>
          {imgUrl && (
            <button onClick={handleDeleteImage} className="btn-secondary flex items-center gap-2 text-sm text-red-600">
              <Trash2 size={14} /> Hapus Gambar
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Map */}
        <div className="flex-1 card p-3">
          {!imgUrl ? (
            <div className="py-24 text-center text-slate-400">
              <ImageOff size={32} className="mx-auto mb-2" />
              <p className="text-sm">Belum ada gambar siteplan.</p>
              <p className="text-xs mt-1">Unggah gambar denah proyek, lalu atur posisi tiap unit di atasnya.</p>
            </div>
          ) : (
            <div
              ref={mapRef}
              onClick={onMapClick}
              className={`relative w-full select-none ${mode === 'edit' && selectedUnplaced ? 'cursor-crosshair' : ''}`}
            >
              <img src={imgUrl} alt="Siteplan" className="w-full h-auto rounded-lg pointer-events-none" />
              {placed.map((u) => {
                const p = pos[u.id]
                const sc = statusConfig[u.status]
                return (
                  <button
                    key={u.id}
                    onMouseDown={(e) => startDrag(e, u.id)}
                    onClick={(e) => onMarkerClick(e, u)}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${sc.dot} text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-white shadow ring-1 ring-black/10 ${mode === 'edit' ? 'cursor-move' : 'cursor-pointer hover:scale-110'} transition-transform`}
                    title={`${u.block ? u.block + '-' : ''}${u.unit_number} · ${sc.label}`}
                  >
                    {u.block ? `${u.block}-` : ''}{u.unit_number}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar: unplaced units (edit mode) */}
        {mode === 'edit' && imgUrl && (
          <div className="w-64 card p-3 shrink-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Belum Dipetakan ({unplaced.length})
            </p>
            {unplaced.length === 0 ? (
              <p className="text-xs text-slate-400">Semua unit sudah dipetakan. 🎉</p>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-2">Klik unit lalu klik lokasinya di peta.</p>
                <div className="space-y-1 max-h-[60vh] overflow-auto">
                  {unplaced.map((u) => {
                    const sc = statusConfig[u.status]
                    const sel = selectedUnplaced === u.id
                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUnplaced(sel ? null : u.id)}
                        className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-sm ${sel ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-slate-50'}`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${sc.dot}`} />
                        <span className="text-slate-700">{u.block ? `${u.block}-` : ''}{u.unit_number}</span>
                        {sel && <MapPin size={13} className="ml-auto text-brand-500" />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            {placed.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
                Seret marker untuk memindah. Klik kanan tak dipakai — untuk melepas, pakai tombol di popup mode Lihat.
              </p>
            )}
          </div>
        )}
      </div>

      {/* View-mode unit popup */}
      {activeUnit && mode === 'view' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setActiveUnit(null)}>
          <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-900">
                {activeUnit.block ? `${activeUnit.block}-` : ''}{activeUnit.unit_number}
              </h3>
              <Badge label={statusConfig[activeUnit.status].label} variant={statusConfig[activeUnit.status].variant} />
            </div>
            <div className="p-5 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Tipe</span><span className="text-slate-800">{activeUnit.unit_type || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Luas Tanah</span><span className="text-slate-800">{activeUnit.land_area ? `${activeUnit.land_area} m²` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Luas Bangunan</span><span className="text-slate-800">{activeUnit.building_area ? `${activeUnit.building_area} m²` : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Harga</span><span className="font-medium text-slate-900">{fmt(activeUnit.price)}</span></div>
              <div className="pt-3">
                <Link to={`/property/projects/${projectId}/units`} className="btn-secondary text-sm w-full text-center block">
                  Buka daftar unit
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
