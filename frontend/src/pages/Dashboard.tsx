import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Layers, FileText, Hammer, Wallet, AlertTriangle, Loader2,
  BarChart3, ChevronRight, TrendingUp, CheckCircle2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { reportingService } from '../services/reporting'
import { propertyService } from '../services/property'
import type {
  DashboardStats, SalesMonthly, Project,
  SalesRecapReport, SalesProject, KprSummaryReport, ProjectKprRow,
  ConstructionProgressReport, ConstructionProject, FinanceSummary,
} from '../types'

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const monShort = (ym: string) => { const [y, m] = ym.split('-'); return `${monthLabels[Number(m) - 1] ?? m} '${y.slice(2)}` }

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

// ── Pemilih proyek per-seksi (default: proyek pertama yang ada datanya) ──
function useProjectPick<T extends { project_id: string; project_name: string }>(projects: T[]) {
  const [pid, setPid] = useState('')
  useEffect(() => { if (!pid && projects.length) setPid(projects[0].project_id) }, [projects, pid])
  const sel = projects.find((p) => p.project_id === pid) ?? projects[0]
  return { pid, setPid, sel }
}

function ProjectSelect({ value, onChange, projects }: {
  value: string; onChange: (v: string) => void; projects: { project_id: string; project_name: string }[]
}) {
  return (
    <select className="input h-8 py-0 text-xs w-40" value={value} onChange={(e) => onChange(e.target.value)}>
      {projects.length === 0 && <option value="">— belum ada —</option>}
      {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
    </select>
  )
}

// Cincin progres (SVG) — dipakai di seksi Penjualan & Pembangunan.
function Ring({ pct, color = 'text-emerald-500', size = 60 }: { pct: number; color?: string; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(Math.max(pct, 0), 100)
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-100" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
        className={color} strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-700 font-bold" style={{ fontSize: 13 }}>
        {Math.round(p)}%
      </text>
    </svg>
  )
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div>
      <p className={`font-display text-xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

// Gaya seksi = identitas NexistHub: label KAPITAL muted, tanpa prefiks huruf & kotak ikon warna.
function SectionShell({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="card p-4 sm:p-5 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

// ═══════════ A. PENJUALAN ═══════════
function SalesSection({ report }: { report: SalesRecapReport | null }) {
  const projects: SalesProject[] = report?.projects ?? []
  const { pid, setPid, sel } = useProjectPick(projects)
  const total = sel?.units_total ?? 0
  const sold = sel?.units_sold ?? 0
  const belumLaku = total - sold
  const pct = total ? (sold / total) * 100 : 0

  return (
    <SectionShell title="Penjualan"
      right={<ProjectSelect value={pid} onChange={setPid} projects={projects} />}>
      {!sel ? <p className="py-8 text-center text-sm text-slate-400">Belum ada proyek.</p> : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Total Kavling" value={total} />
            <Metric label="Terjual" value={sold} accent="text-blue-600" />
            <Metric label="Belum Laku" value={belumLaku} accent="text-amber-600" />
            <div className="flex items-center gap-3">
              <Ring pct={pct} color="text-emerald-500" />
              <div><p className="text-xs text-slate-500">Persentase Terjual</p><p className="text-xs text-slate-400">dari total kavling</p></div>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 p-3">
            <p className="text-xs font-semibold text-brand-700 mb-1">Progress Penjualan</p>
            <p className="text-[11px] text-slate-500 mb-2">Dari total {total} kavling, {sold} kavling telah terjual.</p>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-right text-[11px] font-semibold text-brand-600 mt-1">{pct.toFixed(0)}%</p>
          </div>
        </>
      )}
    </SectionShell>
  )
}

// ═══════════ B. DATA SPPR / KPR ═══════════
function KprSection({ report }: { report: KprSummaryReport | null }) {
  const projects: ProjectKprRow[] = report?.projects ?? []
  const { pid, setPid, sel } = useProjectPick(projects)

  return (
    <SectionShell title="Data SPPR / KPR"
      right={<ProjectSelect value={pid} onChange={setPid} projects={projects} />}>
      {!sel ? <p className="py-8 text-center text-sm text-slate-400">Belum ada proyek.</p> : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Total SPPR" value={sel.total_sppr} />
            <Metric label="Disetujui Bank" value={sel.approved_bank} accent="text-emerald-600" />
            <Metric label="Belum Disetujui" value={sel.not_approved} accent="text-amber-600" />
            <Metric label="SPPR Ditolak" value={sel.rejected} accent={sel.rejected > 0 ? 'text-red-600' : undefined} />
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 p-3">
            <p className="text-xs font-semibold text-brand-700 mb-2">Metode Pembayaran</p>
            {sel.methods.length === 0 ? (
              <p className="text-[11px] text-slate-400">Belum ada pembeli.</p>
            ) : (
              <div className="space-y-1.5">
                {sel.methods.map((m) => (
                  <div key={m.method} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${m.method === 'kpr' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                    <span className="text-slate-600 flex-1">{m.label}</span>
                    <span className="text-slate-500">{m.count} unit</span>
                    <span className="text-slate-400 w-10 text-right">{m.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </SectionShell>
  )
}

// ═══════════ C. PEMBANGUNAN ═══════════
function ConstructionSection({ report }: { report: ConstructionProgressReport | null }) {
  const projects: ConstructionProject[] = report?.projects ?? []
  const { pid, setPid, sel } = useProjectPick(projects)

  return (
    <SectionShell title="Pembangunan"
      right={<ProjectSelect value={pid} onChange={setPid} projects={projects} />}>
      {!sel ? <p className="py-8 text-center text-sm text-slate-400">Belum ada proyek.</p> : (
        <>
          <p className="text-xs font-semibold text-slate-500 mb-2">Distribusi Progres Fisik</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5"><Metric label="Belum Mulai" value={sel.not_started} /></div>
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5"><Metric label="Dalam Proses" value={sel.in_progress} accent="text-amber-600" /></div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2.5"><Metric label="Selesai" value={sel.done} accent="text-emerald-600" /></div>
          </div>

          <p className="text-xs font-semibold text-slate-500 mt-4 mb-2">Ketepatan Waktu</p>
          <div className="flex items-center gap-4">
            <Ring pct={sel.avg_percent} color="text-brand-500" size={64} />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle size={13} className={sel.overdue_target > 0 ? 'text-red-500' : 'text-slate-300'} />
                <span className="text-slate-600 flex-1">Lewat target</span>
                <span className={`font-semibold ${sel.overdue_target > 0 ? 'text-red-600' : 'text-slate-500'}`}>{sel.overdue_target} unit</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle size={13} className={sel.late_update > 0 ? 'text-amber-500' : 'text-slate-300'} />
                <span className="text-slate-600 flex-1">Telat update &gt;7 hari</span>
                <span className={`font-semibold ${sel.late_update > 0 ? 'text-amber-600' : 'text-slate-500'}`}>{sel.late_update} unit</span>
              </div>
              <p className="text-[11px] text-slate-400 pt-0.5">Cincin = rata-rata progres fisik proyek ini.</p>
            </div>
          </div>
        </>
      )}
    </SectionShell>
  )
}

// ── Grafik penjualan 12 bulan (tak berubah) ──
function SalesChart() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [year, setYear] = useState('')
  const [data, setData] = useState<SalesMonthly[]>([])

  useEffect(() => { propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {}) }, [])
  useEffect(() => { reportingService.salesMonthly(projectId || undefined, year ? Number(year) : undefined).then(setData).catch(() => {}) }, [projectId, year])

  const max = Math.max(1, ...data.map((d) => d.value))
  const totalUnit = data.reduce((a, d) => a + d.count, 0)
  const totalVal = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><BarChart3 size={15} /> Penjualan {year ? `Tahun ${year}` : '12 Bulan Terakhir'}</h3>
        <div className="flex items-center gap-2">
          <select className="input h-8 py-0 text-xs w-44" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Semua proyek</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input h-8 py-0 text-xs w-28" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">12 bln terakhir</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-xs text-slate-400 whitespace-nowrap">{totalUnit} unit · {fmt(totalVal)}</span>
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Belum ada penjualan.</p>
      ) : (
        <div className="flex items-end gap-1.5 h-44">
          {data.map((d) => (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end"
              title={`${monShort(d.month)}: ${d.count} unit · ${fmt(d.value)}`}>
              <span className="text-[10px] text-slate-500 font-medium">{d.count || ''}</span>
              <div className="w-full max-w-[36px] rounded-t bg-brand-500 hover:bg-brand-600 transition-colors"
                style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0)}%` }} />
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{monShort(d.month)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3">Angka di atas batang = jumlah unit terjual; tinggi batang = nilai penjualan (hover untuk detail).</p>
    </div>
  )
}

