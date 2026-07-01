import { useEffect, useState } from 'react'
import { Users, UserCheck, Handshake, Home, KeyRound, CheckCircle2, Wallet, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { reportingService } from '../services/reporting'
import type { DashboardStats } from '../types'

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

function StatCard({ icon: Icon, label, value, color, bg, sub }: {
  icon: LucideIcon
  label: string; value: string; color: string; bg: string; sub?: string
}) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-900 truncate">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
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
