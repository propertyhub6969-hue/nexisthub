import { useEffect, useState, useCallback } from 'react'
import { Loader2, FileText, RotateCcw, Check } from 'lucide-react'
import { usersService } from '../../services/users'
import { useAuth } from '../../context/AuthContext'
import { hasAnyRole } from '../../utils/access'
import type { DocumentText, DocTextScope, DocTypeMeta } from '../../types'

export default function DocumentTexts() {
  const { user } = useAuth()
  const canManage = hasAnyRole(user, ['owner', 'admin'])
  const [types, setTypes] = useState<DocTypeMeta[]>([])
  const [docKey, setDocKey] = useState('')
  const [scopes, setScopes] = useState<DocTextScope[]>([])
  const [scope, setScope] = useState<string>('')      // '' = default, else bank_id
  const [doc, setDoc] = useState<DocumentText | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const meta = types.find((t) => t.key === docKey)

  const loadScopes = useCallback((dk: string, perBank: boolean) => {
    if (!perBank) { setScopes([]); return }
    usersService.listDocumentTextScopes(dk).then((r) => setScopes(r.scopes)).catch(() => {})
  }, [])

  const loadDoc = useCallback((dk: string, bankId: string) => {
    if (!dk) return
    setLoading(true); setMsg('')
    usersService.getDocumentText(dk, bankId || undefined)
      .then((d) => { setDoc(d); setSubject(d.subject); setBody(d.body); setSignerName(d.signer_name ?? ''); setSignerTitle(d.signer_title ?? '') })
      .catch(() => setError('Gagal memuat teks dokumen.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!canManage) { setLoading(false); return }
    usersService.listDocumentTypes().then((t) => {
      setTypes(t)
      if (t.length) { setDocKey(t[0].key); setScope(''); loadScopes(t[0].key, t[0].per_bank); loadDoc(t[0].key, '') }
    }).catch(() => setLoading(false))
  }, [canManage, loadScopes, loadDoc])

  const changeType = (dk: string) => {
    const m = types.find((t) => t.key === dk)
    setDocKey(dk); setScope(''); loadScopes(dk, m?.per_bank ?? false); loadDoc(dk, '')
  }
  const changeScope = (v: string) => { setScope(v); loadDoc(docKey, v) }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setMsg(''); setError('')
    try {
      const d = await usersService.updateDocumentText(docKey, { subject, body, signer_name: signerName, signer_title: signerTitle }, scope || undefined)
      setDoc(d); setSubject(d.subject); setBody(d.body); setSignerName(d.signer_name ?? ''); setSignerTitle(d.signer_title ?? '')
      setMsg('Teks dokumen tersimpan.'); if (meta?.per_bank) loadScopes(docKey, true)
    } catch { setError('Gagal menyimpan.') } finally { setSaving(false) }
  }

  const resetDefault = async () => {
    if (!confirm('Hapus penyesuaian dan kembali ke teks bawaan?')) return
    setSaving(true); setMsg(''); setError('')
    try {
      const d = await usersService.updateDocumentText(docKey, { subject: '', body: '', signer_name: '', signer_title: '' }, scope || undefined)
      setDoc(d); setSubject(d.subject); setBody(d.body); setSignerName(d.signer_name ?? ''); setSignerTitle(d.signer_title ?? '')
      setMsg('Dikembalikan.'); if (meta?.per_bank) loadScopes(docKey, true)
    } catch { setError('Gagal.') } finally { setSaving(false) }
  }

  const insertVar = (v: string) => setBody((b) => `${b}{{${v}}}`)

  if (!canManage) return <div className="card p-8 text-center text-slate-400 text-sm">Hanya Pemilik/Admin yang dapat mengatur teks dokumen.</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><FileText size={20} /> Teks Dokumen</h1>
        <p className="text-sm text-slate-500 mt-0.5">Sesuaikan kalimat &amp; ketentuan dokumen dengan bahasa perusahaan Anda. Angka, tabel &amp; data tetap dari sistem.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2 flex items-center gap-2"><Check size={15} /> {msg}</div>}

      <form onSubmit={save} className="card p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Jenis dokumen</label>
            <select className="input" value={docKey} onChange={(e) => changeType(e.target.value)}>
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          {meta?.per_bank && (
            <div>
              <label className="label flex items-center justify-between">
                <span>Berlaku untuk</span>
                {doc?.is_custom
                  ? <span className="text-[10px] rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5">Disesuaikan</span>
                  : <span className="text-[10px] rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">Ikut fallback</span>}
              </label>
              <select className="input" value={scope} onChange={(e) => changeScope(e.target.value)}>
                {scopes.map((s) => (
                  <option key={s.bank_id ?? 'default'} value={s.bank_id ?? ''}>
                    {s.bank_name}{s.is_custom ? ' • khusus' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {meta?.per_bank && (
          <p className="text-[11px] text-slate-400 -mt-1">
            {scope ? 'Template khusus bank ini. Jika kosong, otomatis pakai template Default.' : 'Template Default dipakai untuk semua bank yang belum punya template sendiri.'}
          </p>
        )}

        {loading ? (
          <div className="py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></div>
        ) : (
          <>
            {meta?.has_subject && (
              <div>
                <label className="label">Perihal</label>
                <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label">{meta?.has_subject ? 'Isi surat' : 'Ketentuan / catatan'}</label>
              <textarea className="input font-mono text-[13px] min-h-[220px]" value={body} onChange={(e) => setBody(e.target.value)} />
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

            {meta?.has_signer && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="label">Nama penandatangan</label>
                  <input className="input" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Kosong = nama perusahaan" />
                </div>
                <div>
                  <label className="label">Jabatan penandatangan</label>
                  <input className="input" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="mis. Direktur" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <button type="button" onClick={resetDefault} disabled={saving || !doc?.is_custom} className="btn-secondary text-sm flex items-center gap-1.5 text-slate-500 disabled:opacity-40">
                <RotateCcw size={14} /> Kembalikan ke standar
              </button>
              <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
              </button>
            </div>
          </>
        )}
      </form>

      <p className="text-xs text-slate-400">
        Cetak: surat bank dari halaman <b>KPR pembeli</b>; kuitansi &amp; form penjualan dari halaman <b>Pembayaran pembeli</b>.
      </p>
    </div>
  )
}
