import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import { TestDataManagementTab } from '../components/settings/TestDataManagementTab'

vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      role: 'ORG_ADMIN',
      nameAr: 'محمد حمزة',
      nameEn: 'Mohammed Hamza',
    },
    isAuthenticated: true,
    hasPermission: () => true,
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}))

const mockDatasets = [
  {
    id: 'dataset-test-1',
    name: 'حزمة مقاولات متكاملة - 2026-10-25',
    description: 'بيانات تجريبية لدورة مقاولات متكاملة',
    scenario: 'standard_contracting',
    status: 'ACTIVE',
    recordCount: 8,
    createdAt: '2026-10-25T14:00:00.000Z',
    createdBy: {
      nameAr: 'محمد حمزة',
      email: 'admin@bunyan.sa',
    },
    summary: {
      Client: 1,
      Site: 1,
      WorkEntry: 3,
      Statement: 1,
      Invoice: 1,
      Payment: 1,
    },
  },
]

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/test-data/datasets') {
        return Promise.resolve({
          data: {
            data: mockDatasets,
          },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    }),
    post: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
}))

describe('Test Data Management UI & Tab (إدارة البيانات التجريبية)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders TestDataManagementTab in Arabic with safety isolation banner and datasets list', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['testDatasets'], mockDatasets)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TestDataManagementTab />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(html).toContain('إدارة البيانات التجريبية')
    expect(html).toContain('ضمان الحماية والعزل التام للبيانات التشغيلية')
    expect(html).toContain('data-testid="generate-test-data-btn"')
    expect(html).toContain('حزمة مقاولات متكاملة')
    expect(html).toContain('محمد حمزة')
  })

  it('renders TestDataManagementTab in English with LTR text', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['testDatasets'], mockDatasets)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TestDataManagementTab />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(html).toContain('Test Data Management')
    expect(html).toContain('Complete Protection &amp; Isolation of Business Data')
    expect(html).toContain('Generate Test Dataset')
    expect(html).toContain('Active (Available)')
  })
})
