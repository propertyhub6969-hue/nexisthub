import { useEffect, useState, useCallback, useRef } from 'react'
import { FileCheck, Plus, Trash2, Pencil, Loader2, Upload, Eye, ListChecks, Paperclip, X } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { propertyService } from '../../services/property'
import { documentService } from '../../services/document'
import type { Project, Unit, DocumentItem, DocumentCreate, DocumentBulkItem, DocStatus } from '../../types'

const LEGAL_PRESETS = ['Sertifikat SHM', 'Sertifikat HGB', 'SLF', 'IMB / PBG', 'PBB']
// Checklist default untuk entry cepat (SHM & HGB alternatif; user isi yang relevan)
const CHECKLIST_PRESETS = ['Sertifikat SHM', 'SLF', 'IMB / PBG', 'PBB']
const isSertifikat = (t: string) => /shm|hgb|sertifikat/i.test(t)

interface ChecklistRow {
  doc_type: string
  name: string
  status: DocStatus
  doc_date: string
  land_area?: number
  file?: File | null
  custom?: boolean
}
const rowFilled = (r: ChecklistRow) =>
  r.status !== 'belum' || !!r.name.trim() || !!r.file || r.land_area != null
const docStatusCfg: Record<DocStatus, { label: string; variant: 'gray' | 'yellow' | 'green' }> = {
  belum:  { label: 'Belum Ada', variant: 'gray' },
  proses: { label: 'Proses',    variant: 'yellow' },
  terbit: { label: 'Terbit',    variant: 'green' },
}

const unitLabel = (u?: Unit) => u ? [u.block, u.unit_number].filter(Boolean).join('-') : ''
const emptyDoc = (): Omit<DocumentCreate, 'unit_id'> => ({ doc_type: '', name: '', status: 'belum', doc_date: '', land_area: undefined })

