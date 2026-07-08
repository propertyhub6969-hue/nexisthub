import { Check } from 'lucide-react'

// Panel kiri halaman auth (login/register): ink navy + grid blueprint + wordmark & tagline.
// Signature identitas NexistHub — disembunyikan di layar kecil.
const FEATURES = [
  'Marketing terintegrasi — Pembeli, KPR & follow-up otomatis',
  'Procurement real-time. Finance & legalitas terpadu.',
  'Laporan & analitik penjualan real-time',
  'Deteksi kebocoran biaya per unit',
  'AI-powered insights untuk keputusan lebih cepat',
]

export default function BrandPanel() {
  return (
    <div className="relative hidden lg:flex flex-col justify-between bg-sidebar text-white p-12 overflow-hidden">
      <div className="absolute inset-0 bp-grid opacity-70" />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-500/25 blur-3xl" />

      <div className="relative">
        <p className="font-display text-3xl font-extrabold tracking-tight">
          Nexist<span className="text-brass-500">Hub</span>
        </p>
      </div>

      <div className="relative">
        <div className="h-px w-14 bg-brass-500 mb-6" />
        <h2 className="font-display text-3xl sm:text-4xl font-bold leading-[1.15] text-white">
          Ribuan unit,<br />satu dashboard.
        </h2>

        <ul className="mt-5 space-y-2 max-w-sm">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300 leading-snug">
              <Check size={15} className="text-brass-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <p className="mt-6 font-display text-base font-semibold text-white">
          Efisiensi developer rumah subsidi, <span className="text-brass-400">dimulai.</span>
        </p>
      </div>

      <div className="relative flex items-center gap-2 text-xs text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-brass-500" />
        The future of work, built for your business.
      </div>
    </div>
  )
}
