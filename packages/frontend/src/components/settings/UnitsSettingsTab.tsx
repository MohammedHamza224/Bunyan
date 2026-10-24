import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Ruler,
  Plus,
  CheckCircle2,
  AlertCircle,
  Star,
  Edit2,
  Trash2,
  X,
  Layers,
  Scale,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { api } from '../../lib/api'

interface UnitsSettingsTabProps {
  isAr: boolean
  canManage: boolean
}

export interface UnitOfMeasure {
  id: string
  code: string
  nameAr: string
  nameEn: string
  symbolAr: string
  symbolEn: string
  category: string
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  _count?: {
    workItemTemplates: number
  }
}

const CATEGORIES = [
  { key: 'AREA', ar: 'مساحة', en: 'Area' },
  { key: 'VOLUME', ar: 'حجم', en: 'Volume' },
  { key: 'LENGTH', ar: 'طول', en: 'Length' },
  { key: 'COUNT', ar: 'عدد / وحدات', en: 'Count / Units' },
  { key: 'WEIGHT', ar: 'وزن', en: 'Weight' },
  { key: 'TIME', ar: 'وقت / عمل', en: 'Time' },
  { key: 'LUMP_SUM', ar: 'مقطوعية', en: 'Lump Sum' },
  { key: 'OTHER', ar: 'أخرى', en: 'Other' },
]

