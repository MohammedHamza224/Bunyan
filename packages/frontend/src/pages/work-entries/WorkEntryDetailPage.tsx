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
} from 'lucide-react'
import { api } from '../../lib/api'

export function WorkEntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: entry, isLoading, isError } = useQuery({
    queryKey: ['workEntry', id],
    queryFn: async () => {
      const res = await api.get(`/work-entries/${id}`)
      return res.data?.data
    },
    enabled: !!id,
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
        <div className="flex items-center gap-2">
          {(entry.status === 'DRAFT' || entry.status === 'REJECTED') && (
            <button
              type="button"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate({ action: 'submit' })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAr ? 'اعتماد العمل' : 'Approve'}</span>
              </button>
              <button
                type="button"
                disabled={actionMutation.isPending}
                onClick={() => setRejectModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
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
                {Number(entry.unitPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">
                {isAr ? 'الإجمالي' : 'Total Amount'}
              </span>
              <span className="font-bold text-blue-700">
                {Number(entry.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                SAR
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
            <table className="w-full text-sm text-start">
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
