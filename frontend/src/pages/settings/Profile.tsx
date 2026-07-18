import { useEffect, useState, useRef } from 'react'
import { Loader2, Building2, Upload, Trash2, ShieldAlert } from 'lucide-react'
import { usersService, tenantLogoUrl } from '../../services/users'
import { useAuth } from '../../context/AuthContext'
import type { TenantProfile, TenantProfileUpdate } from '../../types'

export default function Profile() {
  const { user } = useAuth()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [profile, setProfile] = useState<TenantProfile | null>(null)
  const [form, setForm] = useState<TenantProfileUpdate>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [logoBust, setLogoBust] = useState(0)   // paksa <img> reload setelah ganti/hapus logo
  const fileInput = useRef<HTMLInputElement | null>(null)

  const load = () => {
    setLoading(true); setError('')
    usersService.getTenantProfile()
      .then((p) => { setProfile(p); setForm({ company_name: p.company_name ?? '', phone: p.phone ?? '', address: p.address ?? '', city: p.city ?? '', province: p.province ?? '' }) })
      .catch(() => setError('Gagal memuat profil perusahaan.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (canManage) load(); else setLoading(false) }, [canManage])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setMsg('')
    try {
      const payload = { ...form }
      const rec = payload as unknown as Record<string, unknown>
      ;['company_name', 'phone', 'address', 'city', 'province'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      const p = await usersService.updateTenantProfile(payload)
      setProfile(p)
      setMsg('Profil perusahaan tersimpan.')
    } catch {
      setError('Gagal menyimpan profil.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Ukuran logo maksimal 2 MB.'); return }
    setUploading(true); setError('')
    try {
      const p = await usersService.uploadTenantLogo(file)
      setProfile(p)
      setLogoBust((v) => v + 1)
    } catch {
      setError('Gagal mengunggah logo.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteLogo() {
    if (!profile || !confirm('Hapus logo perusahaan?')) return
    try {
      const p = await usersService.deleteTenantLogo()
      setProfile(p)
      setLogoBust((v) => v + 1)
    } catch {
      setError('Gagal menghapus logo.')
    }
  }

  if (!canManage) {
    return (
      <div className="card p-8 text-center text-slate-500">
        <ShieldAlert size={28} className="mx-auto mb-2 text-slate-400" />
        <p className="text-sm">Hanya Pemilik atau Admin yang dapat mengubah profil perusahaan.</p>
      </div>
    )
  }
  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (!profile) return <div className="text-slate-400 text-sm">Data tidak tersedia.</div>

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-slate-500">
        Logo & data perusahaan di sini dipakai otomatis sebagai kop di dokumen cetak (BAST, Kwitansi, Pengajuan Pembayaran).
      </p>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2">{msg}</div>}

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4"><Building2 size={18} className="text-brand-600" /><h2 className="font-semibold text-slate-900">Logo Perusahaan</h2></div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg border border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
            {profile.has_logo ? (
              <img src={`${tenantLogoUrl(profile.slug)}?v=${logoBust}`} alt="Logo perusahaan" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] text-slate-400 text-center px-1">Belum ada logo</span>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary text-sm flex items-center gap-1.5" disabled={uploading}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {profile.has_logo ? 'Ganti Logo' : 'Unggah Logo'}
              </button>
              {profile.has_logo && (
                <button type="button" onClick={handleDeleteLogo} className="text-slate-400 hover:text-red-600 transition-colors" title="Hapus logo">
                  <Trash2 size={16} />
                </button>
              )}
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleLogoPicked} />
            </div>
            <p className="text-xs text-slate-400">PNG/JPG, maks 2 MB. Latar transparan disarankan.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-3">
        <h2 className="font-semibold text-slate-900 mb-1">Data Perusahaan</h2>
        <div>
          <label className="label">Nama Perusahaan</label>
          <input className="input" value={form.company_name ?? ''} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder={profile.name} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">No. HP / Telepon</label>
            <input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Kota</label>
            <input className="input" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Provinsi</label>
            <input className="input" value={form.province ?? ''} onChange={(e) => setForm({ ...form, province: e.target.value })} />
          </div>
          <div>
            <label className="label">Alamat</label>
            <input className="input" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Simpan
          </button>
        </div>
      </form>
    </div>
  )
}
