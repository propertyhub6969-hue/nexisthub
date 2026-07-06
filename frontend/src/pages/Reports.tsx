import { useEffect, useState } from 'react'
import {
  Loader2, Landmark, TrendingDown, CheckCircle2, XCircle, FileStack,
  Wallet, Users, Building2, PiggyBank, HandCoins, Home, AlertTriangle, Clock,
} from 'lucide-react'
import { reportingService } from '../services/reporting'
import type { KprRejectionReport, CashflowReport, SalesRecapReport, AgingReport } from '../types'

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
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-medium uppercase tracking-wider">{label}</span></div>
      <div className={`mt-2 text-xl font-semibold ${accent ?? 'text-slate-900'}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}

// ═══════════════════════ ARUS KAS ═══════════════════════
function CashflowTab() {
  const [rep, setRep] = useState<CashflowReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    reportingService.cashflow().then(setRep).catch(() => setError('Gagal memuat arus kas.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
  if (!rep) return null

  const maxTotal = Math.max(1, ...rep.months.map((m) => m.total))

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Kas Masuk</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<Building2 size={15} />} label="Nilai Kontrak" value={fmtRp(rep.total_contract)} hint="pembeli aktif" />
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
        <StatCard icon={<Building2 size={15} />} label="Nilai Kontrak" value={fmtRp(rep.contract_value)} />
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
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Nilai Kontrak</th>
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

// ═══════════════════════ PAGE ═══════════════════════
const TABS = [
  { key: 'cashflow', label: 'Arus Kas', desc: 'Kas masuk dari pembeli vs bank, plus piutang & retensi.' },
  { key: 'sales', label: 'Rekap Penjualan', desc: 'Penjualan & kas masuk per proyek, status unit.' },
  { key: 'aging', label: 'Tunggakan', desc: 'Termin lewat jatuh tempo, dikelompokkan umur & per pembeli.' },
  { key: 'kpr', label: 'Rejection-Rate KPR', desc: 'Persentase pengajuan KPR ditolak per bank penyalur.' },
] as const

export default function Reports() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('cashflow')
  const active = TABS.find((t) => t.key === tab)!

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Laporan</h2>
        <p className="text-sm text-slate-500 mt-0.5">{active.desc}</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
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

      {tab === 'cashflow' && <CashflowTab />}
      {tab === 'sales' && <SalesRecapTab />}
      {tab === 'aging' && <AgingTab />}
      {tab === 'kpr' && <KprRejectionTab />}
    </div>
  )
}
