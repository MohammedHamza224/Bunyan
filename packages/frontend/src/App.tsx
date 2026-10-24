import { Routes, Route, Navigate } from 'react-router-dom'
import { useI18nDirection } from './hooks/useI18nDirection'
import { AuthProvider } from './store/authStore'
import { AuthGuard } from './components/auth/AuthGuard'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { ClientsPage } from './pages/clients/ClientsPage'
import { ClientDetailPage } from './pages/clients/ClientDetailPage'
import { SitesPage } from './pages/sites/SitesPage'
import { SiteDetailPage } from './pages/sites/SiteDetailPage'
import { WorkItemsPage } from './pages/work-items/WorkItemsPage'
import { WorkEntriesPage } from './pages/work-entries/WorkEntriesPage'
import { WorkEntryDetailPage } from './pages/work-entries/WorkEntryDetailPage'
import { StatementsPage } from './pages/statements/StatementsPage'
import { StatementDetailPage } from './pages/statements/StatementDetailPage'
import { InvoicesPage } from './pages/invoices/InvoicesPage'
import { InvoiceDetailPage } from './pages/invoices/InvoiceDetailPage'
import { PaymentsPage } from './pages/payments/PaymentsPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { AuditLogsPage } from './pages/audit-logs/AuditLogsPage'

export default function App() {
  useI18nDirection()

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientDetailPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="sites/:id" element={<SiteDetailPage />} />
          <Route path="work-items" element={<WorkItemsPage />} />
          <Route path="work-entries" element={<WorkEntriesPage />} />
          <Route path="work-entries/:id" element={<WorkEntryDetailPage />} />
          <Route path="statements" element={<StatementsPage />} />
          <Route path="statements/:id" element={<StatementDetailPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
