import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import fs from 'fs'
import path from 'path'
import i18n from '../i18n'
// @ts-ignore - JS config file without declaration
import tailwindConfig from '../../tailwind.config.js'
import { AuthProvider } from '../store/authStore'
import { AppLayout } from '../components/layout/AppLayout'
import {
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredRefreshToken,
  isPersistentSession,
} from '../lib/api'
import { LoginPage } from '../pages/auth/LoginPage'
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage'
import { RegisterPage } from '../pages/auth/RegisterPage'

describe('Construction Visual Identity, Auth Split Layout, Remember Me & Password Recovery UI', () => {
  beforeEach(() => {
    // Provide clean mock storage for Node/Vitest environment if window is not defined
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
        location: { pathname: '/login', href: '' },
      }
    } else {
      window.localStorage?.clear?.()
      window.sessionStorage?.clear?.()
    }
  })

  it('defines exact Construction Industry color tokens in tailwind.config.js', () => {
    const colors = (tailwindConfig as any)?.theme?.extend?.colors
    expect(colors.navy.DEFAULT).toBe('#18324B')
    expect(colors.navy.dark).toBe('#102437')
    expect(colors.navy.light).toBe('#EAF0F5')

    expect(colors.construction.DEFAULT).toBe('#E6A23C')
    expect(colors.construction.dark).toBe('#B97816')
    expect(colors.construction.light).toBe('#FFF4DF')

    expect(colors.neutral.bg).toBe('#F5F7FA')
    expect(colors.neutral.card).toBe('#FFFFFF')
    expect(colors.neutral.text).toBe('#1F2937')
    expect(colors.neutral.muted).toBe('#667085')
    expect(colors.neutral.border).toBe('#E4E7EC')
  })

  it('stores the construction hero photograph locally in public/assets/construction-hero.jpg', () => {
    const assetPath = path.resolve(__dirname, '../../public/assets/construction-hero.jpg')
    expect(fs.existsSync(assetPath)).toBe(true)
    const stats = fs.statSync(assetPath)
    expect(stats.size).toBeGreaterThan(50_000)
  })

  it('renders LoginPage in Arabic with 60/40 two-panel composition, BUNYAN ("بنيان") branding, exact Arabic construction copy, Remember Me ("تذكرني"), and recovery link', async () => {
    await i18n.changeLanguage('ar')
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    // Two-panel proportions & RTL direction
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('data-testid="auth-visual-panel"')
    expect(html).toContain('lg:w-[58%] xl:w-[60%]')
    expect(html).toContain('data-testid="auth-form-panel"')
    expect(html).toContain('lg:w-[42%] xl:w-[40%]')

    // Brand & Photography
    expect(html).toContain('بنيان')
    expect(html).toContain('BUNYAN')
    expect(html).not.toContain('ContractorFlow')
    expect(html).toContain('/assets/construction-hero.jpg')

    // Right Panel Arabic Hero Copy
    expect(html).toContain('إدارة أعمال المقاولات برؤية أوضح.')
    expect(html).toContain(
      'منصة واحدة لتنظيم مشاريعك، ومتابعة أعمال التنفيذ، وإدارة المستخلصات والفواتير والمدفوعات.'
    )

    // Left Panel Arabic Form Copy & Controls
    expect(html).toContain('مرحبًا بك في بنيان')
    expect(html).toContain('سجّل الدخول للوصول إلى حسابك ومتابعة أعمالك.')
    expect(html).toContain('data-testid="login-email-input"')
    expect(html).toContain('data-testid="login-password-input"')
    expect(html).toContain('data-testid="login-remember-me-checkbox"')
    expect(html).toContain('تذكرني')
    expect(html).toContain('نسيت كلمة المرور؟')
    expect(html).toContain('تسجيل الدخول')
    expect(html).toContain('data-testid="toggle-password-visibility"')
    expect(html).toContain('data-testid="forgot-password-link"')
    expect(html).toContain('href="/forgot-password"')
  })

  it('renders LoginPage in English with LTR direction, BUNYAN branding, exact English construction headline, and Remember Me ("Remember Me")', async () => {
    await i18n.changeLanguage('en')
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    expect(html).toContain('dir="ltr"')
    expect(html).toContain('BUNYAN')
    expect(html).toContain('بنيان')
    expect(html).not.toContain('ContractorFlow')

    // Right Panel English Hero Copy
    expect(html).toContain('A clearer vision for your contracting business.')
    expect(html).toContain(
      'One platform to organize projects, track completed work, and manage statements, invoices, and payments.'
    )

    // Left Panel English Form Copy & Controls
    expect(html).toContain('Welcome to BUNYAN')
    expect(html).toContain('Sign in to access your account and manage your work.')
    expect(html).toContain('data-testid="login-remember-me-checkbox"')
    expect(html).toContain('Remember Me')
    expect(html).toContain('Forgot Password?')
    expect(html).toContain('Sign In')
  })

  it('persists session across browser restart when Remember Me is enabled (localStorage) and clears on browser restart when disabled (sessionStorage)', () => {
    // 1. Remember Me ENABLED -> stored in localStorage
    setStoredRefreshToken('persistent-refresh-token-1', true)
    expect(isPersistentSession()).toBe(true)
    expect(window.localStorage.getItem('refreshToken')).toBe('persistent-refresh-token-1')
    expect(window.sessionStorage.getItem('refreshToken')).toBeNull()

    // Simulate browser restart (sessionStorage cleared, localStorage retained)
    window.sessionStorage.clear()
    expect(getStoredRefreshToken()).toBe('persistent-refresh-token-1')

    // Token rotation without explicit rememberMe argument preserves persistent storage
    setStoredRefreshToken('persistent-refresh-token-2')
    expect(window.localStorage.getItem('refreshToken')).toBe('persistent-refresh-token-2')
    expect(window.sessionStorage.getItem('refreshToken')).toBeNull()

    // 2. Remember Me DISABLED -> stored in sessionStorage only
    setStoredRefreshToken('session-only-token-1', false)
    expect(isPersistentSession()).toBe(false)
    expect(window.sessionStorage.getItem('refreshToken')).toBe('session-only-token-1')
    expect(window.localStorage.getItem('refreshToken')).toBeNull()

    // Token rotation during active tab session stays in sessionStorage
    setStoredRefreshToken('session-only-token-2')
    expect(window.sessionStorage.getItem('refreshToken')).toBe('session-only-token-2')
    expect(window.localStorage.getItem('refreshToken')).toBeNull()

    // Simulate browser restart (sessionStorage cleared) -> user is no longer signed in
    window.sessionStorage.clear()
    expect(getStoredRefreshToken()).toBeNull()

    // 3. Logout clears both storages
    setStoredRefreshToken('token-to-clear', true)
    clearStoredRefreshToken()
    expect(getStoredRefreshToken()).toBeNull()
    expect(window.localStorage.getItem('refreshToken')).toBeNull()
    expect(window.sessionStorage.getItem('refreshToken')).toBeNull()
  })

  it('renders ForgotPasswordPage and ResetPasswordPage with construction identity in both languages', async () => {
    await i18n.changeLanguage('ar')
    const forgotHtmlAr = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    )
    expect(forgotHtmlAr).toContain('استعادة كلمة المرور')
    expect(forgotHtmlAr).toContain('data-testid="forgot-email-input"')
    expect(forgotHtmlAr).toContain('data-testid="forgot-submit-btn"')

    await i18n.changeLanguage('en')
    const resetHtmlEn = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/reset-password?token=sample-token']}>
        <ResetPasswordPage />
      </MemoryRouter>
    )
    expect(resetHtmlEn).toContain('Set New Password')

    const registerHtmlEn = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>
    )
    expect(registerHtmlEn).toContain('Create New Account')
  })

  it('renders AppLayout with independent vertical scroll containers for sidebar and main content in Arabic (RTL) and English (LTR)', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await i18n.changeLanguage('ar')
    const layoutAr = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AuthProvider>
            <AppLayout />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(layoutAr).toContain('data-testid="app-layout-root"')
    expect(layoutAr).toContain('h-screen h-[100dvh] overflow-hidden')
    expect(layoutAr).toContain('data-testid="app-sidebar"')
    expect(layoutAr).toContain('right-0')
    expect(layoutAr).toContain('data-testid="app-sidebar-nav"')
    expect(layoutAr).toContain('flex-1 min-h-0 p-3 space-y-1 overflow-y-auto overflow-x-hidden overscroll-contain sidebar-scroll')
    expect(layoutAr).toContain('data-testid="app-main-column"')
    expect(layoutAr).toContain('data-testid="app-main-scroll"')
    expect(layoutAr).toContain('flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain')
    expect(layoutAr).toContain('بنيان')

    await i18n.changeLanguage('en')
    const layoutEn = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AuthProvider>
            <AppLayout />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(layoutEn).toContain('left-0')
    expect(layoutEn).toContain('BUNYAN')
  })
})
