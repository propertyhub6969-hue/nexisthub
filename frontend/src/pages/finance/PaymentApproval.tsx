import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Check, X, Eye, ShieldCheck } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { paymentService } from '../../services/payment'
import type { PendingPayment, PaymentMethod, PaymentSource, PaymentPurpose } from '../../types'

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

const sourceLabel: Record<PaymentSource, { label: string; variant: 'blue' | 'green' }> = {
  pembeli: { label: 'Pembeli', variant: 'blue' },
  bank:    { label: 'Bank (KPR)', variant: 'green' },
}
const methodLabel: Record<PaymentMethod, string> = { transfer: 'Transfer', tunai: 'Tunai', lainnya: 'Lainnya' }
const purposeLabel: Record<PaymentPurpose, string> = {
  dp: 'DP',
  booking_fee: 'Booking Fee',
  cicilan_termin: 'Cicilan Termin',
  realisasi_kpr: 'Realisasi KPR',
  pelunasan_termin: 'Pelunasan Termin',
  lunas_unit: 'Pembelian 1 Unit Rumah',
  cicilan: 'Cicilan',
  pelunasan: 'Pelunasan',
}

export default function PaymentApproval() {
  const [items, setItems] = useState<PendingPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PendingPayment | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setItems(await paymentService.listPending())
    } catch { setError('Gagal memuat daftar pembayaran menunggu persetujuan.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleApprove(p: PendingPayment) {
    setBusyId(p.id); setError('')
    try {
      await paymentService.approvePayment(p.id)
      setItems((prev) => prev.filter((x) => x.id !== p.id))
    } catch { setError('Gagal menyetujui pembayaran.') } finally { setBusyId(null) }
  }

  function openReject(p: PendingPayment) { setRejectReason(''); setRejectTarget(p) }
  async function submitReject(e: React.FormEvent) {
    e.preventDefault()
    if (!rejectTarget || !rejectReason.trim()) return
    setSaving(true)
    try {
      await paymentService.rejectPayment(rejectTarget.id, rejectReason.trim())
      setItems((prev) => prev.filter((x) => x.id !== rejectTarget.id))
      setRejectTarget(null)
    } catch { setError('Gagal menolak pembayaran.') } finally { setSaving(false) }
  }

  const total = items.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><ShieldCheck size={20} className="text-brand-600" /> Persetujuan Pembayaran</h1>
        <p className="text-sm text-slate-500">Pembayaran baru menunggu di sini sebelum dihitung sebagai kas final di laporan.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card p-4 max-w-xs">
        <p className="text-xs text-slate-500">Total Menunggu Persetujuan</p>
        <p className="text-lg font-semibold text-amber-600">{fmt(total)}</p>
        <p className="text-xs text-slate-400 mt-0.5">{items.length} pembayaran</p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Tanggal', 'Pembeli', 'Nominal', 'Jenis', 'Sumber', 'Metode', 'Bukti', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-sm">Tidak ada pembayaran menunggu persetujuan.</td></tr>
              ) : items.map((p) => {
                const src = sourceLabel[p.source]
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(p.payment_date)}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/marketing/clients/${p.client_id}/payments`} className="font-medium text-slate-900 hover:text-brand-600">{p.client_name}</Link>
                      {p.unit_label && <div className="text-xs text-slate-400">{p.unit_label}</div>}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-emerald-600">{fmt(p.amount)}</td>
                    <td className="px-4 py-2.5">{p.purpose ? <Badge label={purposeLabel[p.purpose]} variant="blue" /> : <span className="text-slate-400 text-xs">—</span>}</td>
                    <td className="px-4 py-2.5">{src && <Badge label={src.label} variant={src.variant} />}</td>
                    <td className="px-4 py-2.5 text-slate-500">{methodLabel[p.method]}</td>
                    <td className="px-4 py-2.5">
                      {p.has_file ? (
                        <button onClick={() => paymentService.openPaymentFile(p.id)} className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs" title={p.file_name}>
                          <Eye size={13} /> Lihat
                        </button>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApprove(p)}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Setujui
                        </button>
                        <button
                          onClick={() => openReject(p)}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-red-50 text-red-600 border border-red-200 px-2.5 py-1.5 hover:bg-red-100 disabled:opacity-50"
                        >
                          <X size={12} /> Tolak
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={rejectTarget !== null} onClose={() => setRejectTarget(null)} title="Tolak Pembayaran — wajib isi alasan">
        <form onSubmit={submitReject} className="space-y-3">
          <p className="text-sm text-slate-600">
            Menolak pembayaran <b>{fmt(rejectTarget?.amount)}</b> dari <b>{rejectTarget?.client_name}</b>. Pembayaran ini tidak akan dihitung sebagai kas; staf perlu memperbaiki dan mencatat ulang.
          </p>
          <div>
            <label className="label">Alasan penolakan *</label>
            <textarea className="input" rows={2} required autoFocus placeholder="mis. nominal tidak sesuai bukti transfer, salah alokasi"
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary text-sm" onClick={() => setRejectTarget(null)}>Batal</button>
            <button type="submit" className="text-sm flex items-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2 font-medium hover:bg-red-700 disabled:opacity-50" disabled={saving || !rejectReason.trim()}>
              {saving && <Loader2 size={14} className="animate-spin" />}Tolak
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
