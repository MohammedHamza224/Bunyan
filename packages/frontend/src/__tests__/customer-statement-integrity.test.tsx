import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { ReportsPage } from '../pages/reports/ReportsPage'
import { ClientsPage } from '../pages/clients/ClientsPage'

vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      email: 'mh620039@gmail.com',
      role: 'ORG_ADMIN',
    },
    hasPermission: () => true,
    isAuthenticated: true,
    isLoading: false,
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}))

describe('Customer Statement & Customer Integrity UI Tests', () => {
  it('renders Customer Statement with archived notice and direct navigation link when client is inactive', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const mockClient = {
      id: 'client-archived-1',
      nameAr: 'شركة الأمل للمقاولات',
      nameEn: 'Al Amal Contracting',
      status: 'INACTIVE',
      vatNumber: '310123456700003',
      isArchived: true,
    }

    const mockCustomerStatementData = {
      currency: 'SAR',
      client: mockClient,
      period: {
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-10-25T00:00:00.000Z',
      },
      summary: {
        openingBalanceAvailable: true,
        openingBalance: 0,
        totalInvoices: 10350,
        totalDebitNotes: 0,
        totalCreditNotes: 0,
        totalPayments: 10350,
        totalDebits: 10350,
        totalCredits: 10350,
        closingBalance: 0,
      },
      transactions: [],
    }

    queryClient.setQueryData(['clients-list-all'], [mockClient])
    queryClient.setQueryData(
      [
        'report',
        'customer-statement',
        'all',
        '',
        '',
        'client-archived-1',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        false,
        true,
        'date',
        'desc',
        1,
        50,
      ],
      mockCustomerStatementData
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reports?tab=customer-statement&clientId=client-archived-1']}>
          <ReportsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Customer name and VAT number rendered
    expect(html).toContain('شركة الأمل للمقاولات')
    expect(html).toContain('310123456700003')

    // Archived customer indicator in header & banner
    expect(html).toContain('مؤرشف / غير نشط')
    expect(html).toContain('عرض العميل في صفحة العملاء')

    // Client dropdown annotates client as archived
    expect(html).toContain('(مؤرشف / غير نشط)')
  })

  it('renders ClientsPage with prompt to view archived clients when active list is empty', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    queryClient.setQueryData(
      ['clients', { search: '', statusFilter: 'ACTIVE', typeFilter: '', sortBy: 'createdAt', sortOrder: 'desc', page: 1 }],
      { items: [], total: 0, totalPages: 1 }
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/clients?status=ACTIVE']}>
          <ClientsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Prompt to view archived records
    expect(html).toContain('عرض جميع العملاء (بما في ذلك المؤرشفين)')
  })
})