export default function LegalDocuments() {
  const [projects, setProjects] = useState<Project[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [projectId, setProjectId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [docs, setDocs] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Omit<DocumentCreate, 'unit_id'>>(emptyDoc())
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pendingUpload = useRef<string | null>(null)

  // Entry cepat / checklist
  const [checklistModal, setChecklistModal] = useState(false)
  const [rows, setRows] = useState<ChecklistRow[]>([])
  const [checklistSaving, setChecklistSaving] = useState(false)
  const [checklistMsg, setChecklistMsg] = useState('')

  async function viewFile(id: string) {
    setViewingId(id)
    try { await documentService.openFile(id) } catch { setError('Gagal membuka file.') } finally { setViewingId(null) }
  }

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => setError('Gagal memuat proyek.'))
  }, [])

  useEffect(() => {
    setUnitId(''); setUnits([]); setDocs([])
    if (!projectId) return
    propertyService.listUnits({ project_id: projectId, size: 500 }).then((r) => setUnits(r.items)).catch(() => setError('Gagal memuat unit.'))
  }, [projectId])

  const loadDocs = useCallback(async (uid: string) => {
    setLoading(true); setError('')
    try { setDocs(await documentService.listByUnit(uid)) }
    catch { setError('Gagal memuat dokumen.') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (unitId) loadDocs(unitId); else setDocs([])
  }, [unitId, loadDocs])

  function openCreate() { setEditId(null); setForm(emptyDoc()); setModal(true) }
  function openEdit(d: DocumentItem) {
    setEditId(d.id)
    setForm({ doc_type: d.doc_type, name: d.name ?? '', status: d.status, doc_date: d.doc_date ?? '', land_area: d.land_area })
    setModal(true)
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) {
        const p = { ...form }
        const rec = p as unknown as Record<string, unknown>
        ;['name', 'doc_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
        await documentService.update(editId, p)
      } else {
        const p: DocumentCreate = { ...form, unit_id: unitId }
        const rec = p as unknown as Record<string, unknown>
        ;['name', 'doc_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
        await documentService.create(p)
      }
      setModal(false); await loadDocs(unitId)
    } catch { setError('Gagal menyimpan dokumen.') } finally { setSaving(false) }
  }
  async function del(id: string) {
    if (!confirm('Hapus (arsipkan) dokumen ini?')) return
    try { await documentService.remove(id); await loadDocs(unitId) } catch { setError('Gagal menghapus dokumen.') }
  }
  function triggerUpload(id: string) { pendingUpload.current = id; fileInput.current?.click() }
  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; const id = pendingUpload.current
    e.target.value = ''
    if (!file || !id) return
    setUploadingId(id)
    try { await documentService.uploadFile(id, file); await loadDocs(unitId) }
    catch { setError('Gagal upload file (maks 10 MB).') } finally { setUploadingId(null) }
  }

  // ── Entry cepat / checklist ──
  function openChecklist() {
    // baris preset yang BELUM ada untuk unit ini (yang sudah ada tetap dikelola di tabel)
    const existingTypes = new Set(docs.map((d) => d.doc_type.trim().toLowerCase()))
    const preset: ChecklistRow[] = CHECKLIST_PRESETS
      .filter((t) => !existingTypes.has(t.trim().toLowerCase()))
      .map((t) => ({ doc_type: t, name: '', status: 'belum', doc_date: '', file: null }))
    setRows(preset.length ? preset : [{ doc_type: '', name: '', status: 'belum', doc_date: '', file: null, custom: true }])
    setChecklistMsg('')
    setChecklistModal(true)
  }
  function setRow(i: number, patch: Partial<ChecklistRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, { doc_type: '', name: '', status: 'belum', doc_date: '', file: null, custom: true }])
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function submitChecklist(e: React.FormEvent) {
    e.preventDefault()
    const filled = rows.filter((r) => r.doc_type.trim() && rowFilled(r))
    if (filled.length === 0) { setChecklistMsg('Isi minimal satu baris (status/nomor/file).'); return }
    setChecklistSaving(true); setError('')
    try {
      const items: DocumentBulkItem[] = filled.map((r) => {
        const it: DocumentBulkItem = { doc_type: r.doc_type.trim(), status: r.status }
        if (r.name.trim()) it.name = r.name.trim()
        if (r.doc_date) it.doc_date = r.doc_date
        if (r.land_area != null) it.land_area = r.land_area
        return it
      })
      const created = await documentService.bulkCreate({ unit_id: unitId, items })
      // upload file per baris yang melampirkan file (match by doc_type)
      let uploaded = 0
      for (const r of filled) {
        if (!r.file) continue
        const doc = created.find((d) => d.doc_type.trim().toLowerCase() === r.doc_type.trim().toLowerCase())
        if (doc) { try { await documentService.uploadFile(doc.id, r.file); uploaded++ } catch { /* lanjut */ } }
      }
      await loadDocs(unitId)
      const withFile = filled.filter((r) => r.file).length
      setChecklistMsg(`${created.length} dokumen tersimpan${withFile ? `, ${uploaded}/${withFile} file terunggah` : ''}.`)
      setRows([])
    } catch {
      setError('Gagal menyimpan dokumen.')
    } finally {
      setChecklistSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Kelola dokumen legalitas per unit (SHM/HGB, SLF, IMB/PBG, PBB). Dokumen ini otomatis tampil di halaman pembeli unit terkait.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-56" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Pilih proyek...</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input w-56" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!projectId}>
          <option value="">{projectId ? 'Pilih unit...' : 'Pilih proyek dulu'}</option>
          {units.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)} {u.unit_type ? `(${u.unit_type})` : ''}</option>)}
        </select>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <input ref={fileInput} type="file" className="hidden" onChange={onFilePicked} />

      {!unitId ? (
        <div className="card p-10 text-center text-slate-400">
          <FileCheck size={30} className="mx-auto mb-2" />
          <p className="text-sm">Pilih proyek dan unit untuk mengelola dokumen legalitasnya.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileCheck size={15} /> Dokumen Legalitas — {unitLabel(units.find((u) => u.id === unitId))}
            </h2>
            <div className="flex items-center gap-2">
              <button className="btn-secondary text-xs flex items-center gap-1" onClick={openChecklist}><ListChecks size={13} /> Entry Cepat</button>
              <button className="btn-primary text-xs flex items-center gap-1" onClick={openCreate}><Plus size={13} /> Tambah Dokumen</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Jenis', 'Nomor', 'LT (m²)', 'Status', 'File', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada dokumen legalitas untuk unit ini.</td></tr>
              ) : docs.map((d) => {
                const st = docStatusCfg[d.status]
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{d.doc_type}</td>
                    <td className="px-4 py-2.5 text-slate-500">{d.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{d.land_area != null ? `${Number(d.land_area)} m²` : '—'}</td>
                    <td className="px-4 py-2.5">{st && <Badge label={st.label} variant={st.variant} />}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {d.has_file && (
                          <button onClick={() => viewFile(d.id)} disabled={viewingId === d.id} className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs disabled:opacity-60" title={d.file_name}>
                            {viewingId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Lihat
                          </button>
                        )}
                        <button onClick={() => triggerUpload(d.id)} className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-600 text-xs">
                          {uploadingId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {d.has_file ? 'Ganti' : 'Upload'}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openEdit(d)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => del(d.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Dokumen' : 'Tambah Dokumen Legalitas'}>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Jenis Dokumen *</label>
            <input className="input" required list="legal-presets" placeholder="SHM / SLF / IMB / PBB ..." value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} />
            <datalist id="legal-presets">{LEGAL_PRESETS.map((d) => <option key={d} value={d} />)}</datalist>
          </div>
          <div>
            <label className="label">Nomor</label>
            <input className="input" placeholder="Nomor dokumen (mis. no. SHM / IMB)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DocStatus })}>
                {(Object.keys(docStatusCfg) as DocStatus[]).map((k) => <option key={k} value={k}>{docStatusCfg[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tanggal</label>
              <input className="input" type="date" value={form.doc_date} onChange={(e) => setForm({ ...form, doc_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Luas Tanah / LT (m²)</label>
            <input className="input max-w-[240px]" type="number" min={0} step="0.01" placeholder="mis. 120"
              value={form.land_area ?? ''} onChange={(e) => setForm({ ...form, land_area: e.target.value ? Number(e.target.value) : undefined })} />
            <p className="text-xs text-slate-400 mt-1">Isi dari sertifikat (SHM/HGB). LT ini otomatis jadi Luas Tanah unit di Kelola Unit.</p>
          </div>
          <p className="text-xs text-slate-400">File bisa diupload dari tombol Upload di tabel setelah dokumen dibuat (maks 10 MB).</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Entry Cepat / Checklist */}
      <Modal open={checklistModal} onClose={() => setChecklistModal(false)} title="Entry Cepat Dokumen Legalitas" size="lg">
        <form onSubmit={submitChecklist} className="space-y-3">
          <p className="text-sm text-slate-500">
            Isi beberapa dokumen sekaligus untuk unit <b>{unitLabel(units.find((u) => u.id === unitId))}</b>. Hanya baris yang diisi (status/nomor/file) yang disimpan; jenis yang sudah ada akan diperbarui.
          </p>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {r.custom ? (
                    <input className="input flex-1" placeholder="Jenis dokumen..." list="legal-presets"
                      value={r.doc_type} onChange={(e) => setRow(i, { doc_type: e.target.value })} />
                  ) : (
                    <span className="font-medium text-slate-800 text-sm flex-1">{r.doc_type}</span>
                  )}
                  <button type="button" onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-600" title="Hapus baris"><X size={15} /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <select className="input" value={r.status} onChange={(e) => setRow(i, { status: e.target.value as DocStatus })}>
                    {(Object.keys(docStatusCfg) as DocStatus[]).map((k) => <option key={k} value={k}>{docStatusCfg[k].label}</option>)}
                  </select>
                  <input className="input" placeholder="Nomor" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                  <input className="input" type="date" value={r.doc_date} onChange={(e) => setRow(i, { doc_date: e.target.value })} />
                  {isSertifikat(r.doc_type) ? (
                    <input className="input" type="number" min={0} step="0.01" placeholder="LT (m²)"
                      value={r.land_area ?? ''} onChange={(e) => setRow(i, { land_area: e.target.value ? Number(e.target.value) : undefined })} />
                  ) : <div />}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer w-fit">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                    <Paperclip size={12} /> {r.file ? 'Ganti file' : 'Lampirkan file'}
                  </span>
                  {r.file && <span className="text-slate-600 truncate max-w-[180px]">{r.file.name}</span>}
                  <input type="file" className="hidden" onChange={(e) => setRow(i, { file: e.target.files?.[0] ?? null })} />
                </label>
              </div>
            ))}
          </div>

          <button type="button" onClick={addRow} className="text-sm text-brand-600 hover:underline flex items-center gap-1">
            <Plus size={13} /> Tambah baris dokumen
          </button>

          <p className="text-[11px] text-slate-400">LT pada sertifikat (SHM/HGB) otomatis jadi Luas Tanah unit. File maks 10 MB per dokumen.</p>
          {checklistMsg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{checklistMsg}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary text-sm" onClick={() => setChecklistModal(false)}>Tutup</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={checklistSaving}>
              {checklistSaving && <Loader2 size={14} className="animate-spin" />}Simpan Semua
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
