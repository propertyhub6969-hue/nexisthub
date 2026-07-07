import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, KeyRound, Building2 } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { useAuth } from '../../context/AuthContext'
import { platformService } from '../../services/platform'
import type { TenantAdmin, TenantProvision, TenantAdminUpdate, TenantStatus } from '../../types'

const statusCfg: Record<TenantStatus, { label: string; variant: 'green' | 'yellow' | 'red' }> = {
  active: { label: 'Aktif', variant: 'green' },
  trial: { label: 'Trial', variant: 'yellow' },
  suspended: { label: 'Suspended', variant: 'red' },
}
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

export default function Platform() {
  const { user } = useAuth()
  const [modules, setModules] = useState<string[]>([])
  const [tenants, setTenants] = useState<TenantAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // create
  const [cModal, setCModal] = useState(false)
  const emptyCreate = (): TenantProvision => ({ name: '', owner_full_name: '', owner_email: '', owner_password: '', subscription_plan: 'trial', status: 'trial', expires_at: '', feature_flags: null })
  const [cForm, setCForm] = useState<TenantProvision>(emptyCreate())
  const [cAllModules, setCAllModules] = useState(true)

  // edit
  const [eTenant, setETenant] = useState<TenantAdmin | null>(null)
  const [eForm, setEForm] = useState<TenantAdminUpdate>({})
  const [eAllModules, setEAllModules] = useState(true)

  // reset pw
  const [pwTenant, setPwTenant] = useState<TenantAdmin | null>(null)
  const [newPw, setNewPw] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [m, t] = await Promise.all([platformService.listModules(), platformService.listTenants()])
      setModules(m); setTenants(t)
    } catch { setError('Gagal memuat data platform.') } finally { setLoading(false) }
  }
  useEffect(() => { if (user?.is_platform_admin) load() }, [user])

  if (user && !user.is_platform_admin) return <Navigate to="/dashboard" replace />

  function toggleFlag(list: string[] | null | undefined, mod: string, all: boolean): string[] {
    const base = all ? modules : (list ?? [])
    return base.includes(mod) ? base.filter((x) => x !== mod) : [...base, mod]
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const payload: TenantProvision = {
        ...cForm,
        expires_at: cForm.expires_at || null,
        feature_flags: cAllModules ? null : (cForm.feature_flags ?? []),
      }
      await platformService.createTenant(payload)
      setCModal(false); setCForm(emptyCreate()); setCAllModules(true); await load()
    } catch (e: any) { setError(e?.response?.data?.detail || 'Gagal membuat tenant.') } finally { setSaving(false) }
  }

  function openEdit(t: TenantAdmin) {
    setETenant(t)
    setEAllModules(t.feature_flags == null)
    setEForm({ name: t.name, status: t.status, is_active: t.is_active, subscription_plan: t.subscription_plan, expires_at: t.expires_at ?? '', feature_flags: t.feature_flags })
  }
  async function submitEdit(e: React.FormEvent) {
    e.preventDefault(); if (!eTenant) return; setSaving(true); setError('')
    try {
      await platformService.updateTenant(eTenant.id, {
        ...eForm,
        expires_at: eForm.expires_at || null,
        feature_flags: eAllModules ? null : (eForm.feature_flags ?? []),
      })
      setETenant(null); await load()
    } catch (e: any) { setError(e?.response?.data?.detail || 'Gagal menyimpan.') } finally { setSaving(false) }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault(); if (!pwTenant || newPw.length < 6) return; setSaving(true)
    try { await platformService.resetOwnerPassword(pwTenant.id, newPw); setPwTenant(null); setNewPw('') }
    catch (e: any) { setError(e?.response?.data?.detail || 'Gagal reset password.') } finally { setSaving(false) }
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  const summary = {
    total: tenants.length,
    active: tenants.filter((t) => t.status === 'active').length,
    trial: tenants.filter((t) => t.status === 'trial').length,
    suspended: tenants.filter((t) => t.status === 'suspended').length,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Building2 size={20} /> Control Plane — Pelanggan</h1>
        <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => { setCForm(emptyCreate()); setCAllModules(true); setCModal(true) }}><Plus size={15} /> Tenant Baru</button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4"><p className="text-xs text-slate-500">Total Tenant</p><p className="text-lg font-semibold text-slate-900">{summary.total}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Aktif</p><p className="text-lg font-semibold text-emerald-600">{summary.active}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Trial</p><p className="text-lg font-semibold text-amber-600">{summary.trial}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Suspended</p><p className="text-lg font-semibold text-red-600">{summary.suspended}</p></div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Tenant', 'Subdomain', 'Paket', 'Status', 'User', 'Owner', 'Aktif s/d', 'Modul', ''].map((h, i) => (
            <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada tenant. Klik "Tenant Baru".</td></tr>
            ) : tenants.map((t) => {
              const st = statusCfg[t.status]
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{t.name}{!t.is_active && <span className="ml-1 text-xs text-red-500">(nonaktif)</span>}</td>
                  <td className="px-4 py-2.5 text-slate-500">{t.slug}.nexisthub.id</td>
                  <td className="px-4 py-2.5 text-slate-600">{t.subscription_plan}</td>
                  <td className="px-4 py-2.5">{st && <Badge label={st.label} variant={st.variant} />}</td>
                  <td className="px-4 py-2.5 text-slate-500">{t.user_count}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{t.owner_email ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(t.expires_at)}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{t.feature_flags == null ? 'Semua' : `${t.feature_flags.length} modul`}</td>
                  <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-3">
                    <button onClick={() => openEdit(t)} className="text-slate-400 hover:text-brand-600" title="Kelola"><Pencil size={15} /></button>
                    <button onClick={() => { setPwTenant(t); setNewPw('') }} className="text-slate-400 hover:text-brand-600" title="Reset password owner"><KeyRound size={15} /></button>
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Create */}
      <Modal open={cModal} onClose={() => setCModal(false)} title="Provision Tenant Baru">
        <form onSubmit={submitCreate} className="space-y-3">
          <div><label className="label">Nama Perusahaan/Outlet *</label><input className="input" required minLength={2} value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Paket</label><input className="input" value={cForm.subscription_plan} onChange={(e) => setCForm({ ...cForm, subscription_plan: e.target.value })} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={cForm.status} onChange={(e) => setCForm({ ...cForm, status: e.target.value as TenantStatus })}>
                <option value="trial">Trial</option><option value="active">Aktif</option><option value="suspended">Suspended</option>
              </select></div>
          </div>
          <div><label className="label">Aktif s/d (opsional)</label><input className="input" type="date" value={cForm.expires_at ?? ''} onChange={(e) => setCForm({ ...cForm, expires_at: e.target.value })} /></div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-sm font-medium text-slate-700 mb-1">Akun Owner</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Nama Owner *</label><input className="input" required value={cForm.owner_full_name} onChange={(e) => setCForm({ ...cForm, owner_full_name: e.target.value })} /></div>
              <div><label className="label">Email *</label><input className="input" type="email" required value={cForm.owner_email} onChange={(e) => setCForm({ ...cForm, owner_email: e.target.value })} /></div>
            </div>
            <div className="mt-2"><label className="label">Password Awal *</label><input className="input" required minLength={6} value={cForm.owner_password} onChange={(e) => setCForm({ ...cForm, owner_password: e.target.value })} /></div>
          </div>
          <FlagEditor modules={modules} all={cAllModules} setAll={setCAllModules} flags={cForm.feature_flags ?? []} onToggle={(m) => setCForm({ ...cForm, feature_flags: toggleFlag(cForm.feature_flags, m, cAllModules) })} onCustom={() => setCAllModules(false)} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setCModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Buat</button>
          </div>
        </form>
      </Modal>

      {/* Edit */}
      <Modal open={!!eTenant} onClose={() => setETenant(null)} title={`Kelola — ${eTenant?.name ?? ''}`}>
        {eTenant && (
          <form onSubmit={submitEdit} className="space-y-3">
            <div><label className="label">Nama</label><input className="input" value={eForm.name ?? ''} onChange={(e) => setEForm({ ...eForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Paket</label><input className="input" value={eForm.subscription_plan ?? ''} onChange={(e) => setEForm({ ...eForm, subscription_plan: e.target.value })} /></div>
              <div><label className="label">Status</label>
                <select className="input" value={eForm.status} onChange={(e) => setEForm({ ...eForm, status: e.target.value as TenantStatus })}>
                  <option value="trial">Trial</option><option value="active">Aktif</option><option value="suspended">Suspended</option>
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><label className="label">Aktif s/d</label><input className="input" type="date" value={eForm.expires_at ?? ''} onChange={(e) => setEForm({ ...eForm, expires_at: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm text-slate-700 pb-2"><input type="checkbox" checked={!!eForm.is_active} onChange={(e) => setEForm({ ...eForm, is_active: e.target.checked })} /> Akun aktif (bisa login)</label>
            </div>
            <FlagEditor modules={modules} all={eAllModules} setAll={setEAllModules} flags={eForm.feature_flags ?? []} onToggle={(m) => setEForm({ ...eForm, feature_flags: toggleFlag(eForm.feature_flags, m, eAllModules) })} onCustom={() => setEAllModules(false)} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => setETenant(null)}>Batal</button>
              <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reset password */}
      <Modal open={!!pwTenant} onClose={() => setPwTenant(null)} title={`Reset Password Owner — ${pwTenant?.name ?? ''}`}>
        <form onSubmit={submitReset} className="space-y-3">
          <p className="text-sm text-slate-500">Owner: <span className="font-medium">{pwTenant?.owner_email}</span></p>
          <div><label className="label">Password Baru *</label><input className="input" required minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setPwTenant(null)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Reset</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function FlagEditor({ modules, all, setAll, flags, onToggle, onCustom }: {
  modules: string[]; all: boolean; setAll: (v: boolean) => void; flags: string[]; onToggle: (m: string) => void; onCustom: () => void
}) {
  return (
    <div className="border-t border-slate-100 pt-3">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Semua modul aktif
      </label>
      {!all && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5" onClick={onCustom}>
          {modules.map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-sm text-slate-600 capitalize">
              <input type="checkbox" checked={flags.includes(m)} onChange={() => onToggle(m)} /> {m}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
