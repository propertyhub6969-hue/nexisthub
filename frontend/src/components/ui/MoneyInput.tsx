interface MoneyInputProps {
  value?: number
  onChange: (value: number | undefined) => void
  className?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
}

// Input uang: tampil dengan pemisah ribuan titik (mis. 450.000.000), simpan sebagai number.
export default function MoneyInput({ value, onChange, className = 'input', placeholder, required, disabled }: MoneyInputProps) {
  const display = value == null || Number.isNaN(value) ? '' : value.toLocaleString('id-ID')
  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits === '' ? undefined : Number(digits))
      }}
    />
  )
}
