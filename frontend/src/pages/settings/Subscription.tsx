import { useEffect, useState } from 'react'
import { Loader2, CreditCard, AlertTriangle } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { billingService } from '../../services/billing'
import type { Subscription, Invoice } from '../../types'

const fmtRp = (n?: number) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

export default function Subscription() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([billingService.subscription(), billingService.invoices()])
      .then(([s, i]) => { setSub(s); setInvoices(i) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (!sub) return <div className="text-slate-400 text-sm">Data langganan tidak tersedia.</div>

  const days = sub.days_left
  const warn = days != null && days <= 7
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
          <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Periode', 'Paket', 'Nominal', 'Status', 'Dibayar'].map((h, i) => (
            <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada tagihan.</td></tr>
            ) : invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-600 text-xs">{fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}</td>
                <td className="px-4 py-2.5 text-slate-500">{inv.plan || '—'}</td>
                <td className="px-4 py-2.5 text-slate-700">{fmtRp(inv.amount)}</td>
                <td className="px-4 py-2.5">{inv.status === 'paid' ? <Badge label="Lunas" variant="green" /> : inv.status === 'void' ? <Badge label="Batal" variant="gray" /> : <Badge label="Belum Dibayar" variant="yellow" />}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(inv.paid_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
