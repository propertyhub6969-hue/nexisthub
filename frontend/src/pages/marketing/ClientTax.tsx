import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Pencil, Loader2, Receipt, Scale, FileText, Upload, Eye, Contact, FileSignature } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import MoneyInput from '../../components/ui/MoneyInput'
import Modal from '../../components/ui/Modal'
import { marketingService } from '../../services/marketing'
import { taxService } from '../../services/tax'
import { documentService } from '../../services/document'
import type {
  Client, Notary, TaxRecord, TaxCreate, TaxType, TaxStatus, NotaryFee, NotaryFeeCreate,
  DocumentItem, DocumentCreate, DocStatus,
} from '../../types'

// Berkas Pembeli = dokumen identitas melekat ke pembeli (client_id).
// Dokumen legalitas unit dikelola terpisah di menu Properti → Dokumen Legalitas (unit_id).
const IDENTITY_PRESETS = ['KTP', 'KK', 'NPWP']

const docStatusCfg: Record<DocStatus, { label: string; variant: 'gray' | 'yellow' | 'green' }> = {
  belum:  { label: 'Belum Ada', variant: 'gray' },
  proses: { label: 'Proses',    variant: 'yellow' },
  terbit: { label: 'Terbit',    variant: 'green' },
}

const fmt = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

const taxTypeLabel: Record<TaxType, string> = { pph: 'PPh Final', bphtb: 'BPHTB', ppn: 'PPN' }
const taxStatusCfg: Record<TaxStatus, { label: string; variant: 'gray' | 'blue' | 'green' | 'orange' }> = {
  belum:    { label: 'Belum Bayar', variant: 'gray' },
  dibayar:  { label: 'Dibayar',     variant: 'blue' },
  validasi: { label: 'Validasi',    variant: 'green' },
  dtp:      { label: 'DTP',         variant: 'orange' },
  bebas:    { label: 'Bebas',       variant: 'orange' },
}

const emptyDoc = (cid: string): DocumentCreate => ({ client_id: cid, doc_type: '', name: '', status: 'belum', doc_date: '' })
const emptyTax = (cid: string): TaxCreate => ({ client_id: cid, tax_type: 'pph', amount: undefined, id_billing: '', ntpn: '', tax_date: '', status: 'belum', notary_id: '' })
const emptyFee = (cid: string): NotaryFeeCreate => ({ client_id: cid, description: '', amount: 0, fee_date: '', is_paid: false, notary_id: '' })

