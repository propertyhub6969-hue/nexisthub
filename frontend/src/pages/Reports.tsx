import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Loader2, Landmark, TrendingDown, TrendingUp, Scale, CheckCircle2, XCircle, FileStack,
  Wallet, Users, Building2, PiggyBank, HandCoins, Home, AlertTriangle, Clock, HardHat, CalendarClock, Receipt,
  Printer, FileDown, Share2, Copy, Trash2, Check, ExternalLink, Package, ChevronDown, ChevronRight,
} from 'lucide-react'
import { reportingService } from '../services/reporting'
import { propertyService } from '../services/property'
import { printMonthlyTax, downloadMonthlyTaxCsv } from '../utils/monthlyTax'
import { printCashflow } from '../utils/cashflow'
import { printProjectProfit } from '../utils/profit'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import DateInput from '../components/ui/DateInput'
import type { KprRejectionReport, CashflowReport, SalesRecapReport, AgingReport, ConstructionProgressReport, MonthlyTaxReport, MonthlyTaxShareLink, Project, TaxChecklistReport, TaxChecklistItem, TaxChecklistStatus, ProjectProfitReport, ProjectProfitDetail, BankRetentionReport, CashProjection } from '../types'

const fmtRp = (n?: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${monthLabels[Number(m) - 1] ?? m} ${y}`
}

function StatCard({ icon, label, value, hint, accent }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: string
}) {
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-medium uppercase tracking-wider truncate">{label}</span></div>
      <div className={`mt-2 text-base sm:text-xl font-semibold truncate ${accent ?? 'text-slate-900'}`} title={value}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5 truncate">{hint}</div>}
    </div>
  )
}

// ═══════════════════════ ARUS KAS ═══════════════════════
function BreakdownSection({ title, colLabel, totalLabel, items }: {
  title: string; colLabel: string; totalLabel: string; items: { label: string; total: number }[]
}) {
  if (items.length === 0) return null
  const total = items.reduce((s, b) => s + b.total, 0)
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600 mb-2">{title}</h3>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{colLabel}</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((b, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2.5 font-medium text-slate-900">{b.label}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-red-600">{fmtRp(b.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="px-4 py-2.5 font-semibold text-slate-700">{totalLabel}</td>
              <td className="px-4 py-2.5 text-right font-bold text-red-700">{fmtRp(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/** Laba/Rugi per proyek — laporan OPERASIONAL, bukan akuntansi formal.
 *  Dua aturan yang menentukan angkanya (samakan dgn reporting.py):
 *  - Biaya basis accrual → angkanya cocok dgn RAB & Kebocoran.
 *  - Biaya unit BELUM terjual = persediaan/modal tertanam, TIDAK mengurangi laba. */
function ProjectProfitTab() {
  const { user } = useAuth()
  const [data, setData] = useState<ProjectProfitReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProjectProfitDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    reportingService.projectProfit()
      .then(setData).catch(() => setError('Gagal memuat laporan laba/rugi.')).finally(() => setLoading(false))
  }, [])

  function toggle(pid: string) {
    if (openId === pid) { setOpenId(null); setDetail(null); return }
    setOpenId(pid); setDetail(null); setDetailLoading(true)
    reportingService.projectProfitDetail(pid)
      .then(setDetail).catch(() => setError('Gagal memuat rincian unit.')).finally(() => setDetailLoading(false))
  }

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!data) return null

  const rows = data.rows.filter((r) => r.units_total > 0 || r.revenue_contract > 0)
  const adaBiayaKosong = rows.some((r) => r.units_sold > 0 && r.cost_sold === 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="btn-secondary text-sm flex items-center gap-1.5"
          onClick={() => printProjectProfit(data, { tenantName: user?.tenant_name ?? undefined, detail })}
        >
          <Printer size={14} /> Cetak / PDF
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card p-4"><p className="text-xs text-slate-500">Nilai Kontrak</p>
          <p className="font-display text-lg font-bold text-slate-900">{fmtRp(data.revenue_contract)}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Kas Sudah Masuk</p>
          <p className="font-display text-lg font-bold text-emerald-600">{fmtRp(data.revenue_cash)}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Total Biaya</p>
          <p className="font-display text-lg font-bold text-red-600">{fmtRp(data.cost_total)}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">{data.profit < 0 ? 'Rugi' : 'Laba'}</p>
          <p className={`font-display text-lg font-bold ${data.profit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtRp(Math.abs(data.profit))}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500 flex items-center gap-1"><Package size={12} /> Modal Tertanam</p>
          <p className="font-display text-lg font-bold text-amber-600">{fmtRp(data.inventory_value)}</p>
          <p className="text-[11px] text-slate-400">unit belum terjual</p></div>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 text-xs text-slate-600">
        <b>Cara membaca:</b> biaya dihitung <b>saat terjadi</b> (bukan saat dibayar), jadi angkanya sama dengan
        realisasi di RAB &amp; Kebocoran. Biaya unit yang <b>belum terjual tidak mengurangi laba</b> — uangnya
        belum hilang, hanya berubah jadi rumah, dan ditampilkan sebagai <b>Modal Tertanam</b>.
      </div>

      {adaBiayaKosong && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            Ada proyek dengan unit terjual tapi <b>biayanya Rp 0</b> — labanya akan tampak 100%.
            Itu berarti biaya pembangunan belum dicatat, bukan berarti tanpa modal.
          </p>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>{['Proyek', 'Terjual', 'Nilai Kontrak', 'Biaya Unit Terjual', 'Biaya Umum', 'Notaris', 'Laba/Rugi', 'Margin', 'Modal Tertanam'].map((h, i) => (
              <th key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Belum ada data proyek.</td></tr>
            ) : rows.map((r) => (
              <Fragment key={r.project_id}>
                <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => toggle(r.project_id)}>
                  <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {openId === r.project_id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                      {r.project_name}
                    </span>
                    {r.clients_without_unit > 0 && (
                      <span className="ml-2 text-[11px] text-amber-600">{r.clients_without_unit} pembeli tanpa unit</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{r.units_sold} / {r.units_total}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{fmtRp(r.revenue_contract)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{fmtRp(r.cost_sold)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{fmtRp(r.cost_general)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{fmtRp(r.cost_notary)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${r.profit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtRp(r.profit)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {r.margin_pct == null ? <span className="text-slate-400">—</span> : (
                      <span className={r.margin_pct < 0 ? 'text-red-600' : 'text-slate-600'}>{Number(r.margin_pct).toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-amber-600 whitespace-nowrap">{fmtRp(r.inventory_value)}</td>
                </tr>
                {openId === r.project_id && (
                  <tr>
                    <td colSpan={9} className="px-4 py-3 bg-slate-50/70">
                      {detailLoading ? (
                        <p className="text-center text-slate-400 py-4"><Loader2 size={16} className="inline animate-spin" /></p>
                      ) : !detail ? null : (
                        <UnitProfitTable detail={detail} />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UnitProfitTable({ detail }: { detail: ProjectProfitDetail }) {
  const [semua, setSemua] = useState(false)
  // default: hanya unit yang punya angka (terjual atau sudah ada biaya) — proyek bisa ratusan unit kosong
  const rows = detail.rows.filter((r) => semua || r.is_sold || r.cost_total !== 0)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Biaya umum proyek <b>{fmtRp(detail.cost_general)}</b> · Notaris <b>{fmtRp(detail.cost_notary)}</b>
          {detail.revenue_unattributed > 0 && <> · <span className="text-amber-600">Kontrak tanpa unit {fmtRp(detail.revenue_unattributed)}</span></>}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} className="rounded border-slate-300" />
          Tampilkan semua unit ({detail.rows.length})
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-xs min-w-[820px]">
          <thead className="bg-white border-b border-slate-200">
            <tr>{['Unit', 'Pembeli', 'Harga Jual', 'Material', 'Upah/Borongan', 'Utilitas', 'Lain', 'Total Biaya', 'Laba', 'Margin'].map((h, i) => (
              <th key={i} className={`px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">Belum ada unit dengan pendapatan atau biaya.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.unit_id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{r.unit_label}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                  {r.client_name ?? <span className="text-slate-400 capitalize">{r.unit_status}</span>}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{fmtRp(r.contract_value)}</td>
                <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{fmtRp(r.cost_material)}</td>
                <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{fmtRp(r.cost_upah)}</td>
                <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{fmtRp(r.cost_utilitas)}</td>
                <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{fmtRp(r.cost_lain)}</td>
                <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{fmtRp(r.cost_total)}</td>
                <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${(r.profit ?? 0) < 0 ? 'text-red-600' : r.profit == null ? 'text-slate-400' : 'text-emerald-600'}`}>
                  {r.profit == null ? '—' : fmtRp(r.profit)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {r.margin_pct == null ? <span className="text-slate-400">—</span> : (
                    <span className={r.margin_pct < 0 ? 'text-red-600' : r.cost_total === 0 ? 'text-amber-600' : 'text-slate-600'}>
                      {Number(r.margin_pct).toFixed(1)}%
                      {r.is_sold && r.cost_total === 0 && <AlertTriangle size={11} className="inline ml-1 -mt-0.5" />}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CashflowTab() {
  const { user } = useAuth()
  const [rep, setRep] = useState<CashflowReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catFrom, setCatFrom] = useState('')
  const [catTo, setCatTo] = useState('')

  useEffect(() => {
    reportingService.cashflow({ cat_from: catFrom || undefined, cat_to: catTo || undefined })
      .then(setRep).catch(() => setError('Gagal memuat arus kas.')).finally(() => setLoading(false))
  }, [catFrom, catTo])

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!rep) return null

  const maxTotal = Math.max(1, ...rep.months.map((m) => m.total))
  const maxOut = Math.max(1, ...rep.out_months.map((m) => m.total))
  const OUT_PALETTE = ['bg-red-500', 'bg-amber-500', 'bg-indigo-500', 'bg-brand-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-slate-500']

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          className="btn-secondary text-sm flex items-center gap-1.5"
          onClick={() => printCashflow(rep, { tenantName: user?.tenant_name ?? undefined, catFrom: catFrom || undefined, catTo: catTo || undefined })}
        >
          <Printer size={14} /> Cetak / PDF
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Kas Masuk</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<Building2 size={15} />} label="Nilai Penjualan" value={fmtRp(rep.total_contract)} hint="pembeli aktif" />
          <StatCard icon={<Users size={15} />} label="Dari Pembeli" value={fmtRp(rep.from_buyer)} accent="text-brand-600" />
          <StatCard icon={<Landmark size={15} />} label="Dari Bank (KPR)" value={fmtRp(rep.from_bank)} accent="text-indigo-600" />
          <StatCard icon={<Wallet size={15} />} label="Total Kas Masuk" value={fmtRp(rep.total_in)} accent="text-emerald-600" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Piutang & Retensi</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard icon={<HandCoins size={15} />} label="Sisa Kewajiban Pembeli" value={fmtRp(rep.buyer_remaining)} hint="piutang ke pembeli" accent="text-amber-600" />
          <StatCard icon={<PiggyBank size={15} />} label="Retensi Menunggu Bank" value={fmtRp(rep.retention_remaining)} hint="plafon − sudah cair" accent="text-indigo-600" />
          <StatCard icon={<Landmark size={15} />} label="Total Plafon KPR" value={fmtRp(rep.kpr_plafond_total)} hint="komitmen bank" />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-600">Ringkasan Buku Kas per Kategori</h3>
            <p className="text-xs text-slate-400">Kas riil dari Buku Kas (pembayaran disetujui + biaya/notaris dibayar) — termasuk kas keluar.</p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5">Dari tanggal</label>
              <DateInput className="input text-sm py-1.5" value={catFrom} onChange={setCatFrom} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5">Sampai tanggal</label>
              <DateInput className="input text-sm py-1.5" value={catTo} onChange={setCatTo} />
            </div>
            {(catFrom || catTo) && (
              <button onClick={() => { setCatFrom(''); setCatTo('') }} className="text-xs text-slate-500 hover:text-slate-700 underline pb-2">Reset</button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          <StatCard icon={<Wallet size={15} />} label="Kas Masuk (ledger)" value={fmtRp(rep.ledger_in)} accent="text-emerald-600" />
          <StatCard icon={<Wallet size={15} />} label="Kas Keluar (ledger)" value={fmtRp(rep.ledger_out)} accent="text-red-600" />
          <StatCard icon={<Wallet size={15} />} label="Saldo (ledger)" value={fmtRp(rep.ledger_saldo)} accent={rep.ledger_saldo >= 0 ? 'text-brand-600' : 'text-red-600'} />
        </div>
        {rep.by_category.length === 0 ? (
          <div className="card p-6 text-center text-slate-400 text-sm">Belum ada transaksi di Buku Kas.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Arah</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rep.by_category.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.category_name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.direction === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {c.direction === 'in' ? 'Masuk' : 'Keluar'}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${c.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>{fmtRp(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Tren Kas Keluar per Kategori (Bulanan)</h3>
        {rep.out_months.length === 0 ? (
          <div className="card p-6 text-center text-slate-400 text-sm">Belum ada kas keluar tercatat pada periode ini.</div>
        ) : (
          <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bulan</th>
                  {rep.out_category_names.map((n, i) => (
                    <th key={i} className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 justify-end"><span className={`w-2 h-2 rounded-sm ${OUT_PALETTE[i % OUT_PALETTE.length]}`} />{n}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Komposisi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rep.out_months.map((m) => (
                  <tr key={m.month} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{fmtMonth(m.month)}</td>
                    {m.by_category.map((v, i) => (
                      <td key={i} className="px-4 py-3 text-right text-slate-600">{v ? fmtRp(v) : '—'}</td>
                    ))}
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{fmtRp(m.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex h-2 w-36 rounded-full bg-slate-100 overflow-hidden" title={rep.out_category_names.map((n, i) => `${n} ${fmtRp(m.by_category[i])}`).join(' · ')}>
                        {m.by_category.map((v, i) => (
                          <div key={i} className={`h-full ${OUT_PALETTE[i % OUT_PALETTE.length]}`} style={{ width: `${(v / maxOut) * 100}%` }} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-400">
            {rep.out_category_names.map((n, i) => (
              <span key={i} className="inline-flex items-center gap-1"><span className={`w-3 h-2 rounded-sm ${OUT_PALETTE[i % OUT_PALETTE.length]}`} />{n}</span>
            ))}
          </div>
          </>
        )}
      </div>

      <BreakdownSection title="Rincian Biaya Notaris/Legal (per jenis jasa)" colLabel="Jenis Jasa" totalLabel="Total Biaya Notaris/Legal" items={rep.notary_breakdown} />
      <BreakdownSection title="Rincian Biaya Operasional (per jenis biaya)" colLabel="Jenis Biaya" totalLabel="Total Biaya Operasional" items={rep.expense_breakdown} />

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Arus Kas Bulanan</h3>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bulan</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Dari Pembeli</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Dari Bank</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Komposisi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rep.months.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada transaksi kas masuk.</td></tr>
              ) : rep.months.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{fmtMonth(m.month)}</td>
                  <td className="px-4 py-3 text-right text-brand-600">{m.from_buyer ? fmtRp(m.from_buyer) : '—'}</td>
                  <td className="px-4 py-3 text-right text-indigo-600">{m.from_bank ? fmtRp(m.from_bank) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmtRp(m.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex h-2 w-36 rounded-full bg-slate-100 overflow-hidden" title={`Pembeli ${fmtRp(m.from_buyer)} · Bank ${fmtRp(m.from_bank)}`}>
                      <div className="h-full bg-brand-500" style={{ width: `${(m.from_buyer / maxTotal) * 100}%` }} />
                      <div className="h-full bg-indigo-500" style={{ width: `${(m.from_bank / maxTotal) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-brand-500" /> Dari pembeli</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-indigo-500" /> Dari bank (KPR)</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════ REJECTION-RATE KPR ═══════════════════════
function rateColor(rate: number): string {
  if (rate >= 40) return 'text-red-600'
  if (rate >= 20) return 'text-amber-600'
  return 'text-emerald-600'
}
function rateBar(rate: number): string {
  if (rate >= 40) return 'bg-red-500'
  if (rate >= 20) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function KprRejectionTab() {
  const [report, setReport] = useState<KprRejectionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    reportingService.kprRejection().then(setReport).catch(() => setError('Gagal memuat laporan.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!report || report.total === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <FileStack size={40} className="text-slate-300 mb-4" />
        <h3 className="text-base font-semibold text-slate-700 mb-1">Belum ada pengajuan KPR</h3>
        <p className="text-sm text-slate-400">Laporan akan muncul setelah ada pengajuan KPR ke bank.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<FileStack size={15} />} label="Total Pengajuan" value={String(report.total)} />
        <StatCard icon={<CheckCircle2 size={15} />} label="Disetujui" value={String(report.approved)} hint={`${report.in_process} masih proses`} accent="text-emerald-600" />
        <StatCard icon={<XCircle size={15} />} label="Ditolak" value={String(report.rejected)} accent="text-red-600" />
        <StatCard icon={<TrendingDown size={15} />} label="Rejection Rate" value={`${report.rejection_rate}%`} hint="seluruh bank" />
      </div>

      {report.avg_days_to_akad != null && (
        <p className="text-sm text-slate-500">
          Rata-rata lama pemberkasan (Collect Berkas → Akad): <b className="text-slate-800">{report.avg_days_to_akad} hari</b>
          <span className="text-slate-400"> (dari {report.akad_samples} pengajuan yang sudah akad)</span>
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Bank', 'Total', 'Disetujui', 'Proses', 'Ditolak', 'Rejection Rate', 'Lama Pemberkasan'].map((h, i) => (
                <th key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'text-left' : 'text-center'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.banks.map((b) => (
              <tr key={b.bank_id ?? 'none'} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <span className="inline-flex items-center gap-2"><Landmark size={14} className="text-slate-400" />{b.bank_name}</span>
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{b.total}</td>
                <td className="px-4 py-3 text-center text-emerald-600">{b.approved}</td>
                <td className="px-4 py-3 text-center text-slate-400">{b.in_process}</td>
                <td className="px-4 py-3 text-center text-red-600">{b.rejected}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${rateBar(b.rejection_rate)}`} style={{ width: `${Math.min(b.rejection_rate, 100)}%` }} />
                    </div>
                    <span className={`w-12 text-right font-semibold ${rateColor(b.rejection_rate)}`}>{b.rejection_rate}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">
                  {b.avg_days_to_akad != null
                    ? <><span className="font-semibold">{b.avg_days_to_akad}</span> hari<span className="text-slate-400 text-xs"> ({b.akad_samples})</span></>
                    : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════ REKAP PENJUALAN ═══════════════════════
function SalesRecapTab() {
  const [rep, setRep] = useState<SalesRecapReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    reportingService.salesRecap().then(setRep).catch(() => setError('Gagal memuat rekap penjualan.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!rep) return null
  if (rep.projects.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <Home size={40} className="text-slate-300 mb-4" />
        <h3 className="text-base font-semibold text-slate-700 mb-1">Belum ada proyek</h3>
        <p className="text-sm text-slate-400">Rekap akan muncul setelah ada proyek & unit.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Home size={15} />} label="Unit Terjual" value={`${rep.units_sold} / ${rep.units_total}`} hint="sold + serah terima" />
        <StatCard icon={<Users size={15} />} label="Pembeli" value={String(rep.buyers)} accent="text-brand-600" />
        <StatCard icon={<Building2 size={15} />} label="Nilai Penjualan" value={fmtRp(rep.contract_value)} />
        <StatCard icon={<Wallet size={15} />} label="Kas Masuk" value={fmtRp(rep.cash_in)} hint={`sisa ${fmtRp(rep.remaining)}`} accent="text-emerald-600" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyek</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit (Terjual/Total)</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Booking</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Tersedia</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Pembeli</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Nilai Penjualan</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Kas Masuk</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Sisa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rep.projects.map((p) => (
              <tr key={p.project_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{p.project_name}</td>
                <td className="px-4 py-3 text-center">
                  <span className="font-semibold text-slate-900">{p.units_sold}</span>
                  <span className="text-slate-400"> / {p.units_total}</span>
                </td>
                <td className="px-4 py-3 text-center text-amber-600">{p.units_booked || '—'}</td>
                <td className="px-4 py-3 text-center text-slate-400">{p.units_available || '—'}</td>
                <td className="px-4 py-3 text-center text-brand-600">{p.buyers || '—'}</td>
                <td className="px-4 py-3 text-right text-slate-600">{fmtRp(p.contract_value)}</td>
                <td className="px-4 py-3 text-right text-emerald-600">{fmtRp(p.cash_in)}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{fmtRp(p.remaining)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
            <tr>
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-center">{rep.units_sold} / {rep.units_total}</td>
              <td className="px-4 py-3" colSpan={2}></td>
              <td className="px-4 py-3 text-center">{rep.buyers}</td>
              <td className="px-4 py-3 text-right">{fmtRp(rep.contract_value)}</td>
              <td className="px-4 py-3 text-right">{fmtRp(rep.cash_in)}</td>
              <td className="px-4 py-3 text-right">{fmtRp(rep.remaining)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════ TUNGGAKAN / AGING PIUTANG ═══════════════════════
const bucketStyle: Record<string, string> = {
  '1-30': 'bg-amber-100 text-amber-700',
  '31-60': 'bg-orange-100 text-orange-700',
  '61-90': 'bg-red-100 text-red-700',
  '90+': 'bg-red-200 text-red-800',
}

function AgingTab() {
  const [rep, setRep] = useState<AgingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    reportingService.aging().then(setRep).catch(() => setError('Gagal memuat tunggakan.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!rep) return null
  if (rep.overdue_schedules === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <CheckCircle2 size={40} className="text-emerald-300 mb-4" />
        <h3 className="text-base font-semibold text-slate-700 mb-1">Tidak ada tunggakan</h3>
        <p className="text-sm text-slate-400">Semua termin yang jatuh tempo sudah lunas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={<AlertTriangle size={15} />} label="Total Tunggakan" value={fmtRp(rep.total_outstanding)} hint={`${rep.overdue_clients} pembeli · ${rep.overdue_schedules} termin`} accent="text-red-600" />
        <StatCard icon={<Clock size={15} />} label="1–30 hari" value={fmtRp(rep.bucket_1_30)} accent="text-amber-600" />
        <StatCard icon={<Clock size={15} />} label="31–60 hari" value={fmtRp(rep.bucket_31_60)} accent="text-orange-600" />
        <StatCard icon={<Clock size={15} />} label="61–90 hari" value={fmtRp(rep.bucket_61_90)} accent="text-red-600" />
        <StatCard icon={<Clock size={15} />} label="&gt; 90 hari" value={fmtRp(rep.bucket_90p)} accent="text-red-700" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Pembeli</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyek / Unit</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Termin Telat</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Telat Terlama</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Tunggakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rep.clients.map((c) => (
              <tr key={c.client_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{c.full_name}</td>
                <td className="px-4 py-3 text-slate-500">
                  {c.project_name ?? '—'}{c.unit_label ? <span className="text-slate-400"> · {c.unit_label}</span> : null}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{c.overdue_count}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${bucketStyle[c.bucket] ?? 'bg-slate-100 text-slate-600'}`}>
                    {c.max_days} hari
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-red-600">{fmtRp(c.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════ PROGRES KONSTRUKSI ═══════════════════════
const STAGE_LABELS: { key: string; label: string }[] = [
  { key: 'persiapan', label: 'Persiapan' },
  { key: 'pondasi', label: 'Pondasi' },
  { key: 'struktur', label: 'Struktur' },
  { key: 'dinding', label: 'Dinding' },
  { key: 'atap', label: 'Atap' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'selesai', label: 'Selesai' },
]

function ConstructionProgressTab() {
  const [rep, setRep] = useState<ConstructionProgressReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    reportingService.constructionProgress().then(setRep).catch(() => setError('Gagal memuat progres konstruksi.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!rep) return null
  if (rep.units_total === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <HardHat size={40} className="text-slate-300 mb-4" />
        <h3 className="text-base font-semibold text-slate-700 mb-1">Belum ada unit</h3>
        <p className="text-sm text-slate-400">Progres akan muncul setelah ada proyek & unit.</p>
      </div>
    )
  }

  const maxStage = Math.max(...STAGE_LABELS.map((s) => rep.stage_counts[s.key] ?? 0), 1)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={<Home size={15} />} label="Total Unit" value={String(rep.units_total)} />
        <StatCard icon={<TrendingDown size={15} className="rotate-180" />} label="Rata-rata Progres" value={`${rep.avg_percent}%`} accent="text-brand-600" />
        <StatCard icon={<CheckCircle2 size={15} />} label="Selesai" value={`${rep.done} / ${rep.units_total}`} accent="text-emerald-600" />
        <StatCard icon={<CalendarClock size={15} />} label="Lewat Target" value={String(rep.overdue_target)} hint="target lewat, belum selesai" accent={rep.overdue_target ? 'text-red-600' : undefined} />
        <StatCard icon={<AlertTriangle size={15} />} label="Terlambat Update" value={String(rep.late_update)} hint="belum update > 7 hari" accent={rep.late_update ? 'text-amber-600' : undefined} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Distribusi Tahap</h3>
        <div className="card p-4 space-y-2">
          {STAGE_LABELS.map((s) => {
            const c = rep.stage_counts[s.key] ?? 0
            return (
              <div key={s.key} className="flex items-center gap-3 text-sm">
                <span className="w-20 text-slate-500 shrink-0">{s.label}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${s.key === 'selesai' ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${(c / maxStage) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-slate-700 font-medium shrink-0">{c}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyek</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-44">Rata-rata Progres</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Selesai</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Dalam Proses</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Belum Mulai</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Lewat Target</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Terlambat Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rep.projects.map((p) => (
              <tr key={p.project_id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{p.project_name}</td>
                <td className="px-4 py-3 text-center text-slate-600">{p.units_total}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${p.avg_percent}%` }} /></div>
                    <span className="text-xs text-slate-500 w-10 text-right">{p.avg_percent}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-emerald-600 font-medium">{p.done || '—'}</td>
                <td className="px-4 py-3 text-center text-slate-600">{p.in_progress || '—'}</td>
                <td className="px-4 py-3 text-center text-slate-400">{p.not_started || '—'}</td>
                <td className={`px-4 py-3 text-center font-medium ${p.overdue_target ? 'text-red-600' : 'text-slate-400'}`}>{p.overdue_target || '—'}</td>
                <td className={`px-4 py-3 text-center font-medium ${p.late_update ? 'text-amber-600' : 'text-slate-400'}`}>{p.late_update || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
            <tr>
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-center">{rep.units_total}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">{rep.avg_percent}% rata-rata</td>
              <td className="px-4 py-3 text-center">{rep.done}</td>
              <td className="px-4 py-3" colSpan={2}></td>
              <td className="px-4 py-3 text-center">{rep.overdue_target}</td>
              <td className="px-4 py-3 text-center">{rep.late_update}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════ PAJAK BULANAN (PPh) ═══════════════════════
const categoryLabel: Record<string, string> = { subsidi: 'Subsidi', komersial: 'Komersial' }

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function MonthlyTaxTab() {
  const [month, setMonth] = useState(currentMonth())
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [rep, setRep] = useState<MonthlyTaxReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Bagikan ke konsultan (tautan bertoken, tanpa login)
  const [shareModal, setShareModal] = useState(false)
  const [shareLinks, setShareLinks] = useState<MonthlyTaxShareLink[]>([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareDays, setShareDays] = useState('30')
  const [shareSaving, setShareSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true); setError('')
    reportingService.monthlyTax(month, projectId || undefined)
      .then(setRep)
      .catch(() => setError('Gagal memuat laporan pajak bulanan.'))
      .finally(() => setLoading(false))
  }, [month, projectId])

  function shareUrl(token: string): string {
    return `${window.location.origin}/public/pajak/${token}`
  }
  async function loadShareLinks() {
    setShareLoading(true)
    try { setShareLinks(await reportingService.listShareLinks()) } catch { /* noop */ } finally { setShareLoading(false) }
  }
  function openShareModal() { setShareModal(true); setShareDays('30'); loadShareLinks() }
  async function createShareLink() {
    const days = Math.max(1, Math.min(365, Number(shareDays) || 30))
    setShareSaving(true)
    try {
      await reportingService.createShareLink({ month, project_id: projectId || undefined, expires_days: days })
      await loadShareLinks()
    } catch { setError('Gagal membuat tautan.') } finally { setShareSaving(false) }
  }
  async function revokeShareLink(id: string) {
    if (!confirm('Cabut tautan ini? Pihak yang pegang link tak akan bisa akses lagi.')) return
    try { await reportingService.revokeShareLink(id); await loadShareLinks() } catch { /* noop */ }
  }
  function copyLink(id: string, token: string) {
    navigator.clipboard.writeText(shareUrl(token)).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }
  function linkStatus(l: MonthlyTaxShareLink): { label: string; variant: 'green' | 'red' | 'gray' } {
    if (l.revoked_at) return { label: 'Dicabut', variant: 'gray' }
    if (!l.is_active) return { label: 'Kedaluwarsa', variant: 'red' }
    return { label: 'Aktif', variant: 'green' }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" className="input w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
          <select className="input w-56" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Semua Proyek</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {rep && (
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary text-sm flex items-center gap-1.5"
              onClick={() => printMonthlyTax(rep, fmtMonth(month), projects.find((p) => p.id === projectId)?.name ?? 'Semua Proyek')}
            >
              <Printer size={14} /> Print
            </button>
            <button
              className="btn-secondary text-sm flex items-center gap-1.5"
              onClick={() => downloadMonthlyTaxCsv(rep, fmtMonth(month))}
            >
              <FileDown size={14} /> Excel (CSV)
            </button>
            <button className="btn-primary text-sm flex items-center gap-1.5" onClick={openShareModal}>
              <Share2 size={14} /> Bagikan ke Konsultan
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      ) : !rep ? null : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard icon={<Receipt size={15} />} label="Jumlah Transaksi" value={String(rep.total_count)} />
            <StatCard icon={<Building2 size={15} />} label="Total Nilai AJB" value={fmtRp(rep.total_base_amount)} />
            <StatCard icon={<Wallet size={15} />} label="Total PPh" value={fmtRp(rep.total_amount)} accent="text-emerald-600" />
            <StatCard icon={<Wallet size={15} />} label="Total PPN" value={fmtRp(rep.total_ppn_amount)} accent="text-brand-600" />
            <StatCard icon={<Wallet size={15} />} label="Total BPHTB" value={fmtRp(rep.total_bphtb_amount)} accent="text-amber-600" />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Nama', 'NIK KTP', 'Lokasi', 'No Unit', 'Jenis', 'Nilai AJB', 'Jumlah PPh', 'Jumlah PPN', 'Jumlah BPHTB', 'NTPN', 'No SHM', 'No PBB', 'KIR', 'Notaris'].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rep.rows.length === 0 ? (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-slate-400 text-sm">Tidak ada data PPh pada bulan ini.</td></tr>
                ) : rep.rows.map((r) => (
                  <tr key={r.client_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.nik ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.location ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.unit_number ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.category ? categoryLabel[r.category] ?? r.category : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">{fmtRp(r.base_amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">{fmtRp(r.amount)}</td>
                    <td className="px-4 py-3 text-right text-brand-600 whitespace-nowrap">{fmtRp(r.ppn_amount)}</td>
                    <td className="px-4 py-3 text-right text-amber-600 whitespace-nowrap">{fmtRp(r.bphtb_amount)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.ntpn ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.shm_number ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.pbb_number ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.sikumbang_number ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.notary_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              {rep.rows.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
                  <tr>
                    <td className="px-4 py-3" colSpan={5}>Total</td>
                    <td className="px-4 py-3 text-right">{fmtRp(rep.total_base_amount)}</td>
                    <td className="px-4 py-3 text-right">{fmtRp(rep.total_amount)}</td>
                    <td className="px-4 py-3 text-right">{fmtRp(rep.total_ppn_amount)}</td>
                    <td className="px-4 py-3 text-right">{fmtRp(rep.total_bphtb_amount)}</td>
                    <td className="px-4 py-3" colSpan={5}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      <Modal open={shareModal} onClose={() => setShareModal(false)} title="Bagikan ke Konsultan Pajak" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Buat tautan khusus bulan <b>{fmtMonth(month)}</b> ({projects.find((p) => p.id === projectId)?.name ?? 'Semua Proyek'}) yang bisa dibuka pihak luar <b>tanpa perlu akun/login</b>. Data yang tampil di tautan ini sama persis dengan tabel di atas (termasuk NIK).
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
                        <span className="font-medium text-slate-800">{fmtMonth(l.month)} — {l.project_name ?? 'Semua Proyek'}</span>
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

// ═══════════════════════ CHECKLIST PAJAK BELUM DIURUS ═══════════════════════
const taxStatusCfg: Record<TaxChecklistStatus, { label: string; variant: 'gray' | 'red' | 'yellow' | 'green' }> = {
  belum_ada: { label: 'Belum Ada', variant: 'gray' },
  belum: { label: 'Belum Bayar', variant: 'red' },
  dibayar: { label: 'Menunggu Validasi', variant: 'yellow' },
  validasi: { label: 'Tervalidasi', variant: 'green' },
  dtp: { label: 'DTP', variant: 'green' },
  bebas: { label: 'Bebas Pajak', variant: 'green' },
}
function TaxStatusBadge({ item }: { item: TaxChecklistItem }) {
  const c = taxStatusCfg[item.status]
  return <Badge label={c.label} variant={c.variant} />
}

function TaxChecklistTab() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(true)
  const [rep, setRep] = useState<TaxChecklistReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true); setError('')
    reportingService.taxChecklist(projectId || undefined, onlyIncomplete)
      .then(setRep)
      .catch(() => setError('Gagal memuat checklist pajak.'))
      .finally(() => setLoading(false))
  }, [projectId, onlyIncomplete])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-56" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Semua Proyek</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={onlyIncomplete} onChange={(e) => setOnlyIncomplete(e.target.checked)} />
            Hanya yang belum tuntas
          </label>
        </div>
        {rep && (
          <span className="text-sm text-slate-500">
            <b className="text-slate-800">{rep.total_incomplete_clients}</b> dari {rep.total_clients} pembeli belum tuntas pajaknya
          </span>
        )}
      </div>

      {loading ? (
        <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Pembeli', 'Unit / Proyek', 'Tanggal Kontrak', 'Umur', 'PPh', 'BPHTB', 'PPN', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rep || rep.rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">
                  {onlyIncomplete ? 'Semua pembeli sudah tuntas perpajakannya. 🎉' : 'Belum ada pembeli.'}
                </td></tr>
              ) : rep.rows.map((r) => (
                <tr key={r.client_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.full_name}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{[r.unit_label, r.project_name].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.contract_date ? new Date(r.contract_date).toLocaleDateString('id-ID') : '—'}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.days_since_contract != null ? `${r.days_since_contract} hari` : '—'}</td>
                  <td className="px-4 py-3"><TaxStatusBadge item={r.pph} /></td>
                  <td className="px-4 py-3"><TaxStatusBadge item={r.bphtb} /></td>
                  <td className="px-4 py-3"><TaxStatusBadge item={r.ppn} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/marketing/clients/${r.client_id}/tax`} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline whitespace-nowrap">
                      Urus <ExternalLink size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════ RETENSI BANK ═══════════════════════
const DONUT_COLORS = ['#1e3a5f', '#c9a227', '#2f855a', '#3182ce', '#805ad5', '#dd6b20', '#0d9488', '#d53f8c']
const R_DONUT = 15.91549430918954  // keliling = 100 → dasharray dlm persen

function RetentionDonut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  let cum = 0
  return (
    <svg viewBox="0 0 42 42" className="w-44 h-44 shrink-0 -rotate-90">
      <circle cx="21" cy="21" r={R_DONUT} fill="none" stroke="#f1f5f9" strokeWidth="5" />
      {total > 0 && segments.map((s, i) => {
        const pct = (s.value / total) * 100
        const el = (
          <circle key={i} cx="21" cy="21" r={R_DONUT} fill="none" stroke={s.color} strokeWidth="5"
            strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={25 - cum} strokeLinecap="butt" />
        )
        cum += pct
        return el
      })}
    </svg>
  )
}

function BankRetentionTab() {
  const [report, setReport] = useState<BankRetentionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    reportingService.bankRetention().then(setReport).catch(() => setError('Gagal memuat laporan.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!report || report.banks.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <Landmark size={40} className="text-slate-300 mb-4" />
        <h3 className="text-base font-semibold text-slate-700 mb-1">Belum ada retensi bank</h3>
        <p className="text-sm text-slate-400 max-w-md">Retensi muncul setelah ada KPR yang sudah <b>Akad Kredit</b> atau <b>Pencairan</b> — yaitu selisih plafon yang belum dicairkan bank.</p>
      </div>
    )
  }

  const pctCair = report.total_plafond > 0 ? (report.total_disbursed / report.total_plafond) * 100 : 0
  // hanya bank yg masih menahan retensi → segmen donut
  const withRet = report.banks.filter((b) => b.retention > 0)
  const segments = withRet.map((b, i) => ({ label: b.bank_name, value: b.retention, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
  const colorOf = (bank_id: string | null) => {
    const idx = withRet.findIndex((b) => b.bank_id === bank_id)
    return idx >= 0 ? DONUT_COLORS[idx % DONUT_COLORS.length] : '#cbd5e1'
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Landmark size={15} />} label="Plafon Akad" value={fmtRp(report.total_plafond)} hint="KPR sudah akad kredit" />
        <StatCard icon={<HandCoins size={15} />} label="Sudah Cair" value={fmtRp(report.total_disbursed)} accent="text-emerald-600" hint={`${pctCair.toFixed(1)}% dari plafon`} />
        <StatCard icon={<PiggyBank size={15} />} label="Sisa Retensi" value={fmtRp(report.total_retention)} accent="text-amber-600" hint="ditahan bank" />
        <StatCard icon={<Building2 size={15} />} label="Jumlah Bank" value={String(report.banks.length)} hint={`${report.banks.reduce((s, b) => s + b.kpr_count, 0)} KPR`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Donut sisa retensi per bank */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Sisa Retensi per Bank</h3>
          <p className="text-xs text-slate-400 mb-4">Porsi dana yang masih ditahan tiap bank penyalur.</p>
          {report.total_retention === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Semua plafon sudah cair — tidak ada retensi tertahan.</p>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="relative">
                <RetentionDonut segments={segments} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">Total</span>
                  <span className="text-sm font-bold text-slate-800">{fmtRp(report.total_retention)}</span>
                </div>
              </div>
              <ul className="flex-1 space-y-2 min-w-0">
                {segments.map((s) => (
                  <li key={s.label} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="text-slate-600 flex-1 truncate">{s.label}</span>
                    <span className="font-semibold text-slate-800 whitespace-nowrap">{fmtRp(s.value)}</span>
                    <span className="text-xs text-slate-400 w-12 text-right">{((s.value / report.total_retention) * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Tabel rinci */}
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Bank', 'KPR', 'Plafon Akad', 'Sudah Cair', 'Sisa Retensi'].map((h, i) => (
                  <th key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.banks.map((b) => (
                <tr key={b.bank_id ?? 'none'} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorOf(b.bank_id) }} />
                      {b.bank_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{b.kpr_count}</td>
                  <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">{fmtRp(b.plafond)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 whitespace-nowrap">{fmtRp(b.disbursed)}</td>
                  <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${b.retention > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{fmtRp(b.retention)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr className="font-semibold text-slate-800">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-center text-slate-500">{report.banks.reduce((s, b) => s + b.kpr_count, 0)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{fmtRp(report.total_plafond)}</td>
                <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">{fmtRp(report.total_disbursed)}</td>
                <td className="px-4 py-3 text-right text-amber-700 whitespace-nowrap">{fmtRp(report.total_retention)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">Retensi = plafon (KPR yang sudah akad kredit) − dana yang sudah dicairkan bank. Nilai ini masih akan cair setelah syarat bank terpenuhi.</p>
    </div>
  )
}

// ═══════════════════════ PROYEKSI KAS ═══════════════════════
function CashProjectionTab() {
  const [d, setD] = useState<CashProjection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    reportingService.cashProjection(6).then(setD).catch(() => setError('Gagal memuat proyeksi kas.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!d) return null

  const totalIn = Number(d.overdue_termin) + d.months.reduce((a, m) => a + Number(m.termin_in), 0) + Number(d.retention_expected)
  // saldo proyeksi berjalan: mulai dari (kas − biaya menunggu bayar + termin terlambat + retensi), lalu +termin tiap bulan
  let running = Number(d.current_cash) - Number(d.expenses_unpaid) + Number(d.overdue_termin) + Number(d.retention_expected)
  const rows = d.months.map((m) => { running += Number(m.termin_in); return { ...m, saldo: running } })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Wallet size={15} />} label="Saldo Kas Sekarang" value={fmtRp(d.current_cash)} />
        <StatCard icon={<TrendingUp size={15} />} label="Akan Masuk (6 bln)" value={fmtRp(totalIn)} accent="text-emerald-600" hint="termin + retensi bank" />
        <StatCard icon={<Receipt size={15} />} label="Biaya Menunggu Bayar" value={fmtRp(d.expenses_unpaid)} accent="text-red-600" />
        <StatCard icon={<Scale size={15} />} label="Proyeksi Likuiditas" value={fmtRp(d.projected_liquidity)} accent={d.projected_liquidity >= 0 ? 'text-brand-700' : 'text-red-600'} hint="saldo + masuk − kewajiban" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Rincian proyeksi */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-600 mb-3">Rincian Proyeksi Likuiditas</h3>
          <div className="space-y-1.5 text-sm">
            <Row label="Saldo kas sekarang" value={fmtRp(d.current_cash)} />
            <Row label="+ Termin terlambat (masih ditagih)" value={fmtRp(d.overdue_termin)} pos />
            <Row label="+ Termin jatuh tempo 6 bln" value={fmtRp(d.months.reduce((a, m) => a + Number(m.termin_in), 0))} pos />
            <Row label="+ Retensi bank akan cair" value={fmtRp(d.retention_expected)} pos />
            <Row label="− Biaya menunggu bayar" value={fmtRp(d.expenses_unpaid)} neg />
            <div className="border-t border-slate-200 mt-1 pt-1.5">
              <Row label="= Proyeksi likuiditas" value={fmtRp(d.projected_liquidity)} bold />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 space-y-0.5">
            {Number(d.beyond_termin) > 0 && <p>Termin jatuh tempo &gt; 6 bln: {fmtRp(d.beyond_termin)} (belum masuk hitungan).</p>}
            {Number(d.unscheduled_termin) > 0 && <p>Termin tanpa tanggal: {fmtRp(d.unscheduled_termin)}.</p>}
            {Number(d.contractor_remaining) > 0 && <p>Komitmen kontraktor (sisa nilai kontrak): {fmtRp(d.contractor_remaining)} — timing tak pasti, tak masuk net.</p>}
          </div>
        </div>

        {/* Timeline bulanan */}
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Bulan', 'Termin Masuk', 'Jml', 'Saldo Kas Proyeksi'].map((h, i) => (
                  <th key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'text-left' : i === 2 ? 'text-center' : 'text-right'}`}>{h}</th>))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{fmtMonth(m.month)}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-600">{Number(m.termin_in) ? fmtRp(m.termin_in) : '—'}</td>
                  <td className="px-4 py-2.5 text-center text-slate-400">{m.count || '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${m.saldo >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{fmtRp(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400">Perkiraan masuk = sisa termin pembeli (jatuh tempo) + retensi bank belum cair. Kewajiban = biaya yang sudah divalidasi tapi menunggu dibayar. Ini indikator likuiditas, bukan angka pasti.</p>
    </div>
  )
}

function Row({ label, value, pos, neg, bold }: { label: string; value: string; pos?: boolean; neg?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-slate-800' : 'text-slate-600'}>{label}</span>
      <span className={`${bold ? 'font-bold text-brand-700' : pos ? 'text-emerald-600' : neg ? 'text-red-600' : 'text-slate-800'} font-medium whitespace-nowrap`}>{value}</span>
    </div>
  )
}

// ═══════════════════════ PAGE ═══════════════════════
const TABS = [
  { key: 'cashflow', label: 'Arus Kas', desc: 'Kas masuk dari pembeli vs bank, plus piutang & retensi.' },
  { key: 'profit', label: 'Laba/Rugi Proyek', desc: 'Untung-rugi per proyek & margin per unit. Laporan operasional, bukan akuntansi formal.' },
  { key: 'retention', label: 'Retensi Bank', desc: 'Sisa dana yang masih ditahan tiap bank penyalur (plafon akad − sudah cair).' },
  { key: 'projection', label: 'Proyeksi Kas', desc: 'Perkiraan likuiditas: saldo kas + termin & retensi yang akan masuk − biaya menunggu bayar.' },
  { key: 'sales', label: 'Rekap Penjualan', desc: 'Penjualan & kas masuk per proyek, status unit.' },
  { key: 'construction', label: 'Progres Konstruksi', desc: 'Progres pembangunan per proyek: tahap, % rata-rata, selesai & keterlambatan.' },
  { key: 'aging', label: 'Tunggakan', desc: 'Termin lewat jatuh tempo, dikelompokkan umur & per pembeli.' },
  { key: 'kpr', label: 'Rejection-Rate KPR', desc: 'Persentase pengajuan KPR ditolak per bank penyalur.' },
  { key: 'tax', label: 'Pajak Bulanan', desc: 'Rekap PPh per pembeli per bulan — nama, NIK, lokasi, AJB, jumlah, NTPN, notaris.' },
  { key: 'tax-checklist', label: 'Checklist Pajak', desc: 'Pembeli yang perpajakannya (PPh/BPHTB/PPN) belum tuntas — belum ada data, belum bayar, atau menunggu validasi.' },
] as const
type TabKey = (typeof TABS)[number]['key']

// Report dipecah per kategori (menu sidebar) — tiap kategori hanya menampilkan subset tab yang relevan.
const CATEGORIES: Record<string, { label: string; tabs: TabKey[] }> = {
  pajak: { label: 'Report Pajak', tabs: ['tax', 'tax-checklist'] },
  keuangan: { label: 'Report Keuangan', tabs: ['cashflow', 'profit', 'retention', 'projection'] },
  marketing: { label: 'Report Marketing', tabs: ['kpr', 'sales', 'aging'] },
  pembangunan: { label: 'Report Pembangunan', tabs: ['construction'] },
}
const DEFAULT_CATEGORY = 'marketing'

export default function Reports() {
  const { category = DEFAULT_CATEGORY } = useParams<{ category: string }>()
  const cat = CATEGORIES[category] ?? CATEGORIES[DEFAULT_CATEGORY]
  const catTabs = TABS.filter((t) => cat.tabs.includes(t.key))

  const [tab, setTab] = useState<TabKey>(catTabs[0].key)
  // pindah kategori (lewat sidebar) → reset ke tab pertama kategori itu kalau tab lama tak relevan lagi
  useEffect(() => {
    if (!catTabs.some((t) => t.key === tab)) setTab(catTabs[0].key)
  }, [category])  // eslint-disable-line react-hooks/exhaustive-deps
  const active = catTabs.find((t) => t.key === tab) ?? catTabs[0]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{cat.label}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{active.desc}</p>
      </div>

      {catTabs.length > 1 && (
        <div className="flex gap-1 border-b border-slate-200">
          {catTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {active.key === 'cashflow' && <CashflowTab />}
      {active.key === 'profit' && <ProjectProfitTab />}
      {active.key === 'retention' && <BankRetentionTab />}
      {active.key === 'projection' && <CashProjectionTab />}
      {active.key === 'sales' && <SalesRecapTab />}
      {active.key === 'construction' && <ConstructionProgressTab />}
      {active.key === 'aging' && <AgingTab />}
      {active.key === 'kpr' && <KprRejectionTab />}
      {active.key === 'tax' && <MonthlyTaxTab />}
      {active.key === 'tax-checklist' && <TaxChecklistTab />}
    </div>
  )
}
