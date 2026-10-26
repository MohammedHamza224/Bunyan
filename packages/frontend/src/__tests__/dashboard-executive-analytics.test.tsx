import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { AuthProvider } from '../store/authStore'
import { DashboardPage } from '../pages/dashboard/DashboardPage'

const mockDashboardData = {
  kpis: {
    totalInvoiced: 150000,
    totalCollected: 90000,
    outstandingBalance: 60000,
    activeSites: 4,
    pendingStatements: 2,
    overdueInvoicesCount: 1,
  },
  monthlyFinancialPerformance: [
    { month: '2026-05', monthLabel: 'مايو 2026', invoiced: 50000, collections: 30000, outstanding: 20000 },
    { month: '2026-06', monthLabel: 'يونيو 2026', invoiced: 100000, collections: 60000, outstanding: 40000 },
  ],
  paymentStatusDistribution: [
    { status: 'PAID', count: 5, totalAmount: 90000 },
    { status: 'PARTIALLY_PAID', count: 2, totalAmount: 40000 },
    { status: 'UNPAID', count: 1, totalAmount: 20000 },
  ],
  projectInsights: [
    {
      siteId: 'site-1',
      siteName: 'مشروع برج الرياض',
      clientName: 'شركة الإعمار',
      status: 'ACTIVE',
      activeWorkEntriesCount: 5,
      unbilledWorkTotal: 35000,
    },
  ],
}

describe('BUNYAN Executive Dashboard & Business Analytics Tests', () => {
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
        location: { pathname: '/dashboard', href: '' },
      }
    }
  })

  it('renders DashboardPage without any audit log or recent activity noise', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(['dashboard', 'all', '', '', ''], mockDashboardData)
    queryClient.setQueryData(['orgSettings'], { defaultCurrency: 'SAR' })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <DashboardPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Verify executive header
    expect(html).toContain('مركز التحكم المالي والتشغيلي للمشاريع')
    expect(html).toContain('لوحة التحكم')

    // Verify recent audit log activity is completely REMOVED from the dashboard
    expect(html).not.toContain('النشاط الأخير')
    expect(html).not.toContain('Audit log retention purge')
    expect(html).not.toContain('deleted 0 records')
  })

  it('renders Executive Financial Performance and Status charts containers in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(['dashboard', 'all', '', '', ''], mockDashboardData)
    queryClient.setQueryData(['orgSettings'], { defaultCurrency: 'SAR' })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <DashboardPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Verify Financial Performance section
    expect(html).toContain('الأداء المالي الشهري')
    expect(html).toContain('حالة سداد الفواتير')
  })

  it('renders English version of executive dashboard with proper business analytics labels', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(['dashboard', 'all', '', '', ''], mockDashboardData)
    queryClient.setQueryData(['orgSettings'], { defaultCurrency: 'SAR' })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <DashboardPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(html).toContain('Construction Operations &amp; Financial Control Center')
    expect(html).toContain('Dashboard')
    expect(html).toContain('Monthly Financial Performance')
    expect(html).toContain('Invoice Payment Status')
    expect(html).not.toContain('Recent Activity')
  })
})
