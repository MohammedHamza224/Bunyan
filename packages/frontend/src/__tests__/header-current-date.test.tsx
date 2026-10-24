import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { AuthProvider } from '../store/authStore'
import { AppLayout } from '../components/layout/AppLayout'
import { HeaderCurrentDate } from '../components/layout/HeaderCurrentDate'
import { formatCurrentDate, formatCurrentTime } from '../lib/utils'

describe('BUNYAN Top Navigation Bar — Live Current Date & Time Display', () => {
  beforeEach(() => {
    const createMockStorage = () => {
      const store = new Map<string, string>()
      return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      }
    }

    if (typeof (globalThis as any).window === 'undefined') {
      ;(globalThis as any).window = {
        localStorage: createMockStorage(),
        sessionStorage: createMockStorage(),
        location: { pathname: '/dashboard', href: '' },
      }
    }
  })

  // Known test date: Saturday Oct 24, 2026 07:46:00 UTC -> 10:46:00 in Riyadh (UTC+3)
  const testDate = new Date(Date.UTC(2026, 9, 24, 7, 46, 0))

  describe('Formatting Utilities (formatCurrentDate & formatCurrentTime)', () => {
    it('formats Arabic date with Arabic weekday, Arabic month, and Latin numerals (السبت، 24 أكتوبر 2026)', () => {
      const formattedAr = formatCurrentDate(testDate, 'ar')
      expect(formattedAr).toBe('السبت، 24 أكتوبر 2026')
    })

    it('formats English date with English weekday, English month, and English order (Saturday, October 24, 2026)', () => {
      const formattedEn = formatCurrentDate(testDate, 'en')
      expect(formattedEn).toBe('Saturday, October 24, 2026')
    })

    it('formats Arabic time with 12-hour format in Riyadh timezone (10:46 ص)', () => {
      const formattedTimeAr = formatCurrentTime(testDate, 'ar')
      expect(formattedTimeAr).toBe('10:46 ص')
    })

    it('formats English time with 12-hour format in Riyadh timezone (10:46 AM)', () => {
      const formattedTimeEn = formatCurrentTime(testDate, 'en')
      expect(formattedTimeEn).toBe('10:46 AM')
    })

    it('respects Asia/Riyadh timezone regardless of host system timezone', () => {
      // Midnight in London (UTC 00:00) is 03:00 AM on the same day in Riyadh
      const midnightUtc = new Date(Date.UTC(2026, 9, 24, 0, 0, 0))
      const timeInRiyadh = formatCurrentTime(midnightUtc, 'en', 'Asia/Riyadh')
      expect(timeInRiyadh).toBe('3:00 AM')
    })
  })

  describe('HeaderCurrentDate Component', () => {
    it('renders with testid header-current-date, date text, and live time in Arabic', async () => {
      await i18n.changeLanguage('ar')
      const html = renderToStaticMarkup(<HeaderCurrentDate fixedDate={testDate} />)

      expect(html).toContain('data-testid="header-current-date"')
      expect(html).toContain('data-testid="header-current-date-text"')
      expect(html).toContain('السبت، 24 أكتوبر 2026')
      expect(html).toContain('10:46 ص')
      expect(html).toContain('توقيت المملكة العربية السعودية (الرياض)')
    })

    it('renders with testid header-current-date, date text, and live time in English', async () => {
      await i18n.changeLanguage('en')
      const html = renderToStaticMarkup(<HeaderCurrentDate fixedDate={testDate} />)

      expect(html).toContain('data-testid="header-current-date"')
      expect(html).toContain('data-testid="header-current-date-text"')
      expect(html).toContain('Saturday, October 24, 2026')
      expect(html).toContain('10:46 AM')
      expect(html).toContain('Saudi Arabia Standard Time (Riyadh)')
    })

    it('switches dynamically when i18n language changes without reload', async () => {
      await i18n.changeLanguage('ar')
      let html = renderToStaticMarkup(<HeaderCurrentDate fixedDate={testDate} />)
      expect(html).toContain('السبت، 24 أكتوبر 2026')

      await i18n.changeLanguage('en')
      html = renderToStaticMarkup(<HeaderCurrentDate fixedDate={testDate} />)
      expect(html).toContain('Saturday, October 24, 2026')
    })
  })

  describe('Integration into AppLayout Top Navigation Bar', () => {
    it('embeds HeaderCurrentDate inside the top navigation header alongside the language switcher', async () => {
      await i18n.changeLanguage('ar')
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AuthProvider>
              <AppLayout />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      )

      expect(html).toContain('data-testid="header-current-date"')
      expect(html).toContain('data-testid="lang-toggle-btn"')
      // Verify both are present inside the header
      expect(html).toContain('header-current-date-text')
    })
  })
})
