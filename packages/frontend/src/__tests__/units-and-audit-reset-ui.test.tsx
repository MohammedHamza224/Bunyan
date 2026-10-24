import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { AuthProvider } from '../store/authStore'
import { UnitsSettingsTab } from '../components/settings/UnitsSettingsTab'
import { SettingsPage } from '../pages/settings/SettingsPage'
import { AuditLogSettingsTab } from '../components/settings/AuditLogSettingsTab'

describe('BUNYAN Units of Measurement & Audit Log Reset UI Tests', () => {
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

  it('renders UnitsSettingsTab with title, description, and Add Unit button in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <UnitsSettingsTab isAr={true} canManage={true} />
      </QueryClientProvider>
    )

    expect(html).toContain('وحدات القياس الإنشائية')
    expect(html).toContain('data-testid="add-unit-btn"')
    expect(html).toContain('إضافة وحدة قياس جديدة')
    expect(html).toContain('قائمة الوحدات المعتمدة')
  })

  it('renders UnitsSettingsTab with English labels when language is English', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <UnitsSettingsTab isAr={false} canManage={true} />
      </QueryClientProvider>
    )

    expect(html).toContain('Construction Units of Measurement')
    expect(html).toContain('Add New Unit')
    expect(html).toContain('Registered Units Catalog')
  })

  it('renders Units of Measure tab navigation button inside SettingsPage', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <SettingsPage />
          </QueryClientProvider>
        </AuthProvider>
      </MemoryRouter>
    )

    expect(html).toContain('data-testid="units-settings-tab-btn"')
    expect(html).toContain('وحدات القياس')
  })

  it('renders AuditLogSettingsTab with retention management and policy save button', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuditLogSettingsTab isAr={true} isAdmin={true} />
      </QueryClientProvider>
    )

    expect(html).toContain('سياسة أرشفة وحذف سجلات التدقيق')
    expect(html).toContain('data-testid="save-retention-policy-btn"')
    expect(html).toContain('حفظ السياسة')
  })
})
