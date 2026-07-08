// Panel kiri halaman auth (login/register): ink navy + grid blueprint + wordmark & tagline.
// Signature identitas NexistHub — disembunyikan di layar kecil.
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
          Membangun rumah,<br />bukan mengejar berkas.
        </h2>
        <p className="mt-4 text-slate-300 text-sm max-w-sm leading-relaxed">
          Rumah subsidi menuntut volume besar dengan margin tipis — KPR FLPP,
          pencairan bank bertahap, legalitas &amp; pajak yang tak boleh keliru.
          NexistHub merapikan semuanya dalam satu sistem, agar tim Anda fokus
          menyelesaikan unit dan menyerahkan kunci tepat waktu.
        </p>
      </div>

      <div className="relative flex items-center gap-2 text-xs text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-brass-500" />
        The future of work, built for your business.
      </div>
    </div>
  )
}
