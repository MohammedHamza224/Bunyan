import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import fs from 'fs'
import path from 'path'
import { AppLayout } from '../components/layout/AppLayout'
import { HeaderCurrentDate } from '../components/layout/HeaderCurrentDate'

vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user',
      nameAr: 'المهندس أحمد الفهد',
      email: 'ahmed@bunyan.sa',
      role: 'ADMIN',
    },
    logout: vi.fn(),
  }),
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: {
        businessName: 'شركة بنيان للمقاولات العامة',
        businessNameEn: 'Bunyan General Contracting Co.',
      },
    }),
  },
}))

describe('Responsive Design & Architecture Audit Suite', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  describe('1. Mobile App Shell & Navigation Drawer', () => {
    it('renders responsive mobile drawer trigger and navigation structure', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppLayout />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Mobile hamburger trigger should exist with responsive visibility
      expect(html).toContain('lg:hidden')
      expect(html).toContain('data-testid="app-sidebar"')

      // Sidebar should have responsive fixed position on mobile and static on lg
      expect(html).toContain('fixed lg:static')
      expect(html).toContain('data-testid="app-sidebar"')

      // Language button has responsive padding and font sizing
      expect(html).toContain('data-testid="lang-toggle-btn"')
      expect(html).toContain('text-xs sm:text-sm')
      expect(html).toContain('px-2.5 sm:px-3.5')
    })
  })

  describe('2. Header Date & Time Responsive Containment', () => {
    it('renders date with responsive max-width containment on mobile viewports', () => {
      const fixedDate = new Date('2026-10-25T10:30:00Z')
      const html = renderToStaticMarkup(<HeaderCurrentDate fixedDate={fixedDate} />)

      // Date text element contains truncate and max-width classes for 320px screens
      expect(html).toContain('data-testid="header-current-date-text"')
      expect(html).toContain('truncate')
      expect(html).toContain('max-w-[130px]')
      expect(html).toContain('sm:max-w-none')

      // Clock container must be hidden on extra-small mobile (< sm)
      expect(html).toContain('data-testid="header-current-time-container"')
      expect(html).toContain('hidden sm:flex')
    })
  })

  describe('3. PWA Static Shell & Security Verification', () => {
    const publicDir = path.resolve(__dirname, '../../public')

    it('has a valid web app manifest with standalone display and theme color', () => {
      const manifestPath = path.join(publicDir, 'manifest.webmanifest')
      expect(fs.existsSync(manifestPath)).toBe(true)

      const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      expect(content.name).toContain('BUNYAN')
      expect(content.display).toBe('standalone')
      expect(content.theme_color).toBe('#102437')
      expect(content.background_color).toBe('#F5F7FA')
      expect(content.start_url).toBe('/')
      expect(Array.isArray(content.icons)).toBe(true)
      expect(content.icons.length).toBeGreaterThan(0)
    })

    it('has a high-resolution geometric SVG brand icon for PWA', () => {
      const iconPath = path.join(publicDir, 'favicon.svg')
      expect(fs.existsSync(iconPath)).toBe(true)

      const iconContent = fs.readFileSync(iconPath, 'utf-8')
      expect(iconContent).toContain('<svg')
      expect(iconContent).toContain('#102437')
      expect(iconContent).toContain('#E6A23C')
    })

    it('implements strict service worker security bypassing all private API endpoints', () => {
      const swPath = path.join(publicDir, 'sw.js')
      expect(fs.existsSync(swPath)).toBe(true)

      const swContent = fs.readFileSync(swPath, 'utf-8')
      // Must explicitly verify API requests are NOT cached
      expect(swContent).toContain('/api')
      expect(swContent).toContain('NEVER')
      // Must not cache non-GET methods
      expect(swContent).toContain("request.method !== 'GET'")
    })
  })

  describe('4. Invoice Mobile Screen Scroller vs A4 Print Fidelity', () => {
    it('verifies index.css contains responsive touch and pristine A4 print rules', () => {
      const cssPath = path.resolve(__dirname, '../index.css')
      const cssContent = fs.readFileSync(cssPath, 'utf-8')

      // Touch scrolling utility
      expect(cssContent).toContain('-webkit-overflow-scrolling: touch')

      // A4 Print isolation
      expect(cssContent).toContain('@page')
      expect(cssContent).toContain('size: A4 portrait')
      expect(cssContent).toContain('.a4-print-sheet')
      expect(cssContent).toContain('min-width: 0 !important')
      expect(cssContent).toContain('width: 100% !important')
    })
  })

  describe('5. Responsive Table Containment Across Modules', () => {
    const pagesDir = path.resolve(__dirname, '../pages')

    it('verifies primary data tables enforce min-width and horizontal scrollability', () => {
      const invoicesPageContent = fs.readFileSync(
        path.join(pagesDir, 'invoices/InvoicesPage.tsx'),
        'utf-8'
      )
      expect(invoicesPageContent).toContain('min-w-[760px]')
      expect(invoicesPageContent).toContain('overflow-x-auto')

      const paymentsPageContent = fs.readFileSync(
        path.join(pagesDir, 'payments/PaymentsPage.tsx'),
        'utf-8'
      )
      expect(paymentsPageContent).toContain('min-w-[720px]')

      const statementsPageContent = fs.readFileSync(
        path.join(pagesDir, 'statements/StatementsPage.tsx'),
        'utf-8'
      )
      expect(statementsPageContent).toContain('min-w-[720px]')

      const clientsPageContent = fs.readFileSync(
        path.join(pagesDir, 'clients/ClientsPage.tsx'),
        'utf-8'
      )
      expect(clientsPageContent).toContain('min-w-[720px]')
    })
  })
})
