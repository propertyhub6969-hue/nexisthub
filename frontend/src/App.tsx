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
import Notaries from './pages/legal/Notaries'
import Pemberkasan from './pages/legal/Pemberkasan'
import Projects from './pages/property/Projects'
import ProjectUnits from './pages/property/ProjectUnits'
import Siteplan from './pages/property/Siteplan'
import LegalDocuments from './pages/property/LegalDocuments'
import Procurement from './pages/procurement/Procurement'
import Construction from './pages/construction/Construction'
import Team from './pages/settings/Team'
import Reports from './pages/Reports'

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
          <Route path="/property/projects"                 element={<Projects />} />
          <Route path="/property/legal-docs"               element={<LegalDocuments />} />
          <Route path="/property/projects/:projectId/units" element={<ProjectUnits />} />
          <Route path="/property/projects/:projectId/siteplan" element={<Siteplan />} />
          <Route path="/construction"        element={<Construction />} />
          <Route path="/procurement"         element={<Procurement />} />
          <Route path="/legal"               element={<Notaries />} />
          <Route path="/pemberkasan"         element={<Pemberkasan />} />
          <Route path="/settings/team"       element={<Team />} />
          <Route path="/reports"             element={<Reports />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
