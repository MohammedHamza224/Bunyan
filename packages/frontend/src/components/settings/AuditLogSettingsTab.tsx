import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Activity,
  Save,
  Sparkles,
  Search,
  X,
  Eye,
  ChevronDown,
  ChevronUp,
  Layers,
  Lock,
  RotateCcw,
  AlertTriangle,
  FileText,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react'
import { api } from '../../lib/api'
import { AuditDetailModal } from '../audit/AuditDetailModal'
import { RecordLink } from '../audit/RecordLink'
import {
  getActionLabel,
  getEntityLabel,
  getActionBadgeStyle,
  formatAuditReference,
  formatAuditDescription,
} from '../../lib/auditFormatters'

interface AuditLogSettingsTabProps {
  isAr: boolean
  isAdmin: boolean
}

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

export function AuditLogSettingsTab({ isAr, isAdmin }: AuditLogSettingsTabProps) {
  const queryClient = useQueryClient()

  // Area B Filters & Pagination State
  const [search, setSearch] = useState('')
  const [selectedEntity, setSelectedEntity] = useState('')
  const [selectedAction, setSelectedAction] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  // Area C Retention & Archiving State
  const [isRetentionSectionOpen, setIsRetentionSectionOpen] = useState(true)
  const [retentionTab, setRetentionTab] = useState<'ROUTINE' | 'DEV_RESET'>('ROUTINE')
  const [retentionDays, setRetentionDays] = useState('90')
  const [purgeFeedback, setPurgeFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Policy Settings State
  const [policyDays, setPolicyDays] = useState(90)
  const [autoCleanup, setAutoCleanup] = useState(false)

  // Modals State
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null)
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false)

  // Development Reset State
  const [resetToken, setResetToken] = useState('')
  const [wipeAllInDev, setWipeAllInDev] = useState(false)
  const [resetFeedback, setResetFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Technical Cleanup State
  const [cleanTechFeedback, setCleanTechFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // 1. Fetch Executive Stats for Area A
  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ['auditLogsStats'],
    queryFn: async () => {
      const res = await api.get('/audit-logs/stats')
      return res.data?.data
    },
  })

  // 2. Query Audit Logs for Area B Table
  const { data: logsData, isLoading: isLogsLoading, isFetching: isLogsFetching } = useQuery({
    queryKey: [
      'auditLogs',
      { search, selectedEntity, selectedAction, selectedCategory, dateFrom, dateTo, page, limit },
    ],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (search.trim()) params.append('search', search.trim())
      if (selectedEntity) params.append('entityType', selectedEntity)
      if (selectedAction) params.append('action', selectedAction)
      if (selectedCategory) params.append('category', selectedCategory)
      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)

      const res = await api.get(`/audit-logs?${params.toString()}`)
      return res.data?.data
    },
  })

  const auditItems: AuditRecord[] = logsData?.items || []
  const totalRecords = logsData?.total || 0
  const totalPages = logsData?.totalPages || 1

  // 3. Query Retention Policy for Area C
  const { data: policyData } = useQuery({
    queryKey: ['auditRetentionPolicy'],
    queryFn: async () => {
      const res = await api.get('/audit-logs/retention-policy')
      return res.data?.data
    },
    enabled: isAdmin,
  })

  useEffect(() => {
    if (policyData) {
      if (policyData.auditRetentionDays) {
        setPolicyDays(policyData.auditRetentionDays)
        setRetentionDays(String(policyData.auditRetentionDays))
      }
      if (policyData.autoCleanupAuditLogs !== undefined) {
        setAutoCleanup(policyData.autoCleanupAuditLogs)
      }
    }
  }, [policyData])

  // 4. Query Retention Preview for Area C
  const { data: previewData, isLoading: isPreviewLoading } = useQuery({
    queryKey: ['auditLogRetentionPreview', retentionDays],
    queryFn: async () => {
      const res = await api.post('/audit-logs/cleanup/preview', {
        olderThanDays: parseInt(retentionDays, 10),
      })
      return res.data?.data
    },
    enabled: isAdmin,
  })

  // Mutations
  const savePolicyMutation = useMutation({
    mutationFn: async (payload: { auditRetentionDays: number; autoCleanupAuditLogs: boolean }) => {
      const res = await api.put('/audit-logs/retention-policy', payload)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditRetentionPolicy'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogRetentionPreview'] })
      setPurgeFeedback({
        type: 'success',
        message: isAr
          ? 'تم تحديث سياسة الاحتفاظ بالسجلات بنجاح'
          : 'Audit retention policy updated successfully',
      })
    },
    onError: (err: any) => {
      setPurgeFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'فشل حفظ سياسة الاحتفاظ' : 'Failed to update retention policy'),
      })
    },
  })

  const purgeMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await api.delete('/audit-logs/purge', {
        data: { olderThanDays: days },
      })
      return res.data
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogsStats'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogRetentionPreview'] })
      setIsPurgeModalOpen(false)
      const count = res.data?.purgedCount ?? 0
      if (count === 0) {
        setPurgeFeedback({
          type: 'success',
          message: isAr
            ? (res.data?.explanationReason || 'لم يتم حذف أي سجلات: جميع السجلات مؤمنة وضمن فترة الامتثال النظامي.')
            : 'No records were purged: all existing records are newer than the cutoff date or legally protected.',
        })
      } else {
        setPurgeFeedback({
          type: 'success',
          message: isAr
            ? `تم حذف ${count} سجل من السجلات الإدارية القديمة بنجاح`
            : `Successfully purged ${count} old administrative audit records`,
        })
      }
    },
    onError: (err: any) => {
      setIsPurgeModalOpen(false)
      setPurgeFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'فشلت عملية أرشفة السجلات' : 'Failed to purge audit records'),
      })
    },
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/audit-logs/reset-test-logs', {
        confirmationToken: resetToken.trim(),
        wipeAllTestLogs: wipeAllInDev,
      })
      return res.data?.data
    },
    onSuccess: (data) => {
      setResetFeedback({
        type: 'success',
        message: isAr
          ? `تم تنظيف ${data?.purgedCount ?? data?.deletedCount ?? 0} سجل اختباري بنجاح. تم توثيق العملية وحفظ كافة البيانات المالية والضريبية.`
          : `Successfully cleared ${data?.purgedCount ?? data?.deletedCount ?? 0} test logs. All financial and tax records preserved.`,
      })
      setResetToken('')
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogsStats'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogRetentionPreview'] })
    },
    onError: (err: any) => {
      setResetFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'فشلت عملية إعادة ضبط سجلات الفحص' : 'Reset test logs failed'),
      })
    },
  })

  const cleanTechMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/audit-logs/cleanup/test-debug')
      return res.data
    },
    onSuccess: (res) => {
      const purged = res.data?.purgedCount ?? 0
      setCleanTechFeedback({
        type: 'success',
        message: isAr
          ? `تم تنظيف ${purged} سجل تشخيصي وتقني بنجاح دون المساس بالبيانات المالية.`
          : `Successfully purged ${purged} technical/diagnostic records. Financial records preserved.`,
      })
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogsStats'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogRetentionPreview'] })
    },
    onError: (err: any) => {
      setCleanTechFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'فشل تنظيف السجلات التقنية' : 'Failed to clean technical records'),
      })
    },
  })

  const handleClearFilters = () => {
    setSearch('')
    setSelectedEntity('')
    setSelectedAction('')
    setSelectedCategory('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const hasActiveFilters = Boolean(
    search || selectedEntity || selectedAction || selectedCategory || dateFrom || dateTo
  )

  const getActionBadgeColor = (act: string) => {
    switch (act) {
      case 'CREATE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'UPDATE':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'DELETE':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'LOGIN':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'APPROVE':
      case 'ISSUE_INVOICE':
      case 'ISSUE_STATEMENT':
        return 'bg-teal-50 text-teal-800 border-teal-200'
      case 'CANCEL':
        return 'bg-amber-50 text-amber-800 border-amber-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const eligibleCount = previewData?.eligibleRecords ?? previewData?.totalEligibleCount ?? 0
  const isDevEnvironment = Boolean(statsData?.isDevelopment || previewData?.isDevelopment)

  return (
    <div className="space-y-6">
      {/* =========================================================================
          AREA A: AUDIT OVERVIEW (Executive Summary Cards)
          ========================================================================= */}
      <section aria-label={isAr ? 'نظرة عامة على سجلات التدقيق' : 'Audit Overview'}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Records */}
          <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs transition-all hover:border-gray-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">
                {isAr ? 'إجمالي السجلات' : 'Total Records'}
              </span>
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-gray-900">
              {isStatsLoading ? '...' : (statsData?.totalRecords ?? totalRecords).toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {isAr ? 'السجل الكامل لعمليات النظام' : 'Full system transaction trail'}
            </p>
          </div>

          {/* Card 2: Records Last 24h / Today */}
          <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs transition-all hover:border-gray-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">
                {isAr ? 'سجلات آخر 24 ساعة' : 'Last 24 Hours'}
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700">
              {isStatsLoading ? '...' : (statsData?.todayRecords ?? 0).toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {isAr ? 'النشاط التشغيلي اليومي المباشر' : 'Daily live operational activity'}
            </p>
          </div>

          {/* Card 3: Eligible for Cleanup */}
          <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-2xs transition-all hover:border-gray-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">
                {isAr ? 'المؤهلة للتنظيف' : 'Eligible for Cleanup'}
              </span>
              <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                <Trash2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-700">
              {isStatsLoading ? '...' : (statsData?.eligibleRetentionCount ?? eligibleCount).toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {isAr ? 'سجلات إدارية تتجاوز فترة الاحتفاظ' : 'Logs exceeding retention period'}
            </p>
          </div>

          {/* Card 4: Protected Records */}
          <div className="bg-white rounded-xl border border-emerald-200/70 p-4 shadow-2xs bg-linear-to-br from-white to-emerald-50/20 transition-all hover:border-emerald-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-emerald-800">
                {isAr ? 'السجلات المحمية نظامياً' : 'Protected Records'}
              </span>
              <div className="p-2 rounded-lg bg-emerald-100/80 text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-800">
              {isStatsLoading ? '...' : (statsData?.protectedCount ?? 0).toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-700 mt-1 font-medium">
              <Lock className="w-3 h-3 shrink-0" />
              <span>{isAr ? 'محصنة زكوياً ومحاسبياً (ZATCA)' : 'ZATCA & Statutory Safe'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          AREA B: AUDIT RECORDS TABLE (Main Focus)
          ========================================================================= */}
      <section
        className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden"
        aria-label={isAr ? 'جدول سجلات التدقيق والعمليات' : 'Audit Records Table'}
      >
        {/* Header & Quick Toolbar */}
        <div className="p-5 border-b border-gray-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'سجل العمليات والتدقيق' : 'System Audit Trail'}
                </h3>
                <p className="text-xs text-gray-500">
                  {isAr
                    ? 'استعراض شامل لكافة العمليات الإدارية والمالية مع التفاصيل المرجعية'
                    : 'Comprehensive tracking of all operational, financial, and security events'}
                </p>
              </div>
            </div>

            {/* Quick Status / Reset Filters */}
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إعادة ضبط الفلاتر' : 'Clear Filters'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Controls Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
            {/* 1. Free-Text Search */}
            <div className="relative sm:col-span-2">
              <Search className="w-4 h-4 text-gray-400 absolute top-2.5 start-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder={
                  isAr
                    ? 'بحث بالمعرف، الوصف، أو المستخدم...'
                    : 'Search by ID, description, or user...'
                }
                className="w-full ps-9 pe-3 py-2 text-xs rounded-xl border border-gray-300 bg-white placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* 2. Entity / Module Filter */}
            <div>
              <select
                value={selectedEntity}
                onChange={(e) => {
                  setSelectedEntity(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">{isAr ? 'جميع الوحدات والكيانات' : 'All Modules / Entities'}</option>
                <option value="INVOICE">{isAr ? 'الفواتير الضريبية (Invoice)' : 'Tax Invoices'}</option>
                <option value="PAYMENT">{isAr ? 'سندات الدفع والتحصيل (Payment)' : 'Payments'}</option>
                <option value="STATEMENT">{isAr ? 'كشوف الحساب والمستخلصات (Statement)' : 'Statements'}</option>
                <option value="WORK_ENTRY">{isAr ? 'إدخالات الأعمال (Work Entry)' : 'Work Entries'}</option>
                <option value="CLIENT">{isAr ? 'العملاء (Client)' : 'Clients'}</option>
                <option value="SITE">{isAr ? 'المواقع الإنشائية (Site)' : 'Sites'}</option>
                <option value="USER">{isAr ? 'المستخدمين والأمان (User)' : 'Users & Auth'}</option>
                <option value="AuditLog">{isAr ? 'عمليات الأرشفة (Audit Purge)' : 'Audit Purges'}</option>
              </select>
            </div>

            {/* 3. Action Category Filter */}
            <div>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">{isAr ? 'جميع تصنيفات العمليات' : 'All Action Categories'}</option>
                <option value="FINANCIAL">{isAr ? 'مالية وضريبية (محمية)' : 'Financial & Tax (Protected)'}</option>
                <option value="BUSINESS">{isAr ? 'تشغيلية ومشاريع' : 'Operational & Business'}</option>
                <option value="SECURITY">{isAr ? 'أمان وتسجيل دخول' : 'Security & Access'}</option>
                <option value="TECHNICAL_DIAGNOSTIC">{isAr ? 'تقنية وتشخيصية' : 'Technical & Diagnostic'}</option>
              </select>
            </div>

            {/* 4. Action Type Filter */}
            <div>
              <select
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 bg-white text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">{isAr ? 'جميع الإجراءات' : 'All Actions'}</option>
                <option value="CREATE">CREATE (إنشاء)</option>
                <option value="UPDATE">UPDATE (تعديل)</option>
                <option value="DELETE">DELETE (حذف)</option>
                <option value="APPROVE">APPROVE (اعتماد)</option>
                <option value="CANCEL">CANCEL (إلغاء)</option>
                <option value="LOGIN">LOGIN (دخول)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Audit Records Table */}
        {isLogsLoading ? (
          <div className="py-16 text-center text-xs text-gray-400">
            {isAr ? 'جارٍ تحميل السجلات...' : 'Loading audit logs...'}
          </div>
        ) : auditItems.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm font-medium text-gray-500">
              {isAr ? 'لا توجد سجلات تطابق شروط الفرز الحالية' : 'No audit records match the selected filters'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isAr ? 'إعادة ضبط شروط البحث' : 'Reset Search Criteria'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الوقت والتاريخ' : 'Timestamp'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'المستخدم' : 'User'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الإجراء' : 'Action'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الوحدة / الكيان' : 'Module / Record'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'النتيجة' : 'Result'}</th>
                  <th className="py-3 px-4 text-start font-semibold">{isAr ? 'بيان العملية' : 'Description'}</th>
                  <th className="py-3 px-4 text-end font-semibold">{isAr ? 'التفاصيل' : 'Details'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {auditItems.map((log) => {
                  const userName = log.user
                    ? isAr
                      ? log.user.nameAr || log.user.email
                      : log.user.nameEn || log.user.nameAr || log.user.email
                    : isAr
                    ? 'النظام الآلي'
                    : 'System'

                  const actionLabel = getActionLabel(log.action, log.entityType, isAr)
                  const entityLabel = getEntityLabel(log.entityType, isAr)
                  const badgeStyle = getActionBadgeStyle(log.action)
                  const refInfo = formatAuditReference(log, isAr)
                  const displayDesc = formatAuditDescription(log, isAr)

                  return (
                    <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3 px-4 font-mono text-[11px] text-gray-500 whitespace-nowrap" dir="ltr">
                        {new Date(log.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      {/* User */}
                      <td className="py-3 px-4 font-medium text-gray-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span title={log.user?.email || userName}>{userName}</span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                        >
                          {actionLabel}
                        </span>
                      </td>

                      {/* Module / Record ID */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-gray-700">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{entityLabel}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] text-blue-700 font-mono font-medium">
                              {refInfo.primary}
                            </span>
                            {refInfo.secondary && (
                              <span className="text-[10px] text-gray-400 font-mono">
                                ({refInfo.secondary})
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Result / Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isAr ? 'ناجحة' : 'Success'}</span>
                        </span>
                      </td>

                      {/* Description Preview */}
                      <td className="py-3 px-4 text-gray-800 max-w-xs sm:max-w-sm truncate" title={displayDesc}>
                        {displayDesc}
                      </td>

                      {/* Details View Action */}
                      <td className="py-3 px-4 text-end whitespace-nowrap">
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
                            title={isAr ? 'عرض تفاصيل العملية' : 'View Event Details'}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-700 font-semibold transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="text-[11px]">{isAr ? 'عرض التفاصيل' : 'View Details'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
            <div>
              {isAr
                ? `عرض الصفحة ${page} من إجمالي ${totalPages} صفحات (${totalRecords} سجل)`
                : `Showing page ${page} of ${totalPages} (${totalRecords} records)`}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || isLogsFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                {isAr ? 'السابق' : 'Previous'}
              </button>
              <span className="px-2 font-mono font-bold text-gray-900">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || isLogsFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          AREA C: ARCHIVING AND RETENTION MANAGEMENT (Collapsible Section)
          ========================================================================= */}
      {isAdmin && (
        <section
          className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden"
          aria-label={isAr ? 'إدارة الأرشفة والاحتفاظ بالسجلات' : 'Archiving & Retention Management'}
        >
          {/* Collapsible Header */}
          <div
            onClick={() => setIsRetentionSectionOpen(!isRetentionSectionOpen)}
            className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors select-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr
                    ? 'سياسة أرشفة وحذف سجلات التدقيق (Audit Retention Policy)'
                    : 'Audit Log Retention & Purge Management'}
                </h3>
                <p className="text-xs text-gray-500">
                  {isAr
                    ? 'إدارة فترات الاحتفاظ بسجلات النظام وتفريغ السجلات التاريخية القديمة مع توثيق رقابي آلي'
                    : 'Manage data retention periods and purge historical audit logs with automated compliance logging'}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 bg-white"
            >
              {isRetentionSectionOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Collapsible Body */}
          {isRetentionSectionOpen && (
            <div className="p-5 border-t border-gray-100 space-y-5 bg-gray-50/40">
              {/* Feedback messages */}
              {purgeFeedback && (
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold ${
                    purgeFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {purgeFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{purgeFeedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPurgeFeedback(null)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Sub-tabs: Routine Retention vs Development Reset */}
              <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                <button
                  type="button"
                  onClick={() => setRetentionTab('ROUTINE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    retentionTab === 'ROUTINE'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {isAr ? 'التنظيف الدوري وفق السياسة' : 'Routine Retention Cleanup'}
                </button>

                {isDevEnvironment && (
                  <button
                    type="button"
                    onClick={() => setRetentionTab('DEV_RESET')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                      retentionTab === 'DEV_RESET'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-purple-700 hover:bg-purple-50'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isAr ? 'بيئة الفحص والتطوير (Dev Reset)' : 'Development Testing Reset'}</span>
                  </button>
                )}
              </div>

              {/* TAB 1: ROUTINE RETENTION CLEANUP */}
              {retentionTab === 'ROUTINE' && (
                <div className="space-y-4">
                  {/* Selector & Execute */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end bg-white p-4 rounded-xl border border-gray-200">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="block text-xs font-bold text-gray-700">
                        {isAr ? 'الاحتفاظ بالسجلات لمدة:' : 'Retain logs for:'}
                      </label>
                      <select
                        value={retentionDays}
                        onChange={(e) => setRetentionDays(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 bg-white outline-hidden focus:ring-2 focus:ring-amber-400 font-medium"
                      >
                        <option value="30">
                          {isAr ? '30 يوماً (شهر واحد) - الحد الأدنى النظامي' : '30 Days (1 Month) - Statutory Minimum'}
                        </option>
                        <option value="60">
                          {isAr ? '60 يوماً (شهرين) - حذف الأقدم' : '60 Days (2 Months) - Purge older'}
                        </option>
                        <option value="90">
                          {isAr ? '90 يوماً (3 أشهر) - حذف الأقدم' : '90 Days (3 Months) - Purge older'}
                        </option>
                        <option value="180">
                          {isAr ? '180 يوماً (6 أشهر) - حذف الأقدم' : '180 Days (6 Months) - Purge older'}
                        </option>
                        <option value="365">
                          {isAr ? '365 يوماً (سنة كاملة) - حذف الأقدم' : '365 Days (1 Year) - Purge older'}
                        </option>
                      </select>
                      <p className="text-[11px] text-gray-500">
                        {isAr
                          ? 'بموجب أنظمة هيئة الزكاة والضريبة والجمارك (ZATCA)، السجلات المالية والضريبية وسجلات آخر 30 يوماً محمية تماماً وغير قابلة للحذف.'
                          : 'Per ZATCA and statutory mandates, financial/tax records and the last 30 days are strictly protected.'}
                      </p>
                    </div>

                    <div>
                      <button
                        type="button"
                        disabled={
                          purgeMutation.isPending ||
                          isPreviewLoading ||
                          eligibleCount === 0
                        }
                        onClick={() => setIsPurgeModalOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>
                          {purgeMutation.isPending
                            ? isAr
                              ? 'جارٍ الحذف...'
                              : 'Purging...'
                            : isAr
                            ? 'تنفيذ حذف السجلات القديمة'
                            : 'Execute Purge'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Retention Analysis Preview */}
                  {previewData && (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                          <span className="text-[10px] text-gray-500 block font-medium">
                            {isAr ? 'إجمالي السجلات' : 'Total Records'}
                          </span>
                          <span className="text-base font-extrabold text-gray-900 font-mono">
                            {previewData.systemTotalRecords ?? previewData.totalRecords ?? 0}
                          </span>
                        </div>

                        <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/30">
                          <span className="text-[10px] text-emerald-800 block font-semibold">
                            {isAr ? 'السجلات المحمية (لا تُحذف)' : 'Protected (Preserved)'}
                          </span>
                          <span className="text-base font-extrabold text-emerald-800 font-mono">
                            {previewData.protectedRecords ?? previewData.protectedCount ?? 0}
                          </span>
                        </div>

                        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50/30">
                          <span className="text-[10px] text-rose-800 block font-semibold">
                            {isAr ? 'المؤهلة للتنظيف' : 'Eligible to Purge'}
                          </span>
                          <span className="text-base font-extrabold text-rose-800 font-mono">
                            {eligibleCount}
                          </span>
                        </div>
                      </div>

                      {previewData.cutoffDate && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-gray-500 px-1 gap-1">
                          <span>
                            {isAr
                              ? `تاريخ الفرز: السجلات التي أُنشئت قبل ${new Date(previewData.cutoffDate).toLocaleDateString(
                                  'ar-SA'
                                )} (${previewData.cutoffDateFormatted || previewData.cutoffDate.split('T')[0]})`
                              : `Cutoff Date: records created before ${new Date(
                                  previewData.cutoffDate
                                ).toLocaleDateString()} (${previewData.cutoffDateFormatted || previewData.cutoffDate.split('T')[0]})`}
                          </span>
                          {eligibleCount === 0 && (
                            <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
                              {isAr ? 'جميع السجلات محمية بالكامل' : 'All logs fully protected'}
                            </span>
                          )}
                        </div>
                      )}

                      {eligibleCount === 0 && (
                        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">
                            {isAr
                              ? previewData.explanationReason ||
                                'جميع سجلات النظام الحالية أُنشئت حديثاً ومحمية ضمن فترة الامتثال النظامي.'
                              : previewData.explanationReasonEn ||
                                'All current system audit logs are protected under statutory compliance.'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Organization Retention Settings Form */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-bold text-gray-800">
                          {isAr ? 'إعدادات سياسة الاحتفاظ الافتراضية' : 'Organization Retention Policy Settings'}
                        </span>
                      </div>
                      <button
                        type="button"
                        data-testid="save-retention-policy-btn"
                        disabled={savePolicyMutation.isPending}
                        onClick={() =>
                          savePolicyMutation.mutate({
                            auditRetentionDays: policyDays,
                            autoCleanupAuditLogs: autoCleanup,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-2xs self-start sm:self-auto disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>
                          {savePolicyMutation.isPending
                            ? isAr
                              ? 'جارٍ الحفظ...'
                              : 'Saving...'
                            : isAr
                            ? 'حفظ السياسة'
                            : 'Save Policy'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                          {isAr ? 'المدة الافتراضية للاحتفاظ بالسجلات (أيام):' : 'Default Retention Period (Days):'}
                        </label>
                        <input
                          type="number"
                          min="30"
                          max="1825"
                          value={policyDays}
                          onChange={(e) => setPolicyDays(Math.max(30, parseInt(e.target.value, 10) || 30))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs font-semibold bg-white"
                        />
                        <span className="text-[10px] text-gray-400 mt-1 block">
                          {isAr ? 'الحد الأدنى النظامي: 30 يوماً' : 'Statutory Minimum: 30 days'}
                        </span>
                      </div>

                      <div className="flex items-center pt-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoCleanup}
                            onChange={(e) => setAutoCleanup(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-medium text-gray-700">
                            {isAr ? 'تفعيل التنظيف الدوري التلقائي للسجلات' : 'Enable automated scheduled cleanup'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DEVELOPMENT & TEST LOG RESET (Dev only) */}
              {retentionTab === 'DEV_RESET' && isDevEnvironment && (
                <div className="bg-purple-50/60 p-4 rounded-xl border border-dashed border-purple-300 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white uppercase">
                      {isAr ? 'بيئة التطوير والاختبار' : 'Development Only'}
                    </span>
                    <h4 className="text-xs font-bold text-purple-950">
                      {isAr ? 'إعادة ضبط سجلات الفحص والتطوير' : 'Reset Development & Test Audit Logs'}
                    </h4>
                  </div>
                  <p className="text-[11px] text-purple-900 leading-relaxed">
                    {isAr
                      ? 'يتيح هذا الإجراء تنظيف كافة محاولات الدخول وسجلات الفحص التجريبية مع الحفاظ التام على السجلات المالية والضريبية والكيانات الحيوية.'
                      : 'Purges development test noise and login records while strictly preserving invoices, payments, statements, and tax audit records.'}
                  </p>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-purple-900">
                      {isAr ? 'لتأكيد تفريغ سجلات الفحص، اكتب:' : 'To confirm, type:'}{' '}
                      <code className="text-purple-700 bg-purple-100 px-1 py-0.5 rounded font-mono">
                        RESET_TEST_AUDIT_LOGS
                      </code>
                    </label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        placeholder="RESET_TEST_AUDIT_LOGS"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-purple-200 font-mono text-xs w-full bg-white outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        disabled={resetToken.trim() !== 'RESET_TEST_AUDIT_LOGS' || resetMutation.isPending}
                        onClick={() => resetMutation.mutate()}
                        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold disabled:opacity-40 whitespace-nowrap shadow-2xs"
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

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-purple-900 pt-1">
                      <input
                        type="checkbox"
                        checked={wipeAllInDev}
                        onChange={(e) => setWipeAllInDev(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span>
                        {isAr
                          ? 'تفريغ كامل سجلات التدقيق حتى الصفر (وضع الاختبار فقط - لا يمس الفواتير أو المدفوعات)'
                          : 'Wipe all audit trail to 0 (Dev testing only - does NOT affect invoices or payments)'}
                      </span>
                    </label>
                  </div>

                  {resetFeedback && (
                    <div
                      className={`p-3 rounded-lg border flex items-center justify-between gap-2 text-xs font-semibold ${
                        resetFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {resetFeedback.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                        )}
                        <span>{resetFeedback.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setResetFeedback(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="pt-3 border-t border-purple-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-600">
                      {isAr
                        ? 'تنظيف السجلات التشخيصية وسجلات المحاولات الفارغة القديمة بنقرة واحدة:'
                        : 'Quick clean diagnostic and legacy empty purge noise logs in one click:'}
                    </span>
                    <button
                      type="button"
                      disabled={cleanTechMutation.isPending}
                      onClick={() => cleanTechMutation.mutate()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-semibold self-start sm:self-auto transition-colors disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>
                        {cleanTechMutation.isPending
                          ? isAr
                            ? 'جارٍ التنظيف...'
                            : 'Cleaning...'
                          : isAr
                          ? 'تنظيف السجلات التقنية'
                          : 'Clean Technical Logs'}
                      </span>
                    </button>
                  </div>

                  {cleanTechFeedback && (
                    <div
                      className={`p-3 rounded-lg border flex items-center justify-between gap-2 text-xs font-semibold ${
                        cleanTechFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {cleanTechFeedback.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                        )}
                        <span>{cleanTechFeedback.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCleanTechFeedback(null)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          RECORD DETAILS MODAL (Human-Readable Business Presentation)
          ========================================================================= */}
      <AuditDetailModal
        record={selectedRecord}
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        isAr={isAr}
        isAdmin={isAdmin}
      />

      {/* =========================================================================
          ROUTINE PURGE CONFIRMATION MODAL
          ========================================================================= */}
      {isPurgeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {isAr ? 'تأكيد أرشفة وتنظيف السجلات' : 'Confirm Audit Retention Purge'}
              </h3>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed">
              {isAr ? (
                <>
                  هل أنت متأكد من رغبتك في حذف جميع السجلات الإدارية الأقدم من{' '}
                  <span className="font-bold text-gray-900">{retentionDays} يوماً</span> نهائياً؟
                  <br />
                  <span className="text-xs text-emerald-700 font-semibold block mt-1.5">
                    ✓ السجلات المالية والضريبية وسجلات آخر 30 يوماً محمية تماماً ولن تتأثر.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to permanently purge administrative audit records older than{' '}
                  <span className="font-bold text-gray-900">{retentionDays} days</span>?
                  <br />
                  <span className="text-xs text-emerald-700 font-semibold block mt-1.5">
                    ✓ Financial, tax, and the last 30 days logs will remain strictly protected.
                  </span>
                </>
              )}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsPurgeModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={purgeMutation.isPending}
                onClick={() => purgeMutation.mutate(parseInt(retentionDays, 10))}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 shadow-2xs"
              >
                {purgeMutation.isPending
                  ? isAr
                    ? 'جارٍ الحذف...'
                    : 'Purging...'
                  : isAr
                  ? 'تأكيد الحذف'
                  : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
