import { useEffect, useState, useCallback, useRef } from 'react'
import { FileCheck, Plus, Trash2, Pencil, Loader2, Upload, Eye } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { propertyService } from '../../services/property'
import { documentService } from '../../services/document'
import type { Project, Unit, DocumentItem, DocumentCreate, DocStatus } from '../../types'

const LEGAL_PRESETS = ['Sertifikat SHM', 'Sertifikat HGB', 'SLF', 'IMB / PBG', 'PBB']
const docStatusCfg: Record<DocStatus, { label: string; variant: 'gray' | 'yellow' | 'green' }> = {
  belum:  { label: 'Belum Ada', variant: 'gray' },
  proses: { label: 'Proses',    variant: 'yellow' },
  terbit: { label: 'Terbit',    variant: 'green' },
}

const unitLabel = (u?: Unit) => u ? [u.block, u.unit_number].filter(Boolean).join('-') : ''
const emptyDoc = (): Omit<DocumentCreate, 'unit_id'> => ({ doc_type: '', name: '', status: 'belum', doc_date: '' })

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
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pendingUpload = useRef<string | null>(null)

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
    setForm({ doc_type: d.doc_type, name: d.name ?? '', status: d.status, doc_date: d.doc_date ?? '' })
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
            <button className="btn-primary text-xs flex items-center gap-1" onClick={openCreate}><Plus size={13} /> Tambah Dokumen</button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Jenis', 'Keterangan', 'Status', 'File', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada dokumen legalitas untuk unit ini.</td></tr>
              ) : docs.map((d) => {
                const st = docStatusCfg[d.status]
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{d.doc_type}</td>
                    <td className="px-4 py-2.5 text-slate-500">{d.name ?? '—'}</td>
                    <td className="px-4 py-2.5">{st && <Badge label={st.label} variant={st.variant} />}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {d.has_file && (
                          <button onClick={() => documentService.openFile(d.id)} className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs" title={d.file_name}>
                            <Eye size={13} /> Lihat
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
            <label className="label">Keterangan</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
          <p className="text-xs text-slate-400">File bisa diupload dari tombol Upload di tabel setelah dokumen dibuat (maks 10 MB).</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
