import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import ar from '../i18n/locales/ar'
import en from '../i18n/locales/en'
import { InvoicesPage } from '../pages/invoices/InvoicesPage'

vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      role: 'ORG_ADMIN',
      nameAr: 'مدير النظام',
      nameEn: 'System Admin',
    },
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/invoices') {
        return Promise.resolve({
          data: {
            data: {
              items: [],
              total: 0,
              totalPages: 1,
            },
          },
        })
      }
      if (url === '/clients') {
        return Promise.resolve({
          data: {
            data: {
              items: [],
            },
          },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    }),
    post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    put: vi.fn().mockResolvedValue({ data: { data: {} } }),
    delete: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
}))

describe('Invoices Page Header UI Text & Localization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('contains the exact updated Arabic and English texts in i18n locale dictionaries', () => {
    expect(ar.invoices.heading).toBe('الفواتير وإدارة الفوترة')
    expect(ar.invoices.description).toBe(
      'إصدار الفواتير من المستخلصات المعتمدة أو الأعمال المنفذة، مع منع تكرار الفوترة ودعم متطلبات الفوترة الإلكترونية.'
    )

    expect(en.invoices.heading).toBe('Invoices & Billing Management')
    expect(en.invoices.description).toBe(
      'Issue invoices from approved work-completion statements or completed work, prevent duplicate billing, and support electronic invoicing requirements.'
    )
  })

  it('renders InvoicesPage in Arabic with updated heading and description', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvoicesPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(html).toContain('الفواتير وإدارة الفوترة')
    expect(html).toContain(
      'إصدار الفواتير من المستخلصات المعتمدة أو الأعمال المنفذة، مع منع تكرار الفوترة ودعم متطلبات الفوترة الإلكترونية.'
    )
    expect(html).not.toContain('الفواتير الضريبية ومتطلبات ZATCA')
    expect(html).not.toContain('مع منع تكرار الفوترة ودعم ZATCA')
  })

  it('renders InvoicesPage in English with consistent heading and description', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InvoicesPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(html).toContain('Invoices &amp; Billing Management')
    expect(html).toContain(
      'Issue invoices from approved work-completion statements or completed work, prevent duplicate billing, and support electronic invoicing requirements.'
    )
    expect(html).not.toContain('Tax Invoices &amp; ZATCA E-Invoicing')
  })
})
