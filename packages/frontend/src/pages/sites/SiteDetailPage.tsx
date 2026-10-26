import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  ClipboardList,
  Edit2,
  Archive,
  RotateCcw,
  Trash2,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { formatCurrency } from '../../lib/utils'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { RecordActionModal, RecordActionType } from '../../components/ui/RecordActionModal'
import { GoogleMapsLocationCard } from '../../components/sites/GoogleMapsLocationCard'
import { GoogleMapsLocationPicker } from '../../components/sites/GoogleMapsLocationPicker'

export function SiteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'
  const locale = isAr ? 'ar-SA' : 'en-SA'
  const BackIcon = isAr ? ArrowRight : ArrowLeft
  const canEdit = hasPermission('CREATE_WORK')
  const isAdmin = user?.role === 'ORG_ADMIN'

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [formData, setFormData] = useState({
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

  // Action Modal State
  const [actionType, setActionType] = useState<RecordActionType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const { data: site, isLoading, isError } = useQuery({
    queryKey: ['site', id],
    queryFn: async () => {
      const res = await api.get(`/sites/${id}`)
      return res.data?.data
    },
    enabled: !!id,
  })

  // Open Edit Modal
  const openEditModal = () => {
    if (!site) return
    setFormData({
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
    setIsEditModalOpen(true)
  }

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put(`/sites/${id}`, payload)
      return res.data?.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site', id] })
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setIsEditModalOpen(false)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم تحديث بيانات الموقع بنجاح' : 'Site updated successfully',
      })
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  // Action Mutation (Archive / Restore / Safe Delete / Permanent Delete)
  const actionMutation = useMutation({
    mutationFn: async (type: RecordActionType) => {
      if (type === 'archive') {
        const res = await api.post(`/sites/${id}/archive`)
        return res.data
      }
      if (type === 'restore') {
        const res = await api.post(`/sites/${id}/restore`)
        return res.data
      }
      if (type === 'delete') {
        const res = await api.delete(`/sites/${id}?mode=delete`)
        return res.data
      }
      if (type === 'permanent_delete') {
        const res = await api.delete(`/sites/${id}/permanent`)
        return res.data
      }
    },
    onSuccess: (_data, type) => {
      queryClient.invalidateQueries({ queryKey: ['site', id] })
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setActionType(null)
      setActionError(null)

      if (type === 'delete' || type === 'permanent_delete') {
        navigate('/sites')
      } else {
        setFeedback({
          type: 'success',
          message:
            type === 'archive'
              ? isAr
                ? 'تمت أرشفة الموقع بنجاح'
                : 'Site archived successfully'
              : isAr
              ? 'تمت استعادة الموقع بنجاح'
              : 'Site restored successfully',
        })
      }
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-gray-500">{t('common.loading')}</div>
  }

  if (isError || !site) {
    return <div className="p-12 text-center text-sm text-red-600">{t('errors.notFound')}</div>
  }

  const isArchived = site.status === 'CANCELLED'
  const canDelete = site.canDelete ?? false
  const weCount = site._count?.workEntries ?? 0
  const ssCount = site._count?.statementSites ?? 0

  const blockedReason =
    !canDelete && (weCount > 0 || ssCount > 0)
      ? isAr
        ? `لا يمكن حذف هذا الموقع لوجود ارتباطات فعلية (${weCount > 0 ? `${weCount} من قيود الأعمال` : ''}${
            weCount > 0 && ssCount > 0 ? ' و ' : ''
          }${ssCount > 0 ? `${ssCount} من المستخلصات` : ''}). يرجى الأرشفة بدلاً من الحذف.`
        : `Cannot delete this site because it has dependent records (${weCount} work entries, ${ssCount} statements). Please archive instead.`
      : undefined

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!formData.nameAr.trim()) {
      setFormError(isAr ? 'اسم الموقع بالعربية حقل مطلوب' : 'Site name in Arabic is required')
      return
    }
    updateMutation.mutate(formData)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/sites"
            className="p-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {isAr ? site.nameAr : site.nameEn || site.nameAr}
              </h1>
              {isArchived && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  {isAr ? 'موقع مؤرشف' : 'Archived Site'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('sites.client')}:{' '}
              <Link to={`/clients/${site.clientId}`} className="text-blue-600 hover:underline font-medium">
                {site.client?.nameAr}
              </Link>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={openEditModal}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 shadow-sm transition-colors"
            >
              <Edit2 className="w-4 h-4 text-gray-500" />
              <span>{t('common.edit')}</span>
            </button>
          )}

          <ActionMenu
            isArchived={isArchived}
            canDelete={canDelete}
            canPermanentDelete={isAdmin}
            deleteBlockedReason={blockedReason}
            onEdit={canEdit ? openEditModal : undefined}
            onArchive={canEdit && !isArchived ? () => setActionType('archive') : undefined}
            onRestore={canEdit && isArchived ? () => setActionType('restore') : undefined}
            onDelete={canEdit ? () => setActionType('delete') : undefined}
            onPermanentDelete={isAdmin ? () => setActionType('permanent_delete') : undefined}
          />
        </div>
      </div>

      {/* Archived Warning Banner with Restore CTA */}
      {isArchived && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Archive className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">
                {isAr ? 'هذا الموقع مؤرشف حالياً' : 'This site is currently archived'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {isAr
                  ? 'تم إيقاف إدراج قيود أعمال جديدة لهذا الموقع. جميع السجلات التاريخية والمستخلصات محفوظة بالكامل.'
                  : 'New work entries cannot be created for this site. All past records and statements remain preserved.'}
              </p>
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setActionType('restore')}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'استعادة الموقع الآن' : 'Restore Site Now'}</span>
            </button>
          )}
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm shadow-sm ${
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

      {/* Site Info & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3 text-xs text-gray-600">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span>{isAr ? 'معلومات الموقع والمشروع' : 'Site Details'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">{t('common.address')}: </span>
            <span>{site.address || '—'}</span>
          </div>
          {site.googleMapsUrl && (
            <div>
              <span className="font-medium text-gray-700">{isAr ? 'الخريطة: ' : 'Map: '}</span>
              <a
                href={site.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <span>{isAr ? 'عرض الموقع على خرائط Google' : 'View on Google Maps'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          <div>
            <span className="font-medium text-gray-700">{t('sites.reference')}: </span>
            <span dir="ltr" className="font-mono">{site.referenceNo || '—'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">{t('common.status')}: </span>
            <span className="font-semibold text-gray-900">{site.status}</span>
          </div>
          {site.startDate && (
            <div>
              <span className="font-medium text-gray-700">{t('sites.startDate')}: </span>
              <span dir="ltr">{new Date(site.startDate).toLocaleDateString(locale)}</span>
            </div>
          )}
          {site.endDate && (
            <div>
              <span className="font-medium text-gray-700">{t('sites.endDate')}: </span>
              <span dir="ltr">{new Date(site.endDate).toLocaleDateString(locale)}</span>
            </div>
          )}
          {site.description && (
            <div>
              <span className="font-medium text-gray-700">{t('common.description')}: </span>
              <p className="mt-1 text-gray-600 leading-relaxed">{site.description}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <p className="text-xs text-gray-500 font-medium">
              {isAr ? 'إجمالي عدد الأعمال المسجلة' : 'Total Work Entries'}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{site.stats?.totalEntries ?? 0}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm sm:col-span-2 flex flex-col justify-between">
            <p className="text-xs text-gray-500 font-medium">
              {isAr ? 'إجمالي قيمة الأعمال في الموقع' : 'Total Work Value'}
            </p>
            <p className="text-2xl font-bold text-[#0F172A] mt-2">
              {formatCurrency(Number(site.stats?.totalValue ?? 0), locale, site.currency || 'SAR')}
            </p>
          </div>
        </div>
      </div>

      {/* Google Maps Location Card */}
      <GoogleMapsLocationCard
        googleMapsUrl={site.googleMapsUrl}
        address={site.address}
        siteName={isAr ? site.nameAr : site.nameEn || site.nameAr}
        isAr={isAr}
        canEdit={canEdit}
        onEditLocation={openEditModal}
      />

      {/* Work Entries Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">{t('nav.workEntries')}</h2>
          </div>
          <span className="text-xs text-gray-500">
            {site.workEntries?.length ?? 0} {isAr ? 'قيد عمل' : 'entries'}
          </span>
        </div>

        {!site.workEntries || site.workEntries.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('workEntries.noEntries')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] print:min-w-0 text-sm text-start">
              <thead className="bg-[#F8FAFC] border-b border-gray-200 text-xs text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="px-6 py-3.5 text-start">#</th>
                  <th className="px-6 py-3.5 text-start">{t('workEntries.itemName')}</th>
                  <th className="px-6 py-3.5 text-start">{t('workEntries.workDate')}</th>
                  <th className="px-6 py-3.5 text-start">{t('workEntries.quantity')}</th>
                  <th className="px-6 py-3.5 text-start">{t('workEntries.unitPrice')}</th>
                  <th className="px-6 py-3.5 text-start">{t('workEntries.totalAmount')}</th>
                  <th className="px-6 py-3.5 text-start">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {site.workEntries.map((we: any) => (
                  <tr key={we.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs">
                      <Link to={`/work-entries/${we.id}`} className="text-blue-600 hover:underline">
                        {we.referenceNo}
                      </Link>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{we.itemNameAr}</td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-xs" dir="ltr">
                      {new Date(we.workDate).toLocaleDateString(locale)}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {Number(we.quantity)} {we.unit}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {formatCurrency(Number(we.unitPrice), locale, we.currency || site.currency || 'SAR')}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {formatCurrency(Number(we.totalAmount), locale, we.currency || site.currency || 'SAR')}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                        {we.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Site Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">{t('sites.editSite')}</h2>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    {t('sites.siteName')} (العربية) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('sites.siteName')} (English)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('sites.reference')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formData.referenceNo}
                    onChange={(e) => setFormData({ ...formData, referenceNo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
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
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('common.address')}
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <GoogleMapsLocationPicker
                  value={formData.googleMapsUrl}
                  onChange={(val) => setFormData({ ...formData, googleMapsUrl: val })}
                  isAr={isAr}
                />
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('common.description')}
                  </label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {updateMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation & Action Dialog */}
      <RecordActionModal
        isOpen={!!actionType}
        actionType={actionType}
        recordName={isAr ? site.nameAr : site.nameEn || site.nameAr}
        recordTypeLabel={t('sites.title')}
        canDelete={canDelete}
        blockedReason={blockedReason}
        isPending={actionMutation.isPending}
        error={actionError}
        onClose={() => setActionType(null)}
        onConfirm={() => actionType && actionMutation.mutate(actionType)}
        onArchiveInstead={() => actionMutation.mutate('archive')}
      />
    </div>
  )
}
