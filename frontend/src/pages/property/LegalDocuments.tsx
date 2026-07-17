import { useEffect, useState, useCallback, useRef } from 'react'
import { FileCheck, Plus, Trash2, Pencil, Loader2, Upload, Eye, ListChecks, Paperclip, X, ArrowLeftRight, AlertTriangle } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import DateInput from '../../components/ui/DateInput'
import Modal from '../../components/ui/Modal'
import SignaturePad from '../../components/ui/SignaturePad'
import { propertyService } from '../../services/property'
import { documentService } from '../../services/document'
import { taxService } from '../../services/tax'
import { kprService } from '../../services/kpr'
import { marketingService } from '../../services/marketing'
import { today } from '../../utils/date'
import { useAuth } from '../../context/AuthContext'
import type {
  Project, Unit, DocumentItem, DocumentCreate, DocumentBulkItem, DocStatus,
  DocumentHandover, HandoverEvent, CustodyStatus, Notary, Bank, Client,
} from '../../types'

const LEGAL_PRESETS = ['Sertifikat SHM', 'Sertifikat HGB', 'SLF', 'IMB / PBG', 'PBB']
// Checklist default untuk entry cepat (SHM & HGB alternatif; user isi yang relevan)
const CHECKLIST_PRESETS = ['Sertifikat SHM', 'SLF', 'IMB / PBG', 'PBB']
const isSertifikat = (t: string) => /shm|hgb|sertifikat/i.test(t)
const isPBB = (t: string) => /pbb/i.test(t)

interface ChecklistRow {
  doc_type: string
  name: string
  address: string
  status: DocStatus
  doc_date: string
  land_area?: number
  file?: File | null
  custom?: boolean
}
const rowFilled = (r: ChecklistRow) =>
  r.status !== 'belum' || !!r.name.trim() || !!r.address.trim() || !!r.file || r.land_area != null
const docStatusCfg: Record<DocStatus, { label: string; variant: 'gray' | 'yellow' | 'green' }> = {
  belum:  { label: 'Belum Ada', variant: 'gray' },
  proses: { label: 'Proses',    variant: 'yellow' },
  terbit: { label: 'Terbit',    variant: 'green' },
}

// ── Penguasaan dokumen ASLI (fisik) — bukan file scan ──
const NOTARIS_ALERT_DAYS = 30  // di notaris lebih lama dari ini → peringatan
const custodyCfg: Record<CustodyStatus, { label: string; variant: 'gray' | 'yellow' | 'green' | 'blue' }> = {
  arsip:   { label: 'Di arsip',         variant: 'green' },
  diambil: { label: 'Diambil',          variant: 'yellow' },
  notaris: { label: 'Di notaris',       variant: 'yellow' },
  pembeli: { label: 'Diterima pembeli', variant: 'green' },
  bank:    { label: 'Diserahkan ke bank', variant: 'blue' },
}
const eventCfg: Record<HandoverEvent, string> = {
  ambil:          'Diambil dari arsip',
  serah_notaris:  'Diserahkan ke notaris',
  terima_pembeli: 'Diterima pembeli (cash)',
  tahan_bank:     'Diserahkan ke bank (KPR/agunan)',
  kembali_arsip:  'Kembali ke arsip',
}
const daysSince = (d?: string) => d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const isOverdueNotaris = (d: DocumentItem) =>
  d.custody_status === 'notaris' && daysSince(d.custody_since) > NOTARIS_ALERT_DAYS

const unitLabel = (u?: Unit) => u ? [u.block, u.unit_number].filter(Boolean).join('-') : ''
const emptyDoc = (): Omit<DocumentCreate, 'unit_id'> => ({ doc_type: '', name: '', address: '', status: 'belum', doc_date: '', land_area: undefined })

