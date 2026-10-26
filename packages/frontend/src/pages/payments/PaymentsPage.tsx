import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  Edit2,
  ShieldCheck,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'
import { PaymentRegistrationModal } from '../../components/payments/PaymentRegistrationModal'
import { PaymentDetailModal } from '../../components/payments/PaymentDetailModal'

export function PaymentsPage() {
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  // Filters
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // Modals & Action States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [viewingPayment, setViewingPayment] = useState<any | null>(null)
  const [editingPayment, setEditingPayment] = useState<any | null>(null)
  const [approvingPayment, setApprovingPayment] = useState<any | null>(null)
  const [deletingPayment, setDeletingPayment] = useState<any | null>(null)

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  // Clients list
  const { data: clientsData } = useQuery({
    queryKey: ['clients-list-pay'],
    queryFn: async () => {
      const res = await api.get('/clients', { params: { limit: 100 } })
      return res.data?.data?.items || []
    },
  })
  const clients = Array.isArray(clientsData) ? clientsData : []

  // Payments List Query
  const { data, isLoading, isError } = useQuery({
    queryKey: ['payments', { clientFilter, statusFilter, dateFrom, dateTo, page }],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit: 15 }
      if (clientFilter) params.clientId = clientFilter
      if (statusFilter) params.status = statusFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const res = await api.get('/payments', { params })
      return res.data?.data
    },
  })

  const payments = data?.items || []
  const totalPages = data?.totalPages || 1
  const totalCount = data?.total || 0

  // Approve payment mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/payments/${id}/approve`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setApprovingPayment(null)
      if (viewingPayment) setViewingPayment(null)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم اعتماد الدفعة المالية بنجاح' : 'Payment approved successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isAr ? 'فشل اعتماد الدفعة المالية' : 'Failed to approve payment'),
      })
    },
  })

  // Delete / Reverse payment mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/payments/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setDeletingPayment(null)
      if (viewingPayment) setViewingPayment(null)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم عكس الدفعة وتحديث رصيد الفاتورة' : 'Payment reversed successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isAr ? 'فشل عكس / حذف الدفعة' : 'Failed to delete payment'),
      })
    },
  })

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            {isAr ? 'معتمد' : 'Approved'}
          </span>
        )
      case 'REVERSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5" />
            {isAr ? 'معكوس' : 'Reversed'}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" />
            {isAr ? 'مسجل' : 'Recorded'}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isAr ? 'إدارة المدفوعات والتحصيل' : 'Payments & Collections'}
            </h1>
            <p className="text-sm text-gray-500">
              {isAr
                ? 'تسجيل الدفعات الواردة وربطها بالفواتير ومتابعة الأرصدة المتبقية'
                : 'Record incoming payments against invoices and track remaining balances'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setFeedback(null)
            setIsCreateModalOpen(true)
          }}
          data-testid="record-payment-btn"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'تسجيل دفعة جديدة' : 'Record Payment'}</span>
        </button>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Client filter */}
        <select
          value={clientFilter}
          onChange={(e) => {
            setClientFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
        >
          <option value="">{isAr ? 'جميع العملاء' : 'All Clients'}</option>
          {clients.map((c: any) => (
            <option key={c.id} value={c.id}>
              {isAr ? c.nameAr : c.nameEn || c.nameAr}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
        >
          <option value="">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
          <option value="RECORDED">{isAr ? 'مسجل (بانتظار الاعتماد)' : 'Recorded (Pending)'}</option>
          <option value="APPROVED">{isAr ? 'معتمد' : 'Approved'}</option>
          <option value="REVERSED">{isAr ? 'معكوس' : 'Reversed'}</option>
        </select>

        {/* Date From */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">{isAr ? 'من:' : 'From:'}</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
          />
        </div>

        {/* Date To */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">{isAr ? 'إلى:' : 'To:'}</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">
            {isAr ? 'جاري تحميل المدفوعات...' : 'Loading payments...'}
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-red-600">
            {isAr ? 'حدث خطأ أثناء تحميل المدفوعات' : 'Error loading payments'}
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-gray-500">
              {isAr ? 'لا توجد دفعات مسجلة حالياً' : 'No payments recorded'}
            </p>
            <button
              type="button"
              onClick={() => {
                setFeedback(null)
                setIsCreateModalOpen(true)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'تسجيل دفعة' : 'Record Payment'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] print:min-w-0 text-sm text-start">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'تاريخ السداد' : 'Payment Date'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'العميل' : 'Client'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'رقم الفاتورة' : 'Invoice No'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'طريقة الدفع' : 'Method'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'المرجع البنكي' : 'Reference'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'المبلغ المحصّل' : 'Amount'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'الحالة' : 'Status'}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold">
                      {isAr ? 'الإجراءات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((pay: any) => (
                    <tr key={pay.id} className="hover:bg-gray-50 transition-colors">
                      {/* 1. Date */}
                      <td className="px-4 py-3 text-gray-700">
                        {pay.paymentDate ? pay.paymentDate.slice(0, 10) : '-'}
                      </td>

                      {/* 2. Client */}
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {isAr
                          ? pay.client?.nameAr || pay.invoice?.client?.nameAr
                          : pay.client?.nameEn ||
                            pay.invoice?.client?.nameEn ||
                            pay.client?.nameAr ||
                            pay.invoice?.client?.nameAr ||
                            '-'}
                      </td>

                      {/* 3. Invoice Link */}
                      <td className="px-4 py-3">
                        <Link
                          to={`/invoices/${pay.invoiceId}`}
                          className="font-mono text-xs font-bold text-blue-600 hover:underline"
                        >
                          {pay.invoice?.referenceNo || '-'}
                        </Link>
                      </td>

                      {/* 4. Method */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                            pay.method === 'BANK_TRANSFER'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : pay.method === 'CASH'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : pay.method === 'CARD'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : pay.method === 'CHEQUE'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}
                        >
                          {pay.method === 'BANK_TRANSFER'
                            ? isAr
                              ? 'تحويل بنكي'
                              : 'Bank Transfer'
                            : pay.method === 'CASH'
                            ? isAr
                              ? 'نقدًا'
                              : 'Cash'
                            : pay.method === 'CARD'
                            ? isAr
                              ? 'بطاقة / مدى'
                              : 'Card / Mada'
                            : pay.method === 'CHEQUE'
                            ? isAr
                              ? 'شيك'
                              : 'Cheque'
                            : isAr
                            ? 'أخرى'
                            : 'Other'}
                        </span>
                      </td>

                      {/* 5. Reference */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {pay.method === 'BANK_TRANSFER' ? (
                          <div className="space-y-0.5">
                            <span className="font-bold text-gray-900 block">
                              {pay.referenceNo || '—'}
                            </span>
                            {pay.bankAccount && (
                              <span className="text-[10px] text-gray-500 font-sans block">
                                {isAr ? pay.bankAccount.bankNameAr : pay.bankAccount.bankNameEn}
                              </span>
                            )}
                          </div>
                        ) : pay.method === 'CASH' ? (
                          <span className="text-gray-600 font-sans">
                            {pay.receiptNumber
                              ? isAr
                                ? `سند: ${pay.receiptNumber}`
                                : `Receipt: ${pay.receiptNumber}`
                              : '—'}
                          </span>
                        ) : pay.method === 'CARD' ? (
                          <div className="space-y-0.5">
                            <span className="font-sans font-bold text-purple-900 block text-[11px]">
                              {pay.cardProvider || 'MADA'}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono block">
                              {pay.referenceNo || '—'}
                            </span>
                          </div>
                        ) : pay.method === 'CHEQUE' ? (
                          <div className="space-y-0.5">
                            <span className="font-bold text-amber-900 block text-[11px]">
                              {isAr
                                ? `شيك رقم: ${pay.chequeNumber || pay.referenceNo || '—'}`
                                : `Chq: ${pay.chequeNumber || pay.referenceNo || '—'}`}
                            </span>
                            {pay.senderBankName && (
                              <span className="text-[10px] text-gray-500 font-sans block">
                                {pay.senderBankName}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-sans text-xs text-gray-600">
                            {pay.description || pay.referenceNo || '—'}
                          </span>
                        )}
                      </td>

                      {/* 6. Amount */}
                      <td className="px-4 py-3 font-bold text-emerald-700">
                        {formatCurrency(pay.amount, isAr ? 'ar' : 'en', pay.currency || 'SAR')}
                      </td>

                      {/* 7. Status */}
                      <td className="px-4 py-3">{renderStatusBadge(pay.status)}</td>

                      {/* 8. Actions Column with all 4 operations */}
                      <td className="px-4 py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          {/* 1. View Action */}
                          <button
                            type="button"
                            onClick={() => setViewingPayment(pay)}
                            data-testid={`view-payment-${pay.id}`}
                            title={isAr ? 'عرض التفاصيل' : 'View Details'}
                            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* 2. Edit Action */}
                          {pay.status !== 'REVERSED' && (
                            <button
                              type="button"
                              onClick={() => setEditingPayment(pay)}
                              data-testid={`edit-payment-${pay.id}`}
                              title={isAr ? 'تعديل الدفعة' : 'Edit Payment'}
                              className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* 3. Approve Action */}
                          {pay.status !== 'APPROVED' && pay.status !== 'REVERSED' ? (
                            <button
                              type="button"
                              onClick={() => setApprovingPayment(pay)}
                              data-testid={`approve-payment-${pay.id}`}
                              title={isAr ? 'اعتماد الدفعة' : 'Approve Payment'}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          ) : pay.status === 'APPROVED' ? (
                            <span
                              className="p-1.5 text-emerald-500 cursor-default"
                              title={isAr ? 'دفعة معتمدة ومحققة' : 'Verified & Approved Payment'}
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </span>
                          ) : null}

                          {/* 4. Delete Action */}
                          {pay.status !== 'REVERSED' && (
                            <button
                              type="button"
                              onClick={() => setDeletingPayment(pay)}
                              data-testid={`delete-payment-${pay.id}`}
                              title={isAr ? 'عكس / حذف الدفعة' : 'Reverse / Delete Payment'}
                              className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
                <span>{isAr ? `الإجمالي: ${totalCount}` : `Total: ${totalCount}`}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
                  >
                    {isAr ? 'السابق' : 'Previous'}
                  </button>
                  <span>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
                  >
                    {isAr ? 'التالي' : 'Next'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 1. View Detail Modal */}
      <PaymentDetailModal
        isOpen={!!viewingPayment}
        onClose={() => setViewingPayment(null)}
        payment={viewingPayment}
        isAr={isAr}
        onEdit={
          viewingPayment && viewingPayment.status !== 'REVERSED'
            ? () => {
                const target = viewingPayment
                setViewingPayment(null)
                setEditingPayment(target)
              }
            : undefined
        }
        onApprove={
          viewingPayment &&
          viewingPayment.status !== 'APPROVED' &&
          viewingPayment.status !== 'REVERSED'
            ? () => {
                const target = viewingPayment
                setApprovingPayment(target)
              }
            : undefined
        }
        onDelete={
          viewingPayment && viewingPayment.status !== 'REVERSED'
            ? () => {
                const target = viewingPayment
                setDeletingPayment(target)
              }
            : undefined
        }
      />

      {/* 2. Create Payment Modal */}
      <PaymentRegistrationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setFeedback({
            type: 'success',
            message: isAr
              ? 'تم تسجيل الدفعة وتحديث رصيد الفاتورة بنجاح'
              : 'Payment recorded successfully',
          })
        }}
        isAr={isAr}
      />

      {/* 3. Edit Payment Modal */}
      {editingPayment && (
        <PaymentRegistrationModal
          isOpen={!!editingPayment}
          onClose={() => setEditingPayment(null)}
          onSuccess={() => {
            setFeedback({
              type: 'success',
              message: isAr
                ? 'تم حفظ تعديلات الدفعة وتحديث الرصيد بنجاح'
                : 'Payment updated successfully',
            })
          }}
          isAr={isAr}
          paymentToEdit={editingPayment}
          mode="edit"
        />
      )}

      {/* 4. Approve Payment Confirmation Modal */}
      {approvingPayment && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'تأكيد اعتماد الدفعة المالية' : 'Confirm Payment Approval'}
                </h3>
                <p className="text-xs text-gray-500">
                  {isAr
                    ? 'سيتم تسجيل الدفعة كمعتمدة رسمياً ومراجعة من قبل الإدارة'
                    : 'The payment will be formally marked as verified and approved'}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">{isAr ? 'المرجع:' : 'Reference:'}</span>
                <span className="font-mono font-bold text-gray-900">
                  {approvingPayment.referenceNo || `PAY-${approvingPayment.id.slice(0, 8)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isAr ? 'الفاتورة:' : 'Invoice:'}</span>
                <span className="font-mono font-bold text-blue-600">
                  {approvingPayment.invoice?.referenceNo || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isAr ? 'المبلغ:' : 'Amount:'}</span>
                <span className="font-bold text-emerald-700">
                  {formatCurrency(approvingPayment.amount, isAr ? 'ar' : 'en', approvingPayment.currency || approvingPayment.invoice?.currency || 'SAR')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setApprovingPayment(null)}
                disabled={approveMutation.isPending}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => approveMutation.mutate(approvingPayment.id)}
                disabled={approveMutation.isPending}
                data-testid="confirm-approve-payment-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {approveMutation.isPending
                    ? isAr
                      ? 'جارٍ الاعتماد...'
                      : 'Approving...'
                    : isAr
                    ? 'تأكيد الاعتماد'
                    : 'Confirm Approval'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Delete / Reverse Confirmation Modal */}
      {deletingPayment && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'تأكيد عكس / حذف الدفعة' : 'Confirm Payment Reversal'}
                </h3>
                <p className="text-xs text-rose-600 font-medium">
                  {isAr
                    ? 'سيتم إلغاء تأثير الدفعة وإعادة الرصيد إلى الفاتورة المرتبطة'
                    : 'This action will reverse the payment and restore the invoice balance'}
                </p>
              </div>
            </div>

            <div className="bg-rose-50/50 rounded-xl p-3.5 border border-rose-100 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">{isAr ? 'المبلغ المراد عكسه:' : 'Reversal Amount:'}</span>
                <span className="font-bold text-rose-700 font-mono">
                  {formatCurrency(deletingPayment.amount, isAr ? 'ar' : 'en', deletingPayment.currency || deletingPayment.invoice?.currency || 'SAR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{isAr ? 'الفاتورة المتأثرة:' : 'Affected Invoice:'}</span>
                <span className="font-mono font-bold text-gray-800">
                  {deletingPayment.invoice?.referenceNo || '—'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 pt-1 border-t border-rose-100/80">
                {isAr
                  ? 'ملاحظة: تنطبق سياسة العكس المالي المباشر خلال 24 ساعة من التسجيل أو بموافقة المدير المالي.'
                  : 'Note: Direct financial reversal is subject to the 24-hour window or managerial override.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPayment(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deletingPayment.id)}
                disabled={deleteMutation.isPending}
                data-testid="confirm-delete-payment-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {deleteMutation.isPending
                    ? isAr
                      ? 'جارٍ العكس...'
                      : 'Reversing...'
                    : isAr
                    ? 'تأكيد العكس والحذف'
                    : 'Confirm Reversal'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
