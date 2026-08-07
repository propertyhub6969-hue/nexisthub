import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Check, X, Inbox, Phone, Home, UserPlus, Users, Undo2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { propertyService } from '../../services/property'
import type { BookingRequest, BookingRequestStatus } from '../../types'

const TABS: { key: BookingRequestStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'accepted', label: 'Diterima' },
  { key: 'rejected', label: 'Ditolak' },
  { key: 'cancelled', label: 'Dibatalkan' },
  { key: 'all', label: 'Semua' },
]
const STATUS_CLS: Record<BookingRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
}
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function BookingRequests() {
  const navigate = useNavigate()
  // Lanjutkan jadi Pembeli — form dibuka dgn data calon & unit SUDAH terisi (tanpa ketik ulang)
  function toClient(b: BookingRequest) {
    const p = new URLSearchParams({ new: '1' })
    if (b.prospect_name) p.set('name', b.prospect_name)
    if (b.prospect_phone) p.set('phone', b.prospect_phone)
    if (b.project_id) p.set('project', b.project_id)
    if (b.unit_id) p.set('unit', b.unit_id)
    if (b.unit_price != null) p.set('price', String(b.unit_price))
    navigate(`/marketing/clients?${p.toString()}`)
  }

  const [sp] = useSearchParams()
  const initialTab = (sp.get('tab') as BookingRequestStatus | 'all' | null) ?? 'pending'
  const [tab, setTab] = useState<BookingRequestStatus | 'all'>(initialTab)
  const [items, setItems] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<BookingRequest | null>(null)
  const [rejectMode, setRejectMode] = useState<'reject' | 'cancel'>('reject')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try { setItems(await propertyService.listBookingRequests(tab)) }
    catch { setError('Gagal memuat permintaan booking.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [tab])

  async function accept(b: BookingRequest) {
    setBusyId(b.id)
    try { await propertyService.acceptBookingRequest(b.id); await load() }
    catch { /* toast global menampilkan alasan (mis. unit sudah tak tersedia) */ }
    finally { setBusyId(null) }
  }
  async function doReject() {
    if (!rejectTarget || !reason.trim()) return
    setSaving(true)
    try {
      if (rejectMode === 'cancel') await propertyService.cancelBookingRequest(rejectTarget.id, reason.trim())
      else await propertyService.rejectBookingRequest(rejectTarget.id, reason.trim())
      setRejectTarget(null); setReason(''); await load()
    } catch { /* toast global */ } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Inbox size={20} className="text-brand-600" /> Permintaan Booking
        </h1>
        <p className="text-sm text-slate-500">
          Pengajuan booking unit dari agen lewat tautan siteplan — tinjau sebelum unit ditahan.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      ) : items.length === 0 ? (
        <div className="card p-12 flex flex-col items-center justify-center text-center">
          <Inbox size={36} className="text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-700 mb-1">Belum ada permintaan</h3>
          <p className="text-sm text-slate-400">Pengajuan booking dari agen akan muncul di sini.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Tanggal', 'Unit', 'Agen', 'Calon Pembeli', 'Catatan', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(b.created_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium text-slate-900 flex items-center gap-1"><Home size={13} className="text-slate-400" /> {b.unit_label}</p>
                    <p className="text-xs text-slate-400">{b.project_name}</p>
                    {b.status === 'pending' && b.unit_status !== 'available' && (
                      <p className="text-[11px] text-red-600 mt-0.5">⚠ unit sudah tidak tersedia</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-slate-800">{b.agent_name}</p>
                    {b.agent_phone && <p className="text-xs text-slate-400 flex items-center gap-1"><Phone size={10} /> {b.agent_phone}</p>}
                    {b.link_label && <p className="text-[11px] text-slate-400">via {b.link_label}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-slate-700">{b.prospect_name ?? '—'}</p>
                    {b.prospect_phone && <p className="text-xs text-slate-400 flex items-center gap-1"><Phone size={10} /> {b.prospect_phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[200px]">
                    <p className="truncate" title={b.notes ?? ''}>{b.notes ?? '—'}</p>
                    {b.review_notes && <p className="text-xs text-red-600 mt-0.5">Alasan: {b.review_notes}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[b.status]}`}>
                      {TABS.find((t) => t.key === b.status)?.label ?? b.status}
                    </span>
                    {b.reviewer_name && <p className="text-[11px] text-slate-400 mt-0.5">{b.reviewer_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {b.status === 'accepted' && (
                      <div className="flex items-center justify-end gap-2">
                        {b.prospect_id && (
                          <Link to="/marketing/prospects" title="Prospek otomatis dibuat dari booking ini"
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600">
                            <Users size={12} /> Prospek
                          </Link>
                        )}
                        <button onClick={() => toClient(b)}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-brand-600 text-white px-2.5 py-1.5 hover:bg-brand-700">
                          <UserPlus size={12} /> Jadikan Pembeli
                        </button>
                        <button onClick={() => { setRejectTarget(b); setRejectMode('cancel'); setReason('') }}
                          title="Calon mundur / tak ada pembayaran → unit dilepas jadi Tersedia"
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 px-2.5 py-1.5 hover:bg-slate-50">
                          <Undo2 size={12} /> Batalkan
                        </button>
                      </div>
                    )}
                    {b.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => accept(b)} disabled={busyId === b.id}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 hover:bg-emerald-700 disabled:opacity-50">
                          {busyId === b.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Terima
                        </button>
                        <button onClick={() => { setRejectTarget(b); setRejectMode('reject'); setReason('') }}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 px-2.5 py-1.5 hover:bg-slate-50">
                          <X size={12} /> Tolak
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)}
             title={rejectMode === 'cancel' ? 'Batalkan Booking' : 'Tolak Permintaan Booking'}>
        {rejectMode === 'cancel' ? (
          <p className="text-sm text-slate-500">
            Membatalkan booking unit <b>{rejectTarget?.unit_label}</b> dari <b>{rejectTarget?.agent_name}</b> —
            unit <b>dilepas kembali jadi Tersedia</b>. Prospek calon tetap tersimpan di CRM & bisa ditawari unit lain.
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            Menolak permintaan unit <b>{rejectTarget?.unit_label}</b> dari <b>{rejectTarget?.agent_name}</b>.
            Status unit tidak berubah.
          </p>
        )}
        <div className="mt-3">
          <label className="label">Alasan *</label>
          <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={rejectMode === 'cancel' ? 'mis. calon mundur, tidak ada pembayaran DP' : 'mis. unit sudah dipesan pembeli lain, data calon belum lengkap'} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setRejectTarget(null)} className="btn-secondary text-sm">Batal</button>
          <button onClick={doReject} disabled={saving || !reason.trim()} className="btn-primary text-sm flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : (rejectMode === 'cancel' ? <Undo2 size={14} /> : <X size={14} />)}
            {rejectMode === 'cancel' ? 'Batalkan & Lepas Unit' : 'Tolak'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
