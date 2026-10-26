import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '../components/layout/AppLayout'
import { AuthProvider } from '../store/authStore'
import i18n from '../i18n'

describe('BUNYAN Sidebar — Professional Navigation Icons & RTL/LTR Layout', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  it('renders Customers, Sites, and Work Items navigation items with correct routes', async () => {
    await i18n.changeLanguage('ar')
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AppLayout />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )

    // Check links exist
    expect(html).toContain('href="/clients"')
    expect(html).toContain('href="/sites"')
    expect(html).toContain('href="/work-items"')

    // Check data-testid attributes
    expect(html).toContain('data-testid="nav-item-clients"')
    expect(html).toContain('data-testid="nav-item-sites"')
    expect(html).toContain('data-testid="nav-item-work-items"')

    // Check icon test IDs exist
    expect(html).toContain('data-testid="nav-icon-clients"')
    expect(html).toContain('data-testid="nav-icon-sites"')
    expect(html).toContain('data-testid="nav-icon-work-items"')
  })

  it('renders correct Arabic labels and right-hand RTL layout', async () => {
    await i18n.changeLanguage('ar')
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AppLayout />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )

    // Arabic labels
    expect(html).toContain('العملاء')
    expect(html).toContain('المواقع')
    expect(html).toContain('بنود الأعمال')

    // Sidebar positioned on the right for RTL
    expect(html).toContain('right-0')
  })

  it('renders correct English labels and left-hand LTR layout', async () => {
    await i18n.changeLanguage('en')
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AppLayout />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )

    // English labels
    expect(html).toContain('Clients')
    expect(html).toContain('Sites')
    expect(html).toContain('Work Items')

    // Sidebar positioned on the left for LTR
    expect(html).toContain('left-0')
  })

  it('preserves consistent icon sizing and decorative accessibility attributes', async () => {
    await i18n.changeLanguage('ar')
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <AppLayout />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )

    // Icons must have uniform visual sizing w-5 h-5 shrink-0 and aria-hidden
    expect(html).toContain('lucide-users w-5 h-5 shrink-0')
    expect(html).toContain('lucide-map-pin w-5 h-5 shrink-0')
    expect(html).toContain('lucide-list-checks w-5 h-5 shrink-0')
    expect(html).toContain('aria-hidden="true"')
  })
})
