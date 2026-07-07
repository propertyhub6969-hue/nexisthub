import { useEffect, useState } from 'react'

interface MoneyInputProps {
  value?: number
  onChange: (value: number | undefined) => void
  className?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  allowNegative?: boolean  // izinkan nilai minus (mis. penyesuaian RAB ±)
}

const fmt = (v?: number) => v == null || Number.isNaN(v) ? '' : v.toLocaleString('id-ID')

// Input uang: tampil dengan pemisah ribuan titik (mis. 450.000.000), simpan sebagai number.
// Simpan teks lokal agar ketikan "-" (transisi minus) tak hilang saat allowNegative.
export default function MoneyInput({ value, onChange, className = 'input', placeholder, required, disabled, allowNegative }: MoneyInputProps) {
  const parse = (raw: string): number | undefined => {
    const neg = !!allowNegative && raw.trim().startsWith('-')
    const digits = raw.replace(/\D/g, '')
    if (digits === '') return undefined
    return Number(digits) * (neg ? -1 : 1)
  }

  const [text, setText] = useState(fmt(value))

  // sinkron bila value diubah dari luar (reset form / autofill), tanpa mengganggu ketikan
  useEffect(() => {
    if (parse(text) !== value) setText(fmt(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const raw = e.target.value
        const neg = !!allowNegative && raw.trim().startsWith('-')
        const digits = raw.replace(/\D/g, '')
        setText(digits === '' ? (neg ? '-' : '') : (neg ? '-' : '') + Number(digits).toLocaleString('id-ID'))
        onChange(digits === '' ? undefined : Number(digits) * (neg ? -1 : 1))
      }}
    />
  )
}
