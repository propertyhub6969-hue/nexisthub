import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Upload, ImageOff, Trash2, Save, MapPin, Eye, Pencil, LayoutGrid, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
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

// Tata semua unit dalam grid rapi (diurutkan per blok lalu nomor) sebagai posisi awal.
// Cocok untuk proyek besar (200+ unit) — developer tinggal geser yang perlu dirapikan.
function gridLayout(list: Unit[]): Record<string, Pos> {
  const n = list.length
  if (n === 0) return {}
  const sorted = [...list].sort((a, b) => {
    const bl = (a.block || '').localeCompare(b.block || '')
    if (bl !== 0) return bl
    return a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
  })
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6))) // sedikit melebar (denah umumnya landscape)
  const rows = Math.ceil(n / cols)
  const mX = 6, mY = 6
  const spanX = 100 - 2 * mX, spanY = 100 - 2 * mY
  const stepX = cols > 1 ? spanX / (cols - 1) : 0
  const stepY = rows > 1 ? spanY / (rows - 1) : 0
  const out: Record<string, Pos> = {}
  sorted.forEach((u, i) => {
    const r = Math.floor(i / cols), c = i % cols
    out[u.id] = {
      x: +(cols > 1 ? mX + c * stepX : 50).toFixed(2),
      y: +(rows > 1 ? mY + r * stepY : 50).toFixed(2),
    }
  })
  return out
}

// Perkecil gambar besar di sisi klien sebelum upload → transfer cepat & DB hemat.
// Denah tetap tajam: lebar maksimal 2200px, kualitas JPEG 0.85. File kecil dilewati.
async function downscaleImage(file: File): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const MAX_W = 2200
    if (bitmap.width <= MAX_W) { bitmap.close?.(); return file }
    const w = MAX_W
    const h = Math.round((bitmap.height * MAX_W) / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

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
  const [zoom, setZoom] = useState(100) // % lebar peta; 100 = pas dengan lebar kartu

  const zoomIn = () => setZoom((z) => Math.min(300, z + 25))
  const zoomOut = () => setZoom((z) => Math.max(50, z - 25))

  const mapRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<string | null>(null)
  const movedRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Ambil proyek, unit, dan gambar sekaligus (getSiteplanUrl → null bila belum ada)
      const [proj, res, url] = await Promise.all([
        propertyService.getProject(projectId),
        propertyService.listUnits({ project_id: projectId, size: 500 }),
        propertyService.getSiteplanUrl(projectId),
      ])
      setProject(proj)
      setUnits(res.items)
      const p: Record<string, Pos> = {}
      res.items.forEach((u) => {
        if (u.position_x != null && u.position_y != null) p[u.id] = { x: Number(u.position_x), y: Number(u.position_y) }
      })
      setPos(p)
      setImgUrl(url)
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
  const dense = placed.length > 80  // marker lebih ringkas untuk proyek padat

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

  function autoLayout() {
    const n = units.length
    if (!n) return
    if (!confirm(`Tata ${n} unit otomatis dalam grid? Posisi yang sudah diatur akan ditimpa.`)) return
    setPos(gridLayout(units))
    setSelectedUnplaced(null)
    setDirty(true)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const toUpload = await downscaleImage(file)
      await propertyService.uploadSiteplan(projectId, toUpload)
      if (imgUrl) URL.revokeObjectURL(imgUrl)
      // Pakai file lokal untuk pratinjau — tak perlu unduh ulang dari server
      setImgUrl(URL.createObjectURL(toUpload))
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
            <>
              <button onClick={autoLayout} disabled={units.length === 0}
                className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                title="Tata semua unit dalam grid otomatis">
                <LayoutGrid size={14} /> Tata Otomatis
              </button>
              <button onClick={handleSave} disabled={!dirty || saving}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan Posisi
              </button>
            </>
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
        <div className="flex-1 card p-3 relative">
          {imgUrl && (
            <div className="absolute top-5 right-5 z-10 flex items-center gap-0.5 bg-white/95 backdrop-blur rounded-lg border border-slate-200 shadow-sm p-1">
              <button onClick={zoomOut} disabled={zoom <= 50} className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 text-slate-600 transition-colors" title="Perkecil">
                <ZoomOut size={15} />
              </button>
              <span className="text-xs font-medium text-slate-500 w-10 text-center select-none">{zoom}%</span>
              <button onClick={zoomIn} disabled={zoom >= 300} className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 text-slate-600 transition-colors" title="Perbesar">
                <ZoomIn size={15} />
              </button>
              {zoom !== 100 && (
                <button onClick={() => setZoom(100)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors" title="Reset Zoom">
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          )}
          {!imgUrl ? (
            <div className="py-24 text-center text-slate-400">
              <ImageOff size={32} className="mx-auto mb-2" />
              <p className="text-sm">Belum ada gambar siteplan.</p>
              <p className="text-xs mt-1">Unggah gambar denah proyek, lalu atur posisi tiap unit di atasnya.</p>
            </div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
              <div
                ref={mapRef}
                onClick={onMapClick}
                style={{ width: `${zoom}%` }}
                className={`relative select-none ${mode === 'edit' && selectedUnplaced ? 'cursor-crosshair' : ''}`}
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
                      className={`absolute -translate-x-1/2 -translate-y-1/2 ${sc.dot} text-white font-semibold rounded-md border border-white shadow ring-1 ring-black/10 ${dense ? 'text-[8px] px-1 py-0 leading-tight' : 'text-[10px] px-1.5 py-0.5'} ${mode === 'edit' ? 'cursor-move' : 'cursor-pointer hover:scale-110'} transition-transform`}
                      title={`${u.block ? u.block + '-' : ''}${u.unit_number} · ${sc.label}`}
                    >
                      {dense ? u.unit_number : `${u.block ? `${u.block}-` : ''}${u.unit_number}`}
                    </button>
                  )
                })}
              </div>
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
