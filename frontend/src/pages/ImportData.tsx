import { useEffect, useRef, useState } from 'react'
import { Download, Upload, Loader2, CheckCircle2, PlusCircle, RefreshCw, AlertTriangle, FileSpreadsheet, History, RotateCcw } from 'lucide-react'
import { importDataService } from '../services/importData'
import type { ImportPreview, ImportCommitResult, ImportBatch } from '../types'

const ENTITY_LABEL: Record<string, string> = { units: 'Unit', clients: 'Pembeli & Kontrak', documents: 'Dokumen Legalitas', payments: 'Pembayaran' }

const actionCfg: Record<string, { label: string; cls: string; icon: typeof PlusCircle }> = {
  insert: { label: 'Baru', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: PlusCircle },
  update: { label: 'Perbarui', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: RefreshCw },
  skip: { label: 'Dilewati', cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: RefreshCw },
  error: { label: 'Error', cls: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
}

type Entity = 'units' | 'clients' | 'documents' | 'payments'
const ENTITY: Record<Entity, {
  tab: string; noun: string; unitCol: string; keyHint: string; archive?: boolean
  download: () => Promise<void>
  preview: (f: File) => Promise<ImportPreview>
  commit: (f: File, a?: File | null) => Promise<ImportCommitResult>
}> = {
  units: {
    tab: 'Unit', noun: 'unit', unitCol: 'Unit (Proyek / Blok / No.)',
    keyHint: 'Proyek + Blok + Nomor Unit',
    download: () => importDataService.downloadUnitsTemplate(),
    preview: (f) => importDataService.previewUnits(f),
    commit: (f) => importDataService.commitUnits(f),
  },
  clients: {
    tab: 'Pembeli & Kontrak', noun: 'pembeli', unitCol: 'Pembeli',
    keyHint: 'NIK (bila ada), atau Proyek + Nomor Unit',
    download: () => importDataService.downloadClientsTemplate(),
    preview: (f) => importDataService.previewClients(f),
    commit: (f) => importDataService.commitClients(f),
  },
  documents: {
    tab: 'Dokumen Legalitas', noun: 'dokumen', unitCol: 'Dokumen', archive: true,
    keyHint: 'Proyek + (Blok) + Nomor Unit + Jenis Dokumen',
    download: () => importDataService.downloadDocumentsTemplate(),
    preview: (f) => importDataService.previewDocuments(f),
    commit: (f, a) => importDataService.commitDocuments(f, a),
  },
  payments: {
    tab: 'Pembayaran', noun: 'pembayaran', unitCol: 'Pembayaran',
    keyHint: 'NIK (bila ada) / Proyek + Nomor Unit; anti-dobel: No. Referensi atau (pembeli+tanggal+jumlah)',
    download: () => importDataService.downloadPaymentsTemplate(),
    preview: (f) => importDataService.previewPayments(f),
    commit: (f) => importDataService.commitPayments(f),
  },
}

export default function ImportData() {
  const [entity, setEntity] = useState<Entity>('units')
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<ImportCommitResult | null>(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [archive, setArchive] = useState<File | null>(null)
  const archiveRef = useRef<HTMLInputElement>(null)
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const cfg = ENTITY[entity]

  function loadBatches() { importDataService.listBatches().then(setBatches).catch(() => {}) }
  useEffect(() => { loadBatches() }, [])

  async function undo(b: ImportBatch) {
    if (!window.confirm(`Batalkan impor ${ENTITY_LABEL[b.entity]} ini? ${b.inserted} data yang DITAMBAH akan dihapus (yang diperbarui tidak dikembalikan).`)) return
    setUndoingId(b.id); setError('')
    try {
      const r = await importDataService.undoBatch(b.id)
      loadBatches()
      alert(`Dibatalkan: ${r.deleted} data dihapus${r.files_removed ? `, ${r.files_removed} file dihapus` : ''}.`)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Gagal membatalkan batch.')
    } finally { setUndoingId(null) }
  }

  function reset() {
    setFile(null); setArchive(null); setPreview(null); setResult(null); setError('')
    if (fileRef.current) fileRef.current.value = ''
    if (archiveRef.current) archiveRef.current.value = ''
  }
  function switchEntity(e: Entity) { if (e !== entity) { setEntity(e); reset() } }

  async function download() {
    setDownloading(true); setError('')
    try { await cfg.download() }
    catch { setError('Gagal mengunduh template.') }
    finally { setDownloading(false) }
  }

  async function runPreview(f: File | null) {
    setPreview(null); setResult(null); setError('')
    if (!f) return
    setPreviewing(true)
    try { setPreview(await cfg.preview(f)) }
    catch (e: any) { setError(e?.response?.data?.detail ?? 'Gagal membaca file. Pastikan format sesuai template.') }
    finally { setPreviewing(false) }
  }
  function onPick(f: File | null) { setFile(f); runPreview(f) }
  function onPickArchive(a: File | null) { setArchive(a) }  // ZIP hanya dipakai saat Terapkan

  async function apply() {
    if (!file) return
    setCommitting(true); setError('')
    try {
      const res = await cfg.commit(file, archive)
      setResult(res); setPreview(null); setFile(null); setArchive(null)
      if (fileRef.current) fileRef.current.value = ''
      if (archiveRef.current) archiveRef.current.value = ''
      loadBatches()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Gagal menerapkan impor.')
    } finally { setCommitting(false) }
  }

  const applicable = preview ? preview.to_insert + preview.to_update : 0

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Impor Data</h2>
        <p className="text-sm text-slate-500 mt-0.5">Migrasi data dari Excel. Unduh template (sudah terisi data Anda) → lengkapi → unggah → pratinjau → terapkan.</p>
      </div>

      {/* Tab entitas */}
      <div className="flex gap-1 border-b border-slate-200">
        {(Object.keys(ENTITY) as Entity[]).map((e) => (
          <button key={e} onClick={() => switchEntity(e)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${entity === e ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {ENTITY[e].tab}
          </button>
        ))}
      </div>

      {/* Langkah 1 & 2 */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1"><span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">1</span><h3 className="text-sm font-semibold text-slate-800">Unduh Template</h3></div>
          <p className="text-xs text-slate-500 mb-3">File Excel berisi data {cfg.noun} Anda saat ini. Lengkapi kolom kosong. Kolom kunci jangan diubah.</p>
          <button onClick={download} disabled={downloading} className="btn-secondary text-sm inline-flex items-center gap-2">
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Unduh Template {cfg.tab}
          </button>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1"><span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">2</span><h3 className="text-sm font-semibold text-slate-800">Unggah &amp; Pratinjau</h3></div>
          <p className="text-xs text-slate-500 mb-3">Pilih file yang sudah dilengkapi. Sistem cek dulu — belum ada yang disimpan sampai Anda klik Terapkan.</p>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          <button onClick={() => fileRef.current?.click()} disabled={previewing} className="btn-secondary text-sm inline-flex items-center gap-2">
            {previewing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Pilih File Excel
          </button>
          {file && <p className="mt-2 text-xs text-slate-500 inline-flex items-center gap-1"><FileSpreadsheet size={13} /> {file.name}</p>}
          {cfg.archive && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-2">File scan (opsional) — kumpulkan semua PDF/JPG jadi <b>satu ZIP</b>. Cara mudah: beri nama file = <b>nomor unit</b> (mis. <code>001.pdf</code>) &amp; kosongkan kolom "Nama File" → dicocokkan otomatis. Atau isi kolom "Nama File" manual.</p>
              <input ref={archiveRef} type="file" accept=".zip" className="hidden" onChange={(e) => onPickArchive(e.target.files?.[0] ?? null)} />
              <button onClick={() => archiveRef.current?.click()} disabled={previewing} className="btn-secondary text-sm inline-flex items-center gap-2">
                <Upload size={15} /> Pilih File ZIP
              </button>
              {archive && <p className="mt-2 text-xs text-slate-500 inline-flex items-center gap-1"><FileSpreadsheet size={13} /> {archive.name}</p>}
            </div>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

      {result && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2"><CheckCircle2 size={16} /> Impor selesai</p>
          <p className="text-sm text-emerald-700 mt-1">{result.inserted} {cfg.noun} baru ditambahkan{result.updated ? ` · ${result.updated} diperbarui` : ''}{result.skipped ? ` · ${result.skipped} dilewati (dobel)` : ''}{result.error_count ? ` · ${result.error_count} baris error` : ''}.</p>
        </div>
      )}

      {/* Pratinjau */}
      {preview && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap gap-2">
              <Stat n={preview.to_insert} label="Baru" cls="text-emerald-600" />
              {entity !== 'payments' && <Stat n={preview.to_update} label="Diperbarui" cls="text-blue-600" />}
              {!!preview.to_skip && <Stat n={preview.to_skip} label="Dilewati (dobel)" cls="text-slate-500" />}
              <Stat n={preview.error_count} label="Error" cls={preview.error_count ? 'text-red-600' : 'text-slate-400'} />
              <Stat n={preview.total} label="Total baris" cls="text-slate-600" />
            </div>
            <button onClick={apply} disabled={committing || applicable === 0} className="btn-primary text-sm inline-flex items-center gap-2">
              {committing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Terapkan {applicable > 0 ? `(${applicable})` : ''}
            </button>
          </div>
          {preview.error_count > 0 && (
            <p className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">Baris error tidak akan diterapkan — perbaiki lalu unggah ulang bila perlu.</p>
          )}
          <div className="overflow-x-auto max-h-[55vh]">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Baris</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{cfg.unitCol}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((r) => {
                  const c = actionCfg[r.action]
                  const Icon = c.icon
                  return (
                    <tr key={r.row} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-400">{r.row}</td>
                      <td className="px-4 py-2"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${c.cls}`}><Icon size={12} />{c.label}</span></td>
                      <td className="px-4 py-2 font-medium text-slate-800 whitespace-nowrap">{r.label}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {r.action === 'error'
                          ? <span className="text-red-600">{(r.errors ?? []).join('; ')}</span>
                          : <span>{r.note ?? '—'}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Riwayat impor + undo */}
      <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <History size={15} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Riwayat Impor</h3>
            <span className="text-xs text-slate-400">— batalkan bila salah (menghapus data yang ditambah)</span>
          </div>
          {batches.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Belum ada impor yang tercatat. Impor yang Anda Terapkan mulai sekarang akan muncul di sini dan bisa dibatalkan.</p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Waktu', 'Jenis', 'Ditambah', 'Diperbarui', ''].map((h, i) => (
                    <th key={i} className={`px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider ${i > 1 && i < 4 ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <tr key={b.id} className={`hover:bg-slate-50 ${b.undone_at ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(b.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-2 text-slate-800">{ENTITY_LABEL[b.entity] ?? b.entity}</td>
                    <td className="px-4 py-2 text-center text-emerald-600 font-medium">{b.inserted}</td>
                    <td className="px-4 py-2 text-center text-blue-600">{b.updated}</td>
                    <td className="px-4 py-2 text-right">
                      {b.undone_at
                        ? <span className="text-xs text-slate-400">dibatalkan</span>
                        : b.can_undo
                          ? <button onClick={() => undo(b)} disabled={undoingId === b.id} className="text-xs inline-flex items-center gap-1 text-red-600 hover:text-red-700 disabled:opacity-50">
                              {undoingId === b.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Batalkan
                            </button>
                          : <span className="text-xs text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
      </div>

      <p className="text-xs text-slate-400">Kunci pencocokan: <b>{cfg.keyHint}</b>. Yang cocok akan <b>diperbarui</b> (kolom kosong tidak menimpa nilai lama); yang belum ada akan <b>ditambah</b>. {entity === 'clients' && 'Menautkan pembeli ke unit otomatis mengubah status unit (Dipesan/Terjual). '}{entity === 'payments' && 'Pembayaran impor langsung disetujui (data historis) & masuk Buku Kas. Fase ini hanya dari pembeli.'}</p>
    </div>
  )
}

function Stat({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5">
      <span className={`font-display text-lg font-bold ${cls}`}>{n}</span>
      <span className="text-xs text-slate-500 ml-1.5">{label}</span>
    </div>
  )
}
