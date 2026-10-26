import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { StatementsPage } from '../pages/statements/StatementsPage'
import { StatementDetailPage } from '../pages/statements/StatementDetailPage'
import { InvoicesPage } from '../pages/invoices/InvoicesPage'
import { InvoiceDetailPage } from '../pages/invoices/InvoiceDetailPage'
import { api } from '../lib/api'

vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-user-1',
      email: 'admin@bunyan.sa',
      role: 'ORG_ADMIN',
      nameAr: 'مدير النظام',
      nameEn: 'System Admin',
    },
    hasPermission: () => true,
    isAuthenticated: true,
    isLoading: false,
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('Cancelled Statements and Invoices Deletion Feature', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar')
    vi.clearAllMocks()
  })

  function createTestQueryClient() {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })
  }

  describe('StatementsPage Table Actions', () => {
    it('renders delete action button for CANCELLED statements with correct title', () => {
      const queryClient = createTestQueryClient()
      const mockStatements = [
        {
          id: 'stmt-cancelled-1',
          referenceNo: 'STM-2026-0001',
          status: 'CANCELLED',
          title: 'مستخلص أعمال ملغي',
          totalAmount: 15000,
          issueDate: '2026-10-20',
          client: { id: 'c1', nameAr: 'شركة المقاولات الأولى' },
          lines: [],
        },
        {
          id: 'stmt-draft-1',
          referenceNo: 'STM-2026-0002',
          status: 'DRAFT',
          title: 'مسودة مستخلص',
          totalAmount: 5000,
          issueDate: '2026-10-21',
          client: { id: 'c1', nameAr: 'شركة المقاولات الأولى' },
          lines: [],
        },
        {
          id: 'stmt-approved-1',
          referenceNo: 'STM-2026-0003',
          status: 'APPROVED',
          title: 'مستخلص معتمد',
          totalAmount: 25000,
          issueDate: '2026-10-22',
          client: { id: 'c1', nameAr: 'شركة المقاولات الأولى' },
          lines: [],
        },
      ]

      queryClient.setQueryData(
        ['statements', { search: '', clientFilter: '', statusFilter: '', page: 1 }],
        {
          items: mockStatements,
          total: 3,
          page: 1,
          limit: 15,
          totalPages: 1,
        }
      )
      queryClient.setQueryData(['clients-list-stmt'], [])
      queryClient.setQueryData(['orgSettings'], { defaultCurrency: 'SAR', vatRate: 15 })

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <StatementsPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // 1. Cancelled statement should have delete button with title "حذف المستخلص الملغي"
      expect(html).toContain('title="حذف المستخلص الملغي"')
      // 2. Draft statement should have delete button with title "حذف مسودة المستخلص"
      expect(html).toContain('title="حذف مسودة المستخلص"')
      // 3. Statements references are present
      expect(html).toContain('STM-2026-0001')
      expect(html).toContain('STM-2026-0002')
      expect(html).toContain('STM-2026-0003')
    })
  })

  describe('StatementDetailPage Header Actions', () => {
    it('renders delete action button for CANCELLED statement', () => {
      const queryClient = createTestQueryClient()
      const mockStatement = {
        id: 'stmt-cancelled-1',
        referenceNo: 'STM-2026-0001',
        status: 'CANCELLED',
        title: 'مستخلص أعمال ملغي',
        subtotal: 10000,
        discountAmount: 0,
        taxableAmount: 10000,
        vatRate: 15,
        vatAmount: 1500,
        totalAmount: 11500,
        issueDate: '2026-10-20',
        client: { id: 'c1', nameAr: 'شركة المقاولات الأولى', vatNumber: '300000000000003' },
        lines: [],
        sites: [],
        invoices: [],
      }

      queryClient.setQueryData(['statement', 'stmt-cancelled-1'], mockStatement)

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/statements/stmt-cancelled-1']}>
            <Routes>
              <Route path="/statements/:id" element={<StatementDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Cancelled statement detail page should render "حذف المستخلص الملغي"
      expect(html).toContain('حذف المستخلص الملغي')
      // Should NOT render approve or cancel button
      expect(html).not.toContain('اعتماد المستخلص')
      expect(html).not.toContain('إصدار فاتورة ضريبية من المستخلص')
    })

    it('does NOT render delete button for APPROVED statement (must be cancelled first)', () => {
      const queryClient = createTestQueryClient()
      const mockStatement = {
        id: 'stmt-approved-1',
        referenceNo: 'STM-2026-0003',
        status: 'APPROVED',
        title: 'مستخلص معتمد',
        subtotal: 20000,
        discountAmount: 0,
        taxableAmount: 20000,
        vatRate: 15,
        vatAmount: 3000,
        totalAmount: 23000,
        issueDate: '2026-10-22',
        client: { id: 'c1', nameAr: 'شركة المقاولات الأولى' },
        lines: [],
        sites: [],
        invoices: [],
      }

      queryClient.setQueryData(['statement', 'stmt-approved-1'], mockStatement)

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/statements/stmt-approved-1']}>
            <Routes>
              <Route path="/statements/:id" element={<StatementDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Should NOT contain any delete button
      expect(html).not.toContain('حذف المستخلص الملغي')
      expect(html).not.toContain('حذف المسودة نهائياً')
      // Should have invoice generation and cancel buttons
      expect(html).toContain('إصدار فاتورة ضريبية من المستخلص')
      expect(html).toContain('إلغاء')
    })
  })

  describe('InvoicesPage Table Actions', () => {
    it('renders delete action button for CANCELLED invoices with correct title', () => {
      const queryClient = createTestQueryClient()
      const mockInvoices = [
        {
          id: 'inv-cancelled-1',
          referenceNo: 'INV-2026-0001',
          status: 'CANCELLED',
          invoiceType: 'TAX_INVOICE',
          totalAmount: 11500,
          paidAmount: 0,
          remainingAmount: 0,
          issueDate: '2026-10-20',
          client: { id: 'c1', nameAr: 'شركة المقاولات الأولى' },
          lines: [],
        },
        {
          id: 'inv-draft-1',
          referenceNo: 'INV-2026-0002',
          status: 'DRAFT',
          invoiceType: 'TAX_INVOICE',
          totalAmount: 5750,
          paidAmount: 0,
          remainingAmount: 5750,
          issueDate: '2026-10-21',
          client: { id: 'c1', nameAr: 'شركة المقاولات الأولى' },
          lines: [],
        },
        {
          id: 'inv-approved-1',
          referenceNo: 'INV-2026-0003',
          status: 'APPROVED',
          invoiceType: 'TAX_INVOICE',
          totalAmount: 23000,
          paidAmount: 0,
          remainingAmount: 23000,
          issueDate: '2026-10-22',
          client: { id: 'c1', nameAr: 'شركة المقاولات الأولى' },
          lines: [],
        },
      ]

      queryClient.setQueryData(
        [
          'invoices',
          {
            search: '',
            clientFilter: '',
            statusFilter: '',
            paymentStatusFilter: '',
            page: 1,
          },
        ],
        {
          items: mockInvoices,
          total: 3,
          page: 1,
          limit: 15,
          totalPages: 1,
        }
      )
      queryClient.setQueryData(['clients-list-inv'], [])
      queryClient.setQueryData(['orgSettings'], { defaultCurrency: 'SAR', vatRate: 15 })

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <InvoicesPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Cancelled invoice should have delete button with title "حذف الفاتورة الملغاة"
      expect(html).toContain('title="حذف الفاتورة الملغاة"')
      // Draft invoice should have delete button with title "حذف مسودة الفاتورة"
      expect(html).toContain('title="حذف مسودة الفاتورة"')
      // Approved invoice should have the Lock icon
      expect(html).toContain('INV-2026-0001')
      expect(html).toContain('INV-2026-0002')
      expect(html).toContain('INV-2026-0003')
    })
  })

  describe('InvoiceDetailPage Header Actions', () => {
    it('renders delete action button for CANCELLED invoice', () => {
      const queryClient = createTestQueryClient()
      const mockInvoice = {
        id: 'inv-cancelled-1',
        referenceNo: 'INV-2026-0001',
        status: 'CANCELLED',
        invoiceType: 'TAX_INVOICE',
        subtotal: 10000,
        discountAmount: 0,
        taxableAmount: 10000,
        vatRate: 15,
        vatAmount: 1500,
        totalAmount: 11500,
        paidAmount: 0,
        remainingAmount: 0,
        issueDate: '2026-10-20',
        client: { id: 'c1', nameAr: 'شركة المقاولات الأولى', vatNumber: '300000000000003' },
        lines: [],
        relatedNotes: [],
      }

      queryClient.setQueryData(['invoice', 'inv-cancelled-1'], mockInvoice)

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/invoices/inv-cancelled-1']}>
            <Routes>
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Cancelled invoice detail page should render "حذف الفاتورة الملغاة"
      expect(html).toContain('حذف الفاتورة الملغاة')
      // Should NOT render approve or cancel button
      expect(html).not.toContain('اعتماد وإصدار الفاتورة')
      expect(html).not.toContain('تسجيل دفعة')
    })

    it('does NOT render delete button for APPROVED invoice (must be cancelled first)', () => {
      const queryClient = createTestQueryClient()
      const mockInvoice = {
        id: 'inv-approved-1',
        referenceNo: 'INV-2026-0003',
        status: 'APPROVED',
        invoiceType: 'TAX_INVOICE',
        subtotal: 20000,
        discountAmount: 0,
        taxableAmount: 20000,
        vatRate: 15,
        vatAmount: 3000,
        totalAmount: 23000,
        paidAmount: 0,
        remainingAmount: 23000,
        issueDate: '2026-10-22',
        client: { id: 'c1', nameAr: 'شركة المقاولات الأولى' },
        lines: [],
        relatedNotes: [],
      }

      queryClient.setQueryData(['invoice', 'inv-approved-1'], mockInvoice)

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/invoices/inv-approved-1']}>
            <Routes>
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Should NOT contain any delete button
      expect(html).not.toContain('حذف الفاتورة الملغاة')
      expect(html).not.toContain('حذف المسودة نهائياً')
      // Should have payment, credit note, and cancel buttons
      expect(html).toContain('إصدار إشعار دائن / مدين')
      expect(html).toContain('تسجيل دفعة')
      expect(html).toContain('إلغاء الفاتورة')
    })
  })
})