export default function LegalDocuments() {
  const { user } = useAuth()
  const canDelete = user?.role === 'owner' || user?.role === 'admin'  // hapus dokumen legalitas = owner/admin
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

  // Serah-terima dokumen ASLI (fisik)
  const [custodyModal, setCustodyModal] = useState(false)
  const [custodyDoc, setCustodyDoc] = useState<DocumentItem | null>(null)
  const [handovers, setHandovers] = useState<DocumentHandover[]>([])
  const [hLoading, setHLoading] = useState(false)
  const [hSaving, setHSaving] = useState(false)
  const [hForm, setHForm] = useState<{ event: HandoverEvent; at: string; notary_id: string; bank_id: string; client_id: string; received_by: string; signature: string; notes: string }>({ event: 'ambil', at: '', notary_id: '', bank_id: '', client_id: '', received_by: '', signature: '', notes: '' })
  const [hFile, setHFile] = useState<File | null>(null)
  const [notaries, setNotaries] = useState<Notary[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [clients, setClients] = useState<Client[]>([])
  // Serah-terima 1 PAKET (semua dokumen unit sekaligus)
  const [pkgModal, setPkgModal] = useState(false)
  const [pkgSaving, setPkgSaving] = useState(false)
  const [pkgMsg, setPkgMsg] = useState('')
  const [pkgFile, setPkgFile] = useState<File | null>(null)
  const [pkgDocIds, setPkgDocIds] = useState<string[]>([])   // dokumen yang ikut paket
  const [pkgForm, setPkgForm] = useState<{ event: HandoverEvent; at: string; notary_id: string; bank_id: string; client_id: string; received_by: string; signature: string; notes: string }>({ event: 'serah_notaris', at: '', notary_id: '', bank_id: '', client_id: '', received_by: '', signature: '', notes: '' })

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
    setForm({ doc_type: d.doc_type, name: d.name ?? '', address: d.address ?? '', status: d.status, doc_date: d.doc_date ?? '', land_area: d.land_area })
    setModal(true)
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) {
        const p = { ...form }
        const rec = p as unknown as Record<string, unknown>
        ;['name', 'address', 'doc_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
        await documentService.update(editId, p)
      } else {
        const p: DocumentCreate = { ...form, unit_id: unitId }
        const rec = p as unknown as Record<string, unknown>
        ;['name', 'address', 'doc_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
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

  // ── Serah-terima dokumen ASLI ──
  async function openCustody(d: DocumentItem) {
    setCustodyDoc(d); setHFile(null); setHLoading(true); setCustodyModal(true)
    setHForm({ event: 'ambil', at: today(), notary_id: '', bank_id: '', client_id: '', received_by: '', signature: '', notes: '' })
    try {
      const [hs, ns, bs, cs] = await Promise.all([
        documentService.listHandovers(d.id),
        notaries.length ? Promise.resolve(notaries) : taxService.listNotaries(),
        banks.length ? Promise.resolve(banks) : kprService.listBanks(),
        clients.length ? Promise.resolve({ items: clients }) : marketingService.listClients({ size: 500 }),
      ])
      setHandovers(hs); setNotaries(ns); setBanks(bs)
      setClients((cs as { items: Client[] }).items)
    } catch { setError('Gagal memuat riwayat serah-terima.') } finally { setHLoading(false) }
  }
  async function submitHandover(e: React.FormEvent) {
    e.preventDefault(); if (!custodyDoc) return
    setHSaving(true); setError('')
    try {
      const p = {
        event: hForm.event,
        at: hForm.at || undefined,
        notary_id: hForm.event === 'serah_notaris' ? hForm.notary_id : undefined,
        bank_id: hForm.event === 'tahan_bank' ? hForm.bank_id : undefined,
        client_id: hForm.event === 'terima_pembeli' ? hForm.client_id : undefined,
        received_by: hForm.received_by || undefined,
        signature: hForm.signature || undefined,
        notes: hForm.notes || undefined,
      }
      const created = await documentService.addHandover(custodyDoc.id, p)
      if (hFile) await documentService.uploadProof(created.id, hFile)   // bukti serah-terima
      setHandovers(await documentService.listHandovers(custodyDoc.id))
      setHFile(null); setHForm((f) => ({ ...f, notes: '', signature: '' }))
      await loadDocs(unitId)   // segarkan badge status di tabel
    } catch { setError('Gagal mencatat serah-terima (cek tujuan wajib diisi).') } finally { setHSaving(false) }
  }
  // Serah-terima 1 PAKET — semua dokumen asli unit ini sekaligus
  async function openPkg() {
    setPkgFile(null); setPkgMsg('')
    // default paket ke notaris = SHM + PBB. IMB/PBG diserahkan ke bank → tak ikut; SLF juga tidak.
    setPkgDocIds(docs.filter((d) => isSertifikat(d.doc_type) || isPBB(d.doc_type)).map((d) => d.id))
    setPkgForm({ event: 'serah_notaris', at: today(), notary_id: '', bank_id: '', client_id: '', received_by: '', signature: '', notes: '' })
    setPkgModal(true)
    try {
      const [ns, bs, cs] = await Promise.all([
        notaries.length ? Promise.resolve(notaries) : taxService.listNotaries(),
        banks.length ? Promise.resolve(banks) : kprService.listBanks(),
        clients.length ? Promise.resolve({ items: clients }) : marketingService.listClients({ size: 500 }),
      ])
      setNotaries(ns); setBanks(bs); setClients((cs as { items: Client[] }).items)
    } catch { setError('Gagal memuat master notaris/bank/pembeli.') }
  }
  async function submitPkg(e: React.FormEvent) {
    e.preventDefault(); if (!unitId) return
    setPkgSaving(true); setError(''); setPkgMsg('')
    try {
      const res = await documentService.addUnitHandover(unitId, {
        event: pkgForm.event,
        at: pkgForm.at || undefined,
        notary_id: pkgForm.event === 'serah_notaris' ? pkgForm.notary_id : undefined,
        bank_id: pkgForm.event === 'tahan_bank' ? pkgForm.bank_id : undefined,
        client_id: pkgForm.event === 'terima_pembeli' ? pkgForm.client_id : undefined,
        received_by: pkgForm.received_by || undefined,
        signature: pkgForm.signature || undefined,
        notes: pkgForm.notes || undefined,
      }, pkgFile, pkgDocIds)
      setPkgMsg(`${res.affected} dokumen asli tercatat: ${res.doc_types.join(', ')}${res.has_proof ? ' · bukti terunggah' : ''}.`)
      setPkgFile(null)
      await loadDocs(unitId)
    } catch { setError('Gagal mencatat serah-terima paket (cek tujuan wajib diisi).') } finally { setPkgSaving(false) }
  }

  async function delHandover(id: string) {
    if (!custodyDoc) return
    if (!confirm('Hapus catatan serah-terima ini?')) return
    try {
      await documentService.deleteHandover(id)
      setHandovers(await documentService.listHandovers(custodyDoc.id)); await loadDocs(unitId)
    } catch { setError('Gagal menghapus catatan (hanya owner/admin).') }
  }

  // ── Entry cepat / checklist ──
  function openChecklist() {
    // baris preset yang BELUM ada untuk unit ini (yang sudah ada tetap dikelola di tabel)
    const existingTypes = new Set(docs.map((d) => d.doc_type.trim().toLowerCase()))
    const preset: ChecklistRow[] = CHECKLIST_PRESETS
      .filter((t) => !existingTypes.has(t.trim().toLowerCase()))
      .map((t) => ({ doc_type: t, name: '', address: '', status: 'belum', doc_date: '', file: null }))
    setRows(preset.length ? preset : [{ doc_type: '', name: '', address: '', status: 'belum', doc_date: '', file: null, custom: true }])
    setChecklistMsg('')
    setChecklistModal(true)
  }
  function setRow(i: number, patch: Partial<ChecklistRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, { doc_type: '', name: '', address: '', status: 'belum', doc_date: '', file: null, custom: true }])
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
        if (isPBB(r.doc_type) && r.address.trim()) it.address = r.address.trim()
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

  // LT sertifikat (SHM/HGB) = sumber sah; baris PBB ikut menampilkan nilai ini (tak disimpan di PBB)
  const shmLT = docs.find((d) => isSertifikat(d.doc_type) && d.land_area != null)?.land_area

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

      {/* Peringatan: dokumen asli terlalu lama di notaris */}
      {(() => { const late = docs.filter(isOverdueNotaris); return late.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            {late.length} dokumen asli sudah lebih dari {NOTARIS_ALERT_DAYS} hari di notaris dan belum tuntas:{' '}
            {late.map((d) => `${d.doc_type} (${daysSince(d.custody_since)} hari)`).join(', ')}.
          </span>
        </div>
      ) })()}

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
              <button className="btn-secondary text-xs flex items-center gap-1" onClick={openPkg} disabled={docs.length === 0}
                      title="Catat serah-terima dokumen asli — semua dokumen unit ini sekaligus (1 paket)">
                <ArrowLeftRight size={13} /> Serah-Terima Asli
              </button>
              <button className="btn-primary text-xs flex items-center gap-1" onClick={openCreate}><Plus size={13} /> Tambah Dokumen</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Jenis', 'Nomor', 'LT (m²)', 'Status', 'Dokumen Asli', 'File', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada dokumen legalitas untuk unit ini.</td></tr>
              ) : docs.map((d) => {
                const st = docStatusCfg[d.status]
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{d.doc_type}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {d.name ?? '—'}
                      {d.address && <div className="text-xs text-slate-400 mt-0.5">{d.address}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {d.land_area != null ? (
                        `${Number(d.land_area)} m²`
                      ) : isPBB(d.doc_type) && shmLT != null ? (
                        <span className="text-slate-400">{Number(shmLT)} m² <span className="text-[11px]">(ikut SHM)</span></span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5">{st && <Badge label={st.label} variant={st.variant} />}</td>
                    <td className="px-4 py-2.5">
                      {(() => {
                        const cs = d.custody_status ?? 'arsip'
                        const cc = custodyCfg[cs]
                        const late = isOverdueNotaris(d)
                        return (
                          <button onClick={() => openCustody(d)} className="text-left group" title="Catat / lihat serah-terima dokumen asli">
                            <Badge label={cc.label} variant={late ? 'red' : cc.variant} />
                            {d.custody_holder && (
                              <div className="text-[11px] text-slate-500 mt-0.5 group-hover:text-brand-600">
                                {d.custody_holder}{d.custody_since ? ` · ${daysSince(d.custody_since)} hari` : ''}
                              </div>
                            )}
                          </button>
                        )
                      })()}
                    </td>
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
                        <button onClick={() => openCustody(d)} className="text-slate-400 hover:text-brand-600" title="Serah-terima dokumen asli"><ArrowLeftRight size={14} /></button>
                        <button onClick={() => openEdit(d)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={14} /></button>
                        {canDelete && <button onClick={() => del(d.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>}
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
          {isPBB(form.doc_type) && (
            <div>
              <label className="label">Alamat Objek Pajak (PBB)</label>
              <input className="input" placeholder="Alamat pada SPPT PBB" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DocStatus })}>
                {(Object.keys(docStatusCfg) as DocStatus[]).map((k) => <option key={k} value={k}>{docStatusCfg[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tanggal</label>
              <DateInput className="input" value={form.doc_date} onChange={(v) => setForm({ ...form, doc_date: v })} />
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

      {/* Modal Serah-terima Dokumen ASLI (fisik) */}
      <Modal open={custodyModal} onClose={() => setCustodyModal(false)} title={`Dokumen Asli — ${custodyDoc?.doc_type ?? ''}`} size="lg">
        {custodyDoc && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Posisi sekarang:</span>
              <Badge label={custodyCfg[custodyDoc.custody_status ?? 'arsip'].label}
                     variant={isOverdueNotaris(custodyDoc) ? 'red' : custodyCfg[custodyDoc.custody_status ?? 'arsip'].variant} />
              {custodyDoc.custody_holder && <span className="text-slate-600">{custodyDoc.custody_holder}</span>}
              {custodyDoc.custody_since && <span className="text-xs text-slate-400">sejak {fmtDate(custodyDoc.custody_since)} · {daysSince(custodyDoc.custody_since)} hari</span>}
            </div>
            <p className="text-[11px] text-slate-400">Yang dilacak di sini adalah <b>kertas aslinya</b> — file scan yang diunggah tetap tersimpan di sistem.</p>

            {/* Riwayat */}
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {hLoading ? (
                <p className="text-xs text-slate-400 py-2"><Loader2 size={13} className="inline animate-spin" /> Memuat riwayat…</p>
              ) : handovers.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Belum ada catatan serah-terima — dokumen asli dianggap masih di arsip.</p>
              ) : handovers.map((h) => (
                <div key={h.id} className="flex items-start justify-between gap-2 text-sm border-b border-slate-100 py-1.5">
                  <div className="min-w-0">
                    <p className="text-slate-800">{eventCfg[h.event]}
                      {(h.notary_name || h.bank_name || h.client_name) && <span className="text-slate-500"> → {h.notary_name || h.bank_name || h.client_name}</span>}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {fmtDate(h.at)}{h.by_user_name ? ` · dicatat ${h.by_user_name}` : ''}
                      {h.received_by ? ` · diterima ${h.received_by}` : ''}{h.notes ? ` · ${h.notes}` : ''}
                    </p>
                    {h.signature && (
                      <img src={h.signature} alt={`Tanda tangan ${h.received_by ?? 'penerima'}`}
                           className="mt-1 h-10 rounded border border-slate-200 bg-white" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {h.has_proof && (
                      <button onClick={() => documentService.openProof(h.id).catch(() => setError('Gagal membuka bukti.'))}
                              className="text-brand-600 hover:underline text-xs inline-flex items-center gap-1" title={h.proof_name}>
                        <Eye size={12} /> Bukti
                      </button>
                    )}
                    {canDelete && <button onClick={() => delHandover(h.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>}
                  </div>
                </div>
              ))}
            </div>

            {/* Form catat kejadian */}
            <form onSubmit={submitHandover} className="border-t border-slate-100 pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Kejadian *</label>
                  <select className="input" value={hForm.event} onChange={(e) => setHForm({ ...hForm, event: e.target.value as HandoverEvent })}>
                    {(Object.keys(eventCfg) as HandoverEvent[]).map((k) => <option key={k} value={k}>{eventCfg[k]}</option>)}
                  </select></div>
                <div><label className="label">Tanggal</label><DateInput className="input" max={today()} value={hForm.at} onChange={(v) => setHForm({ ...hForm, at: v })} /></div>
              </div>

              {hForm.event === 'serah_notaris' && (
                <div><label className="label">Notaris *</label>
                  <select className="input" required value={hForm.notary_id} onChange={(e) => setHForm({ ...hForm, notary_id: e.target.value })}>
                    <option value="">Pilih notaris...</option>
                    {notaries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select></div>
              )}
              {hForm.event === 'tahan_bank' && (
                <div><label className="label">Bank *</label>
                  <select className="input" required value={hForm.bank_id} onChange={(e) => setHForm({ ...hForm, bank_id: e.target.value })}>
                    <option value="">Pilih bank...</option>
                    {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select></div>
              )}
              {hForm.event === 'terima_pembeli' && (
                <div><label className="label">Pembeli *</label>
                  <select className="input" required value={hForm.client_id} onChange={(e) => setHForm({ ...hForm, client_id: e.target.value })}>
                    <option value="">Pilih pembeli...</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select></div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Nama PIC Penerima</label>
                  <input className="input" placeholder="mis. Rina — staf notaris" value={hForm.received_by} onChange={(e) => setHForm({ ...hForm, received_by: e.target.value })} /></div>
                <div><label className="label">Catatan</label>
                  <input className="input" placeholder="mis. untuk proses AJB" value={hForm.notes} onChange={(e) => setHForm({ ...hForm, notes: e.target.value })} /></div>
              </div>

              <div>
                <label className="label">Tanda Tangan PIC Penerima</label>
                <SignaturePad key={handovers.length} value={hForm.signature} onChange={(d) => setHForm((f) => ({ ...f, signature: d }))} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                    <Paperclip size={12} /> {hFile ? 'Ganti bukti' : 'Bukti serah-terima'}
                  </span>
                  {hFile && <span className="text-slate-600 truncate max-w-[160px]">{hFile.name}</span>}
                  <input type="file" className="hidden" onChange={(e) => setHFile(e.target.files?.[0] ?? null)} />
                </label>
                <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={hSaving}>
                  {hSaving && <Loader2 size={14} className="animate-spin" />}Catat
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Bukti: foto berita acara / tanda terima bertanda tangan (maks 10 MB). Pencatat = akun Anda.</p>
            </form>
          </div>
        )}
      </Modal>

      {/* Modal Serah-Terima 1 PAKET (semua dokumen asli unit) */}
      <Modal open={pkgModal} onClose={() => setPkgModal(false)} title={`Serah-Terima Dokumen Asli — ${unitLabel(units.find((u) => u.id === unitId))}`} size="lg">
        <form onSubmit={submitPkg} className="space-y-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-500">Dokumen asli yang ikut paket ({pkgDocIds.length}/{docs.length})</p>
              <div className="flex gap-2 text-[11px]">
                <button type="button" className="text-brand-600 hover:underline" onClick={() => setPkgDocIds(docs.map((d) => d.id))}>Pilih semua</button>
                <button type="button" className="text-slate-400 hover:underline" onClick={() => setPkgDocIds([])}>Kosongkan</button>
              </div>
            </div>
            <div className="space-y-1">
              {docs.map((d) => {
                const on = pkgDocIds.includes(d.id)
                return (
                  <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={on} className="rounded border-slate-300"
                      onChange={(e) => setPkgDocIds((ids) => e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id))} />
                    <span className={on ? 'text-slate-800' : 'text-slate-400'}>{d.doc_type}</span>
                    {!isSertifikat(d.doc_type) && !isPBB(d.doc_type) && (
                      <span className="text-[10px] text-slate-400">(tak ikut ke notaris)</span>
                    )}
                  </label>
                )
              })}
              {docs.length === 0 && <p className="text-sm text-slate-400">—</p>}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Default: <b>SHM &amp; PBB</b> (yang diserahkan ke notaris). IMB/PBG biasanya ke bank — centang manual bila perlu. Kejadian & bukti yang sama dicatat untuk semua yang tercentang.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Kejadian *</label>
              <select className="input" value={pkgForm.event} onChange={(e) => setPkgForm({ ...pkgForm, event: e.target.value as HandoverEvent })}>
                {(Object.keys(eventCfg) as HandoverEvent[]).map((k) => <option key={k} value={k}>{eventCfg[k]}</option>)}
              </select></div>
            <div><label className="label">Tanggal</label><DateInput className="input" max={today()} value={pkgForm.at} onChange={(v) => setPkgForm({ ...pkgForm, at: v })} /></div>
          </div>

          {pkgForm.event === 'serah_notaris' && (
            <div><label className="label">Notaris *</label>
              <select className="input" required value={pkgForm.notary_id} onChange={(e) => setPkgForm({ ...pkgForm, notary_id: e.target.value })}>
                <option value="">Pilih notaris...</option>
                {notaries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select></div>
          )}
          {pkgForm.event === 'tahan_bank' && (
            <div><label className="label">Bank *</label>
              <select className="input" required value={pkgForm.bank_id} onChange={(e) => setPkgForm({ ...pkgForm, bank_id: e.target.value })}>
                <option value="">Pilih bank...</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
          )}
          {pkgForm.event === 'terima_pembeli' && (
            <div><label className="label">Pembeli *</label>
              <select className="input" required value={pkgForm.client_id} onChange={(e) => setPkgForm({ ...pkgForm, client_id: e.target.value })}>
                <option value="">Pilih pembeli...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select></div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Nama PIC Penerima</label>
              <input className="input" placeholder="mis. Rina — staf Notaris Herminda" value={pkgForm.received_by} onChange={(e) => setPkgForm({ ...pkgForm, received_by: e.target.value })} /></div>
            <div><label className="label">Catatan</label>
              <input className="input" placeholder="mis. untuk proses AJB" value={pkgForm.notes} onChange={(e) => setPkgForm({ ...pkgForm, notes: e.target.value })} /></div>
          </div>

          <div>
            <label className="label">Tanda Tangan PIC Penerima</label>
            <SignaturePad value={pkgForm.signature} onChange={(d) => setPkgForm((f) => ({ ...f, signature: d }))} />
          </div>

          {pkgMsg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{pkgMsg}</div>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                <Paperclip size={12} /> {pkgFile ? 'Ganti bukti' : 'Bukti serah-terima'}
              </span>
              {pkgFile && <span className="text-slate-600 truncate max-w-[180px]">{pkgFile.name}</span>}
              <input type="file" className="hidden" onChange={(e) => setPkgFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => setPkgModal(false)}>Tutup</button>
              <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={pkgSaving || pkgDocIds.length === 0}>
                {pkgSaving && <Loader2 size={14} className="animate-spin" />}Catat Paket
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Bukti: foto berita acara / tanda terima bertanda tangan (maks 10 MB) — dipakai untuk semua dokumen di paket ini. Pencatat = akun Anda.</p>
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
                  <DateInput className="input" value={r.doc_date} onChange={(v) => setRow(i, { doc_date: v })} />
                  {isSertifikat(r.doc_type) ? (
                    <input className="input" type="number" min={0} step="0.01" placeholder="LT (m²)"
                      value={r.land_area ?? ''} onChange={(e) => setRow(i, { land_area: e.target.value ? Number(e.target.value) : undefined })} />
                  ) : <div />}
                </div>
                {isPBB(r.doc_type) && (
                  <input className="input" placeholder="Alamat objek pajak (PBB)"
                    value={r.address} onChange={(e) => setRow(i, { address: e.target.value })} />
                )}
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
