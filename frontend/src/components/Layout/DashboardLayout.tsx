import { Outlet, useLocation, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../../context/AuthContext'
import { canAccessPath } from '../../utils/access'

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
  '/reports': 'Reports',
}

export default function DashboardLayout() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  // role produksi: cegah buka menu di luar haknya (redirect ke dashboard)
  if (user && !canAccessPath(user.role, pathname)) return <Navigate to="/dashboard" replace />
  const title = pageTitles[pathname]
    ?? (pathname.includes('/siteplan') ? 'Siteplan Interaktif'
      : pathname.includes('/units') ? 'Kelola Unit'
      : pathname.includes('/payments') ? 'Pembayaran & Cicilan'
      : pathname.includes('/tax') ? 'Pajak & Notaris'
      : pathname.includes('/kpr') ? 'KPR'
      : 'NexistHub')

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
