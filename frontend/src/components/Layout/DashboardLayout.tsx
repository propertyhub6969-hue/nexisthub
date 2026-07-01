import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/marketing/leads': 'Leads',
  '/marketing/prospects': 'Prospek',
  '/marketing/clients': 'Pembeli',
  '/property/projects': 'Properti',
  '/sales': 'Penjualan',
  '/procurement': 'Procurement',
  '/legal': 'Legal',
  '/reports': 'Reports',
}

export default function DashboardLayout() {
  const { pathname } = useLocation()
  const title = pageTitles[pathname]
    ?? (pathname.includes('/units') ? 'Kelola Unit'
      : pathname.includes('/payments') ? 'Pembayaran & Cicilan'
      : 'NexistHub')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
