import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, UserCheck, Handshake, Home, KeyRound, CheckCircle2, Wallet, TrendingUp, AlertTriangle, Loader2, BarChart3, ClipboardList, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { reportingService } from '../services/reporting'
import { propertyService } from '../services/property'
import { taxService } from '../services/tax'
import type { DashboardStats, SalesMonthly, Project } from '../types'

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const monShort = (ym: string) => { const [y, m] = ym.split('-'); return `${monthLabels[Number(m) - 1] ?? m} '${y.slice(2)}` }

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

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

function StatCard({ icon: Icon, label, value, color, bg, sub }: {
  icon: LucideIcon
  label: string; value: string; color: string; bg: string; sub?: string
}) {
  return (
    <div className="card p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:shadow-soft transition-shadow">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={color} />
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg sm:text-xl font-bold text-slate-900 truncate tracking-tight">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

function NotaryDashboardCard() {
  const [debt, setDebt] = useState<number | null>(null)
  const [macet, setMacet] = useState<number | null>(null)

  useEffect(() => {
    // gagal (mis. modul pajak mati / tanpa akses) → diam-diam sembunyi
    taxService.notaryDebts().then((d) => setDebt(d.grand_total)).catch(() => {})
    taxService.notaryWorklist({ only_macet: true }).then((w) => setMacet(w.macet_count)).catch(() => {})
  }, [])

  // sembunyikan bila belum ada data ATAU tak ada tunggakan sama sekali
  if (debt == null && macet == null) return null
  if ((debt ?? 0) === 0 && (macet ?? 0) === 0) return null

  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notaris</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/marketing/notary-monitor" className="card p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><Wallet size={18} className="text-amber-500" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400">Hutang ke Notaris</p>
            <p className="text-lg font-bold text-slate-900 truncate">{fmt(debt ?? 0)}</p>
          </div>
          <ChevronRight size={16} className="text-slate-300 shrink-0" />
        </Link>
        <Link to="/marketing/notary-monitor" className="card p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${(macet ?? 0) > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <ClipboardList size={18} className={(macet ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400">Pekerjaan Macet (&gt;15 hari)</p>
            <p className={`text-lg font-bold ${(macet ?? 0) > 0 ? 'text-red-600' : 'text-slate-900'}`}>{macet ?? 0}</p>
          </div>
          <ChevronRight size={16} className="text-slate-300 shrink-0" />
        </Link>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    reportingService.dashboard().then(setStats).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  const s = stats
  return (
    <div className="space-y-6">
      {/* Keuangan */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Keuangan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Wallet} label="Uang Masuk Bulan Ini" value={fmt(s?.payments_this_month)} color="text-emerald-500" bg="bg-emerald-50" />
          <StatCard icon={TrendingUp} label="Total Terbayar" value={fmt(s?.total_paid)} color="text-blue-500" bg="bg-blue-50" sub={`dari ${fmt(s?.total_contract)} kontrak`} />
          <StatCard icon={Wallet} label="Sisa Piutang" value={fmt(s?.outstanding)} color="text-amber-500" bg="bg-amber-50" />
          <StatCard icon={AlertTriangle} label="Termin Terlambat" value={String(s?.overdue_count ?? 0)} color="text-red-500" bg="bg-red-50" />
        </div>
      </div>

      {/* Pemasaran */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pemasaran</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={Users} label="Total Leads" value={String(s?.leads_total ?? 0)} color="text-blue-500" bg="bg-blue-50" />
          <StatCard icon={UserCheck} label="Prospek Aktif" value={String(s?.prospects_active ?? 0)} color="text-amber-500" bg="bg-amber-50" />
          <StatCard icon={Handshake} label="Pembeli" value={String(s?.clients_total ?? 0)} color="text-emerald-500" bg="bg-emerald-50" />
        </div>
      </div>

      {/* Unit */}
      <div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Inventori Unit ({s?.units_total ?? 0} total)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={Home} label="Tersedia" value={String(s?.units_available ?? 0)} color="text-emerald-500" bg="bg-emerald-50" />
          <StatCard icon={KeyRound} label="Booking / DP" value={String(s?.units_booked ?? 0)} color="text-amber-500" bg="bg-amber-50" />
          <StatCard icon={CheckCircle2} label="Terjual" value={String(s?.units_sold ?? 0)} color="text-blue-500" bg="bg-blue-50" />
        </div>
      </div>

      {/* Notaris — hutang & pekerjaan tertahan (mandiri, sembunyi bila modul mati / tak ada tunggakan) */}
      <NotaryDashboardCard />

      {/* Grafik Penjualan */}
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
