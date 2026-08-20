import { useState, useEffect } from 'react'
import { Outlet, useLocation, Navigate, Link } from 'react-router-dom'
import { AlertTriangle, Eye, LogOut } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import WhatsNewModal from '../WhatsNewModal'
import { useAuth } from '../../context/AuthContext'
import { billingService } from '../../services/billing'
import { canAccessPath, canAccessFeature, defaultPathFor, effectiveRoles } from '../../utils/access'

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
  '/marketing/bank-submissions': 'Kiriman Bank',
  '/marketing/notary-submissions': 'Kiriman Notaris',
  '/settings/team': 'Tim & Peran',
  '/settings/profile': 'Profil Perusahaan',
  '/settings/langganan': 'Langganan',
  '/settings/teks-dokumen': 'Teks Dokumen',
  '/reports/marketing': 'Report Marketing',
  '/reports/keuangan': 'Report Keuangan',
  '/reports/pajak': 'Report Pajak',
  '/reports/pembangunan': 'Report Pembangunan',
  '/payments/approval': 'Persetujuan Pembayaran',
  '/cashbook': 'Buku Kas',
  '/platform/tenants': 'Control Plane — Pelanggan',
}

export default function DashboardLayout() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const impersonating = localStorage.getItem('impersonating')
  function returnToAdmin() {
    const a = localStorage.getItem('impersonator_access'); const r = localStorage.getItem('impersonator_refresh')
    if (a) localStorage.setItem('access_token', a)
    if (r) localStorage.setItem('refresh_token', r)
    localStorage.removeItem('impersonator_access'); localStorage.removeItem('impersonator_refresh'); localStorage.removeItem('impersonating')
    window.location.href = '/platform/tenants'
  }
  // tutup drawer sidebar tiap pindah halaman (mobile/tablet)
  useEffect(() => { setSidebarOpen(false) }, [pathname])
  // peringatan langganan (global) — super-admin dilewati
  useEffect(() => {
    if (user && !user.is_platform_admin) billingService.subscription().then((s) => setDaysLeft(s.days_left ?? null)).catch(() => {})
  }, [user])
  // cegah role terbatas (produksi/marketing) buka menu di luar haknya → redirect ke halaman default gabungan role-nya
  const roles = effectiveRoles(user)
  if (user && !canAccessPath(roles, pathname, user.is_platform_admin)) return <Navigate to={defaultPathFor(roles, user.is_platform_admin)} replace />
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
        {impersonating && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm bg-indigo-600 text-white">
            <span className="inline-flex items-center gap-2"><Eye size={15} /> Anda masuk sebagai <b>{impersonating}</b> (mode bantu)</span>
            <button onClick={returnToAdmin} className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-md px-3 py-1 font-medium transition">
              <LogOut size={13} /> Kembali ke Admin
            </button>
          </div>
        )}
        {daysLeft != null && daysLeft <= 7 && !impersonating && (
          <Link to="/settings/langganan" className={`flex items-center gap-2 px-4 py-2 text-sm ${daysLeft < 0 ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
            <AlertTriangle size={15} />
            {daysLeft < 0 ? 'Masa langganan telah berakhir.' : `Masa langganan berakhir dalam ${daysLeft} hari.`} Klik untuk detail & perpanjangan.
          </Link>
        )}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      <WhatsNewModal />
    </div>
  )
}
