import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfessionalTaxInvoice } from '../components/invoices/ProfessionalTaxInvoice'

describe('Professional Bilingual Tax Invoice (BUNYAN)', () => {
  const mockInvoice = {
    id: 'inv-test-123',
    referenceNo: 'INV-2026-0001',
    invoiceType: 'TAX_INVOICE',
    issueDate: '2026-10-23T00:00:00.000Z',
    supplyDate: '2026-10-23T00:00:00.000Z',
    dueDate: '2026-11-23T00:00:00.000Z',
    currency: 'SAR',
    subtotal: '7650.00',
    discountAmount: '0.00',
    taxableAmount: '7650.00',
    vatRate: '15',
    vatAmount: '1147.50',
    totalAmount: '8797.50',
    paidAmount: '8797.50',
    remainingAmount: '0.00',
    status: 'APPROVED',
    paymentStatus: 'PAID',
    zatcaStatus: 'SUBMITTED',
    zatcaUuid: '422cd1c8-95cf-488d-ba2c-3e3368ca5e33',
    orgSnapshot: {
      businessName: 'شركة بنيان للمقاولات',
      businessNameEn: 'Bunyan Contracting Company',
      commercialReg: '1010123456',
      vatNumber: '300000000000003',
      address: 'الدمام، المملكة العربية السعودية',
      addressEn: 'Dammam, Saudi Arabia',
      phone: '0500000000',
    },
    clientSnapshot: {
      nameAr: 'شركة الأمل للمقاولات',
      nameEn: 'Al-Amal Contracting Co.',
      vatNumber: '310123456700003',
      address: 'الخبر، المملكة العربية السعودية',
      phone: '0551234567',
    },
    statement: {
      referenceNo: 'STM-2026-0001',
      site: {
        nameAr: 'مشروع برج الأمل السكني',
        nameEn: 'Al-Amal Residential Tower',
      },
    },
    createdBy: {
      nameAr: 'م. أحمد المهندس',
      nameEn: 'Eng. Ahmed',
    },
    lines: [
      {
        id: 'line-1',
        itemNameAr: 'أعمال خرسانة مسلحة للأساسات والقواعد',
        itemNameEn: 'Reinforced concrete foundation works',
        description: 'صب ومعالجة الخرسانة المسلحة عيار 350 كجم/م3 وفق المواصفات',
        unit: 'م³',
        quantity: '50',
        unitPrice: '100.00',
        lineSubtotal: '5000.00',
        vatRate: '15',
        vatAmount: '750.00',
        lineTotal: '5750.00',
      },
      {
        id: 'line-2',
        itemNameAr: 'أعمال عزل مائي وإيبوكسي',
        itemNameEn: 'Waterproofing and epoxy membrane',
        description: 'طبقتين ممبرين مع طبقة حماية وحبيبات رملية',
        unit: 'م²',
        quantity: '265',
        unitPrice: '10.00',
        lineSubtotal: '2650.00',
        vatRate: '15',
        vatAmount: '397.50',
        lineTotal: '3047.50',
      },
    ],
  }

  const sampleQrDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  it('renders root invoice container with fixed LTR direction and a4-print-sheet class', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('dir="ltr"')
    expect(html).toContain('a4-print-sheet')
    expect(html).toContain('data-testid="professional-tax-invoice"')
  })

  it('renders corporate header with English on the left and Arabic on the right', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('Bunyan Contracting Company')
    expect(html).toContain('شركة بنيان للمقاولات')
    expect(html).toContain('300000000000003')
    expect(html).toContain('1010123456')
    expect(html).toContain('lang="en"')
    expect(html).toContain('lang="ar"')
  })

  it('strictly aligns Commercial Registration (C.R. No) and VAT Registration numbers in balanced 2-column key-value grids without line-wrapping or bidi-inversion', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    // English labels & numbers
    expect(html).toContain('C.R. No:')
    expect(html).toContain('VAT Reg No:')
    // Arabic labels & numbers
    expect(html).toContain('السجل التجاري:')
    expect(html).toContain('الرقم الضريبي:')
    // Key-value grid classes and non-wrapping monospace attributes
    expect(html).toContain('grid-cols-[auto_1fr]')
    expect(html).toContain('whitespace-nowrap')
    expect(html).toContain('select-all')
  })

  it('renders symmetrical customer information with English on left and Arabic on right', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('Customer Details (Buyer)')
    expect(html).toContain('بيانات العميل (المشتري)')
    expect(html).toContain('Al-Amal Contracting Co.')
    expect(html).toContain('شركة الأمل للمقاولات')
    expect(html).toContain('310123456700003')
  })

  it('renders line items table with bilingual descriptions and accurate calculations', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('Reinforced concrete foundation works')
    expect(html).toContain('أعمال خرسانة مسلحة للأساسات والقواعد')
    expect(html).toContain('5000.00')
    expect(html).toContain('5750.00')
    expect(html).toContain('3047.50')
  })

  it('renders financial summary totals with English on the left, amount in middle, Arabic on the right', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('Subtotal (Excl. VAT)')
    expect(html).toContain('الإجمالي غير شامل الضريبة')
    expect(html).toContain('7650.00 SAR')
    expect(html).toContain('1147.50 SAR')
    expect(html).toContain('TOTAL (INCL. VAT)')
    expect(html).toContain('الإجمالي شامل الضريبة')
    expect(html).toContain('8797.50 SAR')
  })

  it('renders bilingual amount in words (Tafqeet) matching the invoice total', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('Eight Thousand Seven Hundred and Ninety-Seven')
    expect(html).toContain('ثمانية آلاف وسبعمائة وسبعة وتسعون')
  })

  it('renders dedicated ZATCA QR card with real QR image and verified status badge', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('data-testid="zatca-qr-img"')
    expect(html).toContain('src="' + sampleQrDataUrl + '"')
    expect(html).toContain('Verified ZATCA E-Invoice QR Code')
    expect(html).toContain('رمز الفاتورة الإلكترونية المعتمد من هيئة الزكاة')
  })

  it('renders three official signature and stamp boxes', () => {
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('Prepared By')
    expect(html).toContain('أعدت بواسطة')
    expect(html).toContain('Approved By')
    expect(html).toContain('اعتمدت بواسطة')
    expect(html).toContain('Received By')
    expect(html).toContain('استلمت بواسطة (العميل)')
  })

  it('handles multi-currency invoices (e.g. USD) and dynamic currency formatting', () => {
    const usdInvoice = {
      ...mockInvoice,
      currency: 'USD',
      totalAmount: '1500.00',
      subtotal: '1500.00',
      vatAmount: '0.00',
      taxableAmount: '1500.00',
    }
    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={usdInvoice}
        qrImageSrc={sampleQrDataUrl}
      />
    )
    expect(html).toContain('1500.00 USD')
    expect(html).toContain('US Dollars')
    expect(html).toContain('دولار أمريكي')
  })
})
