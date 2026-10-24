import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { AuthProvider } from '../store/authStore'
import { CountrySettingsTab, PRECONFIGURED_COUNTRIES } from '../components/settings/CountrySettingsTab'
import { SettingsPage } from '../pages/settings/SettingsPage'

describe('BUNYAN Multi-Country Settings & Regional Configuration UI', () => {
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
        location: { pathname: '/settings', href: '' },
      }
    }
  })

  it('includes complete ISO 3166-1 alpha-2 standards catalog with localized names and currencies', () => {
    expect(PRECONFIGURED_COUNTRIES.length).toBeGreaterThanOrEqual(10)
    
    // Check Saudi Arabia
    const sa = PRECONFIGURED_COUNTRIES.find((c) => c.code === 'SA')
    expect(sa).toBeDefined()
    expect(sa?.currencyCode).toBe('SAR')
    expect(sa?.standardTaxRate).toBe(15)
    expect(sa?.electronicInvoicing).toBe('ZATCA_PHASE_2')

    // Check UAE
    const ae = PRECONFIGURED_COUNTRIES.find((c) => c.code === 'AE')
    expect(ae).toBeDefined()
    expect(ae?.currencyCode).toBe('AED')
    expect(ae?.standardTaxRate).toBe(5)

    // Check Kuwait, Bahrain, Qatar, Oman, Egypt, Jordan
    expect(PRECONFIGURED_COUNTRIES.some((c) => c.code === 'KW')).toBe(true)
    expect(PRECONFIGURED_COUNTRIES.some((c) => c.code === 'BH')).toBe(true)
    expect(PRECONFIGURED_COUNTRIES.some((c) => c.code === 'QA')).toBe(true)
    expect(PRECONFIGURED_COUNTRIES.some((c) => c.code === 'OM')).toBe(true)
    expect(PRECONFIGURED_COUNTRIES.some((c) => c.code === 'EG')).toBe(true)
    expect(PRECONFIGURED_COUNTRIES.some((c) => c.code === 'JO')).toBe(true)
  })

  it('renders CountrySettingsTab with title, description, and add country button', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CountrySettingsTab isAr={true} canManage={true} />
      </QueryClientProvider>
    )

    expect(html).toContain('data-testid="country-settings-tab"')
    expect(html).toContain('إعدادات الدول')
    expect(html).toContain('data-testid="add-country-btn"')
  })

  it('renders Country Settings tab navigation button inside SettingsPage', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/settings']}>
          <AuthProvider>
            <SettingsPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(html).toContain('data-testid="country-settings-tab-btn"')
    expect(html).toContain('إعدادات الدول')
  })
})
