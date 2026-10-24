import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Archive,
  RotateCcw,
  Trash2,
  ShieldAlert,
  X,
  Loader2,
  Info,
} from 'lucide-react'

export type RecordActionType = 'archive' | 'restore' | 'delete' | 'permanent_delete'

interface RecordActionModalProps {
  isOpen: boolean
  actionType: RecordActionType | null
  recordName: string
  recordTypeLabel?: string
  canDelete?: boolean
  blockedReason?: string
  isPending?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
  onArchiveInstead?: () => void
  children?: ReactNode
}

export function RecordActionModal({
  isOpen,
  actionType,
  recordName,
  recordTypeLabel,
  canDelete = false,
  blockedReason,
  isPending = false,
  error = null,
  onClose,
  onConfirm,
  onArchiveInstead,
}: RecordActionModalProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  if (!isOpen || !actionType) return null

  // 1. Blocked Deletion State (User requested Delete or Permanent Delete, but record has protected dependencies)
  const isDeletionBlocked =
    (actionType === 'delete' || actionType === 'permanent_delete') && !canDelete

  let title = ''
  let description = ''
  let confirmLabel = ''
  let confirmButtonClass = ''
  let IconComponent = AlertTriangle
  let iconClass = 'text-amber-600 bg-amber-50 border-amber-200'

  if (isDeletionBlocked) {
    title = isAr ? 'لا يمكن حذف هذا السجل' : 'Cannot Delete Record'
    description =
      blockedReason ||
      (isAr
        ? 'لا يمكن حذف هذا السجل لوجود ارتباطات ومعاملات سابقة في النظام. نوصي بأرشفة السجل لحفظ التاريخ المالي والتشغيلي.'
        : 'Cannot delete this record because it has linked transactions or operational records. We recommend archiving instead.')
    IconComponent = Info
    iconClass = 'text-blue-600 bg-blue-50 border-blue-200'
  } else if (actionType === 'archive') {
    title = t('common.dataMgmt.confirmArchiveTitle')
    description = t('common.dataMgmt.archiveDesc')
    confirmLabel = t('common.dataMgmt.archive')
    confirmButtonClass =
      'bg-[#B97816] hover:bg-[#965F0E] text-white focus:ring-2 focus:ring-[#B97816]'
    IconComponent = Archive
    iconClass = 'text-amber-600 bg-amber-50 border-amber-200'
  } else if (actionType === 'restore') {
    title = t('common.dataMgmt.confirmRestoreTitle')
    description = t('common.dataMgmt.restoreDesc')
    confirmLabel = t('common.dataMgmt.restore')
    confirmButtonClass =
      'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-2 focus:ring-emerald-600'
    IconComponent = RotateCcw
    iconClass = 'text-emerald-600 bg-emerald-50 border-emerald-200'
  } else if (actionType === 'delete') {
    title = t('common.dataMgmt.confirmDeleteTitle')
    description = t('common.dataMgmt.deleteSafeDesc')
    confirmLabel = t('common.dataMgmt.delete')
    confirmButtonClass =
      'bg-rose-600 hover:bg-rose-700 text-white focus:ring-2 focus:ring-rose-600'
    IconComponent = Trash2
    iconClass = 'text-rose-600 bg-rose-50 border-rose-200'
  } else if (actionType === 'permanent_delete') {
    title = t('common.dataMgmt.confirmPermanentDeleteTitle')
    description = t('common.dataMgmt.permanentDeleteWarning')
    confirmLabel = t('common.dataMgmt.permanentDelete')
    confirmButtonClass =
      'bg-red-800 hover:bg-red-900 text-white focus:ring-2 focus:ring-red-800'
    IconComponent = ShieldAlert
    iconClass = 'text-red-700 bg-red-50 border-red-200'
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 bg-[#102437]/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E4E7EC] space-y-4 animate-in fade-in-90 zoom-in-95">
        {/* Header Icon + Title */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconClass}`}
            >
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1F2937]">{title}</h3>
              {recordTypeLabel && (
                <span className="text-[11px] text-[#667085] font-medium block">
                  {recordTypeLabel}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 text-[#667085] hover:text-[#1F2937] hover:bg-[#EAF0F5] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Record Badge */}
        <div className="p-3 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC] flex items-center gap-2">
          <span className="text-xs text-[#667085] font-medium">{t('common.name')}:</span>
          <span className="text-xs font-bold text-[#18324B] truncate">{recordName}</span>
        </div>

        {/* Description Body */}
        <p className="text-xs leading-relaxed text-[#667085]">{description}</p>

        {/* Error message if API rejected */}
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700"
          >
            {error}
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E4E7EC]/70">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-xl border border-[#E4E7EC] bg-white text-xs font-semibold text-[#1F2937] hover:bg-[#F5F7FA] transition-colors"
          >
            {t('common.cancel')}
          </button>

          {isDeletionBlocked ? (
            onArchiveInstead && (
              <button
                type="button"
                onClick={onArchiveInstead}
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-[#B97816] hover:bg-[#965F0E] text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{t('common.dataMgmt.archiveInstead')}</span>
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              data-testid="confirm-record-action-btn"
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs ${confirmButtonClass}`}
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{confirmLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
