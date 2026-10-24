import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldAlert,
  Trash2,
  Calendar,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Activity,
  Save,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { api } from '../../lib/api'

interface AuditLogSettingsTabProps {
  isAr: boolean
  isAdmin: boolean
}

export function AuditLogSettingsTab({ isAr, isAdmin }: AuditLogSettingsTabProps) {
  const queryClient = useQueryClient()
  const [retentionDays, setRetentionDays] = useState('90')
  const [purgeFeedback, setPurgeFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [selectedEntity, setSelectedEntity] = useState('')
  const [selectedAction, setSelectedAction] = useState('')

  // Policy Settings State
  const [policyDays, setPolicyDays] = useState(90)
  const [autoCleanup, setAutoCleanup] = useState(false)

  // Development Reset State
  const [resetToken, setResetToken] = useState('')
  const [resetFeedback, setResetFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Query audit logs
  const { data, isLoading } = useQuery({
    queryKey: ['auditLogs', selectedEntity, selectedAction],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedEntity) params.append('entityType', selectedEntity)
      if (selectedAction) params.append('action', selectedAction)
      params.append('limit', '50')
      const res = await api.get(`/audit-logs?${params.toString()}`)
      return res.data?.data
    },
  })

  // Query Retention Policy
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

  // Mutation to save retention policy
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

  // Mutation to Reset Test Audit Logs (Development Only)
  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/audit-logs/reset-test-logs', {
        confirmationToken: resetToken.trim(),
      })
      return res.data?.data
    },
    onSuccess: (data) => {
      setResetFeedback({
        type: 'success',
        message: isAr
          ? `تم تنظيف ${data?.deletedCount ?? 0} سجل اختباري بنجاح. تم توثيق العملية وحفظ كافة البيانات المالية والضريبية.`
          : `Successfully cleared ${data?.deletedCount ?? 0} test logs. All financial and tax records preserved.`,
      })
      setResetToken('')
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
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

  // Query Retention Preview
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

  // Purge mutation
  const purgeMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await api.delete('/audit-logs/purge', {
        data: { olderThanDays: days },
      })
      return res.data
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      queryClient.invalidateQueries({ queryKey: ['auditLogRetentionPreview'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      const count = res.data?.purgedCount ?? 0
      if (count === 0) {
        setPurgeFeedback({
          type: 'success',
          message: isAr
            ? (res.data?.explanationReason || 'لم يتم حذف أي سجلات: لا توجد سجلات مؤهلة للحذف أقدم من تاريخ الفرز المحدد.')
            : 'No records were purged: all existing records are newer than the cutoff date or legally protected.',
        })
      } else {
        setPurgeFeedback({
          type: 'success',
          message:
            res.message ||
            (isAr
              ? `تم حذف ${count} سجل من السجلات الإدارية القديمة بنجاح`
              : `Successfully purged ${count} old administrative audit records`),
        })
      }
    },
    onError: (err: any) => {
      setPurgeFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'فشلت عملية أرشفة السجلات' : 'Failed to purge audit records'),
      })
    },
  })

  const handleExecutePurge = () => {
    const days = parseInt(retentionDays, 10)
    const promptMsg = isAr
      ? `تحذير: هل أنت متأكد من رغبتك في حذف جميع سجلات العمليات الأقدم من ${days} يوماً نهائياً؟\nسيتم توثيق عملية الحذف هذه في سجل رقابي جديد.`
      : `Warning: Are you sure you want to permanently purge audit records older than ${days} days?\nThis action will be documented as an immutable audit event.`

    if (window.confirm(promptMsg)) {
      purgeMutation.mutate(days)
    }
  }

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'UPDATE':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'DELETE':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'LOGIN':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'APPROVE':
        return 'bg-teal-50 text-teal-700 border-teal-200'
      case 'CANCEL':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const items = data?.items || []

  return (
    <div className="space-y-6">
      {/* Retention Management Card (Admin Only) */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
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

          {purgeFeedback && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                purgeFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {purgeFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{purgeFeedback.message}</span>
            </div>
          )}

          <div className="space-y-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  {isAr ? 'الاحتفاظ بالسجلات لمدة:' : 'Retain logs for:'}
                </label>
                <select
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 bg-white outline-none focus:ring-2 focus:ring-amber-400 font-medium"
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
                    (previewData && (previewData.eligibleRecords ?? previewData.totalEligibleCount ?? 0) === 0)
                  }
                  onClick={handleExecutePurge}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
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
              <div className="pt-3 border-t border-gray-200/80 space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-2xs">
                    <span className="text-[10px] text-gray-500 block font-medium">
                      {isAr ? 'إجمالي السجلات' : 'Total Records'}
                    </span>
                    <span className="text-sm font-extrabold text-gray-900 font-mono">
                      {previewData.systemTotalRecords ?? previewData.totalRecords ?? 0}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 shadow-2xs">
                    <span className="text-[10px] text-emerald-700 block font-semibold">
                      {isAr ? 'السجلات المحمية (لا تُحذف)' : 'Protected (Preserved)'}
                    </span>
                    <span className="text-sm font-extrabold text-emerald-800 font-mono">
                      {previewData.protectedRecords ?? previewData.protectedCount ?? 0}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-rose-200 shadow-2xs">
                    <span className="text-[10px] text-rose-700 block font-semibold">
                      {isAr ? 'المؤهلة للتنظيف' : 'Eligible to Purge'}
                    </span>
                    <span className="text-sm font-extrabold text-rose-800 font-mono">
                      {previewData.eligibleRecords ?? previewData.totalEligibleCount ?? 0}
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
                    {(previewData.eligibleRecords ?? previewData.totalEligibleCount ?? 0) === 0 && (
                      <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
                        {isAr ? 'جميع السجلات محمية بالكامل' : 'All logs fully protected'}
                      </span>
                    )}
                  </div>
                )}

                {(previewData.eligibleRecords ?? previewData.totalEligibleCount ?? 0) === 0 && (
                  <div className="p-2.5 rounded-lg bg-blue-50/80 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      {isAr
                        ? previewData.explanationReason ||
                          'جميع سجلات النظام الحالية أُنشئت حديثاً وهي أحدث من تاريخ الفرز ومحمية ضمن فترة الامتثال.'
                        : previewData.explanationReasonEn ||
                          'All current system audit logs were created recently after the cutoff date or are protected under statutory compliance.'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Configurable Organization Retention Policy */}
            <div className="pt-3 border-t border-gray-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold bg-white"
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">
                    {isAr ? 'الحد الأدنى النظامي: 30 يوماً' : 'Statutory Minimum: 30 days'}
                  </span>
                </div>

                <div className="flex items-center pt-3">
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

            {/* Development Mode: Reset Test Logs */}
            {previewData?.isDevelopment && (
              <div className="pt-3 border-t border-purple-200/80 bg-purple-50/50 p-3.5 rounded-xl border border-dashed border-purple-300 space-y-3">
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

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-purple-900">
                    {isAr ? 'لتأكيد تفريغ سجلات الفحص، اكتب:' : 'To confirm, type:'}{' '}
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

                {resetFeedback && (
                  <div
                    className={`p-2.5 rounded-lg border flex items-center gap-2 text-xs font-semibold ${
                      resetFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {resetFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    )}
                    <span>{resetFeedback.message}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Logs History Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-gray-900">
              {isAr ? 'سجل العمليات والنشاطات (Audit Trail)' : 'System Audit Activity Log'}
            </h3>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
            >
              <option value="">{isAr ? 'جميع الكيانات' : 'All Entities'}</option>
              <option value="INVOICE">{isAr ? 'الفواتير' : 'Invoices'}</option>
              <option value="STATEMENT">{isAr ? 'المستخلصات' : 'Statements'}</option>
              <option value="SITE">{isAr ? 'المواقع' : 'Sites'}</option>
              <option value="CLIENT">{isAr ? 'العملاء' : 'Clients'}</option>
              <option value="WORK_ENTRY">{isAr ? 'قيود الأعمال' : 'Work Entries'}</option>
              <option value="PAYMENT">{isAr ? 'المدفوعات' : 'Payments'}</option>
              <option value="USER">{isAr ? 'المستخدمين' : 'Users'}</option>
              <option value="AuditLog">{isAr ? 'أرشفة السجلات' : 'Audit Purges'}</option>
            </select>

            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
            >
              <option value="">{isAr ? 'جميع الإجراءات' : 'All Actions'}</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="APPROVE">APPROVE</option>
              <option value="CANCEL">CANCEL</option>
              <option value="LOGIN">LOGIN</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-gray-400">
            {isAr ? 'جارٍ تحميل السجلات...' : 'Loading audit logs...'}
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-500">
            {isAr ? 'لا توجد سجلات تطابق الفلتر المحدد' : 'No audit records match the selected filter'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <th className="py-2.5 px-3 text-start font-semibold">{isAr ? 'الوقت' : 'Timestamp'}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{isAr ? 'المستخدم' : 'User'}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{isAr ? 'الإجراء' : 'Action'}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{isAr ? 'الكيان' : 'Entity'}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{isAr ? 'التفاصيل' : 'Description'}</th>
                  <th className="py-2.5 px-3 text-start font-semibold">{isAr ? 'عنوان IP' : 'IP'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {items.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50/80">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500 whitespace-nowrap" dir="ltr">
                      {new Date(log.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-gray-900 whitespace-nowrap">
                      {log.user ? (isAr ? log.user.nameAr : log.user.nameEn || log.user.nameAr) : 'System'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadgeColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-600">{log.entityType}</td>
                    <td className="py-2.5 px-3 text-gray-900 max-w-xs sm:max-w-md truncate" title={log.description}>
                      {log.description}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-gray-400" dir="ltr">
                      {log.ipAddress || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
