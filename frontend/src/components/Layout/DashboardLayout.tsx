import { useState, useEffect } from 'react'
import { Outlet, useLocation, Navigate, Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../../context/AuthContext'
import { billingService } from '../../services/billing'
import { canAccessPath, canAccessFeature, defaultPathFor } from '../../utils/access'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/marketing/leads': 'Leads',
  '/marketing/prospects': 'Prospek',
  '/marketing/clients': 'Pembeli',
  '/property/projects': 'Properti',
  '/property/legal-docs': 'Dokumen Legalitas',
  '/construction': 'Konstruksi',
  '/sales': 'Penjualan',
  '/procurement': 'Procurement',
  '/legal': 'Master Data',
  '/pemberkasan': 'Pemberkasan',
  '/settings/team': 'Tim & Peran',
  '/settings/profile': 'Profil Perusahaan',
  '/settings/langganan': 'Langganan',
  '/reports': 'Reports',
  '/payments/approval': 'Persetujuan Pembayaran',
  '/platform/tenants': 'Control Plane — Pelanggan',
}

export default function DashboardLayout() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  // tutup drawer sidebar tiap pindah halaman (mobile/tablet)
  useEffect(() => { setSidebarOpen(false) }, [pathname])
  // peringatan langganan (global) — super-admin dilewati
  useEffect(() => {
    if (user && !user.is_platform_admin) billingService.subscription().then((s) => setDaysLeft(s.days_left ?? null)).catch(() => {})
  }, [user])
  // cegah role terbatas (produksi/marketing) buka menu di luar haknya → redirect ke halaman default role-nya
  if (user && !canAccessPath(user.role, pathname, user.is_platform_admin)) return <Navigate to={defaultPathFor(user.role, user.is_platform_admin)} replace />
  // modul dimatikan paket langganan → tendang ke dashboard
  if (user && !canAccessFeature(user.feature_flags, pathname)) return <Navigate to="/dashboard" replace />
  const title = pageTitles[pathname]
    ?? (pathname.includes('/siteplan') ? 'Siteplan Interaktif'
      : pathname.includes('/units') ? 'Kelola Unit'
      : pathname.includes('/payments') ? 'Pembayaran & Cicilan'
      : pathname.includes('/tax') ? 'Pajak & Notaris'
      : pathname.includes('/kpr') ? 'KPR'
      : 'NexistHub')

  return (
    <div className="flex h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        {daysLeft != null && daysLeft <= 7 && (
          <Link to="/settings/langganan" className={`flex items-center gap-2 px-4 py-2 text-sm ${daysLeft < 0 ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
            <AlertTriangle size={15} />
            {daysLeft < 0 ? 'Masa langganan telah berakhir.' : `Masa langganan berakhir dalam ${daysLeft} hari.`} Klik untuk detail & perpanjangan.
          </Link>
        )}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
