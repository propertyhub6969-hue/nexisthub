import { Check } from 'lucide-react'

// Panel kiri halaman auth (login/register): ink navy + grid blueprint + ilustrasi + wordmark & tagline.
// Signature identitas NexistHub — disembunyikan di layar kecil.
const FEATURES = [
  'Marketing terintegrasi — Pembeli, KPR & follow-up otomatis',
  'Procurement real-time. Finance & legalitas terpadu.',
  'Laporan & analitik penjualan real-time',
  'Deteksi kebocoran biaya per unit',
  'AI-powered insights untuk keputusan lebih cepat',
]

// Ilustrasi vektor (murni SVG, tanpa file eksternal): crane konstruksi mengangkat unit yang dibangun →
// deret rumah jadi → sertifikat (SHM) → pengajuan KPR ke bank (%), plus kartu dashboard. Cerita alur bisnis.
function Illustration() {
  const brass = '#c79a52'
  const muted = '#3a4560'
  const cardBg = '#1b2540'
  const deep = '#141b2d'
  return (
    <svg viewBox="0 0 440 250" className="w-full h-auto" role="img" aria-label="Kompleks perumahan dengan crane konstruksi, dashboard, sertifikat unit, dan pembiayaan KPR">
      <path d="M34 236 H372" fill="none" stroke={muted} strokeWidth="1.2" strokeDasharray="6 7" opacity="0.8" />

      {/* Crane */}
      <g fill="none" stroke={brass} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M62 236 h20 l-3 -7 h-14 z" fill={brass} fillOpacity="0.12" />
        <path d="M68 229 V100 M76 229 V100" />
        <path d="M68 208 L76 196 M76 208 L68 196 M68 176 L76 164 M76 176 L68 164 M68 144 L76 132 M76 144 L68 132 M68 118 L76 108 M76 118 L68 108" strokeWidth="1" opacity="0.85" />
        <path d="M64 100 L72 88 L80 100" />
        <path d="M72 96 L156 96 M72 104 L150 104 M156 96 L150 104 M126 96 V104 M100 96 V104" />
        <path d="M72 96 L46 96 L46 104 L72 104" />
        <rect x="44" y="104" width="11" height="9" rx="1.5" fill={brass} fillOpacity="0.2" />
        <path d="M72 88 L156 96 M72 88 L46 96" strokeWidth="1" opacity="0.7" />
        <path d="M138 96 V126" strokeWidth="1.1" />
        <rect x="131" y="126" width="14" height="10" rx="1.5" fill={brass} fillOpacity="0.18" />
      </g>

      {/* Unit sedang dibangun */}
      <g fill="none" stroke={brass} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.9">
        <path d="M112 236 H158 M112 236 V198 M158 236 V198 M135 236 V198 M112 198 H158" />
        <path d="M112 198 L135 184 L158 198" strokeDasharray="4 4" />
        <path d="M106 216 H164" stroke={muted} strokeWidth="1" />
        <path d="M106 216 V236 M164 216 V236" stroke={muted} strokeWidth="1" opacity="0.8" />
      </g>

      {/* Rumah jadi */}
      <g fill="none" stroke={brass} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <g><path d="M182 236 V202 L204 185 L226 202 V236 Z" fill={brass} fillOpacity="0.08" /><rect x="198" y="214" width="12" height="22" fill={brass} fillOpacity="0.18" strokeWidth="1.2" /></g>
        <g><path d="M232 236 V202 L254 185 L276 202 V236 Z" fill={brass} fillOpacity="0.08" /><rect x="248" y="214" width="12" height="22" fill={brass} fillOpacity="0.18" strokeWidth="1.2" /></g>
        <g><path d="M282 236 V202 L304 185 L326 202 V236 Z" fill={brass} fillOpacity="0.08" /><rect x="298" y="214" width="12" height="22" fill={brass} fillOpacity="0.18" strokeWidth="1.2" /></g>
      </g>

      {/* Marker siteplan */}
      <g stroke={brass} strokeWidth="1.7" fill="none">
        <path d="M211 172 c0 -9 -14 -9 -14 0 c0 7 7 13 7 13 c0 0 7 -6 7 -13 z" fill={deep} />
        <circle cx="204" cy="172" r="3" fill={brass} stroke="none" />
      </g>

      {/* Kartu dashboard */}
      <g>
        <path d="M225 118 C 270 96, 300 92, 322 90" fill="none" stroke={brass} strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
        <rect x="322" y="50" width="98" height="66" rx="8" fill={cardBg} stroke={brass} strokeOpacity="0.5" />
        <rect x="332" y="60" width="40" height="5" rx="2.5" fill={brass} opacity="0.85" />
        <rect x="332" y="71" width="60" height="4" rx="2" fill={muted} />
        <polyline points="332,92 345,87 358,82 371,85 384,78 398,76" fill="none" stroke="#fff" strokeWidth="1.3" opacity="0.55" />
        <g fill={brass}>
          <rect x="332" y="102" width="9" height="8" rx="1.5" opacity="0.55" />
          <rect x="345" y="96" width="9" height="14" rx="1.5" opacity="0.7" />
          <rect x="358" y="90" width="9" height="20" rx="1.5" />
          <rect x="371" y="98" width="9" height="12" rx="1.5" opacity="0.7" />
          <rect x="384" y="94" width="9" height="16" rx="1.5" opacity="0.85" />
        </g>
      </g>

      {/* Alur: unit -> sertifikat -> bank(KPR) */}
      <path d="M306 186 C 310 180, 312 176, 316 174" fill="none" stroke={brass} strokeWidth="1" strokeDasharray="3 4" opacity="0.75" />
      <path d="M350 176 C 353 175, 355 174, 358 173" fill="none" stroke={brass} strokeWidth="1" strokeDasharray="3 4" opacity="0.75" />

      {/* Sertifikat / dokumen */}
      <g fill="none" stroke={brass} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <rect x="316" y="150" width="34" height="44" rx="3.5" fill={cardBg} />
        <path d="M322 160 H344 M322 167 H340 M322 174 H343" strokeWidth="1.2" opacity="0.9" />
        <circle cx="333" cy="184" r="5.2" fill={deep} />
        <path d="M330 188 L328 196 L333 193 L338 196 L336 188" fill={brass} fillOpacity="0.22" strokeWidth="1.1" />
        <circle cx="333" cy="184" r="2.2" fill={brass} stroke="none" />
      </g>

      {/* Bank (KPR) */}
      <g fill="none" stroke={brass} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M358 200 H414 M361 196 H411" />
        <path d="M362 160 L386 145 L410 160 Z" fill={brass} fillOpacity="0.1" />
        <path d="M358 160 H414" strokeWidth="1.6" />
        <path d="M366 164 V194 M378 164 V194 M394 164 V194 M406 164 V194" />
        <text x="386" y="160" textAnchor="middle" fontSize="10" fontWeight="700" fill={brass} stroke="none">%</text>
      </g>
      <text x="366" y="218" textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="1.5" fill={brass}>SHM · KPR</text>
    </svg>
  )
}

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
        <div className="-mx-12 mb-8">
          <Illustration />
        </div>
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
