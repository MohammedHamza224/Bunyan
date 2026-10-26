import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import { UsersManagementTab } from '../components/settings/UsersManagementTab'
import { SettingsPage } from '../pages/settings/SettingsPage'

vi.mock('../store/authStore', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-user-1',
      email: 'admin@bunyan.sa',
      role: 'ORG_ADMIN',
      nameAr: 'مدير النظام',
      nameEn: 'System Admin',
    },
    hasPermission: (perm: string) => true,
    isAuthenticated: true,
    isLoading: false,
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}))

const mockUsersList = [
  {
    id: 'user-1',
    email: 'admin@bunyan.sa',
    nameAr: 'مدير النظام',
    nameEn: 'System Admin',
    role: 'ORG_ADMIN',
    permissions: ['VIEW_DATA', 'CREATE_WORK', 'APPROVE_WORK', 'MANAGE_SETTINGS'],
    isActive: true,
  },
  {
    id: 'user-2',
    email: 'engineer@bunyan.sa',
    nameAr: 'أحمد المهندس',
    nameEn: 'Ahmed Engineer',
    role: 'ORG_STAFF',
    permissions: ['VIEW_DATA', 'CREATE_WORK'],
    isActive: true,
  },
  {
    id: 'user-3',
    email: 'deactivated@bunyan.sa',
    nameAr: 'مستخدم معطل',
    nameEn: 'Deactivated User',
    role: 'ORG_STAFF',
    permissions: ['VIEW_DATA'],
    isActive: false,
  },
]

describe('BUNYAN Users Management & Security Actions UI Tests', () => {
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

  it('renders UsersManagementTab with user list, roles, and status indicators in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['orgUsers'], mockUsersList)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <UsersManagementTab isAr={true} canManage={true} />
      </QueryClientProvider>
    )

    // User details in table
    expect(html).toContain('مدير النظام')
    expect(html).toContain('admin@bunyan.sa')
    expect(html).toContain('أحمد المهندس')
    expect(html).toContain('engineer@bunyan.sa')
    expect(html).toContain('مستخدم معطل')

    // Status indicators
    expect(html).toContain('نشط')
    expect(html).toContain('معطل')

    // Action button triggers
    expect(html).toContain('user-actions-btn-user-1')
    expect(html).toContain('user-actions-btn-user-2')
    expect(html).toContain('user-actions-btn-user-3')

    // Add user section
    expect(html).toContain('إضافة مستخدم')
    expect(html).toContain('الصلاحيات المخصصة للمستخدم')
  })

  it('renders UsersManagementTab in English with correct LTR labels', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['orgUsers'], mockUsersList)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <UsersManagementTab isAr={false} canManage={true} />
      </QueryClientProvider>
    )

    expect(html).toContain('Total Users: 3')
    expect(html).toContain('Active')
    expect(html).toContain('Inactive')
    expect(html).toContain('Actions')
    expect(html).toContain('Add User')
  })

  it('renders SettingsPage and navigates to Users Tab via URL search params (?tab=users)', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['orgUsers'], mockUsersList)
    queryClient.setQueryData(['orgSettings'], {
      businessName: 'شركة بنيان للمقاولات',
      defaultCurrency: 'SAR',
      defaultLanguage: 'ar',
      vatRate: 15,
    })

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/settings?tab=users']}>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Verify Users Management is rendered directly when tab=users is provided
    expect(html).toContain('إجمالي المستخدمين: 3')
    expect(html).toContain('أحمد المهندس')
    expect(html).toContain('user-actions-btn-user-2')
  })

  it('renders Add User form with all user-entry fields initially empty and neutral role placeholder', async () => {
    await i18n.changeLanguage('ar')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['orgUsers'], mockUsersList)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <UsersManagementTab isAr={true} canManage={true} />
      </QueryClientProvider>
    )

    // Verify Add User button exists in header
    expect(html).toContain('data-testid="add-user-btn"')

    // Verify all input fields have value="" (completely empty)
    expect(html).toContain('value=""')

    // Verify neutral placeholder for role exists and is the initial option
    expect(html).toContain('-- اختر الدور الوظيفي --')

    // Verify confirm password field is present
    expect(html).toContain('تأكيد كلمة المرور')

    // Verify password inputs use autoComplete="new-password" to prevent browser autofill
    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('autoComplete="off"')

    // Verify no hardcoded demonstration or default passwords/emails are set as values
    expect(html).not.toContain('value="user@bunyan.sa"')
    expect(html).not.toContain('value="Password1"')
    expect(html).not.toContain('value="admin@bunyan.sa"')
  })

  it('renders Add User form in English with neutral placeholder and empty fields', async () => {
    await i18n.changeLanguage('en')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['orgUsers'], mockUsersList)

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <UsersManagementTab isAr={false} canManage={true} />
      </QueryClientProvider>
    )

    // English Add User button
    expect(html).toContain('Add User')
    expect(html).toContain('-- Select User Role --')
    expect(html).toContain('Confirm Password')
  })
})
