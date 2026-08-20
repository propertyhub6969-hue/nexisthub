import { useEffect, useState } from 'react'
import { Loader2, Wallet, TrendingUp, AlertTriangle, Repeat, Banknote } from 'lucide-react'
import { platformService } from '../../services/platform'
import type { RevenueSummary, InvoiceAdminRow } from '../../types'

const fmtRp = (n?: number) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('id-ID') : '—'
const monthLbl = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const fmtMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${monthLbl[Number(m) - 1] ?? m} ${y.slice(2)}` }

export default function Finance() {
  const [rev, setRev] = useState<RevenueSummary | null>(null)
  const [invoices, setInvoices] = useState<InvoiceAdminRow[]>([])
  const [filter, setFilter] = useState('')   // '' | paid | unpaid
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([platformService.getRevenue(), platformService.allInvoices(filter || undefined)])
      .then(([r, i]) => { setRev(r); setInvoices(i) })
      .finally(() => setLoading(false))
  }, [filter])

  const maxTrend = Math.max(1, ...(rev?.trend.map((t) => t.amount) ?? [1]))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Wallet size={20} /> Keuangan</h1>
        <p className="text-sm text-slate-500">Pendapatan langganan NexistHub dari seluruh tenant.</p>
      </div>

      {loading && !rev ? (
        <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4"><div className="flex items-center gap-1.5 text-slate-400 text-xs"><Banknote size={14} /> Total Diterima</div><div className="mt-1 text-lg font-bold text-slate-900 truncate" title={fmtRp(rev?.total_paid)}>{fmtRp(rev?.total_paid)}</div></div>
            <div className="card p-4"><div className="flex items-center gap-1.5 text-slate-400 text-xs"><TrendingUp size={14} /> Bulan Ini</div><div className="mt-1 text-lg font-bold text-emerald-600 truncate">{fmtRp(rev?.paid_this_month)}</div></div>
            <div className="card p-4"><div className="flex items-center gap-1.5 text-slate-400 text-xs"><AlertTriangle size={14} /> Tertunggak</div><div className="mt-1 text-lg font-bold text-red-600 truncate">{fmtRp(rev?.outstanding)}</div></div>
            <div className="card p-4"><div className="flex items-center gap-1.5 text-slate-400 text-xs"><Repeat size={14} /> Estimasi MRR</div><div className="mt-1 text-lg font-bold text-indigo-600 truncate">{fmtRp(rev?.mrr_estimate)}</div><div className="text-[10px] text-slate-400">pendapatan bulanan berulang</div></div>
          </div>

          {/* Tren pendapatan */}
          {rev && rev.trend.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Tren Pendapatan (12 bulan)</h3>
              <div className="flex items-end gap-1.5 h-32">
                {rev.trend.map((t) => (
                  <div key={t.month} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full bg-brand-500/80 hover:bg-brand-600 rounded-t transition-all relative" style={{ height: `${Math.max(2, (t.amount / maxTrend) * 100)}%` }}
                      title={`${fmtMonth(t.month)}: ${fmtRp(t.amount)}`} />
                    <span className="text-[9px] text-slate-400">{fmtMonth(t.month).split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Semua tagihan */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-600">Semua Tagihan</h3>
              <select className="input text-sm w-40" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">Semua status</option>
                <option value="paid">Lunas</option>
                <option value="unpaid">Belum Dibayar</option>
              </select>
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200"><tr>
                  {['Tenant', 'Paket', 'Periode', 'Nominal', 'Metode', 'Status', 'Dibayar'].map((h, i) => (
                    <th key={i} className={`px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>))}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
                  ) : invoices.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada tagihan.</td></tr>
                  ) : invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{inv.tenant_name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{inv.plan || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(inv.period_start)} → {fmtDate(inv.period_end)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{fmtRp(inv.amount)}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{inv.method || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : inv.status === 'void' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
                          {inv.status === 'paid' ? 'Lunas' : inv.status === 'void' ? 'Batal' : 'Belum'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(inv.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
