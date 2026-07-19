import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { authService } from './services/auth'

import DashboardLayout from './components/Layout/DashboardLayout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import Leads from './pages/marketing/Leads'
import Prospects from './pages/marketing/Prospects'
import Clients from './pages/marketing/Clients'
import ClientPayments from './pages/marketing/ClientPayments'
import ClientTax from './pages/marketing/ClientTax'
import ClientKpr from './pages/marketing/ClientKpr'
import BankSubmissions from './pages/marketing/BankSubmissions'
import NotarySubmissions from './pages/marketing/NotarySubmissions'
import Notaries from './pages/legal/Notaries'
import Pemberkasan from './pages/legal/Pemberkasan'
import Projects from './pages/property/Projects'
import ProjectUnits from './pages/property/ProjectUnits'
import Siteplan from './pages/property/Siteplan'
import LegalDocuments from './pages/property/LegalDocuments'
import LegalSplitting from './pages/property/LegalSplitting'
import Procurement from './pages/procurement/Procurement'
import Construction from './pages/construction/Construction'
import Team from './pages/settings/Team'
import Profile from './pages/settings/Profile'
import Subscription from './pages/settings/Subscription'
import Reports from './pages/Reports'
import PaymentApproval from './pages/finance/PaymentApproval'
import CashBook from './pages/finance/CashBook'
import Platform from './pages/platform/Platform'
import PublicMonthlyTax from './pages/public/PublicMonthlyTax'
import PublicBankFiling from './pages/public/PublicBankFiling'
import PublicNotaryFiling from './pages/public/PublicNotaryFiling'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return authService.isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  return !authService.isAuthenticated() ? <>{children}</> : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/public/pajak/:token" element={<PublicMonthlyTax />} />
        <Route path="/public/bank/:token" element={<PublicBankFiling />} />
        <Route path="/public/notary/:token" element={<PublicNotaryFiling />} />

        {/* Protected */}
        <Route
          element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }
        >
          <Route path="/dashboard"           element={<Dashboard />} />
          <Route path="/marketing/leads"     element={<Leads />} />
          <Route path="/marketing/prospects" element={<Prospects />} />
          <Route path="/marketing/clients"   element={<Clients />} />
          <Route path="/marketing/clients/:clientId/payments" element={<ClientPayments />} />
          <Route path="/marketing/clients/:clientId/tax" element={<ClientTax />} />
          <Route path="/marketing/clients/:clientId/kpr" element={<ClientKpr />} />
          <Route path="/marketing/bank-submissions" element={<BankSubmissions />} />
          <Route path="/marketing/notary-submissions" element={<NotarySubmissions />} />
          <Route path="/property/projects"                 element={<Projects />} />
          <Route path="/property/legal-docs"               element={<LegalDocuments />} />
          <Route path="/property/projects/:projectId/units" element={<ProjectUnits />} />
          <Route path="/property/projects/:projectId/siteplan" element={<Siteplan />} />
          <Route path="/property/projects/:projectId/legal-splitting" element={<LegalSplitting />} />
          <Route path="/construction"        element={<Construction />} />
          <Route path="/procurement"         element={<Procurement />} />
          <Route path="/legal"               element={<Notaries />} />
          <Route path="/pemberkasan"         element={<Pemberkasan />} />
          <Route path="/settings/team"       element={<Team />} />
          <Route path="/settings/profile"    element={<Profile />} />
          <Route path="/settings/langganan"  element={<Subscription />} />
          <Route path="/reports"             element={<Navigate to="/reports/marketing" replace />} />
          <Route path="/reports/:category"   element={<Reports />} />
          <Route path="/payments/approval"   element={<PaymentApproval />} />
          <Route path="/cashbook"            element={<CashBook />} />
          <Route path="/platform/tenants"    element={<Platform />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
