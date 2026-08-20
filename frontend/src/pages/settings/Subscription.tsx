import { useEffect, useState } from 'react'
import { Loader2, CreditCard, AlertTriangle, Check, Star } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { billingService } from '../../services/billing'
import type { Subscription, Invoice, Plan } from '../../types'

const fmtRp = (n?: number) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

export default function Subscription() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [reqId, setReqId] = useState<string | null>(null)
  const [requested, setRequested] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([billingService.subscription(), billingService.invoices(), billingService.plans()])
      .then(([s, i, p]) => { setSub(s); setInvoices(i); setPlans(p) })
      .finally(() => setLoading(false))
  }, [])

  async function pay(invoiceId: string) {
    setPayingId(invoiceId)
    try {
      const url = await billingService.payLink(invoiceId)
      window.location.href = url   // arahkan ke halaman bayar Xendit
    } catch { setPayingId(null) }
  }

  async function requestUpgrade(p: Plan) {
    if (!confirm(`Minta upgrade ke paket "${p.name}"? Tim kami akan menghubungi & menerbitkan tagihan.`)) return
    setReqId(p.id)
    try { await billingService.requestUpgrade(p.id); setRequested((s) => new Set(s).add(p.id)) }
    catch { /* toast */ } finally { setReqId(null) }
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (!sub) return <div className="text-slate-400 text-sm">Data langganan tidak tersedia.</div>

  const days = sub.days_left
  const warn = days != null && days <= 7
  // Katalog paket disembunyikan saat trial masih panjang (>7 hari); muncul saat trial mau habis,
  // sudah bayar, atau sudah lewat — supaya tak mengganggu di awal tapi tetap terjangkau saat konversi.
  const isEarlyTrial = sub.status === 'trial' && (days == null || days > 7)
  const showPlans = !isEarlyTrial
  const statusBadge = sub.status === 'active' ? <Badge label="Aktif" variant="green" /> : sub.status === 'trial' ? <Badge label="Trial" variant="yellow" /> : <Badge label="Suspended" variant="red" />

  return (
    <div className="space-y-4 max-w-2xl">
      {warn && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${days! < 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{days! < 0 ? 'Masa langganan telah berakhir.' : `Masa langganan berakhir dalam ${days} hari.`} Hubungi admin untuk perpanjangan.</span>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4"><CreditCard size={18} className="text-brand-600" /><h2 className="font-semibold text-slate-900">Langganan {sub.tenant_name}</h2></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><p className="text-xs text-slate-500">Paket</p><p className="font-medium text-slate-800">{sub.plan}</p></div>
          <div><p className="text-xs text-slate-500">Status</p><p>{statusBadge}</p></div>
          <div><p className="text-xs text-slate-500">Aktif s/d</p><p className="font-medium text-slate-800">{fmtDate(sub.expires_at)}</p></div>
          <div><p className="text-xs text-slate-500">Sisa</p><p className={`font-medium ${warn ? 'text-amber-600' : 'text-slate-800'}`}>{days == null ? '—' : `${days} hari`}</p></div>
        </div>
        <p className="text-xs text-slate-400 mt-3">Subdomain: <span className="font-medium">{sub.slug}.nexisthub.id</span></p>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900">Riwayat Tagihan</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Periode', 'Paket', 'Nominal', 'Status', 'Dibayar', ''].map((h, i) => (
            <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada tagihan.</td></tr>
            ) : invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-600 text-xs">{fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}</td>
                <td className="px-4 py-2.5 text-slate-500">{inv.plan || '—'}</td>
                <td className="px-4 py-2.5 text-slate-700">{fmtRp(inv.amount)}</td>
                <td className="px-4 py-2.5">{inv.status === 'paid' ? <Badge label="Lunas" variant="green" /> : inv.status === 'void' ? <Badge label="Batal" variant="gray" /> : <Badge label="Belum Dibayar" variant="yellow" />}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(inv.paid_at)}</td>
                <td className="px-4 py-2.5 text-right">
                  {inv.status !== 'paid' && inv.status !== 'void' && (
                    <button onClick={() => pay(inv.id)} disabled={payingId === inv.id}
                      className="btn-primary text-xs inline-flex items-center gap-1.5">
                      {payingId === inv.id ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />} Bayar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plans.length > 0 && showPlans && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Paket Tersedia</h3>
          <p className="text-xs text-slate-500 mb-3">
            {sub.status === 'trial'
              ? 'Masa coba gratis Anda segera berakhir — pilih paket untuk lanjut tanpa terputus.'
              : 'Ingin naik paket? Ajukan permintaan — tim kami akan menghubungi & menerbitkan tagihan.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {plans.map((p) => (
              <div key={p.id} className={`card p-4 flex flex-col ${p.highlight ? 'ring-2 ring-brand-400' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <h4 className="font-semibold text-slate-900">{p.name}</h4>
                  {p.highlight && <Star size={12} className="fill-brand-500 text-brand-500" />}
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-bold text-slate-900">{p.price != null ? fmtRp(p.price) : 'Khusus'}</span>
                  <span className="text-[11px] text-slate-400">{p.price_note}</span>
                </div>
                {p.description && <p className="text-xs text-slate-500 mt-1">{p.description}</p>}
                <ul className="mt-2 space-y-1 flex-1">
                  {(p.features ?? []).map((f, i) => <li key={i} className="text-xs text-slate-600 flex gap-1"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" />{f}</li>)}
                </ul>
                <button onClick={() => requestUpgrade(p)} disabled={reqId === p.id || requested.has(p.id)}
                  className="btn-secondary text-xs mt-3 w-full justify-center disabled:opacity-60">
                  {reqId === p.id ? <Loader2 size={13} className="animate-spin inline" /> : requested.has(p.id) ? '✓ Permintaan terkirim' : 'Minta paket ini'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
