import { useEffect, useState, useCallback } from 'react'
import { today } from '../../utils/date'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Pencil, Loader2, CalendarClock, Wallet, History, Eye, Printer, Landmark, Check, X } from 'lucide-react'
import { printReceipt } from '../../utils/receipt'
import MoneyInput from '../../components/ui/MoneyInput'
import DateInput from '../../components/ui/DateInput'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { marketingService } from '../../services/marketing'
import { propertyService } from '../../services/property'
import { paymentService } from '../../services/payment'
import { auditService } from '../../services/audit'
import { tenantLogoUrl } from '../../services/users'
import { useAuth } from '../../context/AuthContext'
import type {
  Client, Unit, PaymentSchedule, PaymentScheduleCreate, Payment, PaymentCreate,
  PaymentSummary, PaymentMethod, PaymentSource, PaymentPurpose, AuditEntry,
} from '../../types'

const actionLabel: Record<string, { label: string; variant: 'green' | 'blue' | 'red' }> = {
  CREATE: { label: 'Dibuat', variant: 'green' },
  UPDATE: { label: 'Diubah', variant: 'blue' },
  UPLOAD: { label: 'Upload', variant: 'blue' },
  DELETE: { label: 'Dihapus', variant: 'red' },
}
const resourceLabel: Record<string, string> = {
  clients: 'Data pembeli',
  payments: 'Pembayaran',
  payment_schedules: 'Termin',
}
// ringkas detail audit (nominal) dari old_data/new_data JSON
function auditDetail(a: AuditEntry): string {
  const raw = a.new_data || a.old_data
  if (!raw) return ''
  try {
    const d = JSON.parse(raw) as Record<string, unknown>
    if (d.amount != null) return ` — ${fmt(Number(d.amount))}`
    if (d.label) return ` — ${String(d.label)}`
    if (d.full_name) return ` — ${String(d.full_name)}`
    if (d.file_name) return ` — ${String(d.file_name)}`
  } catch { /* abaikan */ }
  return ''
}

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

