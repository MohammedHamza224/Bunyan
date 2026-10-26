import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useI18nDirection } from './hooks/useI18nDirection'
import { AuthProvider } from './store/authStore'
import { AuthGuard } from './components/auth/AuthGuard'
import { AppLayout } from './components/layout/AppLayout'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Eagerly loaded Auth & Core pages for instant initial paint
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'

// Lazy-loaded App Route pages for optimal code splitting
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage').then(m => ({ default: m.ClientsPage })))
const ClientDetailPage = lazy(() => import('./pages/clients/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })))
const SitesPage = lazy(() => import('./pages/sites/SitesPage').then(m => ({ default: m.SitesPage })))
const SiteDetailPage = lazy(() => import('./pages/sites/SiteDetailPage').then(m => ({ default: m.SiteDetailPage })))
const WorkItemsPage = lazy(() => import('./pages/work-items/WorkItemsPage').then(m => ({ default: m.WorkItemsPage })))
const WorkEntriesPage = lazy(() => import('./pages/work-entries/WorkEntriesPage').then(m => ({ default: m.WorkEntriesPage })))
const WorkEntryDetailPage = lazy(() => import('./pages/work-entries/WorkEntryDetailPage').then(m => ({ default: m.WorkEntryDetailPage })))
const StatementsPage = lazy(() => import('./pages/statements/StatementsPage').then(m => ({ default: m.StatementsPage })))
const StatementDetailPage = lazy(() => import('./pages/statements/StatementDetailPage').then(m => ({ default: m.StatementDetailPage })))
const InvoicesPage = lazy(() => import('./pages/invoices/InvoicesPage').then(m => ({ default: m.InvoicesPage })))
const InvoiceDetailPage = lazy(() => import('./pages/invoices/InvoiceDetailPage').then(m => ({ default: m.InvoiceDetailPage })))
const PaymentsPage = lazy(() => import('./pages/payments/PaymentsPage').then(m => ({ default: m.PaymentsPage })))
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })))
const AuditLogsPage = lazy(() => import('./pages/audit-logs/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })))

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-8">
      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  useI18nDirection()

  return (
    <AuthProvider>
      <ErrorBoundary>
        <Suspense fallback={<RouteLoadingFallback />}>
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
              <Route path="users" element={<Navigate to="/settings?tab=users" replace />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AuthProvider>
  )
}