// KPI atas
function KpiCard({ icon: Icon, label, value, color, bg }: { icon: LucideIcon; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className="card p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:shadow-soft transition-shadow">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}><Icon size={18} className={color} /></div>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold text-slate-900 truncate tracking-tight">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Strip Keuangan berfilter: Lokasi (proyek) + Bulan ──
// "Uang Masuk" ikut bulan terpilih; "Sisa Piutang" & "Total Terbayar" akumulatif (seluruh),
// keduanya tetap ikut filter lokasi. Semua angka dihitung ulang di backend saat filter berubah.
function monthOptions(): { value: string; label: string }[] {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${monthLabels[d.getMonth()]} ${d.getFullYear()}` }
  })
}

function FinanceCol({ icon: Icon, color, bg, label, value }: { icon: LucideIcon; color: string; bg: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}><Icon size={16} className={color} /></div>
      <div className="min-w-0">
        <p className="font-display text-lg font-bold text-slate-900 truncate tracking-tight">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function FinanceStrip() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const months = monthOptions()
  const [month, setMonth] = useState(months[0].value)
  const [data, setData] = useState<FinanceSummary | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {}) }, [])
  useEffect(() => {
    setBusy(true)
    reportingService.financeSummary({ project_id: projectId || undefined, month })
      .then(setData).catch(() => {}).finally(() => setBusy(false))
  }, [projectId, month])

  const monthLabel = months.find((m) => m.value === month)?.label ?? month
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Wallet size={15} /> Keuangan</h3>
        <div className="flex items-center gap-2">
          <select className="input h-8 py-0 text-xs w-40" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Semua lokasi</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input h-8 py-0 text-xs w-32" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {busy && <Loader2 size={13} className="animate-spin text-slate-300" />}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FinanceCol icon={Wallet} color="text-emerald-500" bg="bg-emerald-50" label={`Uang Masuk · ${monthLabel}`} value={fmt(data?.cash_in)} />
        <FinanceCol icon={TrendingUp} color="text-amber-500" bg="bg-amber-50" label="Sisa Piutang · seluruh" value={fmt(data?.outstanding)} />
        <FinanceCol icon={CheckCircle2} color="text-blue-500" bg="bg-blue-50" label="Total Terbayar · seluruh" value={fmt(data?.total_paid)} />
        <FinanceCol icon={AlertTriangle} color="text-red-500" bg="bg-red-50" label="Termin Terlambat" value={String(data?.overdue_count ?? 0)} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [sales, setSales] = useState<SalesRecapReport | null>(null)
  const [kpr, setKpr] = useState<KprSummaryReport | null>(null)
  const [constr, setConstr] = useState<ConstructionProgressReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      reportingService.dashboard().then(setStats).catch(() => {}),
      reportingService.salesRecap().then(setSales).catch(() => {}),
      reportingService.kprSummary().then(setKpr).catch(() => {}),
      reportingService.constructionProgress().then(setConstr).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  const s = stats
  const pembangunanAktif = (constr?.projects ?? []).reduce((a, p) => a + p.in_progress, 0)

  return (
    <div className="space-y-6">
      {/* KPI atas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Total Client Terdaftar" value={s?.clients_total ?? 0} color="text-blue-500" bg="bg-blue-50" />
        <KpiCard icon={Layers} label="Total Kavling" value={s?.units_total ?? 0} color="text-emerald-500" bg="bg-emerald-50" />
        <KpiCard icon={FileText} label="SPPR Aktif" value={kpr?.sppr_active_total ?? 0} color="text-orange-500" bg="bg-orange-50" />
        <KpiCard icon={Hammer} label="Pembangunan Aktif" value={pembangunanAktif} color="text-purple-500" bg="bg-purple-50" />
      </div>

      {/* Strip keuangan berfilter (lokasi + bulan) */}
      <FinanceStrip />

      {/* 3 seksi utama */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SalesSection report={sales} />
        <KprSection report={kpr} />
        <ConstructionSection report={constr} />
      </div>

      {/* Unit tertahan tanpa data Pembeli */}
      {(s?.units_held_no_client ?? 0) > 0 && (
        <Link to="/marketing/booking-requests?tab=accepted" className="card p-4 flex items-center gap-4 border-amber-200 bg-amber-50/60 hover:bg-amber-50 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">{s?.units_held_no_client} unit ditahan tanpa data Pembeli</p>
            <p className="text-xs text-amber-700/80 mt-0.5">Biasanya dari booking agen yang sudah diterima — lanjutkan jadi Pembeli, atau lepas unitnya.</p>
          </div>
          <ChevronRight size={16} className="text-amber-500 shrink-0" />
        </Link>
      )}

      <SalesChart />

      {(s?.leads_total ?? 0) === 0 && (s?.units_total ?? 0) === 0 && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-2">Selamat datang di NexistHub 👋</h2>
          <p className="text-sm text-slate-500">
            Mulai dengan menambahkan <strong>Proyek &amp; Unit</strong> di menu Properti, lalu catat
            <strong> Lead</strong> dan <strong>Pembeli</strong> Anda.
          </p>
        </div>
      )}
    </div>
  )
}