export function UnitsSettingsTab({ isAr, canManage }: UnitsSettingsTabProps) {
  const queryClient = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasure | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Form State
  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    symbolAr: '',
    symbolEn: '',
    category: 'AREA',
    isDefault: false,
    isActive: true,
  })

  // Query units
  const { data: unitsData, isLoading } = useQuery({
    queryKey: ['units', 'all'],
    queryFn: async () => {
      const res = await api.get('/units?all=true')
      return res.data?.data || []
    },
  })
  const units: UnitOfMeasure[] = Array.isArray(unitsData) ? unitsData : []

  // Create / Update Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingUnit) {
        return api.put(`/units/${editingUnit.id}`, payload)
      } else {
        return api.post('/units', payload)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      queryClient.invalidateQueries({ queryKey: ['workItems'] })
      setModalOpen(false)
      setEditingUnit(null)
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم حفظ وحدة القياس بنجاح'
          : 'Unit of measurement saved successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isAr ? 'فشل حفظ وحدة القياس' : 'Failed to save unit of measurement'),
      })
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/units/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      queryClient.invalidateQueries({ queryKey: ['workItems'] })
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم حذف وحدة القياس بنجاح'
          : 'Unit of measurement deleted successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isAr
            ? 'لا يمكن حذف وحدة القياس لأنها مرتبطة ببنوذ أعمال أو قيود مسجلة'
            : 'Cannot delete unit because it is referenced by work items or entries'),
      })
    },
  })

  // Set Default Mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.put(`/units/${id}/set-default`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم تعيين الوحدة كوحدة افتراضية للمؤسسة'
          : 'Default unit updated successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isAr ? 'فشل تعيين الوحدة الافتراضية' : 'Failed to set default unit'),
      })
    },
  })

  // Toggle Active Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return api.put(`/units/${id}`, { isActive })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم تحديث حالة الوحدة' : 'Unit status updated',
      })
    },
  })

  const openAddModal = () => {
    setEditingUnit(null)
    setForm({
      code: '',
      nameAr: '',
      nameEn: '',
      symbolAr: '',
      symbolEn: '',
      category: 'AREA',
      isDefault: units.length === 0,
      isActive: true,
    })
    setFeedback(null)
    setModalOpen(true)
  }

  const openEditModal = (unit: UnitOfMeasure) => {
    setEditingUnit(unit)
    setForm({
      code: unit.code,
      nameAr: unit.nameAr,
      nameEn: unit.nameEn || '',
      symbolAr: unit.symbolAr,
      symbolEn: unit.symbolEn || '',
      category: unit.category || 'AREA',
      isDefault: unit.isDefault,
      isActive: unit.isActive,
    })
    setFeedback(null)
    setModalOpen(true)
  }

  const handleDelete = (unit: UnitOfMeasure) => {
    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف وحدة القياس "${unit.nameAr} (${unit.symbolAr})"؟`
      : `Are you sure you want to delete unit "${unit.nameEn || unit.nameAr} (${unit.symbolAr})"?`
    if (window.confirm(confirmMsg)) {
      deleteMutation.mutate(unit.id)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nameAr.trim() || !form.symbolAr.trim()) {
      setFeedback({
        type: 'error',
        message: isAr
          ? 'يرجى كتابة اسم الوحدة والرمز بالعربية على الأقل'
          : 'Please provide Arabic unit name and symbol',
      })
      return
    }

    saveMutation.mutate({
      code: form.code.trim().toUpperCase() || undefined,
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || form.nameAr.trim(),
      symbolAr: form.symbolAr.trim(),
      symbolEn: form.symbolEn.trim() || form.symbolAr.trim(),
      category: form.category,
      isDefault: form.isDefault,
      isActive: form.isActive,
    })
  }

  const getCategoryLabel = (catKey: string) => {
    const c = CATEGORIES.find((item) => item.key === catKey)
    if (!c) return catKey
    return isAr ? c.ar : c.en
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <Ruler className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isAr ? 'وحدات القياس الإنشائية (Units of Measurement)' : 'Construction Units of Measurement'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr
                  ? 'إدارة كتالوج وحدات القياس للبنود والقيود الإنشائية (م²، م³، م.ط، كجم، طن، مقطوعية وغيرها)'
                  : 'Manage dynamic units catalog for construction work items, entries, and financial statements'}
              </p>
            </div>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={openAddModal}
              data-testid="add-unit-btn"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة وحدة قياس جديدة' : 'Add New Unit'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Units Grid */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-bold text-gray-800">
              {isAr ? 'قائمة الوحدات المعتمدة' : 'Registered Units Catalog'}
            </h3>
            <span className="text-xs font-mono font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {units.length}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : units.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">
            {isAr ? 'لا توجد وحدات قياس معرفة' : 'No units of measurement found'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {units.map((unit) => (
              <div
                key={unit.id}
                className={`relative p-4 rounded-xl border transition-all ${
                  unit.isDefault
                    ? 'border-blue-300 bg-blue-50/30 shadow-xs'
                    : unit.isActive
                    ? 'border-gray-200 bg-white hover:border-gray-300 shadow-xs'
                    : 'border-gray-200 bg-gray-50/70 opacity-60'
                }`}
              >
                {/* Header row: symbol & badges */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 font-bold text-sm flex items-center justify-center font-mono shadow-2xs">
                      {unit.symbolAr}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 leading-tight">
                        {isAr ? unit.nameAr : unit.nameEn || unit.nameAr}
                      </h4>
                      <span className="text-[11px] text-gray-500 font-mono block">
                        {unit.code} • {unit.symbolEn || unit.symbolAr}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {unit.isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        <Star className="w-3 h-3 fill-blue-600 text-blue-600" />
                        <span>{isAr ? 'افتراضي' : 'Default'}</span>
                      </span>
                    )}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {getCategoryLabel(unit.category)}
                    </span>
                  </div>
                </div>

                {/* Second row: usage count & status */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                  <span className="text-[11px]">
                    {isAr
                      ? `البنود المرتبطة: ${unit._count?.workItemTemplates ?? 0}`
                      : `Work Items: ${unit._count?.workItemTemplates ?? 0}`}
                  </span>

                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      unit.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {unit.isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطل' : 'Inactive')}
                  </span>
                </div>

                {/* Action buttons */}
                {canManage && (
                  <div className="flex items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-100">
                    {!unit.isDefault && unit.isActive && (
                      <button
                        type="button"
                        onClick={() => setDefaultMutation.mutate(unit.id)}
                        disabled={setDefaultMutation.isPending}
                        title={isAr ? 'تعيين كوحدة افتراضية' : 'Set as default unit'}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        {isAr ? 'تعيين كافتراضي' : 'Set Default'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        toggleActiveMutation.mutate({ id: unit.id, isActive: !unit.isActive })
                      }
                      title={unit.isActive ? (isAr ? 'تعطيل' : 'Deactivate') : (isAr ? 'تفعيل' : 'Activate')}
                      className="p-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      {unit.isActive ? (
                        <ToggleRight className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-gray-400" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(unit)}
                      title={isAr ? 'تعديل' : 'Edit'}
                      className="p-1.5 text-blue-600 hover:text-blue-800 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(unit)}
                      disabled={unit.isDefault || deleteMutation.isPending}
                      title={isAr ? 'حذف' : 'Delete'}
                      className="p-1.5 text-red-600 hover:text-red-800 rounded-lg hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Unit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Ruler className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-gray-900">
                  {editingUnit
                    ? isAr
                      ? 'تعديل وحدة القياس'
                      : 'Edit Unit of Measurement'
                    : isAr
                    ? 'إضافة وحدة قياس جديدة'
                    : 'Add New Unit of Measurement'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Code */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'كود الوحدة (الرمز النظامي)' : 'Unit Code'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="M2, M3, LM, PCS, KG..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'تصنيف الوحدة' : 'Category'}
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {isAr ? c.ar : c.en}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Arabic Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'الاسم بالعربية' : 'Name (Arabic)'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.nameAr}
                    onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                    placeholder="مثال: متر مربع"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Arabic Symbol */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'الرمز بالعربية' : 'Symbol (Arabic)'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.symbolAr}
                    onChange={(e) => setForm({ ...form, symbolAr: e.target.value })}
                    placeholder="مثال: م²"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* English Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'الاسم بالإنجليزية' : 'Name (English)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={form.nameEn}
                    onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                    placeholder="e.g. Square Meter"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* English Symbol */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'الرمز بالإنجليزية' : 'Symbol (English)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={form.symbolEn}
                    onChange={(e) => setForm({ ...form, symbolEn: e.target.value })}
                    placeholder="e.g. m² or SQM"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>{isAr ? 'تعيين كوحدة قياس افتراضية' : 'Set as default unit'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>{isAr ? 'الوحدة مفعلة ونشطة' : 'Active and available'}</span>
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                >
                  {saveMutation.isPending
                    ? isAr
                      ? 'جارٍ الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ الوحدة'
                    : 'Save Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
