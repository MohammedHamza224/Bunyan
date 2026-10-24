import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Users,
  MapPin,
  Package,
  ClipboardList,
  FileText,
  Receipt,
  CreditCard,
  BarChart3,
  Settings,
  ShieldCheck,
  LogOut,
  Globe,
  Menu,
  X,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useAuth } from '../../store/authStore'
import { api } from '../../lib/api'
import { HeaderCurrentDate } from './HeaderCurrentDate'

export function AppLayout() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const { data: orgSettings } = useQuery({
    queryKey: ['orgSettings'],
    queryFn: async () => {
      const res = await api.get('/organizations/settings')
      return res.data?.data || res.data
    },
  })

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(nextLang)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isAr = i18n.language === 'ar'
  const displayOrgName = isAr
    ? orgSettings?.businessName || 'مؤسسة غير مسماة (الإعداد الأولي)'
    : orgSettings?.businessNameEn || orgSettings?.businessName || 'Unconfigured Organization'

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/clients', icon: Users, label: t('nav.clients') },
    { to: '/sites', icon: MapPin, label: t('nav.sites') },
    { to: '/work-items', icon: Package, label: t('nav.workItems') },
    { to: '/work-entries', icon: ClipboardList, label: t('nav.workEntries') },
    { to: '/statements', icon: FileText, label: t('nav.statements') },
    { to: '/invoices', icon: Receipt, label: t('nav.invoices') },
    { to: '/payments', icon: CreditCard, label: t('nav.payments') },
    {
      to: '/reports',
      icon: BarChart3,
      label: isAr ? 'التقارير وكشوف الحساب' : 'Reports & Analytics',
    },
    { to: '/audit-logs', icon: ShieldCheck, label: isAr ? 'سجل التدقيق' : 'Audit Logs' },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ]

  const currentNav = navItems.find(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  )

  return (
    <div
      data-testid="app-layout-root"
      className="h-screen h-[100dvh] overflow-hidden bg-[#F5F7FA] flex print:h-auto print:min-h-0 print:overflow-visible print:bg-white print:block"
    >
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[#102437]/60 backdrop-blur-[1px] z-20 lg:hidden print:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — Deep Navy Construction Identity (Independently Scrollable) */}
      <aside
        data-testid="app-sidebar"
        className={`fixed lg:static inset-y-0 ${
          isAr ? 'right-0' : 'left-0'
        } z-30 h-full max-h-screen max-h-[100dvh] min-h-0 shrink-0 overflow-hidden ${
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
        } w-64 bg-[#102437] text-white border-e border-[#18324B] flex flex-col transition-all duration-200 print:hidden ${
          sidebarOpen
            ? 'translate-x-0'
            : isAr
            ? 'translate-x-full lg:translate-x-0'
            : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Construction Amber Accent Strip */}
        <div className="h-1 w-full bg-[#E6A23C] shrink-0" />

        {/* Organization Header */}
        <div className="h-16 px-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {orgSettings?.logoUrl ? (
              <img
                src={orgSettings.logoUrl}
                alt="Logo"
                className="w-9 h-9 rounded-lg object-contain border border-white/20 bg-white shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[#18324B] border border-[#E6A23C]/50 text-[#E6A23C] flex items-center justify-center shrink-0 shadow-sm">
                <Building2 className="w-5 h-5" />
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="truncate">
                <p
                  className="text-sm font-bold text-white truncate"
                  data-testid="org-header-name"
                >
                  {displayOrgName}
                </p>
                <p className="text-[11px] text-[#E6A23C] font-medium truncate">
                  {isAr ? 'بنيان' : 'BUNYAN'}
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 text-gray-300 hover:bg-white/10 rounded-lg"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links — Independently Scrollable */}
        <nav
          data-testid="app-sidebar-nav"
          className="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto overflow-x-hidden overscroll-contain sidebar-scroll"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#18324B] text-white shadow-sm ring-1 ring-[#E6A23C]/40'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  } ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        className={`absolute inset-y-2 w-1 rounded-full bg-[#E6A23C] ${
                          isAr ? 'right-0' : 'left-0'
                        }`}
                      />
                    )}
                    <Icon
                      className={`w-5 h-5 shrink-0 ${
                        isActive ? 'text-[#E6A23C]' : 'text-gray-400'
                      }`}
                    />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
          {!sidebarCollapsed && (
            <div className="px-3 py-2.5 rounded-xl bg-[#18324B]/80 border border-white/10">
              <p className="text-sm font-semibold text-white truncate">
                {isAr ? user?.nameAr : user?.nameEn || user?.nameAr}
              </p>
              <p className="text-xs text-gray-300 truncate">{user?.email}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title={sidebarCollapsed ? t('nav.logout') : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/15 hover:text-red-200 transition-colors ${
              sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>{t('nav.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div
        data-testid="app-main-column"
        className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden print:h-auto print:overflow-visible print:block"
      >
        {/* Topbar */}
        <header className="h-16 shrink-0 bg-white border-b border-[#E4E7EC] px-4 lg:px-8 flex items-center justify-between z-10 print:hidden shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-[#1F2937] hover:bg-[#EAF0F5] rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="hidden lg:flex p-2 text-[#667085] hover:text-[#18324B] hover:bg-[#EAF0F5] rounded-lg transition-colors"
              aria-label="Toggle sidebar width"
              title={isAr ? 'طي / توسيع القائمة الجانبية' : 'Collapse / Expand Sidebar'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-5 h-5" />
              ) : (
                <PanelLeftClose className="w-5 h-5" />
              )}
            </button>

            {currentNav && (
              <div className="hidden sm:flex items-center gap-2 text-sm font-bold text-[#18324B]">
                <span className="w-1.5 h-4 rounded-full bg-[#E6A23C]" />
                <span>{currentNav.label}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <HeaderCurrentDate />
            <button
              type="button"
              onClick={toggleLanguage}
              data-testid="lang-toggle-btn"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[#E4E7EC] bg-white text-sm font-semibold text-[#1F2937] hover:bg-[#EAF0F5] transition-colors shadow-xs"
            >
              <Globe className="w-4 h-4 text-[#18324B]" />
              <span>{isAr ? 'English' : 'العربية'}</span>
            </button>
          </div>
        </header>

        {/* Page Outlet — Independently Scrollable */}
        <main
          data-testid="app-main-scroll"
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain print:overflow-visible print:h-auto"
        >
          <div className="p-4 lg:p-8 max-w-7xl w-full mx-auto print:p-0 print:max-w-none print:m-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
