import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PaymentRegistrationModal } from '../components/payments/PaymentRegistrationModal'

describe('PaymentRegistrationModal Layout & Field Architecture Tests', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const mockInvoice = {
    id: 'inv-layout-001',
    referenceNo: 'INV-2026-0042',
    currency: 'SAR',
    totalAmount: '15000.00',
    paidAmount: '5000.00',
    remainingAmount: '10000.00',
    status: 'APPROVED',
    paymentStatus: 'PARTIALLY_PAID',
    clientSnapshot: {
      nameAr: 'شركة المجد للإنشاءات',
      nameEn: 'Al Majd Construction Co.',
    },
    defaultBankAccount: {
      id: 'bank-acc-01',
      bankNameAr: 'مصرف الراجحي',
      bankNameEn: 'Al Rajhi Bank',
      accountNumber: '1234567890',
      iban: 'SA4480000000000000000000',
      isDefault: true,
      isActive: true,
    },
  }

  describe('1. Modal Layout Architecture & Height Constraints', () => {
    it('implements fixed header, scrollable body, and fixed footer with max viewport height constraints', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <PaymentRegistrationModal
            isOpen={true}
            onClose={() => {}}
            isAr={true}
            invoiceId={mockInvoice.id}
            preloadedInvoice={mockInvoice}
          />
        </QueryClientProvider>
      )

      // Container constraints
      expect(html).toContain('max-h-[90vh]')
      expect(html).toContain('max-w-2xl')
      expect(html).toContain('flex flex-col')

      // Header is fixed (shrink-0)
      expect(html).toContain('border-b border-gray-100 bg-white shrink-0')

      // Body is scrollable (overflow-y-auto flex-1)
      expect(html).toContain('flex-1 overflow-y-auto')

      // Footer is fixed (shrink-0)
      expect(html).toContain('border-t border-gray-100 bg-gray-50/80 flex items-center justify-end gap-2.5 shrink-0')
    })
  })

  describe('2. Bank Transfer Layout (Two Clear Sections & Responsive 2-Column Grid)', () => {
    it('renders Section 1 (Payment Info) and Section 2 (Bank Transfer Details) in Arabic', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <PaymentRegistrationModal
            isOpen={true}
            onClose={() => {}}
            isAr={true}
            invoiceId={mockInvoice.id}
            preloadedInvoice={mockInvoice}
          />
        </QueryClientProvider>
      )

      // Section 1: Payment Information
      expect(html).toContain('القسم الأول — بيانات السداد الأساسية')
      expect(html).toContain('مبلغ السداد (ر.س) *')
      expect(html).toContain('تاريخ السداد الفعلي *')
      expect(html).toContain('طريقة السداد المعتمدة *')

      // Section 2: Bank Transfer Details
      expect(html).toContain('القسم الثاني — تفاصيل التحويل البنكي')
      expect(html).toContain('الحساب البنكي للشركة المستلم للدفعة *')
      expect(html).toContain('بنك العميل المحوّل منه')
      expect(html).toContain('رقم الحوالة / المرجع البنكي *')
      expect(html).toContain('تاريخ الحوالة الفعلي')
      expect(html).toContain('ملاحظات إضافية على التحويل البنكي')

      // Grid classes: 2 columns on desktop
      expect(html).toContain('grid grid-cols-1 md:grid-cols-2 gap-3.5')
      expect(html).toContain('data-testid="receiving-bank-select"')
      expect(html).toContain('data-testid="sender-bank-select"')
      expect(html).toContain('data-testid="transfer-reference-input"')
      expect(html).toContain('data-testid="transfer-date-input"')
    })

    it('renders Section 1 and Section 2 in English when isAr is false', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <PaymentRegistrationModal
            isOpen={true}
            onClose={() => {}}
            isAr={false}
            invoiceId={mockInvoice.id}
            preloadedInvoice={mockInvoice}
          />
        </QueryClientProvider>
      )

      // Section 1 in English
      expect(html).toContain('Section 1 — Payment Information')
      expect(html).toContain('Payment Amount (SAR) *')
      expect(html).toContain('Payment Date *')
      expect(html).toContain('Payment Method *')

      // Section 2 in English
      expect(html).toContain('Section 2 — Bank Transfer Details')
      expect(html).toContain('Company Receiving Bank Account *')
      expect(html).toContain('Customer Sending Bank')
      expect(html).toContain('Transfer Reference / Confirmation No *')
      expect(html).toContain('Additional Transfer Notes')
    })

    it('shows bank account empty warning and link to settings when no company bank accounts exist', () => {
      const invoiceWithoutBank = {
        ...mockInvoice,
        defaultBankAccount: undefined,
      }

      const emptyQueryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      // Preset query data for bank accounts to empty array
      emptyQueryClient.setQueryData(['bankAccounts'], [])

      const html = renderToStaticMarkup(
        <QueryClientProvider client={emptyQueryClient}>
          <PaymentRegistrationModal
            isOpen={true}
            onClose={() => {}}
            isAr={true}
            invoiceId={invoiceWithoutBank.id}
            preloadedInvoice={invoiceWithoutBank}
          />
        </QueryClientProvider>
      )

      expect(html).toContain('لم يتم تكوين أي حساب بنكي للشركة بعد.')
      expect(html).toContain('إضافة حساب في الإعدادات')
      expect(html).toContain('لا توجد حسابات بنكية مضافة')
    })
  })

  describe('3. Strict Preservation of Other Payment Methods', () => {
    it('preserves Cash method buttons, badges, and prefilled balance', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <PaymentRegistrationModal
            isOpen={true}
            onClose={() => {}}
            isAr={true}
            invoiceId={mockInvoice.id}
            preloadedInvoice={mockInvoice}
          />
        </QueryClientProvider>
      )

      // The modal buttons provide one-click selection for all 5 methods
      expect(html).toContain('نقدًا')
      expect(html).toContain('بطاقة / مدى')
      expect(html).toContain('شيك')
      expect(html).toContain('أخرى')
      expect(html).toContain('تحويل بنكي')

      // Remaining amount is accurately prefilled
      expect(html).toContain('10000')
    })
  })
})
