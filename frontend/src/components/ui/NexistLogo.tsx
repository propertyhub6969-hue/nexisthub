interface NexistLogoProps {
  size?: number
  showText?: boolean
  textColor?: string
}

export default function NexistLogo({
  size = 32,
  showText = true,
  textColor = '#1A56DB',
}: NexistLogoProps) {
  const s = size

  return (
    <div className="flex items-center gap-2">
      {/* Logo mark */}
      <svg
        width={s}
        height={s}
        viewBox="0 0 48 48"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Blue square with N */}
        <rect x="2" y="4" width="32" height="32" rx="7" fill="#1A56DB" />
        <text
          x="9"
          y="28"
          fontFamily="Arial Black, Arial, sans-serif"
          fontSize="22"
          fontWeight="900"
          fill="white"
        >
          N
        </text>
        {/* Green pill */}
        <rect x="28" y="10" width="18" height="30" rx="9" fill="#22C55E" />
      </svg>

      {/* Brand name */}
      {showText && (
        <span
          style={{ color: textColor, fontWeight: 700, fontSize: size * 0.56, letterSpacing: '-0.01em' }}
        >
          nexist
        </span>
      )}
    </div>
  )
}
