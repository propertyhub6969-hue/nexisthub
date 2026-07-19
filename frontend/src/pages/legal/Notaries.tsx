import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, Loader2, Scale, Landmark, Share2, Copy, Check } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { taxService } from '../../services/tax'
import { kprService } from '../../services/kpr'
import type { Notary, NotaryCreate, Bank, BankCreate, BankShareLink } from '../../types'

const emptyNotary: NotaryCreate = { name: '', sk_number: '', ktp: '', phone: '', address: '' }
const emptyBank: BankCreate = { name: '', notes: '' }

export default function LegalMaster() {
  const [notaries, setNotaries] = useState<Notary[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // notary modal
  const [nModal, setNModal] = useState(false)
  const [nForm, setNForm] = useState<NotaryCreate>(emptyNotary)
  const [nEditId, setNEditId] = useState<string | null>(null)
  // bank modal
  const [bModal, setBModal] = useState(false)
  const [bForm, setBForm] = useState<BankCreate>(emptyBank)
  const [bEditId, setBEditId] = useState<string | null>(null)
  // bagikan ke bank (tautan bertoken)
  const [shareBank, setShareBank] = useState<Bank | null>(null)
  const [shareLinks, setShareLinks] = useState<BankShareLink[]>([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareDays, setShareDays] = useState('30')
  const [shareSaving, setShareSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [no, bk] = await Promise.all([taxService.listNotaries(), kprService.listBanks()])
      setNotaries(no); setBanks(bk)
    } catch { setError('Gagal memuat master data.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // ── Notary ──
  function openNCreate() { setNEditId(null); setNForm(emptyNotary); setNModal(true) }
  function openNEdit(n: Notary) { setNEditId(n.id); setNForm({ name: n.name, sk_number: n.sk_number ?? '', ktp: n.ktp ?? '', phone: n.phone ?? '', address: n.address ?? '' }); setNModal(true) }
  async function submitN(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...nForm }; const rec = p as unknown as Record<string, unknown>
      ;['sk_number', 'ktp', 'phone', 'address'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (nEditId) await taxService.updateNotary(nEditId, p); else await taxService.createNotary(p)
      setNModal(false); setNotaries(await taxService.listNotaries())
    } catch { setError('Gagal menyimpan notaris.') } finally { setSaving(false) }
  }
  async function delN(id: string) {
    if (!confirm('Hapus notaris ini?')) return
    try { await taxService.deleteNotary(id); setNotaries((p) => p.filter((n) => n.id !== id)) } catch { setError('Gagal menghapus.') }
  }

  // ── Bank ──
  function openBCreate() { setBEditId(null); setBForm(emptyBank); setBModal(true) }
  function openBEdit(b: Bank) { setBEditId(b.id); setBForm({ name: b.name, notes: b.notes ?? '' }); setBModal(true) }
  async function submitB(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...bForm }; if (p.notes === '') delete p.notes
      if (bEditId) await kprService.updateBank(bEditId, p); else await kprService.createBank(p)
      setBModal(false); setBanks(await kprService.listBanks())
    } catch { setError('Gagal menyimpan bank.') } finally { setSaving(false) }
  }
  async function delB(id: string) {
    if (!confirm('Hapus bank ini?')) return
    try { await kprService.deleteBank(id); setBanks((p) => p.filter((b) => b.id !== id)) } catch { setError('Gagal menghapus.') }
  }

  // ── Bagikan ke Bank ──
  function shareUrl(token: string): string { return `${window.location.origin}/public/bank/${token}` }
  async function loadShareLinks(bankId: string) {
    setShareLoading(true)
    try { setShareLinks(await kprService.listBankShareLinks(bankId)) } catch { /* noop */ } finally { setShareLoading(false) }
  }
  function openShareModal(b: Bank) { setShareBank(b); setShareDays('30'); loadShareLinks(b.id) }
  async function createShareLink() {
    if (!shareBank) return
    const days = Math.max(1, Math.min(365, Number(shareDays) || 30))
    setShareSaving(true)
    try {
      await kprService.createBankShareLink({ bank_id: shareBank.id, expires_days: days })
      await loadShareLinks(shareBank.id)
    } catch { setError('Gagal membuat tautan.') } finally { setShareSaving(false) }
  }
  async function revokeShareLink(id: string) {
    if (!shareBank || !confirm('Cabut tautan ini? Bank tak akan bisa akses lagi.')) return
    try { await kprService.revokeBankShareLink(id); await loadShareLinks(shareBank.id) } catch { /* noop */ }
  }
  function copyLink(id: string, token: string) {
    navigator.clipboard.writeText(shareUrl(token)).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }
  function linkStatus(l: BankShareLink): { label: string; variant: 'green' | 'red' | 'gray' } {
    if (l.revoked_at) return { label: 'Dicabut', variant: 'gray' }
    if (!l.is_active) return { label: 'Kedaluwarsa', variant: 'red' }
    return { label: 'Aktif', variant: 'green' }
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {/* Notaris */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Scale size={15} /> Notaris / PPAT Rekanan</h2>
          <button className="btn-primary text-xs flex items-center gap-1" onClick={openNCreate}><Plus size={13} /> Tambah Notaris</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Nama', 'No. SK Notaris', 'No. KTP', 'No. HP', ''].map((h, i) => (
            <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {notaries.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada notaris.</td></tr>
            ) : notaries.map((n) => (
              <tr key={n.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{n.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{n.sk_number ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{n.ktp ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{n.phone ?? '—'}</td>
                <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-3">
                  <button onClick={() => openNEdit(n)} className="text-slate-400 hover:text-brand-600"><Pencil size={14} /></button>
                  <button onClick={() => delN(n.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bank */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Landmark size={15} /> Bank KPR</h2>
          <button className="btn-primary text-xs flex items-center gap-1" onClick={openBCreate}><Plus size={13} /> Tambah Bank</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Nama Bank', 'Catatan', ''].map((h, i) => (
            <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {banks.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada bank (mis. BTN, BCA, Mandiri).</td></tr>
            ) : banks.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{b.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{b.notes ?? '—'}</td>
                <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-3">
                  <button onClick={() => openShareModal(b)} className="text-slate-400 hover:text-brand-600" title="Bagikan ke Bank"><Share2 size={14} /></button>
                  <button onClick={() => openBEdit(b)} className="text-slate-400 hover:text-brand-600"><Pencil size={14} /></button>
                  <button onClick={() => delB(b.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Notaris */}
      <Modal open={nModal} onClose={() => setNModal(false)} title={nEditId ? 'Edit Notaris' : 'Tambah Notaris'}>
        <form onSubmit={submitN} className="space-y-3">
          <div><label className="label">Nama Notaris *</label><input className="input" required minLength={2} value={nForm.name} onChange={(e) => setNForm({ ...nForm, name: e.target.value })} /></div>
          <div><label className="label">No. SK Notaris</label><input className="input" value={nForm.sk_number} onChange={(e) => setNForm({ ...nForm, sk_number: e.target.value })} /></div>
          <div><label className="label">No. KTP Notaris</label><input className="input" value={nForm.ktp} onChange={(e) => setNForm({ ...nForm, ktp: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">No. HP</label><input className="input" value={nForm.phone} onChange={(e) => setNForm({ ...nForm, phone: e.target.value })} /></div>
            <div><label className="label">Alamat</label><input className="input" value={nForm.address} onChange={(e) => setNForm({ ...nForm, address: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setNModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Bank */}
      <Modal open={bModal} onClose={() => setBModal(false)} title={bEditId ? 'Edit Bank' : 'Tambah Bank'}>
        <form onSubmit={submitB} className="space-y-3">
          <div><label className="label">Nama Bank *</label><input className="input" required placeholder="Bank BTN" value={bForm.name} onChange={(e) => setBForm({ ...bForm, name: e.target.value })} /></div>
          <div><label className="label">Catatan</label><input className="input" value={bForm.notes} onChange={(e) => setBForm({ ...bForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setBModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Bagikan ke Bank */}
      <Modal open={shareBank !== null} onClose={() => setShareBank(null)} title={`Bagikan ke ${shareBank?.name ?? 'Bank'}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Buat tautan khusus <b>{shareBank?.name}</b> yang bisa dibuka pihak bank <b>tanpa perlu akun/login</b> — lihat status pemberkasan pembeli yang ditanganinya & kirim update progres/SP3K (menunggu persetujuan Anda sebelum data berubah).
          </p>
          <div className="flex items-end gap-2">
            <div>
              <label className="label">Berlaku (hari)</label>
              <input type="number" className="input w-28" min={1} max={365} value={shareDays} onChange={(e) => setShareDays(e.target.value)} />
            </div>
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={createShareLink} disabled={shareSaving}>
              {shareSaving && <Loader2 size={14} className="animate-spin" />} Buat Tautan Baru
            </button>
          </div>

          <div>
            <label className="label">Tautan yang pernah dibuat</label>
            {shareLoading ? (
              <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
            ) : shareLinks.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Belum ada tautan.</p>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {shareLinks.map((l) => {
                  const s = linkStatus(l)
                  return (
                    <div key={l.id} className="px-3 py-2.5 text-sm space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">Dibuat {new Date(l.created_at).toLocaleDateString('id-ID')}</span>
                        <Badge label={s.label} variant={s.variant} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span>
                          Kedaluwarsa {new Date(l.expires_at).toLocaleDateString('id-ID')}
                          {l.access_count > 0 && <> · diakses {l.access_count}x</>}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          {s.variant === 'green' && (
                            <button onClick={() => copyLink(l.id, l.token)} className="flex items-center gap-1 text-brand-600 hover:underline">
                              {copiedId === l.id ? <><Check size={12} /> Tersalin</> : <><Copy size={12} /> Salin Tautan</>}
                            </button>
                          )}
                          {!l.revoked_at && (
                            <button onClick={() => revokeShareLink(l.id)} className="flex items-center gap-1 text-slate-400 hover:text-red-600">
                              <Trash2 size={12} /> Cabut
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
