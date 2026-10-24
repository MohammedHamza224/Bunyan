import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck,
  ShieldAlert,
  Filter,
  Download,
  Trash2,
  Calendar,
  User as UserIcon,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  Lock,
  FileSpreadsheet,
  Layers,
  DollarSign,
  RefreshCw,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'

type AuditCategory = 'ALL' | 'SECURITY' | 'FINANCIAL' | 'BUSINESS'

export function AuditLogsPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const isAdmin = user?.role === 'ORG_ADMIN' || user?.role === 'SUPER_ADMIN'

  // Filter state
  const [category, setCategory] = useState<AuditCategory>('ALL')
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [actorUserId, setActorUserId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  // Export State
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null)

  // Retention Modal State
  const [isRetentionModalOpen, setIsRetentionModalOpen] = useState(false)
  const [retentionDays, setRetentionDays] = useState(90)
  const [confirmToken, setConfirmToken] = useState('')
  const [policyAcknowledged, setPolicyAcknowledged] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{ count: number; date: string } | null>(null)
  const [cleanupError, setCleanupError] = useState<string | null>(null)

  // Reset Test Audit Logs State (Development only)
  const [resetToken, setResetToken] = useState('')
  const [resetResult, setResetResult] = useState<{ count: number; date: string } | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)

  // Query Actors for actor dropdown
  const { data: actorsData } = useQuery({
    queryKey: ['auditLogActors'],
    queryFn: async () => {
      const res = await api.get('/audit-logs/actors')
      return res.data?.data || []
    },
    enabled: isAdmin,
  })

  // Query Audit Logs with all active filters
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      'auditLogs',
      { category, action, entityType, actorUserId, dateFrom, dateTo, search, page, limit },
    ],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit }
      if (category !== 'ALL') params.category = category
      if (action) params.action = action
      if (entityType) params.entityType = entityType
      if (actorUserId) params.userId = actorUserId
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      if (search.trim()) params.search = search.trim()

      const res = await api.get('/audit-logs', { params })
      return res.data?.data
    },
  })

  // Query Retention Preview when modal opens or retentionDays changes
  const {
    data: previewData,
    isLoading: isPreviewLoading,
  } = useQuery({
    queryKey: ['retentionPreview', retentionDays],
    queryFn: async () => {
      const res = await api.post('/audit-logs/cleanup/preview', {
        olderThanDays: retentionDays,
      })
      return res.data?.data
    },
    enabled: isRetentionModalOpen && isAdmin,
  })

  // Mutation for executing safe retention cleanup
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const trimmedToken = confirmToken.trim()
      const res = await api.post('/audit-logs/cleanup/execute', {
        olderThanDays: retentionDays,
        confirmationToken: trimmedToken,
        confirmToken: trimmedToken,
        policyAcknowledged,
      })
      return res.data?.data
    },
    onSuccess: (data) => {
      setCleanupResult({ count: data?.purgedCount ?? 0, date: new Date().toLocaleTimeString() })
      setCleanupError(null)
      setConfirmToken('')
      setPolicyAcknowledged(false)
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['retentionPreview'] })
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        (isAr ? 'فشلت عملية التنظيف، يرجى التحقق من المدخلات' : 'Cleanup failed. Check inputs.')
      setCleanupError(msg)
    },
  })

  // Mutation for Reset Test Audit Logs (Development Mode Only)
  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/audit-logs/reset-test-logs', {
        confirmationToken: resetToken.trim(),
      })
      return res.data?.data
    },
    onSuccess: (data) => {
      setResetResult({
        count: data?.deletedCount ?? 0,
        date: new Date().toLocaleTimeString(),
      })
      setResetError(null)
      setResetToken('')
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['retentionPreview'] })
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        (isAr ? 'فشلت عملية إعادة ضبط سجلات الفحص' : 'Reset failed')
      setResetError(msg)
    },
  })

  const logs = data?.items || []
  const pagination = {
    page: data?.page || 1,
    totalPages: data?.totalPages || 1,
    total: data?.total || 0,
  }

  const hasActiveFilters = Boolean(
    category !== 'ALL' ||
      action ||
      entityType ||
      actorUserId ||
      dateFrom ||
      dateTo ||
      search.trim()
  )

  const handleResetFilters = () => {
    setCategory('ALL')
    setAction('')
    setEntityType('')
    setActorUserId('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }

  // Handle Secure CSV Export
  const handleExportCsv = async () => {
    try {
      setIsExporting(true)
      setExportSuccessMsg(null)

      const params = new URLSearchParams()
      if (category !== 'ALL') params.append('category', category)
      if (action) params.append('action', action)
      if (entityType) params.append('entityType', entityType)
      if (actorUserId) params.append('userId', actorUserId)
      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (search.trim()) params.append('search', search.trim())

      const response = await api.get(`/audit-logs/export?${params.toString()}`, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      setExportSuccessMsg(
        isAr ? 'تم تصدير سجل العمليات بنجاح (CSV)' : 'Audit logs exported successfully (CSV)'
      )
      setTimeout(() => setExportSuccessMsg(null), 5000)
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
    } catch (err: any) {
      console.error('Export failed:', err)
      alert(
        isAr
          ? 'تعذر تصدير السجل، تأكد من صلاحيات حسابك.'
          : 'Failed to export audit logs. Check your permissions.'
      )
    } finally {
      setIsExporting(false)
    }
  }

  // Visual helper for category badges
  const renderCategoryBadge = (cat?: string) => {
    switch (cat) {
      case 'SECURITY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            <Lock className="w-3 h-3" />
            {isAr ? 'أمان ووصول' : 'Security'}
          </span>
        )
      case 'FINANCIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <DollarSign className="w-3 h-3" />
            {isAr ? 'مالي وفواتير' : 'Financial'}
          </span>
        )
      case 'BUSINESS':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            <Layers className="w-3 h-3" />
            {isAr ? 'أعمال وبيانات' : 'Business'}
          </span>
        )
    }
  }

  // Visual helper for action badges
  const renderActionBadge = (act: string) => {
    let colorClasses = 'bg-gray-100 text-gray-800 border-gray-200'
    if (act.includes('DELETE') || act.includes('PURGE') || act.includes('CANCEL')) {
      colorClasses = 'bg-rose-100 text-rose-800 border-rose-200'
    } else if (act.includes('APPROVE') || act.includes('ISSUE')) {
      colorClasses = 'bg-emerald-100 text-emerald-800 border-emerald-200'
    } else if (act.includes('UPDATE')) {
      colorClasses = 'bg-amber-100 text-amber-800 border-amber-200'
    } else if (act.includes('LOGIN') || act.includes('LOGOUT')) {
      colorClasses = 'bg-indigo-100 text-indigo-800 border-indigo-200'
    } else if (act.includes('EXPORT') || act.includes('RETENTION')) {
      colorClasses = 'bg-cyan-100 text-cyan-800 border-cyan-200'
    }

    return (
      <span
        className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${colorClasses}`}
      >
        {act}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* =========================================================
          1. Page Header & Primary Actions (Export & Retention)
          ========================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#18324B] text-white flex items-center justify-center shadow-md shrink-0">
            <ShieldCheck className="w-6 h-6 text-[#E29A26]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#18324B]">
                {isAr ? 'سجل العمليات والتدقيق الأمني' : 'Enterprise Audit Log & Security Trail'}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {isAr ? 'غير قابل للتعديل' : 'Immutable'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
              {isAr
                ? 'توثيق أمني وقانوني غير قابل للتعديل لجميع العمليات المالية (الفواتير والمستخلصات)، الإدارية (إنشاء وتعديل الكيانات)، وحركات الدخول والأمان.'
                : 'Tamper-evident legal audit log tracking financial, administrative, security, and authentication events with immutable audit compliance.'}
            </p>
          </div>
        </div>

        {/* Admin Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-2xs disabled:opacity-50"
            title={isAr ? 'تحديث البيانات' : 'Refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>

          {isAdmin && (
            <>
              {/* CSV Export Button */}
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={isExporting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-[#18324B] bg-white hover:bg-gray-50 transition-colors shadow-2xs disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>
                  {isExporting
                    ? isAr
                      ? 'جاري التصدير...'
                      : 'Exporting...'
                    : isAr
                    ? 'تصدير السجل (CSV)'
                    : 'Export CSV'}
                </span>
              </button>

              {/* Retention & Safe Cleanup Button */}
              <button
                type="button"
                onClick={() => {
                  setCleanupResult(null)
                  setCleanupError(null)
                  setIsRetentionModalOpen(true)
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#18324B] hover:bg-[#12263a] text-white text-sm font-semibold transition-all shadow-sm"
              >
                <ShieldAlert className="w-4 h-4 text-[#E29A26]" />
                <span>{isAr ? 'سياسة الحفظ والتنظيف' : 'Retention & Cleanup'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Export notification banner */}
      {exportSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{exportSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =========================================================
          2. Category Tabs Filter (All / Security / Financial / Business)
          ========================================================= */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => {
            setCategory('ALL')
            setPage(1)
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
            category === 'ALL'
              ? 'bg-[#18324B] text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span>{isAr ? 'جميع العمليات (All)' : 'All Operations'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategory('SECURITY')
            setPage(1)
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
            category === 'SECURITY'
              ? 'bg-purple-700 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-purple-50 border border-gray-200'
          }`}
        >
          <Lock className="w-4 h-4 text-purple-600" />
          <span>{isAr ? 'سجلات الأمان والوصول (Security)' : 'Security & Auth'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategory('FINANCIAL')
            setPage(1)
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
            category === 'FINANCIAL'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-emerald-50 border border-gray-200'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span>{isAr ? 'السجلات المالية والفواتير (Financial)' : 'Financial & Billing'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategory('BUSINESS')
            setPage(1)
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
            category === 'BUSINESS'
              ? 'bg-sky-700 text-white shadow-sm'
              : 'bg-white text-gray-700 hover:bg-sky-50 border border-gray-200'
          }`}
        >
          <Layers className="w-4 h-4 text-sky-600" />
          <span>{isAr ? 'بيانات الأعمال والتشغيل (Business)' : 'Business Operations'}</span>
        </button>
      </div>

      {/* =========================================================
          3. Multi-Criteria Filter Toolbar
          ========================================================= */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Action Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {isAr ? 'نوع العملية' : 'Action'}
            </label>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{isAr ? 'جميع العمليات' : 'All Actions'}</option>
              <option value="CREATE">{isAr ? 'إنشاء (CREATE)' : 'CREATE'}</option>
              <option value="UPDATE">{isAr ? 'تعديل (UPDATE)' : 'UPDATE'}</option>
              <option value="DELETE">{isAr ? 'حذف (DELETE)' : 'DELETE'}</option>
              <option value="APPROVE">{isAr ? 'اعتماد (APPROVE)' : 'APPROVE'}</option>
              <option value="REJECT">{isAr ? 'رفض (REJECT)' : 'REJECT'}</option>
              <option value="CANCEL">{isAr ? 'إلغاء (CANCEL)' : 'CANCEL'}</option>
              <option value="ARCHIVE">{isAr ? 'أرشفة (ARCHIVE)' : 'ARCHIVE'}</option>
              <option value="RESTORE">{isAr ? 'استعادة (RESTORE)' : 'RESTORE'}</option>
              <option value="LOGIN">{isAr ? 'تسجيل دخول (LOGIN)' : 'LOGIN'}</option>
              <option value="LOGOUT">{isAr ? 'تسجيل خروج (LOGOUT)' : 'LOGOUT'}</option>
              <option value="ISSUE_INVOICE">{isAr ? 'إصدار فاتورة' : 'ISSUE_INVOICE'}</option>
              <option value="ISSUE_STATEMENT">{isAr ? 'إصدار مستخلص' : 'ISSUE_STATEMENT'}</option>
              <option value="PAYMENT_RECORD">{isAr ? 'تسجيل دفعة' : 'PAYMENT_RECORD'}</option>
              <option value="AUDIT_EXPORT">{isAr ? 'تصدير سجل التدقيق' : 'AUDIT_EXPORT'}</option>
              <option value="RETENTION_CLEANUP">{isAr ? 'تنظيف دوري للسجلات' : 'RETENTION_CLEANUP'}</option>
            </select>
          </div>

          {/* Entity Type Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {isAr ? 'الكيان المتأثر' : 'Entity'}
            </label>
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{isAr ? 'جميع الكيانات' : 'All Entities'}</option>
              <option value="Invoice">{isAr ? 'الفواتير (Invoice)' : 'Invoice'}</option>
              <option value="Payment">{isAr ? 'الدفعات (Payment)' : 'Payment'}</option>
              <option value="Statement">{isAr ? 'المستخلصات (Statement)' : 'Statement'}</option>
              <option value="Client">{isAr ? 'العملاء (Client)' : 'Client'}</option>
              <option value="Site">{isAr ? 'المشاريع والمواقع (Site)' : 'Site'}</option>
              <option value="WorkEntry">{isAr ? 'الأعمال المنفذة (WorkEntry)' : 'WorkEntry'}</option>
              <option value="WorkItemTemplate">{isAr ? 'مكتبة البنود' : 'WorkItemTemplate'}</option>
              <option value="User">{isAr ? 'المستخدمين (User)' : 'User'}</option>
              <option value="OrgSettings">{isAr ? 'إعدادات المؤسسة' : 'OrgSettings'}</option>
              <option value="AuditLog">{isAr ? 'سجلات النظام' : 'AuditLog'}</option>
            </select>
          </div>

          {/* Actor User Filter */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {isAr ? 'المستخدم المنفذ' : 'Actor User'}
            </label>
            <select
              value={actorUserId}
              onChange={(e) => {
                setActorUserId(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{isAr ? 'جميع المستخدمين' : 'All Users'}</option>
              {actorsData?.map((actor: any) => (
                <option key={actor.id} value={actor.id}>
                  {actor.nameAr || actor.nameEn || actor.email} ({actor.role})
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {isAr ? 'من تاريخ' : 'Date From'}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {isAr ? 'إلى تاريخ' : 'Date To'}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {isAr ? 'بحث بالوصف أو المعرف' : 'Search Keyword'}
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder={isAr ? 'ابحث في التفاصيل...' : 'Search details...'}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="w-full pe-8 ps-3 py-2 rounded-xl border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute end-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Reset Filter Button */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
            <span className="text-gray-500">
              {isAr
                ? `مرشحات نشطة مطبقة (النتائج: ${pagination.total})`
                : `Active filters applied (Matches: ${pagination.total})`}
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>{isAr ? 'إلغاء جميع المرشحات' : 'Clear Filters'}</span>
            </button>
          </div>
        )}
      </div>

      {/* =========================================================
          4. Audit Logs Data Table
          ========================================================= */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-gray-500 space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <p className="font-medium text-sm">
              {isAr ? 'جاري تحميل سجل التدقيق...' : 'Loading audit trail records...'}
            </p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-gray-500 space-y-3">
            <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="text-base font-bold text-gray-800">
              {isAr ? 'لا توجد سجلات تدقيق مطابقة' : 'No audit records found'}
            </p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              {hasActiveFilters
                ? isAr
                  ? 'لا توجد نتائج تطابق معايير التصفية الحالية. حاول تغيير الفلاتر أو إعادة ضبطها.'
                  : 'No entries match current filter criteria. Try resetting filters.'
                : isAr
                ? 'لم يتم تسجيل أي عمليات حتى الآن في المؤسسة.'
                : 'No activities have been recorded yet.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 font-semibold text-xs hover:bg-blue-100"
              >
                {isAr ? 'إعادة ضبط المرشحات' : 'Reset Filters'}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-[#F8FAFC] text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3.5 text-start font-bold uppercase tracking-wider text-[11px]">
                      {isAr ? 'التاريخ والوقت' : 'Timestamp'}
                    </th>
                    <th className="px-4 py-3.5 text-start font-bold uppercase tracking-wider text-[11px]">
                      {isAr ? 'التصنيف' : 'Category'}
                    </th>
                    <th className="px-4 py-3.5 text-start font-bold uppercase tracking-wider text-[11px]">
                      {isAr ? 'العملية' : 'Action'}
                    </th>
                    <th className="px-4 py-3.5 text-start font-bold uppercase tracking-wider text-[11px]">
                      {isAr ? 'المستخدم (المنفذ)' : 'Actor User'}
                    </th>
                    <th className="px-4 py-3.5 text-start font-bold uppercase tracking-wider text-[11px]">
                      {isAr ? 'الكيان المتأثر' : 'Entity'}
                    </th>
                    <th className="px-4 py-3.5 text-start font-bold uppercase tracking-wider text-[11px]">
                      {isAr ? 'تفاصيل السجل' : 'Details / Reason'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderCategoryBadge(log.category)}
                      </td>

                      {/* Action Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderActionBadge(log.action)}
                      </td>

                      {/* Actor User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold shrink-0">
                            {log.user?.nameAr?.charAt(0) ||
                              log.user?.email?.charAt(0).toUpperCase() ||
                              '?'}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900 block leading-tight">
                              {log.user?.nameAr || log.user?.nameEn || log.user?.email || '-'}
                            </span>
                            {log.user?.email && (
                              <span className="text-[10px] text-gray-400 block font-mono">
                                {log.user.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Entity */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-gray-800 font-mono">
                          {log.entityType}
                        </span>
                        {log.entityId && (
                          <span
                            className="block text-[10px] text-gray-400 font-mono truncate max-w-[120px]"
                            title={log.entityId}
                          >
                            #{log.entityId.slice(0, 8)}...
                          </span>
                        )}
                      </td>

                      {/* Details / Payload summary */}
                      <td className="px-4 py-3 text-gray-600 max-w-xs break-words">
                        {log.details ? (
                          typeof log.details === 'object' ? (
                            <span className="font-mono text-[11px] bg-gray-50 px-2 py-0.5 rounded border border-gray-100 block truncate">
                              {JSON.stringify(log.details)}
                            </span>
                          ) : (
                            <span>{String(log.details)}</span>
                          )
                        ) : log.description ? (
                          <span>{log.description}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="px-4 py-3.5 border-t border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
              <span className="font-semibold">
                {isAr
                  ? `إجمالي السجلات: ${pagination.total} (صفحة ${pagination.page} من ${pagination.totalPages})`
                  : `Total Records: ${pagination.total} (Page ${pagination.page} of ${pagination.totalPages})`}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white font-semibold shadow-2xs hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {isAr ? 'السابق' : 'Previous'}
                </button>
                <span className="px-3 py-1 font-mono font-bold bg-white rounded-lg border border-gray-200">
                  {page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white font-semibold shadow-2xs hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {isAr ? 'التالي' : 'Next'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* =========================================================
          5. Retention & Safe Cleanup Modal (2-Step Safety Workflow)
          ========================================================= */}
      {isRetentionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#18324B] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-[#E29A26]" />
                <div>
                  <h3 className="text-lg font-bold">
                    {isAr
                      ? 'سياسة حفظ السجلات والتنظيف الآمن'
                      : 'Audit Log Retention & Controlled Cleanup'}
                  </h3>
                  <p className="text-xs text-gray-300">
                    {isAr
                      ? 'إدارة دورة حياة السجلات مع ضمان الحماية القانونية للسجلات الضريبية والمالية'
                      : 'Manage lifecycle retention with strict preservation of tax & financial logs'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRetentionModalOpen(false)}
                className="text-gray-300 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              {/* Important ZATCA & Legal Safeguard Notice */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                  <span>
                    {isAr
                      ? 'ضمان الحماية القانونية والضريبية (ZATCA / هيئة الزكاة)'
                      : 'Legal & Tax Retention Safeguard (ZATCA)'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-amber-800">
                  {isAr
                    ? 'بموجب أنظمة الفوترة الإلكترونية السعودية (ZATCA) والمعايير المحاسبية، فإن جميع السجلات المتعلقة بالفواتير (Invoice)، الدفعات (Payment)، والمستخلصات (Statement) محمية تماماً وغير قابلة للحذف بأي شكل، وسيتم استثناؤها تلقائياً وحفظها دائماً.'
                    : 'Per Saudi ZATCA e-invoicing and accounting retention mandates, all financial records (Invoices, Payments, Statements) are strictly protected and permanently preserved. They cannot be purged.'}
                </p>
              </div>

              {/* Step 1: Retention Period Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  {isAr ? '1. حدد فترة الحفظ (حذف السجلات الأقدم من)' : '1. Select Retention Period'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[30, 60, 90, 180, 365].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setRetentionDays(days)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                        retentionDays === days
                          ? 'bg-[#18324B] text-white border-[#18324B] shadow-2xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {isAr ? `${days} يوم` : `${days} days`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Live Preview Calculation */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-700">
                    {isAr ? '2. نتائج تحليل الحفظ المؤهلة للتنظيف' : '2. Retention Impact Preview'}
                  </span>
                  {isPreviewLoading && (
                    <span className="text-blue-600 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {isAr ? 'جاري التحليل...' : 'Calculating...'}
                    </span>
                  )}
                </div>

                {previewData && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-2xs">
                        <span className="text-[11px] text-gray-500 block">
                          {isAr ? 'إجمالي السجلات' : 'Total Records'}
                        </span>
                        <span className="text-base font-extrabold text-gray-900 font-mono">
                          {previewData.systemTotalRecords ??
                            previewData.totalRecords ??
                            ((previewData.totalEligibleCount ?? 0) +
                              (previewData.protectedCount ?? 0))}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-2xs">
                        <span className="text-[11px] text-emerald-700 font-semibold block">
                          {isAr ? 'السجلات المحمية (لا تُحذف)' : 'Protected (Retained)'}
                        </span>
                        <span className="text-base font-extrabold text-emerald-800 font-mono">
                          {previewData.protectedRecords ?? previewData.protectedCount ?? 0}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-rose-200 shadow-2xs">
                        <span className="text-[11px] text-rose-700 font-semibold block">
                          {isAr ? 'المؤهلة للتنظيف' : 'Eligible to Purge'}
                        </span>
                        <span className="text-base font-extrabold text-rose-800 font-mono">
                          {previewData.eligibleRecords ?? previewData.totalEligibleCount ?? 0}
                        </span>
                      </div>
                    </div>

                    {(previewData.eligibleRecords ?? previewData.totalEligibleCount ?? 0) === 0 && (
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                          <span>
                            {isAr ? 'لا توجد سجلات مؤهلة للحذف' : 'No Records Eligible for Purge'}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-blue-800">
                          {isAr
                            ? (previewData.explanationReason ||
                              'جميع سجلات النظام الحالية أُنشئت حديثاً وهي أحدث من تاريخ الفرز ومحمية ضمن فترة الامتثال.')
                            : (previewData.explanationReasonEn ||
                              'All current system records were created recently and are newer than the cutoff date or protected.')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {previewData?.cutoffDate && (
                  <p className="text-[11px] text-gray-500">
                    {isAr
                      ? `تاريخ الفرز: السجلات التي أُنشئت قبل ${new Date(
                          previewData.cutoffDate
                        ).toLocaleDateString()}`
                      : `Cutoff Date: records created before ${new Date(
                          previewData.cutoffDate
                        ).toLocaleDateString()}`}
                  </p>
                )}
              </div>

              {/* Step 3: Explicit Acknowledgment and Token Confirmation */}
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policyAcknowledged}
                    onChange={(e) => setPolicyAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-700 leading-snug">
                    {isAr
                      ? 'أقر بأنني اطلعت على سياسة حفظ السجلات، وأفهم أن هذا الإجراء سيقوم بحذف السجلات الإدارية المؤهلة فقط مع الحفاظ الكامل على السجلات المالية والضريبية، وتوثيق هذا الإجراء في سجل التدقيق.'
                      : 'I acknowledge that I reviewed the retention policy. Only non-financial eligible logs will be purged, and this operation will be immutably recorded in the audit trail.'}
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    {isAr
                      ? 'للتأكيد، اكتب رمز التأكيد أدناه بالضبط:'
                      : 'To confirm, type the confirmation token exactly:'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="CONFIRM_AUDIT_LOG_CLEANUP"
                      value={confirmToken}
                      onChange={(e) => setConfirmToken(e.target.value)}
                      className="px-3.5 py-2 rounded-xl border border-gray-300 font-mono text-xs w-full bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <span className="text-[11px] font-mono font-bold text-gray-500 shrink-0 bg-gray-100 px-2.5 py-2 rounded-xl border border-gray-200">
                      CONFIRM_AUDIT_LOG_CLEANUP
                    </span>
                  </div>
                </div>
              </div>

              {/* Result & Error Feedback */}
              {cleanupResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {isAr
                      ? `تم تنظيف ${cleanupResult.count} سجل مؤهل بنجاح في ${cleanupResult.date}. تم توثيق العملية في سجل التدقيق.`
                      : `Successfully purged ${cleanupResult.count} eligible records at ${cleanupResult.date}. Operation documented in audit trail.`}
                  </span>
                </div>
              )}

              {cleanupError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{cleanupError}</span>
                </div>
              )}

              {/* Development Mode: Reset Test Audit Logs */}
              {previewData?.isDevelopment && (
                <div className="p-4 rounded-xl border border-dashed border-purple-300 bg-purple-50/50 space-y-3 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white uppercase">
                      {isAr ? 'بيئة التطوير والاختبار' : 'Development Only'}
                    </span>
                    <h4 className="text-xs font-bold text-purple-950">
                      {isAr
                        ? 'إعادة ضبط سجلات الفحص والتطوير (Reset Test Logs)'
                        : 'Reset Test & Debug Audit Logs'}
                    </h4>
                  </div>
                  <p className="text-[11px] leading-relaxed text-purple-900">
                    {isAr
                      ? 'يتيح هذا الخيار تنظيف السجلات الاختبارية المتراكمة (محاولات تسجيل الدخول، أرشفة السجلات التجريبية) مع الحفاظ التام والمطلق على كافة فواتير المشاريع، المستخلصات، قيود الأعمال، وسجلات التدقيق النظامية.'
                      : 'Safely purges development test noise and login records while strictly preserving all invoices, payments, statements, work items, and statutory logs.'}
                  </p>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-purple-900">
                      {isAr
                        ? 'لتأكيد تفريغ سجلات الفحص، اكتب:'
                        : 'To confirm test log reset, type:'}{' '}
                      <code className="text-purple-700 bg-purple-100 px-1 py-0.5 rounded font-mono">
                        RESET_TEST_AUDIT_LOGS
                      </code>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="RESET_TEST_AUDIT_LOGS"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 font-mono text-xs w-full bg-white outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        data-testid="reset-test-logs-btn"
                        disabled={resetToken.trim() !== 'RESET_TEST_AUDIT_LOGS' || resetMutation.isPending}
                        onClick={() => resetMutation.mutate()}
                        className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold disabled:opacity-40 whitespace-nowrap shadow-xs"
                      >
                        {resetMutation.isPending
                          ? isAr
                            ? 'جارٍ الضبط...'
                            : 'Resetting...'
                          : isAr
                          ? 'إعادة ضبط سجلات الفحص'
                          : 'Reset Test Logs'}
                      </button>
                    </div>
                  </div>

                  {resetResult && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {isAr
                          ? `تم تنظيف ${resetResult.count} سجل اختباري بنجاح في ${resetResult.date}. تم توثيق الحدث كـ RESET_TEST_LOGS.`
                          : `Successfully purged ${resetResult.count} test logs at ${resetResult.date}. Operation recorded in security audit trail.`}
                      </span>
                    </div>
                  )}

                  {resetError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{resetError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsRetentionModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 transition-colors"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>

              <button
                type="button"
                data-testid="execute-cleanup-btn"
                disabled={
                  !policyAcknowledged ||
                  confirmToken.trim() !== 'CONFIRM_AUDIT_LOG_CLEANUP' ||
                  cleanupMutation.isPending ||
                  (previewData &&
                    (previewData.eligibleRecords ?? previewData.totalEligibleCount ?? 0) === 0)
                }
                onClick={() => cleanupMutation.mutate()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {cleanupMutation.isPending
                    ? isAr
                      ? 'جاري التنظيف...'
                      : 'Executing...'
                    : isAr
                    ? 'تنفيذ التنظيف الآمن'
                    : 'Execute Safe Cleanup'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
