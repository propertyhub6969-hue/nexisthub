import { useId } from 'react'

interface NexistLogoProps {
  size?: number
  showText?: boolean
  textColor?: string   // warna bagian "Nexist" — "Hub" selalu brass, samakan dgn halaman login
}

// Mark identitas "Ink & Brass": kotak navy + "N" + bilah brass, dipasangkan wordmark Nexist(Hub)
// dengan treatment sama seperti BrandPanel/Login (Hub selalu brass-500).
export default function NexistLogo({
  size = 32,
  showText = true,
  textColor = '#0f172a',
}: NexistLogoProps) {
  const s = size
  const clipId = useId()

  return (
    <div className="flex items-center gap-2">
      <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <clipPath id={clipId}>
          <rect x="1" y="1" width="46" height="46" rx="10" />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          <rect x="1" y="1" width="46" height="46" fill="#141b2d" />
          <rect x="30" y="1" width="17" height="46" fill="#c79a52" />
        </g>
        <text x="7" y="33" fontFamily="'Plus Jakarta Sans', Arial, sans-serif" fontSize="25" fontWeight="800" fill="#ffffff">N</text>
      </svg>

      {showText && (
        <span className="font-display font-extrabold tracking-tight" style={{ color: textColor, fontSize: size * 0.56 }}>
          Nexist<span style={{ color: '#c79a52' }}>Hub</span>
        </span>
      )}
    </div>
  )
}
