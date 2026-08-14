import { useEffect, useState } from 'react'
import { Loader2, FileText, RotateCcw, Check } from 'lucide-react'
import { usersService } from '../../services/users'
import { useAuth } from '../../context/AuthContext'
import { hasAnyRole } from '../../utils/access'
import type { DocumentText } from '../../types'

const DOC_KEY = 'surat_permohonan_bank'

export default function DocumentTexts() {
  const { user } = useAuth()
  const canManage = hasAnyRole(user, ['owner', 'admin'])
  const [doc, setDoc] = useState<DocumentText | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canManage) { setLoading(false); return }
    usersService.getDocumentText(DOC_KEY)
      .then((d) => { setDoc(d); setSubject(d.subject); setBody(d.body) })
      .catch(() => setError('Gagal memuat teks dokumen.'))
      .finally(() => setLoading(false))
  }, [canManage])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setMsg(''); setError('')
    try {
      const d = await usersService.updateDocumentText(DOC_KEY, { subject, body })
      setDoc(d); setSubject(d.subject); setBody(d.body); setMsg('Teks dokumen tersimpan.')
    } catch { setError('Gagal menyimpan.') } finally { setSaving(false) }
  }

  const resetDefault = async () => {
    if (!confirm('Kembalikan teks ke standar bawaan?')) return
    setSaving(true); setMsg(''); setError('')
    try {
      const d = await usersService.updateDocumentText(DOC_KEY, { subject: '', body: '' })
      setDoc(d); setSubject(d.subject); setBody(d.body); setMsg('Dikembalikan ke standar.')
    } catch { setError('Gagal.') } finally { setSaving(false) }
  }

  const insertVar = (v: string) => setBody((b) => `${b}{{${v}}}`)

  if (!canManage) return <div className="card p-8 text-center text-slate-400 text-sm">Hanya Pemilik/Admin yang dapat mengatur teks dokumen.</div>
  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><FileText size={20} /> Teks Dokumen</h1>
        <p className="text-sm text-slate-500 mt-0.5">Sesuaikan kalimat dokumen dengan bahasa perusahaan Anda. Angka & data terisi otomatis.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2 flex items-center gap-2"><Check size={15} /> {msg}</div>}

      <form onSubmit={save} className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Surat Permohonan ke Bank</h2>
          {doc?.is_custom
            ? <span className="text-xs rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5">Disesuaikan</span>
            : <span className="text-xs rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">Standar</span>}
        </div>

        <div>
          <label className="label">Perihal</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Isi surat</label>
          <textarea className="input font-mono text-[13px] min-h-[260px]" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-1.5">Klik untuk sisipkan variabel (terisi otomatis saat cetak):</p>
          <div className="flex flex-wrap gap-1.5">
            {(doc?.variables ?? []).map((v) => (
              <button type="button" key={v} onClick={() => insertVar(v)}
                className="text-[11px] font-mono rounded bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 transition-colors">
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <button type="button" onClick={resetDefault} disabled={saving} className="btn-secondary text-sm flex items-center gap-1.5 text-slate-500">
            <RotateCcw size={14} /> Kembalikan ke standar
          </button>
          <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
          </button>
        </div>
      </form>

      <p className="text-xs text-slate-400">Cetak suratnya dari halaman KPR pembeli → tombol <b>Surat ke Bank</b>.</p>
    </div>
  )
}
