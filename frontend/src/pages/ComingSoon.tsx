import { Construction } from 'lucide-react'

interface Props {
  name: string
}

export default function ComingSoon({ name }: Props) {
  return (
    <div className="card p-12 flex flex-col items-center justify-center text-center">
      <Construction size={40} className="text-slate-300 mb-4" />
      <h3 className="text-base font-semibold text-slate-700 mb-1">{name}</h3>
      <p className="text-sm text-slate-400">Modul ini akan tersedia di versi berikutnya.</p>
    </div>
  )
}
