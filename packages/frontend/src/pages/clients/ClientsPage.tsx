import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowUpDown,
  Archive,
  RefreshCw,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { RecordActionModal, RecordActionType } from '../../components/ui/RecordActionModal'

export function ClientsPage() {
  const { t, i18n } = useTranslation()
  const { hasPermission, user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'
  const canEdit = hasPermission('CREATE_WORK')
  const isAdmin = user?.role === 'ORG_ADMIN' || user?.role === 'SUPER_ADMIN'

  const [searchParams, setSearchParams] = useSearchParams()

  // Filters & Pagination
  const initialStatus = (searchParams.get('status') as any) || 'ACTIVE'
  const initialSearch = searchParams.get('search') || ''
  const [search, setSearch] = useState(initialSearch)
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>(
    ['ACTIVE', 'ARCHIVED', 'ALL'].includes(initialStatus) ? initialStatus : 'ACTIVE'
  )

  useEffect(() => {
    const statusParam = searchParams.get('status') as any
    if (statusParam && ['ACTIVE', 'ARCHIVED', 'ALL'].includes(statusParam) && statusParam !== statusFilter) {
      setStatusFilter(statusParam)
    }
    const searchParam = searchParams.get('search')
    if (searchParam !== null && searchParam !== search) {
      setSearch(searchParam)
    }
  }, [searchParams])
  const [typeFilter, setTypeFilter] = useState('')
  const [sortBy, setSortBy] = useState<'createdAt' | 'nameAr'>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  // Form Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<any | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Action Confirmation Modal State
  const [actionTarget, setActionTarget] = useState<any | null>(null)
  const [actionType, setActionType] = useState<RecordActionType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Feedback Notification Banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const [formData, setFormData] = useState({
    nameAr: '',
    nameEn: '',
    clientType: 'COMPANY',
    phone: '',
    email: '',
    address: '',
    vatNumber: '',
    notes: '',
    status: 'ACTIVE',
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clients', { search, statusFilter, typeFilter, sortBy, sortOrder, page }],
    queryFn: async () => {
      const res = await api.get('/clients', {
        params: {
          search: search || undefined,
          status: statusFilter,
          clientType: typeFilter || undefined,
          sortBy,
          sortOrder,
          page,
          limit: 15,
        },
      })
      return res.data?.data
    },
  })

  // Open Form for Adding
  const openAddModal = () => {
    setEditingClient(null)
    setFormData({
      nameAr: '',
      nameEn: '',
      clientType: 'COMPANY',
      phone: '',
      email: '',
      address: '',
      vatNumber: '',
      notes: '',
      status: 'ACTIVE',
    })
    setFormError(null)
    setIsFormModalOpen(true)
  }

  // Open Form for Editing
  const openEditModal = (client: any) => {
    setEditingClient(client)
    setFormData({
      nameAr: client.nameAr || '',
      nameEn: client.nameEn || '',
      clientType: client.clientType || 'COMPANY',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      vatNumber: client.vatNumber || '',
      notes: client.notes || '',
      status: client.status || 'ACTIVE',
    })
    setFormError(null)
    setIsFormModalOpen(true)
  }

  // Save Mutation (Create / Edit)
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingClient) {
        const res = await api.put(`/clients/${editingClient.id}`, payload)
        return res.data?.data
      } else {
        const res = await api.post('/clients', payload)
        return res.data?.data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setIsFormModalOpen(false)
      setFeedback({
        type: 'success',
        message: editingClient
          ? isAr
            ? 'تم تحديث بيانات العميل بنجاح'
            : 'Client updated successfully'
          : isAr
          ? 'تم إنشاء العميل بنجاح'
          : 'Client created successfully',
      })
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  // Action Mutation (Archive / Restore / Safe Delete / Permanent Delete)
  const actionMutation = useMutation({
    mutationFn: async ({
      client,
      type,
    }: {
      client: any
      type: RecordActionType
    }) => {
      if (type === 'archive') {
        const res = await api.post(`/clients/${client.id}/archive`)
        return res.data
      }
      if (type === 'restore') {
        const res = await api.post(`/clients/${client.id}/restore`)
        return res.data
      }
      if (type === 'delete') {
        const res = await api.delete(`/clients/${client.id}?mode=delete`)
        return res.data
      }
      if (type === 'permanent_delete') {
        const res = await api.delete(`/clients/${client.id}/permanent`)
        return res.data
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      closeActionModal()

      let msg = t('common.success')
      if (variables.type === 'archive') {
        msg = isAr
          ? 'تمت أرشفة العميل بنجاح مع حفظ كامل سجلاته التاريخية'
          : 'Client archived successfully with all history preserved'
      } else if (variables.type === 'restore') {
        msg = isAr ? 'تمت استعادة العميل بنجاح إلى النشاط' : 'Client restored successfully'
      } else if (variables.type === 'delete' || variables.type === 'permanent_delete') {
        msg = isAr ? 'تم حذف السجل بنجاح' : 'Client deleted successfully'
      }

      setFeedback({ type: 'success', message: msg })
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  const openActionModal = (client: any, type: RecordActionType) => {
    setActionTarget(client)
    setActionType(type)
    setActionError(null)
  }

  const closeActionModal = () => {
    setActionTarget(null)
    setActionType(null)
    setActionError(null)
  }

  const handleConfirmAction = () => {
    if (!actionTarget || !actionType) return
    actionMutation.mutate({ client: actionTarget, type: actionType })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formData.nameAr.trim()) {
      setFormError(t('validation.required'))
      return
    }

    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setFormError(t('validation.invalidEmail'))
      return
    }

    saveMutation.mutate(formData)
  }

  const toggleSort = (field: 'createdAt' | 'nameAr') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const clientTypeLabel = (type: string) => {
    if (type === 'INDIVIDUAL') return t('clients.individual')
    if (type === 'GOVERNMENT') return t('clients.government')
    return t('clients.company')
  }

  const getClientDependencyReason = (client: any): string => {
    const counts = client._count || {}
    const reasons: string[] = []
    if (counts.sites > 0) reasons.push(isAr ? `${counts.sites} موقع` : `${counts.sites} site(s)`)
    if (counts.workEntries > 0)
      reasons.push(isAr ? `${counts.workEntries} عمل مسجل` : `${counts.workEntries} work entry(ies)`)
    if (counts.statements > 0)
      reasons.push(isAr ? `${counts.statements} مستخلص` : `${counts.statements} statement(s)`)
    if (counts.invoices > 0)
      reasons.push(isAr ? `${counts.invoices} فاتورة` : `${counts.invoices} invoice(s)`)
    if (counts.payments > 0)
      reasons.push(isAr ? `${counts.payments} دفعة` : `${counts.payments} payment(s)`)

    if (reasons.length === 0) return ''
    return isAr
      ? `مرتبط بـ (${reasons.join('، ')})`
      : `Linked to (${reasons.join(', ')})`
  }

  const items = data?.items || []
  const totalPages = data?.totalPages || 1

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937] tracking-tight">
            {t('clients.title')}
          </h1>
          <p className="mt-1 text-xs text-[#667085]">
            {isAr
              ? 'إدارة حسابات العملاء، ومتابعة المشاريع والبيانات المالية وأرشفة السجلات بأمان.'
              : 'Manage customer accounts, project sites, financial tracking, and secure archiving.'}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openAddModal}
            data-testid="add-client-btn"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#18324B] hover:bg-[#102437] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4 text-[#E6A23C]" />
            <span>{t('clients.addClient')}</span>
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in-50 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E4E7EC] shadow-card grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-[#667085] absolute top-3 start-3.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('common.search')}
            data-testid="clients-search-input"
            className="w-full ps-9 pe-3.5 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] bg-white outline-none focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B]"
        >
          <option value="">{t('clients.clientType')}: {t('common.all')}</option>
          <option value="COMPANY">{t('clients.company')}</option>
          <option value="INDIVIDUAL">{t('clients.individual')}</option>
          <option value="GOVERNMENT">{t('clients.government')}</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as any)
            setPage(1)
          }}
          data-testid="clients-status-filter"
          className="px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] bg-white outline-none focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B]"
        >
          <option value="ACTIVE">{t('common.dataMgmt.activeOnly')}</option>
          <option value="ARCHIVED">{t('common.dataMgmt.archivedOnly')}</option>
          <option value="ALL">{t('common.dataMgmt.allRecords')}</option>
        </select>
      </div>

      {/* Main Clients Table */}
      <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-14 text-center text-xs text-[#667085]">{t('common.loading')}</div>
        ) : isError ? (
          <div className="p-14 text-center text-xs text-red-600">
            <p>{t('errors.serverError')}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 px-3 py-1.5 text-xs font-semibold bg-[#EAF0F5] text-[#18324B] rounded-lg"
            >
              {isAr ? 'إعادة المحاولة' : 'Retry'}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-14 text-center text-xs text-[#667085]">
            <Building2 className="w-8 h-8 text-[#667085]/40 mx-auto mb-2" />
            <p className="font-semibold text-[#1F2937]">{t('clients.noClients')}</p>
            <p className="mt-1 text-[11px] text-[#667085]">
              {statusFilter === 'ARCHIVED'
                ? isAr
                  ? 'لا توجد أي سجلات عملاء مؤرشفة حالياً.'
                  : 'No archived client records found.'
                : isAr
                ? 'لا توجد سجلات عملاء نشطة مطابقة للفلاتر الحالية.'
                : 'No active client records matching current filters.'}
            </p>
            {statusFilter === 'ACTIVE' && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL')
                    setSearchParams({ status: 'ALL' })
                  }}
                  className="px-3 py-1.5 bg-[#EAF0F5] hover:bg-[#d8e3ed] text-[#18324B] font-semibold rounded-lg text-xs transition-colors"
                >
                  {isAr ? 'عرض جميع العملاء (بما في ذلك المؤرشفين)' : 'Show All Clients (Including Archived)'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] print:min-w-0 text-xs text-start">
              <thead className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-[11px] text-[#667085] uppercase">
                <tr>
                  <th className="px-5 py-3.5 text-start font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('nameAr')}
                      className="inline-flex items-center gap-1 hover:text-[#18324B]"
                    >
                      <span>{t('clients.clientName')}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-start font-semibold">{t('clients.clientType')}</th>
                  <th className="px-5 py-3.5 text-start font-semibold">{t('clients.phone')}</th>
                  <th className="px-5 py-3.5 text-start font-semibold">{t('nav.sites')}</th>
                  <th className="px-5 py-3.5 text-start font-semibold">{t('common.status')}</th>
                  <th className="px-5 py-3.5 text-start font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('createdAt')}
                      className="inline-flex items-center gap-1 hover:text-[#18324B]"
                    >
                      <span>{t('common.createdAt')}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-end font-semibold">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EC]/70">
                {items.map((client: any) => {
                  const isArchived = client.status === 'INACTIVE'
                  const canDelete = Boolean(client.canDelete)
                  const blockedReason = getClientDependencyReason(client)

                  return (
                    <tr
                      key={client.id}
                      className={`transition-colors ${
                        isArchived ? 'bg-gray-50/60 hover:bg-gray-100/60' : 'hover:bg-[#F5F7FA]/70'
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/clients/${client.id}`}
                          className="font-bold text-[#18324B] hover:text-[#B97816] hover:underline block"
                        >
                          {isAr ? client.nameAr : client.nameEn || client.nameAr}
                        </Link>
                        {client.vatNumber && (
                          <span className="text-[10px] text-[#667085] block mt-0.5" dir="ltr">
                            {t('clients.vatNumber')}: {client.vatNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#667085]">
                        {clientTypeLabel(client.clientType)}
                      </td>
                      <td className="px-5 py-3.5 text-[#667085]" dir="ltr">
                        {client.phone || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-[#1F2937]">
                        {client._count?.sites ?? 0}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            !isArchived
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}
                        >
                          {!isArchived ? t('common.active') : t('common.dataMgmt.archived')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[#667085] text-[11px]" dir="ltr">
                        {new Date(client.createdAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                      </td>
                      <td className="px-5 py-3.5 text-end">
                        <div className="inline-flex items-center justify-end">
                          <ActionMenu
                            onView={() => navigate(`/clients/${client.id}`)}
                            onEdit={canEdit ? () => openEditModal(client) : undefined}
                            onArchive={
                              canEdit && !isArchived
                                ? () => openActionModal(client, 'archive')
                                : undefined
                            }
                            onRestore={
                              canEdit && isArchived
                                ? () => openActionModal(client, 'restore')
                                : undefined
                            }
                            onDelete={
                              canEdit
                                ? () => openActionModal(client, 'delete')
                                : undefined
                            }
                            onPermanentDelete={
                              isAdmin
                                ? () => openActionModal(client, 'permanent_delete')
                                : undefined
                            }
                            isArchived={isArchived}
                            canDelete={canDelete}
                            canPermanentDelete={isAdmin && canDelete}
                            deleteBlockedReason={blockedReason}
                            triggerTestId={`client-actions-${client.id}`}
                          />
                        </div>
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
          <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E4E7EC] flex items-center justify-between text-xs text-[#667085]">
            <span>
              {t('common.page')} {page} {t('common.of')} {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-[#E4E7EC] bg-white text-xs disabled:opacity-40 hover:bg-gray-50"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-[#E4E7EC] bg-white text-xs disabled:opacity-40 hover:bg-gray-50"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Client Modal */}
      {isFormModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={isAr ? 'rtl' : 'ltr'}
          className="fixed inset-0 z-50 bg-[#102437]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E4E7EC] space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in-90">
            <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
              <h2 className="text-base font-bold text-[#1F2937]">
                {editingClient ? t('clients.editClient') : t('clients.addClient')}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1 text-[#667085] hover:text-[#1F2937] hover:bg-[#EAF0F5] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.clientName')} (العربية) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                    placeholder="مثال: شركة التطوير العقاري"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.clientName')} (English){' '}
                    <span className="text-[10px] text-[#667085] font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.clientType')}
                  </label>
                  <select
                    value={formData.clientType}
                    onChange={(e) => setFormData({ ...formData, clientType: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] bg-white outline-none focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B]"
                  >
                    <option value="COMPANY">{t('clients.company')}</option>
                    <option value="INDIVIDUAL">{t('clients.individual')}</option>
                    <option value="GOVERNMENT">{t('clients.government')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('common.status')}
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] bg-white outline-none focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B]"
                  >
                    <option value="ACTIVE">{t('common.active')}</option>
                    <option value="INACTIVE">{t('common.dataMgmt.archived')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.phone')}{' '}
                    <span className="text-[10px] text-[#667085] font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                    placeholder="05xxxxxxxx"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.email')}{' '}
                    <span className="text-[10px] text-[#667085] font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                    placeholder="client@example.com"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.vatNumber')}{' '}
                    <span className="text-[10px] text-[#667085] font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.vatNumber}
                    onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none font-mono"
                    placeholder="300000000000003"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('common.address')}{' '}
                    <span className="text-[10px] text-[#667085] font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('common.notes')}{' '}
                    <span className="text-[10px] text-[#667085] font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E4E7EC]">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E4E7EC] text-xs font-semibold text-[#1F2937] hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  data-testid="save-client-submit-btn"
                  className="px-5 py-2 rounded-xl bg-[#18324B] hover:bg-[#102437] text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {saveMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reusable Action Confirmation Modal (Archive, Restore, Safe Delete, Permanent Delete) */}
      <RecordActionModal
        isOpen={Boolean(actionTarget && actionType)}
        actionType={actionType}
        recordName={actionTarget ? (isAr ? actionTarget.nameAr : actionTarget.nameEn || actionTarget.nameAr) : ''}
        recordTypeLabel={isAr ? 'العميل' : 'Client'}
        canDelete={actionTarget ? Boolean(actionTarget.canDelete) : false}
        blockedReason={actionTarget ? getClientDependencyReason(actionTarget) : undefined}
        isPending={actionMutation.isPending}
        error={actionError}
        onClose={closeActionModal}
        onConfirm={handleConfirmAction}
        onArchiveInstead={
          actionTarget?.status === 'ACTIVE'
            ? () => openActionModal(actionTarget, 'archive')
            : undefined
        }
      />
    </div>
  )
}
