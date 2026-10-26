import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { AuditLogSettingsTab } from '../components/settings/AuditLogSettingsTab'

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

const mockStatsData = {
  totalRecords: 150,
  todayRecords: 12,
  protectedCount: 140,
  eligibleRetentionCount: 10,
  financialRecords: 80,
  isDevelopment: true,
}

const mockLogsData = {
  items: [
    {
      id: 'log-101',
      createdAt: '2026-10-25T02:30:00.000Z',
      action: 'ISSUE_INVOICE',
      entityType: 'INVOICE',
      entityId: 'INV-2026-001',
      description: 'Tax Invoice issued for Client Red Sea',
      ipAddress: '192.168.1.1',
      user: {
        id: 'u1',
        nameAr: 'أحمد الغامدي',
        nameEn: 'Ahmed Al-Ghamdi',
        email: 'ahmed@bunyan.sa',
        role: 'ORG_ADMIN',
      },
      metadata: { invoiceNumber: 'INV-2026-001', totalAmount: 45000 },
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
}

describe('Settings → Audit Logs & Archiving (AuditLogSettingsTab) Refactoring Tests', () => {
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

  it('renders Area A (Audit Overview) with 4 compact summary cards in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['auditLogsStats'], mockStatsData)
    queryClient.setQueryData(
      [
        'auditLogs',
        {
          search: '',
          selectedEntity: '',
          selectedAction: '',
          selectedCategory: '',
          dateFrom: '',
          dateTo: '',
          page: 1,
          limit: 20,
        },
      ],
      mockLogsData
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuditLogSettingsTab isAr={true} isAdmin={true} />
      </QueryClientProvider>
    )

    // Area A Cards:
    expect(html).toContain('إجمالي السجلات')
    expect(html).toContain('150')
    expect(html).toContain('سجلات آخر 24 ساعة')
    expect(html).toContain('12')
    expect(html).toContain('المؤهلة للتنظيف')
    expect(html).toContain('10')
    expect(html).toContain('السجلات المحمية نظامياً')
    expect(html).toContain('140')
    expect(html).toContain('ZATCA')
  })

  it('renders Area B (Audit Records Table) with essential columns and details action in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['auditLogsStats'], mockStatsData)
    queryClient.setQueryData(
      [
        'auditLogs',
        {
          search: '',
          selectedEntity: '',
          selectedAction: '',
          selectedCategory: '',
          dateFrom: '',
          dateTo: '',
          page: 1,
          limit: 20,
        },
      ],
      mockLogsData
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuditLogSettingsTab isAr={true} isAdmin={true} />
      </QueryClientProvider>
    )

    // Area B Table Columns
    expect(html).toContain('الوقت والتاريخ')
    expect(html).toContain('المستخدم')
    expect(html).toContain('الإجراء')
    expect(html).toContain('الوحدة / الكيان')
    expect(html).toContain('النتيجة')
    expect(html).toContain('بيان العملية')
    expect(html).toContain('التفاصيل')

    // Record data
    expect(html).toContain('أحمد الغامدي')
    expect(html).toContain('إصدار فاتورة')
    expect(html).toContain('فاتورة ضريبية')
    expect(html).toContain('ناجحة')
    expect(html).toContain('عرض')
  })

  it('renders Area C (Archiving & Retention Management) with retention policies and statutory notices', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['auditLogsStats'], mockStatsData)
    queryClient.setQueryData(['auditRetentionPolicy'], {
      auditRetentionDays: 90,
      autoCleanupAuditLogs: true,
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuditLogSettingsTab isAr={true} isAdmin={true} />
      </QueryClientProvider>
    )

    expect(html).toContain('سياسة أرشفة وحذف سجلات التدقيق')
    expect(html).toContain('30 يوماً (شهر واحد) - الحد الأدنى النظامي')
    expect(html).toContain('تنفيذ حذف السجلات القديمة')
    expect(html).toContain('إعدادات سياسة الاحتفاظ الافتراضية')
    expect(html).toContain('حفظ السياسة')
  })

  it('renders English version of all 3 areas properly', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['auditLogsStats'], mockStatsData)
    queryClient.setQueryData(
      [
        'auditLogs',
        {
          search: '',
          selectedEntity: '',
          selectedAction: '',
          selectedCategory: '',
          dateFrom: '',
          dateTo: '',
          page: 1,
          limit: 20,
        },
      ],
      mockLogsData
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuditLogSettingsTab isAr={false} isAdmin={true} />
      </QueryClientProvider>
    )

    // Area A
    expect(html).toContain('Total Records')
    expect(html).toContain('Last 24 Hours')
    expect(html).toContain('Eligible for Cleanup')
    expect(html).toContain('Protected Records')

    // Area B
    expect(html).toContain('System Audit Trail')
    expect(html).toContain('Timestamp')
    expect(html).toContain('User')
    expect(html).toContain('Action')
    expect(html).toContain('Module / Record')
    expect(html).toContain('Result')
    expect(html).toContain('Details')
    expect(html).toContain('View')

    // Area C
    expect(html).toContain('Audit Log Retention &amp; Purge Management')
    expect(html).toContain('Execute Purge')
    expect(html).toContain('Save Policy')
  })
})
