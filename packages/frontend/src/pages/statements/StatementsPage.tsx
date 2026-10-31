import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  Receipt,
  X,
  AlertCircle,
  Trash2,
  Edit2,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { formatCurrency, getCurrencySymbol } from '../../lib/utils'
import { useDebounce } from '../../hooks/useDebounce'

export function StatementsPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editingStatement, setEditingStatement] = useState<any | null>(null)
  const [deletingStatement, setDeletingStatement] = useState<any | null>(null)
  const [cancellingStatement, setCancellingStatement] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    issueDate: '',
    periodStart: '',
    periodEnd: '',
    discountAmount: '0',
    notes: '',
  })
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  // Statement Creation Form State
  const [form, setForm] = useState({
    clientId: '',
    siteId: '',
    title: '',
    issueDate: new Date().toISOString().slice(0, 10),
    periodStart: '',
    periodEnd: '',
    discountAmount: '0',
    isTaxExempt: false,
    notes: '',
  })
  // Map of workEntryId -> selected approvedQuantity string
  const [selectedEntries, setSelectedEntries] = useState<Record<string, string>>({})

  // Clients & Sites for dropdowns
  const { data: clientsData } = useQuery({
    queryKey: ['clients-list-stmt'],
    queryFn: async () => {
      const res = await api.get('/clients', { params: { limit: 100 } })
      return res.data?.data?.items || []
    },
  })

  const { data: sitesData } = useQuery({
    queryKey: ['sites-list-stmt', form.clientId],
    queryFn: async () => {
      if (!form.clientId) return []
      const res = await api.get('/sites', { params: { clientId: form.clientId, limit: 100 } })
      return res.data?.data?.items || []
    },
    enabled: !!form.clientId && createModalOpen,
  })

  const { data: orgSettings } = useQuery({
    queryKey: ['orgSettings'],
    queryFn: async () => {
      const res = await api.get('/organizations/settings')
      return res.data?.data || res.data
    },
  })

  // Eligible Work Entries (APPROVED or PARTIALLY_BILLED) for selected client/site
  const { data: eligibleEntriesData, isLoading: loadingEligible } = useQuery({
    queryKey: ['eligible-work-entries-stmt', form.clientId, form.siteId],
    queryFn: async () => {
      if (!form.clientId) return []
      const params: Record<string, any> = {
        clientId: form.clientId,
        status: 'APPROVED,PARTIALLY_BILLED',
        limit: 100,
      }
      if (form.siteId) params.siteId = form.siteId
      const res = await api.get('/work-entries', { params })
      return (res.data?.data?.items || []).filter(
        (we: any) => Number(we.quantity) - Number(we.billedQuantity) > 0
      )
    },
    enabled: !!form.clientId && createModalOpen,
  })

  const clients = Array.isArray(clientsData) ? clientsData : []
  const clientSites = Array.isArray(sitesData) ? sitesData : []
  const eligibleEntries = Array.isArray(eligibleEntriesData) ? eligibleEntriesData : []

  // Statements List Query
  const { data, isLoading, isError } = useQuery({
    queryKey: ['statements', { search: debouncedSearch, clientFilter, statusFilter, page }],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit: 15 }
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      if (clientFilter) params.clientId = clientFilter
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/statements', { params })
      return res.data?.data
    },
  })

  const statements = data?.items || []
  const totalPages = data?.totalPages || 1
  const totalCount = data?.total || 0

  // Mutations
  const createStatementMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/statements', payload)
      return res.data?.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCreateModalOpen(false)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم إنشاء المستخلص بنجاح' : 'Statement created successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر إنشاء المستخلص' : 'Failed to create statement'),
      })
    },
  })

  const updateStatementMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.put(`/statements/${id}`, payload)
      return res.data?.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEditingStatement(null)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم تحديث بيانات المستخلص بنجاح' : 'Statement updated successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر تحديث المستخلص' : 'Failed to update statement'),
      })
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/statements/${id}/approve`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم اعتماد المستخلص بنجاح' : 'Statement approved',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر اعتماد المستخلص' : 'Failed to approve statement'),
      })
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/statements/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم حذف المستخلص بنجاح' : 'Statement deleted successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف المستخلص' : 'Failed to delete statement'),
      })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/statements/${id}/cancel`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم إلغاء المستخلص' : 'Statement cancelled',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر إلغاء المستخلص' : 'Failed to cancel statement'),
      })
    },
  })

  const openCreateModal = () => {
    setFeedback(null)
    setForm({
      clientId: clientFilter || (clients[0]?.id ?? ''),
      siteId: '',
      title: '',
      issueDate: new Date().toISOString().slice(0, 10),
      periodStart: '',
      periodEnd: '',
      discountAmount: '0',
      isTaxExempt: false,
      notes: '',
    })
    setSelectedEntries({})
    setCreateModalOpen(true)
  }

  const toggleWorkEntrySelection = (entry: any) => {
    const remaining = Math.round((Number(entry.quantity) - Number(entry.billedQuantity)) * 10000) / 10000
    setSelectedEntries((prev) => {
      const next = { ...prev }
      if (next[entry.id] !== undefined) {
        delete next[entry.id]
      } else {
        next[entry.id] = String(remaining)
      }
      return next
    })
  }

  // Live financial preview in create modal
  const defaultVatRate = Number(orgSettings?.vatRate ?? 15)
  const effectiveVatRate = form.isTaxExempt ? 0 : defaultVatRate

  const draftSubtotal = eligibleEntries.reduce((sum: number, entry: any) => {
    const qtyStr = selectedEntries[entry.id]
    if (qtyStr === undefined) return sum
    const q = Number(qtyStr)
    const p = Number(entry.unitPrice)
    if (isNaN(q) || q <= 0) return sum
    return sum + q * p
  }, 0)

  const draftDiscount = Math.max(0, Number(form.discountAmount) || 0)
  const draftTaxable = Math.max(0, draftSubtotal - draftDiscount)
  const draftVat = Math.round(((draftTaxable * effectiveVatRate) / 100) * 100) / 100
  const draftGrandTotal = Math.round((draftTaxable + draftVat) * 100) / 100

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const lines = Object.entries(selectedEntries).map(([workEntryId, qty]) => ({
      workEntryId,
      approvedQuantity: Number(qty),
    }))

    if (lines.length === 0) {
      setFeedback({
        type: 'error',
        message: isAr
          ? 'يرجى اختيار بند عمل معتمد واحد على الأقل'
          : 'Please select at least one approved work entry',
      })
      return
    }

    createStatementMutation.mutate({
      clientId: form.clientId,
      siteIds: form.siteId ? [form.siteId] : undefined,
      title: form.title.trim() || null,
      issueDate: form.issueDate,
      periodStart: form.periodStart || null,
      periodEnd: form.periodEnd || null,
      discountAmount: Number(form.discountAmount) || 0,
      isTaxExempt: form.isTaxExempt,
      notes: form.notes.trim() || null,
      lines,
    })
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { ar: string; en: string; cls: string }> = {
      DRAFT: { ar: 'مسودة', en: 'Draft', cls: 'bg-gray-100 text-gray-700' },
      APPROVED: { ar: 'معتمد', en: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
      INVOICED: { ar: 'تمت فوترته', en: 'Invoiced', cls: 'bg-purple-100 text-purple-800' },
      CANCELLED: { ar: 'ملغي', en: 'Cancelled', cls: 'bg-red-100 text-red-700' },
    }
    const item = map[status] || { ar: status, en: status, cls: 'bg-gray-100 text-gray-700' }
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
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isAr ? 'كشوف الحسابات' : 'Statements'}
            </h1>
            <p className="text-sm text-gray-500">
              {isAr
                ? 'تجميع الأعمال المعتمدة غير المفوترة وإصدار كشوف حسابات رسمية للعملاء'
                : 'Compile approved unbilled work entries into formal client statements'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          data-testid="create-statement-btn"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'إنشاء كشف حساب جديد' : 'Create Statement'}</span>
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
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={isAr ? 'بحث برقم المستخلص أو العنوان...' : 'Search by ref or title...'}
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
          <option value="">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
          <option value="DRAFT">{isAr ? 'مسودة' : 'Draft'}</option>
          <option value="APPROVED">{isAr ? 'معتمد' : 'Approved'}</option>
          <option value="INVOICED">{isAr ? 'تمت فوترته' : 'Invoiced'}</option>
          <option value="CANCELLED">{isAr ? 'ملغي' : 'Cancelled'}</option>
        </select>
      </div>

      {/* Statements Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">
            {isAr ? 'جاري تحميل المستخلصات...' : 'Loading statements...'}
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-red-600">
            {isAr ? 'حدث خطأ أثناء تحميل المستخلصات' : 'Error loading statements'}
          </div>
        ) : statements.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-gray-500">
              {isAr ? 'لا توجد مستخلصات مسجلة حالياً' : 'No statements found'}
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إنشاء أول مستخلص' : 'Create First Statement'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] print:min-w-0 text-sm text-start">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'رقم المستخلص' : 'Ref No'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'العميل' : 'Client'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'تاريخ الإصدار' : 'Issue Date'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'قبل الضريبة' : 'Subtotal'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'الضريبة (VAT)' : 'VAT'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'الإجمالي شامل الضريبة' : 'Total Amount'}
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
                  {statements.map((stmt: any) => (
                    <tr key={stmt.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-600">
                        {stmt.referenceNo}
                        {stmt.title && (
                          <div className="font-sans text-xs font-normal text-gray-500">
                            {stmt.title}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {isAr ? stmt.client?.nameAr : stmt.client?.nameEn || stmt.client?.nameAr}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {stmt.issueDate ? stmt.issueDate.slice(0, 10) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatCurrency(stmt.taxableAmount, isAr ? 'ar' : 'en', stmt.currency || 'SAR')}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatCurrency(stmt.vatAmount, isAr ? 'ar' : 'en', stmt.currency || 'SAR')} ({Number(stmt.vatRate)}%)
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {formatCurrency(stmt.totalAmount, isAr ? 'ar' : 'en', stmt.currency || 'SAR')}
                      </td>
                      <td className="px-4 py-3">{statusBadge(stmt.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/statements/${stmt.id}`)}
                            title={isAr ? 'عرض وطباعة المستخلص' : 'View & Print'}
                            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {stmt.status === 'DRAFT' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditForm({
                                    title: stmt.title || '',
                                    issueDate: stmt.issueDate ? stmt.issueDate.slice(0, 10) : '',
                                    periodStart: stmt.periodStart ? stmt.periodStart.slice(0, 10) : '',
                                    periodEnd: stmt.periodEnd ? stmt.periodEnd.slice(0, 10) : '',
                                    discountAmount: String(Number(stmt.discountAmount) || 0),
                                    notes: stmt.notes || '',
                                  })
                                  setEditingStatement(stmt)
                                }}
                                title={isAr ? 'تعديل المسودة' : 'Edit Draft'}
                                className="p-1.5 text-gray-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => approveMutation.mutate(stmt.id)}
                                title={isAr ? 'اعتماد المستخلص' : 'Approve Statement'}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingStatement(stmt)}
                                title={isAr ? 'حذف مسودة المستخلص' : 'Delete Draft'}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {stmt.status === 'APPROVED' && (
                            <button
                              type="button"
                              onClick={() => navigate(`/statements/${stmt.id}`)}
                              title={isAr ? 'إصدار فاتورة من المستخلص' : 'Create Invoice'}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg"
                            >
                              <Receipt className="w-4 h-4" />
                            </button>
                          )}

                          {(stmt.status === 'DRAFT' || stmt.status === 'APPROVED') && (
                            <button
                              type="button"
                              onClick={() => setCancellingStatement(stmt)}
                              title={isAr ? 'إلغاء المستخلص' : 'Cancel Statement'}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {stmt.status === 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => setDeletingStatement(stmt)}
                              title={isAr ? 'حذف المستخلص الملغي' : 'Delete Cancelled Statement'}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {stmt.status === 'INVOICED' && (
                            <span
                              className="p-1.5 text-gray-400 cursor-not-allowed"
                              title={
                                isAr
                                  ? 'مستخلص مفوتر ومرتبط بفواتير رسمية - محمي من التعديل والإلغاء المباشر'
                                  : 'Invoiced statement linked to official invoices - locked from direct editing or cancellation'
                              }
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
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

      {/* Create Statement Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-5 shadow-xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {isAr ? 'إنشاء كشف حساب جديد' : 'Create Statement'}
                </h2>
                <p className="text-xs text-gray-500">
                  {isAr
                    ? 'اختر العميل والموقع وحدد الأعمال المعتمدة والكميات المراد إدراجها في كشف الحساب'
                    : 'Select client, site, and approved work entries to include in statement'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'العميل *' : 'Client *'}
                  </label>
                  <select
                    required
                    value={form.clientId}
                    onChange={(e) => {
                      setForm({ ...form, clientId: e.target.value, siteId: '' })
                      setSelectedEntries({})
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
                    {isAr ? 'الموقع (اختياري للتصفية)' : 'Site (Optional Filter)'}
                  </label>
                  <select
                    value={form.siteId}
                    onChange={(e) => {
                      setForm({ ...form, siteId: e.target.value })
                      setSelectedEntries({})
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  >
                    <option value="">{isAr ? 'جميع مواقع العميل' : 'All Client Sites'}</option>
                    {clientSites.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {isAr ? s.nameAr : s.nameEn || s.nameAr}
                      </option>
                    ))}
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
                    {isAr ? 'عنوان / وصف المستخلص' : 'Statement Title'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'مثال: مستخلص أعمال شهر أكتوبر' : 'e.g. October Works'}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'من تاريخ' : 'Period From'}
                  </label>
                  <input
                    type="date"
                    value={form.periodStart}
                    onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'إلى تاريخ' : 'Period To'}
                  </label>
                  <input
                    type="date"
                    value={form.periodEnd}
                    onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>
              </div>

              {/* Eligible Work Entries Selection */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-800">
                  {isAr
                    ? 'الأعمال المعتمدة المتاحة للفوترة والمستخلصات'
                    : 'Approved Unbilled Work Entries'}
                </h3>

                {loadingEligible ? (
                  <p className="text-xs text-gray-500 p-4">
                    {isAr ? 'جاري جلب الأعمال المعتمدة...' : 'Loading approved entries...'}
                  </p>
                ) : eligibleEntries.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-gray-300 text-center text-xs text-gray-500">
                    {isAr
                      ? 'لا توجد أعمال معتمدة غير مفوترة لهذا العميل حالياً.'
                      : 'No approved unbilled work entries available for this client.'}
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full min-w-[620px] text-xs text-start">
                      <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                        <tr>
                          <th className="p-2.5 w-10"></th>
                          <th className="p-2.5 text-start">{isAr ? 'المرجع' : 'Ref'}</th>
                          <th className="p-2.5 text-start">{isAr ? 'البند' : 'Item'}</th>
                          <th className="p-2.5 text-start">
                            {isAr ? 'المتبقي / الإجمالي' : 'Remaining / Total'}
                          </th>
                          <th className="p-2.5 text-start">{isAr ? 'السعر' : 'Unit Price'}</th>
                          <th className="p-2.5 text-start">
                            {isAr ? 'الكمية بالمستخلص' : 'Statement Qty'}
                          </th>
                          <th className="p-2.5 text-end">{isAr ? 'الإجمالي' : 'Line Total'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {eligibleEntries.map((we: any) => {
                          const remaining =
                            Math.round((Number(we.quantity) - Number(we.billedQuantity)) * 10000) /
                            10000
                          const isChecked = selectedEntries[we.id] !== undefined
                          const chosenQty = Number(selectedEntries[we.id] || 0)
                          const lineTotal = isChecked ? chosenQty * Number(we.unitPrice) : 0

                          return (
                            <tr key={we.id} className={isChecked ? 'bg-blue-50/40' : ''}>
                              <td className="p-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleWorkEntrySelection(we)}
                                  className="w-4 h-4 rounded text-blue-600"
                                />
                              </td>
                              <td className="p-2.5 font-mono font-semibold text-blue-600">
                                {we.referenceNo}
                              </td>
                              <td className="p-2.5 font-medium text-gray-900">
                                {isAr ? we.itemNameAr : we.itemNameEn || we.itemNameAr}
                              </td>
                              <td className="p-2.5 text-gray-600">
                                <span className="font-bold text-emerald-700">{remaining}</span> /{' '}
                                {Number(we.quantity)} {we.unit}
                              </td>
                              <td className="p-2.5 text-gray-700">
                                {formatCurrency(we.unitPrice, isAr ? 'ar' : 'en', we.currency || 'SAR')}
                              </td>
                              <td className="p-2.5">
                                {isChecked && (
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    max={remaining}
                                    value={selectedEntries[we.id]}
                                    onChange={(e) =>
                                      setSelectedEntries({
                                        ...selectedEntries,
                                        [we.id]: e.target.value,
                                      })
                                    }
                                    className="w-24 px-2 py-1 rounded border border-gray-300 text-xs"
                                  />
                                )}
                              </td>
                              <td className="p-2.5 text-end font-bold text-gray-900">
                                {formatCurrency(lineTotal, isAr ? 'ar' : 'en', we.currency || 'SAR')}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-blue-50/60 p-4 rounded-xl border border-blue-100">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {isAr
                        ? `مبلغ الخصم (${getCurrencySymbol('SAR', true)})`
                        : `Discount Amount (${getCurrencySymbol('SAR', false)})`}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.discountAmount}
                      onChange={(e) => setForm({ ...form, discountAmount: e.target.value })}
                      className="w-40 px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isTaxExempt}
                      onChange={(e) => setForm({ ...form, isTaxExempt: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span>
                      {isAr
                        ? 'معاملة معفاة من ضريبة القيمة المضافة (0%)'
                        : 'VAT Exempt Transaction (0%)'}
                    </span>
                  </label>
                </div>

                <div className="space-y-1 text-end text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>{isAr ? 'الإجمالي قبل الضريبة:' : 'Subtotal:'}</span>
                    <span>{formatCurrency(draftSubtotal, isAr ? 'ar' : 'en')}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>{isAr ? 'الخصم:' : 'Discount:'}</span>
                    <span>- {formatCurrency(draftDiscount, isAr ? 'ar' : 'en')}</span>
                  </div>
                  <div className="flex justify-between text-gray-700 font-medium">
                    <span>
                      {isAr
                        ? `ضريبة القيمة المضافة (${effectiveVatRate}%):`
                        : `VAT (${effectiveVatRate}%):`}
                    </span>
                    <span>{formatCurrency(draftVat, isAr ? 'ar' : 'en')}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-blue-800 pt-1 border-t border-blue-200">
                    <span>{isAr ? 'الإجمالي شامل الضريبة:' : 'Total Including VAT:'}</span>
                    <span>{formatCurrency(draftGrandTotal, isAr ? 'ar' : 'en')}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createStatementMutation.isPending}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {createStatementMutation.isPending
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ المستخلص'
                    : 'Save Statement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Statement Modal */}
      {editingStatement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'تعديل مسودة المستخلص' : 'Edit Draft Statement'}
                </h3>
                <span className="text-xs font-mono text-blue-600">{editingStatement.referenceNo}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingStatement(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const discount = Number(editForm.discountAmount) || 0
                updateStatementMutation.mutate({
                  id: editingStatement.id,
                  payload: {
                    title: editForm.title.trim() || null,
                    issueDate: editForm.issueDate || undefined,
                    periodStart: editForm.periodStart || null,
                    periodEnd: editForm.periodEnd || null,
                    discountAmount: discount,
                    notes: editForm.notes.trim() || null,
                  },
                })
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'عنوان المستخلص' : 'Statement Title'}
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                  placeholder={isAr ? 'مستخلص أعمال شهر...' : 'Progress statement for...'}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ الإصدار *' : 'Issue Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={editForm.issueDate}
                    onChange={(e) => setEditForm({ ...editForm, issueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr ? 'بداية الفترة' : 'Period Start'}
                  </label>
                  <input
                    type="date"
                    value={editForm.periodStart}
                    onChange={(e) => setEditForm({ ...editForm, periodStart: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr ? 'نهاية الفترة' : 'Period End'}
                  </label>
                  <input
                    type="date"
                    value={editForm.periodEnd}
                    onChange={(e) => setEditForm({ ...editForm, periodEnd: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr
                    ? `قيمة الخصم (${getCurrencySymbol(editingStatement?.currency || 'SAR', true)})`
                    : `Discount Amount (${getCurrencySymbol(editingStatement?.currency || 'SAR', false)})`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={Number(editingStatement.subtotal)}
                  value={editForm.discountAmount}
                  onChange={(e) => setEditForm({ ...editForm, discountAmount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-xs">
                <div className="flex justify-between text-gray-500">
                  <span>{isAr ? 'المجموع قبل الخصم:' : 'Subtotal:'}</span>
                  <span className="font-mono">
                    {formatCurrency(editingStatement.subtotal, isAr ? 'ar' : 'en', editingStatement.currency || 'SAR')}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                  <span>{isAr ? 'الصافي الخاضع للضريبة:' : 'Taxable Amount:'}</span>
                  <span className="font-mono">
                    {formatCurrency(
                      Math.max(0, Number(editingStatement.subtotal) - (Number(editForm.discountAmount) || 0)),
                      isAr ? 'ar' : 'en',
                      editingStatement.currency || 'SAR'
                    )}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'ملاحظات' : 'Notes'}
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
                  onClick={() => setEditingStatement(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateStatementMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateStatementMutation.isPending
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

      {/* Delete Draft Statement Modal */}
      {deletingStatement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-100">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {deletingStatement.status === 'CANCELLED'
                    ? isAr
                      ? 'تأكيد حذف المستخلص الملغي'
                      : 'Confirm Cancelled Statement Deletion'
                    : isAr
                    ? 'تأكيد حذف مسودة المستخلص'
                    : 'Confirm Statement Deletion'}
                </h3>
                <span className="text-xs font-mono text-gray-500">{deletingStatement.referenceNo}</span>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              {deletingStatement.status === 'CANCELLED'
                ? isAr
                  ? `أنت على وشك حذف المستخلص الملغي (${deletingStatement.referenceNo}) بقيمة إجمالية ${formatCurrency(deletingStatement.totalAmount, 'ar', deletingStatement.currency || 'SAR')} نهائياً. لا توجد فواتير مفعلة مرتبطة به، وسيتم توثيق عملية الحذف في سجل التدقيق.`
                  : `Are you sure you want to permanently delete cancelled statement ${deletingStatement.referenceNo}? There are no active invoices linked, and this action will be documented in the audit trail.`
                : isAr
                ? `أنت على وشك حذف مسودة المستخلص (${deletingStatement.referenceNo}) بقيمة إجمالية ${formatCurrency(deletingStatement.totalAmount, 'ar', deletingStatement.currency || 'SAR')}. سيتم فك ارتباط بنود الأعمال وإعادتها لقائمة الأعمال غير المفوترة.`
                : `Are you sure you want to permanently delete draft statement ${deletingStatement.referenceNo}? Linked work entries will be released back to the unbilled pool.`}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeletingStatement(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={deleteDraftMutation.isPending}
                onClick={() => {
                  deleteDraftMutation.mutate(deletingStatement.id, {
                    onSettled: () => setDeletingStatement(null),
                  })
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {deleteDraftMutation.isPending
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

      {/* Cancel Statement Modal */}
      {cancellingStatement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-100">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'تأكيد إلغاء المستخلص' : 'Confirm Statement Cancellation'}
                </h3>
                <span className="text-xs font-mono text-gray-500">{cancellingStatement.referenceNo}</span>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              {isAr
                ? `سيتم تحويل حالة المستخلص (${cancellingStatement.referenceNo}) إلى "ملغي" مع الاحتفاظ بالأثر التاريخي للتدقيق وتوثيق العملية في سجل العمليات.`
                : `Statement ${cancellingStatement.referenceNo} will be marked as CANCELLED while preserving the complete audit history.`}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCancellingStatement(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                {isAr ? 'تراجع' : 'Back'}
              </button>
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => {
                  cancelMutation.mutate(cancellingStatement.id, {
                    onSettled: () => setCancellingStatement(null),
                  })
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {cancelMutation.isPending
                  ? isAr
                    ? 'جارٍ الإلغاء...'
                    : 'Cancelling...'
                  : isAr
                  ? 'تأكيد الإلغاء'
                  : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
