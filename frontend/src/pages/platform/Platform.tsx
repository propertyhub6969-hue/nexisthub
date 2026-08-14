import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, KeyRound, Building2, Receipt, Trash2, CheckCircle2, Wallet, RotateCcw } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import Modal from '../../components/ui/Modal'
import DateInput from '../../components/ui/DateInput'
import Badge from '../../components/ui/Badge'
import MoneyInput from '../../components/ui/MoneyInput'
import { useAuth } from '../../context/AuthContext'
import { platformService } from '../../services/platform'
import type { TenantAdmin, TenantProvision, TenantAdminUpdate, TenantStatus, Invoice, InvoiceCreate, RevenueSummary } from '../../types'

const fmtRp = (n?: number) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

const statusCfg: Record<TenantStatus, { label: string; variant: 'green' | 'yellow' | 'red' }> = {
  active: { label: 'Aktif', variant: 'green' },
  trial: { label: 'Trial', variant: 'yellow' },
  suspended: { label: 'Suspended', variant: 'red' },
}
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('id-ID') : '—'
const fmtMonth = (ym: string) => { const [y, m] = ym.split('-'); return new Date(Number(y), Number(m) - 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }) }

export default function Platform() {
  const { user } = useAuth()
  const [modules, setModules] = useState<string[]>([])
  const [tenants, setTenants] = useState<TenantAdmin[]>([])
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)

  // hapus tenant (soft-delete — arsip, bisa dipulihkan)
  const [delTenant, setDelTenant] = useState<TenantAdmin | null>(null)
  const [delConfirmText, setDelConfirmText] = useState('')

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

  // invoices
  const [invTenant, setInvTenant] = useState<TenantAdmin | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const emptyInv = (): InvoiceCreate => ({ period_start: '', period_end: '', plan: '', amount: 0, method: 'transfer', notes: '' })
  const [invForm, setInvForm] = useState<InvoiceCreate>(emptyInv())

  const load = async () => {
    setLoading(true)
    try {
      const [m, t, r] = await Promise.all([platformService.listModules(), platformService.listTenants(showDeleted), platformService.getRevenue()])
      setModules(m); setTenants(t); setRevenue(r)
    } catch { setError('Gagal memuat data platform.') } finally { setLoading(false) }
  }
  useEffect(() => { if (user?.is_platform_admin) load() }, [user, showDeleted])

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
    setEForm({ name: t.name, status: t.status, is_active: t.is_active, subscription_plan: t.subscription_plan, expires_at: t.expires_at ?? '', feature_flags: t.feature_flags, owner_email: t.owner_email ?? '', owner_name: t.owner_name ?? '' })
  }
  async function submitEdit(e: React.FormEvent) {
    e.preventDefault(); if (!eTenant) return; setSaving(true); setError('')
    try {
      const payload = { ...eForm, expires_at: eForm.expires_at || null, feature_flags: eAllModules ? null : (eForm.feature_flags ?? []) }
      if (!payload.owner_email) delete payload.owner_email  // kosong = tak diubah (EmailStr backend tolak string kosong)
      if (!payload.owner_name) delete payload.owner_name    // kosong = tak diubah
      await platformService.updateTenant(eTenant.id, payload)
      setETenant(null); await load()
    } catch (e: any) { setError(e?.response?.data?.detail || 'Gagal menyimpan.') } finally { setSaving(false) }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault(); if (!pwTenant || newPw.length < 6) return; setSaving(true)
    try { await platformService.resetOwnerPassword(pwTenant.id, newPw); setPwTenant(null); setNewPw('') }
    catch (e: any) { setError(e?.response?.data?.detail || 'Gagal reset password.') } finally { setSaving(false) }
  }

  async function submitDelete(e: React.FormEvent) {
    e.preventDefault(); if (!delTenant || delConfirmText.trim() !== delTenant.name) return
    setSaving(true); setError('')
    try { await platformService.deleteTenant(delTenant.id); setDelTenant(null); setDelConfirmText(''); await load() }
    catch (e: any) { setError(e?.response?.data?.detail || 'Gagal menghapus tenant.') } finally { setSaving(false) }
  }
  async function restore(t: TenantAdmin) {
    if (!confirm(`Pulihkan tenant "${t.name}"? Login & subdomain akan aktif kembali.`)) return
    try { await platformService.restoreTenant(t.id); await load() }
    catch (e: any) { setError(e?.response?.data?.detail || 'Gagal memulihkan tenant.') }
  }

  async function openInvoices(t: TenantAdmin) {
    setInvTenant(t); setInvForm({ ...emptyInv(), plan: t.subscription_plan })
    try { setInvoices(await platformService.listInvoices(t.id)) } catch { setInvoices([]) }
  }
  async function submitInvoice(e: React.FormEvent) {
    e.preventDefault(); if (!invTenant || !invForm.period_start || !invForm.period_end) { setError('Periode wajib diisi.'); return }
    setSaving(true); setError('')
    try {
      await platformService.createInvoice(invTenant.id, invForm)
      setInvoices(await platformService.listInvoices(invTenant.id)); setInvForm({ ...emptyInv(), plan: invTenant.subscription_plan })
    } catch (e: any) { setError(e?.response?.data?.detail || 'Gagal buat invoice.') } finally { setSaving(false) }
  }
  async function markPaid(inv: Invoice) {
    try {
      await platformService.markInvoicePaid(inv.id)
      if (invTenant) setInvoices(await platformService.listInvoices(invTenant.id))
      await load()  // masa aktif tenant diperpanjang
    } catch (e: any) { setError(e?.response?.data?.detail || 'Gagal tandai lunas.') }
  }
  async function delInvoice(inv: Invoice) {
    if (!confirm('Hapus invoice ini?')) return
    try { await platformService.deleteInvoice(inv.id); if (invTenant) setInvoices(await platformService.listInvoices(invTenant.id)) }
    catch { setError('Gagal hapus invoice.') }
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

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1.5"><Wallet size={15} /> Pendapatan Platform</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-4"><p className="text-xs text-slate-500">Total Diterima</p><p className="text-lg font-semibold text-slate-900">{fmtRp(revenue?.total_paid)}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Bulan Ini</p><p className="text-lg font-semibold text-emerald-600">{fmtRp(revenue?.paid_this_month)}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Tertunggak</p><p className="text-lg font-semibold text-red-600">{fmtRp(revenue?.outstanding)}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Estimasi MRR</p><p className="text-lg font-semibold text-indigo-600">{fmtRp(revenue?.mrr_estimate)}</p></div>
        </div>
        {revenue && revenue.trend.length > 0 && (
          <div className="card p-4 mt-3">
            <p className="text-xs text-slate-500 mb-2">Tren 12 Bulan Terakhir</p>
            <div className="space-y-1.5">
              {(() => {
                const max = Math.max(...revenue.trend.map((m) => m.amount), 1)
                return revenue.trend.map((m) => (
                  <div key={m.month} className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-slate-500 shrink-0">{fmtMonth(m.month)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${(m.amount / max) * 100}%` }} />
                    </div>
                    <span className="w-24 text-right text-slate-700 shrink-0">{fmtRp(m.amount)}</span>
                  </div>
                ))
              })()}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Tampilkan tenant terhapus
        </label>
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
                <tr key={t.id} className={`hover:bg-slate-50 ${t.is_deleted ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {t.name}
                    {t.is_deleted ? <span className="ml-1 text-xs text-red-500">(dihapus {fmtDate(t.deleted_at)})</span> : !t.is_active && <span className="ml-1 text-xs text-red-500">(nonaktif)</span>}
                    {(t.estimated_project_count || t.estimated_units_per_project) && (
                      <p className="text-xs font-normal text-slate-400">{t.estimated_project_count ?? '—'} proyek · {t.estimated_units_per_project ?? '—'} unit/proyek</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{t.slug}.nexisthub.id</td>
                  <td className="px-4 py-2.5 text-slate-600">{t.subscription_plan}</td>
                  <td className="px-4 py-2.5">{st && <Badge label={st.label} variant={st.variant} />}</td>
                  <td className="px-4 py-2.5 text-slate-500">{t.user_count}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {t.owner_name || t.owner_email ? (
                      <>
                        <p className="text-slate-700 font-medium">{t.owner_name ?? '—'}</p>
                        {t.owner_name && t.owner_email && <p className="text-slate-400">{t.owner_email}</p>}
                      </>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(t.expires_at)}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{t.feature_flags == null ? 'Semua' : `${t.feature_flags.length} modul`}</td>
                  <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-3">
                    {t.is_deleted ? (
                      <button onClick={() => restore(t)} className="text-slate-400 hover:text-emerald-600" title="Pulihkan tenant"><RotateCcw size={15} /></button>
                    ) : (
                      <>
                        <button onClick={() => openEdit(t)} className="text-slate-400 hover:text-brand-600" title="Kelola"><Pencil size={15} /></button>
                        <button onClick={() => openInvoices(t)} className="text-slate-400 hover:text-brand-600" title="Tagihan / Langganan"><Receipt size={15} /></button>
                        <button onClick={() => { setPwTenant(t); setNewPw('') }} className="text-slate-400 hover:text-brand-600" title="Reset password owner"><KeyRound size={15} /></button>
                        <button onClick={() => { setDelTenant(t); setDelConfirmText('') }} className="text-slate-400 hover:text-red-600" title="Hapus tenant"><Trash2 size={15} /></button>
                      </>
                    )}
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
          <div><label className="label">Nama Perusahaan/Kantor Digital *</label><input className="input" required minLength={2} value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Paket</label><input className="input" value={cForm.subscription_plan} onChange={(e) => setCForm({ ...cForm, subscription_plan: e.target.value })} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={cForm.status} onChange={(e) => setCForm({ ...cForm, status: e.target.value as TenantStatus })}>
                <option value="trial">Trial</option><option value="active">Aktif</option><option value="suspended">Suspended</option>
              </select></div>
          </div>
          <div><label className="label">Aktif s/d (opsional)</label><DateInput className="input" value={cForm.expires_at ?? ''} onChange={(v) => setCForm({ ...cForm, expires_at: v })} /></div>
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
              <div><label className="label">Nama Owner</label><input className="input" value={eForm.owner_name ?? ''} onChange={(e) => setEForm({ ...eForm, owner_name: e.target.value })} /></div>
              <div><label className="label">Email Owner</label><input className="input" type="email" value={eForm.owner_email ?? ''} onChange={(e) => setEForm({ ...eForm, owner_email: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Paket</label><input className="input" value={eForm.subscription_plan ?? ''} onChange={(e) => setEForm({ ...eForm, subscription_plan: e.target.value })} /></div>
              <div><label className="label">Status</label>
                <select className="input" value={eForm.status} onChange={(e) => setEForm({ ...eForm, status: e.target.value as TenantStatus })}>
                  <option value="trial">Trial</option><option value="active">Aktif</option><option value="suspended">Suspended</option>
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><label className="label">Aktif s/d</label><DateInput className="input" value={eForm.expires_at ?? ''} onChange={(v) => setEForm({ ...eForm, expires_at: v })} /></div>
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

      {/* Invoices / Tagihan */}
      <Modal open={!!invTenant} onClose={() => setInvTenant(null)} title={`Tagihan — ${invTenant?.name ?? ''}`}>
        {invTenant && (
          <div className="space-y-3">
            <div className="text-sm text-slate-500">Aktif s/d: <span className="font-medium text-slate-800">{fmtDate(invTenant.expires_at)}</span> · Status: {invTenant.status}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Periode', 'Paket', 'Nominal', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-2 py-2 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>))}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.length === 0 ? (
                    <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-400 text-sm">Belum ada tagihan.</td></tr>
                  ) : invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-2 py-1.5 text-slate-600 text-xs">{fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}</td>
                      <td className="px-2 py-1.5 text-slate-500">{inv.plan || '—'}</td>
                      <td className="px-2 py-1.5 text-slate-700">{fmtRp(inv.amount)}</td>
                      <td className="px-2 py-1.5">{inv.status === 'paid' ? <Badge label="Lunas" variant="green" /> : inv.status === 'void' ? <Badge label="Batal" variant="gray" /> : <Badge label="Belum" variant="yellow" />}</td>
                      <td className="px-2 py-1.5 text-right"><div className="flex items-center justify-end gap-2">
                        {inv.status !== 'paid' && <button onClick={() => markPaid(inv)} className="text-slate-400 hover:text-emerald-600" title="Tandai lunas (perpanjang masa aktif)"><CheckCircle2 size={15} /></button>}
                        <button onClick={() => delInvoice(inv)} className="text-slate-300 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={submitInvoice} className="border-t border-slate-100 pt-3 space-y-2">
              <p className="text-sm font-medium text-slate-700">Buat Tagihan Baru</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Periode Mulai *</label><DateInput className="input" value={invForm.period_start} onChange={(v) => setInvForm({ ...invForm, period_start: v })} /></div>
                <div><label className="label">Periode Akhir *</label><DateInput className="input" value={invForm.period_end} onChange={(v) => setInvForm({ ...invForm, period_end: v })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Paket</label><input className="input" value={invForm.plan} onChange={(e) => setInvForm({ ...invForm, plan: e.target.value })} /></div>
                <div><label className="label">Nominal (Rp)</label><MoneyInput value={invForm.amount || undefined} onChange={(v) => setInvForm({ ...invForm, amount: v ?? 0 })} /></div>
              </div>
              <p className="text-xs text-slate-400">Saat ditandai lunas, masa aktif tenant otomatis diperpanjang ke Periode Akhir & status jadi Aktif.</p>
              <div className="flex justify-end"><button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Buat Tagihan</button></div>
            </form>
          </div>
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

      {/* Hapus tenant (soft-delete) */}
      <Modal open={!!delTenant} onClose={() => setDelTenant(null)} title={`Hapus Tenant — ${delTenant?.name ?? ''}`}>
        {delTenant && (
          <form onSubmit={submitDelete} className="space-y-3">
            <p className="text-sm text-slate-600">
              Tenant akan diarsipkan: subdomain <b>{delTenant.slug}.nexisthub.id</b> berhenti bisa diakses & semua user-nya (termasuk owner) tak bisa login lagi.
              Data bisnis (proyek, pembeli, pembayaran, dst) <b>tidak dihapus</b> — bisa dipulihkan kapan saja lewat "Tampilkan tenant terhapus".
            </p>
            <div>
              <label className="label">Ketik nama tenant untuk konfirmasi: <span className="font-semibold text-slate-800">{delTenant.name}</span></label>
              <input className="input" value={delConfirmText} onChange={(e) => setDelConfirmText(e.target.value)} autoFocus />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => setDelTenant(null)}>Batal</button>
              <button type="submit" className="text-sm flex items-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2 font-medium hover:bg-red-700 disabled:opacity-50"
                disabled={saving || delConfirmText.trim() !== delTenant.name}>
                {saving && <Loader2 size={14} className="animate-spin" />}Hapus Tenant
              </button>
            </div>
          </form>
        )}
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
