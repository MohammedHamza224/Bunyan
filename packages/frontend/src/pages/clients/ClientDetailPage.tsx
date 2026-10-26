import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  ClipboardList,
  FileText,
  Receipt,
  CreditCard,
  Phone,
  Mail,
  Building2,
  Edit2,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { formatCurrency } from '../../lib/utils'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { RecordActionModal, RecordActionType } from '../../components/ui/RecordActionModal'

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const { hasPermission, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'
  const canEdit = hasPermission('CREATE_WORK')
  const isAdmin = user?.role === 'ORG_ADMIN' || user?.role === 'SUPER_ADMIN'

  const [activeTab, setActiveTab] = useState<
    'sites' | 'workEntries' | 'statements' | 'invoices' | 'payments'
  >('sites')

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editFormData, setEditFormData] = useState<any>({})
  const [editFormError, setEditFormError] = useState<string | null>(null)

  // Action Modal State
  const [actionType, setActionType] = useState<RecordActionType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const { data: client, isLoading, isError, refetch } = useQuery({
    queryKey: ['client', id],
    queryFn: async () => {
      const res = await api.get(`/clients/${id}`)
      return res.data?.data
    },
    enabled: !!id,
  })

  // Edit Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put(`/clients/${id}`, payload)
      return res.data?.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setIsEditModalOpen(false)
      setFeedback({
        type: 'success',
        message: isAr ? 'تم تحديث بيانات العميل بنجاح' : 'Client updated successfully',
      })
    },
    onError: (err: any) => {
      setEditFormError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  // Action Mutation
  const actionMutation = useMutation({
    mutationFn: async (type: RecordActionType) => {
      if (type === 'archive') {
        const res = await api.post(`/clients/${id}/archive`)
        return res.data
      }
      if (type === 'restore') {
        const res = await api.post(`/clients/${id}/restore`)
        return res.data
      }
      if (type === 'delete') {
        const res = await api.delete(`/clients/${id}?mode=delete`)
        return res.data
      }
      if (type === 'permanent_delete') {
        const res = await api.delete(`/clients/${id}/permanent`)
        return res.data
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setActionType(null)
      setActionError(null)

      if (vars === 'delete' || vars === 'permanent_delete') {
        navigate('/clients')
      } else {
        queryClient.invalidateQueries({ queryKey: ['client', id] })
        setFeedback({
          type: 'success',
          message:
            vars === 'archive'
              ? isAr
                ? 'تمت أرشفة العميل بنجاح'
                : 'Client archived successfully'
              : isAr
              ? 'تمت استعادة العميل بنجاح'
              : 'Client restored successfully',
        })
      }
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.error?.message || t('errors.serverError'))
    },
  })

  const openEditModal = () => {
    if (!client) return
    setEditFormData({
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
    setEditFormError(null)
    setIsEditModalOpen(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setEditFormError(null)
    if (!editFormData.nameAr?.trim()) {
      setEditFormError(t('validation.required'))
      return
    }
    updateMutation.mutate(editFormData)
  }

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-gray-500">{t('common.loading')}</div>
  }

  if (isError || !client) {
    return <div className="p-12 text-center text-sm text-red-600">{t('errors.notFound')}</div>
  }

  const locale = isAr ? 'ar-SA' : 'en-SA'
  const clientCurrency = client.currency || 'SAR'
  const BackIcon = isAr ? ArrowRight : ArrowLeft
  const isArchived = client.status === 'INACTIVE'
  const canDelete = Boolean(client.canDelete)

  const getDependencyReason = (): string => {
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
    return isAr ? `مرتبط بـ (${reasons.join('، ')})` : `Linked to (${reasons.join(', ')})`
  }

  const tabs = [
    { key: 'sites' as const, label: t('nav.sites'), icon: MapPin, count: client.sites?.length ?? 0 },
    {
      key: 'workEntries' as const,
      label: t('nav.workEntries'),
      icon: ClipboardList,
      count: client.workEntries?.length ?? 0,
    },
    {
      key: 'statements' as const,
      label: t('nav.statements'),
      icon: FileText,
      count: client.statements?.length ?? 0,
    },
    {
      key: 'invoices' as const,
      label: t('nav.invoices'),
      icon: Receipt,
      count: client.invoices?.length ?? 0,
    },
    {
      key: 'payments' as const,
      label: t('nav.payments'),
      icon: CreditCard,
      count: client.payments?.length ?? 0,
    },
  ]

  return (
    <div className="space-y-6">
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

      {/* Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/clients"
            className="p-2 rounded-xl border border-[#E4E7EC] bg-white text-[#667085] hover:bg-[#F5F7FA] transition-colors"
          >
            <BackIcon className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[#1F2937]">
                {isAr ? client.nameAr : client.nameEn || client.nameAr}
              </h1>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  !isArchived
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}
              >
                {!isArchived ? t('common.active') : t('common.dataMgmt.archived')}
              </span>
            </div>
            <p className="text-xs text-[#667085] mt-0.5">
              {client.clientType} • {new Date(client.createdAt).toLocaleDateString(locale)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/reports?tab=customer-statement&clientId=${client.id}`}
            data-testid="client-statement-btn"
            className="px-3.5 py-2 rounded-xl bg-[#18324B] hover:bg-[#102437] text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
          >
            <FileText className="w-4 h-4 text-[#E6A23C]" />
            <span>{isAr ? 'كشف حساب العميل' : 'Account Statement'}</span>
          </Link>

          {canEdit && (
            <button
              type="button"
              onClick={openEditModal}
              className="px-3 py-2 rounded-xl border border-[#E4E7EC] bg-white hover:bg-gray-50 text-[#1F2937] text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5 text-[#667085]" />
              <span>{t('common.edit')}</span>
            </button>
          )}

          {canEdit && (
            <ActionMenu
              onEdit={openEditModal}
              onArchive={!isArchived ? () => setActionType('archive') : undefined}
              onRestore={isArchived ? () => setActionType('restore') : undefined}
              onDelete={() => setActionType('delete')}
              onPermanentDelete={isAdmin ? () => setActionType('permanent_delete') : undefined}
              isArchived={isArchived}
              canDelete={canDelete}
              canPermanentDelete={isAdmin && canDelete}
              deleteBlockedReason={getDependencyReason()}
            />
          )}
        </div>
      </div>

      {/* Client Info & Financial Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#E4E7EC] shadow-card space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#18324B] border-b border-[#E4E7EC] pb-2">
            <Building2 className="w-4 h-4 text-[#E6A23C]" />
            <span>{isAr ? 'بيانات العميل' : 'Client Information'}</span>
          </div>
          <div className="text-xs space-y-2 text-[#667085]">
            {client.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-gray-400" />
                <span dir="ltr">{client.phone}</span>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-gray-400" />
                <span dir="ltr">{client.email}</span>
              </div>
            )}
            {client.vatNumber && (
              <div>
                <span className="font-semibold text-[#1F2937]">{t('clients.vatNumber')}: </span>
                <span dir="ltr" className="font-mono">{client.vatNumber}</span>
              </div>
            )}
            {client.address && (
              <div>
                <span className="font-semibold text-[#1F2937]">{t('common.address')}: </span>
                <span>{client.address}</span>
              </div>
            )}
            {client.notes && (
              <div className="pt-1 text-[#667085]">
                <span className="font-semibold text-[#1F2937]">{t('common.notes')}: </span>
                <span>{client.notes}</span>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-[#E4E7EC] shadow-card">
            <p className="text-[11px] text-[#667085]">{isAr ? 'قيمة الأعمال المسجلة' : 'Total Works Value'}</p>
            <p className="text-base font-bold text-[#1F2937] mt-2">
              {formatCurrency(Number(client.stats?.totalWorkValue ?? 0), locale, clientCurrency)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-[#E4E7EC] shadow-card">
            <p className="text-[11px] text-[#667085]">{t('clients.totalBilled')}</p>
            <p className="text-base font-bold text-[#18324B] mt-2">
              {formatCurrency(Number(client.stats?.totalInvoiceValue ?? 0), locale, clientCurrency)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-[#E4E7EC] shadow-card">
            <p className="text-[11px] text-[#667085]">{t('clients.totalPaid')}</p>
            <p className="text-base font-bold text-emerald-700 mt-2">
              {formatCurrency(Number(client.stats?.totalPaid ?? 0), locale, clientCurrency)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-[#E4E7EC] shadow-card">
            <p className="text-[11px] text-[#667085]">{t('clients.outstanding')}</p>
            <p className="text-base font-bold text-rose-600 mt-2">
              {formatCurrency(Number(client.stats?.outstandingBalance ?? 0), locale, clientCurrency)}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-[#E4E7EC] flex gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'border-[#18324B] text-[#18324B]'
                  : 'border-transparent text-[#667085] hover:text-[#1F2937]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-[#F5F7FA] text-[#667085] border border-[#E4E7EC]">
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-card overflow-hidden">
        {activeTab === 'sites' && (
          <div>
            {!client.sites || client.sites.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#667085]">{t('sites.noSites')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs text-start">
                  <thead className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-[11px] text-[#667085] uppercase">
                    <tr>
                      <th className="px-5 py-3 text-start">{t('sites.siteName')}</th>
                      <th className="px-5 py-3 text-start">{t('common.address')}</th>
                      <th className="px-5 py-3 text-start">{t('sites.reference')}</th>
                      <th className="px-5 py-3 text-start">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7EC]/70">
                    {client.sites.map((site: any) => (
                      <tr key={site.id} className="hover:bg-[#F5F7FA]">
                        <td className="px-5 py-3.5 font-bold text-[#18324B]">
                          <Link to={`/sites/${site.id}`} className="hover:underline">
                            {site.nameAr}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-[#667085]">{site.address || '—'}</td>
                        <td className="px-5 py-3.5 text-[#667085]" dir="ltr">
                          {site.referenceNo || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-[11px]">{site.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'workEntries' && (
          <div>
            {!client.workEntries || client.workEntries.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#667085]">{t('workEntries.noEntries')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs text-start">
                  <thead className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-[11px] text-[#667085] uppercase">
                    <tr>
                      <th className="px-5 py-3 text-start">#</th>
                      <th className="px-5 py-3 text-start">{t('workEntries.itemName')}</th>
                      <th className="px-5 py-3 text-start">{t('sites.siteName')}</th>
                      <th className="px-5 py-3 text-start">{t('workEntries.quantity')}</th>
                      <th className="px-5 py-3 text-start">{t('workEntries.totalAmount')}</th>
                      <th className="px-5 py-3 text-start">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7EC]/70">
                    {client.workEntries.map((we: any) => (
                      <tr key={we.id} className="hover:bg-[#F5F7FA]">
                        <td className="px-5 py-3.5 font-mono text-[11px]">
                          <Link to={`/work-entries/${we.id}`} className="text-[#18324B] hover:underline">
                            {we.referenceNo}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-[#1F2937]">{we.itemNameAr}</td>
                        <td className="px-5 py-3.5 text-[#667085]">{we.site?.nameAr || '—'}</td>
                        <td className="px-5 py-3.5 text-[#1F2937]">
                          {Number(we.quantity)} {we.unit}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-[#18324B]">
                          {formatCurrency(Number(we.totalAmount), locale, we.currency || clientCurrency)}
                        </td>
                        <td className="px-5 py-3.5 text-[11px]">{we.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'statements' && (
          <div>
            {!client.statements || client.statements.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#667085]">
                {t('statements.noStatements')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs text-start">
                  <thead className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-[11px] text-[#667085] uppercase">
                    <tr>
                      <th className="px-5 py-3 text-start">{t('statements.statementNumber')}</th>
                      <th className="px-5 py-3 text-start">{t('common.date')}</th>
                      <th className="px-5 py-3 text-start">{t('statements.total')}</th>
                      <th className="px-5 py-3 text-start">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7EC]/70">
                    {client.statements.map((stm: any) => (
                      <tr key={stm.id} className="hover:bg-[#F5F7FA]">
                        <td className="px-5 py-3.5 font-mono text-[11px]">{stm.referenceNo}</td>
                        <td className="px-5 py-3.5 text-[#667085]" dir="ltr">
                          {new Date(stm.issueDate).toLocaleDateString(locale)}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-[#18324B]">
                          {formatCurrency(Number(stm.totalAmount), locale, stm.currency || clientCurrency)}
                        </td>
                        <td className="px-5 py-3.5 text-[11px]">{stm.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
          <div>
            {!client.invoices || client.invoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#667085]">{t('invoices.noInvoices')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs text-start">
                  <thead className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-[11px] text-[#667085] uppercase">
                    <tr>
                      <th className="px-5 py-3 text-start">{t('invoices.invoiceNumber')}</th>
                      <th className="px-5 py-3 text-start">{t('invoices.issueDate')}</th>
                      <th className="px-5 py-3 text-start">{t('invoices.total')}</th>
                      <th className="px-5 py-3 text-start">{t('invoices.amountDue')}</th>
                      <th className="px-5 py-3 text-start">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7EC]/70">
                    {client.invoices.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-[#F5F7FA]">
                        <td className="px-5 py-3.5 font-mono text-[11px]">{inv.referenceNo}</td>
                        <td className="px-5 py-3.5 text-[#667085]" dir="ltr">
                          {new Date(inv.issueDate).toLocaleDateString(locale)}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-[#18324B]">
                          {formatCurrency(Number(inv.totalAmount), locale, inv.currency || clientCurrency)}
                        </td>
                        <td className="px-5 py-3.5 text-rose-600 font-semibold">
                          {formatCurrency(Number(inv.remainingAmount), locale, inv.currency || clientCurrency)}
                        </td>
                        <td className="px-5 py-3.5 text-[11px]">{inv.paymentStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            {!client.payments || client.payments.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#667085]">{t('payments.noPayments')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs text-start">
                  <thead className="bg-[#F8FAFC] border-b border-[#E4E7EC] text-[11px] text-[#667085] uppercase">
                    <tr>
                      <th className="px-5 py-3 text-start">{t('payments.paymentDate')}</th>
                      <th className="px-5 py-3 text-start">{t('payments.invoice')}</th>
                      <th className="px-5 py-3 text-start">{t('payments.amount')}</th>
                      <th className="px-5 py-3 text-start">{t('payments.method')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7EC]/70">
                    {client.payments.map((pay: any) => (
                      <tr key={pay.id} className="hover:bg-[#F5F7FA]">
                        <td className="px-5 py-3.5 text-[#667085]" dir="ltr">
                          {new Date(pay.paymentDate).toLocaleDateString(locale)}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[11px]">
                          {pay.invoice?.referenceNo || '—'}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-emerald-700">
                          {formatCurrency(Number(pay.amount), locale, pay.currency || clientCurrency)}
                        </td>
                        <td className="px-5 py-3.5 text-[11px]">{pay.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          dir={isAr ? 'rtl' : 'ltr'}
          className="fixed inset-0 z-50 bg-[#102437]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E4E7EC] space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in-90">
            <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
              <h2 className="text-base font-bold text-[#1F2937]">{t('clients.editClient')}</h2>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-[#667085] hover:text-[#1F2937] hover:bg-[#EAF0F5] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editFormError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {editFormError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.clientName')} (العربية) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.nameAr}
                    onChange={(e) => setEditFormData({ ...editFormData, nameAr: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.clientName')} (English)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editFormData.nameEn}
                    onChange={(e) => setEditFormData({ ...editFormData, nameEn: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.clientType')}
                  </label>
                  <select
                    value={editFormData.clientType}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, clientType: e.target.value })
                    }
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
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] bg-white outline-none focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B]"
                  >
                    <option value="ACTIVE">{t('common.active')}</option>
                    <option value="INACTIVE">{t('common.dataMgmt.archived')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.phone')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.email')}
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('clients.vatNumber')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editFormData.vatNumber}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, vatNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('common.address')}
                  </label>
                  <input
                    type="text"
                    value={editFormData.address}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, address: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                    {t('common.notes')}
                  </label>
                  <textarea
                    rows={2}
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-[#E4E7EC] rounded-xl text-xs text-[#1F2937] focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E4E7EC]">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E4E7EC] text-xs font-semibold text-[#1F2937] hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-[#18324B] hover:bg-[#102437] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {updateMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Modal */}
      <RecordActionModal
        isOpen={Boolean(actionType)}
        actionType={actionType}
        recordName={isAr ? client.nameAr : client.nameEn || client.nameAr}
        recordTypeLabel={isAr ? 'العميل' : 'Client'}
        canDelete={canDelete}
        blockedReason={getDependencyReason()}
        isPending={actionMutation.isPending}
        error={actionError}
        onClose={() => {
          setActionType(null)
          setActionError(null)
        }}
        onConfirm={() => actionType && actionMutation.mutate(actionType)}
        onArchiveInstead={!isArchived ? () => setActionType('archive') : undefined}
      />
    </div>
  )
}
