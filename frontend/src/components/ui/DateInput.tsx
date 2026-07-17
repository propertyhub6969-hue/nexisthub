import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'

interface DateInputProps {
  value?: string                       // ISO (yyyy-mm-dd)
  onChange: (iso: string) => void      // kirim ISO (atau '' saat kosong)
  className?: string
  required?: boolean
  disabled?: boolean
  max?: string                         // ISO
  min?: string                         // ISO
  id?: string
}

// ISO (yyyy-mm-dd) -> tampilan Indonesia (dd/mm/yyyy)
const isoToId = (iso?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
// dd/mm/yyyy -> ISO; '' bila belum valid
const idToIso = (s: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return ''
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3])
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900) return ''
  const d = new Date(yyyy, mm - 1, dd)
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return ''  // mis. 31/02
  return `${m[3]}-${m[2]}-${m[1]}`
}
// sisipkan slash otomatis saat mengetik: 8 digit -> dd/mm/yyyy
const autoSlash = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// Input tanggal Indonesia: tampil/ketik dd/mm/yyyy, nilai disimpan ISO. Ikon kalender membuka picker native.
export default function DateInput({ value, onChange, className = 'input', required, disabled, max, min, id }: DateInputProps) {
  const [text, setText] = useState(isoToId(value))
  const nativeRef = useRef<HTMLInputElement>(null)

  // sinkron bila value diubah dari luar (reset form), tanpa mengganggu ketikan
  useEffect(() => {
    if (idToIso(text) !== (value || '')) setText(isoToId(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const openPicker = () => {
    const el = nativeRef.current
    if (!el || disabled) return
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.focus()
  }

  return (
    <div className="relative">
      <input
        id={id}
        className={className}
        style={{ paddingRight: '2.25rem' }}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        required={required}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const t = autoSlash(e.target.value)
          setText(t)
          const iso = idToIso(t)
          if (iso) onChange(iso)
          else if (t === '') onChange('')
        }}
        onBlur={() => {
          const iso = idToIso(text)
          if (!iso && text !== '') setText(isoToId(value))  // kembalikan ke nilai sah bila ketikan tak valid
        }}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Pilih tanggal"
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-brand-600 disabled:opacity-50"
        tabIndex={-1}
      >
        <Calendar size={16} />
      </button>
      <input
        ref={nativeRef}
        type="date"
        max={max}
        min={min}
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setText(isoToId(e.target.value)) }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
