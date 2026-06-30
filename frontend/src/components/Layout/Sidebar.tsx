import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Handshake,
  ShoppingCart,
  FileText,
  BarChart3,
  LogOut,
  Building2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../../context/AuthContext'

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
      { label: 'Prospects', to: '/marketing/prospects', icon: UserCheck },
      { label: 'Clients', to: '/marketing/clients', icon: Handshake },
    ],
  },
  {
    label: 'Procurement',
    icon: ShoppingCart,
    to: '/procurement',
  },
  {
    label: 'Legal',
    icon: FileText,
    to: '/legal',
  },
  {
    label: 'Reports',
    icon: BarChart3,
    to: '/reports',
  },
]

export default function Sidebar() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <Building2 size={16} className="text-white" />
          </div>
          <span className="text-white font-semibold text-base tracking-tight">
            NexistHub
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) =>
          item.children ? (
            <div key={item.label}>
              <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-3 mb-1">
                {item.label}
              </p>
              {item.children.map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-500 text-white'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
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
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-slate-700">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  )
}
