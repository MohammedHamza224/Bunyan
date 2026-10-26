import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfessionalTaxInvoice } from '../components/invoices/ProfessionalTaxInvoice'
import i18n from '../i18n'

describe('Company Website in Company Information & Invoices (BUNYAN)', () => {
  it('has correct bilingual translations for Company Website', () => {
    i18n.changeLanguage('ar')
    expect(i18n.t('settings.companyWebsite')).toBe('الموقع الإلكتروني')

    i18n.changeLanguage('en')
    expect(i18n.t('settings.companyWebsite')).toBe('Company Website')
  })

  it('ProfessionalTaxInvoice displays company website and email in header when configured', () => {
    const orgSnapshotWithWebsite = {
      businessName: 'شركة بنيان للمقاولات العامة',
      businessNameEn: 'BUNYAN GENERAL CONTRACTING CO.',
      commercialReg: '1010123456',
      vatNumber: '310123456700003',
      address: 'الرياض - طريق الملك فهد',
      addressEn: 'King Fahd Road, Riyadh',
      phone: '0112345678',
      email: 'info@bunyan-test.example.com',
      website: 'https://bunyan-contracting.example.com',
      logoUrl: null,
    }

    const mockInvoice: any = {
      id: 'inv-web-1',
      referenceNo: 'INV-2026-0099',
      invoiceType: 'TAX_INVOICE',
      issueDate: '2026-10-25',
      dueDate: '2026-11-25',
      totalAmount: 115000,
      subtotal: 100000,
      vatAmount: 15000,
      status: 'APPROVED',
      paymentStatus: 'UNPAID',
      orgSnapshot: orgSnapshotWithWebsite,
      clientSnapshot: {
        nameAr: 'شركة الأفق للمقاولات',
        nameEn: 'Horizon Contracting Co.',
      },
      lines: [],
    }

    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc=""
      />
    )

    // English Header (Left column)
    expect(html).toContain('Website:')
    expect(html).toContain('data-testid="invoice-company-website-en"')
    expect(html).toContain('href="https://bunyan-contracting.example.com"')
    expect(html).toContain('https://bunyan-contracting.example.com')
    expect(html).toContain('Email:')
    expect(html).toContain('info@bunyan-test.example.com')

    // Arabic Header (Right column)
    expect(html).toContain('الموقع:')
    expect(html).toContain('data-testid="invoice-company-website-ar"')
    expect(html).toContain('البريد:')
  })

  it('ProfessionalTaxInvoice strictly hides website when not configured (no empty labels or placeholders)', () => {
    const orgSnapshotWithoutWebsite = {
      businessName: 'شركة بنيان للمقاولات العامة',
      businessNameEn: 'BUNYAN GENERAL CONTRACTING CO.',
      commercialReg: '1010123456',
      vatNumber: '310123456700003',
      address: 'الرياض - طريق الملك فهد',
      addressEn: 'King Fahd Road, Riyadh',
      phone: '0112345678',
      email: 'info@bunyan-test.example.com',
      website: null, // No website configured
      logoUrl: null,
    }

    const mockInvoice: any = {
      id: 'inv-web-2',
      referenceNo: 'INV-2026-0100',
      invoiceType: 'TAX_INVOICE',
      issueDate: '2026-10-25',
      dueDate: '2026-11-25',
      totalAmount: 57500,
      subtotal: 50000,
      vatAmount: 7500,
      status: 'APPROVED',
      paymentStatus: 'UNPAID',
      orgSnapshot: orgSnapshotWithoutWebsite,
      clientSnapshot: {
        nameAr: 'مؤسسة البناء الحديث',
        nameEn: 'Modern Construction Est.',
      },
      lines: [],
    }

    const html = renderToStaticMarkup(
      <ProfessionalTaxInvoice
        invoice={mockInvoice}
        qrImageSrc=""
      />
    )

    // Crucial requirement: No website label, empty field, or placeholder
    expect(html).not.toContain('Website:')
    expect(html).not.toContain('الموقع:')
    expect(html).not.toContain('data-testid="invoice-company-website-en"')
    expect(html).not.toContain('data-testid="invoice-company-website-ar"')

    // Email should still be present
    expect(html).toContain('info@bunyan-test.example.com')
    expect(html).toContain('Email:')
    expect(html).toContain('البريد:')
  })

  it('verifies SettingsPage Company Website and Phone layout, alignment and consistent grid width', () => {
    // Read the SettingsPage source directly to verify DOM layout structure
    const fs = require('fs')
    const path = require('path')
    const settingsPath = path.resolve(__dirname, '../pages/settings/SettingsPage.tsx')
    const content = fs.readFileSync(settingsPath, 'utf-8')

    // 1. Verify there is NO dummy spacer div pushing website down
    expect(content).not.toContain('<div className="hidden md:block" aria-hidden="true" />')

    // 2. Verify companyWebsite and phone have consistent w-full class matching the grid system
    expect(content).toContain('id="companyWebsite"')
    expect(content).toContain('data-testid="company-website-input"')
    expect(content).toContain('id="phone"')
    expect(content).toContain('data-testid="company-phone-input"')
    expect(content).toContain('w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm')

    // 3. Verify companyWebsite is positioned directly alongside businessEmail in the grid
    const emailIndex = content.indexOf('id="businessEmail"')
    const websiteIndex = content.indexOf('id="companyWebsite"')
    expect(emailIndex).toBeGreaterThan(0)
    expect(websiteIndex).toBeGreaterThan(emailIndex)
    
    // Ensure no intermediate elements exist between businessEmail container and companyWebsite container
    const snippetBetween = content.substring(emailIndex, websiteIndex)
    expect(snippetBetween).not.toContain('md:block')
    expect(snippetBetween).not.toContain('col-span-2')
  })
})
