import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { AuthProvider } from '../store/authStore'
import { AuditLogSettingsTab } from '../components/settings/AuditLogSettingsTab'
import { AuditLogsPage } from '../pages/audit-logs/AuditLogsPage'

vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-user-1',
      email: 'admin@bunyan.sa',
      role: 'ORG_ADMIN',
      nameAr: 'مدير النظام',
      nameEn: 'System Admin',
    },
    isAuthenticated: true,
    isLoading: false,
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}))

describe('BUNYAN Audit Log Retention & Zero-Deletion UI Safeguards', () => {
  beforeEach(() => {
    const createMockStorage = () => {
      const store = new Map<string, string>()
      return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      }
    }

    if (typeof (globalThis as any).window === 'undefined') {
      ;(globalThis as any).window = {
        localStorage: createMockStorage(),
        sessionStorage: createMockStorage(),
        location: { pathname: '/settings', href: '' },
      }
    }
  })

  it('renders AuditLogSettingsTab with retention periods 30, 60, 90, 180, 365 days and ZATCA compliance notice', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuditLogSettingsTab isAr={true} isAdmin={true} />
      </QueryClientProvider>
    )

    // Verify retention card title
    expect(html).toContain('سياسة أرشفة وحذف سجلات التدقيق')
    // Verify statutory minimum 30 days
    expect(html).toContain('30 يوماً')
    // Verify 60, 90, 180, 365 days
    expect(html).toContain('60 يوماً')
    expect(html).toContain('90 يوماً')
    expect(html).toContain('180 يوماً')
    expect(html).toContain('365 يوماً')
    // Verify ZATCA notice
    expect(html).toContain('ZATCA')
    // Verify purge button
    expect(html).toContain('تنفيذ حذف السجلات القديمة')
  })

  it('renders English version of AuditLogSettingsTab with correct labels', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuditLogSettingsTab isAr={false} isAdmin={true} />
      </QueryClientProvider>
    )

    expect(html).toContain('Audit Log Retention &amp; Purge Management')
    expect(html).toContain('30 Days')
    expect(html).toContain('90 Days')
    expect(html).toContain('Execute Purge')
  })

  it('renders AuditLogsPage with filters, search, and export capabilities', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <AuditLogsPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(html).toContain('سجل التدقيق')
    expect(html).toContain('تصدير السجل')
  })

  it('renders AuditLogsPage with clear separation of Retention Cleanup and Clear Dev/Test Logs', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Mock stats data with 74 total, 65 test, 9 financial, in development mode
    queryClient.setQueryData(['auditLogsStats'], {
      totalRecords: 74,
      todayRecords: 5,
      protectedCount: 74,
      eligibleRetentionCount: 0,
      eligibleDevTestCount: 65,
      eligibleTestDebugCount: 65,
      financialRecords: 9,
      isDevelopment: true,
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <AuditLogsPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Button to open cleanup modal
    expect(html).toContain('إدارة الاحتفاظ بالسجلات')
  })
})