export default function ClientTax() {
  const { clientId = '' } = useParams()
  const [client, setClient] = useState<Client | null>(null)
  const [notaries, setNotaries] = useState<Notary[]>([])
  const [taxes, setTaxes] = useState<TaxRecord[]>([])
  const [fees, setFees] = useState<NotaryFee[]>([])
  const [docs, setDocs] = useState<DocumentItem[]>([])          // berkas pembeli (identitas)
  const [unitDocs, setUnitDocs] = useState<DocumentItem[]>([])  // dokumen legalitas unit (read-only di sini)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [docModal, setDocModal] = useState(false)
  const [docForm, setDocForm] = useState<DocumentCreate>(emptyDoc(clientId))
  const [docEditId, setDocEditId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pendingUpload = useRef<string | null>(null)

  const [taxModal, setTaxModal] = useState(false)
  const [taxForm, setTaxForm] = useState<TaxCreate>(emptyTax(clientId))
  const [taxEditId, setTaxEditId] = useState<string | null>(null)
  const [uploadingTaxId, setUploadingTaxId] = useState<string | null>(null)
  const taxFileInput = useRef<HTMLInputElement | null>(null)
  const pendingTaxUpload = useRef<string | null>(null)

  const [feeModal, setFeeModal] = useState(false)
  const [feeForm, setFeeForm] = useState<NotaryFeeCreate>(emptyFee(clientId))
  const [feeEditId, setFeeEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [ppjbNumber, setPpjbNumber] = useState('')
  const [ajbNumber, setAjbNumber] = useState('')
  const [savingDeed, setSavingDeed] = useState(false)
  const [uploadingDeed, setUploadingDeed] = useState<'ppjb' | 'ajb' | null>(null)
  const ppjbFileInput = useRef<HTMLInputElement | null>(null)
  const ajbFileInput = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cl, no, tx, fe, dc] = await Promise.all([
        marketingService.getClient(clientId), taxService.listNotaries(),
        taxService.listTax(clientId), taxService.listFees(clientId), documentService.list(clientId),
      ])
      setClient(cl); setNotaries(no); setTaxes(tx); setFees(fe); setDocs(dc)
      setPpjbNumber(cl.ppjb_number ?? ''); setAjbNumber(cl.ajb_number ?? '')
      // Dokumen legalitas otomatis diambil dari unit pembeli (dikelola di menu Dokumen Legalitas)
      setUnitDocs(cl.unit_id ? await documentService.listByUnit(cl.unit_id) : [])
    } catch { setError('Gagal memuat data legalitas.') } finally { setLoading(false) }
  }, [clientId])
  useEffect(() => { load() }, [load])

  const reload = async () => {
    const [tx, fe] = await Promise.all([taxService.listTax(clientId), taxService.listFees(clientId)])
    setTaxes(tx); setFees(fe)
  }
  const reloadDocs = async () => setDocs(await documentService.list(clientId))

  // document handlers — di halaman ini hanya BERKAS PEMBELI (identitas); dok legalitas unit read-only
  function openDocCreate() {
    setDocEditId(null); setDocForm(emptyDoc(clientId)); setDocModal(true)
  }
  function openDocEdit(d: DocumentItem) {
    setDocEditId(d.id)
    setDocForm({ client_id: clientId, doc_type: d.doc_type, name: d.name ?? '', status: d.status, doc_date: d.doc_date ?? '' })
    setDocModal(true)
  }
  async function submitDoc(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...docForm }
      const rec = p as unknown as Record<string, unknown>
      ;['name', 'doc_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (docEditId) await documentService.update(docEditId, p); else await documentService.create(p)
      setDocModal(false); await reloadDocs()
    } catch { setError('Gagal menyimpan dokumen.') } finally { setSaving(false) }
  }
  async function delDoc(id: string) {
    if (!confirm('Hapus (arsipkan) dokumen ini?')) return
    try { await documentService.remove(id); await reloadDocs() } catch { setError('Gagal menghapus dokumen.') }
  }
  async function viewDoc(id: string) {
    setViewingId(id)
    try { await documentService.openFile(id) } catch { setError('Gagal membuka file.') } finally { setViewingId(null) }
  }
  function triggerUpload(id: string) { pendingUpload.current = id; fileInput.current?.click() }
  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; const id = pendingUpload.current
    e.target.value = ''
    if (!file || !id) return
    setUploadingId(id)
    try { await documentService.uploadFile(id, file); await reloadDocs() }
    catch { setError('Gagal upload file (maks 10 MB).') } finally { setUploadingId(null) }
  }
  const notaryName = (id?: string) => notaries.find((n) => n.id === id)?.name

  // tax handlers
  function openTaxCreate() { setTaxEditId(null); setTaxForm(emptyTax(clientId)); setTaxModal(true) }
  function openTaxEdit(x: TaxRecord) {
    setTaxEditId(x.id)
    setTaxForm({ client_id: clientId, tax_type: x.tax_type, amount: x.amount, id_billing: x.id_billing ?? '', ntpn: x.ntpn ?? '', tax_date: x.tax_date ?? '', status: x.status, notary_id: x.notary_id ?? '' })
    setTaxModal(true)
  }
  async function submitTax(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...taxForm }
      if (!p.amount) delete p.amount
      const rec = p as unknown as Record<string, unknown>
      ;['id_billing', 'ntpn', 'tax_date', 'notary_id'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (taxEditId) await taxService.updateTax(taxEditId, p); else await taxService.createTax(p)
      setTaxModal(false); await reload()
    } catch { setError('Gagal menyimpan data pajak.') } finally { setSaving(false) }
  }
  async function delTax(id: string) {
    if (!confirm('Hapus (arsipkan) data pajak ini?')) return
    try { await taxService.deleteTax(id); await reload() } catch { setError('Gagal menghapus.') }
  }
  function triggerTaxUpload(id: string) { pendingTaxUpload.current = id; taxFileInput.current?.click() }
  async function onTaxFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; const id = pendingTaxUpload.current
    e.target.value = ''
    if (!file || !id) return
    setUploadingTaxId(id)
    try { await taxService.uploadTaxFile(id, file); await reload() }
    catch { setError('Gagal upload bukti pajak (maks 10 MB).') } finally { setUploadingTaxId(null) }
  }

  // fee handlers
  function openFeeCreate() { setFeeEditId(null); setFeeForm(emptyFee(clientId)); setFeeModal(true) }
  function openFeeEdit(f: NotaryFee) {
    setFeeEditId(f.id)
    setFeeForm({ client_id: clientId, description: f.description, amount: f.amount, fee_date: f.fee_date ?? '', is_paid: f.is_paid, notary_id: f.notary_id ?? '' })
    setFeeModal(true)
  }
  async function submitFee(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...feeForm }
      const rec = p as unknown as Record<string, unknown>
      ;['fee_date', 'notary_id'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (feeEditId) await taxService.updateFee(feeEditId, p); else await taxService.createFee(p)
      setFeeModal(false); await reload()
    } catch { setError('Gagal menyimpan biaya notaris.') } finally { setSaving(false) }
  }
  async function delFee(id: string) {
    if (!confirm('Hapus biaya ini?')) return
    try { await taxService.deleteFee(id); await reload() } catch { setError('Gagal menghapus.') }
  }

  // PPJB & AJB handlers
  async function saveDeedNumbers() {
    setSavingDeed(true); setError('')
    try {
      const updated = await marketingService.updateClient(clientId, { ppjb_number: ppjbNumber || undefined, ajb_number: ajbNumber || undefined })
      setClient(updated)
    } catch { setError('Gagal menyimpan No. PPJB/AJB.') } finally { setSavingDeed(false) }
  }
  async function onDeedFilePicked(kind: 'ppjb' | 'ajb', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingDeed(kind)
    try {
      const updated = kind === 'ppjb' ? await marketingService.uploadPpjbFile(clientId, file) : await marketingService.uploadAjbFile(clientId, file)
      setClient(updated)
    } catch { setError(`Gagal upload file ${kind.toUpperCase()} (maks 10 MB).`) } finally { setUploadingDeed(null) }
  }

  const totalFee = fees.reduce((a, f) => a + Number(f.amount || 0), 0)

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  function docTable(list: DocumentItem[], emptyMsg: string, readOnly = false) {
    return (
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>{['Jenis', 'Nomor', 'Status', 'File', ...(readOnly ? [] : [''])].map((h, i) => (
            <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.length === 0 ? (
            <tr><td colSpan={readOnly ? 4 : 5} className="px-4 py-6 text-center text-slate-400 text-sm">{emptyMsg}</td></tr>
          ) : list.map((d) => {
            const st = docStatusCfg[d.status]
            return (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{d.doc_type}</td>
                <td className="px-4 py-2.5 text-slate-500">{d.name ?? '—'}</td>
                <td className="px-4 py-2.5">{st && <Badge label={st.label} variant={st.variant} />}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {d.has_file ? (
                      <button onClick={() => viewDoc(d.id)} disabled={viewingId === d.id} className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs disabled:opacity-60" title={d.file_name}>
                        {viewingId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Lihat
                      </button>
                    ) : readOnly ? <span className="text-slate-400 text-xs">—</span> : null}
                    {!readOnly && (
                      <button onClick={() => triggerUpload(d.id)} className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-600 text-xs">
                        {uploadingId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {d.has_file ? 'Ganti' : 'Upload'}
                      </button>
                    )}
                  </div>
                </td>
                {!readOnly && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openDocEdit(d)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => delDoc(d.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/marketing/clients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-1"><ArrowLeft size={14} /> Daftar Pembeli</Link>
        <h1 className="text-lg font-semibold text-slate-900">{client?.full_name ?? 'Pembeli'}</h1>
        <p className="text-sm text-slate-500">Dokumen, pajak & notaris — arsip tersimpan di sisi Anda sendiri</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {/* hidden file inputs untuk upload */}
      <input ref={fileInput} type="file" className="hidden" onChange={onFilePicked} />
      <input ref={taxFileInput} type="file" className="hidden" onChange={onTaxFilePicked} />
      <input ref={ppjbFileInput} type="file" className="hidden" onChange={(e) => onDeedFilePicked('ppjb', e)} />
      <input ref={ajbFileInput} type="file" className="hidden" onChange={(e) => onDeedFilePicked('ajb', e)} />

      {/* Berkas Pembeli (identitas) */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Contact size={15} /> Berkas Pembeli</h2>
          <button className="btn-primary text-xs flex items-center gap-1" onClick={openDocCreate}><Plus size={13} /> Tambah Berkas</button>
        </div>
        {docTable(docs, 'Belum ada berkas identitas. Tambahkan KTP, KK, NPWP.')}
      </div>

      {/* Dokumen & Legalitas (unit) — read-only, otomatis dari unit */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><FileText size={15} /> Dokumen & Legalitas Unit</h2>
          <Link to="/property/legal-docs" className="text-xs text-brand-600 hover:underline">Kelola di menu Dokumen Legalitas →</Link>
        </div>
        {!client?.unit_id
          ? <p className="px-4 py-6 text-center text-slate-400 text-sm">Pembeli belum terhubung ke unit — dokumen legalitas mengikuti unit.</p>
          : docTable(unitDocs, 'Belum ada dokumen legalitas untuk unit ini. Tambahkan di menu Properti → Dokumen Legalitas.', true)}
      </div>

      {/* PPJB & AJB */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><FileSignature size={15} /> PPJB & AJB</h2>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div>
            <label className="label">No. PPJB</label>
            <input className="input" placeholder="Nomor Perjanjian Pengikatan Jual Beli" value={ppjbNumber} onChange={(e) => setPpjbNumber(e.target.value)} />
            <div className="flex items-center gap-3 mt-2 text-xs">
              {client?.has_ppjb_file && (
                <button onClick={() => marketingService.openPpjbFile(clientId)} className="inline-flex items-center gap-1 text-brand-600 hover:underline"><Eye size={13} /> Lihat File</button>
              )}
              <button onClick={() => ppjbFileInput.current?.click()} className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-600">
                {uploadingDeed === 'ppjb' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {client?.has_ppjb_file ? 'Ganti File' : 'Upload File'}
              </button>
            </div>
          </div>
          <div>
            <label className="label">No. AJB</label>
            <input className="input" placeholder="Nomor Akta Jual Beli" value={ajbNumber} onChange={(e) => setAjbNumber(e.target.value)} />
            <div className="flex items-center gap-3 mt-2 text-xs">
              {client?.has_ajb_file && (
                <button onClick={() => marketingService.openAjbFile(clientId)} className="inline-flex items-center gap-1 text-brand-600 hover:underline"><Eye size={13} /> Lihat File</button>
              )}
              <button onClick={() => ajbFileInput.current?.click()} className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-600">
                {uploadingDeed === 'ajb' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {client?.has_ajb_file ? 'Ganti File' : 'Upload File'}
              </button>
            </div>
          </div>
          <div className="col-span-2 flex justify-end">
            <button onClick={saveDeedNumbers} disabled={savingDeed} className="btn-primary text-xs flex items-center gap-2">
              {savingDeed && <Loader2 size={13} className="animate-spin" />} Simpan No. PPJB/AJB
            </button>
          </div>
        </div>
      </div>

      {/* Pajak */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Receipt size={15} /> Perpajakan</h2>
          <button className="btn-primary text-xs flex items-center gap-1" onClick={openTaxCreate}><Plus size={13} /> Tambah Pajak</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>{['Jenis', 'Jumlah', 'ID Billing', 'NTPN', 'Status', 'Notaris', 'Bukti', ''].map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {taxes.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada data pajak (PPh / BPHTB / PPN).</td></tr>
            ) : taxes.map((x) => {
              const st = taxStatusCfg[x.status]
              return (
                <tr key={x.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{taxTypeLabel[x.tax_type]}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmt(x.amount)}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{x.id_billing ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{x.ntpn ?? '—'}</td>
                  <td className="px-4 py-2.5">{st && <Badge label={st.label} variant={st.variant} />}</td>
                  <td className="px-4 py-2.5 text-slate-500">{x.notary_name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {x.has_file && (
                        <button onClick={() => taxService.openTaxFile(x.id)} className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs" title={x.file_name}>
                          <Eye size={13} /> Lihat
                        </button>
                      )}
                      <button onClick={() => triggerTaxUpload(x.id)} className="inline-flex items-center gap-1 text-slate-500 hover:text-brand-600 text-xs">
                        {uploadingTaxId === x.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {x.has_file ? 'Ganti' : 'Upload'}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openTaxEdit(x)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => delTax(x.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Biaya Notaris */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Scale size={15} /> Biaya Notaris {totalFee > 0 && <span className="text-slate-400 font-normal">· total {fmt(totalFee)}</span>}</h2>
          <button className="btn-primary text-xs flex items-center gap-1" onClick={openFeeCreate}><Plus size={13} /> Tambah Biaya</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>{['Uraian', 'Nominal', 'Tanggal', 'Notaris', 'Status', ''].map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fees.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada rincian biaya notaris.</td></tr>
            ) : fees.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{f.description}</td>
                <td className="px-4 py-2.5 text-slate-600">{fmt(f.amount)}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(f.fee_date)}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.notary_name ?? '—'}</td>
                <td className="px-4 py-2.5">{f.is_paid ? <Badge label="Lunas" variant="green" /> : <Badge label="Belum" variant="gray" />}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => openFeeEdit(f)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => delFee(f.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Dokumen */}
      <Modal open={docModal} onClose={() => setDocModal(false)} title={docEditId ? 'Edit Berkas Pembeli' : 'Tambah Berkas Pembeli'}>
        <form onSubmit={submitDoc} className="space-y-3">
          <div>
            <label className="label">Jenis Dokumen *</label>
            <input className="input" required list="doc-presets" placeholder="KTP / KK / NPWP ..." value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })} />
            <datalist id="doc-presets">{IDENTITY_PRESETS.map((d) => <option key={d} value={d} />)}</datalist>
          </div>
          <div>
            <label className="label">Nomor</label>
            <input className="input" placeholder="Nomor dokumen (mis. no. KTP / NPWP)" value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={docForm.status} onChange={(e) => setDocForm({ ...docForm, status: e.target.value as DocStatus })}>
                {(Object.keys(docStatusCfg) as DocStatus[]).map((k) => <option key={k} value={k}>{docStatusCfg[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tanggal</label>
              <input className="input" type="date" value={docForm.doc_date} onChange={(e) => setDocForm({ ...docForm, doc_date: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-slate-400">File bisa diupload dari tombol Upload di tabel setelah dokumen dibuat (maks 10 MB).</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setDocModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Pajak */}
      <Modal open={taxModal} onClose={() => setTaxModal(false)} title={taxEditId ? 'Edit Pajak' : 'Tambah Pajak'}>
        <form onSubmit={submitTax} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jenis Pajak *</label>
              <select className="input" value={taxForm.tax_type} onChange={(e) => setTaxForm({ ...taxForm, tax_type: e.target.value as TaxType })}>
                {(Object.keys(taxTypeLabel) as TaxType[]).map((k) => <option key={k} value={k}>{taxTypeLabel[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={taxForm.status} onChange={(e) => setTaxForm({ ...taxForm, status: e.target.value as TaxStatus })}>
                {(Object.keys(taxStatusCfg) as TaxStatus[]).map((k) => <option key={k} value={k}>{taxStatusCfg[k].label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jumlah (Rp)</label>
              <MoneyInput value={taxForm.amount} onChange={(v) => setTaxForm({ ...taxForm, amount: v })} />
            </div>
            <div>
              <label className="label">Tanggal</label>
              <input className="input" type="date" value={taxForm.tax_date} onChange={(e) => setTaxForm({ ...taxForm, tax_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ID Billing</label>
              <input className="input" placeholder="Kode billing DJP" value={taxForm.id_billing} onChange={(e) => setTaxForm({ ...taxForm, id_billing: e.target.value })} />
            </div>
            <div>
              <label className="label">NTPN</label>
              <input className="input" placeholder="Bukti setelah bayar" value={taxForm.ntpn} onChange={(e) => setTaxForm({ ...taxForm, ntpn: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Dibayar via Notaris</label>
            <select className="input" value={taxForm.notary_id} onChange={(e) => setTaxForm({ ...taxForm, notary_id: e.target.value })}>
              <option value="">— (bayar sendiri)</option>
              {notaries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setTaxModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Biaya */}
      <Modal open={feeModal} onClose={() => setFeeModal(false)} title={feeEditId ? 'Edit Biaya' : 'Tambah Biaya Notaris'}>
        <form onSubmit={submitFee} className="space-y-3">
          <div>
            <label className="label">Uraian *</label>
            <input className="input" required placeholder="Jasa AJB / BBN / pengurusan sertifikat" value={feeForm.description} onChange={(e) => setFeeForm({ ...feeForm, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nominal (Rp) *</label>
              <MoneyInput required value={feeForm.amount || undefined} onChange={(v) => setFeeForm({ ...feeForm, amount: v ?? 0 })} />
            </div>
            <div>
              <label className="label">Tanggal</label>
              <input className="input" type="date" value={feeForm.fee_date} onChange={(e) => setFeeForm({ ...feeForm, fee_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Notaris</label>
              <select className="input" value={feeForm.notary_id} onChange={(e) => setFeeForm({ ...feeForm, notary_id: e.target.value })}>
                <option value="">— pilih —</option>
                {notaries.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={feeForm.is_paid} onChange={(e) => setFeeForm({ ...feeForm, is_paid: e.target.checked })} /> Sudah dibayar
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setFeeModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
