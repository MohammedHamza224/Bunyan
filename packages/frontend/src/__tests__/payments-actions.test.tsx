import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PaymentsPage } from '../pages/payments/PaymentsPage'
import { PaymentDetailModal } from '../components/payments/PaymentDetailModal'
import { PaymentRegistrationModal } from '../components/payments/PaymentRegistrationModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'ar' },
    t: (key: string) => key,
  }),
}))

vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      role: 'ORG_ADMIN',
      nameAr: 'مدير النظام',
      nameEn: 'System Admin',
    },
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}))

const mockPaymentsData = [
  {
    id: 'pay-001-recorded',
    referenceNo: 'TXN-BANK-1001',
    amount: '12500.00',
    paymentDate: '2026-10-24T00:00:00.000Z',
    method: 'BANK_TRANSFER',
    status: 'RECORDED',
    senderBankName: 'مصرف الراجحي',
    transferDate: '2026-10-24T00:00:00.000Z',
    notes: 'Partial payment for structural works',
    invoiceId: 'inv-101',
    invoice: {
      id: 'inv-101',
      referenceNo: 'INV-2026-001',
      totalAmount: '25000.00',
      paidAmount: '12500.00',
      remainingAmount: '12500.00',
      paymentStatus: 'PARTIALLY_PAID',
    },
    client: {
      id: 'client-1',
      nameAr: 'شركة اليمامة للمقاولات',
      nameEn: 'Al-Yamama Contracting Co.',
    },
    bankAccount: {
      id: 'acc-1',
      bankNameAr: 'البنك الأهلي السعودي (SNB)',
      bankNameEn: 'SNB Bank',
      accountName: 'حساب العمليات الرئيسي',
      iban: 'SA0310000001234567890123',
    },
  },
  {
    id: 'pay-002-approved',
    referenceNo: 'TXN-CASH-1002',
    amount: '5000.00',
    paymentDate: '2026-10-25T00:00:00.000Z',
    method: 'CASH',
    receiptNumber: 'RCP-88990',
    status: 'APPROVED',
    notes: 'Advance cash payment',
    invoiceId: 'inv-102',
    invoice: {
      id: 'inv-102',
      referenceNo: 'INV-2026-002',
      totalAmount: '5000.00',
      paidAmount: '5000.00',
      remainingAmount: '0.00',
      paymentStatus: 'PAID',
    },
    client: {
      id: 'client-2',
      nameAr: 'شركة الفنار للمقاولات العامة',
      nameEn: 'Al Fanar General Contracting',
    },
    approvedById: 'admin-1',
    approvedBy: {
      id: 'admin-1',
      nameAr: 'م. أحمد الشهري',
      nameEn: 'Eng. Ahmed Al-Shehri',
      email: 'ahmed@bunyan.sa',
    },
    approvedAt: '2026-10-25T08:00:00.000Z',
  },
  {
    id: 'pay-003-reversed',
    referenceNo: 'TXN-CARD-1003',
    amount: '3000.00',
    paymentDate: '2026-10-23T00:00:00.000Z',
    method: 'CARD',
    cardProvider: 'MADA',
    terminalId: 'POS-09912',
    status: 'REVERSED',
    invoiceId: 'inv-103',
    invoice: {
      id: 'inv-103',
      referenceNo: 'INV-2026-003',
      totalAmount: '3000.00',
      paidAmount: '0.00',
      remainingAmount: '3000.00',
      paymentStatus: 'UNPAID',
    },
    client: {
      id: 'client-3',
      nameAr: 'مؤسسة الرياض الحديثة',
      nameEn: 'Modern Riyadh Est.',
    },
  },
]

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/clients') {
        return Promise.resolve({
          data: {
            data: {
              items: [
                { id: 'client-1', nameAr: 'شركة اليمامة للمقاولات', nameEn: 'Al-Yamama Contracting Co.' },
                { id: 'client-2', nameAr: 'شركة الفنار للمقاولات العامة', nameEn: 'Al Fanar General Contracting' },
              ],
            },
          },
        })
      }
      if (url === '/payments') {
        return Promise.resolve({
          data: {
            data: {
              items: mockPaymentsData,
              total: 3,
              totalPages: 1,
              page: 1,
            },
          },
        })
      }
      if (url === '/organizations/bank-accounts') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 'acc-1',
                bankNameAr: 'البنك الأهلي السعودي (SNB)',
                bankNameEn: 'SNB Bank',
                accountName: 'حساب العمليات الرئيسي',
                iban: 'SA0310000001234567890123',
                isDefault: true,
              },
            ],
          },
        })
      }
      if (url === '/invoices') {
        return Promise.resolve({
          data: {
            data: {
              items: [
                {
                  id: 'inv-101',
                  referenceNo: 'INV-2026-001',
                  remainingAmount: '12500.00',
                  status: 'APPROVED',
                  client: { nameAr: 'شركة اليمامة للمقاولات' },
                },
              ],
            },
          },
        })
      }
      return Promise.resolve({ data: { data: {} } })
    }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    put: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

