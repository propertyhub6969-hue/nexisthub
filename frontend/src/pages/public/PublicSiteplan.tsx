import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, AlertTriangle, MapPin, Send, Check, Home } from 'lucide-react'
import { propertyService } from '../../services/property'
import NexistLogo from '../../components/ui/NexistLogo'
import Modal from '../../components/ui/Modal'
import type { PublicSiteplanPage, PublicSiteplanUnit, UnitStatus } from '../../types'

const STATUS: Record<UnitStatus, { label: string; dot: string; pill: string }> = {
  available: { label: 'Tersedia', dot: 'bg-emerald-500', pill: 'bg-emerald-500' },
  booked: { label: 'Booking/DP', dot: 'bg-amber-500', pill: 'bg-amber-500' },
  sold: { label: 'Akad/Terjual', dot: 'bg-blue-500', pill: 'bg-blue-500' },
  handover: { label: 'Serah Terima', dot: 'bg-orange-500', pill: 'bg-orange-500' },
}
const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtArea = (n?: number) => n == null ? '—' : `${Number(n)} m²`

// Halaman publik (tanpa login) — dibuka agen/mitra lewat tautan bertoken. Lihat siteplan &
// status unit terkini, lalu ajukan booking (menunggu persetujuan developer).
export default function PublicSiteplan() {
  const { token = '' } = useParams()
  const [page, setPage] = useState<PublicSiteplanPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<PublicSiteplanUnit | null>(null)
  const [imgOk, setImgOk] = useState(true)

  const load = () => {
    propertyService.publicSiteplan(token)
      .then(setPage)
      .catch((err) => setError(
        err?.response?.status === 404
          ? 'Tautan tidak ditemukan, sudah dicabut, atau kedaluwarsa. Silakan hubungi pihak yang membagikan tautan ini.'
          : 'Gagal memuat data.'
      ))
      .finally(() => setLoading(false))
  }
  useEffect(load, [token])

  const counts = page ? {
    available: page.units.filter((u) => u.status === 'available').length,
    booked: page.units.filter((u) => u.status === 'booked').length,
    sold: page.units.filter((u) => u.status === 'sold' || u.status === 'handover').length,
  } : null

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-2">
        <NexistLogo size={24} />
        <span className="text-sm text-slate-400">Siteplan &amp; Ketersediaan Unit</span>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        {loading ? (
          <div className="card p-16 text-center text-slate-400"><Loader2 size={24} className="inline animate-spin" /></div>
        ) : error ? (
          <div className="card p-10 flex flex-col items-center text-center gap-2">
            <AlertTriangle size={32} className="text-amber-500" />
            <p className="text-sm text-slate-600 max-w-md">{error}</p>
          </div>
        ) : !page ? null : (
          <>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Home size={20} className="text-brand-600" /> {page.project_name}
              </h1>
              {page.location && (
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin size={13} /> {page.location}
                </p>
              )}
              <p className="text-sm text-slate-500 mt-1">
                Status unit terkini. Klik unit <b>Tersedia</b> untuk mengajukan booking — akan ditinjau developer sebelum unit ditahan.
              </p>
            </div>

            {counts && (
              <div className="flex flex-wrap gap-3">
                {(['available', 'booked', 'sold'] as const).map((k) => (
                  <div key={k} className="card px-4 py-2.5 flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS[k].dot}`} />
                    <span className="text-sm text-slate-600">{k === 'sold' ? 'Terjual' : STATUS[k].label}</span>
                    <span className="text-sm font-bold text-slate-900">{counts[k]}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Denah + penanda unit (kalau siteplan diunggah & unit punya posisi) */}
            {page.has_siteplan && imgOk && (
              <div className="card p-3 overflow-x-auto">
                <div className="relative inline-block min-w-full">
                  <img
                    src={`/api/v1/public/siteplan/${token}/image`}
                    alt={`Siteplan ${page.project_name}`}
                    className="max-w-full h-auto rounded"
                    onError={() => setImgOk(false)}
                  />
                  {page.units.filter((u) => u.position_x != null && u.position_y != null).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => u.status === 'available' && setPicked(u)}
                      title={`${u.label} — ${STATUS[u.status].label}`}
                      style={{ left: `${u.position_x}%`, top: `${u.position_y}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 text-[9px] font-semibold text-white px-1.5 py-0.5 rounded ${STATUS[u.status].pill} ${u.status === 'available' ? 'cursor-pointer hover:ring-2 ring-white' : 'cursor-default opacity-90'}`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Daftar unit */}
            <div className="card overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Unit', 'Tipe', 'L. Tanah', 'L. Bangunan', ...(page.show_price ? ['Harga'] : []), 'Status', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {page.units.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{u.label}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{u.unit_type ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtArea(u.land_area)}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtArea(u.building_area)}</td>
                      {page.show_price && <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{fmtRp(u.price)}</td>}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className={`w-2 h-2 rounded-full ${STATUS[u.status].dot}`} />
                          {STATUS[u.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {u.status === 'available' && (
                          <button onClick={() => setPicked(u)} className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-brand-600 text-white px-2.5 py-1.5 hover:bg-brand-700 whitespace-nowrap">
                            <Send size={12} /> Ajukan Booking
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {picked && <BookingModal token={token} unit={picked} showPrice={page?.show_price ?? false} onClose={() => setPicked(null)} onDone={() => { setPicked(null); load() }} />}
    </div>
  )
}

function BookingModal({ token, unit, showPrice, onClose, onDone }: {
  token: string; unit: PublicSiteplanUnit; showPrice: boolean; onClose: () => void; onDone: () => void
}) {
  const [agentName, setAgentName] = useState('')
  const [agentPhone, setAgentPhone] = useState('')
  const [prospectName, setProspectName] = useState('')
  const [prospectPhone, setProspectPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!agentName.trim()) return
    setSaving(true); setErr('')
    try {
      await propertyService.publicSiteplanBooking(token, {
        unit_id: unit.id, agent_name: agentName.trim(), agent_phone: agentPhone || undefined,
        prospect_name: prospectName || undefined, prospect_phone: prospectPhone || undefined,
        notes: notes || undefined,
      })
      setSent(true)
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(detail || 'Gagal mengirim. Coba lagi.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={sent ? onDone : onClose} title={`Ajukan Booking — Unit ${unit.label}`}>
      {sent ? (
        <div className="py-6 text-center">
          <Check size={34} className="mx-auto text-emerald-600 mb-2" />
          <p className="text-sm font-semibold text-slate-800">Permintaan terkirim</p>
          <p className="text-sm text-slate-500 mt-1">
            Unit <b>{unit.label}</b> belum ditahan sampai developer menyetujui. Anda akan dihubungi untuk tindak lanjut.
          </p>
          <button onClick={onDone} className="btn-primary text-sm mt-4">Tutup</button>
        </div>
      ) : (
        <>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
            {unit.unit_type ? `Tipe ${unit.unit_type} · ` : ''}LT {fmtArea(unit.land_area)} · LB {fmtArea(unit.building_area)}
            {showPrice && unit.price != null && <> · <b className="text-slate-800">{fmtRp(unit.price)}</b></>}
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nama Anda (agen) *</label>
              <input className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Nama lengkap" />
            </div>
            <div>
              <label className="label">No. HP Anda</label>
              <input className="input" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="08…" />
            </div>
            <div>
              <label className="label">Nama calon pembeli</label>
              <input className="input" value={prospectName} onChange={(e) => setProspectName(e.target.value)} />
            </div>
            <div>
              <label className="label">No. HP calon pembeli</label>
              <input className="input" value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)} placeholder="08…" />
            </div>
          </div>
          <div className="mt-3">
            <label className="label">Catatan</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. rencana KPR / cash, permintaan khusus" />
          </div>
          {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Batal</button>
            <button onClick={submit} disabled={saving || !agentName.trim()} className="btn-primary text-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Kirim Permintaan
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
