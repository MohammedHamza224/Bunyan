import React, { useState } from 'react'
import {
  ShieldCheck,
  CheckCircle2,
  X,
  Clock,
  User as UserIcon,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Hash,
  Terminal,
  Activity,
  ArrowRight,
  ArrowLeft,
  Trash2,
} from 'lucide-react'
import { RecordLink } from './RecordLink'
import { formatCurrency } from '../../lib/utils'
import {
  AuditRecordLike,
  getActionLabel,
  getEntityLabel,
  getActionBadgeStyle,
  formatAuditReference,
  extractAuditChanges,
  extractAuditReason,
  sanitizeMetadataForDisplay,
  formatAuditDescription,
} from '../../lib/auditFormatters'

interface AuditDetailModalProps {
  record: AuditRecordLike | null
  isOpen: boolean
  onClose: () => void
  isAr?: boolean
  isAdmin?: boolean
}

export function AuditDetailModal({
  record,
  isOpen,
  onClose,
  isAr = true,
  isAdmin = false,
}: AuditDetailModalProps) {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

  if (!isOpen || !record) return null

  const actionLabel = getActionLabel(record.action, record.entityType, isAr)
  const entityLabel = getEntityLabel(record.entityType, isAr)
  const badgeStyle = getActionBadgeStyle(record.action)
  const refInfo = formatAuditReference(record, isAr)
  const diffs = extractAuditChanges(record.metadata, isAr)
  const reason = extractAuditReason(record.metadata)
  const cleanMetadata = sanitizeMetadataForDisplay(record.metadata)
  const description = formatAuditDescription(record, isAr)

  const userName =
    record.user?.nameAr ||
    record.user?.nameEn ||
    record.user?.email ||
    (isAr ? 'النظام الآلي' : 'Automated System')

  const userRole = record.user?.role
    ? record.user.role === 'ORG_ADMIN'
      ? (isAr ? 'مدير النظام' : 'System Admin')
      : record.user.role === 'ORG_MANAGER'
      ? (isAr ? 'مدير عمليات' : 'Operations Manager')
      : (isAr ? 'مستخدم معتمد' : 'Authorized User')
    : null

  const isDeleteAction = record.action.toUpperCase().includes('DELETE')

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-50 duration-150"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* =========================================================
            1. Modal Header
            ========================================================= */}
        <div className="px-6 py-4 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="audit-modal-title" className="text-base font-bold text-gray-900">
                  {isAr ? 'تفاصيل سجل التدقيق والرقابة' : 'Audit Record Details'}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                >
                  {actionLabel}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr
                  ? 'عرض موثق ومفصل للعملية وتأثيرها على سجلات المنظومة'
                  : 'Documented record view and audit impact analysis'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-colors"
            title={isAr ? 'إغلاق' : 'Close'}
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* =========================================================
            2. Modal Body (Scrollable)
            ========================================================= */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-gray-700">
          {/* Executive Overview Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* Tile 1: Action */}
            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-150">
              <span className="text-[11px] text-gray-400 font-medium block">
                {isAr ? 'نوع الإجراء' : 'Action Type'}
              </span>
              <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                {actionLabel}
              </span>
            </div>

            {/* Tile 2: Entity */}
            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-150">
              <span className="text-[11px] text-gray-400 font-medium block">
                {isAr ? 'نوع السجل' : 'Record Type'}
              </span>
              <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                {entityLabel}
              </span>
            </div>

            {/* Tile 3: Reference */}
            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-150">
              <span className="text-[11px] text-gray-400 font-medium block">
                {isAr ? 'رقم السجل / المرجع' : 'Record Reference'}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-bold text-blue-700 font-mono">
                  {refInfo.primary}
                </span>
                {refInfo.secondary && (
                  <span className="text-[10px] text-gray-400 font-mono">
                    ({refInfo.secondary})
                  </span>
                )}
                {refInfo.isDeleted && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    {isAr ? 'سجل محذوف' : 'Deleted'}
                  </span>
                )}
              </div>
            </div>

            {/* Tile 4: Actor */}
            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-150">
              <span className="text-[11px] text-gray-400 font-medium block">
                {isAr ? 'المستخدم المنفذ' : 'Executed By'}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-semibold text-gray-900">
                  {userName}
                </span>
                {userRole && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-200/70 text-gray-600 rounded">
                    {userRole}
                  </span>
                )}
              </div>
            </div>

            {/* Tile 5: Timestamp */}
            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-150">
              <span className="text-[11px] text-gray-400 font-medium block">
                {isAr ? 'تاريخ ووقت الإجراء' : 'Date & Time'}
              </span>
              <div className="flex items-center gap-1 mt-0.5 text-gray-900 font-mono text-xs">
                <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span>
                  {new Date(record.createdAt).toLocaleString(
                    isAr ? 'ar-SA' : 'en-US',
                    { dateStyle: 'medium', timeStyle: 'short' }
                  )}
                </span>
              </div>
            </div>

            {/* Tile 6: Outcome */}
            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-150">
              <span className="text-[11px] text-gray-400 font-medium block">
                {isAr ? 'نتيجة العملية' : 'Operation Result'}
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تمت بنجاح وتوثيقها' : 'Success (Recorded)'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Description Card */}
          <div>
            <h4 className="text-xs font-bold text-gray-900 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>{isAr ? 'بيان ووصف العملية' : 'Action Description'}</span>
            </h4>
            <div className="p-3.5 bg-white rounded-xl border border-gray-200 text-gray-800 leading-relaxed shadow-2xs">
              {description}
            </div>
          </div>

          {/* Justification / Reason (if any) */}
          {reason && (
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>{isAr ? 'سبب الإجراء أو الملاحظات المسجلة:' : 'Change Reason / Recorded Notes:'}</span>
              </div>
              <p className="text-xs text-amber-950 font-medium ps-5">
                {reason}
              </p>
            </div>
          )}

          {/* Before-and-After Comparisons (Diffs Table) */}
          {diffs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{isAr ? 'مقارنة القيم المعدلة (قبل وبعد)' : 'Value Changes (Before & After)'}</span>
                </h4>
                <span className="text-[11px] text-gray-500">
                  {isAr ? `${diffs.length} حقول معدلة` : `${diffs.length} fields modified`}
                </span>
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-start">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-start font-semibold">
                        {isAr ? 'الحقل المعدل' : 'Field'}
                      </th>
                      <th className="px-4 py-2.5 text-start font-semibold text-rose-700 bg-rose-50/40">
                        {isAr ? 'القيمة السابقة' : 'Previous Value'}
                      </th>
                      <th className="px-4 py-2.5 text-center w-8 text-gray-400">
                        —
                      </th>
                      <th className="px-4 py-2.5 text-start font-semibold text-emerald-700 bg-emerald-50/40">
                        {isAr ? 'القيمة الجديدة' : 'New Value'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {diffs.map((diff, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-semibold text-gray-800">
                          {diff.field}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-600 bg-rose-50/20">
                          <span className="line-through decoration-rose-400/80">
                            {diff.from}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center text-gray-400">
                          {isAr ? (
                            <ArrowLeft className="w-3.5 h-3.5 mx-auto text-blue-600" />
                          ) : (
                            <ArrowRight className="w-3.5 h-3.5 mx-auto text-blue-600" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-emerald-800 bg-emerald-50/20">
                          {diff.to}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Deletion Context Card */}
          {isDeleteAction && record.metadata && (
            <div className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>{isAr ? 'بيانات السجل الذي تم حذفه:' : 'Snapshot of Deleted Record:'}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-rose-950">
                {record.metadata.referenceNo && (
                  <div>
                    <span className="text-gray-500 block">{isAr ? 'المرجع:' : 'Reference:'}</span>
                    <span className="font-mono font-bold">{record.metadata.referenceNo}</span>
                  </div>
                )}
                {record.metadata.itemNameAr && (
                  <div>
                    <span className="text-gray-500 block">{isAr ? 'البند:' : 'Item:'}</span>
                    <span className="font-semibold">{record.metadata.itemNameAr}</span>
                  </div>
                )}
                {record.metadata.totalAmount && (
                  <div>
                    <span className="text-gray-500 block">{isAr ? 'المبلغ:' : 'Amount:'}</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(record.metadata.totalAmount, isAr ? 'ar' : 'en', record.metadata.currency || 'SAR')}
                    </span>
                  </div>
                )}
                {record.metadata.deletedTotal && (
                  <div>
                    <span className="text-gray-500 block">{isAr ? 'المبلغ المحذوف:' : 'Deleted Total:'}</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(record.metadata.deletedTotal, isAr ? 'ar' : 'en', record.metadata.currency || 'SAR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin Diagnostics Collapsible (Restricted & Masked) */}
          {isAdmin && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="w-full px-4 py-2.5 bg-gray-50/80 hover:bg-gray-100 flex items-center justify-between text-xs font-semibold text-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-gray-500" />
                  <span>{isAr ? 'بيانات التشخيص الفني (خاصة بمدير النظام)' : 'Technical Diagnostics (Admin Only)'}</span>
                </div>
                {showTechnicalDetails ? (
                  <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                )}
              </button>

              {showTechnicalDetails && (
                <div className="p-4 space-y-3 bg-gray-50/30 text-[11px] text-gray-600 border-t border-gray-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                    <div>
                      <span className="text-gray-400 block">{isAr ? 'عنوان IP:' : 'IP Address:'}</span>
                      <span className="text-gray-800">{record.ipAddress || (isAr ? 'غير مسجل' : 'N/A')}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">{isAr ? 'معرف السجل الداخلي:' : 'Internal Record ID:'}</span>
                      <span className="text-gray-800 break-all">{record.id}</span>
                    </div>
                  </div>

                  {record.userAgent && (
                    <div className="font-mono">
                      <span className="text-gray-400 block">{isAr ? 'المتصفح / العميل:' : 'User Agent:'}</span>
                      <span className="text-[10px] text-gray-600 break-all">{record.userAgent}</span>
                    </div>
                  )}

                  {cleanMetadata && (
                    <div>
                      <span className="text-gray-500 font-semibold block mb-1">
                        {isAr ? 'البيانات المرجعية الخام (مفلترة ومحمية من بيانات الاعتماد):' : 'Raw Metadata (Sanitized):'}
                      </span>
                      <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg font-mono text-[10px] overflow-x-auto max-h-40" dir="ltr">
                        {JSON.stringify(cleanMetadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* =========================================================
            3. Modal Footer
            ========================================================= */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div>
            {refInfo.url ? (
              <RecordLink
                to={refInfo.url}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-800 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>
                  {isAr ? `انتقال إلى ${entityLabel}` : `View ${entityLabel} Record`}
                </span>
              </RecordLink>
            ) : (
              <span className="text-[11px] text-gray-400">
                {isDeleteAction
                  ? (isAr ? 'السجل الأصلي محذوف ويتم الاحتفاظ ببياناته رقابياً' : 'Original record is deleted and retained for audit compliance')
                  : ''}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-2xs"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
