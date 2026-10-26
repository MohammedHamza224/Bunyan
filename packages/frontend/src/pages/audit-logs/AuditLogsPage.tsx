import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  Trash2,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Layers,
  DollarSign,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  FileCode,
  Terminal,
  Activity,
  AlertCircle,
  Sparkles,
  SlidersHorizontal,
  Eye,
  Calendar,
  ExternalLink,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { AuditDetailModal } from '../../components/audit/AuditDetailModal'
import { RecordLink } from '../../components/audit/RecordLink'
import {
  getActionLabel,
  getEntityLabel,
  getActionBadgeStyle,
  formatAuditReference,
  formatAuditDescription,
} from '../../lib/auditFormatters'

type AuditCategory = 'ALL' | 'FINANCIAL' | 'BUSINESS' | 'SECURITY' | 'TECHNICAL_DIAGNOSTIC'
type CleanupTab = 'RETENTION' | 'CLEAR_DEV'

interface AuditRecord {
  id: string
  createdAt: string
  action: string
  entityType: string
  entityId?: string
  description?: string
  category?: string
  ipAddress?: string
  userAgent?: string
  user?: {
    id: string
    nameAr?: string
    nameEn?: string
    email?: string
    role?: string
  }
  metadata?: Record<string, any>
}

export function AuditLogsPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const isAdmin = user?.role === 'ORG_ADMIN' || user?.role === 'SUPER_ADMIN'

  // Filter state
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<AuditCategory>('ALL')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [entityType, setEntityType] = useState('')
  const [actorUserId, setActorUserId] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const limit = 20

  // Details Modal State
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null)

  // Export State
  const [isExporting, setIsExporting] = useState(false)
  const [exportFeedback, setExportFeedback] = useState<string | null>(null)

  // Direct Clear Audit Log State
  const [isClearModalOpen, setIsClearModalOpen] = useState(false)
  const [isConfirmChecked, setIsConfirmChecked] = useState(false)
  const [clearFeedback, setClearFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Cleanup & Retention Modal State
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false)
  const [activeCleanupTab, setActiveCleanupTab] = useState<CleanupTab>('RETENTION')
  const [retentionDays, setRetentionDays] = useState(90)
  const [confirmToken, setConfirmToken] = useState('')
  const [policyAcknowledged, setPolicyAcknowledged] = useState(false)
  const [clearDevToken, setClearDevToken] = useState('')
  const [showPolicyDetails, setShowPolicyDetails] = useState(false)
  const [operationFeedback, setOperationFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // 1. Fetch Executive Stats
  const { data: statsData, isFetching: isStatsFetching, refetch: refetchStats } = useQuery({
    queryKey: ['auditLogsStats'],
    queryFn: async () => {
      const res = await api.get('/audit-logs/stats')
      return res.data?.data
    },
    enabled: isAdmin,
  })

  // 2. Fetch Actors for filter
  const { data: actorsData } = useQuery({
    queryKey: ['auditLogActors'],
    queryFn: async () => {
      const res = await api.get('/audit-logs/actors')
      return res.data?.data || []
    },
    enabled: isAdmin && isAdvancedFiltersOpen,
  })

  // 3. Fetch Audit Logs
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      'auditLogs',
      { category, action, entityType, actorUserId, dateFrom, dateTo, search, eligibility, page, limit },
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
      if (eligibility) params.eligibility = eligibility

      const res = await api.get('/audit-logs', { params })
      return res.data?.data
    },
  })

  // 4. Query Retention Preview when modal opens
  const {
    data: previewData,
    isLoading: isPreviewLoading,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: ['retentionPreview', retentionDays],
    queryFn: async () => {
      const res = await api.post('/audit-logs/cleanup/preview', {
        olderThanDays: retentionDays,
      })
      return res.data?.data
    },
    enabled: isCleanupModalOpen && activeCleanupTab === 'RETENTION' && isAdmin,
  })

  const handleRefreshAll = () => {
    refetch()
    refetchStats()
    if (isCleanupModalOpen) refetchPreview()
  }

  // Mutation: Direct Clear Audit Log
  const clearAuditLogMutation = useMutation({
    mutationFn: async (payload: { confirmed: boolean; preserveStatutory?: boolean }) => {
      const res = await api.post('/audit-logs/clear', payload)
      return res.data?.data || res.data
    },
    onSuccess: (resData) => {
      setIsClearModalOpen(false)
      setIsConfirmChecked(false)
      setPage(1)
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogsStats'] })
      queryClient.invalidateQueries({ queryKey: ['retentionPreview'] })
      setClearFeedback({
        type: 'success',
        message:
          resData?.message ||
          (isAr
            ? `تم تفريغ ${resData?.purgedCount ?? 0} سجل تدقيق بنجاح.`
            : `Successfully cleared ${resData?.purgedCount ?? 0} audit logs.`),
      })
      setTimeout(() => setClearFeedback(null), 6000)
    },
    onError: (err: any) => {
      setClearFeedback({
        type: 'error',
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          (isAr ? 'تعذر تفريغ سجل التدقيق' : 'Failed to clear audit log'),
      })
    },
  })

  // Mutation: Execute Retention Cleanup
  const retentionCleanupMutation = useMutation({
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
    onSuccess: (resData) => {
      setOperationFeedback({
        type: 'success',
        message: isAr
          ? `تم حذف ${resData?.purgedCount ?? 0} سجل منتهي الصلاحية بنجاح. المتبقي: ${resData?.remainingCount ?? 0}.`
          : `Successfully purged ${resData?.purgedCount ?? 0} expired records. Remaining: ${resData?.remainingCount ?? 0}.`,
      })
      setConfirmToken('')
      setPolicyAcknowledged(false)
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogsStats'] })
      queryClient.invalidateQueries({ queryKey: ['retentionPreview'] })
    },
    onError: (err: any) => {
      setOperationFeedback({
        type: 'error',
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          (isAr ? 'فشلت عملية تنظيف السجلات' : 'Retention cleanup failed'),
      })
    },
  })

  // Mutation: Clear Development / Test Logs
  const clearDevLogsMutation = useMutation({
    mutationFn: async () => {
      const trimmed = clearDevToken.trim().toUpperCase()
      const res = await api.post('/audit-logs/cleanup/dev-test', {
        confirmationToken: trimmed,
        confirmToken: trimmed,
        recordSecurityLog: false,
      })
      return res.data?.data || res.data
    },
    onSuccess: (resData) => {
      setOperationFeedback({
        type: 'success',
        message: isAr
          ? `تم تفريغ ${resData?.purgedCount ?? 0} سجل اختبار بنجاح، مع الحفاظ الكامل على ${resData?.preservedCount ?? 0} سجل مالي وضريبي.`
          : `Successfully cleared ${resData?.purgedCount ?? 0} test/dev logs while strictly preserving ${resData?.preservedCount ?? 0} financial records.`,
      })
      setClearDevToken('')
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogsStats'] })
      queryClient.invalidateQueries({ queryKey: ['retentionPreview'] })
    },
    onError: (err: any) => {
      setOperationFeedback({
        type: 'error',
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          (isAr ? 'فشلت عملية تفريغ سجلات الاختبار' : 'Failed to clear development logs'),
      })
    },
  })

  const logs: AuditRecord[] = data?.items || []
  const pagination = {
    page: data?.page || 1,
    totalPages: data?.totalPages || 1,
    total: data?.total || 0,
  }

  const hasActiveFilters = Boolean(
    search.trim() ||
      category !== 'ALL' ||
      action ||
      dateFrom ||
      dateTo ||
      entityType ||
      actorUserId ||
      eligibility
  )

  const handleResetFilters = () => {
    setSearch('')
    setCategory('ALL')
    setAction('')
    setDateFrom('')
    setDateTo('')
    setEntityType('')
    setActorUserId('')
    setEligibility('')
    setPage(1)
  }

  // Handle CSV Export
  const handleExportCsv = async () => {
    try {
      setIsExporting(true)
      setExportFeedback(null)

      const params = new URLSearchParams()
      if (category !== 'ALL') params.append('category', category)
      if (action) params.append('action', action)
      if (entityType) params.append('entityType', entityType)
      if (actorUserId) params.append('userId', actorUserId)
      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (search.trim()) params.append('search', search.trim())
      if (eligibility) params.append('eligibility', eligibility)

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

      setExportFeedback(
        isAr ? 'تم تصدير سجل العمليات بنجاح' : 'Audit log exported successfully'
      )
      setTimeout(() => setExportFeedback(null), 4000)
    } catch {
      alert(
        isAr
          ? 'تعذر تصدير السجل، تأكد من صلاحيات حسابك.'
          : 'Failed to export audit logs. Please verify permissions.'
      )
    } finally {
      setIsExporting(false)
    }
  }

  // Badges
  const renderActionBadge = (act: string) => {
    let color = 'bg-gray-100 text-gray-800 border-gray-200'
    if (act.includes('DELETE') || act.includes('PURGE') || act.includes('CANCEL')) {
      color = 'bg-rose-50 text-rose-700 border-rose-200'
    } else if (act.includes('APPROVE') || act.includes('ISSUE')) {
      color = 'bg-emerald-50 text-emerald-700 border-emerald-200'
    } else if (act.includes('UPDATE')) {
      color = 'bg-amber-50 text-amber-700 border-amber-200'
    } else if (act.includes('LOGIN') || act.includes('LOGOUT')) {
      color = 'bg-blue-50 text-blue-700 border-blue-200'
    }

    return (
      <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${color}`}>
        {act}
      </span>
    )
  }

  return (
    <div className="space-y-5">
      {/* =========================================================
          Area 1: Compact Page Header
          ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white px-5 py-4 rounded-xl border border-gray-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            {isAr ? 'سجل التدقيق' : 'Audit Log'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {isAr
              ? 'متابعة العمليات والتغييرات المهمة داخل النظام.'
              : 'Monitor key operations and changes across the system.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isFetching || isStatsFetching}
            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
            title={isAr ? 'تحديث السجلات' : 'Refresh'}
            aria-label={isAr ? 'تحديث السجلات' : 'Refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching || isStatsFetching ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* Primary Action Button: Export Log */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {isExporting
                ? isAr
                  ? 'جاري التصدير...'
                  : 'Exporting...'
                : isAr
                ? 'تصدير السجل'
                : 'Export Log'}
            </span>
          </button>

          {/* Action Button: Clear Audit Log */}
          {isAdmin && (
            <button
              type="button"
              data-testid="clear-audit-log-btn"
              onClick={() => {
                setIsConfirmChecked(false)
                setIsClearModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold shadow-2xs transition-colors"
              title={isAr ? 'تفريغ سجل التدقيق' : 'Clear Audit Log'}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>{isAr ? 'تفريغ سجل التدقيق' : 'Clear Audit Log'}</span>
            </button>
          )}

          {/* Secondary Action Button: Manage Retention */}
          {isAdmin && (
            <button
              type="button"
              data-testid="audit-retention-modal-btn"
              onClick={() => {
                setOperationFeedback(null)
                setIsCleanupModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-2xs"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>{isAr ? 'إدارة الاحتفاظ بالسجلات' : 'Manage Log Retention'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Clear Audit Log Toast Feedback */}
      {clearFeedback && (
        <div
          className={`px-4 py-2.5 rounded-lg border text-xs flex items-center justify-between ${
            clearFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {clearFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{clearFeedback.message}</span>
          </div>
          <button type="button" onClick={() => setClearFeedback(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Export Toast Feedback */}
      {exportFeedback && (
        <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{exportFeedback}</span>
          </div>
          <button type="button" onClick={() => setExportFeedback(null)}>
            <X className="w-3.5 h-3.5 text-emerald-600" />
          </button>
        </div>
      )}

      {/* =========================================================
          Area 2: Three Summary Cards Only
          ========================================================= */}
      {isAdmin && statsData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5" data-testid="audit-summary-cards">
          {/* Card 1: Total Audit Records */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-gray-500 block">
                {isAr ? 'إجمالي السجلات' : 'Total Audit Records'}
              </span>
              <span className="text-2xl font-bold text-gray-900 font-mono mt-1 block">
                {statsData.totalRecords ?? 0}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Today's Events */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-gray-500 block">
                {isAr ? 'عمليات اليوم' : 'Audit Events Recorded Today'}
              </span>
              <span className="text-2xl font-bold text-gray-900 font-mono mt-1 block">
                {statsData.todayRecords ?? 0}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Protected Records */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-gray-500 block">
                {isAr ? 'سجلات محمية' : 'Protected Records'}
              </span>
              <span className="text-2xl font-bold text-emerald-700 font-mono mt-1 block">
                {statsData.protectedCount ?? 0}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          Area 3: Consolidated Search and Filters
          ========================================================= */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
        {/* Primary Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-2.5">
          {/* Search Query */}
          <div className="lg:col-span-4 relative">
            <input
              type="text"
              placeholder={isAr ? 'بحث بالمستخدم، المعرف، الوصف...' : 'Search by user, record ID, description...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="w-full pe-8 ps-3 py-2 rounded-lg border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute end-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Record Category */}
          <div className="lg:col-span-3">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as AuditCategory)
                setPage(1)
              }}
              className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">{isAr ? 'جميع التصنيفات' : 'All Categories'}</option>
              <option value="FINANCIAL">{isAr ? 'مالي وضريبي (فواتير/دفعات)' : 'Financial & Tax'}</option>
              <option value="BUSINESS">{isAr ? 'أعمال ومشاريع (مستخلصات/بنود)' : 'Business & Projects'}</option>
              <option value="SECURITY">{isAr ? 'أمان ومستخدمين (تسجيل/صلاحيات)' : 'Security & Access'}</option>
              <option value="TECHNICAL_DIAGNOSTIC">{isAr ? 'تقني وتشخيص' : 'Technical & Diagnostics'}</option>
            </select>
          </div>

          {/* Action Type */}
          <div className="lg:col-span-2">
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setPage(1)
              }}
              className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{isAr ? 'جميع العمليات' : 'All Actions'}</option>
              <option value="CREATE">{isAr ? 'إنشاء' : 'CREATE'}</option>
              <option value="UPDATE">{isAr ? 'تعديل' : 'UPDATE'}</option>
              <option value="DELETE">{isAr ? 'حذف' : 'DELETE'}</option>
              <option value="APPROVE">{isAr ? 'اعتماد' : 'APPROVE'}</option>
              <option value="CANCEL">{isAr ? 'إلغاء' : 'CANCEL'}</option>
              <option value="LOGIN">{isAr ? 'دخول' : 'LOGIN'}</option>
              <option value="LOGOUT">{isAr ? 'خروج' : 'LOGOUT'}</option>
              <option value="ISSUE_INVOICE">{isAr ? 'إصدار فاتورة' : 'ISSUE_INVOICE'}</option>
              <option value="PAYMENT_RECORD">{isAr ? 'تسجيل دفعة' : 'PAYMENT_RECORD'}</option>
              <option value="ISSUE_STATEMENT">{isAr ? 'إصدار مستخلص' : 'ISSUE_STATEMENT'}</option>
            </select>
          </div>

          {/* Advanced Filters Toggle & Reset */}
          <div className="lg:col-span-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                isAdvancedFiltersOpen || dateFrom || dateTo || entityType || actorUserId || eligibility
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{isAr ? 'فلاتر متقدمة' : 'Advanced Filters'}</span>
              {isAdvancedFiltersOpen ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 text-xs font-medium transition-colors"
                title={isAr ? 'مسح الفلاتر' : 'Clear Filters'}
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
                <span className="hidden sm:inline">{isAr ? 'مسح' : 'Clear'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Filters Section */}
        {isAdvancedFiltersOpen && (
          <div className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Date From */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">
                {isAr ? 'من تاريخ' : 'From Date'}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">
                {isAr ? 'إلى تاريخ' : 'To Date'}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">
                {isAr ? 'الكيان المتأثر' : 'Affected Entity'}
              </label>
              <select
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value)
                  setPage(1)
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{isAr ? 'جميع الكيانات' : 'All Entities'}</option>
                <option value="Invoice">{isAr ? 'فاتورة (Invoice)' : 'Invoice'}</option>
                <option value="Payment">{isAr ? 'دفعة (Payment)' : 'Payment'}</option>
                <option value="Statement">{isAr ? 'مستخلص (Statement)' : 'Statement'}</option>
                <option value="Client">{isAr ? 'عميل (Client)' : 'Client'}</option>
                <option value="Site">{isAr ? 'موقع / مشروع (Site)' : 'Site'}</option>
                <option value="WorkEntry">{isAr ? 'سجل أعمال (WorkEntry)' : 'WorkEntry'}</option>
                <option value="User">{isAr ? 'مستخدم (User)' : 'User'}</option>
                <option value="AuditLog">{isAr ? 'سجل نظام (AuditLog)' : 'AuditLog'}</option>
              </select>
            </div>

            {/* Actor User */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">
                {isAr ? 'المستخدم المنفذ' : 'Actor User'}
              </label>
              <select
                value={actorUserId}
                onChange={(e) => {
                  setActorUserId(e.target.value)
                  setPage(1)
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{isAr ? 'جميع المستخدمين' : 'All Users'}</option>
                {actorsData?.map((actor: any) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.nameAr || actor.nameEn || actor.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
            <span>
              {isAr
                ? `النتائج المطابقة: ${pagination.total} سجل`
                : `Matches found: ${pagination.total} records`}
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              {isAr ? 'مسح الفلاتر' : 'Clear Filters'}
            </button>
          </div>
        )}
      </div>

      {/* =========================================================
          Area 4: Audit Records Table
          ========================================================= */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden" data-testid="audit-table-card">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
            <p className="text-xs font-medium">
              {isAr ? 'جاري تحميل السجلات...' : 'Loading audit records...'}
            </p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-sm font-semibold text-gray-800">
              {isAr ? 'لا توجد سجلات تدقيق' : 'No audit records found'}
            </p>
            <p className="text-xs text-gray-400">
              {hasActiveFilters
                ? isAr
                  ? 'لا توجد نتائج تطابق معايير التصفية المحددة.'
                  : 'No entries match your search criteria.'
                : isAr
                ? 'سجل التدقيق فارغ حالياً.'
                : 'The audit log is currently clean.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                {isAr ? 'مسح الفلاتر والبدء من جديد' : 'Clear filters'}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] print:min-w-0 text-xs text-start">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'التاريخ والوقت' : 'Date & Time'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'المستخدم' : 'User'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'العملية' : 'Action'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'السجل المرتبط' : 'Affected Record'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'التفاصيل' : 'Description'}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold">
                      {isAr ? 'الإجراءات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => {
                    const userName =
                      log.user?.nameAr ||
                      log.user?.nameEn ||
                      log.user?.email ||
                      (isAr ? 'النظام' : 'System')
                    const userInitial = userName.charAt(0).toUpperCase()
                    const actionLabel = getActionLabel(log.action, log.entityType, isAr)
                    const entityLabel = getEntityLabel(log.entityType, isAr)
                    const badgeStyle = getActionBadgeStyle(log.action)
                    const refInfo = formatAuditReference(log, isAr)
                    const displayDesc = formatAuditDescription(log, isAr)

                    return (
                      <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                        {/* Timestamp */}
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 font-mono">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>
                              {new Date(log.createdAt).toLocaleString(
                                isAr ? 'ar-SA' : 'en-US',
                                {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                }
                              )}
                            </span>
                          </div>
                        </td>

                        {/* User */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                              {userInitial}
                            </div>
                            <span className="font-medium text-gray-800">
                              {userName}
                            </span>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                          >
                            {actionLabel}
                          </span>
                        </td>

                        {/* Affected Record */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-800">
                                {entityLabel}
                              </span>
                              {refInfo.isDeleted && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                  {isAr ? 'سجل محذوف' : 'Deleted'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[11px] font-mono text-blue-700 font-medium">
                                {refInfo.primary}
                              </span>
                              {refInfo.secondary && (
                                <span
                                  className="text-[10px] font-mono text-gray-400 truncate max-w-[120px]"
                                  title={log.entityId}
                                >
                                  ({refInfo.secondary})
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Details (Short) */}
                        <td className="px-4 py-3 text-gray-600 max-w-sm truncate" title={displayDesc}>
                          {displayDesc}
                        </td>

                        {/* Actions Column */}
                        <td className="px-4 py-3 text-end whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {refInfo.url && (
                              <RecordLink
                                to={refInfo.url}
                                title={isAr ? `انتقال إلى ${entityLabel}` : `View ${entityLabel} Record`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-gray-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">{isAr ? 'السجل' : 'Record'}</span>
                              </RecordLink>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedRecord(log)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{isAr ? 'عرض التفاصيل' : 'View Details'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Compact Pagination */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
              <span>
                {isAr
                  ? `صفحة ${pagination.page} من ${pagination.totalPages} (${pagination.total} سجل)`
                  : `Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} records)`}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2.5 py-1 rounded border border-gray-300 bg-white font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {isAr ? 'السابق' : 'Previous'}
                </button>
                <span className="px-2 font-mono text-gray-700">{page}</span>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1 rounded border border-gray-300 bg-white font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {isAr ? 'التالي' : 'Next'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* =========================================================
          Detailed View Modal (Human-Readable Business Presentation)
          ========================================================= */}
      <AuditDetailModal
        record={selectedRecord}
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        isAr={isAr}
        isAdmin={isAdmin}
      />

      {/* =========================================================
          Direct Clear Audit Log Confirmation Modal
          ========================================================= */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col animate-in fade-in-50 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-rose-50/80 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    {isAr ? 'تفريغ سجل التدقيق' : 'Clear Audit Log'}
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    {isAr ? 'حذف السجلات التشغيلية والتاريخية نهائياً' : 'Permanently remove audit records'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 text-xs text-gray-700">
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{isAr ? 'إجمالي السجلات الحالية:' : 'Total Records in Log:'}</span>
                  <span className="font-bold font-mono text-gray-900 text-sm">
                    {statsData?.totalRecords ?? pagination.total ?? 0}
                  </span>
                </div>
                {Number(statsData?.protectedCount ?? 0) > 0 && (
                  <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                    <span className="text-emerald-700 font-medium">{isAr ? 'سجلات مالية وضريبية محمية:' : 'Statutory Records Preserved:'}</span>
                    <span className="font-bold font-mono text-emerald-800">
                      {statsData?.protectedCount}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                  <span className="text-rose-700 font-medium">{isAr ? 'السجلات التاريخية المؤهلة للحذف:' : 'Eligible Historical Records:'}</span>
                  <span className="font-bold font-mono text-rose-800">
                    {Math.max(0, (statsData?.totalRecords ?? 0) - (statsData?.protectedCount ?? 0))}
                  </span>
                </div>
              </div>

              <p className="leading-relaxed text-gray-600">
                {isAr
                  ? 'سيؤدي هذا الإجراء إلى حذف سجلات التدقيق والعمليات التشغيلية (العملاء، المواقع، البنود، الأعمال المنفذة، العمليات التجريبية) نهائياً من قاعدة البيانات.'
                  : 'This action will permanently delete operational audit records (clients, sites, items, work entries, dev logs) from persistent storage.'}
              </p>

              {Number(statsData?.protectedCount ?? 0) > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    {isAr
                      ? 'حماية نظامية: سيتم الحفاظ التلقائي على السجلات المالية والضريبية (الفواتير، سندات الدفع، المستخلصات) للامتثال لمتطلبات هيئة الزكاة والضريبة والجمارك (ZATCA).'
                      : 'Statutory Safeguard: Tax invoices, payments, and progress statements are strictly preserved under ZATCA and commercial accounting regulations.'}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-gray-100">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="confirm-clear-checkbox"
                    checked={isConfirmChecked}
                    onChange={(e) => setIsConfirmChecked(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <span className="font-semibold text-gray-800 leading-snug">
                    {isAr
                      ? 'أؤكد رغبتي في تفريغ سجل التدقيق نهائياً وحذف السجلات المحددة.'
                      : 'I explicitly confirm clearing the audit log and permanently deleting the targeted records.'}
                  </span>
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                data-testid="execute-clear-audit-log-btn"
                disabled={!isConfirmChecked || clearAuditLogMutation.isPending}
                onClick={() => clearAuditLogMutation.mutate({ confirmed: true })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {clearAuditLogMutation.isPending
                    ? (isAr ? 'جارٍ التفريغ...' : 'Clearing...')
                    : (isAr ? 'تأكيد تفريغ السجل' : 'Confirm Clear')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          Simplified Retention & Cleanup Management Modal
          ========================================================= */}
      {isCleanupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gray-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">
                  {isAr ? 'إدارة الاحتفاظ بالسجلات' : 'Manage Log Retention'}
                </h3>
                <p className="text-[11px] text-gray-300 mt-0.5">
                  {isAr
                    ? 'سياسات الاحتفاظ بالسجلات مع حماية السجلات المالية والضريبية'
                    : 'Retention policies with statutory preservation'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCleanupModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50 px-5 pt-2 text-xs">
              <button
                type="button"
                data-testid="tab-retention-cleanup"
                onClick={() => {
                  setActiveCleanupTab('RETENTION')
                  setOperationFeedback(null)
                }}
                className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors ${
                  activeCleanupTab === 'RETENTION'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {isAr ? 'سياسة الاحتفاظ بالسجلات' : 'Retention Policy'}
              </button>

              {statsData?.isDevelopment && (
                <button
                  type="button"
                  data-testid="tab-clear-dev-logs"
                  onClick={() => {
                    setActiveCleanupTab('CLEAR_DEV')
                    setOperationFeedback(null)
                  }}
                  className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                    activeCleanupTab === 'CLEAR_DEV'
                      ? 'border-purple-600 text-purple-700'
                      : 'border-transparent text-purple-700/70 hover:text-purple-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>{isAr ? 'تفريغ سجلات الاختبار (تطوير)' : 'Clear Test Logs (Dev)'}</span>
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {operationFeedback && (
                <div
                  className={`p-3 rounded-lg border flex items-center gap-2 text-xs ${
                    operationFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {operationFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{operationFeedback.message}</span>
                </div>
              )}

              {/* ── TAB 1: RETENTION POLICY ── */}
              {activeCleanupTab === 'RETENTION' && (
                <div className="space-y-4">
                  {/* Period Selector */}
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1.5">
                      {isAr ? 'فترة الاحتفاظ بالسجلات:' : 'Retention Period:'}
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[30, 60, 90, 180, 365].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setRetentionDays(d)}
                          className={`py-1.5 rounded-lg font-mono font-medium border text-xs text-center transition-colors ${
                            retentionDays === d
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {d} {isAr ? 'يوم' : 'd'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview Metrics */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
                    <div>
                      <span className="text-[10px] text-gray-500 block">
                        {isAr ? 'إجمالي السجلات' : 'Total'}
                      </span>
                      <span className="text-base font-bold text-gray-900 font-mono">
                        {previewData?.systemTotalRecords ?? statsData?.totalRecords ?? 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 block font-medium">
                        {isAr ? 'محمية نظامياً' : 'Protected'}
                      </span>
                      <span className="text-base font-bold text-emerald-800 font-mono">
                        {previewData?.protectedCount ?? statsData?.protectedCount ?? 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-rose-700 block font-medium">
                        {isAr ? 'مؤهلة للحذف' : 'Eligible'}
                      </span>
                      <span className="text-base font-bold text-rose-800 font-mono">
                        {previewData?.totalEligibleCount ?? 0}
                      </span>
                    </div>
                  </div>

                  {/* Informative Note When Eligible === 0 */}
                  {previewData && (previewData.totalEligibleCount ?? 0) === 0 && (
                    <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-950 mb-1">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>{isAr ? 'لا توجد سجلات منتهية للحذف' : '0 records qualify for retention deletion'}</span>
                      </div>
                      <p>
                        {isAr
                          ? `جميع سجلات التدقيق في النظام أُنشئت حديثاً بعد تاريخ الفرز وتخضع للحماية القانونية والتلقائية ضمن فترة الاحتفاظ المحددة (${retentionDays} يوماً).`
                          : `All audit logs were created recently and are safely protected within the active ${retentionDays}-day retention policy.`}
                      </p>
                    </div>
                  )}

                  {/* Expandable Policy Explanation */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowPolicyDetails(!showPolicyDetails)}
                      className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-[11px] font-medium"
                    >
                      <span>
                        {isAr
                          ? 'تفاصيل وضمانات الحماية القانونية (ZATCA)'
                          : 'Statutory Protection Details (ZATCA)'}
                      </span>
                      {showPolicyDetails ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    {showPolicyDetails && (
                      <div className="mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-[11px] text-gray-600 space-y-1">
                        <p>
                          • {isAr ? 'الفواتير الضريبية: محمية بالكامل بموجب لوائح الفوترة الإلكترونية.' : 'Tax Invoices: Permanently preserved under ZATCA mandates.'}
                        </p>
                        <p>
                          • {isAr ? 'سندات الدفع والتحصيل: محمية بموجب نظام الدفاتر التجارية والمعايير المحاسبية.' : 'Payments: Protected under commercial accounting laws.'}
                        </p>
                        <p>
                          • {isAr ? 'مستخلصات الأعمال: مستندات تعاقدية ملزمة.' : 'Work Statements: Binding contractual milestone records.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirmation Section (Only active if eligible > 0) */}
                  {(previewData?.totalEligibleCount ?? 0) > 0 && (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={policyAcknowledged}
                          onChange={(e) => setPolicyAcknowledged(e.target.checked)}
                          className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-gray-600">
                          {isAr
                            ? 'أقر بحذف السجلات المؤهلة فقط وفق سياسة الاحتفاظ.'
                            : 'I confirm deletion of eligible records under the retention policy.'}
                        </span>
                      </label>

                      <div>
                        <label className="block text-[11px] text-gray-600 mb-1">
                          {isAr ? 'اكتب رمز التأكيد:' : 'Type confirmation token:'}{' '}
                          <code className="font-mono font-bold text-rose-700 bg-gray-100 px-1 py-0.5 rounded">
                            CONFIRM_AUDIT_LOG_CLEANUP
                          </code>
                        </label>
                        <input
                          type="text"
                          placeholder="CONFIRM_AUDIT_LOG_CLEANUP"
                          value={confirmToken}
                          onChange={(e) => setConfirmToken(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 2: DEVELOPMENT & TEST CLEANUP ── */}
              {activeCleanupTab === 'CLEAR_DEV' && (
                <div className="space-y-3.5">
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-purple-950 text-xs space-y-1">
                    <span className="font-bold flex items-center gap-1.5 text-purple-900">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      {isAr ? 'بيئة التطوير والاختبار نشطة' : 'Development Environment Active'}
                    </span>
                    <p className="text-[11px] text-purple-900/80 leading-relaxed">
                      {isAr
                        ? 'يتيح لك هذا الخيار تفريغ سجلات الفحص والاختبار (تسجيلات الدخول المتكررة، حركات المستخدمين التجريبية) مع الحفاظ التام على السجلات المالية والضريبية.'
                        : 'Allows clearing non-statutory test logs while strictly preserving all statutory financial invoices, payments, and statements.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-2.5 bg-purple-50/50 rounded-lg border border-purple-200">
                      <span className="text-[10px] text-purple-700 block">
                        {isAr ? 'سجلات تجريبية للتفريغ' : 'Test Logs to Purge'}
                      </span>
                      <span className="text-xl font-bold text-purple-900 font-mono">
                        {statsData?.eligibleDevTestCount ?? statsData?.eligibleTestDebugCount ?? 0}
                      </span>
                    </div>
                    <div className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block">
                        {isAr ? 'سجلات مالية محمية' : 'Statutory Financial Records'}
                      </span>
                      <span className="text-xl font-bold text-emerald-900 font-mono">
                        {statsData?.financialRecords ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] text-gray-600">
                      {isAr ? 'اكتب رمز التأكيد:' : 'Type confirmation token:'}{' '}
                      <code className="font-mono font-bold text-purple-800 bg-purple-50 px-1 py-0.5 rounded">
                        CONFIRM_CLEAR_DEV_LOGS
                      </code>
                    </label>
                    <input
                      type="text"
                      placeholder="CONFIRM_CLEAR_DEV_LOGS"
                      value={clearDevToken}
                      onChange={(e) => setClearDevToken(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-purple-200 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsCleanupModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>

              {activeCleanupTab === 'RETENTION' && (
                <button
                  type="button"
                  data-testid="execute-cleanup-btn"
                  disabled={
                    !policyAcknowledged ||
                    confirmToken.trim() !== 'CONFIRM_AUDIT_LOG_CLEANUP' ||
                    retentionCleanupMutation.isPending ||
                    (previewData?.totalEligibleCount ?? 0) === 0
                  }
                  onClick={() => retentionCleanupMutation.mutate()}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {retentionCleanupMutation.isPending
                    ? isAr
                      ? 'جارٍ الحذف...'
                      : 'Purging...'
                    : isAr
                    ? 'تنفيذ الحذف'
                    : 'Execute Purge'}
                </button>
              )}

              {activeCleanupTab === 'CLEAR_DEV' && (
                <button
                  type="button"
                  data-testid="execute-clear-dev-btn"
                  disabled={
                    !['CONFIRM_CLEAR_DEV_LOGS', 'CLEAR_TEST_LOGS', 'RESET_TEST_AUDIT_LOGS'].includes(
                      clearDevToken.trim().toUpperCase()
                    ) ||
                    clearDevLogsMutation.isPending ||
                    (statsData?.eligibleDevTestCount ?? statsData?.eligibleTestDebugCount ?? 0) === 0
                  }
                  onClick={() => clearDevLogsMutation.mutate()}
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {clearDevLogsMutation.isPending
                    ? isAr
                      ? 'جارٍ التفريغ...'
                      : 'Clearing...'
                    : isAr
                    ? 'تفريغ سجلات الاختبار الآن'
                    : 'Clear Test Logs'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
