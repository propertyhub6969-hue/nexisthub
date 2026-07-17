import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, FileCheck, Upload, Download, Trash2, Pencil, Link2, Layers, History } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import DateInput from '../../components/ui/DateInput'
import { propertyService } from '../../services/property'
import { documentService } from '../../services/document'
import type {
  Project, Unit, DocumentItem, DocumentCreate, DocStatus,
  SplitBatch, SplitBatchStatus, SplitBatchUpdate,
  DocumentProgressLog, ProgressLogCreate, ProgressEvent,
} from '../../types'

const docStatusCfg: Record<DocStatus, { label: string; variant: 'gray' | 'yellow' | 'green' }> = {
  belum:  { label: 'Belum Ada', variant: 'gray' },
  proses: { label: 'Proses',    variant: 'yellow' },
  terbit: { label: 'Terbit',    variant: 'green' },
}

const progressEventCfg: Record<ProgressEvent, { label: string; variant: 'gray' | 'yellow' | 'orange' | 'red' | 'green' }> = {
  diajukan: { label: 'Diajukan', variant: 'gray' },
  diproses: { label: 'Diproses', variant: 'yellow' },
  revisi:   { label: 'Revisi',   variant: 'orange' },
  ditolak:  { label: 'Ditolak',  variant: 'red' },
  terbit:   { label: 'Terbit',   variant: 'green' },
}

const emptyProgressForm = (): ProgressLogCreate => ({ event: 'diajukan', event_date: '', institution: '', notes: '' })

const batchStatusCfg: Record<SplitBatchStatus, { label: string; variant: 'gray' | 'yellow' | 'blue' | 'green' | 'red' }> = {
  diajukan:   { label: 'Diajukan',    variant: 'gray' },
  pengukuran: { label: 'Pengukuran',  variant: 'yellow' },
  sk_terbit:  { label: 'SK Terbit',   variant: 'blue' },
  selesai:    { label: 'Selesai',     variant: 'green' },
  ditolak:    { label: 'Ditolak',     variant: 'red' },
}

const DOC_TYPE_SUGGESTIONS = ['KKPR', 'Izin Lingkungan', 'PBG', 'SLF', 'HGB Induk', 'SHM Induk']

const emptyDocForm = (): DocumentCreate => ({ project_id: '', doc_type: '', name: '', status: 'belum', doc_date: '', expiry_date: '', notes: '' })

