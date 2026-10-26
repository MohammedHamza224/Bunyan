import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import i18n from '../i18n'

describe('Company Phone and Website Layout Alignment in SettingsPage', () => {
  const settingsPath = path.resolve(__dirname, '../pages/settings/SettingsPage.tsx')
  const content = fs.readFileSync(settingsPath, 'utf-8')

  it('provides bilingual translations for businessPhone and companyWebsite', () => {
    i18n.changeLanguage('ar')
    expect(i18n.t('settings.businessPhone')).toBe('هاتف الشركة')
    expect(i18n.t('settings.companyWebsite')).toBe('الموقع الإلكتروني')

    i18n.changeLanguage('en')
    expect(i18n.t('settings.businessPhone')).toBe('Business Phone')
    expect(i18n.t('settings.companyWebsite')).toBe('Company Website')
  })

  it('uses the standard 2-column responsive grid container for Business Identity fields', () => {
    expect(content).toContain('grid grid-cols-1 md:grid-cols-2 gap-4')
  })

  it('guarantees identical input styling and 100% width consistency between phone, website, email, and vatNumber', () => {
    const standardInputClass = 'w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100'

    // Extract input elements directly around each field
    const phoneInputMatch = content.match(/<input[^<]*?id="phone"[^<]*?\/>/)
    const websiteInputMatch = content.match(/<input[^<]*?id="companyWebsite"[^<]*?\/>/)
    const emailInputMatch = content.match(/<input[^<]*?id="businessEmail"[^<]*?\/>/)
    const vatInputMatch = content.match(/<input[^<]*?id="vatNumber"[^<]*?\/>/)

    expect(phoneInputMatch).not.toBeNull()
    expect(websiteInputMatch).not.toBeNull()
    expect(emailInputMatch).not.toBeNull()
    expect(vatInputMatch).not.toBeNull()

    // Verify all four key fields share the EXACT same class list
    expect(phoneInputMatch![0]).toContain(standardInputClass)
    expect(websiteInputMatch![0]).toContain(standardInputClass)
    expect(emailInputMatch![0]).toContain(standardInputClass)
    expect(vatInputMatch![0]).toContain(standardInputClass)

    // Ensure no asymmetric max-width constraints (such as max-w-md) exist on companyWebsite or phone
    expect(websiteInputMatch![0]).not.toContain('max-w-')
    expect(phoneInputMatch![0]).not.toContain('max-w-')
  })

  it('ensures each label is correctly positioned and styled relative to its input', () => {
    const standardLabelClass = 'block text-sm font-medium text-gray-700 mb-1'

    expect(content).toContain(`htmlFor="phone" className="${standardLabelClass}"`)
    expect(content).toContain(`htmlFor="companyWebsite" className="${standardLabelClass}"`)
    expect(content).toContain(`htmlFor="businessEmail" className="${standardLabelClass}"`)
    expect(content).toContain(`htmlFor="vatNumber" className="${standardLabelClass}"`)
  })

  it('maintains dir="ltr" on phone, website, email, and vatNumber for BiDi and international safety in RTL', () => {
    const phoneInputMatch = content.match(/<input[^<]*?id="phone"[^<]*?\/>/)![0]
    const websiteInputMatch = content.match(/<input[^<]*?id="companyWebsite"[^<]*?\/>/)![0]
    const emailInputMatch = content.match(/<input[^<]*?id="businessEmail"[^<]*?\/>/)![0]
    const vatInputMatch = content.match(/<input[^<]*?id="vatNumber"[^<]*?\/>/)![0]

    expect(phoneInputMatch).toContain('dir="ltr"')
    expect(websiteInputMatch).toContain('dir="ltr"')
    expect(emailInputMatch).toContain('dir="ltr"')
    expect(vatInputMatch).toContain('dir="ltr"')
  })

  it('verifies strict grid order: vatNumber & phone in Row 1, businessEmail & companyWebsite in Row 2, address spans full width', () => {
    const vatIndex = content.indexOf('id="vatNumber"')
    const phoneIndex = content.indexOf('id="phone"')
    const emailIndex = content.indexOf('id="businessEmail"')
    const websiteIndex = content.indexOf('id="companyWebsite"')
    const addressIndex = content.indexOf('id="address"')

    // Relative ordering in the 2-column grid:
    // Column 1: vatNumber (row 1), businessEmail (row 2)
    // Column 2: phone (row 1), companyWebsite (row 2)
    expect(vatIndex).toBeGreaterThan(0)
    expect(phoneIndex).toBeGreaterThan(vatIndex)
    expect(emailIndex).toBeGreaterThan(phoneIndex)
    expect(websiteIndex).toBeGreaterThan(emailIndex)
    expect(addressIndex).toBeGreaterThan(websiteIndex)

    // Address spans 2 columns
    const addressSnippet = content.substring(websiteIndex, addressIndex)
    expect(addressSnippet).toContain('md:col-span-2')
  })
})
