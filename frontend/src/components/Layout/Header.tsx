import { useState, useRef, useEffect } from 'react'
import { Bell, ChevronDown, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

interface HeaderProps {
  title: string
}

const roleLabel: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  produksi: 'Produksi',
  staff: 'Staff',
  viewer: 'Viewer',
}

export default function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const initial = (user?.full_name?.trim()?.[0] ?? 'U').toUpperCase()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors relative">
          <Bell size={16} />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-accent-500 flex items-center justify-center">
              <span className="text-white text-xs font-semibold">{initial}</span>
            </div>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-50">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.full_name ?? 'Pengguna'}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                {user?.role && (
                  <span className="inline-block mt-1 text-[10px] font-medium uppercase tracking-wider text-brand-600 bg-brand-50 rounded px-1.5 py-0.5">
                    {roleLabel[user.role] ?? user.role}
                  </span>
                )}
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
