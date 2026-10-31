import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  MapPin,
  Clock,
  CheckCircle2,
  FileText,
  Receipt,
  Wallet,
  AlertTriangle,
  Settings,
  BarChart3,
  RefreshCw,
  Calendar,
  TrendingUp,
  CreditCard,
  AlertCircle,
  ClipboardList,
  ArrowUpRight,
  Building2,
  ChevronRight,
  PieChart as PieChartIcon,
} from 'lucide-react'
import { api } from '../../lib/api'
import { DashboardCharts } from './DashboardCharts'
import {
  formatCurrency,
  getCurrencySymbol,
  formatDate,
  formatNumber,
  formatCount,
  formatPercent,
} from '../../lib/utils'

type PeriodPreset =
  | 'all'
  | 'today'
  | 'last7days'
  | 'currentMonth'
  | 'previousMonth'
  | 'currentYear'
  | 'custom'

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [period, setPeriod] = useState<PeriodPreset>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedCurrency, setSelectedCurrency] = useState<string>('')

  const { data: orgSettings } = useQuery({
    queryKey: ['orgSettings'],
    queryFn: async () => {
      const res = await api.get('/organizations/settings')
      return res.data?.data || res.data
    },
  })

  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', period, dateFrom, dateTo, selectedCurrency],
    queryFn: async () => {
      const params: Record<string, string> = { period }
      if (period === 'custom') {
        if (dateFrom) params.dateFrom = dateFrom
        if (dateTo) params.dateTo = dateTo
      }
      if (selectedCurrency) {
        params.currency = selectedCurrency
      }
      const res = await api.get('/dashboard', { params })
      return res.data?.data || res.data
    },
  })

  const currency = stats?.currency || orgSettings?.defaultCurrency || 'SAR'

  // Centralized currency formatting guaranteeing Western digits (0–9) in both Arabic and English
  const formatMoney = (val: number | string | undefined, curr = currency) => {
    return formatCurrency(val, isAr ? 'ar-SA' : 'en-US', curr)
  }

  // Integer and item count formatter with Western digits (0–9) and grouping
  const formatItemCount = (val: number | string | undefined) => {
    return formatCount(val, isAr ? 'ar-SA' : 'en-US')
  }

  const periodOptions: { key: PeriodPreset; labelAr: string; labelEn: string }[] = [
    { key: 'all', labelAr: 'كل الفترات', labelEn: 'All Time' },
    { key: 'today', labelAr: 'اليوم', labelEn: 'Today' },
    { key: 'last7days', labelAr: 'آخر 7 أيام', labelEn: 'Last 7 Days' },
    { key: 'currentMonth', labelAr: 'الشهر الحالي', labelEn: 'Current Month' },
    { key: 'previousMonth', labelAr: 'الشهر السابق', labelEn: 'Previous Month' },
    { key: 'currentYear', labelAr: 'السنة الحالية', labelEn: 'Current Year' },
    { key: 'custom', labelAr: 'فترة مخصصة', labelEn: 'Custom Range' },
  ]

  if (isLoading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3" data-testid="dashboard-loading">
        <div className="w-9 h-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">
          {isAr ? 'جاري تحميل مؤشرات لوحة المعلومات...' : 'Loading dashboard analytics...'}
        </p>
      </div>
    )
  }

  if (isError || !stats) {
    return (
      <div
        className="p-8 bg-red-50 border border-red-200 rounded-xl flex flex-col items-center justify-center text-center gap-3"
        data-testid="dashboard-error"
      >
        <AlertCircle className="w-10 h-10 text-red-600" />
        <h2 className="text-base font-bold text-red-900">
          {isAr ? 'تعذر تحميل بيانات لوحة المعلومات' : 'Failed to load dashboard data'}
        </h2>
        <p className="text-xs text-red-700 max-w-md">
          {(error as any)?.response?.data?.error?.message ||
            (isAr
              ? 'حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى لعدم عرض بيانات غير دقيقة.'
              : 'An error occurred while communicating with the server. Please retry.')}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
        </button>
      </div>
    )
  }

  const isOrgUnconfigured = !orgSettings?.businessName

  const periodQuery =
    period !== 'all'
      ? `&period=${period}${period === 'custom' && dateFrom ? `&dateFrom=${dateFrom}` : ''}${
          period === 'custom' && dateTo ? `&dateTo=${dateTo}` : ''
        }`
      : ''

  const financialCards = [
    {
      id: 'gross-invoices',
      label: isAr ? 'إجمالي قيمة الفواتير المصدرة (Gross)' : 'Gross Issued Invoices Value',
      value: formatMoney(stats.grossInvoiceValue),
      subtext: isAr
        ? `${formatItemCount(stats.totalInvoices)} فاتورة معتمدة`
        : `${formatItemCount(stats.totalInvoices)} approved invoices`,
      to: `/reports?tab=invoices${periodQuery}`,
      icon: Receipt,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      id: 'net-invoices',
      label: isAr ? 'صافي قيمة الفواتير بعد الإشعارات (Net)' : 'Net Invoices Value (After Notes)',
      value: formatMoney(stats.netInvoiceValue),
      subtext:
        stats.taxableSubtotal !== undefined && stats.vatAmount !== undefined
          ? isAr
            ? `قبل الضريبة: ${formatMoney(stats.taxableSubtotal)} | ض.ق.م (15%): ${formatMoney(stats.vatAmount)}`
            : `Pre-Tax: ${formatMoney(stats.taxableSubtotal)} | VAT (15%): ${formatMoney(stats.vatAmount)}`
          : Number(stats.creditNotesTotal) > 0 || Number(stats.debitNotesTotal) > 0
          ? isAr
            ? `إشعارات دائنة: ${formatMoney(stats.creditNotesTotal)} | مدينة: ${formatMoney(stats.debitNotesTotal)}`
            : `CN: ${formatMoney(stats.creditNotesTotal)} | DN: ${formatMoney(stats.debitNotesTotal)}`
          : isAr
          ? 'لا توجد إشعارات تعديل في الفترة'
          : 'No credit/debit notes in period',
      to: `/reports?tab=invoices${periodQuery}`,
      icon: TrendingUp,
      color: 'text-indigo-600 bg-indigo-50',
    },
    {
      id: 'total-collected',
      label: isAr ? 'إجمالي المدفوعات المحصلة الفعلية' : 'Total Actual Collections',
      value: formatMoney(stats.totalCollected),
      subtext: isAr ? 'الدفعات النشطة فقط (بدون الملغاة)' : 'Active payments only',
      to: `/reports?tab=collections${periodQuery}`,
      icon: Wallet,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      id: 'total-outstanding',
      label: isAr ? 'إجمالي الذمم المدينة المستحقة' : 'Total Outstanding Receivables',
      value: formatMoney(stats.totalOutstanding),
      subtext: isAr
        ? `غير مسددة: ${formatItemCount(stats.unpaidInvoicesCount)} | مسددة جزئياً: ${formatItemCount(stats.partiallyPaidInvoicesCount)}`
        : `Unpaid: ${formatItemCount(stats.unpaidInvoicesCount)} | Partial: ${formatItemCount(stats.partiallyPaidInvoicesCount)}`,
      to: `/reports?tab=receivables`,
      icon: CreditCard,
      color: 'text-rose-600 bg-rose-50',
    },
    {
      id: 'overdue-invoices',
      label: isAr ? 'الفواتير المتأخرة عن الاستحقاق' : 'Overdue Invoices',
      value: formatMoney(stats.overdueAmount),
      subtext: isAr
        ? `${formatItemCount(stats.overdueInvoicesCount)} فاتورة متأخرة`
        : `${formatItemCount(stats.overdueInvoicesCount)} overdue invoices`,
      to: `/reports?tab=aging`,
      icon: AlertTriangle,
      color: 'text-red-600 bg-red-50',
    },
    {
      id: 'unbilled-works',
      label: isAr ? 'أعمال معتمدة غير مفوترة' : 'Approved Unbilled Work Value',
      value: formatMoney(stats.approvedUnbilledValue),
      subtext: isAr ? 'جاهزة للإدراج في مستخلص أو فاتورة' : 'Ready for statement or billing',
      to: `/reports?tab=work-entries&status=APPROVED`,
      icon: CheckCircle2,
      color: 'text-teal-600 bg-teal-50',
    },
    {
      id: 'approved-statements',
      label: isAr ? 'المستخلصات المعتمدة' : 'Approved Statements',
      value: formatMoney(stats.totalStatementsValue),
      subtext: isAr
        ? `${formatItemCount(stats.totalStatements)} مستخلص معتمد/مفوتر`
        : `${formatItemCount(stats.totalStatements)} approved statements`,
      to: `/reports?tab=statements${periodQuery}`,
      icon: FileText,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      id: 'pending-approvals',
      label: isAr ? 'أعمال بانتظار الاعتماد' : 'Works Pending Approval',
      value: formatItemCount(stats.pendingApprovalCount),
      subtext: isAr
        ? `العملاء النشطون: ${formatItemCount(stats.clientCount)} | المواقع النشطة: ${formatItemCount(stats.activeSiteCount)}`
        : `Active Clients: ${formatItemCount(stats.clientCount)} | Active Sites: ${formatItemCount(stats.activeSiteCount)}`,
      to: `/reports?tab=work-entries&status=PENDING_APPROVAL`,
      icon: Clock,
      color: 'text-amber-600 bg-amber-50',
    },
  ]

  const operationalSummaryCards = [
    {
      label: t('dashboard.clientCount'),
      value: formatItemCount(stats.clientCount),
      to: '/clients',
      icon: Users,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: t('dashboard.activeSites'),
      value: formatItemCount(stats.activeSiteCount),
      to: '/sites',
      icon: MapPin,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: isAr ? 'فواتير غير مسددة' : 'Unpaid Invoices',
      value: formatItemCount(stats.unpaidInvoicesCount),
      to: '/reports?tab=invoices&paymentStatus=UNPAID',
      icon: Receipt,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      label: isAr ? 'فواتير مسددة جزئياً' : 'Partially Paid Invoices',
      value: formatItemCount(stats.partiallyPaidInvoicesCount),
      to: '/reports?tab=invoices&paymentStatus=PARTIALLY_PAID',
      icon: CreditCard,
      color: 'text-cyan-600 bg-cyan-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Construction Executive Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[#102437] text-white p-5 sm:p-6 shadow-card border border-[#18324B]">
        <img
          src="/assets/construction-hero.jpg"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-20 pointer-events-none"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(16, 36, 55, 0.95) 0%, rgba(24, 50, 75, 0.85) 60%, rgba(16, 36, 55, 0.92) 100%)',
          }}
        />
        <div className="absolute top-0 inset-x-0 h-1 bg-[#E6A23C]" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#E6A23C] mb-1">
              <span>
                {isAr
                  ? 'مركز التحكم المالي والتشغيلي للمشاريع'
                  : 'Construction Operations & Financial Control Center'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">{t('dashboard.title')}</h1>
            <p className="text-xs text-gray-300 mt-1">
              {isAr
                ? 'ملخص مالي وتشغيلي مباشر مبني على البيانات الفعلية المعتمدة في النظام'
                : 'Live financial and operational overview based on verified system data'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/reports"
              data-testid="goto-reports-btn"
              className="px-4 py-2.5 rounded-xl bg-[#E6A23C] hover:bg-[#B97816] text-[#102437] font-bold text-xs flex items-center gap-2 shadow-sm transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              <span>
                {isAr ? 'التقارير المالية وكشوف الحساب' : 'Financial Reports & Statements'}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Period Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 me-1">
            <Calendar className="w-4 h-4 text-blue-600" />
            {isAr ? 'الفترة الزمنية:' : 'Period:'}
          </span>
          {periodOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              data-testid={`period-btn-${opt.key}`}
              onClick={() => setPeriod(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === opt.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isAr ? opt.labelAr : opt.labelEn}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="dashboard-date-from"
                className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg"
              />
              <span className="text-xs text-gray-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="dashboard-date-to"
                className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg"
              />
            </div>
          )}

          {stats.availableCurrencies && stats.availableCurrencies.length > 1 && (
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              data-testid="dashboard-currency-select"
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white font-medium text-gray-700"
            >
              {stats.availableCurrencies.map((curr: string) => (
                <option key={curr} value={curr}>
                  {isAr ? `العملة: ${curr}` : `Currency: ${curr}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Multi-currency notice if applicable */}
      {stats.hasMultipleCurrencies && stats.currencyBreakdown?.length > 1 && (
        <div
          className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-900"
          data-testid="multi-currency-banner"
        >
          <div className="font-medium">
            {isAr
              ? `ملاحظة: توجد عمليات بعملات متعددة. الأرقام المعروضة أدناه خاصة بعملة (${getCurrencySymbol(currency, true)}) فقط دون خلط العملات.`
              : `Note: Multiple currencies detected. Figures shown below are strictly for (${currency}) without mixing currencies.`}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {stats.currencyBreakdown.map((cb: any) => (
              <button
                key={cb.currency}
                type="button"
                onClick={() => setSelectedCurrency(cb.currency)}
                className={`px-2.5 py-1 rounded-md font-semibold border ${
                  cb.currency === currency
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-blue-700 border-blue-300'
                }`}
              >
                {getCurrencySymbol(cb.currency, isAr)}: {formatMoney(cb.netInvoiceValue, cb.currency)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Initial Setup Banner when business identity is not yet configured */}
      {isOrgUnconfigured && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                {isAr ? 'استكمال إعداد بيانات المؤسسة' : 'Complete Organization Setup'}
              </h2>
              <p className="text-xs text-amber-700 mt-0.5">
                {isAr
                  ? 'لم يتم إدخال الاسم التجاري وبيانات المؤسسة الرسمية بعد. يمكنك إضافتها في أي وقت من صفحة الإعدادات.'
                  : 'Official business name and organization details have not been configured yet. You can set them in Settings.'}
              </p>
            </div>
          </div>
          <Link
            to="/settings"
            className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 transition-colors"
          >
            {t('nav.settings')}
          </Link>
        </div>
      )}

      {/* Primary Financial & Operational KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="dashboard-kpi-grid">
        {financialCards.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.id}
              to={card.to}
              data-testid={`kpi-card-${card.id}`}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-gray-500">{card.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-2">{card.value}</p>
                </div>
                <div className={`p-2.5 rounded-lg shrink-0 ${card.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                <span className="truncate">{card.subtext}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 shrink-0" />
              </div>
            </Link>
          )
        })}
      </div>

      {/* Quick Counts Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {operationalSummaryCards.map((c, idx) => {
          const Icon = c.icon
          return (
            <Link
              key={idx}
              to={c.to}
              className="bg-white px-4 py-3.5 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 flex items-center justify-between transition-all"
            >
              <div>
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{c.value}</p>
              </div>
              <div className={`p-2 rounded-lg ${c.color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </Link>
          )
        })}
      </div>

      {/* Operational Lists Grid: Pending Approval & Approved Unbilled Works */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Work Entries Pending Approval */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-gray-900">
                {isAr ? 'بنود أعمال بانتظار الاعتماد' : 'Work Entries Pending Approval'}
              </h2>
            </div>
            <Link
              to="/work-entries"
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              {isAr ? 'عرض الكل' : 'View All'}
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {!stats.pendingApprovalEntries || stats.pendingApprovalEntries.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">
                {isAr ? 'لا توجد بنود أعمال معلقة بانتظار الاعتماد' : 'No work entries pending approval'}
              </p>
            ) : (
              stats.pendingApprovalEntries.map((we: any) => (
                <Link
                  key={we.id}
                  to={`/work-entries/${we.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-xs transition-colors"
                >
                  <div>
                    <span className="font-mono font-semibold text-blue-600">{we.referenceNo}</span>
                    <span className="mx-1.5 text-gray-400">•</span>
                    <span className="font-medium text-gray-900">{we.itemNameAr}</span>
                    <p className="text-gray-500 mt-0.5">
                      {we.client?.nameAr} — {we.site?.nameAr}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold text-gray-900">{formatMoney(we.totalAmount)}</p>
                    <p className="text-gray-400">
                      {formatDate(we.workDate, isAr ? 'ar-SA' : 'en-US')}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Approved Unbilled Work Entries */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-bold text-gray-900">
                {isAr ? 'أعمال معتمدة غير مفوترة بالكامل' : 'Approved Unbilled Work Entries'}
              </h2>
            </div>
            <Link
              to="/reports?tab=work-entries&status=APPROVED"
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              {isAr ? 'تقرير الأعمال' : 'Works Report'}
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {!stats.unbilledWorkEntries || stats.unbilledWorkEntries.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">
                {isAr ? 'جميع الأعمال المعتمدة تمت فوترتها' : 'All approved work entries are billed'}
              </p>
            ) : (
              stats.unbilledWorkEntries.map((we: any) => (
                <Link
                  key={we.id}
                  to={`/work-entries/${we.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-xs transition-colors"
                >
                  <div>
                    <span className="font-mono font-semibold text-blue-600">{we.referenceNo}</span>
                    <span className="mx-1.5 text-gray-400">•</span>
                    <span className="font-medium text-gray-900">{we.itemNameAr}</span>
                    <p className="text-gray-500 mt-0.5">
                      {we.client?.nameAr} — {we.site?.nameAr}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold text-teal-700">{formatMoney(we.unbilledAmount)}</p>
                    <p className="text-gray-400">
                      {isAr
                        ? `المتبقي: ${formatNumber(we.unbilledQuantity, 'ar-SA')}`
                        : `Rem: ${formatNumber(we.unbilledQuantity, 'en-US')}`}{' '}
                      {we.unit}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Invoices & Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-gray-900">
                {isAr ? 'أحدث الفواتير' : 'Recent Invoices'}
              </h2>
            </div>
            <Link to="/invoices" className="text-xs text-blue-600 hover:underline font-medium">
              {isAr ? 'كل الفواتير' : 'All Invoices'}
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {!stats.recentInvoices || stats.recentInvoices.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">
                {isAr ? 'لا توجد فواتير مسجلة' : 'No invoices recorded'}
              </p>
            ) : (
              stats.recentInvoices.map((inv: any) => (
                <Link
                  key={inv.id}
                  to={`/invoices/${inv.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-xs transition-colors"
                >
                  <div>
                    <span className="font-mono font-semibold text-blue-600">{inv.referenceNo}</span>
                    <span className="mx-1.5 text-gray-400">•</span>
                    <span className="font-medium text-gray-900">{inv.client?.nameAr}</span>
                    <p className="text-gray-400 mt-0.5">{inv.status} / {inv.paymentStatus}</p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold text-gray-900">{formatMoney(inv.totalAmount)}</p>
                    <p className="text-rose-600">
                      {isAr ? 'المتبقي: ' : 'Due: '}
                      {formatMoney(inv.remainingAmount)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-gray-900">
                {isAr ? 'أحدث المدفوعات المحصلة' : 'Recent Collections'}
              </h2>
            </div>
            <Link to="/payments" className="text-xs text-blue-600 hover:underline font-medium">
              {isAr ? 'كل المدفوعات' : 'All Payments'}
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {!stats.recentPayments || stats.recentPayments.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">
                {isAr ? 'لا توجد مدفوعات مسجلة' : 'No payments recorded'}
              </p>
            ) : (
              stats.recentPayments.map((pay: any) => (
                <div
                  key={pay.id}
                  className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-xs"
                >
                  <div>
                    <span className="font-medium text-gray-900">{pay.client?.nameAr}</span>
                    <span className="mx-1.5 text-gray-400">•</span>
                    <span className="font-mono text-blue-600">{pay.invoice?.referenceNo}</span>
                    <p className="text-gray-400 mt-0.5">{pay.method}</p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold text-emerald-700">{formatMoney(pay.amount)}</p>
                    <p className="text-gray-400">
                      {formatDate(pay.paymentDate, isAr ? 'ar-SA' : 'en-US')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Statements & Recent Work Entries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Statements */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-bold text-gray-900">
                {isAr ? 'أحدث المستخلصات' : 'Recent Statements'}
              </h2>
            </div>
            <Link to="/statements" className="text-xs text-blue-600 hover:underline font-medium">
              {isAr ? 'كل المستخلصات' : 'All Statements'}
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {!stats.recentStatements || stats.recentStatements.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">
                {isAr ? 'لا توجد مستخلصات مسجلة' : 'No statements recorded'}
              </p>
            ) : (
              stats.recentStatements.map((stm: any) => (
                <Link
                  key={stm.id}
                  to={`/statements/${stm.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-xs transition-colors"
                >
                  <div>
                    <span className="font-mono font-semibold text-blue-600">{stm.referenceNo}</span>
                    <span className="mx-1.5 text-gray-400">•</span>
                    <span className="font-medium text-gray-900">{stm.client?.nameAr}</span>
                    <p className="text-gray-400 mt-0.5">{stm.status}</p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold text-gray-900">{formatMoney(stm.totalAmount)}</p>
                    <p className="text-gray-400">
                      {formatDate(stm.issueDate, isAr ? 'ar-SA' : 'en-US')}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Work Entries */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-gray-900">
                {isAr ? 'أحدث الأعمال المسجلة' : 'Recent Work Entries'}
              </h2>
            </div>
            <Link to="/work-entries" className="text-xs text-blue-600 hover:underline font-medium">
              {isAr ? 'كل الأعمال' : 'All Work Entries'}
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {!stats.recentWorkEntries || stats.recentWorkEntries.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">
                {isAr ? 'لا توجد أعمال مسجلة' : 'No work entries recorded'}
              </p>
            ) : (
              stats.recentWorkEntries.map((we: any) => (
                <Link
                  key={we.id}
                  to={`/work-entries/${we.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-xs transition-colors"
                >
                  <div>
                    <span className="font-mono font-semibold text-blue-600">{we.referenceNo}</span>
                    <span className="mx-1.5 text-gray-400">•</span>
                    <span className="font-medium text-gray-900">{we.itemNameAr}</span>
                    <p className="text-gray-400 mt-0.5">
                      {we.client?.nameAr} — {we.site?.nameAr} ({we.status})
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold text-gray-900">{formatMoney(we.totalAmount)}</p>
                    <p className="text-gray-400">
                      {formatDate(we.workDate, isAr ? 'ar-SA' : 'en-US')}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =========================================================
          EXECUTIVE BUSINESS ANALYTICS & CHARTS
          ========================================================= */}
      <DashboardCharts
        stats={stats}
        currency={currency}
        isAr={isAr}
        periodQuery={periodQuery}
      />

        {/* Row 4: Project Insights & Site Execution Table */}
        {stats.projectInsights && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  {isAr ? 'حالة المشاريع ومتابعة التنفيذ' : 'Project Insights & Execution Performance'}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {isAr ? 'النشطة: ' : 'Active: '}
                  <strong className="text-emerald-700 font-mono">{formatItemCount(stats.projectInsights.activeProjects)}</strong>
                  <span className="mx-1">/</span>
                  {isAr ? 'الإجمالي: ' : 'Total: '}
                  <strong className="text-gray-900 font-mono">{formatItemCount(stats.projectInsights.totalProjects)}</strong>
                </span>
                <Link to="/sites" className="text-xs text-blue-600 hover:underline font-medium">
                  {isAr ? 'كل المشاريع' : 'All Sites'}
                </Link>
              </div>
            </div>

            {!stats.projectInsights.projectsList || stats.projectInsights.projectsList.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-8">
                {isAr ? 'لا توجد مشاريع مضافة حتى الآن' : 'No projects recorded yet'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] print:min-w-0 text-xs text-start">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-4 text-start font-semibold">{isAr ? 'المشروع' : 'Project / Site'}</th>
                      <th className="py-2.5 px-4 text-start font-semibold">{isAr ? 'العميل' : 'Client'}</th>
                      <th className="py-2.5 px-4 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                      <th className="py-2.5 px-4 text-end font-semibold">{isAr ? 'الأعمال غير المفوترة' : 'Unbilled Works'}</th>
                      <th className="py-2.5 px-4 text-end font-semibold">{isAr ? 'الإجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.projectInsights.projectsList.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-gray-900">
                          {isAr ? p.nameAr : p.nameEn || p.nameAr}
                        </td>
                        <td className="py-2.5 px-4 text-gray-600">
                          {isAr ? p.clientNameAr : p.clientNameEn || p.clientNameAr}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              p.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}
                          >
                            {p.status === 'ACTIVE'
                              ? isAr
                                ? 'نشط'
                                : 'Active'
                              : isAr
                              ? 'مكتمل / متوقف'
                              : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-end">
                          <span className="font-mono font-bold text-gray-900">
                            {formatMoney(p.unbilledAmount)}
                          </span>
                          {p.unbilledWorkCount > 0 && (
                            <span className="text-[10px] text-gray-400 block">
                              ({formatItemCount(p.unbilledWorkCount)} {isAr ? 'بند' : 'items'})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-end">
                          <Link
                            to={`/sites/${p.id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-[11px]"
                          >
                            <span>{isAr ? 'تفاصيل' : 'View'}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
    </div>
  )
}
