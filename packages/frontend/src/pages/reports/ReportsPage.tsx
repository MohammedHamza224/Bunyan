import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Receipt,
  FileText,
  ClipboardList,
  Wallet,
  CreditCard,
  Users,
  MapPin,
  Clock,
  Printer,
  Download,
  RotateCcw,
  Search,
  AlertCircle,
  RefreshCw,
  Building2,
} from 'lucide-react'
import { api } from '../../lib/api'

type ReportTab =
  | 'invoices'
  | 'statements'
  | 'work-entries'
  | 'collections'
  | 'receivables'
  | 'customer-statement'
  | 'sites'
  | 'aging'

export function ReportsPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = (searchParams.get('tab') as ReportTab) || 'invoices'
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab)

  // Filters state
  const [period, setPeriod] = useState<string>(searchParams.get('period') || 'all')
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('dateFrom') || '')
  const [dateTo, setDateTo] = useState<string>(searchParams.get('dateTo') || '')
  const [clientId, setClientId] = useState<string>(searchParams.get('clientId') || '')
  const [siteId, setSiteId] = useState<string>(searchParams.get('siteId') || '')
  const [status, setStatus] = useState<string>(searchParams.get('status') || '')
  const [invoiceType, setInvoiceType] = useState<string>(searchParams.get('invoiceType') || '')
  const [paymentStatus, setPaymentStatus] = useState<string>(searchParams.get('paymentStatus') || '')
  const [method, setMethod] = useState<string>(searchParams.get('method') || '')
  const [transactionType, setTransactionType] = useState<string>(
    searchParams.get('transactionType') || ''
  )
  const [bucket, setBucket] = useState<string>(searchParams.get('bucket') || '')
  const [currency, setCurrency] = useState<string>(searchParams.get('currency') || '')
  const [search, setSearch] = useState<string>(searchParams.get('search') || '')
  const [overdueOnly, setOverdueOnly] = useState<boolean>(searchParams.get('overdueOnly') === 'true')
  const [includeCancelled, setIncludeCancelled] = useState<boolean>(
    searchParams.get('includeCancelled') !== 'false'
  )
  const [sortBy, setSortBy] = useState<string>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState<number>(1)
  const [limit] = useState<number>(50)
  const [exporting, setExporting] = useState<boolean>(false)

  useEffect(() => {
    const tabParam = searchParams.get('tab') as ReportTab
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
    const clientParam = searchParams.get('clientId')
    if (clientParam && clientParam !== clientId) {
      setClientId(clientParam)
    }
    const statusParam = searchParams.get('status')
    if (statusParam !== null && statusParam !== status) {
      setStatus(statusParam)
    }
    const payStatusParam = searchParams.get('paymentStatus')
    if (payStatusParam !== null && payStatusParam !== paymentStatus) {
      setPaymentStatus(payStatusParam)
    }
  }, [searchParams])

  const handleTabChange = (tab: ReportTab) => {
    setActiveTab(tab)
    setPage(1)
    setStatus('')
    setPaymentStatus('')
    setInvoiceType('')
    setMethod('')
    setTransactionType('')
    setBucket('')
    setSearchParams({ tab })
  }

  const clearFilters = () => {
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
    if (activeTab !== 'customer-statement') {
      setClientId('')
    }
    setSiteId('')
    setStatus('')
    setInvoiceType('')
    setPaymentStatus('')
    setMethod('')
    setTransactionType('')
    setBucket('')
    setCurrency('')
    setSearch('')
    setOverdueOnly(false)
    setIncludeCancelled(true)
    setSortBy('date')
    setSortOrder('desc')
    setPage(1)
  }

  // Fetch org settings, clients, and sites for filter dropdowns & print header
  const { data: orgSettings } = useQuery({
    queryKey: ['orgSettings'],
    queryFn: async () => {
      const res = await api.get('/organizations/settings')
      return res.data?.data || res.data
    },
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list-all'],
    queryFn: async () => {
      const res = await api.get('/clients', { params: { limit: 100 } })
      return res.data?.data?.items || res.data?.data || []
    },
  })
  const clients: any[] = Array.isArray(clientsData) ? clientsData : []

  // Auto-select first client on Customer Statement tab if none selected
  useEffect(() => {
    if (activeTab === 'customer-statement' && !clientId && clients.length > 0) {
      setClientId(clients[0].id)
    }
  }, [activeTab, clientId, clients])

  const { data: sitesData } = useQuery({
    queryKey: ['sites-list-all', clientId],
    queryFn: async () => {
      const params: Record<string, any> = { limit: 100 }
      if (clientId) params.clientId = clientId
      const res = await api.get('/sites', { params })
      return res.data?.data?.items || res.data?.data || []
    },
  })
  const sites: any[] = Array.isArray(sitesData) ? sitesData : []

  const buildQueryParams = () => {
    const params: Record<string, any> = {
      period,
      page,
      limit,
      sortBy,
      sortOrder,
    }
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (clientId) params.clientId = clientId
    if (siteId) params.siteId = siteId
    if (status) params.status = status
    if (invoiceType) params.invoiceType = invoiceType
    if (paymentStatus) params.paymentStatus = paymentStatus
    if (method) params.method = method
    if (transactionType) params.transactionType = transactionType
    if (bucket) params.bucket = bucket
    if (currency) params.currency = currency
    if (search) params.search = search
    if (overdueOnly) params.overdueOnly = 'true'
    params.includeCancelled = includeCancelled ? 'true' : 'false'
    return params
  }

  const {
    data: reportData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'report',
      activeTab,
      period,
      dateFrom,
      dateTo,
      clientId,
      siteId,
      status,
      invoiceType,
      paymentStatus,
      method,
      transactionType,
      bucket,
      currency,
      search,
      overdueOnly,
      includeCancelled,
      sortBy,
      sortOrder,
      page,
      limit,
    ],
    queryFn: async () => {
      if (activeTab === 'customer-statement' && !clientId) {
        return null
      }
      const res = await api.get(`/reports/${activeTab}`, {
        params: buildQueryParams(),
      })
      return res.data?.data || res.data
    },
    enabled: activeTab !== 'customer-statement' || !!clientId,
  })

  const activeCurrency = reportData?.currency || orgSettings?.defaultCurrency || 'SAR'

  const formatMoney = (val: number | string | undefined, curr = activeCurrency) => {
    const num = Number(val ?? 0)
    return new Intl.NumberFormat(isAr ? 'ar-SA' : 'en-SA', {
      style: 'currency',
      currency: curr || 'SAR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  }

  const handleExportExcel = async () => {
    if (activeTab === 'customer-statement' && !clientId) return
    try {
      setExporting(true)
      const params = {
        ...buildQueryParams(),
        type: activeTab,
      }
      const res = await api.get('/reports/export/excel', {
        params,
        responseType: 'blob',
      })
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dateStr = new Date().toISOString().slice(0, 10)
      a.download = `BUNYAN_${activeTab}_${dateStr}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Excel export failed', err)
    } finally {
      setExporting(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const tabs: { key: ReportTab; labelAr: string; labelEn: string; icon: any }[] = [
    { key: 'invoices', labelAr: 'تقرير الفواتير', labelEn: 'Invoices Report', icon: Receipt },
    { key: 'statements', labelAr: 'تقرير المستخلصات', labelEn: 'Statements Report', icon: FileText },
    {
      key: 'work-entries',
      labelAr: 'تقرير الأعمال المنفذة',
      labelEn: 'Completed Works',
      icon: ClipboardList,
    },
    {
      key: 'collections',
      labelAr: 'التحصيلات والمدفوعات',
      labelEn: 'Collections & Payments',
      icon: Wallet,
    },
    {
      key: 'receivables',
      labelAr: 'الذمم المدينة المستحقة',
      labelEn: 'Accounts Receivable',
      icon: CreditCard,
    },
    {
      key: 'customer-statement',
      labelAr: 'كشف حساب عميل',
      labelEn: 'Customer Statement',
      icon: Users,
    },
    {
      key: 'sites',
      labelAr: 'تقارير المواقع والمشاريع',
      labelEn: 'Site & Project Reports',
      icon: MapPin,
    },
    {
      key: 'aging',
      labelAr: 'أعمار الديون (Aging)',
      labelEn: 'Receivables Aging',
      icon: Clock,
    },
  ]

  const currentTabInfo = tabs.find((t) => t.key === activeTab) || tabs[0]

  const formatInvoiceTypeLabel = (type: string) => {
    switch (type) {
      case 'TAX_INVOICE':
        return isAr ? 'فاتورة ضريبية' : 'Tax Invoice'
      case 'SIMPLIFIED_TAX_INVOICE':
        return isAr ? 'فاتورة ضريبية مبسطة' : 'Simplified Tax Invoice'
      case 'CREDIT_NOTE':
        return isAr ? 'إشعار دائن' : 'Credit Note'
      case 'DEBIT_NOTE':
        return isAr ? 'إشعار مدين' : 'Debit Note'
      default:
        return type
    }
  }

  return (
    <div className="space-y-6">
      {/* Screen Header & Action Buttons (Hidden on Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAr ? 'التقارير المالية والتشغيلية وكشوف الحساب' : 'Financial & Operational Reports'}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {isAr
              ? 'تقارير تحليلية دقيقة مرتبطة ببيانات الفواتير والمستخلصات والمدفوعات الفعلية مع دعم التصدير إلى Excel والطباعة A4'
              : 'Accurate analytical reports connected to live database records with Excel (.xlsx) export and A4 print support'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            data-testid="report-print-btn"
            className="px-3.5 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span>{isAr ? 'طباعة A4 / PDF' : 'Print A4 / PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || (activeTab === 'customer-statement' && !clientId)}
            data-testid="report-export-excel-btn"
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>
              {exporting
                ? isAr
                  ? 'جاري التصدير...'
                  : 'Exporting...'
                : isAr
                ? 'تصدير Excel (.xlsx)'
                : 'Export Excel (.xlsx)'}
            </span>
          </button>
        </div>
      </div>

      {/* Report Tabs Bar (Hidden on Print) */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex items-center gap-1 overflow-x-auto print:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              data-testid={`report-tab-${tab.key}`}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{isAr ? tab.labelAr : tab.labelEn}</span>
            </button>
          )
        })}
      </div>

      {/* Filters Panel (Hidden on Print) */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Client Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              {isAr ? 'العميل' : 'Client'}
              {activeTab === 'customer-statement' && <span className="text-red-500 ms-1">*</span>}
            </label>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value)
                setSiteId('')
                setPage(1)
              }}
              data-testid="filter-client-select"
              className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
            >
              {activeTab !== 'customer-statement' && (
                <option value="">{isAr ? 'كل العملاء' : 'All Clients'}</option>
              )}
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {isAr ? c.nameAr : c.nameEn || c.nameAr}
                </option>
              ))}
            </select>
          </div>

          {/* Site Filter (applicable to invoices, statements, work-entries, sites) */}
          {['invoices', 'statements', 'work-entries', 'sites'].includes(activeTab) && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                {isAr ? 'الموقع / المشروع' : 'Site / Project'}
              </label>
              <select
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value)
                  setPage(1)
                }}
                data-testid="filter-site-select"
                className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="">{isAr ? 'كل المواقع' : 'All Sites'}</option>
                {sites.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {isAr ? s.nameAr : s.nameEn || s.nameAr}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Period Filter */}
          {!['aging', 'receivables'].includes(activeTab) && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                {isAr ? 'الفترة الزمنية' : 'Period'}
              </label>
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value)
                  setPage(1)
                }}
                data-testid="filter-period-select"
                className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="all">{isAr ? 'كل الفترات' : 'All Time'}</option>
                <option value="today">{isAr ? 'اليوم' : 'Today'}</option>
                <option value="last7days">{isAr ? 'آخر 7 أيام' : 'Last 7 Days'}</option>
                <option value="currentMonth">{isAr ? 'الشهر الحالي' : 'Current Month'}</option>
                <option value="previousMonth">{isAr ? 'الشهر السابق' : 'Previous Month'}</option>
                <option value="currentYear">{isAr ? 'السنة الحالية' : 'Current Year'}</option>
                <option value="custom">{isAr ? 'فترة مخصصة' : 'Custom Range'}</option>
              </select>
            </div>
          )}

          {/* Date From / Date To */}
          {(period === 'custom' || activeTab === 'customer-statement') && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  {isAr ? 'من تاريخ' : 'From Date'}
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    if (activeTab !== 'customer-statement') setPeriod('custom')
                    setPage(1)
                  }}
                  data-testid="filter-date-from"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  {isAr ? 'إلى تاريخ' : 'To Date'}
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    if (activeTab !== 'customer-statement') setPeriod('custom')
                    setPage(1)
                  }}
                  data-testid="filter-date-to"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg"
                />
              </div>
            </>
          )}

          {/* Tab-Specific Status / Type Filters */}
          {activeTab === 'invoices' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  {isAr ? 'حالة السداد' : 'Payment Status'}
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => {
                    setPaymentStatus(e.target.value)
                    setPage(1)
                  }}
                  data-testid="filter-payment-status"
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                >
                  <option value="">{isAr ? 'الكل' : 'All'}</option>
                  <option value="UNPAID">{isAr ? 'غير مسددة' : 'Unpaid'}</option>
                  <option value="PARTIALLY_PAID">{isAr ? 'مسددة جزئياً' : 'Partially Paid'}</option>
                  <option value="PAID">{isAr ? 'مسددة بالكامل' : 'Paid'}</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  {isAr ? 'نوع المستند' : 'Document Type'}
                </label>
                <select
                  value={invoiceType}
                  onChange={(e) => {
                    setInvoiceType(e.target.value)
                    setPage(1)
                  }}
                  data-testid="filter-invoice-type"
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                >
                  <option value="">{isAr ? 'الكل' : 'All'}</option>
                  <option value="TAX_INVOICE">{isAr ? 'فاتورة ضريبية' : 'Tax Invoice'}</option>
                  <option value="SIMPLIFIED_TAX_INVOICE">
                    {isAr ? 'فاتورة ضريبية مبسطة' : 'Simplified Tax Invoice'}
                  </option>
                  <option value="CREDIT_NOTE">{isAr ? 'إشعار دائن' : 'Credit Note'}</option>
                  <option value="DEBIT_NOTE">{isAr ? 'إشعار مدين' : 'Debit Note'}</option>
                </select>
              </div>
            </>
          )}

          {activeTab === 'work-entries' && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                {isAr ? 'حالة البند' : 'Work Entry Status'}
              </label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setPage(1)
                }}
                data-testid="filter-work-entry-status"
                className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="DRAFT">{isAr ? 'مسودة' : 'Draft'}</option>
                <option value="PENDING_APPROVAL">{isAr ? 'بانتظار الاعتماد' : 'Pending Approval'}</option>
                <option value="APPROVED">{isAr ? 'معتمد (غير مفوتر)' : 'Approved'}</option>
                <option value="PARTIALLY_BILLED">{isAr ? 'مفوتر جزئياً' : 'Partially Billed'}</option>
                <option value="FULLY_BILLED">{isAr ? 'مفوتر بالكامل' : 'Fully Billed'}</option>
                <option value="REJECTED">{isAr ? 'مرفوض' : 'Rejected'}</option>
              </select>
            </div>
          )}

          {activeTab === 'collections' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  {isAr ? 'طريقة الدفع' : 'Payment Method'}
                </label>
                <select
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value)
                    setPage(1)
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                >
                  <option value="">{isAr ? 'كل الطرق' : 'All Methods'}</option>
                  <option value="BANK_TRANSFER">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  <option value="CASH">{isAr ? 'نقدي' : 'Cash'}</option>
                  <option value="CHEQUE">{isAr ? 'شيك' : 'Cheque'}</option>
                  <option value="CARD">{isAr ? 'بطاقة' : 'Card'}</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  {isAr ? 'حالة الدفعة' : 'Payment Status'}
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                    setPage(1)
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                >
                  <option value="ALL">{isAr ? 'النشطة والملغاة' : 'Active & Reversed'}</option>
                  <option value="ACTIVE">{isAr ? 'الدفعات النشطة فقط' : 'Active Only'}</option>
                  <option value="REVERSED">{isAr ? 'الدفعات الملغاة فقط' : 'Reversed Only'}</option>
                </select>
              </div>
            </>
          )}

          {activeTab === 'customer-statement' && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                {isAr ? 'نوع الحركة' : 'Transaction Type'}
              </label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                data-testid="filter-tx-type"
                className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="ALL">{isAr ? 'جميع الحركات المالية' : 'All Transactions'}</option>
                <option value="INVOICE">{isAr ? 'الفواتير فقط' : 'Invoices Only'}</option>
                <option value="CREDIT_NOTE">{isAr ? 'الإشعارات الدائنة فقط' : 'Credit Notes Only'}</option>
                <option value="DEBIT_NOTE">{isAr ? 'الإشعارات المدينة فقط' : 'Debit Notes Only'}</option>
                <option value="PAYMENT">{isAr ? 'المدفوعات فقط' : 'Payments Only'}</option>
              </select>
            </div>
          )}

          {activeTab === 'aging' && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                {isAr ? 'شريحة التأخير' : 'Aging Bucket'}
              </label>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                data-testid="filter-aging-bucket"
                className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="">{isAr ? 'جميع الشرائح' : 'All Buckets'}</option>
                <option value="NOT_DUE">{isAr ? 'غير مستحقة بعد' : 'Not Due Yet'}</option>
                <option value="OVERDUE_1_30">{isAr ? 'متأخرة 1 - 30 يوم' : '1 - 30 Days Overdue'}</option>
                <option value="OVERDUE_31_60">
                  {isAr ? 'متأخرة 31 - 60 يوم' : '31 - 60 Days Overdue'}
                </option>
                <option value="OVERDUE_61_90">
                  {isAr ? 'متأخرة 61 - 90 يوم' : '61 - 90 Days Overdue'}
                </option>
                <option value="OVERDUE_90_PLUS">{isAr ? 'أكثر من 90 يوم' : '90+ Days Overdue'}</option>
                <option value="UNCLASSIFIED">
                  {isAr ? 'غير مصنفة (بدون تاريخ استحقاق)' : 'Unclassified (No Due Date)'}
                </option>
              </select>
            </div>
          )}
        </div>

        {/* Bottom Filter Row: Search + Toggles + Clear Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder={
                  isAr
                    ? 'بحث برقم المرجع أو اسم العميل أو البند...'
                    : 'Search by reference, client, or item...'
                }
                data-testid="report-search-input"
                className="w-full ps-8 pe-3 py-1.5 text-xs border border-gray-300 rounded-lg"
              />
            </div>

            {['invoices', 'receivables'].includes(activeTab) && (
              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => {
                    setOverdueOnly(e.target.checked)
                    setPage(1)
                  }}
                  className="rounded border-gray-300 text-blue-600"
                />
                <span>{isAr ? 'المتأخرة فقط' : 'Overdue Only'}</span>
              </label>
            )}

            {activeTab === 'invoices' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCancelled}
                  onChange={(e) => {
                    setIncludeCancelled(e.target.checked)
                    setPage(1)
                  }}
                  className="rounded border-gray-300 text-blue-600"
                />
                <span>{isAr ? 'إظهار الفواتير الملغاة' : 'Show Cancelled Invoices'}</span>
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={clearFilters}
            data-testid="report-clear-filters-btn"
            className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'مسح الفلاتر' : 'Reset Filters'}</span>
          </button>
        </div>
      </div>

      {/* Printable A4 Container */}
      <div className="a4-print-sheet bg-white rounded-xl border border-gray-200 shadow-sm p-6 print:border-0 print:shadow-none print:p-0">
        {/* Official Print Header (Visible on Print and Customer Statement) */}
        <div
          className={`${
            activeTab === 'customer-statement' ? 'block' : 'hidden print:block'
          } pb-4 mb-6 border-b-2 border-gray-800`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {orgSettings?.logoUrl ? (
                <img
                  src={orgSettings.logoUrl}
                  alt="Logo"
                  className="w-14 h-14 object-contain rounded border border-gray-200"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Building2 className="w-6 h-6" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {orgSettings?.businessName || (isAr ? 'بنيان' : 'BUNYAN')}
                </h2>
                {orgSettings?.businessNameEn && (
                  <p className="text-xs text-gray-600">{orgSettings.businessNameEn}</p>
                )}
                {orgSettings?.vatNumber && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {isAr ? 'الرقم الضريبي: ' : 'VAT No: '}
                    <span className="font-mono">{orgSettings.vatNumber}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="text-end">
              <h3 className="text-base font-bold text-blue-900">
                {isAr ? currentTabInfo.labelAr : currentTabInfo.labelEn}
              </h3>
              <p className="text-xs text-gray-500 mt-1" dir="ltr">
                {new Date().toLocaleString(isAr ? 'ar-SA' : 'en-US')}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {isAr ? `العملة: ${activeCurrency}` : `Currency: ${activeCurrency}`}
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-500">
              {isAr ? 'جاري استخراج بيانات التقرير...' : 'Generating report...'}
            </p>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="p-8 bg-red-50 border border-red-200 rounded-xl flex flex-col items-center justify-center text-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <p className="text-sm font-bold text-red-900">
              {isAr ? 'حدث خطأ أثناء تحميل التقرير' : 'Failed to load report'}
            </p>
            <p className="text-xs text-red-700">
              {(error as any)?.response?.data?.error?.message ||
                (isAr ? 'يرجى المحاولة مرة أخرى' : 'Please try again')}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
            </button>
          </div>
        )}

        {/* 1. INVOICES REPORT */}
        {!isLoading && !isError && activeTab === 'invoices' && reportData && (
          <div className="space-y-5" data-testid="report-invoices-content">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-[11px] text-blue-700">
                  {isAr ? 'إجمالي الفواتير المصدرة (Gross)' : 'Gross Issued Invoices'}
                </p>
                <p className="text-sm font-bold text-blue-900 mt-1">
                  {formatMoney(reportData.summary?.grossInvoiceAmount)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-100">
                <p className="text-[11px] text-amber-700">
                  {isAr ? 'إجمالي الإشعارات الدائنة' : 'Total Credit Notes'}
                </p>
                <p className="text-sm font-bold text-amber-900 mt-1">
                  {formatMoney(reportData.summary?.totalCreditNotes)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-purple-50 border border-purple-100">
                <p className="text-[11px] text-purple-700">
                  {isAr ? 'إجمالي الإشعارات المدينة' : 'Total Debit Notes'}
                </p>
                <p className="text-sm font-bold text-purple-900 mt-1">
                  {formatMoney(reportData.summary?.totalDebitNotes)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-indigo-50 border border-indigo-100">
                <p className="text-[11px] text-indigo-700">
                  {isAr ? 'صافي قيمة الفواتير (Net)' : 'Net Invoices Value'}
                </p>
                <p className="text-sm font-bold text-indigo-900 mt-1">
                  {formatMoney(reportData.summary?.netInvoiceAmount)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-[11px] text-emerald-700">
                  {isAr ? 'إجمالي المسدد' : 'Total Paid'}
                </p>
                <p className="text-sm font-bold text-emerald-900 mt-1">
                  {formatMoney(reportData.summary?.totalPaid)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-100">
                <p className="text-[11px] text-rose-700">
                  {isAr ? 'الرصيد المتبقي المستحق' : 'Remaining Balance'}
                </p>
                <p className="text-sm font-bold text-rose-900 mt-1">
                  {formatMoney(reportData.summary?.totalRemaining)}
                </p>
              </div>
            </div>

            {reportData.items?.length === 0 ? (
              <p className="text-center py-10 text-xs text-gray-500">
                {isAr ? 'لا توجد فواتير مطابقة للفلاتر المحددة' : 'No invoices match the selected filters'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice No'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'النوع' : 'Type'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'التاريخ' : 'Issue Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الاستحقاق' : 'Due Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العميل' : 'Client'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الإجمالي' : 'Gross Total'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الصافي' : 'Net Total'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المسدد' : 'Paid'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المتبقي' : 'Remaining'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.items.map((item: any) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-50 ${
                          item.status === 'CANCELLED' ? 'bg-red-50/40 text-gray-400 line-through' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          <Link to={`/invoices/${item.id}`} className="text-blue-600 hover:underline">
                            {item.referenceNo}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3">{formatInvoiceTypeLabel(item.invoiceType)}</td>
                        <td className="py-2.5 px-3" dir="ltr">
                          {new Date(item.issueDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-2.5 px-3" dir="ltr">
                          {item.dueDate
                            ? new Date(item.dueDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-medium">{item.clientNameAr}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              item.status === 'CANCELLED'
                                ? 'bg-red-100 text-red-700'
                                : item.paymentStatus === 'PAID'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.isOverdue
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {item.status === 'CANCELLED'
                              ? isAr
                                ? 'ملغاة'
                                : 'Cancelled'
                              : item.paymentStatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-end font-semibold">
                          {formatMoney(item.totalAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-semibold text-indigo-700">
                          {formatMoney(item.netAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-end text-emerald-700">
                          {formatMoney(item.paidAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-bold text-rose-600">
                          {formatMoney(item.remainingAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 2. STATEMENTS REPORT */}
        {!isLoading && !isError && activeTab === 'statements' && reportData && (
          <div className="space-y-5" data-testid="report-statements-content">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-purple-50 border border-purple-100">
                <p className="text-[11px] text-purple-700">
                  {isAr ? 'إجمالي قيمة المستخلصات المعتمدة' : 'Total Approved Statements Value'}
                </p>
                <p className="text-sm font-bold text-purple-900 mt-1">
                  {formatMoney(reportData.summary?.totalApprovedWorkValue)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-[11px] text-blue-700">
                  {isAr ? 'القيمة المفوترة من المستخلصات' : 'Invoiced Statement Value'}
                </p>
                <p className="text-sm font-bold text-blue-900 mt-1">
                  {formatMoney(reportData.summary?.totalInvoicedValue)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-100">
                <p className="text-[11px] text-teal-700">
                  {isAr ? 'مستخلصات معتمدة غير مفوترة' : 'Approved Uninvoiced Statements'}
                </p>
                <p className="text-sm font-bold text-teal-900 mt-1">
                  {formatMoney(reportData.summary?.totalUninvoicedApprovedValue)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-[11px] text-gray-600">
                  {isAr ? 'عدد المستخلصات' : 'Statements Count'}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1">
                  {reportData.summary?.totalCount ?? 0}
                </p>
              </div>
            </div>

            {reportData.items?.length === 0 ? (
              <p className="text-center py-10 text-xs text-gray-500">
                {isAr ? 'لا توجد مستخلصات مطابقة للفلاتر' : 'No statements match the selected filters'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'رقم المستخلص' : 'Statement No'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'التاريخ' : 'Issue Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العميل' : 'Client'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المواقع' : 'Sites'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الإجمالي' : 'Total Value'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المفوتر' : 'Invoiced'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'غير المفوتر' : 'Uninvoiced'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الفواتير المرتبطة' : 'Invoices'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.items.map((stm: any) => (
                      <tr key={stm.id} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          <Link to={`/statements/${stm.id}`} className="text-blue-600 hover:underline">
                            {stm.referenceNo}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3" dir="ltr">
                          {new Date(stm.issueDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-2.5 px-3 font-medium">{stm.clientNameAr}</td>
                        <td className="py-2.5 px-3">
                          {stm.sites?.map((s: any) => s.nameAr).join('، ') || '—'}
                        </td>
                        <td className="py-2.5 px-3">{stm.status}</td>
                        <td className="py-2.5 px-3 text-end font-semibold">
                          {formatMoney(stm.totalAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-end text-blue-700">
                          {formatMoney(stm.invoicedValue)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-semibold text-teal-700">
                          {formatMoney(stm.uninvoicedApprovedValue)}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {stm.linkedInvoices?.map((i: any) => i.referenceNo).join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 3. WORK ENTRIES REPORT */}
        {!isLoading && !isError && activeTab === 'work-entries' && reportData && (
          <div className="space-y-5" data-testid="report-work-entries-content">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-[11px] text-gray-600">
                  {isAr ? 'إجمالي قيمة الأعمال المسجلة' : 'Total Recorded Work Value'}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1">
                  {formatMoney(reportData.summary?.totalRecordedValue)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-indigo-50 border border-indigo-100">
                <p className="text-[11px] text-indigo-700">
                  {isAr ? 'إجمالي قيمة الأعمال المعتمدة' : 'Total Approved Work Value'}
                </p>
                <p className="text-sm font-bold text-indigo-900 mt-1">
                  {formatMoney(reportData.summary?.totalApprovedValue)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-[11px] text-blue-700">
                  {isAr ? 'قيمة الأعمال المفوترة' : 'Total Billed Work Value'}
                </p>
                <p className="text-sm font-bold text-blue-900 mt-1">
                  {formatMoney(reportData.summary?.totalBilledValue)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-100">
                <p className="text-[11px] text-teal-700">
                  {isAr ? 'أعمال معتمدة غير مفوترة' : 'Approved Unbilled Work Value'}
                </p>
                <p className="text-sm font-bold text-teal-900 mt-1">
                  {formatMoney(reportData.summary?.totalApprovedUnbilledValue)}
                </p>
              </div>
            </div>

            {reportData.items?.length === 0 ? (
              <p className="text-center py-10 text-xs text-gray-500">
                {isAr ? 'لا توجد بنود أعمال مطابقة للفلاتر' : 'No work entries match the selected filters'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المرجع' : 'Ref No'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'التاريخ' : 'Work Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العميل / الموقع' : 'Client / Site'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'البند' : 'Item'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الكمية' : 'Qty'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المفوتر' : 'Billed Qty'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الإجمالي' : 'Total Value'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'غير المفوتر' : 'Unbilled Value'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.items.map((we: any) => (
                      <tr key={we.id} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          <Link to={`/work-entries/${we.id}`} className="text-blue-600 hover:underline">
                            {we.referenceNo}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3" dir="ltr">
                          {new Date(we.workDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-gray-900">{we.clientNameAr}</div>
                          <div className="text-gray-500">{we.siteNameAr}</div>
                        </td>
                        <td className="py-2.5 px-3 font-medium">{we.itemNameAr}</td>
                        <td className="py-2.5 px-3 text-end">
                          {we.quantity} {we.unit}
                        </td>
                        <td className="py-2.5 px-3 text-end text-blue-700">
                          {we.billedQuantity} {we.unit}
                        </td>
                        <td className="py-2.5 px-3 text-end font-semibold">
                          {formatMoney(we.totalAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-semibold text-teal-700">
                          {formatMoney(we.unbilledAmount)}
                        </td>
                        <td className="py-2.5 px-3">{we.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 4. COLLECTIONS & PAYMENTS REPORT */}
        {!isLoading && !isError && activeTab === 'collections' && reportData && (
          <div className="space-y-5" data-testid="report-collections-content">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-[11px] text-emerald-700">
                  {isAr ? 'إجمالي التحصيلات الفعلية النشطة' : 'Total Active Collections'}
                </p>
                <p className="text-sm font-bold text-emerald-900 mt-1">
                  {formatMoney(reportData.summary?.totalActiveCollected)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-100">
                <p className="text-[11px] text-red-700">
                  {isAr ? 'المدفوعات الملغاة/المعكوسة (مستبعدة)' : 'Reversed Payments (Excluded)'}
                </p>
                <p className="text-sm font-bold text-red-900 mt-1">
                  {formatMoney(reportData.summary?.totalReversedAmount)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-[11px] text-gray-600">
                  {isAr ? 'عدد الدفعات النشطة' : 'Active Payments Count'}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1">
                  {reportData.summary?.activeCount ?? 0}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-[11px] text-gray-600">
                  {isAr ? 'عدد الدفعات الملغاة' : 'Reversed Payments Count'}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1">
                  {reportData.summary?.reversedCount ?? 0}
                </p>
              </div>
            </div>

            {reportData.items?.length === 0 ? (
              <p className="text-center py-10 text-xs text-gray-500">
                {isAr ? 'لا توجد مدفوعات مطابقة للفلاتر' : 'No payments match the selected filters'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'التاريخ' : 'Payment Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العميل' : 'Client'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice No'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'طريقة الدفع' : 'Method'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المرجع البنكي' : 'Reference'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المبلغ' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.items.map((pay: any) => (
                      <tr
                        key={pay.id}
                        className={`hover:bg-gray-50 ${
                          pay.status === 'REVERSED' ? 'bg-red-50/40 text-gray-400 line-through' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3" dir="ltr">
                          {new Date(pay.paymentDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-2.5 px-3 font-medium">{pay.clientNameAr}</td>
                        <td className="py-2.5 px-3 font-mono">{pay.invoiceReferenceNo}</td>
                        <td className="py-2.5 px-3">{pay.method}</td>
                        <td className="py-2.5 px-3 font-mono">{pay.referenceNo || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              pay.status === 'REVERSED'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {pay.status === 'REVERSED'
                              ? isAr
                                ? 'ملغاة / معكوسة'
                                : 'Reversed'
                              : isAr
                              ? 'نشطة'
                              : 'Active'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-end font-bold text-emerald-700">
                          {formatMoney(pay.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 5. ACCOUNTS RECEIVABLE REPORT */}
        {!isLoading && !isError && activeTab === 'receivables' && reportData && (
          <div className="space-y-5" data-testid="report-receivables-content">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-100">
                <p className="text-[11px] text-rose-700">
                  {isAr ? 'إجمالي الذمم المدينة المستحقة' : 'Total Outstanding Receivables'}
                </p>
                <p className="text-sm font-bold text-rose-900 mt-1">
                  {formatMoney(reportData.summary?.totalOutstanding)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-100">
                <p className="text-[11px] text-red-700">
                  {isAr ? 'الذمم المتأخرة عن الاستحقاق' : 'Overdue Receivables'}
                </p>
                <p className="text-sm font-bold text-red-900 mt-1">
                  {formatMoney(reportData.summary?.overdueOutstanding)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-[11px] text-blue-700">
                  {isAr ? 'صافي قيمة الفواتير المفتوحة' : 'Open Invoices Net Value'}
                </p>
                <p className="text-sm font-bold text-blue-900 mt-1">
                  {formatMoney(reportData.summary?.totalNetAmount)}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-[11px] text-gray-600">
                  {isAr ? 'عدد الفواتير المفتوحة' : 'Open Invoices Count'}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1">
                  {reportData.summary?.totalCount ?? 0}
                </p>
              </div>
            </div>

            {reportData.items?.length === 0 ? (
              <p className="text-center py-10 text-xs text-gray-500">
                {isAr ? 'لا توجد ذمم مدينة مستحقة حالياً' : 'No outstanding receivables found'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice No'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العميل' : 'Client'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'أيام التأخير' : 'Overdue Days'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الصافي' : 'Net Amount'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المسدد' : 'Paid'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الرصيد المتبقي' : 'Remaining'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.items.map((item: any) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          <Link to={`/invoices/${item.id}`} className="text-blue-600 hover:underline">
                            {item.referenceNo}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 font-medium">{item.clientNameAr}</td>
                        <td className="py-2.5 px-3" dir="ltr">
                          {new Date(item.issueDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-2.5 px-3" dir="ltr">
                          {item.dueDate
                            ? new Date(item.dueDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-end font-semibold text-red-600">
                          {item.overdueDays !== null && item.overdueDays > 0
                            ? `${item.overdueDays} ${isAr ? 'يوم' : 'd'}`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-end">{formatMoney(item.netAmount)}</td>
                        <td className="py-2.5 px-3 text-end text-emerald-700">
                          {formatMoney(item.paidAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-bold text-rose-600">
                          {formatMoney(item.remainingAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 6. CUSTOMER ACCOUNT STATEMENT (كشف حساب العميل) */}
        {!isLoading && !isError && activeTab === 'customer-statement' && reportData && (
          <div className="space-y-6" data-testid="report-customer-statement-content">
            {/* Customer Details Box */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500">{isAr ? 'كشف حساب العميل:' : 'Customer Statement:'}</p>
                <h3 className="text-base font-bold text-gray-900 mt-0.5">
                  {isAr
                    ? reportData.client?.nameAr
                    : reportData.client?.nameEn || reportData.client?.nameAr}
                </h3>
                {reportData.client?.vatNumber && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {isAr ? 'الرقم الضريبي للعميل: ' : 'Client VAT No: '}
                    <span className="font-mono">{reportData.client.vatNumber}</span>
                  </p>
                )}
              </div>
              <div className="text-xs text-gray-600 space-y-1 text-end">
                <div>
                  <span className="font-semibold">{isAr ? 'الفترة من: ' : 'From: '}</span>
                  <span dir="ltr">
                    {reportData.period?.dateFrom
                      ? new Date(reportData.period.dateFrom).toLocaleDateString(
                          isAr ? 'ar-SA' : 'en-US'
                        )
                      : isAr
                      ? 'بداية التعامل'
                      : 'Beginning'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">{isAr ? 'إلى: ' : 'To: '}</span>
                  <span dir="ltr">
                    {reportData.period?.dateTo
                      ? new Date(reportData.period.dateTo).toLocaleDateString(
                          isAr ? 'ar-SA' : 'en-US'
                        )
                      : isAr
                      ? 'تاريخ اليوم'
                      : 'Today'}
                  </span>
                </div>
              </div>
            </div>

            {/* Statement Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-lg bg-gray-100 border border-gray-200">
                <p className="text-[11px] text-gray-600">
                  {isAr ? 'الرصيد الافتتاحي' : 'Opening Balance'}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1" data-testid="statement-opening-balance">
                  {reportData.summary?.openingBalanceAvailable
                    ? formatMoney(reportData.summary.openingBalance)
                    : isAr
                    ? 'غير متاح (فلتر نوع حركة)'
                    : 'N/A (Filtered by Type)'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-[11px] text-blue-700">
                  {isAr ? 'إجمالي الفواتير' : 'Total Invoices'}
                </p>
                <p className="text-sm font-bold text-blue-900 mt-1">
                  {formatMoney(reportData.summary?.totalInvoices)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
                <p className="text-[11px] text-purple-700">
                  {isAr ? 'الإشعارات المدينة' : 'Debit Notes'}
                </p>
                <p className="text-sm font-bold text-purple-900 mt-1">
                  {formatMoney(reportData.summary?.totalDebitNotes)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                <p className="text-[11px] text-amber-700">
                  {isAr ? 'الإشعارات الدائنة' : 'Credit Notes'}
                </p>
                <p className="text-sm font-bold text-amber-900 mt-1">
                  {formatMoney(reportData.summary?.totalCreditNotes)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-[11px] text-emerald-700">
                  {isAr ? 'إجمالي المدفوعات' : 'Total Payments'}
                </p>
                <p className="text-sm font-bold text-emerald-900 mt-1">
                  {formatMoney(reportData.summary?.totalPayments)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                <p className="text-[11px] text-rose-700 font-semibold">
                  {isAr ? 'الرصيد الختامي المستحق' : 'Closing Balance'}
                </p>
                <p className="text-sm font-bold text-rose-900 mt-1" data-testid="statement-closing-balance">
                  {formatMoney(reportData.summary?.closingBalance)}
                </p>
              </div>
            </div>

            {/* Chronological Ledger Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead className="bg-gray-800 text-white">
                  <tr>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'رقم المستند' : 'Document No'}</th>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'نوع الحركة' : 'Type'}</th>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'البيان / الوصف' : 'Description'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'مدين (Debit)' : 'Debit'}</th>
                    <th className="py-2.5 px-3 text-end">{isAr ? 'دائن (Credit)' : 'Credit'}</th>
                    <th className="py-2.5 px-3 text-end">
                      {isAr ? 'الرصيد التراكمي' : 'Running Balance'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {/* Opening Balance Row */}
                  {reportData.summary?.openingBalanceAvailable && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className="py-2.5 px-3" dir="ltr">
                        {reportData.period?.dateFrom
                          ? new Date(reportData.period.dateFrom).toLocaleDateString(
                              isAr ? 'ar-SA' : 'en-US'
                            )
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">OPENING</td>
                      <td className="py-2.5 px-3">
                        {isAr ? 'رصيد افتتاحي' : 'Opening Balance'}
                      </td>
                      <td className="py-2.5 px-3">
                        {isAr
                          ? 'الرصيد المرحل لما قبل بداية الفترة'
                          : 'Balance brought forward prior to selected period'}
                      </td>
                      <td className="py-2.5 px-3 text-end">—</td>
                      <td className="py-2.5 px-3 text-end">—</td>
                      <td className="py-2.5 px-3 text-end font-bold">
                        {formatMoney(reportData.summary.openingBalance)}
                      </td>
                    </tr>
                  )}

                  {reportData.transactions?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500">
                        {isAr
                          ? 'لا توجد حركات مالية مسجلة خلال هذه الفترة'
                          : 'No financial transactions recorded during this period'}
                      </td>
                    </tr>
                  ) : (
                    reportData.transactions.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3" dir="ltr">
                          {new Date(tx.date).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold">{tx.documentNo}</td>
                        <td className="py-2.5 px-3">{tx.type}</td>
                        <td className="py-2.5 px-3">
                          {isAr ? tx.descriptionAr : tx.descriptionEn}
                        </td>
                        <td className="py-2.5 px-3 text-end font-medium text-blue-700">
                          {tx.debit > 0 ? formatMoney(tx.debit) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-end font-medium text-emerald-700">
                          {tx.credit > 0 ? formatMoney(tx.credit) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-end font-bold text-gray-900">
                          {tx.runningBalance !== null ? formatMoney(tx.runningBalance) : '—'}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Closing Balance Row */}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <td colSpan={4} className="py-3 px-3 text-start">
                      {isAr ? 'الإجمالي والرصيد الختامي' : 'Totals & Closing Balance'}
                    </td>
                    <td className="py-3 px-3 text-end text-blue-800">
                      {formatMoney(reportData.summary?.totalDebits)}
                    </td>
                    <td className="py-3 px-3 text-end text-emerald-800">
                      {formatMoney(reportData.summary?.totalCredits)}
                    </td>
                    <td className="py-3 px-3 text-end text-rose-700">
                      {formatMoney(reportData.summary?.closingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. SITES & COMPLETED WORK REPORT */}
        {!isLoading && !isError && activeTab === 'sites' && reportData && (
          <div className="space-y-5" data-testid="report-sites-content">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-[11px] text-gray-600">
                  {isAr ? '1. إجمالي الأعمال المسجلة' : '1. Recorded Work Value'}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1">
                  {formatMoney(reportData.summary?.totalRecordedWorkValue)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                <p className="text-[11px] text-indigo-700">
                  {isAr ? '2. إجمالي الأعمال المعتمدة' : '2. Approved Work Value'}
                </p>
                <p className="text-sm font-bold text-indigo-900 mt-1">
                  {formatMoney(reportData.summary?.totalApprovedWorkValue)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-teal-50 border border-teal-100">
                <p className="text-[11px] text-teal-700">
                  {isAr ? '3. أعمال معتمدة غير مفوترة' : '3. Approved Uninvoiced'}
                </p>
                <p className="text-sm font-bold text-teal-900 mt-1">
                  {formatMoney(reportData.summary?.totalApprovedUninvoicedWorkValue)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-[11px] text-blue-700">
                  {isAr ? '4. إجمالي الفواتير المصدرة' : '4. Gross Issued Invoices'}
                </p>
                <p className="text-sm font-bold text-blue-900 mt-1">
                  {formatMoney(reportData.summary?.totalIssuedInvoiceValue)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-cyan-50 border border-cyan-100">
                <p className="text-[11px] text-cyan-700">
                  {isAr ? '5. صافي قيمة الفواتير' : '5. Net Invoice Value'}
                </p>
                <p className="text-sm font-bold text-cyan-900 mt-1">
                  {formatMoney(reportData.summary?.totalNetInvoiceValue)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-[11px] text-emerald-700">
                  {isAr ? '6. التحصيل الفعلي المباشر' : '6. Direct Site Collections'}
                </p>
                <p className="text-sm font-bold text-emerald-900 mt-1">
                  {formatMoney(reportData.summary?.totalCollected)}
                </p>
              </div>
            </div>

            {reportData.items?.length === 0 ? (
              <p className="text-center py-10 text-xs text-gray-500">
                {isAr ? 'لا توجد مواقع مطابقة للفلاتر' : 'No sites match the selected filters'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الموقع' : 'Site'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العميل' : 'Client'}</th>
                      <th className="py-2.5 px-3 text-end">
                        {isAr ? 'أعمال مسجلة' : 'Recorded Work'}
                      </th>
                      <th className="py-2.5 px-3 text-end">
                        {isAr ? 'أعمال معتمدة' : 'Approved Work'}
                      </th>
                      <th className="py-2.5 px-3 text-end">
                        {isAr ? 'معتمد غير مفوتر' : 'Approved Unbilled'}
                      </th>
                      <th className="py-2.5 px-3 text-end">
                        {isAr ? 'صافي الفواتير' : 'Net Invoiced'}
                      </th>
                      <th className="py-2.5 px-3 text-end">
                        {isAr ? 'المحصل المباشر' : 'Direct Collected'}
                      </th>
                      <th className="py-2.5 px-3 text-end">
                        {isAr ? 'المتبقي المباشر' : 'Direct Remaining'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.items.map((site: any) => (
                      <tr key={site.siteId} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-medium">
                          <Link
                            to={`/sites/${site.siteId}`}
                            className="text-blue-600 hover:underline"
                          >
                            {site.siteNameAr}
                          </Link>
                          {site.hasMultiSiteSharedInvoices && (
                            <span className="block text-[10px] text-amber-600">
                              {isAr
                                ? '* يشترك في فواتير موحدة مع مواقع أخرى'
                                : '* Shares multi-site invoices'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">{site.clientNameAr}</td>
                        <td className="py-2.5 px-3 text-end">
                          {formatMoney(site.metrics.totalRecordedWorkValue)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-medium text-indigo-700">
                          {formatMoney(site.metrics.totalApprovedWorkValue)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-medium text-teal-700">
                          {formatMoney(site.metrics.approvedUninvoicedWorkValue)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-semibold text-blue-800">
                          {formatMoney(site.metrics.netInvoiceValue)}
                        </td>
                        <td className="py-2.5 px-3 text-end text-emerald-700">
                          {formatMoney(site.metrics.actualCollected)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-bold text-rose-600">
                          {formatMoney(site.metrics.remainingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 8. ACCOUNTS RECEIVABLE AGING REPORT (أعمار الديون) */}
        {!isLoading && !isError && activeTab === 'aging' && reportData && (
          <div className="space-y-5" data-testid="report-aging-content">
            {/* Aging Buckets Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-[11px] text-emerald-700">
                  {isAr ? 'غير مستحقة بعد' : 'Not Due Yet'}
                </p>
                <p className="text-sm font-bold text-emerald-900 mt-1" data-testid="aging-not-due">
                  {formatMoney(reportData.buckets?.NOT_DUE?.amount)}
                </p>
                <p className="text-[10px] text-emerald-600">
                  {reportData.buckets?.NOT_DUE?.count ?? 0} {isAr ? 'فاتورة' : 'invoices'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                <p className="text-[11px] text-amber-700">
                  {isAr ? 'متأخرة 1 - 30 يوم' : '1 - 30 Days'}
                </p>
                <p className="text-sm font-bold text-amber-900 mt-1" data-testid="aging-1-30">
                  {formatMoney(reportData.buckets?.OVERDUE_1_30?.amount)}
                </p>
                <p className="text-[10px] text-amber-600">
                  {reportData.buckets?.OVERDUE_1_30?.count ?? 0} {isAr ? 'فاتورة' : 'invoices'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
                <p className="text-[11px] text-orange-700">
                  {isAr ? 'متأخرة 31 - 60 يوم' : '31 - 60 Days'}
                </p>
                <p className="text-sm font-bold text-orange-900 mt-1" data-testid="aging-31-60">
                  {formatMoney(reportData.buckets?.OVERDUE_31_60?.amount)}
                </p>
                <p className="text-[10px] text-orange-600">
                  {reportData.buckets?.OVERDUE_31_60?.count ?? 0} {isAr ? 'فاتورة' : 'invoices'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-100">
                <p className="text-[11px] text-rose-700">
                  {isAr ? 'متأخرة 61 - 90 يوم' : '61 - 90 Days'}
                </p>
                <p className="text-sm font-bold text-rose-900 mt-1" data-testid="aging-61-90">
                  {formatMoney(reportData.buckets?.OVERDUE_61_90?.amount)}
                </p>
                <p className="text-[10px] text-rose-600">
                  {reportData.buckets?.OVERDUE_61_90?.count ?? 0} {isAr ? 'فاتورة' : 'invoices'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-[11px] text-red-700 font-semibold">
                  {isAr ? 'أكثر من 90 يوم' : '90+ Days Overdue'}
                </p>
                <p className="text-sm font-bold text-red-900 mt-1" data-testid="aging-90-plus">
                  {formatMoney(reportData.buckets?.OVERDUE_90_PLUS?.amount)}
                </p>
                <p className="text-[10px] text-red-600">
                  {reportData.buckets?.OVERDUE_90_PLUS?.count ?? 0} {isAr ? 'فاتورة' : 'invoices'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gray-100 border border-gray-300">
                <p className="text-[11px] text-gray-700">
                  {isAr ? 'بدون تاريخ استحقاق' : 'Unclassified (No Due Date)'}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1" data-testid="aging-unclassified">
                  {formatMoney(reportData.buckets?.UNCLASSIFIED?.amount)}
                </p>
                <p className="text-[10px] text-gray-600">
                  {reportData.buckets?.UNCLASSIFIED?.count ?? 0} {isAr ? 'فاتورة' : 'invoices'}
                </p>
              </div>
            </div>

            {reportData.items?.length === 0 ? (
              <p className="text-center py-10 text-xs text-gray-500">
                {isAr ? 'لا توجد فواتير مستحقة في شرائح أعمار الديون' : 'No open invoices in aging report'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-gray-50 border-y border-gray-200 text-gray-600">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice No'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'العميل' : 'Client'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'أيام التأخير' : 'Overdue Days'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'شريحة العمر' : 'Aging Bucket'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الصافي' : 'Net Amount'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'المسدد' : 'Paid'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الرصيد المتبقي' : 'Remaining'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.items.map((item: any) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          <Link to={`/invoices/${item.id}`} className="text-blue-600 hover:underline">
                            {item.referenceNo}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 font-medium">{item.clientNameAr}</td>
                        <td className="py-2.5 px-3" dir="ltr">
                          {new Date(item.issueDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-2.5 px-3" dir="ltr">
                          {item.dueDate
                            ? new Date(item.dueDate).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')
                            : isAr
                            ? 'غير محدد'
                            : 'Not Set'}
                        </td>
                        <td className="py-2.5 px-3 text-end font-semibold text-red-600">
                          {item.overdueDays !== null ? `${item.overdueDays}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-medium">{item.bucket}</td>
                        <td className="py-2.5 px-3 text-end">{formatMoney(item.netAmount)}</td>
                        <td className="py-2.5 px-3 text-end text-emerald-700">
                          {formatMoney(item.paidAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-bold text-rose-600">
                          {formatMoney(item.remainingAmount)}
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
    </div>
  )
}
