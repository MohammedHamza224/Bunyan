import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import {
  formatCurrency,
  formatDate,
  formatShortDate,
  formatNumber,
  formatCount,
  formatPercent,
  resolveNumberLocale,
} from '../lib/utils'
import { DashboardPage } from '../pages/dashboard/DashboardPage'

// Regex for Eastern Arabic numerals: ٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩
const EASTERN_ARABIC_DIGITS_REGEX = /[\u0660-\u0669]/

// Mock auth store
vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      nameAr: 'المهندس أحمد الفهد',
      nameEn: 'Eng. Ahmed Al-Fahad',
      email: 'ahmed@bunyan.sa',
      role: 'ORG_ADMIN',
    },
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}))

const mockDashboardStats = {
  currency: 'SAR',
  grossInvoiceValue: 623300,
  netInvoiceValue: 623300,
  totalCollected: 383100,
  totalOutstanding: 240200,
  overdueAmount: 45000,
  overdueInvoicesCount: 2,
  approvedUnbilledValue: 125000,
  totalStatementsValue: 580000,
  totalStatements: 8,
  totalInvoices: 14,
  pendingApprovalCount: 5,
  clientCount: 4,
  activeSiteCount: 7,
  unpaidInvoicesCount: 3,
  partiallyPaidInvoicesCount: 2,
  taxableSubtotal: 542000,
  vatAmount: 81300,
  creditNotesTotal: 0,
  debitNotesTotal: 0,
  monthlyFinancialPerformance: [
    {
      month: '2026-08',
      labelAr: 'أغسطس 2026',
      labelEn: 'Aug 2026',
      invoicedAmount: 180000,
      collectedAmount: 120000,
      outstandingAmount: 60000,
    },
    {
      month: '2026-09',
      labelAr: 'سبتمبر 2026',
      labelEn: 'Sep 2026',
      invoicedAmount: 220000,
      collectedAmount: 150000,
      outstandingAmount: 70000,
    },
    {
      month: '2026-10',
      labelAr: 'أكتوبر 2026',
      labelEn: 'Oct 2026',
      invoicedAmount: 223300,
      collectedAmount: 113100,
      outstandingAmount: 110200,
    },
  ],
  paymentStatusDistribution: [
    { key: 'PAID', labelAr: 'مدفوعة بالكامل', labelEn: 'Fully Paid', count: 9, amount: 383100, color: '#10B981' },
    { key: 'PARTIALLY_PAID', labelAr: 'مدفوعة جزئياً', labelEn: 'Partially Paid', count: 2, amount: 85000, color: '#F59E0B' },
    { key: 'UNPAID', labelAr: 'غير مسددة', labelEn: 'Unpaid', count: 3, amount: 155200, color: '#EF4444' },
  ],
  projectInsights: {
    activeProjects: 6,
    totalProjects: 8,
    projectsList: [
      {
        id: 'site-1',
        nameAr: 'مشروع برج الأندلس السكني',
        nameEn: 'Alandalus Tower',
        clientNameAr: 'شركة المطور العقاري المتقدم',
        clientNameEn: 'Advanced Real Estate',
        status: 'ACTIVE',
        unbilledAmount: 45000,
        unbilledWorkCount: 3,
      },
    ],
  },
  pendingApprovalEntries: [
    {
      id: 'entry-1',
      referenceNo: 'WE-2026-0042',
      itemNameAr: 'صب خرسانة مسلحة للأعمدة',
      client: { nameAr: 'شركة الأفق' },
      site: { nameAr: 'موقع العليا' },
      totalAmount: 28500,
      workDate: '2026-10-24T00:00:00.000Z',
    },
  ],
  unbilledWorkEntries: [
    {
      id: 'entry-2',
      referenceNo: 'WE-2026-0038',
      itemNameAr: 'توريد حديد تسليح عالي المقاومة',
      client: { nameAr: 'مؤسسة الرياض' },
      site: { nameAr: 'موقع حطين' },
      unbilledAmount: 32000,
      unbilledQuantity: 15,
      unit: 'طن',
    },
  ],
  recentInvoices: [
    {
      id: 'inv-1',
      referenceNo: 'INV-2026-0012',
      client: { nameAr: 'شركة المطور العقاري' },
      status: 'APPROVED',
      paymentStatus: 'PARTIALLY_PAID',
      totalAmount: 115000,
      remainingAmount: 45000,
    },
  ],
  recentPayments: [
    {
      id: 'pay-1',
      client: { nameAr: 'شركة المطور العقاري' },
      invoice: { referenceNo: 'INV-2026-0012' },
      method: 'BANK_TRANSFER',
      amount: 70000,
      paymentDate: '2026-10-25T00:00:00.000Z',
    },
  ],
  recentStatements: [
    {
      id: 'stm-1',
      referenceNo: 'STM-2026-0005',
      client: { nameAr: 'شركة الأفق' },
      status: 'APPROVED',
      totalAmount: 85000,
      issueDate: '2026-10-22T00:00:00.000Z',
    },
  ],
  recentWorkEntries: [
    {
      id: 'entry-3',
      referenceNo: 'WE-2026-0040',
      itemNameAr: 'أعمال عزل مائي وحراري للأسطح',
      client: { nameAr: 'شركة الأفق' },
      site: { nameAr: 'موقع العليا' },
      status: 'APPROVED',
      totalAmount: 19500,
      workDate: '2026-10-23T00:00:00.000Z',
    },
  ],
}

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/dashboard')) {
        return Promise.resolve({ data: { data: mockDashboardStats } })
      }
      if (url.includes('/organizations/settings')) {
        return Promise.resolve({
          data: {
            businessName: 'شركة بنيان للمقاولات العامة',
            businessNameEn: 'Bunyan General Contracting Co.',
            defaultCurrency: 'SAR',
          },
        })
      }
      return Promise.resolve({ data: {} })
    }),
  },
}))

