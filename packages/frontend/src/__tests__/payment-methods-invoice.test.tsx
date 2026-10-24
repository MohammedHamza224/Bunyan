import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfessionalTaxInvoice } from '../components/invoices/ProfessionalTaxInvoice'
import { PaymentRegistrationModal } from '../components/payments/PaymentRegistrationModal'
import { BankAccountSettingsTab } from '../components/settings/BankAccountSettingsTab'

describe('Payment Methods, Receiving Bank Accounts & Invoice Integration', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const baseInvoice = {
    id: 'inv-test-pay-01',
    referenceNo: 'INV-2026-0099',
    invoiceType: 'TAX_INVOICE',
    issueDate: '2026-10-24T00:00:00.000Z',
    currency: 'SAR',
    subtotal: '10000.00',
    taxableAmount: '10000.00',
    vatRate: '15',
    vatAmount: '1500.00',
    totalAmount: '11500.00',
    paidAmount: '0.00',
    remainingAmount: '11500.00',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    orgSnapshot: {
      businessName: 'شركة بنيان للمقاولات العامة',
      businessNameEn: 'BUNYAN GENERAL CONTRACTING CO.',
      commercialReg: '1010998877',
      vatNumber: '300998877600003',
      defaultCurrency: 'SAR',
    },
    clientSnapshot: {
      nameAr: 'شركة التطوير العقاري',
      nameEn: 'Real Estate Development Co.',
      vatNumber: '310998877600003',
    },
    defaultBankAccount: {
      id: 'bank-acc-test-1',
      bankNameAr: 'مصرف الراجحي',
      bankNameEn: 'Al Rajhi Bank',
      beneficiaryNameAr: 'شركة بنيان للمقاولات العامة',
      beneficiaryNameEn: 'BUNYAN GENERAL CONTRACTING CO.',
      iban: 'SA4480000000000000000000',
      accountNumber: '800000000000000',
      swiftCode: 'RJHISARI',
      branch: 'الفرع الرئيسي - الرياض',
      isDefault: true,
      isActive: true,
    },
    lines: [
      {
        id: 'line-1',
        itemNameAr: 'أعمال هيكل إنشائي',
        unit: 'م³',
        quantity: '50',
        unitPrice: '200.00',
        lineSubtotal: '10000.00',
        vatRate: '15',
        vatAmount: '1500.00',
        lineTotal: '11500.00',
      },
    ],
    payments: [],
  }

  describe('1. Dynamic Bank Payment Instructions in ProfessionalTaxInvoice', () => {
    it('renders dynamic receiving bank account details from defaultBankAccount instead of hardcoded values', () => {
      const html = renderToStaticMarkup(<ProfessionalTaxInvoice invoice={baseInvoice} />)

      // Dynamic bank name
      expect(html).toContain('مصرف الراجحي')
      expect(html).toContain('Al Rajhi Bank')

      // Formatted IBAN with 4-char spacing
      expect(html).toContain('SA44 8000 0000 0000 0000 0000')

      // Beneficiary Name
      expect(html).toContain('شركة بنيان للمقاولات العامة')
      expect(html).toContain('BUNYAN GENERAL CONTRACTING CO.')

      // Swift and Branch
      expect(html).toContain('RJHISARI')
      expect(html).toContain('الفرع الرئيسي - الرياض')

      // Payment Instructions headers
      expect(html).toContain('Bank Payment Instructions')
      expect(html).toContain('البيانات والتعليمات البنكية للسداد')
    })

    it('renders a green settlement banner and suppresses bank instruction prompts when fully paid', () => {
      const fullyPaidInvoice = {
        ...baseInvoice,
        paidAmount: '11500.00',
        remainingAmount: '0.00',
        paymentStatus: 'PAID',
        payments: [
          {
            id: 'pay-1',
            paymentDate: '2026-10-24T10:00:00.000Z',
            method: 'BANK_TRANSFER',
            referenceNo: 'TRX-123456789',
            amount: '11500.00',
            bankAccount: baseInvoice.defaultBankAccount,
          },
        ],
      }

      const html = renderToStaticMarkup(<ProfessionalTaxInvoice invoice={fullyPaidInvoice} />)

      // Fully Paid bilingual settlement banner
      expect(html).toContain('Invoice Fully Paid &amp; Settled')
      expect(html).toContain('تم سداد كامل قيمة الفاتورة • شكراً لتعاملكم')
      expect(html).toContain('SETTLED • مسددة بالكامل')

      // Still displays company bank reference in the settlement card
      expect(html).toContain('مصرف الراجحي')
      expect(html).toContain('SA44 8000 0000 0000 0000 0000')
    })
  })

  describe('2. Payment History & Recorded Transactions in ProfessionalTaxInvoice', () => {
    it('renders complete bilingual payment history table with multiple methods (Transfer, Cash, Card, Cheque)', () => {
      const multiMethodInvoice = {
        ...baseInvoice,
        paidAmount: '11500.00',
        remainingAmount: '0.00',
        payments: [
          {
            id: 'pay-transfer',
            paymentDate: '2026-10-20T00:00:00.000Z',
            method: 'BANK_TRANSFER',
            referenceNo: 'WIRE-8899',
            amount: '5000.00',
            senderBankName: 'البنك الأهلي السعودي',
            bankAccount: baseInvoice.defaultBankAccount,
          },
          {
            id: 'pay-cash',
            paymentDate: '2026-10-21T00:00:00.000Z',
            method: 'CASH',
            receiptNumber: 'VOUCHER-0045',
            amount: '2000.00',
          },
          {
            id: 'pay-card',
            paymentDate: '2026-10-22T00:00:00.000Z',
            method: 'CARD',
            referenceNo: 'AUTH-990011',
            cardProvider: 'MADA',
            terminalId: 'POS-TERM-88',
            amount: '2500.00',
          },
          {
            id: 'pay-cheque',
            paymentDate: '2026-10-23T00:00:00.000Z',
            method: 'CHEQUE',
            chequeNumber: 'CHQ-554433',
            senderBankName: 'بنك الرياض',
            amount: '2000.00',
          },
        ],
      }

      const html = renderToStaticMarkup(<ProfessionalTaxInvoice invoice={multiMethodInvoice} />)

      // Section header
      expect(html).toContain('Payment History &amp; Recorded Transactions')
      expect(html).toContain('سجل سداد الفاتورة والعمليات المالية المقيدة')
      expect(html).toContain('4 Transactions / دفعات مسجلة')

      // Method Badges
      expect(html).toContain('Bank Transfer')
      expect(html).toContain('تحويل بنكي')
      expect(html).toContain('Cash')
      expect(html).toContain('نقداً')
      expect(html).toContain('Card / Mada')
      expect(html).toContain('بطاقة مدى / ائتمان')
      expect(html).toContain('Cheque')
      expect(html).toContain('شيك مصرفي')

      // Method-Specific Details
      expect(html).toContain('WIRE-8899')
      expect(html).toContain('VOUCHER-0045')
      expect(html).toContain('AUTH-990011')
      expect(html).toContain('MADA')
      expect(html).toContain('POS-TERM-88')
      expect(html).toContain('CHQ-554433')
      expect(html).toContain('بنك الرياض')

      // Amounts and Totals Footer
      expect(html).toContain('5000.00 SAR')
      expect(html).toContain('2000.00 SAR')
      expect(html).toContain('2500.00 SAR')
      expect(html).toContain('Total Settled to Date')
      expect(html).toContain('إجمالي المسدد حتى تاريخه:')
      expect(html).toContain('11500.00 SAR')
    })
  })

  describe('3. Payment Registration Modal Component', () => {
    it('renders modal with multi-method choices when open', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <PaymentRegistrationModal
            isOpen={true}
            onClose={() => {}}
            isAr={true}
            invoiceId={baseInvoice.id}
            preloadedInvoice={baseInvoice}
          />
        </QueryClientProvider>
      )

      expect(html).toContain('تسجيل دفعة وتحصيل فاتورة')
      expect(html).toContain('تحويل بنكي')
      expect(html).toContain('نقدًا')
      expect(html).toContain('بطاقة / مدى')
      expect(html).toContain('شيك')
      expect(html).toContain('أخرى')

      // Amount input preloaded with remaining balance
      expect(html).toContain('11500')
      expect(html).toContain('حفظ الدفعة وتحديث الفاتورة')
    })

    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <PaymentRegistrationModal
            isOpen={false}
            onClose={() => {}}
            isAr={true}
          />
        </QueryClientProvider>
      )

      expect(html).toBe('')
    })
  })

  describe('4. Bank Account Settings Tab Component', () => {
    it('renders the bank account management interface', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <BankAccountSettingsTab isAr={true} canManage={true} />
        </QueryClientProvider>
      )

      expect(html).toContain('الحسابات البنكية لاستقبال الدفعات')
      expect(html).toContain('إضافة حساب بنكي جديد')
      expect(html).toContain('قائمة الحسابات البنكية المعتمدة')
    })
  })
})
