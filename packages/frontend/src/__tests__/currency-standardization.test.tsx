import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { formatCurrency, getCurrencySymbol, resolveNumberLocale } from '../lib/utils'
import { PaymentRegistrationModal } from '../components/payments/PaymentRegistrationModal'
import { PaymentDetailModal } from '../components/payments/PaymentDetailModal'
import { StatementDetailPage } from '../pages/statements/StatementDetailPage'
import { PaymentsPage } from '../pages/payments/PaymentsPage'
import { ReportsPage } from '../pages/reports/ReportsPage'
import i18n from '../i18n'

describe('BUNYAN Currency Standardization (ر.س in Arabic, SAR in English)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    })
  })

  describe('1. Shared Currency Utility formatCurrency & resolveNumberLocale', () => {
    it('formats SAR in Arabic locale with Western digits (0–9) and localized symbol ر.س', () => {
      const formattedAr = formatCurrency(125500.5, 'ar', 'SAR')
      expect(formattedAr).toContain('125,500.50')
      expect(formattedAr).toContain('ر.س')
      // Must not contain Eastern Arabic numerals
      expect(formattedAr).not.toMatch(/[٠١٢٣٤٥٦٧٨٩]/)
    })

    it('formats SAR in English locale with Western digits (0–9) and standard code SAR', () => {
      const formattedEn = formatCurrency(125500.5, 'en', 'SAR')
      expect(formattedEn).toContain('125,500.50')
      expect(formattedEn).toContain('SAR')
      expect(formattedEn).not.toContain('ر.س')
    })

    it('accepts boolean isAr flag directly for locale resolution', () => {
      const formattedBoolAr = formatCurrency(9870.25, true, 'SAR')
      const formattedBoolEn = formatCurrency(9870.25, false, 'SAR')

      expect(formattedBoolAr).toContain('9,870.25')
      expect(formattedBoolAr).toContain('ر.س')

      expect(formattedBoolEn).toContain('9,870.25')
      expect(formattedBoolEn).toContain('SAR')
    })

    it('formats negative amounts preserving Western digits, negative sign, and localized currency', () => {
      const negAr = formatCurrency(-4500.75, 'ar', 'SAR')
      const negEn = formatCurrency(-4500.75, 'en', 'SAR')

      expect(negAr).toContain('4,500.75')
      expect(negAr).toContain('ر.س')
      expect(negAr).toContain('-')

      expect(negEn).toContain('4,500.75')
      expect(negEn).toContain('SAR')
      expect(negEn).toContain('-')
    })

    it('handles multi-currency formatting dynamically without hardcoding SAR', () => {
      const usdAr = formatCurrency(2500, 'ar', 'USD')
      const usdEn = formatCurrency(2500, 'en', 'USD')
      const eurAr = formatCurrency(3200, 'ar', 'EUR')
      const aedAr = formatCurrency(5000, 'ar', 'AED')

      expect(usdAr).toContain('2,500.00')
      expect(usdAr).not.toContain('SAR')
      expect(usdAr).not.toContain('ر.س')

      expect(usdEn).toContain('2,500.00')
      expect(usdEn).toContain('$')

      expect(eurAr).toContain('3,200.00')
      expect(eurAr).toContain('€')

      expect(aedAr).toContain('5,000.00')
      expect(aedAr).toContain('د.إ')
    })

    it('handles zero and null/undefined values safely', () => {
      const zeroAr = formatCurrency(0, 'ar', 'SAR')
      const undefinedAr = formatCurrency(undefined, 'ar', 'SAR')
      const nullEn = formatCurrency(null as any, 'en', 'SAR')

      expect(zeroAr).toContain('0.00')
      expect(zeroAr).toContain('ر.س')
      expect(undefinedAr).toContain('0.00')
      expect(undefinedAr).toContain('ر.س')
      expect(nullEn).toContain('0.00')
      expect(nullEn).toContain('SAR')
    })
  })

  describe('2. Shared getCurrencySymbol Utility', () => {
    it('returns ر.س for SAR in Arabic mode and SAR in English mode', () => {
      expect(getCurrencySymbol('SAR', true)).toBe('ر.س')
      expect(getCurrencySymbol('SAR', 'ar')).toBe('ر.س')
      expect(getCurrencySymbol('SAR', 'ar-SA')).toBe('ر.س')

      expect(getCurrencySymbol('SAR', false)).toBe('SAR')
      expect(getCurrencySymbol('SAR', 'en')).toBe('SAR')
      expect(getCurrencySymbol('SAR', 'en-US')).toBe('SAR')
    })

    it('returns localized symbols for other currencies', () => {
      expect(getCurrencySymbol('USD', true)).toBe('US$')
      expect(getCurrencySymbol('USD', false)).toBe('$')
      expect(getCurrencySymbol('EUR', true)).toBe('€')
      expect(getCurrencySymbol('EUR', false)).toBe('€')
      expect(getCurrencySymbol('AED', true)).toBe('د.إ')
      expect(getCurrencySymbol('AED', false)).toBe('AED')
      expect(getCurrencySymbol('KWD', true)).toBe('د.ك')
      expect(getCurrencySymbol('KWD', false)).toBe('KWD')
    })
  })

  describe('3. Payment Registration Modal Currency Standardization', () => {
    const mockInvoice = {
      id: 'inv-currency-1',
      referenceNo: 'INV-2026-0001',
      remainingAmount: '12500.00',
      totalAmount: '12500.00',
      currency: 'SAR',
      client: { nameAr: 'شركة الأمل', nameEn: 'Al-Amal Co' },
    }

    it('displays (ر.س) in Arabic mode for payment amount label and remaining balance', () => {
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

      expect(html).toContain('مبلغ السداد (ر.س) *')
      expect(html).toContain('12,500.00')
      expect(html).toContain('ر.س')
    })

    it('displays (SAR) in English mode for payment amount label and remaining balance', () => {
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

      expect(html).toContain('Payment Amount (SAR) *')
      expect(html).toContain('12,500.00')
      expect(html).toContain('SAR')
    })
  })

  describe('4. Payment Detail Modal Currency Standardization', () => {
    const mockPayment = {
      id: 'pay-curr-1',
      referenceNo: 'REC-2026-0001',
      amount: '35000.00',
      paymentDate: '2026-10-25T10:00:00.000Z',
      method: 'BANK_TRANSFER',
      currency: 'SAR',
      invoice: {
        id: 'inv-1',
        referenceNo: 'INV-2026-0001',
        totalAmount: '50000.00',
        paidAmount: '35000.00',
        remainingAmount: '15000.00',
        currency: 'SAR',
      },
    }

    it('renders collected amount and invoice totals using ر.س in Arabic mode', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <PaymentDetailModal
            isOpen={true}
            onClose={() => {}}
            isAr={true}
            payment={mockPayment}
          />
        </MemoryRouter>
      )

      expect(html).toContain('35,000.00')
      expect(html).toContain('ر.س')
      expect(html).toContain('50,000.00')
      expect(html).toContain('15,000.00')
    })

    it('renders collected amount and invoice totals using SAR in English mode', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <PaymentDetailModal
            isOpen={true}
            onClose={() => {}}
            isAr={false}
            payment={mockPayment}
          />
        </MemoryRouter>
      )

      expect(html).toContain('35,000.00')
      expect(html).toContain('SAR')
      expect(html).toContain('50,000.00')
      expect(html).toContain('15,000.00')
    })
  })

  describe('5. Statement Detail Page Currency Standardization', () => {
    const mockStatement = {
      id: 'stm-curr-1',
      referenceNo: 'STM-2026-0001',
      title: 'مستخلص أعمال الحفر والخرسانة',
      status: 'APPROVED',
      issueDate: '2026-10-20T00:00:00.000Z',
      currency: 'SAR',
      subtotal: '100000.00',
      discountAmount: '5000.00',
      taxableAmount: '95000.00',
      vatRate: 15,
      vatAmount: '14250.00',
      totalAmount: '109250.00',
      items: [
        {
          id: 'item-1',
          approvedQuantity: '100',
          unitPrice: '1000.00',
          lineTotal: '100000.00',
          workItem: { itemNameAr: 'أعمال حفر وردم', unit: 'م3' },
        },
      ],
      client: { nameAr: 'شركة اليمامة', nameEn: 'Al-Yamama Co' },
      site: { nameAr: 'مشروع مجمع اليمامة' },
    }

    it('renders financial summary totals using ر.س when in Arabic mode', async () => {
      await i18n.changeLanguage('ar')
      queryClient.setQueryData(['statement', 'stm-curr-1'], mockStatement)

      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/statements/stm-curr-1']}>
              <Routes>
                <Route path="/statements/:id" element={<StatementDetailPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </I18nextProvider>
      )

      expect(html).toContain('100,000.00')
      expect(html).toContain('ر.س')
      expect(html).toContain('109,250.00')
    })

    it('renders financial summary totals using SAR when in English mode', async () => {
      await i18n.changeLanguage('en')
      queryClient.setQueryData(['statement', 'stm-curr-1'], mockStatement)

      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/statements/stm-curr-1']}>
              <Routes>
                <Route path="/statements/:id" element={<StatementDetailPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </I18nextProvider>
      )

      expect(html).toContain('100,000.00')
      expect(html).toContain('SAR')
      expect(html).toContain('109,250.00')
    })
  })
})
