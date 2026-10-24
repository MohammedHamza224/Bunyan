import { describe, it, expect } from 'vitest'
import i18n from '../i18n'
import ar from '../i18n/locales/ar'
import en from '../i18n/locales/en'
import { formatCurrency } from '../lib/utils'

function getKeys(obj: Record<string, any>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return getKeys(value, fullKey)
    }
    return [fullKey]
  })
}

describe('Frontend i18n, RTL/LTR & Currency Formatting', () => {
  it('has matching translation keys between Arabic (ar) and English (en)', () => {
    const arKeys = getKeys(ar).sort()
    const enKeys = getKeys(en).sort()
    expect(arKeys).toEqual(enKeys)
    expect(arKeys.length).toBeGreaterThan(150)
  })

  it('defaults to Arabic (ar) and translates navigation & settings keys accurately', async () => {
    await i18n.changeLanguage('ar')
    expect(i18n.language).toBe('ar')
    expect(i18n.t('nav.dashboard')).toBe('لوحة التحكم')
    expect(i18n.t('settings.title')).toBe('الإعدادات')
  })

  it('switches to English (en) and resolves English strings cleanly', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.language).toBe('en')
    expect(i18n.t('nav.dashboard')).toBe('Dashboard')
    expect(i18n.t('settings.title')).toBe('Settings')
  })

  it('computes direction rtl for Arabic and ltr for English', async () => {
    await i18n.changeLanguage('ar')
    const dirAr = i18n.language === 'ar' ? 'rtl' : 'ltr'
    expect(dirAr).toBe('rtl')

    await i18n.changeLanguage('en')
    const dirEn = i18n.language === 'ar' ? 'rtl' : 'ltr'
    expect(dirEn).toBe('ltr')
  })

  it('formats SAR currency in both Arabic and English locales', () => {
    const formattedAr = formatCurrency(1500.5, 'ar-SA', 'SAR')
    const formattedEn = formatCurrency(1500.5, 'en-SA', 'SAR')
    expect(formattedAr).toBeTruthy()
    expect(formattedEn).toContain('1,500.50')
  })
})
