import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Handshake,
  Building2,
  FileCheck,
  HardHat,
  ShoppingCart,
  FileText,
  ClipboardCheck,
  BarChart3,
  Settings,
  UsersRound,
  Factory,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../../context/AuthContext'
import { canAccessPath } from '../../utils/access'
import NexistLogo from '../ui/NexistLogo'

const navItems = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    to: '/dashboard',
  },
  {
    label: 'Marketing',
    icon: Users,
    children: [
      { label: 'Leads', to: '/marketing/leads', icon: Users },
      { label: 'Prospek', to: '/marketing/prospects', icon: UserCheck },
      { label: 'Pembeli', to: '/marketing/clients', icon: Handshake },
      { label: 'Pemberkasan', to: '/pemberkasan', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Properti',
    icon: Building2,
    children: [
      { label: 'Proyek & Unit', to: '/property/projects', icon: Building2 },
      { label: 'Dokumen Legalitas', to: '/property/legal-docs', icon: FileCheck },
    ],
  },
  {
    label: 'Produksi',
    icon: Factory,
    children: [
      { label: 'Konstruksi', to: '/construction', icon: HardHat },
      { label: 'Procurement', to: '/procurement', icon: ShoppingCart },
    ],
  },
  {
    label: 'Setting',
    icon: FileText,
    children: [
      { label: 'Master Data', to: '/legal', icon: FileText },
    ],
  },
  {
    label: 'Report',
    icon: BarChart3,
    children: [
      { label: 'Report', to: '/reports', icon: BarChart3 },
    ],
  },
]

const settingsItem = {
  label: 'Pengaturan',
  icon: Settings,
  children: [
    { label: 'Tim', to: '/settings/team', icon: UsersRound },
  ],
}

export default function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { user } = useAuth()

  const canManageTeam = user?.role === 'owner' || user?.role === 'admin'
  const allItems = canManageTeam ? [...navItems, settingsItem] : navItems
  // saring menu sesuai akses role (produksi = Dashboard/Konstruksi/Procurement; role lain penuh)
  const items = allItems.filter((it) =>
    'to' in it
      ? canAccessPath(user?.role, it.to)
      : it.children.some((c) => canAccessPath(user?.role, c.to))
  )

  return (
    <>
      {/* Backdrop (mobile/tablet) */}
      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onClose} />}

      <aside
        className={clsx(
          'w-60 h-screen shrink-0 bg-sidebar flex flex-col z-50 transition-transform duration-200',
          'fixed inset-y-0 left-0 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-blue-900 flex items-center justify-between">
          <NexistLogo size={32} showText={true} textColor="white" />
          <button onClick={onClose} className="lg:hidden text-slate-300 hover:text-white" aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map((item) =>
          item.children ? (
            <div key={item.label}>
              <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-3 mb-1">
                {item.label}
              </p>
              {item.children.filter((child) => canAccessPath(user?.role, child.to)).map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-500 text-white'
                        : 'text-slate-300 hover:bg-blue-900 hover:text-white'
                    )
                  }
                >
                  <child.icon size={16} />
                  {child.label}
                </NavLink>
              ))}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to!}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-slate-300 hover:bg-blue-900 hover:text-white'
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          )
        )}
      </nav>
      </aside>
    </>
  )
}
