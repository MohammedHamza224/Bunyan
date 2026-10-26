import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Plus,
  Search,
  Eye,
  Edit2,
  CheckCircle2,
  XCircle,
  Send,
  X,
  AlertCircle,
  Trash2,
  PackagePlus,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { formatCurrency, getCurrencySymbol } from '../../lib/utils'

interface LineItemDraft {
  workItemTemplateId: string
  itemNameAr: string
  itemNameEn: string
  unit: string
  quantity: string
  unitPrice: string
  descriptionAr: string
  internalNotes: string
}

const emptyLineItem = (): LineItemDraft => ({
  workItemTemplateId: '',
  itemNameAr: '',
  itemNameEn: '',
  unit: 'م²',
  quantity: '1',
  unitPrice: '0',
  descriptionAr: '',
  internalNotes: '',
})

export function WorkEntriesPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  // Filters
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [itemFilter, setItemFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const limit = 15

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<any | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<any | null>(null)
  const [rejectingEntry, setRejectingEntry] = useState<any | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [inlineItemModalRowIndex, setInlineItemModalRowIndex] = useState<number | null>(null)
  const [inlineItemForm, setInlineItemForm] = useState({
    nameAr: '',
    nameEn: '',
    unit: 'م²',
    defaultPrice: '',
  })
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Batch Create Form State
  const [batchHeader, setBatchHeader] = useState({
    clientId: '',
    siteId: '',
    workDate: new Date().toISOString().slice(0, 10),
    submitImmediately: false,
  })
  const [batchLines, setBatchLines] = useState<LineItemDraft[]>([emptyLineItem()])

  // Single Edit Form State (for DRAFT or REJECTED entry)
  const [editForm, setEditForm] = useState({
    workItemTemplateId: '',
    itemNameAr: '',
    itemNameEn: '',
    unit: '',
    quantity: '1',
    unitPrice: '0',
    workDate: '',
    descriptionAr: '',
    internalNotes: '',
    resubmit: false,
  })

  // Reference Queries
  const { data: clientsData } = useQuery({
    queryKey: ['clients-active-list'],
    queryFn: async () => {
      const res = await api.get('/clients', { params: { status: 'ACTIVE', limit: 100 } })
      return res.data?.data?.items || res.data?.data || []
    },
  })

  const { data: sitesData } = useQuery({
    queryKey: ['sites-active-list'],
    queryFn: async () => {
      const res = await api.get('/sites', { params: { limit: 100 } })
      return res.data?.data?.items || res.data?.data || []
    },
  })

  const { data: workItemsData } = useQuery({
    queryKey: ['work-items-active-list'],
    queryFn: async () => {
      const res = await api.get('/work-items', { params: { status: 'ACTIVE', limit: 100 } })
      return res.data?.data?.items || res.data?.data || []
    },
  })

  const { data: unitsData } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const res = await api.get('/units')
      return res.data?.data || []
    },
  })

  const clients = Array.isArray(clientsData) ? clientsData : []
  const allSites = Array.isArray(sitesData) ? sitesData : []
  const workItems = Array.isArray(workItemsData) ? workItemsData : []
  const units: any[] = Array.isArray(unitsData) ? unitsData : []

  const filteredSitesForFilter = clientFilter
    ? allSites.filter((s: any) => s.clientId === clientFilter)
    : allSites

  const filteredSitesForForm = batchHeader.clientId
    ? allSites.filter((s: any) => s.clientId === batchHeader.clientId && s.status === 'ACTIVE')
    : []

  // Work Entries Query
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'workEntries',
      { search, clientFilter, siteFilter, itemFilter, statusFilter, dateFrom, dateTo, page, limit },
    ],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit }
      if (search.trim()) params.search = search.trim()
      if (clientFilter) params.clientId = clientFilter
      if (siteFilter) params.siteId = siteFilter
      if (itemFilter) params.workItemTemplateId = itemFilter
      if (statusFilter !== 'ALL') params.status = statusFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const res = await api.get('/work-entries', { params })
      return res.data?.data
    },
  })

  const entries = data?.items || []
  const pagination = {
    page: data?.page || 1,
    totalPages: data?.totalPages || 1,
    total: data?.total || 0,
  }

  // Mutations
  const createBatchMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/work-entries', payload)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCreateModalOpen(false)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم تسجيل الأعمال بنجاح' : 'Work entries created successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حفظ الأعمال المنفذة' : 'Failed to save work entries'),
      })
    },
  })

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, payload, resubmit }: { id: string; payload: any; resubmit: boolean }) => {
      await api.put(`/work-entries/${id}`, payload)
      if (resubmit) {
        await api.post(`/work-entries/${id}/submit`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEditingEntry(null)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم تحديث العمل بنجاح' : 'Work entry updated successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر تحديث العمل' : 'Failed to update work entry'),
      })
    },
  })

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/work-entries/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم حذف مسودة العمل المنفذ بنجاح' : 'Draft work entry deleted successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف مسودة العمل' : 'Failed to delete work entry draft'),
      })
    },
  })

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/work-entries/${id}/submit`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم إرسال العمل للاعتماد' : 'Submitted for approval',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || (isAr ? 'تعذر الإرسال' : 'Failed to submit'),
      })
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/work-entries/${id}/approve`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم اعتماد العمل بنجاح' : 'Work entry approved',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || (isAr ? 'تعذر الاعتماد' : 'Failed to approve'),
      })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ id, rejectionReason }: { id: string; rejectionReason: string }) => {
      await api.post(`/work-entries/${id}/reject`, { rejectionReason })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setRejectingEntry(null)
      setRejectionReason('')
      setFeedback({
        type: 'success',
        message: isAr ? 'تم رفض العمل مع توثيق السبب' : 'Work entry rejected',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || (isAr ? 'تعذر رفض العمل' : 'Failed to reject'),
      })
    },
  })

  const createInlineItemMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/work-items', payload)
      return res.data?.data
    },
    onSuccess: (newItem) => {
      queryClient.invalidateQueries({ queryKey: ['work-items-active-list'] })
      queryClient.invalidateQueries({ queryKey: ['workItems'] })
      if (inlineItemModalRowIndex !== null && newItem) {
        const updated = [...batchLines]
        updated[inlineItemModalRowIndex] = {
          ...updated[inlineItemModalRowIndex],
          workItemTemplateId: newItem.id,
          itemNameAr: newItem.nameAr,
          itemNameEn: newItem.nameEn || '',
          unit: newItem.unit,
          unitPrice:
            newItem.defaultPrice !== null && newItem.defaultPrice !== undefined
              ? String(newItem.defaultPrice)
              : updated[inlineItemModalRowIndex].unitPrice,
        }
        setBatchLines(updated)
      }
      setInlineItemModalRowIndex(null)
      setInlineItemForm({ nameAr: '', nameEn: '', unit: 'متر مربع', defaultPrice: '' })
    },
  })

  // Handlers
  const openCreateModal = () => {
    setFeedback(null)
    setBatchHeader({
      clientId: clientFilter || (clients[0]?.id ?? ''),
      siteId: '',
      workDate: new Date().toISOString().slice(0, 10),
      submitImmediately: false,
    })
    setBatchLines([emptyLineItem()])
    setCreateModalOpen(true)
  }

  const handleTemplateSelect = (rowIndex: number, templateId: string) => {
    const updated = [...batchLines]
    if (!templateId) {
      updated[rowIndex].workItemTemplateId = ''
      setBatchLines(updated)
      return
    }
    const tpl = workItems.find((w: any) => w.id === templateId)
    if (tpl) {
      updated[rowIndex] = {
        ...updated[rowIndex],
        workItemTemplateId: tpl.id,
        itemNameAr: tpl.nameAr,
        itemNameEn: tpl.nameEn || '',
        unit: tpl.unit,
        unitPrice:
          tpl.defaultPrice !== null && tpl.defaultPrice !== undefined
            ? String(Number(tpl.defaultPrice))
            : '0',
      }
      setBatchLines(updated)
    }
  }

  const updateBatchLine = (rowIndex: number, field: keyof LineItemDraft, value: string) => {
    const updated = [...batchLines]
    updated[rowIndex] = { ...updated[rowIndex], [field]: value }
    setBatchLines(updated)
  }

  const addBatchLine = () => {
    setBatchLines([...batchLines, emptyLineItem()])
  }

  const removeBatchLine = (rowIndex: number) => {
    if (batchLines.length <= 1) return
    setBatchLines(batchLines.filter((_, idx) => idx !== rowIndex))
  }

  const calculateLineTotal = (qty: string, price: string) => {
    const q = Number(qty)
    const p = Number(price)
    if (isNaN(q) || isNaN(p) || q < 0 || p < 0) return 0
    return Math.round(q * p * 100) / 100
  }

  const batchGrandTotal = batchLines.reduce(
    (sum, line) => sum + calculateLineTotal(line.quantity, line.unitPrice),
    0
  )

  const handleBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!batchHeader.clientId || !batchHeader.siteId) {
      setFeedback({
        type: 'error',
        message: isAr ? 'يرجى اختيار العميل والموقع' : 'Please select client and site',
      })
      return
    }

    for (let i = 0; i < batchLines.length; i++) {
      const line = batchLines[i]
      const q = Number(line.quantity)
      const p = Number(line.unitPrice)
      if (!line.itemNameAr.trim()) {
        setFeedback({
          type: 'error',
          message: isAr
            ? `يرجى إدخال اسم البند في السطر ${i + 1}`
            : `Please enter item name on row ${i + 1}`,
        })
        return
      }
      if (isNaN(q) || q <= 0) {
        setFeedback({
          type: 'error',
          message: isAr
            ? `الكمية في السطر ${i + 1} يجب أن تكون أكبر من صفر`
            : `Quantity on row ${i + 1} must be greater than zero`,
        })
        return
      }
      if (isNaN(p) || p < 0) {
        setFeedback({
          type: 'error',
          message: isAr
            ? `السعر في السطر ${i + 1} لا يمكن أن يكون سالباً`
            : `Unit price on row ${i + 1} cannot be negative`,
        })
        return
      }
    }

    createBatchMutation.mutate({
      clientId: batchHeader.clientId,
      siteId: batchHeader.siteId,
      workDate: batchHeader.workDate,
      submitImmediately: batchHeader.submitImmediately,
      items: batchLines.map((line) => ({
        workItemTemplateId: line.workItemTemplateId || null,
        itemNameAr: line.itemNameAr.trim(),
        itemNameEn: line.itemNameEn.trim() || null,
        unit: line.unit.trim(),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        descriptionAr: line.descriptionAr.trim() || null,
        internalNotes: line.internalNotes.trim() || null,
      })),
    })
  }

  const openEditModal = (entry: any) => {
    setFeedback(null)
    setEditingEntry(entry)
    setEditForm({
      workItemTemplateId: entry.workItemTemplateId || '',
      itemNameAr: entry.itemNameAr || '',
      itemNameEn: entry.itemNameEn || '',
      unit: entry.unit || '',
      quantity: String(Number(entry.quantity)),
      unitPrice: String(Number(entry.unitPrice)),
      workDate: entry.workDate ? entry.workDate.slice(0, 10) : '',
      descriptionAr: entry.descriptionAr || '',
      internalNotes: entry.internalNotes || '',
      resubmit: entry.status === 'REJECTED',
    })
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEntry) return
    const q = Number(editForm.quantity)
    const p = Number(editForm.unitPrice)
    if (isNaN(q) || q <= 0 || isNaN(p) || p < 0) {
      setFeedback({
        type: 'error',
        message: isAr ? 'يرجى التحقق من صحة الكمية والسعر' : 'Invalid quantity or price',
      })
      return
    }
    updateEntryMutation.mutate({
      id: editingEntry.id,
      resubmit: editForm.resubmit,
      payload: {
        workItemTemplateId: editForm.workItemTemplateId || null,
        itemNameAr: editForm.itemNameAr.trim(),
        itemNameEn: editForm.itemNameEn.trim() || null,
        unit: editForm.unit.trim(),
        quantity: q,
        unitPrice: p,
        workDate: editForm.workDate,
        descriptionAr: editForm.descriptionAr.trim() || null,
        internalNotes: editForm.internalNotes.trim() || null,
      },
    })
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { labelAr: string; labelEn: string; cls: string }> = {
      DRAFT: { labelAr: 'مسودة', labelEn: 'Draft', cls: 'bg-gray-100 text-gray-700' },
      PENDING_APPROVAL: {
        labelAr: 'بانتظار الاعتماد',
        labelEn: 'Pending Approval',
        cls: 'bg-amber-100 text-amber-800',
      },
      APPROVED: { labelAr: 'معتمد', labelEn: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
      REJECTED: { labelAr: 'مرفوض', labelEn: 'Rejected', cls: 'bg-red-100 text-red-700' },
      PARTIALLY_BILLED: {
        labelAr: 'مفوتر جزئياً',
        labelEn: 'Partially Billed',
        cls: 'bg-blue-100 text-blue-700',
      },
      FULLY_BILLED: {
        labelAr: 'مفوتر بالكامل',
        labelEn: 'Fully Billed',
        cls: 'bg-purple-100 text-purple-700',
      },
    }
    const st = map[status] || { labelAr: status, labelEn: status, cls: 'bg-gray-100 text-gray-700' }
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.cls}`}>
        {isAr ? st.labelAr : st.labelEn}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isAr ? 'الأعمال المنفذة والاعتمادات' : 'Work Entries & Approvals'}
            </h1>
            <p className="text-sm text-gray-500">
              {isAr
                ? 'تسجيل الأعمال المنفذة بالمواقع ومراجعة اعتمادها قبل إصدار المستخلصات والفواتير'
                : 'Record site work entries and manage approval workflows before billing'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          data-testid="add-work-entry-btn"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'تسجيل أعمال منفذة' : 'Record Work Entries'}</span>
        </button>
      </div>

      {/* Feedback Banner */}
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
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder={isAr ? 'بحث برقم المرجع أو اسم البند...' : 'Search by ref or item...'}
              className="w-full ps-9 pe-4 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <select
            value={clientFilter}
            onChange={(e) => {
              setClientFilter(e.target.value)
              setSiteFilter('')
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
            value={siteFilter}
            onChange={(e) => {
              setSiteFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
          >
            <option value="">{isAr ? 'جميع المواقع' : 'All Sites'}</option>
            {filteredSitesForFilter.map((s: any) => (
              <option key={s.id} value={s.id}>
                {isAr ? s.nameAr : s.nameEn || s.nameAr}
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
            <option value="ALL">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="DRAFT">{isAr ? 'مسودة' : 'Draft'}</option>
            <option value="PENDING_APPROVAL">{isAr ? 'بانتظار الاعتماد' : 'Pending Approval'}</option>
            <option value="APPROVED">{isAr ? 'معتمد' : 'Approved'}</option>
            <option value="REJECTED">{isAr ? 'مرفوض' : 'Rejected'}</option>
            <option value="PARTIALLY_BILLED">{isAr ? 'مفوتر جزئياً' : 'Partially Billed'}</option>
            <option value="FULLY_BILLED">{isAr ? 'مفوتر بالكامل' : 'Fully Billed'}</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <select
            value={itemFilter}
            onChange={(e) => {
              setItemFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
          >
            <option value="">{isAr ? 'جميع بنود الأعمال' : 'All Work Items'}</option>
            {workItems.map((w: any) => (
              <option key={w.id} value={w.id}>
                {isAr ? w.nameAr : w.nameEn || w.nameAr}
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
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
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
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">
            {isAr ? 'جاري تحميل الأعمال المنفذة...' : 'Loading work entries...'}
          </div>
        ) : isError ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-red-600 font-medium">
              {isAr ? 'حدث خطأ أثناء تحميل البيانات' : 'Failed to load work entries'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
            >
              {isAr ? 'إعادة المحاولة' : 'Retry'}
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-gray-500">
              {isAr ? 'لا توجد أعمال مسجلة مطابقة للبحث' : 'No work entries found'}
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'تسجيل عمل جديد' : 'Add Work Entry'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] print:min-w-0 text-sm text-start">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'المرجع' : 'Ref'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'التاريخ' : 'Date'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'العميل / الموقع' : 'Client / Site'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'البند' : 'Work Item'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'الكمية × السعر' : 'Qty × Price'}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {isAr ? 'الإجمالي' : 'Total'}
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
                  {entries.map((entry: any) => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">
                        {entry.referenceNo}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {entry.workDate ? entry.workDate.slice(0, 10) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {isAr
                            ? entry.client?.nameAr
                            : entry.client?.nameEn || entry.client?.nameAr}
                        </div>
                        <div className="text-xs text-gray-500">
                          {isAr ? entry.site?.nameAr : entry.site?.nameEn || entry.site?.nameAr}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {isAr ? entry.itemNameAr : entry.itemNameEn || entry.itemNameAr}
                        </div>
                        {entry.descriptionAr && (
                          <div className="text-xs text-gray-500 truncate max-w-xs">
                            {entry.descriptionAr}
                          </div>
                        )}
                        {entry.status === 'REJECTED' && entry.rejectionReason && (
                          <div className="text-xs text-red-600 mt-0.5 font-medium">
                            {isAr ? 'سبب الرفض: ' : 'Reason: '}
                            {entry.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {Number(entry.quantity).toLocaleString()} {entry.unit} ×{' '}
                        {Number(entry.unitPrice).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {formatCurrency(entry.totalAmount, isAr ? 'ar' : 'en', entry.currency || 'SAR')}
                      </td>
                      <td className="px-4 py-3">{statusBadge(entry.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* 1. View Details */}
                          <button
                            type="button"
                            onClick={() => navigate(`/work-entries/${entry.id}`)}
                            title={isAr ? 'عرض التفاصيل' : 'View details'}
                            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* 2. Edit Action */}
                          {entry.status === 'DRAFT' ||
                          entry.status === 'REJECTED' ||
                          entry.status === 'PENDING_APPROVAL' ? (
                            <button
                              type="button"
                              onClick={() => openEditModal(entry)}
                              title={isAr ? 'تعديل بند العمل' : 'Edit Work Entry'}
                              className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span
                              className="p-1.5 text-gray-300 cursor-not-allowed"
                              title={
                                isAr
                                  ? 'سجل معتمد ومحمي من التعديل المباشر'
                                  : 'Approved entry locked from direct modification'
                              }
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          )}

                          {/* 3. Workflow Actions */}
                          {(entry.status === 'DRAFT' || entry.status === 'REJECTED') && (
                            <button
                              type="button"
                              onClick={() => submitMutation.mutate(entry.id)}
                              title={isAr ? 'إرسال للاعتماد' : 'Submit for approval'}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}

                          {entry.status === 'PENDING_APPROVAL' && (
                            <>
                              <button
                                type="button"
                                onClick={() => approveMutation.mutate(entry.id)}
                                title={isAr ? 'اعتماد العمل' : 'Approve'}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingEntry(entry)
                                  setRejectionReason('')
                                }}
                                title={isAr ? 'رفض العمل' : 'Reject'}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {/* 4. Delete Action */}
                          <button
                            type="button"
                            onClick={() => setDeletingEntry(entry)}
                            title={isAr ? 'حذف بند العمل' : 'Delete Work Entry'}
                            className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
                <span>
                  {isAr
                    ? `إجمالي السجلات: ${pagination.total}`
                    : `Total entries: ${pagination.total}`}
                </span>
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
                    {page} / {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= pagination.totalPages}
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

      {/* Create Single/Multi-Line Work Entry Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-5 shadow-xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {isAr ? 'تسجيل أعمال منفذة (بند واحد أو عدة بنود)' : 'Record Work Entries'}
                </h2>
                <p className="text-xs text-gray-500">
                  {isAr
                    ? 'اختر العميل والموقع ثم أضف بنداً أو أكثر في عملية واحدة'
                    : 'Select client and site, then add one or more work items'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBatchSubmit} className="space-y-5">
              {/* Header Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'العميل *' : 'Client *'}
                  </label>
                  <select
                    required
                    value={batchHeader.clientId}
                    onChange={(e) =>
                      setBatchHeader({ ...batchHeader, clientId: e.target.value, siteId: '' })
                    }
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
                    {isAr ? 'موقع العمل *' : 'Site *'}
                  </label>
                  <select
                    required
                    disabled={!batchHeader.clientId}
                    value={batchHeader.siteId}
                    onChange={(e) => setBatchHeader({ ...batchHeader, siteId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white disabled:bg-gray-100"
                  >
                    <option value="">{isAr ? '-- اختر الموقع --' : '-- Select Site --'}</option>
                    {filteredSitesForForm.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {isAr ? s.nameAr : s.nameEn || s.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ التنفيذ *' : 'Work Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={batchHeader.workDate}
                    onChange={(e) => setBatchHeader({ ...batchHeader, workDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  />
                </div>
              </div>

              {/* Lines */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">
                    {isAr ? 'بنود الأعمال المنفذة' : 'Executed Work Items'}
                  </h3>
                  <button
                    type="button"
                    onClick={addBatchLine}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إضافة سطر بند آخر' : 'Add Another Item Row'}</span>
                  </button>
                </div>

                {batchLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-gray-200 bg-white space-y-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                        {isAr ? `البند #${idx + 1}` : `Item #${idx + 1}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setInlineItemModalRowIndex(idx)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          <span>
                            {isAr ? '+ إنشاء بند جديد بالمكتبة' : '+ New Library Item'}
                          </span>
                        </button>
                        {batchLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeBatchLine(idx)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">
                          {isAr ? 'اختيار من مكتبة البنود (اختياري)' : 'Pick from Library'}
                        </label>
                        <select
                          value={line.workItemTemplateId}
                          onChange={(e) => handleTemplateSelect(idx, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                        >
                          <option value="">
                            {isAr ? '-- إدخال مخصص أو اختر بنداً --' : '-- Custom or Select --'}
                          </option>
                          {workItems.map((w: any) => (
                            <option key={w.id} value={w.id}>
                              {isAr ? w.nameAr : w.nameEn || w.nameAr} ({w.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">
                          {isAr ? 'اسم البند (عربي) *' : 'Item Name (Arabic) *'}
                        </label>
                        <input
                          type="text"
                          required
                          value={line.itemNameAr}
                          onChange={(e) => updateBatchLine(idx, 'itemNameAr', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          {isAr ? 'الوحدة *' : 'Unit *'}
                        </label>
                        <input
                          type="text"
                          required
                          list="work-entry-units-list"
                          value={line.unit}
                          onChange={(e) => updateBatchLine(idx, 'unit', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold"
                        />
                        <datalist id="work-entry-units-list">
                          {units.map((u: any) => (
                            <option key={u.id} value={u.symbolAr}>
                              {isAr ? u.nameAr : u.nameEn || u.nameAr}
                            </option>
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          {isAr ? 'الكمية *' : 'Quantity *'}
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          required
                          value={line.quantity}
                          onChange={(e) => updateBatchLine(idx, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          {isAr
                            ? `سعر الوحدة (${getCurrencySymbol('SAR', true)}) *`
                            : `Unit Price (${getCurrencySymbol('SAR', false)}) *`}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={line.unitPrice}
                          onChange={(e) => updateBatchLine(idx, 'unitPrice', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          {isAr ? 'إجمالي السطر' : 'Line Total'}
                        </label>
                        <div className="px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 text-sm font-bold text-gray-900">
                          {formatCurrency(calculateLineTotal(line.quantity, line.unitPrice), isAr ? 'ar' : 'en')}
                        </div>
                      </div>

                      <div className="sm:col-span-4">
                        <input
                          type="text"
                          placeholder={
                            isAr
                              ? 'وصف تفصيلي أو ملاحظات على العمل المنفذ (اختياري)...'
                              : 'Work description or notes (optional)...'
                          }
                          value={line.descriptionAr}
                          onChange={(e) => updateBatchLine(idx, 'descriptionAr', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer Summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchHeader.submitImmediately}
                    onChange={(e) =>
                      setBatchHeader({ ...batchHeader, submitImmediately: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>
                    {isAr
                      ? 'إرسال مباشرة للاعتماد بعد الحفظ'
                      : 'Submit immediately for approval'}
                  </span>
                </label>

                <div className="text-end">
                  <span className="text-xs text-gray-600 block">
                    {isAr ? 'الإجمالي الكلي للأعمال المضافة' : 'Grand Total'}
                  </span>
                  <span className="text-lg font-bold text-blue-700">
                    {formatCurrency(batchGrandTotal, isAr ? 'ar' : 'en')}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createBatchMutation.isPending}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {createBatchMutation.isPending
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ الأعمال المنفذة'
                    : 'Save Work Entries'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline Quick-Create Work Item Modal */}
      {inlineItemModalRowIndex !== null && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                {isAr ? 'إنشاء بند جديد في مكتبة الأعمال' : 'Quick Create Library Work Item'}
              </h3>
              <button
                type="button"
                onClick={() => setInlineItemModalRowIndex(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!inlineItemForm.nameAr.trim() || !inlineItemForm.unit.trim()) return
                createInlineItemMutation.mutate({
                  nameAr: inlineItemForm.nameAr.trim(),
                  nameEn: inlineItemForm.nameEn.trim() || null,
                  unit: inlineItemForm.unit.trim(),
                  defaultPrice:
                    inlineItemForm.defaultPrice.trim() !== ''
                      ? Number(inlineItemForm.defaultPrice)
                      : null,
                })
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {isAr ? 'اسم البند (عربي) *' : 'Item Name (Arabic) *'}
                </label>
                <input
                  type="text"
                  required
                  value={inlineItemForm.nameAr}
                  onChange={(e) => setInlineItemForm({ ...inlineItemForm, nameAr: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {isAr ? 'وحدة القياس *' : 'Unit *'}
                </label>
                {units.length > 0 ? (
                  <select
                    required
                    value={inlineItemForm.unit}
                    onChange={(e) => setInlineItemForm({ ...inlineItemForm, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                  >
                    {units.map((u: any) => (
                      <option key={u.id} value={u.symbolAr}>
                        {isAr ? `${u.nameAr} (${u.symbolAr})` : `${u.nameEn || u.nameAr} (${u.symbolEn || u.symbolAr})`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={inlineItemForm.unit}
                    onChange={(e) => setInlineItemForm({ ...inlineItemForm, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {isAr ? 'السعر الافتراضي (اختياري)' : 'Default Price (Optional)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={inlineItemForm.defaultPrice}
                  onChange={(e) =>
                    setInlineItemForm({ ...inlineItemForm, defaultPrice: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInlineItemModalRowIndex(null)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createInlineItemMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  {isAr ? 'إضافة واختيار البند' : 'Create & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Work Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">
                {isAr
                  ? `تعديل العمل المنفذ (${editingEntry.referenceNo})`
                  : `Edit Work Entry (${editingEntry.referenceNo})`}
              </h2>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isAr ? 'اسم البند (عربي) *' : 'Item Name (Arabic) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.itemNameAr}
                    onChange={(e) => setEditForm({ ...editForm, itemNameAr: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isAr ? 'اسم البند (إنجليزي)' : 'Item Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={editForm.itemNameEn}
                    onChange={(e) => setEditForm({ ...editForm, itemNameEn: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isAr ? 'الوحدة *' : 'Unit *'}
                  </label>
                  <input
                    type="text"
                    required
                    list="units-list-edit"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-blue-500"
                  />
                  <datalist id="units-list-edit">
                    {units.map((u: any) => (
                      <option key={u.id || u.code} value={u.nameAr || u.code}>
                        {u.nameAr} ({u.code})
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isAr ? 'الكمية *' : 'Quantity *'}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isAr ? 'السعر *' : 'Unit Price *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editForm.unitPrice}
                    onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Dynamic Live Total Estimation Box */}
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between text-xs">
                <span className="text-gray-600 font-medium">
                  {isAr ? 'الإجمالي بعد التعديل:' : 'Estimated Total:'}
                </span>
                <span className="font-mono font-bold text-gray-900 text-sm">
                  {formatCurrency((Number(editForm.quantity) || 0) * (Number(editForm.unitPrice) || 0), isAr ? 'ar' : 'en')}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isAr ? 'تاريخ التنفيذ *' : 'Work Date *'}
                </label>
                <input
                  type="date"
                  required
                  value={editForm.workDate}
                  onChange={(e) => setEditForm({ ...editForm, workDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isAr ? 'الوصف / تفاصيل الأعمال' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  value={editForm.descriptionAr}
                  onChange={(e) => setEditForm({ ...editForm, descriptionAr: e.target.value })}
                  placeholder={isAr ? 'وصف تفصيلي للأعمال المنفذة...' : 'Detailed description...'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {editingEntry.status === 'REJECTED' && (
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={editForm.resubmit}
                    onChange={(e) => setEditForm({ ...editForm, resubmit: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>
                    {isAr
                      ? 'إعادة إرسال العمل للاعتماد فور الحفظ'
                      : 'Resubmit for approval immediately'}
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateEntryMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateEntryMutation.isPending
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

      {/* Delete Work Entry Confirmation Modal */}
      {deletingEntry && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-100">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'تأكيد حذف بند العمل المنفذ' : 'Confirm Work Entry Deletion'}
                </h3>
                <span className="text-xs font-mono text-gray-500">{deletingEntry.referenceNo}</span>
              </div>
            </div>

            {/* Summary Card */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">{isAr ? 'البند:' : 'Item:'}</span>
                <span className="font-bold text-gray-900">{deletingEntry.itemNameAr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isAr ? 'العميل / الموقع:' : 'Client / Site:'}</span>
                <span className="text-gray-800">
                  {deletingEntry.client?.nameAr || '-'} / {deletingEntry.site?.nameAr || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{isAr ? 'الكمية × السعر:' : 'Qty × Price:'}</span>
                <span className="font-mono text-gray-900">
                  {Number(deletingEntry.quantity).toLocaleString()} {deletingEntry.unit} ×{' '}
                  {formatCurrency(deletingEntry.unitPrice, isAr ? 'ar' : 'en', deletingEntry.currency || 'SAR')}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold">
                <span className="text-gray-700">{isAr ? 'الإجمالي:' : 'Total:'}</span>
                <span className="text-gray-900 font-mono">
                  {formatCurrency(deletingEntry.totalAmount, isAr ? 'ar' : 'en', deletingEntry.currency || 'SAR')}
                </span>
              </div>
            </div>

            {Number(deletingEntry.billedQuantity) > 0 ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                <span>
                  {isAr
                    ? `تنبيه: هذا البند يحتوي على كميات مفوترة مسجلة (${Number(deletingEntry.billedQuantity).toLocaleString()} ${deletingEntry.unit}). سيتم فحص الارتباطات المالية وسيتم رفض الحذف في حال وجود فواتير أو مستخلصات نشطة.`
                    : `Notice: This work entry has billed quantities (${Number(deletingEntry.billedQuantity).toLocaleString()} ${deletingEntry.unit}). Deletion will be rejected if active financial documents exist.`}
                </span>
              </div>
            ) : (
              <p className="text-xs text-gray-600 leading-relaxed">
                {isAr
                  ? `هل أنت متأكد من رغبتك في حذف هذا البند نهائياً؟ سيتم توثيق العملية في سجل التدقيق ولا يمكن التراجع عنها.`
                  : `Are you sure you want to permanently delete this work entry? This action will be documented in the audit log and cannot be undone.`}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={deleteEntryMutation.isPending}
                onClick={() => {
                  deleteEntryMutation.mutate(deletingEntry.id, {
                    onSettled: () => setDeletingEntry(null),
                  })
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {deleteEntryMutation.isPending
                  ? isAr
                    ? 'جارٍ الحذف...'
                    : 'Deleting...'
                  : isAr
                  ? 'تأكيد الحذف'
                  : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Work Entry Modal */}
      {rejectingEntry && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              {isAr
                ? `رفض العمل (${rejectingEntry.referenceNo})`
                : `Reject Work Entry (${rejectingEntry.referenceNo})`}
            </h3>
            <p className="text-xs text-gray-600">
              {isAr
                ? 'يرجى كتابة سبب الرفض بوضوح ليتمكن المدخل من مراجعته وتعديله وإعادة إرساله.'
                : 'Please provide a clear rejection reason so the entry can be revised and resubmitted.'}
            </p>
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
                onClick={() => setRejectingEntry(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
                onClick={() =>
                  rejectMutation.mutate({
                    id: rejectingEntry.id,
                    rejectionReason: rejectionReason.trim(),
                  })
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
