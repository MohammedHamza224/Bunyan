import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  Layers,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { formatCurrency } from '../../lib/utils'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { RecordActionModal, RecordActionType } from '../../components/ui/RecordActionModal'

const COMMON_UNITS = [
  { ar: 'م²', en: 'SQM' },
  { ar: 'م.ط', en: 'LM' },
  { ar: 'قطعة', en: 'Piece' },
  { ar: 'وحدة', en: 'Unit' },
  { ar: 'نقطة', en: 'Point' },
  { ar: 'ساعة', en: 'Hour' },
  { ar: 'يوم', en: 'Day' },
  { ar: 'عملية', en: 'Operation' },
  { ar: 'مبلغ مقطوع', en: 'Lump Sum' },
]

export function WorkItemsPage() {
  const { t, i18n } = useTranslation()
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'
  const locale = isAr ? 'ar-SA' : 'en-SA'
  const canEdit = hasPermission('CREATE_WORK')
  const isAdmin = user?.role === 'ORG_ADMIN'

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ACTIVE')
  const [page, setPage] = useState(1)

  // Form Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [formData, setFormData] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    descriptionAr: '',
    unitOfMeasureId: '',
    unit: 'م²',
    unitEn: 'SQM',
    defaultPrice: '',
    notes: '',
    isActive: true,
  })
  const [formError, setFormError] = useState<string | null>(null)

  // Action Modal state
  const [actionTarget, setActionTarget] = useState<any | null>(null)
  const [actionType, setActionType] = useState<RecordActionType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Feedback Notification
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  // Query Units catalog
  const { data: unitsData } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const res = await api.get('/units')
      return res.data?.data || []
    },
  })
  const units: any[] = Array.isArray(unitsData) ? unitsData : []

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workItems', { search, statusFilter, page }],
    queryFn: async () => {
      const res = await api.get('/work-items', {
        params: {
          search: search || undefined,
          status: statusFilter,
          page,
          limit: 25,
        },
      })
      return res.data?.data
    },
  })

  // Open Form for Adding
  const openAddModal = () => {
    setEditingItem(null)
    const defaultUnit = units.find((u: any) => u.isDefault) || units[0]
    setFormData({
      code: '',
      nameAr: '',
      nameEn: '',
      descriptionAr: '',
      unitOfMeasureId: defaultUnit?.id || '',
      unit: defaultUnit?.symbolAr || 'م²',
      unitEn: defaultUnit?.symbolEn || 'SQM',
      defaultPrice: '',
      notes: '',
      isActive: true,
    })
    setFormError(null)
    setIsFormModalOpen(true)
  }

  // Open Form for Editing
  const openEditModal = (item: any) => {
    setEditingItem(item)
    setFormData({
      code: item.code || '',
      nameAr: item.nameAr || '',
      nameEn: item.nameEn || '',
      descriptionAr: item.descriptionAr || '',
      unitOfMeasureId: item.unitOfMeasureId || item.unitOfMeasure?.id || '',
      unit: item.unit || 'م²',
      unitEn: item.unitEn || '',
      defaultPrice:
        item.defaultPrice !== null && item.defaultPrice !== undefined
          ? String(Number(item.defaultPrice))
          : '',
      notes: item.notes || '',
      isActive: item.isActive ?? true,
    })
    setFormError(null)
    setIsFormModalOpen(true)
  }

  // Save Mutation (Create / Edit)
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingItem) {
        const res = await api.put(`/work-items/${editingItem.id}`, payload)
        return res.data?.data
      } else {
        const res = await api.post('/work-items', payload)
        return res.data?.data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workItems'] })
      setIsFormModalOpen(false)
      setFeedback({
        type: 'success',
        message: editingItem
          ? isAr
            ? 'تم تحديث بيانات بند العمل بنجاح'
            : 'Work item updated successfully'
          : isAr
          ? 'تم إنشاء بند العمل بنجاح'
          : 'Work item created successfully',
      })
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  // Action Mutation (Archive / Restore / Safe Delete / Permanent Delete)
  const actionMutation = useMutation({
    mutationFn: async ({ item, type }: { item: any; type: RecordActionType }) => {
      if (type === 'archive') {
        const res = await api.post(`/work-items/${item.id}/archive`)
        return res.data
      }
      if (type === 'restore') {
        const res = await api.post(`/work-items/${item.id}/restore`)
        return res.data
      }
      if (type === 'delete') {
        const res = await api.delete(`/work-items/${item.id}?mode=delete`)
        return res.data
      }
      if (type === 'permanent_delete') {
        const res = await api.delete(`/work-items/${item.id}/permanent`)
        return res.data
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workItems'] })
      closeActionModal()

      let msg = t('common.success')
      if (variables.type === 'archive') {
        msg = isAr
          ? 'تمت أرشفة بند العمل بنجاح مع حفظ جميع الأعمال التاريخية'
          : 'Work item archived successfully with all history preserved'
      } else if (variables.type === 'restore') {
        msg = isAr ? 'تمت استعادة بند العمل بنجاح' : 'Work item restored successfully'
      } else if (variables.type === 'delete' || variables.type === 'permanent_delete') {
        msg = isAr ? 'تم حذف بند العمل بنجاح' : 'Work item deleted successfully'
      }

      setFeedback({ type: 'success', message: msg })
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  const openActionModal = (item: any, type: RecordActionType) => {
    setActionTarget(item)
    setActionType(type)
    setActionError(null)
  }

  const closeActionModal = () => {
    setActionTarget(null)
    setActionType(null)
    setActionError(null)
  }

  const handleActionConfirm = () => {
    if (!actionTarget || !actionType) return
    actionMutation.mutate({ item: actionTarget, type: actionType })
  }

  const handleArchiveInstead = () => {
    if (!actionTarget) return
    actionMutation.mutate({ item: actionTarget, type: 'archive' })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formData.nameAr.trim()) {
      setFormError(isAr ? 'اسم البند بالعربية حقل مطلوب' : 'Item name in Arabic is required')
      return
    }

    if (!formData.unit.trim()) {
      setFormError(isAr ? 'يرجى تحديد وحدة القياس' : 'Measurement unit is required')
      return
    }

    if (formData.defaultPrice !== '' && Number(formData.defaultPrice) < 0) {
      setFormError(t('validation.positiveNumber'))
      return
    }

    saveMutation.mutate({
      ...formData,
      defaultPrice: formData.defaultPrice === '' ? null : Number(formData.defaultPrice),
    })
  }

  const computeBlockedReason = (item: any) => {
    const we = item?._count?.workEntries ?? 0
    if (we === 0) return undefined
    return isAr
      ? `لا يمكن حذف هذا البند لارتباطه بـ (${we}) من قيود الأعمال المسجلة في المشاريع. نوصي بأرشفة البند لمنع استخدامه مستقبلاً مع الحفاظ على العمليات السابقة.`
      : `Cannot delete this work item because it is referenced by (${we}) recorded work entries. Archiving is recommended to preserve project history.`
  }

  const items = data?.items || []
  const totalPages = data?.totalPages || 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('workItems.title')}</h1>
          <p className="text-xs text-gray-500 mt-1">
            {isAr
              ? 'دليل بنود الأعمال والمواصفات القياسية، وحدات القياس والأسعار المرجعية'
              : 'Work item templates library, standard specifications, units, and base prices'}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 text-[#E29A26]" />
            <span>{t('workItems.addItem')}</span>
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm transition-all shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Status Filter */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-gray-400 absolute top-3 start-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('common.search')}
            className="w-full ps-9 pe-3.5 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ACTIVE">{t('common.active')}</option>
          <option value="ARCHIVED">{isAr ? 'المؤرشفة فقط' : 'Archived Only'}</option>
          <option value="ALL">{t('common.all')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('common.loading')}</div>
        ) : isError ? (
          <div className="p-12 text-center text-sm text-red-600">{t('errors.serverError')}</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('workItems.noItems')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-start">
              <thead className="bg-[#F8FAFC] border-b border-gray-200 text-xs text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="px-6 py-3.5 text-start">{t('workItems.code')}</th>
                  <th className="px-6 py-3.5 text-start">{t('common.name')}</th>
                  <th className="px-6 py-3.5 text-start">{t('workItems.unit')}</th>
                  <th className="px-6 py-3.5 text-start">{t('workItems.defaultPrice')}</th>
                  <th className="px-6 py-3.5 text-start">{t('nav.workEntries')}</th>
                  <th className="px-6 py-3.5 text-start">{t('common.status')}</th>
                  <th className="px-6 py-3.5 text-end">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item: any) => {
                  const isArchived = !item.isActive
                  const blockedReason = computeBlockedReason(item)

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50/80 transition-colors ${
                        isArchived ? 'bg-gray-50/50 opacity-80' : ''
                      }`}
                    >
                      {/* Code */}
                      <td className="px-6 py-4 font-mono text-xs text-gray-600" dir="ltr">
                        {item.code || '—'}
                      </td>

                      {/* Name */}
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900 block">
                          {isAr ? item.nameAr : item.nameEn || item.nameAr}
                        </span>
                        {item.descriptionAr && (
                          <span className="text-xs text-gray-500 block mt-0.5 line-clamp-1">
                            {item.descriptionAr}
                          </span>
                        )}
                      </td>

                      {/* Unit */}
                      <td className="px-6 py-4 text-gray-700 font-medium">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 text-gray-800 text-xs font-semibold">
                          <span className="font-mono text-blue-700 font-bold">
                            {item.unitOfMeasure?.symbolAr || item.unit}
                          </span>
                          {(item.unitOfMeasure?.nameAr || item.unitEn) && (
                            <span className="text-[11px] text-gray-500 font-normal">
                              ({isAr ? (item.unitOfMeasure?.nameAr || item.unit) : (item.unitOfMeasure?.nameEn || item.unitEn || item.unit)})
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Default Price */}
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {item.defaultPrice !== null && item.defaultPrice !== undefined
                          ? formatCurrency(Number(item.defaultPrice), locale)
                          : '—'}
                      </td>

                      {/* Used in Entries */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 font-medium">
                          {item._count?.workEntries ?? 0}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                            item.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {item.isActive ? t('common.active') : isAr ? 'مؤرشف' : 'Archived'}
                        </span>
                      </td>

                      {/* Contextual Actions Menu */}
                      <td className="px-6 py-4 text-end">
                        <ActionMenu
                          isArchived={isArchived}
                          canDelete={item.canDelete}
                          canPermanentDelete={isAdmin}
                          deleteBlockedReason={blockedReason}
                          onEdit={canEdit ? () => openEditModal(item) : undefined}
                          onArchive={
                            canEdit && !isArchived
                              ? () => openActionModal(item, 'archive')
                              : undefined
                          }
                          onRestore={
                            canEdit && isArchived
                              ? () => openActionModal(item, 'restore')
                              : undefined
                          }
                          onDelete={canEdit ? () => openActionModal(item, 'delete') : undefined}
                          onPermanentDelete={
                            isAdmin
                              ? () => openActionModal(item, 'permanent_delete')
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
            <span>
              {t('common.page')} {page} {t('common.of')} {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white disabled:opacity-50 hover:bg-gray-50 transition-colors"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white disabled:opacity-50 hover:bg-gray-50 transition-colors"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Work Item Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingItem ? t('workItems.editItem') : t('workItems.addItem')}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isAr
                    ? 'الحقول المعلمة بـ (*) إلزامية لتعريف البند'
                    : 'Fields marked with (*) are required'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name Ar (Required) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    {t('common.name')} (العربية){' '}
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isAr ? 'مثال: أعمال صب خرسانة مسلحة' : 'Item Name (Arabic)'}
                  />
                </div>

                {/* Name En (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('common.name')} (English){' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Reinforced Concrete Pouring"
                  />
                </div>

                {/* Unit of Measure (Required & Dynamic) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-800">
                      {t('workItems.unit')}{' '}
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                  </div>
                  {units.length > 0 ? (
                    <select
                      required
                      value={formData.unitOfMeasureId || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        const matched = units.find((u: any) => u.id === val)
                        if (matched) {
                          setFormData({
                            ...formData,
                            unitOfMeasureId: matched.id,
                            unit: matched.symbolAr,
                            unitEn: matched.symbolEn || matched.code,
                          })
                        } else {
                          setFormData({
                            ...formData,
                            unitOfMeasureId: '',
                          })
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">{isAr ? '-- اختر وحدة القياس --' : '-- Select Unit of Measure --'}</option>
                      {units.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {isAr
                            ? `${u.nameAr} (${u.symbolAr})`
                            : `${u.nameEn || u.nameAr} (${u.symbolEn || u.symbolAr})`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={isAr ? 'اختر أو اكتب وحدة القياس' : 'Unit'}
                    />
                  )}
                </div>

                {/* Default Price (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('workItems.defaultPrice')}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    dir="ltr"
                    value={formData.defaultPrice}
                    onChange={(e) => setFormData({ ...formData, defaultPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                {/* Code (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('workItems.code')}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="ITM-001"
                  />
                </div>

                {/* Status Toggle */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('common.status')}
                  </label>
                  <select
                    value={formData.isActive ? 'ACTIVE' : 'ARCHIVED'}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.value === 'ACTIVE' })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ACTIVE">{t('common.active')}</option>
                    <option value="ARCHIVED">{isAr ? 'مؤرشف' : 'Archived'}</option>
                  </select>
                </div>

                {/* Description (Optional) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('common.description')}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.descriptionAr}
                    onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isAr ? 'المواصفات الفنية أو شروط التنفيذ...' : 'Technical description...'}
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 shadow-sm"
                >
                  {saveMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation & Action Dialog */}
      <RecordActionModal
        isOpen={!!actionTarget && !!actionType}
        actionType={actionType}
        recordName={
          actionTarget
            ? isAr
              ? actionTarget.nameAr
              : actionTarget.nameEn || actionTarget.nameAr
            : ''
        }
        recordTypeLabel={t('workItems.title')}
        canDelete={actionTarget?.canDelete ?? false}
        blockedReason={computeBlockedReason(actionTarget)}
        isPending={actionMutation.isPending}
        error={actionError}
        onClose={closeActionModal}
        onConfirm={handleActionConfirm}
        onArchiveInstead={handleArchiveInstead}
      />
    </div>
  )
}
