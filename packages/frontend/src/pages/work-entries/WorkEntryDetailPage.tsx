import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Send,
  History,
  Building2,
  MapPin,
  User,
  Trash2,
  Edit2,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'

export function WorkEntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    itemNameAr: '',
    itemNameEn: '',
    unit: '',
    quantity: '1',
    unitPrice: '0',
    workDate: '',
    itemDescAr: '',
    notes: '',
  })

  const { data: entry, isLoading, isError } = useQuery({
    queryKey: ['workEntry', id],
    queryFn: async () => {
      const res = await api.get(`/work-entries/${id}`)
      return res.data?.data
    },
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.put(`/work-entries/${id}`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntry', id] })
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEditModalOpen(false)
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(
        err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حفظ التعديلات' : 'Failed to update work entry')
      )
    },
  })

  const actionMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: 'submit' | 'approve' | 'reject'; reason?: string }) => {
      if (action === 'reject') {
        await api.post(`/work-entries/${id}/reject`, { rejectionReason: reason })
      } else {
        await api.post(`/work-entries/${id}/${action}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntry', id] })
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setRejectModalOpen(false)
      setRejectionReason('')
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(
        err?.response?.data?.error?.message ||
          (isAr ? 'تعذر تنفيذ العملية' : 'Operation failed')
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/work-entries/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/work-entries')
    },
    onError: (err: any) => {
      setDeleteConfirmOpen(false)
      setErrorMsg(
        err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف العمل المنفذ' : 'Failed to delete work entry')
      )
    },
  })

  if (isLoading) {
    return (
      <div className="p-12 text-center text-gray-500">
        {isAr ? 'جاري تحميل تفاصيل العمل المنفذ...' : 'Loading work entry details...'}
      </div>
    )
  }

  if (isError || !entry) {
    return (
      <div className="p-12 text-center space-y-3">
        <p className="text-red-600 font-medium">
          {isAr ? 'تعذر العثور على سجل العمل المطلوب' : 'Work entry not found'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/work-entries')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          {isAr ? 'العودة لقائمة الأعمال' : 'Back to Work Entries'}
        </button>
      </div>
    )
  }

  const BackIcon = isAr ? ArrowRight : ArrowLeft

  return (
    <div className="space-y-6">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/work-entries')}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          >
            <BackIcon className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{entry.referenceNo}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                {entry.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {isAr ? entry.itemNameAr : entry.itemNameEn || entry.itemNameAr}
            </p>
          </div>
        </div>

        {/* Workflow Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {(entry.status === 'DRAFT' ||
            entry.status === 'REJECTED' ||
            entry.status === 'PENDING_APPROVAL') && (
            <button
              type="button"
              onClick={() => {
                setEditForm({
                  itemNameAr: entry.itemNameAr || '',
                  itemNameEn: entry.itemNameEn || '',
                  unit: entry.unit || '',
                  quantity: String(entry.quantity),
                  unitPrice: String(entry.unitPrice),
                  workDate: entry.workDate ? entry.workDate.slice(0, 10) : '',
                  itemDescAr: entry.itemDescAr || '',
                  notes: entry.notes || '',
                })
                setEditModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold shadow-xs"
            >
              <Edit2 className="w-4 h-4 text-amber-600" />
              <span>{isAr ? 'تعديل العمل' : 'Edit Entry'}</span>
            </button>
          )}

          {entry.status !== 'FULLY_BILLED' && entry.status !== 'PARTIALLY_BILLED' && (
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isAr ? 'حذف العمل المنفذ' : 'Delete Work Entry'}</span>
            </button>
          )}

          {(entry.status === 'DRAFT' || entry.status === 'REJECTED') && (
            <button
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate({ action: 'submit' })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-xs"
            >
              <Send className="w-4 h-4" />
              <span>{isAr ? 'إرسال للاعتماد' : 'Submit for Approval'}</span>
            </button>
          )}

          {entry.status === 'PENDING_APPROVAL' && (
            <>
              <button
                type="button"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate({ action: 'approve' })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAr ? 'اعتماد العمل' : 'Approve'}</span>
              </button>
              <button
                type="button"
                disabled={actionMutation.isPending}
                onClick={() => setRejectModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-xs"
              >
                <XCircle className="w-4 h-4" />
                <span>{isAr ? 'رفض العمل' : 'Reject'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      {entry.status === 'REJECTED' && entry.rejectionReason && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 space-y-1">
          <p className="font-bold text-sm">{isAr ? 'سبب رفض الاعتماد:' : 'Rejection Reason:'}</p>
          <p className="text-sm">{entry.rejectionReason}</p>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">
              {isAr ? 'بيانات العمل المنفذ' : 'Work Entry Information'}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-gray-500 block">{isAr ? 'اسم البند' : 'Item Name'}</span>
              <span className="font-semibold text-gray-900">
                {isAr ? entry.itemNameAr : entry.itemNameEn || entry.itemNameAr}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">
                {isAr ? 'تاريخ التنفيذ' : 'Work Date'}
              </span>
              <span className="font-semibold text-gray-900">
                {entry.workDate ? entry.workDate.slice(0, 10) : '-'}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">{isAr ? 'الوحدة' : 'Unit'}</span>
              <span className="font-semibold text-gray-900">{entry.unit}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">{isAr ? 'الكمية' : 'Quantity'}</span>
              <span className="font-semibold text-gray-900">
                {Number(entry.quantity).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">
                {isAr ? 'سعر الوحدة' : 'Unit Price'}
              </span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(entry.unitPrice, isAr ? 'ar' : 'en', entry.currency || 'SAR')}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">
                {isAr ? 'الإجمالي' : 'Total Amount'}
              </span>
              <span className="font-bold text-blue-700">
                {formatCurrency(entry.totalAmount, isAr ? 'ar' : 'en', entry.currency || 'SAR')}
              </span>
            </div>
          </div>

          {entry.descriptionAr && (
            <div className="pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500 block mb-1">
                {isAr ? 'الوصف التفصيلي' : 'Description'}
              </span>
              <p className="text-sm text-gray-800">{entry.descriptionAr}</p>
            </div>
          )}

          {entry.internalNotes && (
            <div className="pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500 block mb-1">
                {isAr ? 'ملاحظات داخلية' : 'Internal Notes'}
              </span>
              <p className="text-sm text-gray-700">{entry.internalNotes}</p>
            </div>
          )}
        </div>

        {/* Side Info Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
            {isAr ? 'الارتباطات والتتبع' : 'Links & Tracking'}
          </h3>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <span className="text-xs text-gray-500 block">{isAr ? 'العميل' : 'Client'}</span>
                <Link
                  to={`/clients/${entry.clientId}`}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  {isAr ? entry.client?.nameAr : entry.client?.nameEn || entry.client?.nameAr}
                </Link>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <span className="text-xs text-gray-500 block">{isAr ? 'الموقع' : 'Site'}</span>
                <Link
                  to={`/sites/${entry.siteId}`}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  {isAr ? entry.site?.nameAr : entry.site?.nameEn || entry.site?.nameAr}
                </Link>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <User className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <span className="text-xs text-gray-500 block">
                  {isAr ? 'تم التسجيل بواسطة' : 'Created By'}
                </span>
                <span className="font-medium text-gray-900">
                  {entry.createdBy?.nameAr || '-'}
                </span>
              </div>
            </div>

            {entry.approvedBy && (
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                <div>
                  <span className="text-xs text-gray-500 block">
                    {isAr ? 'المعتمد / المراجع' : 'Reviewed By'}
                  </span>
                  <span className="font-medium text-gray-900">{entry.approvedBy.nameAr}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit History for this Work Entry */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <History className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-gray-900">
            {isAr ? 'سجل التدقيق والعمليات لهذا العمل' : 'Audit Trail'}
          </h2>
        </div>

        {!entry.auditLogs || entry.auditLogs.length === 0 ? (
          <p className="text-sm text-gray-500">
            {isAr ? 'لا توجد سجلات عمليات بعد' : 'No audit logs recorded'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] print:min-w-0 text-sm text-start">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-start font-semibold">
                    {isAr ? 'العملية' : 'Action'}
                  </th>
                  <th className="px-4 py-2.5 text-start font-semibold">
                    {isAr ? 'المستخدم' : 'User'}
                  </th>
                  <th className="px-4 py-2.5 text-start font-semibold">
                    {isAr ? 'التاريخ والوقت' : 'Timestamp'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entry.auditLogs.map((log: any) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 text-gray-800">
                      {log.user?.nameAr || log.user?.email || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-100">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'تأكيد حذف العمل المنفذ' : 'Confirm Work Entry Deletion'}
                </h3>
                <span className="text-xs font-mono text-gray-500">{entry.referenceNo}</span>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              {isAr
                ? `أنت على وشك حذف سجل العمل (${entry.itemNameAr}). هذا الإجراء نهائي ولا يمكن التراجع عنه.`
                : `You are about to permanently delete work entry "${entry.itemNameAr}" (${entry.referenceNo}). This action cannot be undone.`}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending
                  ? isAr
                    ? 'جارٍ الحذف...'
                    : 'Deleting...'
                  : isAr
                  ? 'تأكيد الحذف النهائي'
                  : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'تعديل مسودة العمل المنفذ' : 'Edit Work Entry'}
                </h3>
                <span className="text-xs font-mono text-blue-600">{entry.referenceNo}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const q = Number(editForm.quantity)
                const p = Number(editForm.unitPrice)
                if (!editForm.itemNameAr.trim()) return
                if (isNaN(q) || q <= 0 || isNaN(p) || p < 0) return

                updateMutation.mutate({
                  itemNameAr: editForm.itemNameAr.trim(),
                  itemNameEn: editForm.itemNameEn.trim() || null,
                  unit: editForm.unit.trim(),
                  quantity: q,
                  unitPrice: p,
                  workDate: editForm.workDate || undefined,
                  itemDescAr: editForm.itemDescAr.trim() || null,
                  notes: editForm.notes.trim() || null,
                })
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'اسم البند (عربي) *' : 'Item Name (Arabic) *'}
                </label>
                <input
                  type="text"
                  required
                  value={editForm.itemNameAr}
                  onChange={(e) => setEditForm({ ...editForm, itemNameAr: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'اسم البند (إنجليزي)' : 'Item Name (English)'}
                </label>
                <input
                  type="text"
                  value={editForm.itemNameEn}
                  onChange={(e) => setEditForm({ ...editForm, itemNameEn: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr ? 'الوحدة' : 'Unit'}
                  </label>
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr ? 'الكمية *' : 'Quantity *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr ? 'سعر الوحدة *' : 'Unit Price *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editForm.unitPrice}
                    onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-gray-50 rounded-lg flex items-center justify-between text-xs">
                <span className="text-gray-500">{isAr ? 'الإجمالي المتوقع:' : 'Expected Total:'}</span>
                <span className="font-bold text-gray-900 font-mono">
                  {formatCurrency(
                    (Number(editForm.quantity) || 0) * (Number(editForm.unitPrice) || 0),
                    isAr ? 'ar' : 'en',
                    entry.currency || 'SAR'
                  )}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'تاريخ التنفيذ' : 'Work Date'}
                </label>
                <input
                  type="date"
                  value={editForm.workDate}
                  onChange={(e) => setEditForm({ ...editForm, workDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'ملاحظات وتفاصيل' : 'Description / Notes'}
                </label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateMutation.isPending
                    ? isAr
                      ? 'جارٍ الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ التعديلات'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              {isAr ? 'رفض العمل المنفذ' : 'Reject Work Entry'}
            </h3>
            <textarea
              rows={3}
              required
              placeholder={isAr ? 'سبب الرفض *' : 'Rejection reason *'}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!rejectionReason.trim() || actionMutation.isPending}
                onClick={() =>
                  actionMutation.mutate({ action: 'reject', reason: rejectionReason.trim() })
                }
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {isAr ? 'تأكيد الرفض' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
