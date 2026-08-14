import { useEffect, useState, useCallback } from 'react'
import { Loader2, FileText, RotateCcw, Check } from 'lucide-react'
import { usersService } from '../../services/users'
import { useAuth } from '../../context/AuthContext'
import { hasAnyRole } from '../../utils/access'
import type { DocumentText, DocTextScope } from '../../types'

const DOC_KEY = 'surat_permohonan_bank'

export default function DocumentTexts() {
  const { user } = useAuth()
  const canManage = hasAnyRole(user, ['owner', 'admin'])
  const [scopes, setScopes] = useState<DocTextScope[]>([])
  const [scope, setScope] = useState<string>('')      // '' = default (semua bank), else bank_id
  const [doc, setDoc] = useState<DocumentText | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const loadScopes = useCallback(() => {
    usersService.listDocumentTextScopes(DOC_KEY).then((r) => setScopes(r.scopes)).catch(() => {})
  }, [])

  const loadDoc = useCallback((bankId: string) => {
    setLoading(true); setMsg('')
    usersService.getDocumentText(DOC_KEY, bankId || undefined)
      .then((d) => { setDoc(d); setSubject(d.subject); setBody(d.body) })
      .catch(() => setError('Gagal memuat teks dokumen.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (canManage) { loadScopes(); loadDoc('') } else setLoading(false) }, [canManage, loadScopes, loadDoc])

  const changeScope = (v: string) => { setScope(v); loadDoc(v) }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setMsg(''); setError('')
    try {
      const d = await usersService.updateDocumentText(DOC_KEY, { subject, body }, scope || undefined)
      setDoc(d); setSubject(d.subject); setBody(d.body); setMsg('Teks dokumen tersimpan.'); loadScopes()
    } catch { setError('Gagal menyimpan.') } finally { setSaving(false) }
  }

  const resetDefault = async () => {
    const label = scope ? 'template bank ini' : 'template default'
    if (!confirm(`Hapus ${label} dan kembali ke ${scope ? 'template default' : 'teks bawaan'}?`)) return
    setSaving(true); setMsg(''); setError('')
    try {
      const d = await usersService.updateDocumentText(DOC_KEY, { subject: '', body: '' }, scope || undefined)
      setDoc(d); setSubject(d.subject); setBody(d.body); setMsg('Dikembalikan.'); loadScopes()
    } catch { setError('Gagal.') } finally { setSaving(false) }
  }

  const insertVar = (v: string) => setBody((b) => `${b}{{${v}}}`)

  if (!canManage) return <div className="card p-8 text-center text-slate-400 text-sm">Hanya Pemilik/Admin yang dapat mengatur teks dokumen.</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><FileText size={20} /> Teks Dokumen</h1>
        <p className="text-sm text-slate-500 mt-0.5">Sesuaikan kalimat surat dengan bahasa perusahaan Anda. Angka & data terisi otomatis. Bisa dibuat berbeda per bank.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2 flex items-center gap-2"><Check size={15} /> {msg}</div>}

      <form onSubmit={save} className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Surat Permohonan ke Bank</h2>
          {doc?.is_custom
            ? <span className="text-xs rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5">Disesuaikan</span>
            : <span className="text-xs rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">Ikut fallback</span>}
        </div>

        <div>
          <label className="label">Berlaku untuk</label>
          <select className="input w-full sm:w-72" value={scope} onChange={(e) => changeScope(e.target.value)}>
            {scopes.map((s) => (
              <option key={s.bank_id ?? 'default'} value={s.bank_id ?? ''}>
                {s.bank_name}{s.is_custom ? ' • khusus' : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">
            {scope ? 'Template khusus bank ini. Jika kosong, otomatis pakai template Default.' : 'Template Default dipakai untuk semua bank yang belum punya template sendiri.'}
          </p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></div>
        ) : (
          <>
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
              <p className="text-[11px] text-slate-400 mt-1.5">Info khusus bank (alamat cabang, kota) cukup diketik langsung di isi surat bank tersebut.</p>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <button type="button" onClick={resetDefault} disabled={saving || !doc?.is_custom} className="btn-secondary text-sm flex items-center gap-1.5 text-slate-500 disabled:opacity-40">
                <RotateCcw size={14} /> {scope ? 'Hapus template bank ini' : 'Kembalikan ke standar'}
              </button>
              <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
              </button>
            </div>
          </>
        )}
      </form>

      <p className="text-xs text-slate-400">Cetak suratnya dari halaman KPR pembeli → tombol <b>Surat ke Bank</b> (otomatis pakai template sesuai bank pengajuan).</p>
    </div>
  )
}
