import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Filter,
  MapPin,
  Building2,
  Calendar,
  ExternalLink,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { RecordActionModal, RecordActionType } from '../../components/ui/RecordActionModal'
import { GoogleMapsLocationPicker } from '../../components/sites/GoogleMapsLocationPicker'

export function SitesPage() {
  const { t, i18n } = useTranslation()
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'
  const canEdit = hasPermission('CREATE_WORK')
  const isAdmin = user?.role === 'ORG_ADMIN'

  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)

  // Form Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingSite, setEditingSite] = useState<any | null>(null)
  const [formData, setFormData] = useState({
    clientId: '',
    nameAr: '',
    nameEn: '',
    address: '',
    googleMapsUrl: '',
    description: '',
    referenceNo: '',
    startDate: '',
    endDate: '',
    status: 'ACTIVE',
    notes: '',
  })
  const [formError, setFormError] = useState<string | null>(null)

  // Action Modal state (Archive, Restore, Delete, Permanent Delete)
  const [actionTarget, setActionTarget] = useState<any | null>(null)
  const [actionType, setActionType] = useState<RecordActionType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Feedback Notification
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  // Fetch clients for dropdown filter and creation form
  const { data: clientsData } = useQuery({
    queryKey: ['clientsListAll'],
    queryFn: async () => {
      const res = await api.get('/clients', { params: { limit: 100, status: 'ALL' } })
      return res.data?.data?.items || []
    },
  })

  // Filter clients for creation: only active clients can be chosen
  const activeClients = (clientsData || []).filter((c: any) => c.status === 'ACTIVE')

  // Fetch Sites
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sites', { search, clientFilter, statusFilter, page }],
    queryFn: async () => {
      const res = await api.get('/sites', {
        params: {
          search: search || undefined,
          clientId: clientFilter || undefined,
          status: statusFilter,
          page,
          limit: 15,
        },
      })
      return res.data?.data
    },
  })

  // Open Form for Adding
  const openAddModal = () => {
    setEditingSite(null)
    setFormData({
      clientId: clientFilter || activeClients[0]?.id || '',
      nameAr: '',
      nameEn: '',
      address: '',
      googleMapsUrl: '',
      description: '',
      referenceNo: '',
      startDate: '',
      endDate: '',
      status: 'ACTIVE',
      notes: '',
    })
    setFormError(null)
    setIsFormModalOpen(true)
  }

  // Open Form for Editing
  const openEditModal = (site: any) => {
    setEditingSite(site)
    setFormData({
      clientId: site.clientId || '',
      nameAr: site.nameAr || '',
      nameEn: site.nameEn || '',
      address: site.address || '',
      googleMapsUrl: site.googleMapsUrl || '',
      description: site.description || '',
      referenceNo: site.referenceNo || '',
      startDate: site.startDate ? site.startDate.slice(0, 10) : '',
      endDate: site.endDate ? site.endDate.slice(0, 10) : '',
      status: site.status || 'ACTIVE',
      notes: site.notes || '',
    })
    setFormError(null)
    setIsFormModalOpen(true)
  }

  // Save Mutation (Create / Edit)
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingSite) {
        const res = await api.put(`/sites/${editingSite.id}`, payload)
        return res.data?.data
      } else {
        const res = await api.post('/sites', payload)
        return res.data?.data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setIsFormModalOpen(false)
      setFeedback({
        type: 'success',
        message: editingSite
          ? isAr
            ? 'تم تحديث بيانات الموقع بنجاح'
            : 'Site updated successfully'
          : isAr
          ? 'تم إنشاء الموقع بنجاح'
          : 'Site created successfully',
      })
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  // Action Mutation (Archive / Restore / Safe Delete / Permanent Delete)
  const actionMutation = useMutation({
    mutationFn: async ({ site, type }: { site: any; type: RecordActionType }) => {
      if (type === 'archive') {
        const res = await api.post(`/sites/${site.id}/archive`)
        return res.data
      }
      if (type === 'restore') {
        const res = await api.post(`/sites/${site.id}/restore`)
        return res.data
      }
      if (type === 'delete') {
        const res = await api.delete(`/sites/${site.id}?mode=delete`)
        return res.data
      }
      if (type === 'permanent_delete') {
        const res = await api.delete(`/sites/${site.id}/permanent`)
        return res.data
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      closeActionModal()

      let msg = t('common.success')
      if (variables.type === 'archive') {
        msg = isAr
          ? 'تمت أرشفة الموقع بنجاح مع حفظ كامل سجلات الأعمال والمستخلصات'
          : 'Site archived successfully with all work records preserved'
      } else if (variables.type === 'restore') {
        msg = isAr ? 'تمت استعادة الموقع بنجاح إلى الحالة النشطة' : 'Site restored successfully'
      } else if (variables.type === 'delete' || variables.type === 'permanent_delete') {
        msg = isAr ? 'تم حذف الموقع بنجاح' : 'Site deleted successfully'
      }

      setFeedback({ type: 'success', message: msg })
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  const openActionModal = (site: any, type: RecordActionType) => {
    setActionTarget(site)
    setActionType(type)
    setActionError(null)
  }

  const closeActionModal = () => {
    setActionTarget(null)
    setActionType(null)
    setActionError(null)
  }

  const handleActionConfirm = () => {
    if (!actionTarget || !actionType) return
    actionMutation.mutate({ site: actionTarget, type: actionType })
  }

  const handleArchiveInstead = () => {
    if (!actionTarget) return
    actionMutation.mutate({ site: actionTarget, type: 'archive' })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formData.clientId) {
      setFormError(isAr ? 'يرجى اختيار العميل التابع له الموقع' : 'Please select a client')
      return
    }

    if (!formData.nameAr.trim()) {
      setFormError(isAr ? 'اسم الموقع بالعربية حقل مطلوب' : 'Site name in Arabic is required')
      return
    }

    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      setFormError(t('validation.dateRange'))
      return
    }

    saveMutation.mutate(formData)
  }

  // Construct blocked reason dynamically from site dependency count
  const computeBlockedReason = (site: any) => {
    const we = site?._count?.workEntries ?? 0
    const ss = site?._count?.statementSites ?? 0
    if (we === 0 && ss === 0) return undefined

    if (isAr) {
      const parts = []
      if (we > 0) parts.push(`${we} من قيود الأعمال المسجلة`)
      if (ss > 0) parts.push(`${ss} من المستخلصات المالية`)
      return `لا يمكن حذف هذا الموقع لوجود ارتباطات فعلية (${parts.join(
        ' و '
      )}). يمكنك أرشفة الموقع بدلاً من حذفه لضمان سلامة التدقيق والمحاسبة.`
    } else {
      const parts = []
      if (we > 0) parts.push(`${we} work entries`)
      if (ss > 0) parts.push(`${ss} statements`)
      return `Cannot delete this site because it has dependent records (${parts.join(
        ' and '
      )}). You can archive this site instead to preserve accounting and operational history.`
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { label: t('sites.active'), cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
      case 'COMPLETED':
        return { label: t('sites.completed'), cls: 'bg-blue-50 text-blue-700 border border-blue-200' }
      case 'ON_HOLD':
        return { label: t('sites.onHold'), cls: 'bg-amber-50 text-amber-700 border border-amber-200' }
      case 'CANCELLED':
      default:
        return { label: isAr ? 'مؤرشف / ملغى' : 'Archived', cls: 'bg-slate-100 text-slate-600 border border-slate-200' }
    }
  }

  const items = data?.items || []
  const totalPages = data?.totalPages || 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('sites.title')}</h1>
          <p className="text-xs text-gray-500 mt-1">
            {isAr
              ? 'إدارة مواقع ومشاريع العمل، تتبع الإنجاز، والأرشفة الآمنة'
              : 'Manage construction sites, projects, progress tracking, and safe archiving'}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 text-[#E29A26]" />
            <span>{t('sites.addSite')}</span>
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm transition-all shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute top-3 start-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('common.search')}
            className="w-full ps-9 pe-3.5 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Client Filter */}
        <select
          value={clientFilter}
          onChange={(e) => {
            setClientFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">
            {t('sites.client')}: {t('common.all')}
          </option>
          {(clientsData || []).map((c: any) => (
            <option key={c.id} value={c.id}>
              {isAr ? c.nameAr : c.nameEn || c.nameAr}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">{t('common.status')}: {t('common.all')}</option>
          <option value="ACTIVE">{t('sites.active')}</option>
          <option value="COMPLETED">{t('sites.completed')}</option>
          <option value="ON_HOLD">{t('sites.onHold')}</option>
          <option value="CANCELLED">{isAr ? 'مؤرشف / ملغى' : 'Archived / Cancelled'}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('common.loading')}</div>
        ) : isError ? (
          <div className="p-12 text-center text-sm text-red-600">{t('errors.serverError')}</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('sites.noSites')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-start">
              <thead className="bg-[#F8FAFC] border-b border-gray-200 text-xs text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="px-6 py-3.5 text-start">{t('sites.siteName')}</th>
                  <th className="px-6 py-3.5 text-start">{t('sites.client')}</th>
                  <th className="px-6 py-3.5 text-start">{t('sites.reference')}</th>
                  <th className="px-6 py-3.5 text-start">{t('nav.workEntries')}</th>
                  <th className="px-6 py-3.5 text-start">{t('common.status')}</th>
                  <th className="px-6 py-3.5 text-end">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((site: any) => {
                  const badge = statusBadge(site.status)
                  const isArchived = site.status === 'CANCELLED'
                  const blockedReason = computeBlockedReason(site)

                  return (
                    <tr
                      key={site.id}
                      className={`hover:bg-gray-50/80 transition-colors ${
                        isArchived ? 'bg-gray-50/50 opacity-80' : ''
                      }`}
                    >
                      {/* Name & Address */}
                      <td className="px-6 py-4">
                        <Link
                          to={`/sites/${site.id}`}
                          className="font-semibold text-gray-900 hover:text-blue-600 hover:underline block"
                        >
                          {isAr ? site.nameAr : site.nameEn || site.nameAr}
                        </Link>
                        {site.address && (
                          <span className="text-xs text-gray-400 block mt-0.5">{site.address}</span>
                        )}
                        {site.googleMapsUrl && (
                          <a
                            href={site.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 hover:underline mt-1"
                            title={site.googleMapsUrl}
                          >
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>{isAr ? 'خرائط جوجل' : 'Google Maps'}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>

                      {/* Client */}
                      <td className="px-6 py-4 text-gray-700">
                        <Link
                          to={`/clients/${site.clientId}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {isAr ? site.client?.nameAr : site.client?.nameEn || site.client?.nameAr}
                        </Link>
                      </td>

                      {/* Reference Code */}
                      <td className="px-6 py-4 text-gray-600 font-mono text-xs" dir="ltr">
                        {site.referenceNo || '—'}
                      </td>

                      {/* Work Entries Count */}
                      <td className="px-6 py-4 font-medium text-gray-700">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                          {site._count?.workEntries ?? 0}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Contextual Actions Dropdown Menu */}
                      <td className="px-6 py-4 text-end">
                        <ActionMenu
                          isArchived={isArchived}
                          canDelete={site.canDelete}
                          canPermanentDelete={isAdmin}
                          deleteBlockedReason={blockedReason}
                          onView={() => {
                            window.location.href = `/sites/${site.id}`
                          }}
                          onEdit={canEdit ? () => openEditModal(site) : undefined}
                          onArchive={
                            canEdit && !isArchived
                              ? () => openActionModal(site, 'archive')
                              : undefined
                          }
                          onRestore={
                            canEdit && isArchived
                              ? () => openActionModal(site, 'restore')
                              : undefined
                          }
                          onDelete={
                            canEdit
                              ? () => openActionModal(site, 'delete')
                              : undefined
                          }
                          onPermanentDelete={
                            isAdmin
                              ? () => openActionModal(site, 'permanent_delete')
                              : undefined
                          }
                        />
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
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
            <span>
              {t('common.page')} {page} {t('common.of')} {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white disabled:opacity-50 hover:bg-gray-50 transition-colors"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white disabled:opacity-50 hover:bg-gray-50 transition-colors"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Site Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingSite ? t('sites.editSite') : t('sites.addSite')}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isAr
                    ? 'الحقول المعلمة بـ (*) إلزامية لحفظ السجل'
                    : 'Fields marked with (*) are required'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Client Selection (Required) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    {t('sites.client')}{' '}
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <select
                    required
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('workEntries.selectClient')}</option>
                    {(editingSite ? clientsData || [] : activeClients).map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {isAr ? c.nameAr : c.nameEn || c.nameAr}{' '}
                        {c.status !== 'ACTIVE' ? `(${isAr ? 'مؤرشف' : 'Archived'})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Site Name Ar (Required) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    {t('sites.siteName')} (العربية){' '}
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isAr ? 'مثال: برج اليمامة' : 'Site Name in Arabic'}
                  />
                </div>

                {/* Site Name En (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('sites.siteName')} (English){' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Al Yamamah Tower"
                  />
                </div>

                {/* Reference Code (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('sites.reference')}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.referenceNo}
                    onChange={(e) => setFormData({ ...formData, referenceNo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="SITE-001"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('common.status')}
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ACTIVE">{t('sites.active')}</option>
                    <option value="COMPLETED">{t('sites.completed')}</option>
                    <option value="ON_HOLD">{t('sites.onHold')}</option>
                    <option value="CANCELLED">{isAr ? 'مؤرشف / ملغى' : 'Archived / Cancelled'}</option>
                  </select>
                </div>

                {/* Start Date (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('sites.startDate')}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* End Date (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('sites.endDate')}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Address (Optional) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('common.address')}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isAr ? 'المدينة، الحي، الشارع' : 'City, District, Street'}
                  />
                </div>

                {/* Google Maps Location Section */}
                <GoogleMapsLocationPicker
                  value={formData.googleMapsUrl}
                  onChange={(val) => setFormData({ ...formData, googleMapsUrl: val })}
                  isAr={isAr}
                />

                {/* Description (Optional) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('common.description')}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      ({t('common.optional')})
                    </span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isAr ? 'وصف نطاق العمل في هذا المشروع...' : 'Project description...'}
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 shadow-sm"
                >
                  {saveMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation & Action Dialog */}
      <RecordActionModal
        isOpen={!!actionTarget && !!actionType}
        actionType={actionType}
        recordName={
          actionTarget
            ? isAr
              ? actionTarget.nameAr
              : actionTarget.nameEn || actionTarget.nameAr
            : ''
        }
        recordTypeLabel={t('sites.title')}
        canDelete={actionTarget?.canDelete ?? false}
        blockedReason={computeBlockedReason(actionTarget)}
        isPending={actionMutation.isPending}
        error={actionError}
        onClose={closeActionModal}
        onConfirm={handleActionConfirm}
        onArchiveInstead={handleArchiveInstead}
      />
    </div>
  )
}
