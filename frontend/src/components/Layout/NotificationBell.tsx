import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Loader2, Wallet, CheckCircle2, XCircle, Inbox, Info, Receipt } from 'lucide-react'
import { notificationService } from '../../services/notification'
import type { AppNotification, NotificationKind } from '../../types'

const ICON: Record<NotificationKind, { icon: typeof Bell; cls: string }> = {
  payment_submitted: { icon: Wallet, cls: 'text-brass-500' },
  payment_approved: { icon: CheckCircle2, cls: 'text-emerald-600' },
  payment_rejected: { icon: XCircle, cls: 'text-red-600' },
  bank_submission: { icon: Inbox, cls: 'text-blue-600' },
  notary_submission: { icon: Inbox, cls: 'text-indigo-600' },
  expense_submitted: { icon: Receipt, cls: 'text-amber-600' },
  expense_paid: { icon: Wallet, cls: 'text-emerald-600' },
  info: { icon: Info, cls: 'text-slate-400' },
}

/** Waktu relatif singkat: "baru saja", "5 mnt", "3 jam", "2 hr", lalu tanggal. */
function ago(iso: string): string {
  const d = new Date(iso).getTime()
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} mnt`
  if (s < 86400) return `${Math.floor(s / 3600)} jam`
  if (s < 604800) return `${Math.floor(s / 86400)} hr`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refreshCount = useCallback(() => {
    notificationService.unreadCount().then(setUnread).catch(() => {})
  }, [])

  // Hitung belum-dibaca: saat muat & tiap 60 detik (cukup utk ERP, tanpa WebSocket).
  useEffect(() => {
    refreshCount()
    const t = setInterval(refreshCount, 60000)
    return () => clearInterval(t)
  }, [refreshCount])

  // Tutup saat klik di luar
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      try { setItems(await notificationService.list()) } catch { /* diam */ } finally { setLoading(false) }
    }
  }

  async function openItem(n: AppNotification) {
    setOpen(false)
    if (!n.is_read) {
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      setUnread((c) => Math.max(0, c - 1))
      notificationService.markRead(n.id).catch(() => {})
    }
    if (n.link) navigate(n.link)
  }

  async function readAll() {
    setItems((p) => p.map((x) => ({ ...x, is_read: true })))
    setUnread(0)
    notificationService.markAllRead().catch(() => {})
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        title={unread > 0 ? `${unread} notifikasi belum dibaca` : 'Notifikasi'}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors relative"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Notifikasi</p>
            {unread > 0 && (
              <button onClick={readAll} className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1">
                <CheckCheck size={13} /> Tandai semua dibaca
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <Bell size={26} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">Belum ada notifikasi</p>
                <p className="text-xs text-slate-400 mt-1">Aktivitas tim akan muncul di sini.</p>
              </div>
            ) : (
              items.map((n) => {
                const { icon: Icon, cls } = ICON[n.kind] ?? ICON.info
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${n.is_read ? '' : 'bg-brand-50/40'}`}
                  >
                    <Icon size={16} className={`${cls} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.is_read ? 'text-slate-600' : 'text-slate-900 font-medium'}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {n.actor_name ? `${n.actor_name} · ` : ''}{ago(n.created_at)}
                      </p>
                    </div>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