export default function LegalSplitting() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [docs, setDocs] = useState<DocumentItem[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [batches, setBatches] = useState<SplitBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── modal: perizinan/sertifikat (Document project-level) ──
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [docForm, setDocForm] = useState<DocumentCreate>(emptyDocForm())
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [savingDoc, setSavingDoc] = useState(false)

  // ── modal: buat batch ──
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchMasterId, setBatchMasterId] = useState('')
  const [batchUnitIds, setBatchUnitIds] = useState<string[]>([])
  const [batchNotes, setBatchNotes] = useState('')
  const [savingBatch, setSavingBatch] = useState(false)

  // ── modal: detail batch ──
  const [detailBatch, setDetailBatch] = useState<SplitBatch | null>(null)
  const [unitDocsCache, setUnitDocsCache] = useState<Record<string, DocumentItem[]>>({})

  // ── modal: riwayat tahapan proses dokumen ──
  const [progressDoc, setProgressDoc] = useState<DocumentItem | null>(null)
  const [progressLogs, setProgressLogs] = useState<DocumentProgressLog[]>([])
  const [progressForm, setProgressForm] = useState<ProgressLogCreate>(emptyProgressForm())
  const [loadingProgress, setLoadingProgress] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [proj, docList, unitRes, batchList] = await Promise.all([
        propertyService.getProject(projectId),
        documentService.listByProject(projectId),
        propertyService.listUnits({ project_id: projectId, size: 500 }),
        documentService.listSplitBatches(projectId),
      ])
      setProject(proj)
      setDocs(docList)
      setUnits(unitRes.items)
      setBatches(batchList)
    } catch {
      setError('Gagal memuat data legal & perizinan.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  // ── Perizinan / Sertifikat (Document) ──
  function openCreateDoc() {
    setEditingDocId(null)
    setDocForm(emptyDocForm())
    setDocModalOpen(true)
  }
  function openEditDoc(d: DocumentItem) {
    setEditingDocId(d.id)
    setDocForm({
      project_id: projectId, doc_type: d.doc_type, name: d.name ?? '', status: d.status,
      doc_date: d.doc_date ?? '', expiry_date: d.expiry_date ?? '', notes: d.notes ?? '',
    })
    setDocModalOpen(true)
  }
  async function handleSaveDoc(e: React.FormEvent) {
    e.preventDefault()
    setSavingDoc(true)
    try {
      const payload: DocumentCreate = { ...docForm, project_id: projectId }
      const rec = payload as unknown as Record<string, unknown>
      ;['name', 'doc_date', 'expiry_date', 'notes'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (editingDocId) {
        await documentService.update(editingDocId, payload)
      } else {
        await documentService.create(payload)
      }
      setDocModalOpen(false)
      await load()
    } catch {
      setError('Gagal menyimpan dokumen.')
    } finally {
      setSavingDoc(false)
    }
  }
  async function handleDeleteDoc(id: string) {
    if (!confirm('Hapus dokumen ini?')) return
    try {
      await documentService.remove(id)
      setDocs((prev) => prev.filter((d) => d.id !== id))
    } catch {
      setError('Gagal menghapus dokumen.')
    }
  }
  async function handleUploadDocFile(id: string, file: File) {
    try {
      const updated = await documentService.uploadFile(id, file)
      setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)))
    } catch {
      setError('Gagal mengunggah file.')
    }
  }

  // ── Riwayat tahapan proses ──
  async function openProgress(d: DocumentItem) {
    setProgressDoc(d)
    setProgressForm(emptyProgressForm())
    setLoadingProgress(true)
    try {
      setProgressLogs(await documentService.listProgress(d.id))
    } catch {
      setError('Gagal memuat riwayat.')
    } finally {
      setLoadingProgress(false)
    }
  }
  async function handleAddProgress(e: React.FormEvent) {
    e.preventDefault()
    if (!progressDoc) return
    setSavingProgress(true)
    try {
      const payload: ProgressLogCreate = { ...progressForm }
      const rec = payload as unknown as Record<string, unknown>
      ;['event_date', 'institution', 'notes'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      await documentService.addProgress(progressDoc.id, payload)
      const [logs, freshDocs] = await Promise.all([documentService.listProgress(progressDoc.id), documentService.listByProject(projectId)])
      setProgressLogs(logs)
      setDocs(freshDocs)
      setProgressDoc(freshDocs.find((d) => d.id === progressDoc.id) ?? progressDoc)
      setProgressForm(emptyProgressForm())
    } catch {
      setError('Gagal mencatat tahapan.')
    } finally {
      setSavingProgress(false)
    }
  }
  async function handleDeleteProgress(logId: string) {
    if (!confirm('Hapus catatan tahapan ini?') || !progressDoc) return
    try {
      await documentService.deleteProgress(logId)
      const [logs, freshDocs] = await Promise.all([documentService.listProgress(progressDoc.id), documentService.listByProject(projectId)])
      setProgressLogs(logs)
      setDocs(freshDocs)
      setProgressDoc(freshDocs.find((d) => d.id === progressDoc.id) ?? progressDoc)
    } catch {
      setError('Gagal menghapus catatan tahapan.')
    }
  }

  // ── Batch pemecahan ──
  const masterCandidates = docs  // semua dokumen level-proyek bisa jadi "induk" (mis. HGB Induk / SHM Induk)

  function openCreateBatch() {
    setBatchMasterId('')
    setBatchUnitIds([])
    setBatchNotes('')
    setBatchModalOpen(true)
  }
  function toggleBatchUnit(id: string) {
    setBatchUnitIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]))
  }
  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault()
    if (!batchMasterId || batchUnitIds.length === 0) return
    setSavingBatch(true)
    try {
      await documentService.createSplitBatch({ master_document_id: batchMasterId, unit_ids: batchUnitIds, notes: batchNotes || undefined })
      setBatchModalOpen(false)
      await load()
    } catch {
      setError('Gagal membuat batch pemecahan.')
    } finally {
      setSavingBatch(false)
    }
  }
  async function handleDeleteBatch(id: string) {
    if (!confirm('Hapus batch pemecahan ini?')) return
    try {
      await documentService.deleteSplitBatch(id)
      setBatches((prev) => prev.filter((b) => b.id !== id))
    } catch {
      setError('Gagal menghapus batch.')
    }
  }

  // ── detail batch: update status/SK, unggah SK, tautkan hasil ──
  async function refreshDetail(batchId: string) {
    const fresh = await documentService.listSplitBatches(projectId)
    setBatches(fresh)
    setDetailBatch(fresh.find((b) => b.id === batchId) ?? null)
  }
  async function handleUpdateBatchField(batch: SplitBatch, field: 'status' | 'sk_number' | 'sk_date' | 'submitted_date', value: string) {
    const isDateField = field === 'sk_date' || field === 'submitted_date'
    const sendValue = isDateField && value === '' ? null : value
    try {
      await documentService.updateSplitBatch(batch.id, { [field]: sendValue } as unknown as SplitBatchUpdate)
      await refreshDetail(batch.id)
    } catch {
      setError('Gagal memperbarui batch.')
    }
  }
  async function handleUploadSk(batch: SplitBatch, file: File) {
    try {
      await documentService.uploadSplitBatchSkFile(batch.id, file)
      await refreshDetail(batch.id)
    } catch {
      setError('Gagal mengunggah file SK.')
    }
  }
  async function ensureUnitDocs(unitId: string) {
    if (unitDocsCache[unitId]) return
    const list = await documentService.listByUnit(unitId)
    setUnitDocsCache((prev) => ({ ...prev, [unitId]: list }))
  }
  async function handleLinkResult(batch: SplitBatch, itemId: string, resultDocumentId: string) {
    if (!resultDocumentId) return
    try {
      await documentService.linkSplitBatchResult(batch.id, itemId, resultDocumentId)
      await refreshDetail(batch.id)
    } catch {
      setError('Gagal menautkan sertifikat pecahan.')
    }
  }
  async function handleRemoveItem(batch: SplitBatch, itemId: string) {
    if (!confirm('Keluarkan unit ini dari batch?')) return
    try {
      await documentService.removeSplitBatchItem(batch.id, itemId)
      await refreshDetail(batch.id)
    } catch {
      setError('Gagal mengeluarkan unit dari batch.')
    }
  }

  const availableUnitsForBatch = units  // MVP: semua unit proyek bisa diajukan (belum ada validasi "sudah punya pecahan")

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/property/projects')} className="text-slate-400 hover:text-brand-600 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Legal & Perizinan</h1>
          <p className="text-sm text-slate-500">{project?.name}</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {/* ── Perizinan Proyek & Sertifikat Induk ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Perizinan Proyek & Sertifikat Induk</h2>
            <p className="text-xs text-slate-500">KKPR, Izin Lingkungan, PBG, SLF, dan sertifikat induk (HGB/SHM) sebelum dipecah.</p>
          </div>
          <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreateDoc}>
            <Plus size={14} /> Tambah
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Jenis', 'Nomor', 'Status', 'Tanggal Terbit', 'Masa Berlaku', 'File', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada perizinan/sertifikat tercatat.</td></tr>
            ) : (
              docs.map((d) => {
                const s = docStatusCfg[d.status]
                return (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{d.doc_type}</td>
                    <td className="px-4 py-2.5 text-slate-600">{d.name || '—'}</td>
                    <td className="px-4 py-2.5"><Badge label={s.label} variant={s.variant} /></td>
                    <td className="px-4 py-2.5 text-slate-500">{d.doc_date || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{d.expiry_date || '—'}</td>
                    <td className="px-4 py-2.5">
                      {d.has_file ? (
                        <button onClick={() => documentService.openFile(d.id)} className="text-brand-600 hover:underline flex items-center gap-1">
                          <Download size={13} /> Lihat
                        </button>
                      ) : (
                        <label className="text-slate-400 hover:text-brand-600 cursor-pointer flex items-center gap-1">
                          <Upload size={13} /> Unggah
                          <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadDocFile(d.id, f) }} />
                        </label>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openProgress(d)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Riwayat Tahapan"><History size={14} /></button>
                        <button onClick={() => openEditDoc(d)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteDoc(d.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Batch Pemecahan Sertifikat ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Batch Pemecahan Sertifikat</h2>
            <p className="text-xs text-slate-500">Pengajuan pemecahan sertifikat induk ke BPN, mencakup banyak unit sekaligus.</p>
          </div>
          <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreateBatch} disabled={masterCandidates.length === 0}>
            <Plus size={14} /> Ajukan Batch
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Batch', 'Sertifikat Induk', 'Status', 'Tgl Diajukan', 'No. SK', 'Progres', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada batch pemecahan.</td></tr>
            ) : (
              batches.map((b) => {
                const s = batchStatusCfg[b.status]
                const done = b.items.filter((it) => it.result_document_id).length
                return (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setDetailBatch(b)}>
                    <td className="px-4 py-2.5 font-medium text-slate-900 flex items-center gap-2"><Layers size={14} className="text-slate-400" />{b.batch_number}</td>
                    <td className="px-4 py-2.5 text-slate-600">{b.master_document_name || '—'}</td>
                    <td className="px-4 py-2.5"><Badge label={s.label} variant={s.variant} /></td>
                    <td className="px-4 py-2.5 text-slate-500">{b.submitted_date || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{b.sk_number || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{done}/{b.items.length} terbit</td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleDeleteBatch(b.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal: form dokumen (perizinan/sertifikat) ── */}
      <Modal open={docModalOpen} onClose={() => setDocModalOpen(false)} title={editingDocId ? 'Edit Dokumen' : 'Tambah Perizinan/Sertifikat'}>
        <form onSubmit={handleSaveDoc} className="space-y-3">
          <div>
            <label className="label">Jenis *</label>
            <input list="doc-type-suggestions" className="input" required value={docForm.doc_type}
                   onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })} placeholder="mis. HGB Induk, PBG, SLF" />
            <datalist id="doc-type-suggestions">
              {DOC_TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Nomor</label>
            <input className="input" value={docForm.name ?? ''} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={docForm.status} onChange={(e) => setDocForm({ ...docForm, status: e.target.value as DocStatus })}>
                {(Object.keys(docStatusCfg) as DocStatus[]).map((k) => <option key={k} value={k}>{docStatusCfg[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tanggal Terbit</label>
              <DateInput value={docForm.doc_date} onChange={(v) => setDocForm({ ...docForm, doc_date: v })} />
            </div>
          </div>
          <div>
            <label className="label">Masa Berlaku (jika ada)</label>
            <DateInput value={docForm.expiry_date} onChange={(v) => setDocForm({ ...docForm, expiry_date: v })} />
          </div>
          <div>
            <label className="label">Catatan</label>
            <textarea className="input" rows={2} value={docForm.notes ?? ''} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setDocModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={savingDoc}>
              {savingDoc && <Loader2 size={14} className="animate-spin" />} Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: buat batch ── */}
      <Modal open={batchModalOpen} onClose={() => setBatchModalOpen(false)} title="Ajukan Batch Pemecahan" size="lg">
        <form onSubmit={handleCreateBatch} className="space-y-3">
          <div>
            <label className="label">Sertifikat Induk *</label>
            <select className="input" required value={batchMasterId} onChange={(e) => setBatchMasterId(e.target.value)}>
              <option value="">— pilih —</option>
              {masterCandidates.map((d) => <option key={d.id} value={d.id}>{d.doc_type} {d.name ? `(${d.name})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Unit yang diikutkan * ({batchUnitIds.length} dipilih)</label>
            <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
              {availableUnitsForBatch.length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-400 text-center">Belum ada unit di proyek ini.</div>
              ) : (
                availableUnitsForBatch.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={batchUnitIds.includes(u.id)} onChange={() => toggleBatchUnit(u.id)} />
                    <span className="text-slate-700">{[u.block, u.unit_number].filter(Boolean).join(' / ')}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div>
            <label className="label">Catatan</label>
            <textarea className="input" rows={2} value={batchNotes} onChange={(e) => setBatchNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setBatchModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={savingBatch || !batchMasterId || batchUnitIds.length === 0}>
              {savingBatch && <Loader2 size={14} className="animate-spin" />} Ajukan
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: detail batch ── */}
      <Modal open={!!detailBatch} onClose={() => setDetailBatch(null)} title={detailBatch ? `Batch ${detailBatch.batch_number}` : ''} size="lg">
        {detailBatch && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Status</label>
                <select className="input" value={detailBatch.status}
                        onChange={(e) => handleUpdateBatchField(detailBatch, 'status', e.target.value)}>
                  {(Object.keys(batchStatusCfg) as SplitBatchStatus[]).map((k) => <option key={k} value={k}>{batchStatusCfg[k].label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Tanggal Diajukan</label>
                <DateInput value={detailBatch.submitted_date} onChange={(v) => handleUpdateBatchField(detailBatch, 'submitted_date', v)} />
              </div>
              <div>
                <label className="label">Nomor SK Pemecahan</label>
                <input className="input" value={detailBatch.sk_number ?? ''} onChange={(e) => handleUpdateBatchField(detailBatch, 'sk_number', e.target.value)} />
              </div>
              <div>
                <label className="label">Tanggal SK</label>
                <DateInput value={detailBatch.sk_date} onChange={(v) => handleUpdateBatchField(detailBatch, 'sk_date', v)} />
              </div>
            </div>
            <div>
              <label className="label">Scan SK Pemecahan</label>
              {detailBatch.has_sk_file ? (
                <button onClick={() => documentService.openSplitBatchSkFile(detailBatch.id)} className="text-brand-600 hover:underline text-sm flex items-center gap-1">
                  <Download size={13} /> {detailBatch.sk_file_name}
                </button>
              ) : (
                <label className="text-slate-500 hover:text-brand-600 cursor-pointer text-sm flex items-center gap-1 w-fit">
                  <Upload size={13} /> Unggah scan SK
                  <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadSk(detailBatch, f) }} />
                </label>
              )}
            </div>
            <div>
              <label className="label">Unit dalam batch ini</label>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {detailBatch.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                       onMouseEnter={() => ensureUnitDocs(it.unit_id)}>
                    <span className="text-slate-700 min-w-[90px]">{[it.block, it.unit_number].filter(Boolean).join(' / ')}</span>
                    {it.result_document_id ? (
                      <span className="flex items-center gap-1 text-emerald-700 text-xs">
                        <FileCheck size={13} /> Sertifikat pecahan tertaut
                        {it.result_status && <Badge label={docStatusCfg[it.result_status].label} variant={docStatusCfg[it.result_status].variant} />}
                      </span>
                    ) : (
                      <select className="input text-xs py-1 max-w-[220px]" defaultValue=""
                              onChange={(e) => handleLinkResult(detailBatch, it.id, e.target.value)}>
                        <option value="" disabled>Tautkan sertifikat pecahan…</option>
                        {(unitDocsCache[it.unit_id] ?? []).map((d) => (
                          <option key={d.id} value={d.id}>{d.doc_type} {d.name ? `(${d.name})` : ''}</option>
                        ))}
                      </select>
                    )}
                    <button onClick={() => handleRemoveItem(detailBatch, it.id)} className="text-slate-400 hover:text-red-600" title="Keluarkan dari batch">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Link2 size={11} /> Belum ada pilihan? Unggah dulu dokumen legalitas unit di halaman Dokumen Legalitas.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: riwayat tahapan proses ── */}
      <Modal open={!!progressDoc} onClose={() => setProgressDoc(null)}
             title={progressDoc ? `Riwayat — ${progressDoc.doc_type}${progressDoc.name ? ` (${progressDoc.name})` : ''}` : ''} size="lg">
        {progressDoc && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Status saat ini:</span>
              <Badge label={docStatusCfg[progressDoc.status].label} variant={docStatusCfg[progressDoc.status].variant} />
              {progressDoc.doc_date && <span className="text-xs text-slate-400">— terbit {progressDoc.doc_date}</span>}
            </div>

            <form onSubmit={handleAddProgress} className="border border-slate-200 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tahapan *</label>
                  <select className="input" required value={progressForm.event}
                          onChange={(e) => setProgressForm({ ...progressForm, event: e.target.value as ProgressEvent })}>
                    {(Object.keys(progressEventCfg) as ProgressEvent[]).map((k) => <option key={k} value={k}>{progressEventCfg[k].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Tanggal (kosong = hari ini)</label>
                  <DateInput value={progressForm.event_date} onChange={(v) => setProgressForm({ ...progressForm, event_date: v })} />
                </div>
              </div>
              <div>
                <label className="label">Tujuan Instansi</label>
                <input className="input" placeholder="mis. Dinas PTSP Kota X, Kantor BPN" value={progressForm.institution ?? ''}
                       onChange={(e) => setProgressForm({ ...progressForm, institution: e.target.value })} />
              </div>
              <div>
                <label className="label">Keterangan</label>
                <textarea className="input" rows={2} placeholder="sedang proses apa..." value={progressForm.notes ?? ''}
                          onChange={(e) => setProgressForm({ ...progressForm, notes: e.target.value })} />
              </div>
              {progressForm.event === 'terbit' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  Tanggal ini akan otomatis mengisi "Tanggal Terbit" dokumen. Jangan lupa unggah file dokumennya di tabel utama.
                </p>
              )}
              <div className="flex justify-end">
                <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={savingProgress}>
                  {savingProgress && <Loader2 size={14} className="animate-spin" />} Catat Tahapan
                </button>
              </div>
            </form>

            <div>
              <label className="label">Riwayat</label>
              {loadingProgress ? (
                <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
              ) : progressLogs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Belum ada riwayat tahapan.</p>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {progressLogs.map((p) => {
                    const cfg = progressEventCfg[p.event]
                    return (
                      <div key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge label={cfg.label} variant={cfg.variant} />
                            <span className="text-slate-500 text-xs">{p.event_date}</span>
                            {p.institution && <span className="text-slate-500 text-xs">— {p.institution}</span>}
                          </div>
                          {p.notes && <p className="text-slate-600 text-xs">{p.notes}</p>}
                          {p.by_user_name && <p className="text-slate-400 text-xs">dicatat oleh {p.by_user_name}</p>}
                        </div>
                        <button onClick={() => handleDeleteProgress(p.id)} className="text-slate-400 hover:text-red-600 shrink-0" title="Hapus">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
