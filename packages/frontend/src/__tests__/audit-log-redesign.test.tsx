import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
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

const mockAuditStats = {
  totalRecords: 120,
  eligibleRetentionCount: 15,
  eligibleTestDebugCount: 5,
  protectedCount: 100,
  todayRecords: 8,
  categoryBreakdown: {
    FINANCIAL: 60,
    BUSINESS: 30,
    SECURITY: 20,
    TECHNICAL_DIAGNOSTIC: 10,
  },
}

const mockAuditLogs = {
  items: [
    {
      id: 'log-1',
      createdAt: '2026-10-24T12:00:00.000Z',
      action: 'ISSUE_INVOICE',
      entityType: 'Invoice',
      entityId: 'INV-001',
      description: 'Invoice issued for Client A',
      ipAddress: '192.168.1.10',
      user: { id: 'u1', nameAr: 'محمد علي', nameEn: 'Mohammed Ali', email: 'admin@bunyan.sa' },
      metadata: { invoiceNumber: 'INV-001', total: 50000 },
    },
  ],
  total: 1,
  page: 1,
  totalPages: 1,
}

describe('BUNYAN Audit Log Redesign & Executive Management UI Tests', () => {
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
        location: { pathname: '/audit-logs', href: '' },
      }
    }
  })

  it('renders AuditLogsPage with Executive Summary Cards and Category Tabs in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(['auditLogsStats'], mockAuditStats)
    queryClient.setQueryData(
      [
        'auditLogs',
        {
          category: 'ALL',
          action: '',
          entityType: '',
          actorUserId: '',
          dateFrom: '',
          dateTo: '',
          search: '',
          eligibility: '',
          page: 1,
          limit: 20,
        },
      ],
      mockAuditLogs
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuditLogsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Header & Actions
    expect(html).toContain('سجل التدقيق')
    expect(html).toContain('متابعة العمليات والتغييرات المهمة داخل النظام.')
    expect(html).toContain('تصدير السجل')
    expect(html).toContain('تفريغ سجل التدقيق')
    expect(html).toContain('إدارة الاحتفاظ بالسجلات')

    // 3 Summary Cards Only
    expect(html).toContain('إجمالي السجلات')
    expect(html).toContain('عمليات اليوم')
    expect(html).toContain('سجلات محمية')

    // Filters
    expect(html).toContain('جميع التصنيفات')
    expect(html).toContain('جميع العمليات')
    expect(html).toContain('فلاتر متقدمة')
  })

  it('renders AuditLogsPage with Category Tabs and Executive Cards in English', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(['auditLogsStats'], mockAuditStats)
    queryClient.setQueryData(
      [
        'auditLogs',
        {
          category: 'ALL',
          action: '',
          entityType: '',
          actorUserId: '',
          dateFrom: '',
          dateTo: '',
          search: '',
          eligibility: '',
          page: 1,
          limit: 20,
        },
      ],
      mockAuditLogs
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuditLogsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Header & Actions
    expect(html).toContain('Audit Log')
    expect(html).toContain('Monitor key operations and changes across the system.')
    expect(html).toContain('Export Log')
    expect(html).toContain('Clear Audit Log')
    expect(html).toContain('Manage Log Retention')

    // 3 Summary Cards Only
    expect(html).toContain('Total Audit Records')
    expect(html).toContain('Audit Events Recorded Today')
    expect(html).toContain('Protected Records')

    // Filters
    expect(html).toContain('All Categories')
    expect(html).toContain('All Actions')
    expect(html).toContain('Advanced Filters')
  })

  it('handles audit entries for deleted business records gracefully with fallback indicators and no broken links', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })

    const deletedRecordLogs = {
      items: [
        {
          id: 'log-deleted-client',
          createdAt: '2026-10-24T12:00:00.000Z',
          action: 'DELETE',
          entityType: 'Client',
          entityId: 'client-999',
          description: 'Deleted client Al-Amal',
          ipAddress: '192.168.1.10',
          user: { id: 'u1', nameAr: 'مدير النظام', email: 'admin@bunyan.sa' },
          metadata: { clientName: 'شركة الأمل للمقاولات', isDeleted: true },
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    }

    queryClient.setQueryData(['auditLogsStats'], mockAuditStats)
    queryClient.setQueryData(
      [
        'auditLogs',
        {
          category: 'ALL',
          action: '',
          entityType: '',
          actorUserId: '',
          dateFrom: '',
          dateTo: '',
          search: '',
          eligibility: '',
          page: 1,
          limit: 20,
        },
      ],
      deletedRecordLogs
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuditLogsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Displays business reference
    expect(html).toContain('شركة الأمل للمقاولات')
    // Displays deleted record badge
    expect(html).toContain('سجل محذوف')
    // Does NOT render broken navigation link to /clients/client-999
    expect(html).not.toContain('href="/clients/client-999"')
  })
})
