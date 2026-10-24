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
  Building2,
  Wallet,
  Receipt,
} from 'lucide-react'
import { api } from '../../lib/api'
import { PaymentRegistrationModal } from '../../components/payments/PaymentRegistrationModal'

export function PaymentsPage() {
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  const [clientFilter, setClientFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
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

  // Open Invoices (UNPAID or PARTIALLY_PAID) for modal
  const { data: openInvoicesData } = useQuery({
    queryKey: ['open-invoices-pay'],
    queryFn: async () => {
      const res = await api.get('/invoices', { params: { limit: 100 } })
      return (res.data?.data?.items || []).filter(
        (inv: any) => inv.status !== 'CANCELLED' && Number(inv.remainingAmount) > 0
      )
    },
    enabled: modalOpen,
  })
  const openInvoices = Array.isArray(openInvoicesData) ? openInvoicesData : []

  // Payments List Query
  const { data, isLoading, isError } = useQuery({
    queryKey: ['payments', { clientFilter, dateFrom, dateTo, page }],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit: 15 }
      if (clientFilter) params.clientId = clientFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const res = await api.get('/payments', { params })
      return res.data?.data
    },
  })

  const payments = data?.items || []
  const totalPages = data?.totalPages || 1
  const totalCount = data?.total || 0

  const recordMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.post('/payments', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setModalOpen(false)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم تسجيل الدفعة وتحديث رصيد الفاتورة بنجاح' : 'Payment recorded successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر تسجيل الدفعة' : 'Failed to record payment'),
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/payments/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم عكس الدفعة وتحديث رصيد الفاتورة' : 'Payment reversed',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || 'Failed to delete payment',
      })
    },
  })

  const openModal = () => {
    setFeedback(null)
    setModalOpen(true)
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
          onClick={openModal}
          data-testid="record-payment-btn"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'تسجيل دفعة جديدة' : 'Record Payment'}</span>
        </button>
      </div>

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
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-3">
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
              onClick={openModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'تسجيل دفعة' : 'Record Payment'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-start">
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
                    <th className="px-4 py-3 text-end font-semibold">
                      {isAr ? 'الإجراءات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((pay: any) => (
                    <tr key={pay.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">
                        {pay.paymentDate ? pay.paymentDate.slice(0, 10) : '-'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {isAr ? pay.client?.nameAr : pay.client?.nameEn || pay.client?.nameAr}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/invoices/${pay.invoiceId}`}
                          className="font-mono text-xs font-bold text-blue-600 hover:underline"
                        >
                          {pay.invoice?.referenceNo || '-'}
                        </Link>
                      </td>
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
                            {pay.receiptNumber ? (isAr ? `سند: ${pay.receiptNumber}` : `Receipt: ${pay.receiptNumber}`) : '—'}
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
                              {isAr ? `شيك رقم: ${pay.chequeNumber || pay.referenceNo || '—'}` : `Chq: ${pay.chequeNumber || pay.referenceNo || '—'}`}
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
                      <td className="px-4 py-3 font-bold text-emerald-700">
                        {Number(pay.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}{' '}
                        SAR
                      </td>
                      <td className="px-4 py-3 text-end">
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(pay.id)}
                          title={isAr ? 'عكس / حذف الدفعة (خلال 24 ساعة)' : 'Reverse Payment'}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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

      {/* Record Payment Modal */}
      <PaymentRegistrationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        isAr={isAr}
      />
    </div>
  )
}
