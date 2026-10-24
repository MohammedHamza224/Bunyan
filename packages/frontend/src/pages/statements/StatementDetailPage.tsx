import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Printer,
  CheckCircle2,
  XCircle,
  Receipt,
  Building2,
  User,
  Trash2,
} from 'lucide-react'
import { api } from '../../lib/api'

export function StatementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: statement, isLoading, isError } = useQuery({
    queryKey: ['statement', id],
    queryFn: async () => {
      const res = await api.get(`/statements/${id}`)
      return res.data?.data
    },
    enabled: !!id,
  })

  const approveMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/statements/${id}/approve`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statement', id] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error?.message || 'Error approving statement')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/statements/${id}/cancel`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statement', id] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error?.message || 'Error cancelling statement')
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/statements/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      navigate('/statements')
    },
    onError: (err: any) => {
      setErrorMsg(
        err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف كشف الحساب' : 'Failed to delete statement')
      )
    },
  })

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/invoices/from-statement', {
        statementId: id,
        issueDate: new Date().toISOString().slice(0, 10),
      })
      return res.data?.data
    },
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({ queryKey: ['statement', id] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      if (newInvoice?.id) {
        navigate(`/invoices/${newInvoice.id}`)
      }
    },
    onError: (err: any) => {
      setErrorMsg(
        err?.response?.data?.error?.message ||
          (isAr ? 'تعذر إصدار الفاتورة من المستخلص' : 'Failed to create invoice from statement')
      )
    },
  })

  if (isLoading) {
    return (
      <div className="p-12 text-center text-gray-500">
        {isAr ? 'جاري تحميل بيانات المستخلص...' : 'Loading statement...'}
      </div>
    )
  }

  if (isError || !statement) {
    return (
      <div className="p-12 text-center space-y-3">
        <p className="text-red-600">{isAr ? 'المستخلص غير موجود' : 'Statement not found'}</p>
        <button
          type="button"
          onClick={() => navigate('/statements')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          {isAr ? 'العودة للمستخلصات' : 'Back to Statements'}
        </button>
      </div>
    )
  }

  const BackIcon = isAr ? ArrowRight : ArrowLeft
  const orgSnapshot = (statement.orgSnapshot || {}) as Record<string, any>

  return (
    <div className="space-y-6">
      {/* Action Bar (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/statements')}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          >
            <BackIcon className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{statement.referenceNo}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                {statement.status}
              </span>
            </div>
            {statement.title && <p className="text-sm text-gray-500">{statement.title}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isAr ? 'طباعة PDF (A4)' : 'Print PDF (A4)'}</span>
          </button>

          {statement.status === 'DRAFT' && (
            <>
              <button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAr ? 'اعتماد المستخلص' : 'Approve Statement'}</span>
              </button>
              <button
                type="button"
                disabled={deleteDraftMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      isAr
                        ? 'هل أنت متأكد من رغبتك في حذف مسودة كشف الحساب نهائياً؟'
                        : 'Are you sure you want to permanently delete this draft statement?'
                    )
                  ) {
                    deleteDraftMutation.mutate()
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isAr ? 'حذف المسودة نهائياً' : 'Delete Draft'}</span>
              </button>
            </>
          )}

          {statement.status === 'APPROVED' && (
            <button
              type="button"
              disabled={createInvoiceMutation.isPending}
              onClick={() => createInvoiceMutation.mutate()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
            >
              <Receipt className="w-4 h-4" />
              <span>
                {isAr ? 'إصدار فاتورة ضريبية من المستخلص' : 'Generate Invoice from Statement'}
              </span>
            </button>
          )}

          {(statement.status === 'DRAFT' || statement.status === 'APPROVED') && (
            <button
              type="button"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
            >
              <XCircle className="w-4 h-4" />
              <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm print:hidden">
          {errorMsg}
        </div>
      )}

      {/* A4 Printable Statement Sheet */}
      <div className="a4-print-sheet bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-6 print:shadow-none print:border-0 print:p-0">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-6 border-b border-gray-200 pb-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-gray-900">
              {isAr ? 'مستخلص أعمال منفذة' : 'WORK STATEMENT'}
            </h2>
            <p className="font-mono text-sm font-semibold text-blue-600">
              {statement.referenceNo}
            </p>
            {statement.title && (
              <p className="text-sm font-medium text-gray-700">{statement.title}</p>
            )}
          </div>

          <div className="text-sm space-y-1 sm:text-end">
            <p className="font-bold text-gray-900">
              {isAr
                ? orgSnapshot.businessName || 'المؤسسة المنفذة'
                : orgSnapshot.businessNameEn || orgSnapshot.businessName || 'Contractor'}
            </p>
            {orgSnapshot.vatNumber && (
              <p className="text-xs text-gray-600">
                {isAr ? 'الرقم الضريبي: ' : 'VAT No: '}
                <span className="font-mono">{orgSnapshot.vatNumber}</span>
              </p>
            )}
            {orgSnapshot.address && <p className="text-xs text-gray-500">{orgSnapshot.address}</p>}
            <p className="text-xs text-gray-500">
              {isAr ? 'تاريخ الإصدار: ' : 'Issue Date: '}
              {statement.issueDate ? statement.issueDate.slice(0, 10) : '-'}
            </p>
          </div>
        </div>

        {/* Client & Sites Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <User className="w-3.5 h-3.5" />
              <span>{isAr ? 'بيانات العميل' : 'Client Details'}</span>
            </div>
            <p className="font-bold text-gray-900">
              {isAr
                ? statement.client?.nameAr
                : statement.client?.nameEn || statement.client?.nameAr}
            </p>
            {statement.client?.vatNumber && (
              <p className="text-xs text-gray-600">
                {isAr ? 'الرقم الضريبي للعميل: ' : 'Client VAT No: '}
                <span className="font-mono">{statement.client.vatNumber}</span>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <Building2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'المواقع المشمولة والفترة' : 'Sites & Period'}</span>
            </div>
            <p className="font-medium text-gray-800">
              {statement.sites && statement.sites.length > 0
                ? statement.sites
                    .map((s: any) => (isAr ? s.site?.nameAr : s.site?.nameEn || s.site?.nameAr))
                    .join(' ، ')
                : isAr
                ? 'جميع مواقع العميل المرتبطة'
                : 'Linked Client Sites'}
            </p>
            {(statement.periodStart || statement.periodEnd) && (
              <p className="text-xs text-gray-600">
                {isAr ? 'الفترة: ' : 'Period: '}
                {statement.periodStart ? statement.periodStart.slice(0, 10) : '...'} →{' '}
                {statement.periodEnd ? statement.periodEnd.slice(0, 10) : '...'}
              </p>
            )}
          </div>
        </div>

        {/* Statement Lines Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-start border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-700 border-y border-gray-200">
                <th className="py-3 px-4 text-start font-semibold">#</th>
                <th className="py-3 px-4 text-start font-semibold">
                  {isAr ? 'مرجع العمل' : 'Work Ref'}
                </th>
                <th className="py-3 px-4 text-start font-semibold">
                  {isAr ? 'وصف البند والعمل المنفذ' : 'Work Item Description'}
                </th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الوحدة' : 'Unit'}</th>
                <th className="py-3 px-4 text-start font-semibold">
                  {isAr ? 'الكمية المعتمدة' : 'Approved Qty'}
                </th>
                <th className="py-3 px-4 text-start font-semibold">
                  {isAr ? 'سعر الوحدة' : 'Unit Price'}
                </th>
                <th className="py-3 px-4 text-end font-semibold">
                  {isAr ? 'الإجمالي' : 'Line Total'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(statement.lines || []).map((line: any, index: number) => (
                <tr key={line.id}>
                  <td className="py-3 px-4 text-gray-500">{index + 1}</td>
                  <td className="py-3 px-4 font-mono text-xs text-blue-600">
                    {line.workEntry?.referenceNo || '-'}
                  </td>
                  <td className="py-3 px-4 font-medium text-gray-900">
                    {isAr ? line.itemNameAr : line.itemNameEn || line.itemNameAr}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{line.unit}</td>
                  <td className="py-3 px-4 text-gray-800">
                    {Number(line.approvedQuantity).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-gray-800">
                    {Number(line.unitPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    SAR
                  </td>
                  <td className="py-3 px-4 text-end font-semibold text-gray-900">
                    {Number(line.lineTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    SAR
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Totals */}
        <div className="flex flex-col sm:flex-row justify-between gap-6 pt-4 border-t border-gray-200">
          <div className="space-y-2 text-sm text-gray-600 max-w-md">
            {statement.notes && (
              <div>
                <span className="font-semibold text-gray-800 block">
                  {isAr ? 'ملاحظات:' : 'Notes:'}
                </span>
                <p>{statement.notes}</p>
              </div>
            )}
            {statement.invoices && statement.invoices.length > 0 && (
              <div className="print:hidden pt-2">
                <span className="font-semibold text-gray-800 block mb-1">
                  {isAr ? 'الفواتير المرتبطة بهذا المستخلص:' : 'Linked Invoices:'}
                </span>
                {statement.invoices.map((inv: any) => (
                  <Link
                    key={inv.id}
                    to={`/invoices/${inv.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-50 text-purple-700 font-mono text-xs font-bold hover:underline me-2"
                  >
                    {inv.referenceNo} ({inv.status})
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="w-full sm:w-80 space-y-2 text-sm bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div className="flex justify-between text-gray-600">
              <span>{isAr ? 'الإجمالي قبل الضريبة:' : 'Subtotal:'}</span>
              <span>
                {Number(statement.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                SAR
              </span>
            </div>
            {Number(statement.discountAmount) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>{isAr ? 'الخصم:' : 'Discount:'}</span>
                <span>
                  -{' '}
                  {Number(statement.discountAmount).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                  })}{' '}
                  SAR
                </span>
              </div>
            )}
            <div className="flex justify-between text-gray-700">
              <span>{isAr ? 'المبلغ الخاضع للضريبة:' : 'Taxable Amount:'}</span>
              <span>
                {Number(statement.taxableAmount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}{' '}
                SAR
              </span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>
                {isAr
                  ? `ضريبة القيمة المضافة (${Number(statement.vatRate)}%):`
                  : `VAT (${Number(statement.vatRate)}%):`}
              </span>
              <span>
                {Number(statement.vatAmount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}{' '}
                SAR
              </span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>{isAr ? 'الإجمالي المستحق شامل الضريبة:' : 'Total Due (Incl. VAT):'}</span>
              <span className="text-blue-700">
                {Number(statement.totalAmount).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}{' '}
                SAR
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