describe('Payments Page Actions & Lifecycle Tests', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })
  })

  describe('1. PaymentsPage Actions & Status Rendering', () => {
    it('renders all four actions (View, Edit, Approve, Delete) in the table actions column', () => {
      // Prime the react-query cache with mock payments
      queryClient.setQueryData(
        ['payments', { clientFilter: '', statusFilter: '', dateFrom: '', dateTo: '', page: 1 }],
        {
          items: mockPaymentsData,
          total: 3,
          totalPages: 1,
        }
      )
      queryClient.setQueryData(['clients-list-pay'], [
        { id: 'client-1', nameAr: 'شركة اليمامة للمقاولات' },
      ])

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PaymentsPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Check Status column header
      expect(html).toContain('الحالة')

      // 1. View button must exist for payments
      expect(html).toContain('data-testid="view-payment-pay-001-recorded"')
      expect(html).toContain('data-testid="view-payment-pay-002-approved"')

      // 2. Edit button must exist for unreversed payments
      expect(html).toContain('data-testid="edit-payment-pay-001-recorded"')
      expect(html).toContain('data-testid="edit-payment-pay-002-approved"')

      // 3. Approve button must exist for unapproved payment (pay-001-recorded)
      expect(html).toContain('data-testid="approve-payment-pay-001-recorded"')

      // Approved payment (pay-002-approved) must NOT show approve button, but rather verified shield badge
      expect(html).not.toContain('data-testid="approve-payment-pay-002-approved"')

      // 4. Delete button must exist for active payments
      expect(html).toContain('data-testid="delete-payment-pay-001-recorded"')
      expect(html).toContain('data-testid="delete-payment-pay-002-approved"')

      // Status badges
      expect(html).toContain('مسجل')
      expect(html).toContain('معتمد')
      expect(html).toContain('معكوس')
    })
  })

  describe('2. PaymentDetailModal (View Action)', () => {
    it('renders complete read-only transaction details, client, invoice, and audit info', () => {
      const recordedPay = mockPaymentsData[0]
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <PaymentDetailModal
            isOpen={true}
            onClose={() => {}}
            payment={recordedPay}
            isAr={true}
            onEdit={() => {}}
            onApprove={() => {}}
            onDelete={() => {}}
          />
        </MemoryRouter>
      )

      // Header & reference
      expect(html).toContain('تفاصيل سند الدفعة المالية')
      expect(html).toContain('TXN-BANK-1001')
      expect(html).toContain('مسجل (بانتظار الاعتماد)')

      // Amount & method
      expect(html).toContain('12,500.00')
      expect(html).toContain('تحويل بنكي')

      // Linked invoice & client
      expect(html).toContain('شركة اليمامة للمقاولات')
      expect(html).toContain('INV-2026-001')
      expect(html).toContain('25,000.00')

      // Bank transfer details
      expect(html).toContain('البنك الأهلي السعودي (SNB)')
      expect(html).toContain('مصرف الراجحي')
      expect(html).toContain('SA0310000001234567890123')

      // Contextual action buttons in modal
      expect(html).toContain('اعتماد الدفعة')
      expect(html).toContain('تعديل')
      expect(html).toContain('حذف / عكس')
    })

    it('renders approved status and approver information when payment is approved', () => {
      const approvedPay = mockPaymentsData[1]
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <PaymentDetailModal
            isOpen={true}
            onClose={() => {}}
            payment={approvedPay}
            isAr={true}
          />
        </MemoryRouter>
      )

      expect(html).toContain('معتمد')
      expect(html).toContain('م. أحمد الشهري')
      expect(html).toContain('RCP-88990')
    })
  })

  describe('3. PaymentRegistrationModal (Edit Action)', () => {
    it('adapts interface for edit mode with pre-populated values and edit labels', () => {
      const paymentToEdit = mockPaymentsData[0]
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <PaymentRegistrationModal
            isOpen={true}
            onClose={() => {}}
            isAr={true}
            paymentToEdit={paymentToEdit}
            mode="edit"
          />
        </QueryClientProvider>
      )

      // Edit Mode Title
      expect(html).toContain('تعديل بيانات الدفعة المالية')

      // Pre-populated value in amount field
      expect(html).toContain('value="12500.00"')

      // Pre-populated reference
      expect(html).toContain('value="TXN-BANK-1001"')

      // Submit button text in edit mode
      expect(html).toContain('حفظ التعديلات')
    })
  })
})
