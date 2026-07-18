import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Loader2, UserX, UserCheck, ShieldAlert, KeyRound } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { usersService } from '../../services/users'
import { useAuth } from '../../context/AuthContext'
import type { TeamMember, TeamMemberCreate, UserRole } from '../../types'

const roleConfig: Record<UserRole, { label: string; variant: 'orange' | 'blue' | 'green' | 'gray' | 'yellow' }> = {
  owner:    { label: 'Pemilik',  variant: 'orange' },
  admin:    { label: 'Admin',    variant: 'blue' },
  manager:   { label: 'Manager',   variant: 'green' },
  produksi:  { label: 'Produksi',  variant: 'yellow' },
  marketing: { label: 'Marketing', variant: 'blue' },
  viewer:    { label: 'Viewer',    variant: 'gray' },
}

// Roles an actor is allowed to assign (mirrors backend rules).
function assignableRoles(actorRole?: UserRole): UserRole[] {
  if (actorRole === 'owner') return ['admin', 'manager', 'produksi', 'marketing', 'viewer']
  return ['manager', 'produksi', 'marketing', 'viewer'] // admin cannot appoint admins
}

const emptyCreate: TeamMemberCreate = { email: '', full_name: '', password: '', phone: '', role: 'marketing' }

export default function Team() {
  const { user } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TeamMemberCreate>(emptyCreate)

  const [resetModal, setResetModal] = useState(false)
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetMsg, setResetMsg] = useState('')

  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const roles = assignableRoles(user?.role)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setMembers(await usersService.list())
    } catch {
      setError('Gagal memuat daftar anggota.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManage) load()
    else setLoading(false)
  }, [canManage, load])

  // Can the current actor edit/deactivate this member?
  function canModify(m: TeamMember): boolean {
    if (m.id === user?.id) return false        // not yourself
    if (m.role === 'owner') return false        // owner is protected
    if (user?.role === 'admin' && m.role === 'admin') return false // admin can't touch admin
    return true
  }

  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyCreate, role: roles[0] })
    setModalOpen(true)
  }

  function openEdit(m: TeamMember) {
    setEditingId(m.id)
    setForm({ email: m.email, full_name: m.full_name, password: '', phone: m.phone ?? '', role: m.role })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyCreate)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await usersService.update(editingId, {
          full_name: form.full_name,
          phone: form.phone || undefined,
          role: form.role,
        })
      } else {
        await usersService.create({
          email: form.email,
          full_name: form.full_name,
          password: form.password,
          phone: form.phone || undefined,
          role: form.role,
        })
      }
      closeModal()
      await load()
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(d || 'Gagal menyimpan anggota.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(m: TeamMember) {
    const action = m.is_active ? 'nonaktifkan' : 'aktifkan'
    if (!confirm(`Yakin ${action} akun "${m.full_name}"?`)) return
    setError('')
    try {
      await usersService.update(m.id, { is_active: !m.is_active })
      await load()
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(d || `Gagal ${action} akun.`)
    }
  }

  function openReset(m: TeamMember) {
    setResetTarget(m)
    setResetPassword('')
    setResetMsg('')
    setResetModal(true)
  }
  async function submitReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetTarget) return
    setResetSaving(true)
    setResetMsg('')
    try {
      await usersService.resetPassword(resetTarget.id, resetPassword)
      setResetMsg(`Password "${resetTarget.full_name}" berhasil diubah. Bagikan password baru ini ke yang bersangkutan.`)
      setResetPassword('')
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setResetMsg(d || 'Gagal mengubah password.')
    } finally {
      setResetSaving(false)
    }
  }

  if (!canManage) {
    return (
      <div className="card p-8 text-center text-slate-500">
        <ShieldAlert size={28} className="mx-auto mb-2 text-slate-400" />
        <p className="text-sm">Hanya Pemilik atau Admin yang dapat mengelola tim.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Kelola anggota tim dan peran akses mereka. Password awal Anda bagikan langsung ke anggota.
        </p>
        <button className="btn-primary flex items-center gap-2 text-sm shrink-0" onClick={openCreate}>
          <Plus size={14} />
          Tambah Anggota
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Nama', 'Email', 'No. HP', 'Peran', 'Status', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada anggota tim.</td></tr>
            ) : (
              members.map((m) => {
                const rc = roleConfig[m.role]
                const editable = canModify(m)
                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {m.full_name}
                      {m.id === user?.id && <span className="ml-2 text-xs text-slate-400">(Anda)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.email}</td>
                    <td className="px-4 py-3 text-slate-500">{m.phone || '—'}</td>
                    <td className="px-4 py-3"><Badge label={rc.label} variant={rc.variant} /></td>
                    <td className="px-4 py-3">
                      <Badge label={m.is_active ? 'Aktif' : 'Nonaktif'} variant={m.is_active ? 'green' : 'gray'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {editable ? (
                          <>
                            <button onClick={() => openEdit(m)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Edit">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => openReset(m)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Reset Password">
                              <KeyRound size={15} />
                            </button>
                            <button
                              onClick={() => toggleActive(m)}
                              className={m.is_active ? 'text-slate-400 hover:text-red-600 transition-colors' : 'text-slate-400 hover:text-emerald-600 transition-colors'}
                              title={m.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            >
                              {m.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                            </button>
                          </>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Edit Anggota' : 'Tambah Anggota'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Nama Lengkap *</label>
            <input className="input" required minLength={2}
              value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" required disabled={!!editingId}
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {editingId && <p className="text-xs text-slate-400 mt-1">Email tidak dapat diubah.</p>}
          </div>
          {!editingId && (
            <div>
              <label className="label">Password Awal *</label>
              <input className="input" type="text" required minLength={8}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Minimal 8 karakter" />
              <p className="text-xs text-slate-400 mt-1">Bagikan password ini ke anggota; mereka bisa menggantinya nanti.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">No. HP</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Peran *</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {roles.map((r) => <option key={r} value={r}>{roleConfig[r].label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={closeModal}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingId ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={resetModal} onClose={() => setResetModal(false)} title={`Reset Password — ${resetTarget?.full_name ?? ''}`}>
        <form onSubmit={submitReset} className="space-y-3">
          <div>
            <label className="label">Password Baru *</label>
            <input className="input" type="text" required minLength={8}
              value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Minimal 8 karakter" />
            <p className="text-xs text-slate-400 mt-1">Bagikan password baru ini langsung ke {resetTarget?.full_name}; mereka bisa menggantinya nanti.</p>
          </div>
          {resetMsg && (
            <div className={`rounded-lg border text-sm px-3 py-2 ${resetMsg.includes('berhasil') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {resetMsg}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setResetModal(false)}>Tutup</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={resetSaving}>
              {resetSaving && <Loader2 size={14} className="animate-spin" />}
              Set Password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
