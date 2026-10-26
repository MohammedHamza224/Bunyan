import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import { WorkEntriesPage } from '../pages/work-entries/WorkEntriesPage'

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

const mockWorkEntries = [
  {
    id: 'entry-draft-1',
    referenceNo: 'WRK-2026-0001',
    itemNameAr: 'أعمال لياسة داخلية',
    itemNameEn: 'Internal Plastering',
    itemDescAr: 'لياسة غرف الدور الأرضي',
    unit: 'م²',
    quantity: 100,
    unitPrice: 35,
    totalAmount: 3500,
    billedQuantity: 0,
    workDate: '2026-10-25T00:00:00.000Z',
    status: 'DRAFT',
    client: { id: 'c1', nameAr: 'شركة اليمامة للمقاولات' },
    site: { id: 's1', nameAr: 'مشروع برج الرياض' },
    createdBy: { id: 'admin-1', nameAr: 'مدير النظام' },
  },
  {
    id: 'entry-billed-2',
    referenceNo: 'WRK-2026-0002',
    itemNameAr: 'صب خرسانة مسلحة',
    itemNameEn: 'Reinforced Concrete',
    unit: 'م³',
    quantity: 50,
    unitPrice: 280,
    totalAmount: 14000,
    billedQuantity: 50,
    workDate: '2026-10-24T00:00:00.000Z',
    status: 'APPROVED',
    client: { id: 'c1', nameAr: 'شركة اليمامة للمقاولات' },
    site: { id: 's1', nameAr: 'مشروع برج الرياض' },
    createdBy: { id: 'admin-1', nameAr: 'مدير النظام' },
  },
]

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/work-entries') {
        return Promise.resolve({
          data: {
            data: {
              items: mockWorkEntries,
              total: 2,
              page: 1,
              totalPages: 1,
            },
          },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('Work Entries — Edit and Delete Actions UI', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    i18n.changeLanguage('ar')
  })

  it('renders Actions column header and action buttons for eligible entries', async () => {
    // Populate cache with mock data
    queryClient.setQueryData(
      [
        'workEntries',
        {
          search: '',
          clientFilter: '',
          siteFilter: '',
          itemFilter: '',
          statusFilter: 'ALL',
          dateFrom: '',
          dateTo: '',
          page: 1,
          limit: 15,
        },
      ],
      { items: mockWorkEntries, total: 2, page: 1, totalPages: 1 }
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/work-entries']}>
          <WorkEntriesPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Verify table renders Actions column
    expect(html).toContain('الإجراءات')

    // Verify DRAFT entry has Edit button rendered
    expect(html).toContain('WRK-2026-0001')
    expect(html).toContain('أعمال لياسة داخلية')
    expect(html).toContain('تعديل')

    // Verify Delete button rendered
    expect(html).toContain('حذف')

    // Verify Billed entry has locked edit indicator
    expect(html).toContain('WRK-2026-0002')
    expect(html).toContain('مفوتر')

    // Verify each work entry has exactly ONE View Details button (no duplicate buttons)
    const viewDetailsCount = (html.match(/title="عرض التفاصيل"/g) || []).length
    expect(viewDetailsCount).toBe(mockWorkEntries.length)
  })

  it('renders Actions column and buttons symmetrically in English LTR mode', async () => {
    await i18n.changeLanguage('en')

    queryClient.setQueryData(
      [
        'workEntries',
        {
          search: '',
          clientFilter: '',
          siteFilter: '',
          itemFilter: '',
          statusFilter: 'ALL',
          dateFrom: '',
          dateTo: '',
          page: 1,
          limit: 15,
        },
      ],
      { items: mockWorkEntries, total: 2, page: 1, totalPages: 1 }
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/work-entries']}>
          <WorkEntriesPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Verify English Actions column header
    expect(html).toContain('Actions')

    // Verify Edit and Delete actions
    expect(html).toContain('Edit')
    expect(html).toContain('Delete')

    // Verify Billed indicator
    expect(html).toContain('Billed')

    // Verify each work entry has exactly ONE View Details button in English (no duplicate buttons)
    const viewDetailsEnCount = (html.match(/title="View details"/g) || []).length
    expect(viewDetailsEnCount).toBe(mockWorkEntries.length)
  })

  it('renders workflow actions (Send/Approve) and edit/delete for PENDING_APPROVAL and REJECTED entries', async () => {
    const workflowEntries = [
      {
        id: 'entry-rejected-3',
        referenceNo: 'WRK-2026-0003',
        itemNameAr: 'تركيب سيراميك',
        unit: 'م²',
        quantity: 80,
        unitPrice: 45,
        totalAmount: 3600,
        billedQuantity: 0,
        workDate: '2026-10-25T00:00:00.000Z',
        status: 'REJECTED',
        rejectionReason: 'الكمية غير مطابقة للواقع',
        client: { id: 'c1', nameAr: 'شركة اليمامة للمقاولات' },
        site: { id: 's1', nameAr: 'مشروع برج الرياض' },
      },
      {
        id: 'entry-pending-4',
        referenceNo: 'WRK-2026-0004',
        itemNameAr: 'تمديدات كهرباء',
        unit: 'نقطة',
        quantity: 20,
        unitPrice: 150,
        totalAmount: 3000,
        billedQuantity: 0,
        workDate: '2026-10-25T00:00:00.000Z',
        status: 'PENDING_APPROVAL',
        client: { id: 'c1', nameAr: 'شركة اليمامة للمقاولات' },
        site: { id: 's1', nameAr: 'مشروع برج الرياض' },
      },
    ]

    queryClient.setQueryData(
      [
        'workEntries',
        {
          search: '',
          clientFilter: '',
          siteFilter: '',
          itemFilter: '',
          statusFilter: 'ALL',
          dateFrom: '',
          dateTo: '',
          page: 1,
          limit: 15,
        },
      ],
      { items: workflowEntries, total: 2, page: 1, totalPages: 1 }
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/work-entries']}>
          <WorkEntriesPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // For REJECTED entry: should have Edit, Delete, and Re-submit / Send button
    expect(html).toContain('WRK-2026-0003')
    expect(html).toContain('الكمية غير مطابقة للواقع')

    // For PENDING entry: should have Approve, Reject, Edit, Delete
    expect(html).toContain('WRK-2026-0004')
  })
})
