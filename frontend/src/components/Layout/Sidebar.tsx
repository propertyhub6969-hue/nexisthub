import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
  Server,
  ChevronDown,
  X,
  ShieldCheck,
  Wallet,
  Receipt,
  TrendingUp,
  Inbox,
  type LucideIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../../context/AuthContext'
import { canAccessPath, canAccessFeature, effectiveRoles, hasAnyRole } from '../../utils/access'
import { kprService } from '../../services/kpr'
import NexistLogo from '../ui/NexistLogo'

interface NavChild {
  label: string
  to: string
  icon: LucideIcon
}

interface NavItem {
  label: string
  icon: LucideIcon
  to?: string
  children?: NavChild[]
}

const dashboardItem: NavItem = {
  label: 'Dashboard',
  icon: LayoutDashboard,
  to: '/dashboard',
}

const marketingItem: NavItem = {
  label: 'Marketing',
  icon: Users,
  children: [
    { label: 'Leads', to: '/marketing/leads', icon: Users },
    { label: 'Prospek', to: '/marketing/prospects', icon: UserCheck },
    { label: 'Pembeli', to: '/marketing/clients', icon: Handshake },
    { label: 'Pemberkasan', to: '/pemberkasan', icon: ClipboardCheck },
    { label: 'Kiriman Bank', to: '/marketing/bank-submissions', icon: Inbox },
  ],
}

const propertiItem: NavItem = {
  label: 'Properti',
  icon: Building2,
  children: [
    { label: 'Proyek & Unit', to: '/property/projects', icon: Building2 },
    { label: 'Dokumen Legalitas', to: '/property/legal-docs', icon: FileCheck },
  ],
}

const produksiItem: NavItem = {
  label: 'Produksi',
  icon: Factory,
  children: [
    { label: 'Konstruksi', to: '/construction', icon: HardHat },
    { label: 'Procurement', to: '/procurement', icon: ShoppingCart },
  ],
}

// Keuangan — hanya owner/admin/finance (persetujuan pembayaran, lihat require_role di backend)
const financeItem: NavItem = {
  label: 'Keuangan',
  icon: ShieldCheck,
  children: [
    { label: 'Persetujuan Pembayaran', to: '/payments/approval', icon: ShieldCheck },
    { label: 'Buku Kas', to: '/cashbook', icon: Wallet },
  ],
}

const reportItem: NavItem = {
  label: 'Report',
  icon: BarChart3,
  children: [
    { label: 'Marketing', to: '/reports/marketing', icon: TrendingUp },
    { label: 'Arus Kas', to: '/reports/keuangan', icon: Wallet },
    { label: 'Pajak', to: '/reports/pajak', icon: Receipt },
    { label: 'Pembangunan', to: '/reports/pembangunan', icon: HardHat },
  ],
}

const masterDataItem: NavItem = {
  label: 'Setting',
  icon: FileText,
  children: [
    { label: 'Master Data', to: '/legal', icon: FileText },
  ],
}

const settingsItem: NavItem = {
  label: 'Role',
  icon: Settings,
  children: [
    { label: 'Tim', to: '/settings/team', icon: UsersRound },
  ],
}

// Control Plane — hanya super-admin platform (vendor)
const platformItem: NavItem = {
  label: 'Platform',
  icon: Server,
  children: [
    { label: 'Pelanggan', to: '/platform/tenants', icon: Building2 },
  ],
}

// Urutan tampil: Dashboard, Marketing, Properti, Produksi, Keuangan, Report, Setting, Role, Platform.
const allGroups = [
  dashboardItem, marketingItem, propertiItem, produksiItem,
  financeItem, reportItem, masterDataItem, settingsItem, platformItem,
]

// Grup dianggap "aktif" bila halaman yang sedang dibuka ada di dalam children-nya (termasuk sub-rute).
function isGroupActive(item: (typeof allGroups)[number], pathname: string): boolean {
  if (!item.children) return false
  return item.children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))
}

export default function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { user } = useAuth()
  const location = useLocation()

  const canManageTeam = hasAnyRole(user, ['owner', 'admin'])
  const canApprovePayments = hasAnyRole(user, ['owner', 'admin', 'finance'])
  // Urutan tampil: Dashboard, Marketing, Properti, Produksi, Keuangan, Report, Setting, Role, Platform.
  const allItems = [
    dashboardItem, marketingItem, propertiItem, produksiItem,
    ...(canApprovePayments ? [financeItem] : []),
    reportItem, masterDataItem,
    ...(canManageTeam ? [settingsItem] : []),  // Role — selalu paling bawah (sebelum Platform)
    ...(user?.is_platform_admin ? [platformItem] : []),
  ]
  // gabungan gating: akses role + feature-flag paket tenant
  const allow = (to: string) => canAccessPath(effectiveRoles(user), to, user?.is_platform_admin) && canAccessFeature(user?.feature_flags, to)

  // badge jumlah kiriman bank menunggu persetujuan (silent — 403/gagal cukup diabaikan, badge tetap 0)
  const [bankPendingCount, setBankPendingCount] = useState(0)
  useEffect(() => {
    if (!user) return
    kprService.bankSubmissionsPendingCount().then(setBankPendingCount).catch(() => {})
  }, [user])
  // saring menu sesuai akses role (produksi = Dashboard/Konstruksi/Procurement; role lain penuh)
  const items = allItems.filter((it) =>
    it.to ? allow(it.to) : (it.children ?? []).some((c) => allow(c.to))
  )

  // Grup collapsible: default terbuka hanya grup berisi halaman aktif; sisanya tertutup.
  // Independen per grup (bukan accordion satu-buka), supaya bisa buka beberapa grup sekaligus saat kerja lintas modul.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const it of allGroups) {
      if ('children' in it) initial[it.label] = isGroupActive(it, location.pathname)
    }
    return initial
  })
  // pindah ke halaman di dalam grup yang tertutup (mis. via tautan di luar sidebar) → buka grup itu otomatis
  useEffect(() => {
    const active = allGroups.find((it) => isGroupActive(it, location.pathname))
    if (active) setOpenGroups((prev) => ({ ...prev, [active.label]: true }))
  }, [location.pathname])
  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }))
  }

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
        <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
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
              <button
                type="button"
                onClick={() => toggleGroup(item.label)}
                className="w-full flex items-center justify-between px-3 py-1.5 mt-3 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
                aria-expanded={!!openGroups[item.label]}
              >
                {item.label}
                <ChevronDown size={13} className={clsx('transition-transform', openGroups[item.label] ? 'rotate-180' : '')} />
              </button>
              {openGroups[item.label] && item.children.filter((child) => allow(child.to)).map((child) => (
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
                  {child.to === '/marketing/bank-submissions' && bankPendingCount > 0 && (
                    <span className="ml-auto text-[10px] font-semibold bg-brass-500 text-white rounded-full px-1.5 py-0.5 leading-none">{bankPendingCount}</span>
                  )}
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
                    ? 'bg-white/[0.07] text-white border-l-2 border-brass-500'
                    : 'text-slate-300 border-l-2 border-transparent hover:bg-white/5 hover:text-white'
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