describe('Bunyan Dashboard — Western Arabic Numerals (0–9) Audit & Verification', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    })
    queryClient.setQueryData(['dashboard', 'all', '', '', ''], mockDashboardStats)
    queryClient.setQueryData(['orgSettings'], {
      businessName: 'شركة بنيان للمقاولات العامة',
      businessNameEn: 'Bunyan General Contracting Co.',
      defaultCurrency: 'SAR',
    })
  })

  describe('1. Centralized Formatting Utility Verification', () => {
    it('resolveNumberLocale ensures Arabic mode resolves to ar-SA-u-nu-latn', () => {
      expect(resolveNumberLocale('ar')).toBe('ar-SA-u-nu-latn')
      expect(resolveNumberLocale('ar-SA')).toBe('ar-SA-u-nu-latn')
      expect(resolveNumberLocale('en')).toBe('en-US')
      expect(resolveNumberLocale('en-US')).toBe('en-US')
    })

    it('formatCurrency renders Western digits in Arabic mode with Arabic currency label', () => {
      const formattedAr = formatCurrency(125500.5, 'ar', 'SAR')
      // Must contain Western digits 125,500.50
      expect(formattedAr).toContain('125,500.50')
      // Must NOT contain Eastern Arabic digits (١٢٥٬٥٠٠)
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(formattedAr)).toBe(false)
      // Must contain Arabic currency abbreviation
      expect(formattedAr).toContain('ر.س')
    })

    it('formatCurrency preserves other currencies with Western digits', () => {
      const formattedUsd = formatCurrency(5000, 'ar', 'USD')
      expect(formattedUsd).toContain('5,000.00')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(formattedUsd)).toBe(false)

      const formattedEur = formatCurrency(7200, 'ar', 'EUR')
      expect(formattedEur).toContain('7,200.00')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(formattedEur)).toBe(false)
    })

    it('formatCurrency formats negative numbers correctly with Western digits', () => {
      const formattedNeg = formatCurrency(-2400.75, 'ar', 'SAR')
      expect(formattedNeg).toContain('2,400.75')
      expect(formattedNeg).toContain('-')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(formattedNeg)).toBe(false)
    })

    it('formatDate renders Western digits in Arabic mode while keeping Arabic month names', () => {
      const formattedDate = formatDate('2026-10-25T12:00:00Z', 'ar')
      // Must contain Western digits 25 and 2026
      expect(formattedDate).toContain('25')
      expect(formattedDate).toContain('2026')
      expect(formattedDate).toContain('أكتوبر')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(formattedDate)).toBe(false)
    })

    it('formatShortDate renders Western digits in Arabic mode', () => {
      const formattedShort = formatShortDate('2026-10-25T12:00:00Z', 'ar')
      expect(formattedShort).toContain('25')
      expect(formattedShort).toContain('10')
      expect(formattedShort).toContain('2026')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(formattedShort)).toBe(false)
    })

    it('formatCount formats integers with thousands grouping and Western digits in Arabic', () => {
      const count1 = formatCount(25, 'ar')
      expect(count1).toBe('25')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(count1)).toBe(false)

      const count2 = formatCount(1250, 'ar')
      expect(count2).toBe('1,250')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(count2)).toBe(false)
    })

    it('formatPercent renders Western digits with %', () => {
      const percent1 = formatPercent(15, 0)
      expect(percent1).toBe('15%')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(percent1)).toBe(false)

      const percent2 = formatPercent(98.5, 1)
      expect(percent2).toBe('98.5%')
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(percent2)).toBe(false)
    })
  })

  describe('2. Dashboard Rendering in Arabic Mode', () => {
    beforeEach(async () => {
      await i18n.changeLanguage('ar')
    })

    it('renders all Dashboard financial cards and counts with Western digits and Arabic labels', async () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Arabic labels must be present
      expect(html).toContain('إجمالي قيمة الفواتير المصدرة')
      expect(html).toContain('صافي قيمة الفواتير بعد الإشعارات')
      expect(html).toContain('إجمالي المدفوعات المحصلة الفعلية')
      expect(html).toContain('إجمالي الذمم المدينة المستحقة')
      expect(html).toContain('الفواتير المتأخرة عن الاستحقاق')
      expect(html).toContain('أعمال معتمدة غير مفوترة')
      expect(html).toContain('المستخلصات المعتمدة')
      expect(html).toContain('أعمال بانتظار الاعتماد')

      // Formatted monetary values must use Western digits
      expect(html).toContain('623,300.00')
      expect(html).toContain('383,100.00')
      expect(html).toContain('240,200.00')
      expect(html).toContain('45,000.00')
      expect(html).toContain('125,000.00')
      expect(html).toContain('580,000.00')

      // Tax subtext with Western digits
      expect(html).toContain('542,000.00')
      expect(html).toContain('81,300.00')
      expect(html).toContain('15%')

      // Integer counts must use Western digits
      expect(html).toContain('14 فاتورة معتمدة')
      expect(html).toContain('8 مستخلص معتمد/مفوتر')
      expect(html).toContain('2 فاتورة متأخرة')
      expect(html).toContain('غير مسددة: 3')
      expect(html).toContain('مسددة جزئياً: 2')
      expect(html).toContain('العملاء النشطون: 4')
      expect(html).toContain('المواقع النشطة: 7')

      // Absolutely zero Eastern Arabic numerals (٠-٩) in the rendered markup
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(html)).toBe(false)
    })

    it('renders recent operational lists with Western dates and amounts', async () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Reference numbers in Western digits
      expect(html).toContain('WE-2026-0042')
      expect(html).toContain('INV-2026-0012')
      expect(html).toContain('STM-2026-0005')

      // Dates rendered with Western numerals and Arabic month names
      expect(html).toContain('2026')
      expect(html).toContain('أكتوبر')

      // Unbilled quantity with Western digits
      expect(html).toContain('المتبقي: 15.00')
      expect(html).toContain('طن')

      // No Eastern Arabic digits in operational lists
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(html)).toBe(false)
    })

    it('renders project insights and execution performance with Western digits', async () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Active / Total projects
      expect(html).toContain('>6<')
      expect(html).toContain('>8<')
      expect(html).toContain('النشطة:')
      expect(html).toContain('الإجمالي:')

      // Project table items count with Western digits
      expect(html).toContain('(3 بند)')
      expect(html).toContain('45,000.00')
    })
  })

  describe('3. Dashboard Rendering in English Mode', () => {
    beforeEach(async () => {
      await i18n.changeLanguage('en')
    })

    it('renders all Dashboard elements in English with Western digits', async () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // English labels
      expect(html).toContain('Gross Issued Invoices Value')
      expect(html).toContain('Total Actual Collections')
      expect(html).toContain('Total Outstanding Receivables')

      // Currency formatting in English
      expect(html).toContain('SAR')
      expect(html).toContain('623,300.00')
      expect(html).toContain('383,100.00')
      expect(html).toContain('240,200.00')

      // English counts
      expect(html).toContain('14 approved invoices')
      expect(html).toContain('8 approved statements')
      expect(html).toContain('Active: ')
      expect(html).toContain('Total: ')

      // No Eastern Arabic digits
      expect(EASTERN_ARABIC_DIGITS_REGEX.test(html)).toBe(false)
    })
  })
})
