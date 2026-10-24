import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, CheckCircle2, ShieldCheck, FileCheck2, BarChart3, Building2 } from 'lucide-react'

interface AuthSplitLayoutProps {
  children: ReactNode
  langToggleTestId?: string
}

/**
 * Original geometric structural brand mark inspired by architectural columns & building plans.
 * Does not imitate any third-party trademark; designed specifically for BUNYAN (بنيان).
 */
export function BunyanGeometricMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Base datum line */}
      <path d="M4 27H28" stroke="#E6A23C" strokeWidth="2.2" strokeLinecap="round" />
      {/* Left structural tower */}
      <path
        d="M7 27V12L14 8V27"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Right taller structural tower */}
      <path
        d="M16 27V6L25 10.5V27"
        stroke="#E6A23C"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Internal engineering cross-bracing */}
      <path
        d="M16 13H25M16 19H25M7 18H14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
    </svg>
  )
}

export function AuthSplitLayout({
  children,
  langToggleTestId = 'login-lang-toggle',
}: AuthSplitLayoutProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const toggleLanguage = () => {
    i18n.changeLanguage(isAr ? 'en' : 'ar')
  }

  const capabilities = isAr
    ? [
        { icon: Building2, text: 'تنظيم المشاريع والمواقع وبنود الأعمال المعتمدة' },
        { icon: FileCheck2, text: 'إصدار المستخلصات والفواتير الضريبية والمدفوعات' },
        { icon: ShieldCheck, text: 'توافق مع متطلبات الفوترة الإلكترونية (ZATCA)' },
        { icon: BarChart3, text: 'كشوف حساب العملاء وتقارير أعمار الديون' },
      ]
    : [
        { icon: Building2, text: 'Projects, Sites & Approved Work Entries' },
        { icon: FileCheck2, text: 'Progress Statements, Tax Invoices & Payments' },
        { icon: ShieldCheck, text: 'ZATCA E-Invoicing & QR Code Compliance' },
        { icon: BarChart3, text: 'Customer Statements & Receivables Aging' },
      ]

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`min-h-screen w-full bg-[#FFFFFF] text-[#1F2937] flex flex-col ${
        isAr ? 'lg:flex-row' : 'lg:flex-row-reverse'
      }`}
    >
      {/* ===================================================================
          RIGHT PANEL (58-60% width on Desktop): Full Construction Visual Experience
          In RTL (lg:flex-row) first child sits on the Right.
          In LTR (lg:flex-row-reverse) first child also sits on the Right.
         =================================================================== */}
      <aside
        data-testid="auth-visual-panel"
        aria-label={isAr ? 'الهوية البصرية لمنصة بنيان' : 'BUNYAN Construction Platform Visual'}
        className="hidden lg:flex lg:w-[58%] xl:w-[60%] relative overflow-hidden bg-[#102437] text-white flex-col justify-between p-10 xl:p-14 2xl:p-16 select-none min-h-screen"
      >
        {/* High-Resolution Construction & Architectural Photograph */}
        <img
          src="/assets/construction-hero.jpg"
          alt={
            isAr
              ? 'مشروع إنشائي حديث ومهندسون يراجعون المخططات الهندسية'
              : 'Modern commercial construction project with engineers reviewing blueprints'
          }
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Refined Deep-Navy Multi-Stop Gradient Overlay (preserves architectural detail & ensures text contrast) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(165deg, rgba(16, 36, 55, 0.88) 0%, rgba(24, 50, 75, 0.62) 45%, rgba(16, 36, 55, 0.94) 100%)',
          }}
        />

        {/* Subtle Architectural Blueprint Grid Overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Fine Engineering Structural Frame & Corner Datum Accents */}
        <div className="absolute inset-6 xl:inset-8 border border-white/10 rounded-2xl pointer-events-none">
          <div className="absolute -top-[1px] inset-x-12 h-[2px] bg-gradient-to-r from-transparent via-[#E6A23C]/70 to-transparent" />
          <div className="absolute top-3 left-3 w-3 h-3 border-t border-l border-[#E6A23C]/50" />
          <div className="absolute top-3 right-3 w-3 h-3 border-t border-r border-[#E6A23C]/50" />
          <div className="absolute bottom-3 left-3 w-3 h-3 border-b border-l border-[#E6A23C]/50" />
          <div className="absolute bottom-3 right-3 w-3 h-3 border-b border-r border-[#E6A23C]/50" />
        </div>

        {/* Top Construction Amber Accent Strip */}
        <div className="absolute top-0 inset-x-0 h-1 bg-[#E6A23C]" />

        {/* Top Row: Prominent Bilingual BUNYAN (بنيان) Brand Placement */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[#18324B]/90 border border-[#E6A23C]/50 text-white flex items-center justify-center shadow-lg backdrop-blur-sm">
              <BunyanGeometricMark className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-2xl font-bold tracking-tight text-white leading-none">
                  بنيان
                </span>
                <span className="text-white/30 font-light text-lg">|</span>
                <span className="text-xl font-bold tracking-[0.14em] text-[#E6A23C] leading-none">
                  BUNYAN
                </span>
              </div>
              <span className="text-xs text-gray-300 font-medium mt-1.5 block">
                {isAr
                  ? 'نظام إدارة أعمال المقاولات والمشاريع الهندسية'
                  : 'Construction & Contracting Management Platform'}
              </span>
            </div>
          </div>

          <div className="hidden xl:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#18324B]/75 border border-white/15 text-xs text-gray-200 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-[#E6A23C]" />
            <span>
              {isAr
                ? 'دقة هندسية • شفافية مالية'
                : 'Engineering Precision • Financial Clarity'}
            </span>
          </div>
        </div>

        {/* Center/Lower Focal Area: Headline, Supporting Copy & Real Platform Capabilities */}
        <div className="relative z-10 my-auto py-8 max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#FFF4DF]/10 border-s-2 border-[#E6A23C] text-[#E6A23C] text-xs font-semibold tracking-wide">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isAr ? 'منصة متكاملة لقطاع المقاولات والتشييد' : 'Enterprise Contracting Operations'}
            </span>
          </div>

          <h2
            data-testid="auth-hero-headline"
            className="text-3xl xl:text-4xl 2xl:text-[2.65rem] font-bold text-white leading-tight tracking-tight"
          >
            {t('auth.heroHeadline')}
          </h2>

          <p
            data-testid="auth-hero-subtitle"
            className="text-base xl:text-lg text-gray-200 leading-relaxed max-w-xl font-normal"
          >
            {t('auth.heroSubtitle')}
          </p>

          {/* Verified Product Capabilities Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            {capabilities.map((item, idx) => {
              const Icon = item.icon
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-[#102437]/75 border border-white/12 backdrop-blur-sm"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#18324B] border border-[#E6A23C]/30 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#E6A23C]" />
                  </div>
                  <span className="text-xs xl:text-[13px] text-gray-100 font-medium leading-snug">
                    {item.text}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom Architectural Footer Bar */}
        <div className="relative z-10 pt-4 border-t border-white/15 flex items-center justify-between text-xs text-gray-300">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-white font-semibold">بنيان</span>
            <span className="text-[#E6A23C]">•</span>
            <span className="tracking-wider font-semibold text-white">BUNYAN</span>
          </div>
          <span>
            {isAr
              ? 'إدارة المشاريع • المستخلصات • الفواتير والمدفوعات'
              : 'Projects • Statements • Invoices & Payments'}
          </span>
        </div>
      </aside>

      {/* ===================================================================
          LEFT PANEL (40-42% width on Desktop): Dedicated Premium Login Area
         =================================================================== */}
      <div
        data-testid="auth-form-panel"
        className="flex-1 lg:w-[42%] xl:w-[40%] min-h-screen flex flex-col justify-between bg-[#F5F7FA] lg:bg-[#FFFFFF] lg:border-e lg:border-[#E4E7EC]"
      >
        {/* Top Header: Compact Mobile Construction Banner (< lg) / Clean Utility Header (lg+) */}
        <header className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-4 lg:py-6 flex items-center justify-between bg-[#102437] lg:bg-transparent text-white lg:text-[#1F2937] border-b border-[#18324B] lg:border-[#E4E7EC]/70 relative">
          {/* Subtle Top Amber Line on Mobile */}
          <div className="absolute top-0 inset-x-0 h-1 bg-[#E6A23C] lg:hidden" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#18324B] border border-[#E6A23C]/50 text-white flex items-center justify-center shadow-sm shrink-0">
              <BunyanGeometricMark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold tracking-tight text-white lg:text-[#18324B] leading-none">
                  بنيان
                </span>
                <span className="text-white/30 lg:text-[#E4E7EC] text-sm">|</span>
                <span className="text-sm font-bold tracking-[0.12em] text-[#E6A23C] lg:text-[#18324B] leading-none">
                  BUNYAN
                </span>
              </div>
              <span className="text-[11px] text-gray-300 lg:text-[#667085] block mt-1">
                {isAr ? 'إدارة أعمال المقاولات برؤية أوضح.' : 'A clearer vision for your contracting business.'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleLanguage}
            data-testid={langToggleTestId}
            aria-label={isAr ? 'Switch language to English' : 'تغيير اللغة إلى العربية'}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/20 lg:border-[#E4E7EC] bg-white/10 lg:bg-[#F5F7FA] text-xs font-semibold text-white lg:text-[#1F2937] hover:bg-white/20 lg:hover:bg-[#EAF0F5] lg:hover:border-[#18324B]/30 focus:outline-none focus:ring-2 focus:ring-[#18324B] transition-colors shrink-0"
          >
            <Globe className="w-3.5 h-3.5 text-[#E6A23C] lg:text-[#18324B]" />
            <span>{isAr ? 'English' : 'العربية'}</span>
          </button>
        </header>

        {/* Main Vertically Centered Form Area */}
        <main className="flex-1 flex flex-col justify-center py-8 px-5 sm:px-8 lg:px-10 xl:px-14">
          <div className="w-full max-w-[420px] mx-auto bg-[#FFFFFF] lg:bg-transparent p-6 sm:p-8 lg:p-0 rounded-2xl lg:rounded-none border border-[#E4E7EC] lg:border-0 shadow-card lg:shadow-none">
            {children}
          </div>
        </main>

        {/* Clean Minimal Footer */}
        <footer className="py-4 px-6 lg:px-10 xl:px-12 border-t border-[#E4E7EC]/70 text-center lg:text-start flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#667085]">
          <span>
            {isAr
              ? 'منصة بنيان لإدارة المقاولات والمشاريع والشؤون المالية'
              : 'BUNYAN — Construction Project & Financial Management'}
          </span>
          <span className="font-mono text-[11px] text-[#667085]/80">BUNYAN • بنيان</span>
        </footer>
      </div>
    </div>
  )
}
