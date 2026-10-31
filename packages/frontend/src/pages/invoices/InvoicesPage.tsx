import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Receipt,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  X,
  AlertCircle,
  QrCode,
  Trash2,
  Edit2,
  Printer,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { formatCurrency, getCurrencySymbol } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { useDebounce } from '../../hooks/useDebounce'

export function InvoicesPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, hasPermission } = useAuth()
  const isAr = i18n.language === 'ar'

  const isAdmin =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ORG_ADMIN' ||
    (user?.permissions && user.permissions.includes('MANAGE_SETTINGS')) ||
    (typeof hasPermission === 'function' && hasPermission('MANAGE_SETTINGS'))

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createMode, setCreateMode] = useState<'fromStatement' | 'direct'>('fromStatement')
  const [cancellingInvoice, setCancellingInvoice] = useState<any | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({
    dueDate: '',
    supplyDate: '',
    discountAmount: '0',
    notes: '',
  })
  const [deletingInvoice, setDeletingInvoice] = useState<any | null>(null)
  const [confirmTestCleanup, setConfirmTestCleanup] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  // Form state for creating invoice
  const [form, setForm] = useState({
    clientId: '',
    invoiceType: 'TAX_INVOICE',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    supplyDate: new Date().toISOString().slice(0, 10),
    discountAmount: '0',
    isTaxExempt: false,
    notes: '',
  })
  const [selectedStatementIds, setSelectedStatementIds] = useState<string[]>([])
  const [selectedWorkEntries, setSelectedWorkEntries] = useState<Record<string, string>>({})

  // Clients list
  const { data: clientsData } = useQuery({
    queryKey: ['clients-list-inv'],
    queryFn: async () => {
      const res = await api.get('/clients', { params: { limit: 100 } })
      return res.data?.data?.items || []
    },
  })
  const clients = Array.isArray(clientsData) ? clientsData : []

  // Approved statements for selected client
  const { data: approvedStatementsData } = useQuery({
    queryKey: ['approved-statements-inv', form.clientId],
    queryFn: async () => {
      const params: Record<string, any> = { status: 'APPROVED', limit: 100 }
      if (form.clientId) params.clientId = form.clientId
      const res = await api.get('/statements', { params })
      return res.data?.data?.items || []
    },
    enabled: createModalOpen && createMode === 'fromStatement',
  })
  const approvedStatements = Array.isArray(approvedStatementsData) ? approvedStatementsData : []

  // Eligible work entries for direct invoicing
  const { data: eligibleEntriesData } = useQuery({
    queryKey: ['eligible-work-entries-inv', form.clientId],
    queryFn: async () => {
      if (!form.clientId) return []
      const res = await api.get('/work-entries', {
        params: {
          clientId: form.clientId,
          status: 'APPROVED,PARTIALLY_BILLED',
          limit: 100,
        },
      })
      return (res.data?.data?.items || []).filter(
        (we: any) => Number(we.quantity) - Number(we.billedQuantity) > 0
      )
    },
    enabled: createModalOpen && createMode === 'direct' && !!form.clientId,
  })
  const eligibleEntries = Array.isArray(eligibleEntriesData) ? eligibleEntriesData : []

  // Invoices Query
  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', { search: debouncedSearch, clientFilter, statusFilter, paymentStatusFilter, page }],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit: 15 }
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      if (clientFilter) params.clientId = clientFilter
      if (statusFilter) params.status = statusFilter
      if (paymentStatusFilter) params.paymentStatus = paymentStatusFilter
      const res = await api.get('/invoices', { params })
      return res.data?.data
    },
  })

  const invoices = data?.items || []
  const totalPages = data?.totalPages || 1
  const totalCount = data?.total || 0

  // Mutations
  const createInvoiceMutation = useMutation({
    mutationFn: async (payload: { endpoint: string; body: any }) => {
      const res = await api.post(payload.endpoint, payload.body)
      return res.data?.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCreateModalOpen(false)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم إصدار الفاتورة بنجاح' : 'Invoice created successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر إصدار الفاتورة' : 'Failed to create invoice'),
      })
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/invoices/${id}/approve`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم اعتماد الفاتورة وتوليد رمز ZATCA QR وملف XML بنجاح'
          : 'Invoice approved and ZATCA QR/XML generated',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || 'Error approving invoice',
      })
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: async (payload: { id: string; testCleanup?: boolean } | string) => {
      const id = typeof payload === 'string' ? payload : payload.id
      const isTest = typeof payload === 'object' ? payload.testCleanup : false
      await api.delete(`/invoices/${id}${isTest ? '?testCleanup=true' : ''}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setDeletingInvoice(null)
      setConfirmTestCleanup(false)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم حذف الفاتورة بنجاح' : 'Invoice deleted successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف الفاتورة' : 'Failed to delete invoice'),
      })
    },
  })

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => {
      const res = await api.put(`/invoices/${id}`, body)
      return res.data?.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEditingInvoice(null)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم حفظ تعديلات مسودة الفاتورة بنجاح' : 'Draft invoice updated successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر تعديل مسودة الفاتورة' : 'Failed to update draft invoice'),
      })
    },
  })

  const handleOpenEdit = (inv: any) => {
    setEditingInvoice(inv)
    setEditForm({
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
      supplyDate: inv.supplyDate ? inv.supplyDate.slice(0, 10) : '',
      discountAmount: String(inv.discountAmount || '0'),
      notes: inv.notes || '',
    })
  }

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/invoices/${id}/cancel`, { cancellationReason: reason })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCancellingInvoice(null)
      setCancellationReason('')
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم إلغاء الفاتورة وعكس الكميات المفوترة على الأعمال المرتبطة'
          : 'Invoice cancelled and billed quantities reversed',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || 'Error cancelling invoice',
      })
    },
  })

  const openCreateModal = () => {
    setFeedback(null)
    setForm({
      clientId: clientFilter || (clients[0]?.id ?? ''),
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: '',
      supplyDate: new Date().toISOString().slice(0, 10),
      discountAmount: '0',
      isTaxExempt: false,
      notes: '',
    })
    setSelectedStatementIds([])
    setSelectedWorkEntries({})
    setCreateModalOpen(true)
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (createMode === 'fromStatement') {
      if (selectedStatementIds.length === 0) {
        setFeedback({
          type: 'error',
          message: isAr
            ? 'يرجى اختيار مستخلص معتمد واحد على الأقل'
            : 'Please select at least one approved statement',
        })
        return
      }
      createInvoiceMutation.mutate({
        endpoint: '/invoices/from-statement',
        body: {
          statementIds: selectedStatementIds,
          invoiceType: form.invoiceType,
          issueDate: form.issueDate,
          dueDate: form.dueDate || null,
          supplyDate: form.supplyDate || null,
          isTaxExempt: form.isTaxExempt,
          notes: form.notes.trim() || null,
        },
      })
    } else {
      const lines = Object.entries(selectedWorkEntries).map(([workEntryId, qty]) => ({
        workEntryId,
        quantity: Number(qty),
      }))
      if (!form.clientId || lines.length === 0) {
        setFeedback({
          type: 'error',
          message: isAr
            ? 'يرجى اختيار العميل وبند عمل معتمد واحد على الأقل'
            : 'Please select client and at least one approved work entry',
        })
        return
      }
      createInvoiceMutation.mutate({
        endpoint: '/invoices/direct',
        body: {
          clientId: form.clientId,
          invoiceType: form.invoiceType,
          issueDate: form.issueDate,
          dueDate: form.dueDate || null,
          supplyDate: form.supplyDate || null,
          discountAmount: Number(form.discountAmount) || 0,
          isTaxExempt: form.isTaxExempt,
          notes: form.notes.trim() || null,
          lines,
        },
      })
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { ar: string; en: string; cls: string }> = {
      DRAFT: { ar: 'مسودة', en: 'Draft', cls: 'bg-gray-100 text-gray-700' },
      APPROVED: { ar: 'معتمدة / صادرة', en: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
      SENT: { ar: 'مرسلة', en: 'Sent', cls: 'bg-blue-100 text-blue-800' },
      CANCELLED: { ar: 'ملغاة', en: 'Cancelled', cls: 'bg-red-100 text-red-700' },
    }
    const item = map[status] || { ar: status, en: status, cls: 'bg-gray-100 text-gray-700' }
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${item.cls}`}>
        {isAr ? item.ar : item.en}
      </span>
    )
  }

  const paymentBadge = (paymentStatus: string) => {
    const map: Record<string, { ar: string; en: string; cls: string }> = {
      UNPAID: { ar: 'غير مدفوعة', en: 'Unpaid', cls: 'bg-amber-100 text-amber-800' },
      PARTIALLY_PAID: {
        ar: 'مدفوعة جزئياً',
        en: 'Partially Paid',
        cls: 'bg-blue-100 text-blue-800',
      },
      PAID: { ar: 'مدفوعة بالكامل', en: 'Paid', cls: 'bg-emerald-100 text-emerald-800' },
    }
    const item = map[paymentStatus] || {
      ar: paymentStatus,
      en: paymentStatus,
      cls: 'bg-gray-100 text-gray-700',
    }
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${item.cls}`}>
        {isAr ? item.ar : item.en}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {t('invoices.heading', isAr ? 'الفواتير وإدارة الفوترة' : 'Invoices & Billing Management')}
            </h1>
            <p className="text-sm text-gray-500">
              {t(
                'invoices.description',
                isAr
                  ? 'إصدار الفواتير من المستخلصات المعتمدة أو الأعمال المنفذة، مع منع تكرار الفوترة ودعم متطلبات الفوترة الإلكترونية.'
                  : 'Issue invoices from approved work-completion statements or completed work, prevent duplicate billing, and support electronic invoicing requirements.'
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          data-testid="create-invoice-btn"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'إصدار فاتورة جديدة' : 'Create Invoice'}</span>
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
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={isAr ? 'بحث برقم الفاتورة...' : 'Search by invoice ref...'}
            className="w-full ps-9 pe-4 py-2 rounded-lg border border-gray-300 text-sm"
          />
        </div>

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

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
        >
          <option value="">{isAr ? 'جميع حالات الفاتورة' : 'All Invoice Statuses'}</option>
          <option value="DRAFT">{isAr ? 'مسودة' : 'Draft'}</option>
          <option value="APPROVED">{isAr ? 'معتمدة / صادرة' : 'Approved'}</option>
          <option value="CANCELLED">{isAr ? 'ملغاة' : 'Cancelled'}</option>
        </select>

        <select
          value={paymentStatusFilter}
          onChange={(e) => {
            setPaymentStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
        >
          <option value="">{isAr ? 'جميع حالات السداد' : 'All Payment Statuses'}</option>
          <option value="UNPAID">{isAr ? 'غير مدفوعة' : 'Unpaid'}</option>
          <option value="PARTIALLY_PAID">{isAr ? 'مدفوعة جزئياً' : 'Partially Paid'}</option>
          <option value="PAID">{isAr ? 'مدفوعة بالكامل' : 'Paid'}</option>
        </select>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">
            {isAr ? 'جاري تحميل الفواتير...' : 'Loading invoices...'}
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-red-600">
            {isAr ? 'حدث خطأ أثناء تحميل الفواتير' : 'Error loading invoices'}
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-gray-500">
              {isAr ? 'لا توجد فواتير مسجلة حالياً' : 'No invoices found'}
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إصدار أول فاتورة' : 'Create First Invoice'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] print:min-w-0 text-sm text-start">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'رقم الفاتورة' : 'Invoice No'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'النوع' : 'Type'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'العميل' : 'Client'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'الإجمالي (شامل الضريبة)' : 'Total (Incl. VAT)'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'المدفوع / المتبقي' : 'Paid / Remaining'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'حالة الفاتورة' : 'Status'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'السداد' : 'Payment'}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold">
                      {isAr ? 'الإجراءات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-blue-600 flex items-center gap-1">
                          <span>{inv.referenceNo}</span>
                          {inv.zatcaQrCode && (
                            <span title="ZATCA QR Ready">
                              <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {inv.issueDate ? inv.issueDate.slice(0, 10) : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {inv.invoiceType === 'SIMPLIFIED_TAX_INVOICE' ||
                        inv.invoiceType === 'SIMPLIFIED_INVOICE' ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                            {isAr ? 'فاتورة ضريبية مبسطة' : 'Simplified Tax Invoice'}
                          </span>
                        ) : inv.invoiceType === 'CREDIT_NOTE' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold">
                            {isAr ? 'إشعار دائن (381)' : 'Credit Note (381)'}
                          </span>
                        ) : inv.invoiceType === 'DEBIT_NOTE' ? (
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 font-semibold">
                            {isAr ? 'إشعار مدين (383)' : 'Debit Note (383)'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                            {isAr ? 'فاتورة ضريبية قياسية' : 'Standard Tax Invoice'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {isAr ? inv.client?.nameAr : inv.client?.nameEn || inv.client?.nameAr}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {formatCurrency(inv.totalAmount, isAr ? 'ar' : 'en', inv.currency || 'SAR')}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-emerald-700 font-semibold">
                          {isAr ? 'مدفوع: ' : 'Paid: '}
                          {formatCurrency(inv.paidAmount, isAr ? 'ar' : 'en', inv.currency || 'SAR')}
                        </div>
                        <div className="text-amber-700 font-semibold">
                          {isAr ? 'متبقي: ' : 'Rem: '}
                          {formatCurrency(inv.remainingAmount, isAr ? 'ar' : 'en', inv.currency || 'SAR')}
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                      <td className="px-4 py-3">{paymentBadge(inv.paymentStatus)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                            title={isAr ? 'عرض تفاصيل الفاتورة' : 'View Invoice'}
                            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                            title={isAr ? 'طباعة الفاتورة الرسمية (PDF)' : 'Print Official Invoice'}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {inv.status === 'DRAFT' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(inv)}
                                title={isAr ? 'تعديل مسودة الفاتورة' : 'Edit Draft Invoice'}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => approveMutation.mutate(inv.id)}
                                title={isAr ? 'اعتماد وإصدار الفاتورة' : 'Approve & Issue'}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingInvoice(inv)}
                                title={isAr ? 'حذف مسودة الفاتورة' : 'Delete Draft'}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {(inv.status === 'APPROVED' || inv.status === 'SENT') && (
                            <>
                              {inv.zatcaStatus === 'REPORTED' || inv.zatcaStatus === 'CLEARED' ? (
                                <span
                                  title={
                                    isAr
                                      ? 'فاتورة ضريبية رسمية محصنة غير قابلة للتعديل أو الحذف وفق اشتراطات هيئة الزكاة والضريبة والجمارك (ZATCA)'
                                      : 'Statutorily immutable tax invoice under ZATCA regulations'
                                  }
                                  className="p-1.5 text-gray-400 cursor-help"
                                >
                                  <Lock className="w-4 h-4" />
                                </span>
                              ) : isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeletingInvoice(inv)
                                    setConfirmTestCleanup(false)
                                  }}
                                  title={
                                    isAr
                                      ? 'حذف سجل اختباري (إشراف)'
                                      : 'Delete Test Record (Admin Cleanup)'
                                  }
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <span
                                  title={
                                    isAr
                                      ? 'فاتورة معتمدة محصنة (يجب إلغاؤها أولاً للحذف)'
                                      : 'Approved invoice (must be cancelled first to delete)'
                                  }
                                  className="p-1.5 text-gray-400 cursor-help"
                                >
                                  <Lock className="w-4 h-4" />
                                </span>
                              )}
                            </>
                          )}

                          {inv.status === 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingInvoice(inv)
                                setConfirmTestCleanup(false)
                              }}
                              title={isAr ? 'حذف الفاتورة الملغاة' : 'Delete Cancelled Invoice'}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {inv.status !== 'CANCELLED' && Number(inv.paidAmount) === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingInvoice(inv)
                                setCancellationReason('')
                              }}
                              title={isAr ? 'إلغاء الفاتورة وعكس الكميات' : 'Cancel Invoice'}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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

      {/* Create Invoice Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-5 shadow-xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">
                {isAr ? 'إصدار فاتورة ضريبية جديدة' : 'Create New Tax Invoice'}
              </h2>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setCreateMode('fromStatement')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-colors ${
                  createMode === 'fromStatement'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {isAr
                  ? '1. فاتورة من مستخلص معتمد (أو عدة مستخلصات)'
                  : '1. From Approved Statement(s)'}
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('direct')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-colors ${
                  createMode === 'direct'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {isAr
                  ? '2. فاتورة مباشرة من الأعمال المعتمدة (جزئية / كاملة)'
                  : '2. Direct from Approved Work Entries'}
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'العميل *' : 'Client *'}
                  </label>
                  <select
                    required
                    value={form.clientId}
                    onChange={(e) => {
                      setForm({ ...form, clientId: e.target.value })
                      setSelectedStatementIds([])
                      setSelectedWorkEntries({})
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  >
                    <option value="">{isAr ? '-- اختر العميل --' : '-- Select Client --'}</option>
                    {clients.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {isAr ? c.nameAr : c.nameEn || c.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'نوع الفاتورة وفق ZATCA *' : 'ZATCA Invoice Type *'}
                  </label>
                  <select
                    value={form.invoiceType}
                    onChange={(e) => setForm({ ...form, invoiceType: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  >
                    <option value="TAX_INVOICE">
                      {isAr ? 'فاتورة ضريبية قياسية (B2B)' : 'Standard Tax Invoice (B2B)'}
                    </option>
                    <option value="SIMPLIFIED_TAX_INVOICE">
                      {isAr ? 'فاتورة ضريبية مبسطة (B2C)' : 'Simplified Tax Invoice (B2C)'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ الإصدار *' : 'Issue Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.issueDate}
                    onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ التوريد (Supply Date)' : 'Supply Date'}
                  </label>
                  <input
                    type="date"
                    value={form.supplyDate}
                    onChange={(e) => setForm({ ...form, supplyDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ الاستحقاق (Due Date)' : 'Due Date'}
                  </label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>

                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isTaxExempt}
                      onChange={(e) => setForm({ ...form, isTaxExempt: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span>{isAr ? 'معفاة من الضريبة (0%)' : 'VAT Exempt (0%)'}</span>
                  </label>
                </div>
              </div>

              {createMode === 'fromStatement' ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-800">
                    {isAr
                      ? 'المستخلصات المعتمدة المتاحة للفوترة'
                      : 'Approved Statements Ready for Invoicing'}
                  </h3>
                  {approvedStatements.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-gray-300 text-center text-xs text-gray-500">
                      {isAr
                        ? 'لا توجد مستخلصات معتمدة غير مفوترة لهذا العميل.'
                        : 'No approved statements found for this client.'}
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-x-auto">
                      <table className="w-full min-w-[500px] text-xs text-start">
                        <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                          <tr>
                            <th className="p-2.5 w-10"></th>
                            <th className="p-2.5 text-start">
                              {isAr ? 'رقم المستخلص' : 'Statement No'}
                            </th>
                            <th className="p-2.5 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                            <th className="p-2.5 text-end">
                              {isAr ? 'الإجمالي شامل الضريبة' : 'Total Amount'}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {approvedStatements.map((st: any) => {
                            const checked = selectedStatementIds.includes(st.id)
                            return (
                              <tr key={st.id} className={checked ? 'bg-blue-50/40' : ''}>
                                <td className="p-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedStatementIds((prev) =>
                                        prev.includes(st.id)
                                          ? prev.filter((x) => x !== st.id)
                                          : [...prev, st.id]
                                      )
                                    }}
                                    className="w-4 h-4 rounded text-blue-600"
                                  />
                                </td>
                                <td className="p-2.5 font-mono font-bold text-blue-600">
                                  {st.referenceNo}
                                </td>
                                <td className="p-2.5 text-gray-600">
                                  {st.issueDate ? st.issueDate.slice(0, 10) : '-'}
                                </td>
                                <td className="p-2.5 text-end font-bold text-gray-900">
                                  {formatCurrency(st.totalAmount, isAr ? 'ar' : 'en', st.currency || 'SAR')}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-800">
                    {isAr
                      ? 'الأعمال المعتمدة غير المفوترة (يدعم الفوترة الجزئية والكاملة)'
                      : 'Approved Work Entries (Partial or Full Billing)'}
                  </h3>
                  {eligibleEntries.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-gray-300 text-center text-xs text-gray-500">
                      {isAr
                        ? 'لا توجد أعمال معتمدة غير مفوترة لهذا العميل.'
                        : 'No unbilled approved work entries for this client.'}
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full min-w-[580px] text-xs text-start">
                        <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                          <tr>
                            <th className="p-2.5 w-10"></th>
                            <th className="p-2.5 text-start">{isAr ? 'المرجع' : 'Ref'}</th>
                            <th className="p-2.5 text-start">{isAr ? 'البند' : 'Item'}</th>
                            <th className="p-2.5 text-start">
                              {isAr ? 'المتبقي الفعلي' : 'Remaining'}
                            </th>
                            <th className="p-2.5 text-start">
                              {isAr ? 'الكمية المراد فوترتها' : 'Qty to Bill'}
                            </th>
                            <th className="p-2.5 text-end">{isAr ? 'السعر' : 'Price'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {eligibleEntries.map((we: any) => {
                            const remaining =
                              Math.round(
                                (Number(we.quantity) - Number(we.billedQuantity)) * 10000
                              ) / 10000
                            const checked = selectedWorkEntries[we.id] !== undefined
                            return (
                              <tr key={we.id} className={checked ? 'bg-blue-50/40' : ''}>
                                <td className="p-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedWorkEntries((prev) => {
                                        const next = { ...prev }
                                        if (next[we.id] !== undefined) delete next[we.id]
                                        else next[we.id] = String(remaining)
                                        return next
                                      })
                                    }}
                                    className="w-4 h-4 rounded text-blue-600"
                                  />
                                </td>
                                <td className="p-2.5 font-mono font-bold text-blue-600">
                                  {we.referenceNo}
                                </td>
                                <td className="p-2.5 font-medium text-gray-900">
                                  {isAr ? we.itemNameAr : we.itemNameEn || we.itemNameAr}
                                </td>
                                <td className="p-2.5 font-bold text-emerald-700">
                                  {remaining} {we.unit}
                                </td>
                                <td className="p-2.5">
                                  {checked && (
                                    <input
                                      type="number"
                                      step="0.001"
                                      min="0.001"
                                      max={remaining}
                                      value={selectedWorkEntries[we.id]}
                                      onChange={(e) =>
                                        setSelectedWorkEntries({
                                          ...selectedWorkEntries,
                                          [we.id]: e.target.value,
                                        })
                                      }
                                      className="w-24 px-2 py-1 rounded border border-gray-300 text-xs"
                                    />
                                  )}
                                </td>
                                <td className="p-2.5 text-end font-semibold">
                                  {formatCurrency(we.unitPrice, isAr ? 'ar' : 'en', we.currency || 'SAR')}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createInvoiceMutation.isPending}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {createInvoiceMutation.isPending
                    ? isAr
                      ? 'جاري الإصدار...'
                      : 'Creating...'
                    : isAr
                    ? 'إصدار الفاتورة'
                    : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Invoice Modal */}
      {cancellingInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              {isAr
                ? `إلغاء الفاتورة (${cancellingInvoice.referenceNo})`
                : `Cancel Invoice (${cancellingInvoice.referenceNo})`}
            </h3>
            <p className="text-xs text-gray-600">
              {isAr
                ? 'سيؤدي إلغاء الفاتورة إلى عكس الكميات المفوترة على جميع الأعمال المرتبطة وتوثيق السبب في سجل التدقيق المحاسبي.'
                : 'Cancelling this invoice will reverse billed quantities on linked work entries and record an audit log.'}
            </p>
            <textarea
              rows={3}
              required
              placeholder={isAr ? 'سبب الإلغاء المحاسبي *' : 'Cancellation reason *'}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancellingInvoice(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
              >
                {isAr ? 'تراجع' : 'Back'}
              </button>
              <button
                type="button"
                disabled={!cancellationReason.trim() || cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate({
                    id: cancellingInvoice.id,
                    reason: cancellationReason.trim(),
                  })
                }
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {isAr ? 'تأكيد الإلغاء' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Draft Invoice Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">
                {isAr
                  ? `تعديل مسودة الفاتورة (${editingInvoice.referenceNo})`
                  : `Edit Draft Invoice (${editingInvoice.referenceNo})`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const discount = parseFloat(editForm.discountAmount) || 0
                const subtotal = Number(editingInvoice.subtotalAmount || 0)
                if (discount > subtotal) {
                  setFeedback({
                    type: 'error',
                    message: isAr
                      ? 'مبلغ الخصم لا يمكن أن يتجاوز المجموع الفرعي'
                      : 'Discount cannot exceed subtotal',
                  })
                  return
                }
                updateInvoiceMutation.mutate({
                  id: editingInvoice.id,
                  body: {
                    dueDate: editForm.dueDate || null,
                    supplyDate: editForm.supplyDate || null,
                    discountAmount: discount,
                    notes: editForm.notes.trim() || null,
                  },
                })
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ التوريد' : 'Supply Date'}
                  </label>
                  <input
                    type="date"
                    value={editForm.supplyDate}
                    onChange={(e) => setEditForm({ ...editForm, supplyDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </label>
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr
                    ? `مبلغ الخصم الإضافي (${getCurrencySymbol(editingInvoice?.currency || 'SAR', true)})`
                    : `Discount Amount (${getCurrencySymbol(editingInvoice?.currency || 'SAR', false)})`}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.discountAmount}
                  onChange={(e) => setEditForm({ ...editForm, discountAmount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono"
                />
              </div>

              {/* Live Financial Summary */}
              {(() => {
                const subtotal = Number(editingInvoice.subtotalAmount || 0)
                const discount = Math.min(subtotal, Math.max(0, parseFloat(editForm.discountAmount) || 0))
                const taxable = Math.max(0, subtotal - discount)
                const vat = editingInvoice.isTaxExempt ? 0 : Math.round(taxable * 0.15 * 100) / 100
                const total = taxable + vat
                const invCurr = editingInvoice.currency || 'SAR'
                return (
                  <div className="bg-blue-50/70 border border-blue-200/60 rounded-xl p-3.5 space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>{isAr ? 'المجموع قبل الخصم:' : 'Subtotal:'}</span>
                      <span className="font-mono">{formatCurrency(subtotal, isAr ? 'ar' : 'en', invCurr)}</span>
                    </div>
                    <div className="flex justify-between text-amber-700 font-semibold">
                      <span>{isAr ? 'الخصم التجاري:' : 'Discount:'}</span>
                      <span className="font-mono">-{formatCurrency(discount, isAr ? 'ar' : 'en', invCurr)}</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>{isAr ? 'الوعاء الخاضع للضريبة:' : 'Taxable Amount:'}</span>
                      <span className="font-mono">{formatCurrency(taxable, isAr ? 'ar' : 'en', invCurr)}</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>{isAr ? 'ضريبة القيمة المضافة (15%):' : 'VAT (15%):'}</span>
                      <span className="font-mono">{formatCurrency(vat, isAr ? 'ar' : 'en', invCurr)}</span>
                    </div>
                    <div className="flex justify-between text-blue-900 font-bold border-t border-blue-200 pt-1 text-sm">
                      <span>{isAr ? 'الإجمالي بعد التعديل:' : 'New Total:'}</span>
                      <span className="font-mono">{formatCurrency(total, isAr ? 'ar' : 'en', invCurr)}</span>
                    </div>
                  </div>
                )
              })()}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'ملاحظات الفاتورة' : 'Invoice Notes'}
                </label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder={isAr ? 'ملاحظات إضافية...' : 'Optional notes...'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateInvoiceMutation.isPending}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateInvoiceMutation.isPending
                    ? isAr
                      ? 'جاري الحفظ...'
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

      {/* Delete Invoice Confirmation Modal (Draft, Cancelled, or Admin Test-Cleanup) */}
      {deletingInvoice && (() => {
        const isTestInvoice =
          deletingInvoice.status === 'APPROVED' ||
          deletingInvoice.status === 'SENT' ||
          Number(deletingInvoice.paidAmount) > 0;

        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-3 text-red-600">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {isTestInvoice
                      ? isAr
                        ? 'حذف سجل اختباري وتنظيف البيانات'
                        : 'Delete Test Invoice (Admin Cleanup)'
                      : deletingInvoice.status === 'CANCELLED'
                      ? isAr
                        ? 'تأكيد حذف الفاتورة الملغاة'
                        : 'Confirm Cancelled Invoice Deletion'
                      : isAr
                      ? 'حذف مسودة الفاتورة'
                      : 'Delete Draft Invoice'}
                  </h3>
                  <span className="text-xs font-mono text-gray-500">{deletingInvoice.referenceNo}</span>
                </div>
              </div>

              {isTestInvoice ? (
                <div className="space-y-3">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 leading-relaxed space-y-1.5">
                    <div className="font-bold text-red-900 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{isAr ? 'تنبيه إشرافي خاص ببيانات الاختبار' : 'Administrative Test Data Cleanup Notice'}</span>
                    </div>
                    <p>
                      {isAr
                        ? `هذه الفاتورة مسجلة بحالة (${deletingInvoice.status}) وبقيمة ${formatCurrency(deletingInvoice.totalAmount, 'ar', deletingInvoice.currency || 'SAR')}. حذفها مخصص لتنظيف السجلات التجريبية، وسيؤدي إلى عكس أية مدفوعات مرتبطة بها وتحديث رصيد العميل بدقة.`
                        : `This invoice is currently in (${deletingInvoice.status}) status with total ${formatCurrency(deletingInvoice.totalAmount, 'en', deletingInvoice.currency || 'SAR')}. Deletion is for test data cleanup and will reverse associated payments and reconcile client balances.`}
                    </p>
                  </div>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer text-xs text-gray-800 font-medium hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={confirmTestCleanup}
                      onChange={(e) => setConfirmTestCleanup(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span>
                      {isAr
                        ? 'أؤكد أن هذا سجل اختباري وأرغب في حذفه نهائياً وعكس أي سجلات دفع مرتبطة به وتحديث رصيد العميل.'
                        : 'I confirm that this is a test record and wish to permanently delete it, reversing linked payments and adjusting client balance.'}
                    </span>
                  </label>
                </div>
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {deletingInvoice.status === 'CANCELLED' ? (
                    isAr ? (
                      <>
                        أنت على وشك حذف الفاتورة الملغاة رقم{' '}
                        <span className="font-mono font-bold text-gray-900">
                          {deletingInvoice.referenceNo}
                        </span>{' '}
                        بقيمة إجمالية{' '}
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(deletingInvoice.totalAmount, 'ar', deletingInvoice.currency || 'SAR')}
                        </span>{' '}
                        نهائياً. لا توجد مدفوعات أو إشعارات مرتبطة بها، وسيتم توثيق عملية الحذف في سجل التدقيق.
                      </>
                    ) : (
                      <>
                        Are you sure you want to permanently delete cancelled invoice{' '}
                        <span className="font-mono font-bold text-gray-900">
                          {deletingInvoice.referenceNo}
                        </span>{' '}
                        (Total:{' '}
                        {formatCurrency(deletingInvoice.totalAmount, 'en', deletingInvoice.currency || 'SAR')})? This action will be documented in the audit trail.
                      </>
                    )
                  ) : isAr ? (
                    <>
                      هل أنت متأكد من رغبتك في حذف مسودة الفاتورة رقم{' '}
                      <span className="font-mono font-bold text-gray-900">
                        {deletingInvoice.referenceNo}
                      </span>
                      ؟ سيتم تحرير جميع بنود الأعمال أو المستخلصات الملحقة بها ليمكن فوترتها لاحقاً.
                    </>
                  ) : (
                    <>
                      Are you sure you want to permanently delete draft invoice{' '}
                      <span className="font-mono font-bold text-gray-900">
                        {deletingInvoice.referenceNo}
                      </span>
                      ? Linked work entries and statements will be released.
                    </>
                  )}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingInvoice(null);
                    setConfirmTestCleanup(false);
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  {isAr ? 'تراجع' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={deleteDraftMutation.isPending || (isTestInvoice && !confirmTestCleanup)}
                  onClick={() =>
                    deleteDraftMutation.mutate({
                      id: deletingInvoice.id,
                      testCleanup: isTestInvoice,
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteDraftMutation.isPending
                    ? isAr
                      ? 'جاري الحذف...'
                      : 'Deleting...'
                    : isAr
                    ? isTestInvoice
                      ? 'تأكيد تنظيف السجل'
                      : 'تأكيد الحذف النهائي'
                    : isTestInvoice
                    ? 'Confirm Test Cleanup'
                    : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  )
}
