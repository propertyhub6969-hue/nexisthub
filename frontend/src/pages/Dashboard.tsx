import { Users, UserCheck, Handshake, TrendingUp } from 'lucide-react'

const stats = [
  { label: 'Total Leads', value: '—', icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
  { label: 'Prospects Aktif', value: '—', icon: UserCheck, color: 'text-amber-500', bg: 'bg-amber-50' },
  { label: 'Clients', value: '—', icon: Handshake, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { label: 'Konversi', value: '—', icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50' },
]

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Welcome */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-2">
          Selamat datang di NexistHub 👋
        </h2>
        <p className="text-sm text-slate-500">
          Platform ERP untuk developer properti di Indonesia. Mulai dengan menambahkan
          lead pertama Anda di menu <strong>Marketing → Leads</strong>.
        </p>
      </div>
    </div>
  )
}
