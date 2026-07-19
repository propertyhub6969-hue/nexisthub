import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Wallet, TrendingUp, TrendingDown, Scale, ChevronLeft, ChevronRight } from 'lucide-react'
import DateInput from '../../components/ui/DateInput'
import { cashbookService } from '../../services/cashbook'
import type { AccountCategory, CashBookEntry, CashBookSummary, CashDirection } from '../../types'

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${monthLabels[Number(m) - 1] ?? m} ${y}`
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-medium uppercase tracking-wider truncate">{label}</span></div>
      <div className={`mt-2 text-base sm:text-xl font-semibold truncate ${accent ?? 'text-slate-900'}`} title={value}>{value}</div>
    </div>
  )
}

export default function CashBook() {
  const [summary, setSummary] = useState<CashBookSummary | null>(null)
  const [categories, setCategories] = useState<AccountCategory[]>([])
  const [entries, setEntries] = useState<CashBookEntry[]>([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [direction, setDirection] = useState<CashDirection | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSummary = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [sm, cats] = await Promise.all([
        cashbookService.summary({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
        cashbookService.listCategories(),
      ])
      setSummary(sm); setCategories(cats)
    } catch { setError('Gagal memuat rekap Buku Kas.') } finally { setLoading(false) }
  }, [dateFrom, dateTo])

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true)
    try {
      const res = await cashbookService.listEntries({
        direction: direction || undefined, category_id: categoryId || undefined,
        date_from: dateFrom || undefined, date_to: dateTo || undefined, page, size: 20,
      })
      setEntries(res.items); setEntriesTotal(res.total)
    } catch { setError('Gagal memuat daftar transaksi.') } finally { setEntriesLoading(false) }
  }, [direction, categoryId, dateFrom, dateTo, page])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadEntries() }, [loadEntries])
  useEffect(() => { setPage(1) }, [direction, categoryId, dateFrom, dateTo])

  const maxMonth = Math.max(1, ...(summary?.months.map((m) => Math.max(m.total_in, m.total_out)) ?? [1]))
  const pages = Math.max(1, Math.ceil(entriesTotal / 20))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Wallet size={20} className="text-brand-600" /> Buku Kas</h1>
        <p className="text-sm text-slate-500">Rekap kas otomatis dari pembayaran disetujui & biaya yang sudah dibayar, per kategori.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {/* Filter periode (mempengaruhi rekap & daftar) */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Dari Tanggal</label>
          <DateInput className="input" value={dateFrom} onChange={setDateFrom} />
        </div>
        <div>
          <label className="label">Sampai Tanggal</label>
          <DateInput className="input" value={dateTo} onChange={setDateTo} />
        </div>
        {(dateFrom || dateTo) && (
          <button className="btn-secondary text-sm" onClick={() => { setDateFrom(''); setDateTo('') }}>Reset periode</button>
        )}
      </div>

      {loading ? (
        <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard icon={<TrendingUp size={15} />} label="Kas Masuk" value={fmt(summary.total_in)} accent="text-emerald-600" />
            <StatCard icon={<TrendingDown size={15} />} label="Kas Keluar" value={fmt(summary.total_out)} accent="text-red-600" />
            <StatCard icon={<Scale size={15} />} label="Saldo Periode" value={fmt(summary.saldo)} accent={summary.saldo >= 0 ? 'text-brand-600' : 'text-red-600'} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Rekap per Kategori</h3>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Arah</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.by_category.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada transaksi.</td></tr>
                  ) : summary.by_category.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{c.category_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${c.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {c.direction === 'in' ? 'Masuk' : 'Keluar'}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium ${c.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Tren Bulanan</h3>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bulan</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Masuk</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Keluar</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Komposisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.months.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada transaksi.</td></tr>
                  ) : summary.months.map((m) => (
                    <tr key={m.month} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{fmtMonth(m.month)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{m.total_in ? fmt(m.total_in) : '—'}</td>
                      <td className="px-4 py-3 text-right text-red-600">{m.total_out ? fmt(m.total_out) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5 w-36">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(m.total_in / maxMonth) * 100}%` }} />
                          <div className="h-2 rounded-full bg-red-500" style={{ width: `${(m.total_out / maxMonth) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-600">Daftar Transaksi</h3>
          <div className="flex items-center gap-2">
            <select className="input text-sm" value={direction} onChange={(e) => setDirection(e.target.value as CashDirection | '')}>
              <option value="">Semua Arah</option>
              <option value="in">Masuk</option>
              <option value="out">Keluar</option>
            </select>
            <select className="input text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Semua Kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Tanggal', 'Deskripsi', 'Kategori', 'Konteks', 'Arah', 'Nominal'].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entriesLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">Tidak ada transaksi.</td></tr>
              ) : entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{e.description}</td>
                  <td className="px-4 py-2.5 text-slate-500">{e.category_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">
                    {e.client_id ? <Link to={`/marketing/clients/${e.client_id}/payments`} className="hover:text-brand-600 hover:underline">{e.client_name}</Link>
                      : e.project_name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${e.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {e.direction === 'in' ? 'Masuk' : 'Keluar'}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 font-medium ${e.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between mt-2 text-sm text-slate-500">
            <span>Halaman {page} dari {pages} ({entriesTotal} transaksi)</span>
            <div className="flex items-center gap-1">
              <button className="btn-secondary p-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              <button className="btn-secondary p-1.5" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
