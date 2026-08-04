// Toko toast sederhana (pub/sub) — SENGAJA di luar React supaya bisa dipanggil dari
// mana saja, termasuk interceptor axios (services/api.ts) yang hidup di luar pohon komponen.

export type ToastKind = 'success' | 'error' | 'info'
export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
let listeners: Listener[] = []
let seq = 0

function emit() {
  listeners.forEach((l) => l(toasts))
}

export function subscribe(l: Listener): () => void {
  listeners.push(l)
  l(toasts)
  return () => { listeners = listeners.filter((x) => x !== l) }
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function showToast(message: string, kind: ToastKind = 'success', ms = 3000) {
  // Redam duplikat beruntun (mis. beberapa request sekaligus) — cukup satu yang tampil.
  if (toasts.some((t) => t.message === message && t.kind === kind)) return
  const id = ++seq
  toasts = [...toasts, { id, kind, message }]
  emit()
  setTimeout(() => dismissToast(id), ms)
}

export const toastSuccess = (m: string) => showToast(m, 'success')
export const toastError = (m: string) => showToast(m, 'error', 4500)
export const toastInfo = (m: string) => showToast(m, 'info')