const sourceConfig: Record<PaymentSource, { label: string; variant: 'blue' | 'green' }> = {
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
const approvalConfig: Record<Payment['approval_status'], { label: string; variant: 'yellow' | 'green' | 'red' }> = {
  pending: { label: 'Menunggu', variant: 'yellow' },
  approved: { label: 'Disetujui', variant: 'green' },
  rejected: { label: 'Ditolak', variant: 'red' },
}

const emptySchedule = (clientId: string): PaymentScheduleCreate => ({ client_id: clientId, label: '', sequence: 0, amount: 0, due_date: '' })
const emptyPayment = (clientId: string): PaymentCreate => ({ client_id: clientId, schedule_id: '', amount: 0, payment_date: '', method: 'transfer', source: 'pembeli', purpose: undefined, receipt_number: '' })

export default function ClientPayments() {
  const { clientId = '' } = useParams()
  const { user } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [unit, setUnit] = useState<Unit | null>(null)
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [schModal, setSchModal] = useState(false)
  const [schForm, setSchForm] = useState<PaymentScheduleCreate>(emptySchedule(clientId))
  const [schEditId, setSchEditId] = useState<string | null>(null)
  const [payModal, setPayModal] = useState(false)
  const [payForm, setPayForm] = useState<PaymentCreate>(emptyPayment(clientId))
  const [payEditId, setPayEditId] = useState<string | null>(null)
  const [transferFile, setTransferFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  // alasan edit (pembeli mengubah nominal/sumber/tgl/termin) + hapus (wajib)
  const [payReason, setPayReason] = useState('')
  const [schReason, setSchReason] = useState('')
  const [delTarget, setDelTarget] = useState<{ type: 'payment' | 'schedule'; id: string; label: string } | null>(null)
  const [delReason, setDelReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const canApprove = user?.role === 'owner' || user?.role === 'admin' || user?.role === 'finance'

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cl, sm, sc, pm] = await Promise.all([
        marketingService.getClient(clientId),
        paymentService.summary(clientId),
        paymentService.listSchedules(clientId),
        paymentService.listPayments(clientId),
      ])
      setClient(cl); setSummary(sm); setSchedules(sc); setPayments(pm)
      auditService.list({ client_id: clientId, limit: 50 }).then(setAudit).catch(() => {})
      if (cl.unit_id) {
        const u = await propertyService.listUnits({ project_id: cl.project_id, size: 500 })
        setUnit(u.items.find((x) => x.id === cl.unit_id) ?? null)
      }
    } catch { setError('Gagal memuat data pembayaran.') } finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const reload = async () => {
    const [sm, sc, pm] = await Promise.all([
      paymentService.summary(clientId), paymentService.listSchedules(clientId), paymentService.listPayments(clientId),
    ])
    setSummary(sm); setSchedules(sc); setPayments(pm)
    auditService.list({ client_id: clientId, limit: 50 }).then(setAudit).catch(() => {})   // riwayat ikut ter-refresh
  }

  function openSchCreate() { setSchEditId(null); setSchReason(''); setSchForm({ ...emptySchedule(clientId), sequence: schedules.length + 1 }); setSchModal(true) }
  function openSchEdit(s: PaymentSchedule) {
    setSchEditId(s.id); setSchReason('')
    setSchForm({ client_id: clientId, label: s.label, sequence: s.sequence, amount: s.amount, due_date: s.due_date ?? '', status: s.status })
    setSchModal(true)
  }
  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (schEditId) {
      const orig = schedules.find((s) => s.id === schEditId)
      if (orig && Number(schForm.amount) !== Number(orig.amount) && !schReason.trim()) {
        setError('Alasan wajib diisi karena Anda mengubah nominal termin.'); return
      }
    }
    setSaving(true)
    try {
      const p = { ...schForm } as Partial<PaymentScheduleCreate> & { reason?: string }
      if (p.due_date === '') delete p.due_date
      if (schEditId) {
        if (schReason.trim()) p.reason = schReason.trim()
        await paymentService.updateSchedule(schEditId, p)
      } else await paymentService.createSchedule(p as PaymentScheduleCreate)
      setSchModal(false); await reload()
    } catch { setError('Gagal menyimpan termin.') } finally { setSaving(false) }
  }

  function openPayCreate() { setPayEditId(null); setPayReason(''); setPayForm(emptyPayment(clientId)); setTransferFile(null); setPayModal(true) }
  function openPayEdit(p: Payment) {
    setPayEditId(p.id); setPayReason('')
    setPayForm({ client_id: clientId, schedule_id: p.schedule_id ?? '', amount: p.amount, payment_date: p.payment_date ?? '', method: p.method, source: p.source, purpose: p.purpose, receipt_number: p.receipt_number ?? '' })
    setTransferFile(null)
    setPayModal(true)
  }
  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    if (payEditId) {
      const orig = payments.find((x) => x.id === payEditId)
      const norm = (v?: string | null) => v ?? ''
      const material = !!orig && (
        Number(payForm.amount) !== Number(orig.amount) ||
        payForm.source !== orig.source ||
        norm(payForm.payment_date) !== norm(orig.payment_date) ||
        norm(payForm.schedule_id) !== norm(orig.schedule_id)
      )
      if (material && !payReason.trim()) {
        setError('Alasan wajib diisi karena Anda mengubah nominal/sumber/tanggal/termin pembayaran.'); return
      }
    }
    setSaving(true)
    try {
      const p = { ...payForm } as Partial<PaymentCreate> & { reason?: string }
      const rec = p as unknown as Record<string, unknown>
      ;['schedule_id', 'payment_date', 'purpose', 'receipt_number'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      let result: Payment
      if (payEditId) {
        if (payReason.trim()) p.reason = payReason.trim()
        result = await paymentService.updatePayment(payEditId, p)
      } else result = await paymentService.createPayment(p as PaymentCreate)
      if (transferFile) await paymentService.uploadPaymentFile(result.id, transferFile)
      setPayModal(false); setTransferFile(null); await reload()
    } catch { setError('Gagal menyimpan pembayaran.') } finally { setSaving(false) }
  }
  function askDeletePayment(p: Payment) { setDelReason(''); setDelTarget({ type: 'payment', id: p.id, label: `Pembayaran ${fmt(p.amount)}` }) }
  function askDeleteSchedule(s: PaymentSchedule) { setDelReason(''); setDelTarget({ type: 'schedule', id: s.id, label: `Termin ${s.label}` }) }
  async function submitDelete(e: React.FormEvent) {
    e.preventDefault()
    if (!delTarget || !delReason.trim()) return
    setSaving(true)
    try {
      if (delTarget.type === 'payment') await paymentService.deletePayment(delTarget.id, delReason.trim())
      else await paymentService.deleteSchedule(delTarget.id, delReason.trim())
      setDelTarget(null); await reload()
    } catch { setError('Gagal menghapus.') } finally { setSaving(false) }
  }

  async function handleApprove(p: Payment) {
    setBusyId(p.id); setError('')
    try { await paymentService.approvePayment(p.id); await reload() }
    catch { setError('Gagal menyetujui pembayaran.') } finally { setBusyId(null) }
  }
  function openReject(p: Payment) { setRejectReason(''); setRejectTarget(p) }
  async function submitReject(e: React.FormEvent) {
    e.preventDefault()
    if (!rejectTarget || !rejectReason.trim()) return
    setSaving(true)
    try {
      await paymentService.rejectPayment(rejectTarget.id, rejectReason.trim())
      setRejectTarget(null); await reload()
    } catch { setError('Gagal menolak pembayaran.') } finally { setSaving(false) }
  }

  const scheduleLabel = (id?: string) => schedules.find((s) => s.id === id)?.label
  const unitCode = unit ? [unit.block, unit.unit_number].filter(Boolean).join('-') : ''
  const selSchedule = schedules.find((s) => s.id === payForm.schedule_id)

  async function handlePrint(p: Payment) {
    await printReceipt({
      receiptNo: p.receipt_number,
      name: client?.full_name ?? '',
      unit: unitCode,
      amount: Number(p.amount),
      date: p.payment_date,
      method: methodLabel[p.method],
      purpose: p.purpose ? purposeLabel[p.purpose] : undefined,
      source: sourceConfig[p.source]?.label,
      logoUrl: user?.tenant_slug ? tenantLogoUrl(user.tenant_slug) : undefined,
    })
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  return (
    <div className="space-y-5">
      <div>
        <Link to="/marketing/clients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-1">
          <ArrowLeft size={14} /> Daftar Pembeli
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">{client?.full_name ?? 'Pembeli'}</h1>
        <p className="text-sm text-slate-500">
          {unit ? [unit.block, unit.unit_number].filter(Boolean).join('-') : 'tanpa unit'} · Nilai kontrak {fmt(client?.contract_value)}
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-4 min-w-0"><p className="text-xs text-slate-500">Harga Jual</p><p className="text-base sm:text-lg font-semibold text-slate-900 truncate" title={fmt(summary.price)}>{fmt(summary.price)}</p></div>
            <div className="card p-4 min-w-0"><p className="text-xs text-slate-500">Kas Diterima</p><p className="text-base sm:text-lg font-semibold text-emerald-600 truncate" title={fmt(summary.total_paid)}>{fmt(summary.total_paid)}</p>
              {summary.has_kpr && <p className="text-[11px] text-slate-400 mt-0.5 truncate">Pembeli {fmt(summary.from_buyer)} · Bank {fmt(summary.from_bank)}</p>}
            </div>
            <div className="card p-4 min-w-0">
              <p className="text-xs text-slate-500">Sisa Kewajiban Pembeli</p>
              <p className="text-base sm:text-lg font-semibold text-amber-600 truncate" title={fmt(summary.buyer_remaining)}>{fmt(summary.buyer_remaining)}</p>
              {summary.has_kpr && Number(summary.buyer_remaining) <= 0 && <p className="text-[11px] text-emerald-600 mt-0.5">Lunas (ditanggung KPR)</p>}
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500">Progres {summary.progress_percent}%</p>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-brand-500" style={{ width: `${Math.min(summary.progress_percent, 100)}%` }} />
              </div>
              {summary.overdue_count > 0 && <p className="text-xs text-red-600 mt-1">{summary.overdue_count} termin terlambat</p>}
            </div>
          </div>
          {summary.has_kpr && (
            <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-amber-50/50 border-amber-200">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-700">Retensi — menunggu pencairan bank</p>
                <p className="text-xs text-slate-500 mt-0.5">Plafon KPR {fmt(summary.kpr_plafond)} − sudah cair {fmt(summary.from_bank)}. Ini piutang ke bank, bukan tunggakan pembeli.</p>
              </div>
              <p className="text-lg sm:text-xl font-bold text-amber-700 shrink-0">{fmt(summary.retention_remaining)}</p>
            </div>
          )}
          {summary.pending_amount > 0 && (
            <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-yellow-50/50 border-yellow-200">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-yellow-700">Menunggu Persetujuan</p>
                <p className="text-xs text-slate-500 mt-0.5">Belum dihitung sebagai kas diterima sampai disetujui finance/owner/admin.</p>
              </div>
              <p className="text-lg sm:text-xl font-bold text-yellow-700 shrink-0">{fmt(summary.pending_amount)}</p>
            </div>
          )}
        </>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><CalendarClock size={15} /> Jadwal Angsuran</h2>
          <button className="btn-primary text-xs flex items-center gap-1" onClick={openSchCreate}><Plus size={13} /> Tambah Termin</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>{['Termin', 'Nominal', 'Jatuh Tempo', 'Status', ''].map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schedules.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada termin. Tambahkan DP, angsuran, atau pelunasan.</td></tr>
            ) : schedules.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{s.label}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {fmt(s.amount)}
                  {s.status !== 'paid' && s.paid > 0 && (
                    <div className="text-xs text-slate-400 mt-0.5">dibayar {fmt(s.paid)} · sisa {fmt(s.remaining)}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(s.due_date)}</td>
                <td className="px-4 py-2.5">
                  {s.status === 'paid' ? <Badge label="Lunas" variant="green" />
                    : s.paid > 0 ? <Badge label="Sebagian" variant="yellow" />
                    : s.is_overdue ? <Badge label="Terlambat" variant="red" /> : <Badge label="Belum" variant="gray" />}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => openSchEdit(s)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => askDeleteSchedule(s)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Wallet size={15} /> Uang Masuk</h2>
          <button className="btn-primary text-xs flex items-center gap-1" onClick={openPayCreate}><Plus size={13} /> Catat Pembayaran</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>{['Tanggal', 'Nominal', 'Jenis', 'Sumber', 'Metode', 'Untuk Termin', 'No. Kwitansi', 'Bukti', 'Status', ''].map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada pembayaran tercatat.</td></tr>
            ) : payments.map((p) => {
              const src = sourceConfig[p.source]
              const ac = approvalConfig[p.approval_status]
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(p.payment_date)}</td>
                  <td className="px-4 py-2.5 font-medium text-emerald-600">{fmt(p.amount)}</td>
                  <td className="px-4 py-2.5">{p.purpose ? <Badge label={purposeLabel[p.purpose]} variant="blue" /> : <span className="text-slate-400 text-xs">—</span>}</td>
                  <td className="px-4 py-2.5">{src && <Badge label={src.label} variant={src.variant} />}</td>
                  <td className="px-4 py-2.5 text-slate-500">{methodLabel[p.method]}</td>
                  <td className="px-4 py-2.5 text-slate-500">{scheduleLabel(p.schedule_id) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.receipt_number ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {p.has_file ? (
                      <button onClick={() => paymentService.openPaymentFile(p.id)} className="inline-flex items-center gap-1 text-brand-600 hover:underline text-xs" title={p.file_name}>
                        <Eye size={13} /> Lihat
                      </button>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge label={ac.label} variant={ac.variant} />
                    {p.approval_status === 'rejected' && p.rejection_reason && (
                      <div className="text-[11px] text-red-500 mt-0.5 max-w-[140px] truncate" title={p.rejection_reason}>{p.rejection_reason}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      {canApprove && p.approval_status === 'pending' && (
                        <>
                          <button onClick={() => handleApprove(p)} disabled={busyId === p.id} className="text-emerald-500 hover:text-emerald-700 disabled:opacity-50" title="Setujui">
                            {busyId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button onClick={() => openReject(p)} disabled={busyId === p.id} className="text-red-400 hover:text-red-600 disabled:opacity-50" title="Tolak">
                            <X size={14} />
                          </button>
                        </>
                      )}
                      <button onClick={() => handlePrint(p)} className="text-slate-400 hover:text-brand-600" title="Cetak Kuitansi"><Printer size={14} /></button>
                      {p.kpr_id ? (
                        <Link to={`/marketing/clients/${clientId}/kpr`} className="inline-flex items-center gap-1 text-[11px] text-amber-600 hover:underline" title="Pencairan dikelola di modul KPR">
                          <Landmark size={12} /> dari KPR
                        </Link>
                      ) : (
                        <>
                          <button onClick={() => openPayEdit(p)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={14} /></button>
                          <button onClick={() => askDeletePayment(p)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Riwayat (audit) */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><History size={15} /> Riwayat Data Pembeli</h2>
          <p className="text-xs text-slate-400 mt-0.5">Termasuk perubahan pembayaran & termin. Data yang dihapus diarsipkan (tidak benar-benar hilang) dan tercatat di sini.</p>
        </div>
        {audit.length === 0 ? (
          <p className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada riwayat.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {audit.map((a) => {
              const act = actionLabel[a.action] ?? { label: a.action, variant: 'blue' as const }
              return (
                <li key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-sm flex-wrap">
                  <Badge label={act.label} variant={act.variant} />
                  <span className="text-slate-700">
                    {resourceLabel[a.resource] ?? a.resource}<span className="text-slate-500">{auditDetail(a)}</span>
                  </span>
                  {a.reason && <span className="text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">alasan: {a.reason}</span>}
                  <span className="text-slate-400 text-xs">oleh {a.user_name ?? '—'}</span>
                  <span className="ml-auto text-xs text-slate-400">{new Date(a.created_at).toLocaleString('id-ID')}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal open={schModal} onClose={() => setSchModal(false)} title={schEditId ? 'Edit Termin' : 'Tambah Termin'}>
        <form onSubmit={submitSchedule} className="space-y-3">
          <div>
            <label className="label">Nama Termin *</label>
            <input className="input" required placeholder="DP / Angsuran 1 / Pelunasan" value={schForm.label} onChange={(e) => setSchForm({ ...schForm, label: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nominal (Rp) *</label>
              <MoneyInput required value={schForm.amount || undefined} onChange={(v) => setSchForm({ ...schForm, amount: v ?? 0 })} />
            </div>
            <div>
              <label className="label">Jatuh Tempo</label>
              <DateInput className="input" value={schForm.due_date} onChange={(v) => setSchForm({ ...schForm, due_date: v })} />
            </div>
          </div>
          {schEditId && (
            <div>
              <label className="label">Alasan <span className="text-slate-400 font-normal">(wajib bila mengubah nominal)</span></label>
              <input className="input" placeholder="mis. koreksi nominal termin" value={schReason} onChange={(e) => setSchReason(e.target.value)} />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setSchModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      <Modal open={payModal} onClose={() => setPayModal(false)} title={payEditId ? 'Edit Pembayaran' : 'Catat Pembayaran'}>
        <form onSubmit={submitPayment} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nominal (Rp) *</label>
              <MoneyInput required value={payForm.amount || undefined} onChange={(v) => setPayForm({ ...payForm, amount: v ?? 0 })} />
            </div>
            <div>
              <label className="label">Tanggal Bayar</label>
              <DateInput className="input" max={today()} value={payForm.payment_date} onChange={(v) => setPayForm({ ...payForm, payment_date: v })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Sumber</label>
              <select className="input" value={payForm.source} onChange={(e) => setPayForm({ ...payForm, source: e.target.value as PaymentSource })}>
                {(Object.keys(sourceConfig) as PaymentSource[]).map((k) => <option key={k} value={k}>{sourceConfig[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Metode</label>
              <select className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentMethod })}>
                {(Object.keys(methodLabel) as PaymentMethod[]).map((k) => <option key={k} value={k}>{methodLabel[k]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jenis Pembayaran</label>
              <select className="input" value={payForm.purpose ?? ''} onChange={(e) => setPayForm({ ...payForm, purpose: (e.target.value || undefined) as PaymentPurpose | undefined })}>
                <option value="">Pilih jenis...</option>
                {/* Realisasi KPR sengaja tak ada di sini — dicatat via modul KPR (Pencairan Bertahap) */}
                {(Object.keys(purposeLabel) as PaymentPurpose[]).filter((k) => k !== 'realisasi_kpr').map((k) => <option key={k} value={k}>{purposeLabel[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Untuk Termin</label>
              <select className="input" value={payForm.schedule_id} onChange={(e) => setPayForm({ ...payForm, schedule_id: e.target.value })}>
                <option value="">— (tanpa termin)</option>
                {schedules
                  // hanya termin yang belum lunas; termin yang sedang dipilih tetap tampil walau sudah lunas
                  .filter((s) => s.status !== 'paid' || s.id === payForm.schedule_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}{s.status !== 'paid' ? ` — sisa ${fmt(s.remaining)}` : ' (Lunas)'}
                    </option>
                  ))}
              </select>
              {selSchedule && selSchedule.status !== 'paid' && (
                <p className={`text-xs mt-1 ${payForm.amount > selSchedule.remaining ? 'text-amber-600' : 'text-slate-400'}`}>
                  Sisa termin ini: {fmt(selSchedule.remaining)}
                  {payForm.amount > selSchedule.remaining ? ' — nominal melebihi sisa termin' : ''}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="label">No. Kwitansi</label>
            <p className="text-sm text-slate-500 py-2">
              {payForm.receipt_number ? payForm.receipt_number : 'Dibuat otomatis setelah disimpan'}
            </p>
          </div>
          {payForm.method === 'transfer' && (
            <div>
              <label className="label">Bukti Transfer</label>
              <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => setTransferFile(e.target.files?.[0] ?? null)} />
              {payEditId && payments.find((p) => p.id === payEditId)?.has_file && !transferFile && (
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <button type="button" onClick={() => paymentService.openPaymentFile(payEditId)} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                    <Eye size={12} /> Lihat file saat ini
                  </button>
                  <span className="text-slate-400">— pilih file baru untuk mengganti</span>
                </div>
              )}
            </div>
          )}
          {payEditId && (
            <div>
              <label className="label">Alasan <span className="text-slate-400 font-normal">(wajib bila mengubah nominal/sumber/tanggal/termin)</span></label>
              <input className="input" placeholder="mis. koreksi nominal, salah alokasi termin" value={payReason} onChange={(e) => setPayReason(e.target.value)} />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setPayModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Hapus dengan alasan (pembayaran / termin) */}
      <Modal open={delTarget !== null} onClose={() => setDelTarget(null)} title="Hapus — wajib isi alasan">
        <form onSubmit={submitDelete} className="space-y-3">
          <p className="text-sm text-slate-600">
            Menghapus <b>{delTarget?.label}</b>. Data diarsipkan (tidak benar-benar hilang) dan penghapusan ini tercatat di Riwayat beserta alasannya.
          </p>
          <div>
            <label className="label">Alasan penghapusan *</label>
            <textarea className="input" rows={2} required autoFocus placeholder="mis. salah input, dobel, alokasi termin keliru"
              value={delReason} onChange={(e) => setDelReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary text-sm" onClick={() => setDelTarget(null)}>Batal</button>
            <button type="submit" className="text-sm flex items-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2 font-medium hover:bg-red-700 disabled:opacity-50" disabled={saving || !delReason.trim()}>
              {saving && <Loader2 size={14} className="animate-spin" />}Hapus
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Tolak Pembayaran — wajib alasan */}
      <Modal open={rejectTarget !== null} onClose={() => setRejectTarget(null)} title="Tolak Pembayaran — wajib isi alasan">
        <form onSubmit={submitReject} className="space-y-3">
          <p className="text-sm text-slate-600">
            Menolak pembayaran <b>{fmt(rejectTarget?.amount)}</b>. Tidak akan dihitung sebagai kas; staf perlu memperbaiki dan mencatat ulang.
          </p>
          <div>
            <label className="label">Alasan penolakan *</label>
            <textarea className="input" rows={2} required autoFocus placeholder="mis. nominal tidak sesuai bukti transfer"
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
