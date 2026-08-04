import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { subscribe, dismissToast, type Toast } from './toastStore'

const CFG = {
  success: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', ic: 'text-emerald-600' },
  error:   { icon: AlertTriangle, cls: 'border-red-200 bg-red-50 text-red-800',            ic: 'text-red-600' },
  info:    { icon: Info,          cls: 'border-slate-200 bg-white text-slate-700',         ic: 'text-brand-600' },
}

/** Wadah toast global — dipasang sekali di App, mendengar toastStore. */
export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribe(setToasts), [])

  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const { icon: Icon, cls, ic } = CFG[t.kind]
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border shadow-lg px-3.5 py-2.5 text-sm max-w-sm animate-[toastIn_.2s_ease-out] ${cls}`}
          >
            <Icon size={16} className={`${ic} shrink-0 mt-0.5`} />
            <span className="flex-1 leading-snug">{t.message}</span>
            <button onClick={() => dismissToast(t.id)} className="opacity-50 hover:opacity-100 shrink-0" aria-label="Tutup">
              <X size={14} />
            </button>
          </div>
        )
      })}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}
