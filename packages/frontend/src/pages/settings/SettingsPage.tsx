import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Shield, Users, Plus, CheckCircle2, AlertCircle, UserX, Activity, Trash2, Globe2, CreditCard, Ruler } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { AuditLogSettingsTab } from '../../components/settings/AuditLogSettingsTab'
import { CountrySettingsTab } from '../../components/settings/CountrySettingsTab'
import { BankAccountSettingsTab } from '../../components/settings/BankAccountSettingsTab'
import { UnitsSettingsTab } from '../../components/settings/UnitsSettingsTab'

const ALL_PERMISSIONS_LIST = [
  { key: 'VIEW_DATA', ar: 'عرض البيانات', en: 'View Data' },
  { key: 'CREATE_WORK', ar: 'تسجيل الأعمال', en: 'Register Works' },
  { key: 'APPROVE_WORK', ar: 'اعتماد الأعمال', en: 'Approve Works' },
  { key: 'CREATE_STATEMENTS', ar: 'إنشاء المستخلصات', en: 'Create Statements' },
  { key: 'ISSUE_INVOICES', ar: 'إصدار الفواتير', en: 'Issue Invoices' },
  { key: 'RECORD_PAYMENTS', ar: 'تسجيل المدفوعات', en: 'Record Payments' },
  { key: 'MANAGE_SETTINGS', ar: 'إدارة الإعدادات والمستخدمين', en: 'Manage Settings & Users' },
]

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'
  const canManage = hasPermission('MANAGE_SETTINGS')

  const [activeTab, setActiveTab] = useState<'org' | 'countries' | 'banks' | 'units' | 'users' | 'audit'>('org')
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Organization Settings State
  const [formData, setFormData] = useState({
    businessName: '',
    businessNameEn: '',
    logoUrl: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    vatNumber: '',
    commercialReg: '',
    defaultLanguage: 'ar',
    defaultCurrency: 'SAR',
    vatRate: '15',
    invoicePrefix: 'INV',
    statementPrefix: 'STM',
    workEntryPrefix: 'WRK',
    selfApprovalAllowed: true,
  })

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['orgSettings'],
    queryFn: async () => {
      const res = await api.get('/organizations/settings')
      return res.data?.data || res.data
    },
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        businessName: settings.businessName || '',
        businessNameEn: settings.businessNameEn || '',
        logoUrl: settings.logoUrl || '',
        phone: settings.phone || '',
        email: settings.email || '',
        address: settings.address || '',
        city: settings.city || '',
        vatNumber: settings.vatNumber || '',
        commercialReg: settings.commercialReg || '',
        defaultLanguage: settings.defaultLanguage || 'ar',
        defaultCurrency: settings.defaultCurrency || 'SAR',
        vatRate: String(settings.vatRate ?? '15'),
        invoicePrefix: settings.invoicePrefix || 'INV',
        statementPrefix: settings.statementPrefix || 'STM',
        workEntryPrefix: settings.workEntryPrefix || 'WRK',
        selfApprovalAllowed: settings.selfApprovalAllowed ?? true,
      })
    }
  }, [settings])

  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put('/organizations/settings', payload)
      return res.data?.data || res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] })
      setStatusMsg({ type: 'success', text: t('settings.savedSuccess') })
    },
    onError: (err: any) => {
      setStatusMsg({
        type: 'error',
        text: err?.response?.data?.error?.message || t('errors.serverError'),
      })
    },
  })

  const handleSaveOrgSettings = (e: React.FormEvent) => {
    e.preventDefault()
    setStatusMsg(null)
    saveSettingsMutation.mutate({
      businessName: formData.businessName.trim() || null,
      businessNameEn: formData.businessNameEn.trim() || null,
      logoUrl: formData.logoUrl.trim() || null,
      phone: formData.phone.trim() || null,
      email: formData.email.trim() || null,
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      vatNumber: formData.vatNumber.trim() || null,
      commercialReg: formData.commercialReg.trim() || null,
      defaultLanguage: formData.defaultLanguage,
      defaultCurrency: formData.defaultCurrency,
      vatRate: Number(formData.vatRate),
      invoicePrefix: formData.invoicePrefix.trim() || 'INV',
      statementPrefix: formData.statementPrefix.trim() || 'STM',
      workEntryPrefix: formData.workEntryPrefix.trim() || 'WRK',
      selfApprovalAllowed: formData.selfApprovalAllowed,
    })
  }

  // Users Management State
  const { data: usersList, isLoading: loadingUsers } = useQuery({
    queryKey: ['orgUsers'],
    queryFn: async () => {
      const res = await api.get('/organizations/users')
      return res.data?.data || res.data
    },
    enabled: activeTab === 'users',
  })

  const [newUser, setNewUser] = useState({
    nameAr: '',
    nameEn: '',
    email: '',
    password: '',
    role: 'ORG_STAFF',
    permissions: ['VIEW_DATA', 'CREATE_WORK'] as string[],
  })

  const createUserMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/organizations/users', payload)
      return res.data?.data || res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgUsers'] })
      setNewUser({
        nameAr: '',
        nameEn: '',
        email: '',
        password: '',
        role: 'ORG_STAFF',
        permissions: ['VIEW_DATA', 'CREATE_WORK'],
      })
      setStatusMsg({
        type: 'success',
        text: isAr ? 'تمت إضافة المستخدم بنجاح' : 'User added successfully',
      })
    },
    onError: (err: any) => {
      setStatusMsg({
        type: 'error',
        text: err?.response?.data?.error?.message || t('errors.serverError'),
      })
    },
  })

  const deactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/organizations/users/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgUsers'] })
    },
  })

  const deleteUserPermanentMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/organizations/users/${userId}?permanent=true`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgUsers'] })
      setStatusMsg({
        type: 'success',
        text: isAr ? 'تم حذف المستخدم نهائياً بنجاح' : 'User deleted permanently',
      })
    },
    onError: (err: any) => {
      setStatusMsg({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف المستخدم' : 'Failed to delete user'),
      })
    },
  })

  const toggleNewUserPerm = (perm: string) => {
    setNewUser((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>

        <div className="inline-flex rounded-xl bg-gray-200/70 p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('org')
              setStatusMsg(null)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'org' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>{t('settings.businessInfo')}</span>
          </button>
          <button
            type="button"
            data-testid="country-settings-tab-btn"
            onClick={() => {
              setActiveTab('countries')
              setStatusMsg(null)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'countries'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Globe2 className="w-4 h-4" />
            <span>{isAr ? 'إعدادات الدول' : 'Country Settings'}</span>
          </button>
          <button
            type="button"
            data-testid="bank-settings-tab-btn"
            onClick={() => {
              setActiveTab('banks')
              setStatusMsg(null)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'banks'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>{isAr ? 'الحسابات البنكية' : 'Bank Accounts'}</span>
          </button>
          <button
            type="button"
            data-testid="units-settings-tab-btn"
            onClick={() => {
              setActiveTab('units')
              setStatusMsg(null)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'units'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Ruler className="w-4 h-4" />
            <span>{isAr ? 'وحدات القياس' : 'Units of Measure'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('users')
              setStatusMsg(null)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{t('settings.users')}</span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('audit')
                setStatusMsg(null)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'audit'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>{isAr ? 'سجل العمليات والأرشفة' : 'Audit Log & Retention'}</span>
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center gap-2.5 text-sm ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {activeTab === 'org' && (
        loadingSettings ? (
          <div className="py-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSaveOrgSettings} className="space-y-6">
            {/* Business Identity */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900 border-b border-gray-100 pb-3">
                {t('settings.businessInfo')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.businessName')} (العربية)
                  </label>
                  <input
                    id="businessName"
                    type="text"
                    disabled={!canManage}
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    placeholder={isAr ? 'يُترك فارغًا حتى إدخال الاسم الرسمي' : 'Official Arabic business name'}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="businessNameEn" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.businessName')} (English)
                  </label>
                  <input
                    id="businessNameEn"
                    type="text"
                    dir="ltr"
                    disabled={!canManage}
                    value={formData.businessNameEn}
                    onChange={(e) => setFormData({ ...formData, businessNameEn: e.target.value })}
                    placeholder="Official English business name"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="logoUrl" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.logo')} (URL)
                  </label>
                  <input
                    id="logoUrl"
                    type="url"
                    dir="ltr"
                    disabled={!canManage}
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="vatNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.vatNumber')}
                  </label>
                  <input
                    id="vatNumber"
                    type="text"
                    dir="ltr"
                    disabled={!canManage}
                    value={formData.vatNumber}
                    onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                    placeholder="300000000000003"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.businessPhone')}
                  </label>
                  <input
                    id="phone"
                    type="text"
                    dir="ltr"
                    disabled={!canManage}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="businessEmail" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.businessEmail')}
                  </label>
                  <input
                    id="businessEmail"
                    type="email"
                    dir="ltr"
                    disabled={!canManage}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.businessAddress')}
                  </label>
                  <input
                    id="address"
                    type="text"
                    disabled={!canManage}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>

            {/* Localization, Currency & Tax */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900 border-b border-gray-100 pb-3">
                {t('settings.localization')} & {t('settings.taxSettings')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="defaultLanguage" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.defaultLanguage')}
                  </label>
                  <select
                    id="defaultLanguage"
                    disabled={!canManage}
                    value={formData.defaultLanguage}
                    onChange={(e) => setFormData({ ...formData, defaultLanguage: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100"
                  >
                    <option value="ar">العربية (RTL)</option>
                    <option value="en">English (LTR)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="defaultCurrency" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.currency')}
                  </label>
                  <select
                    id="defaultCurrency"
                    disabled={!canManage}
                    value={formData.defaultCurrency}
                    onChange={(e) => setFormData({ ...formData, defaultCurrency: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100"
                  >
                    <option value="SAR">SAR — {isAr ? 'الريال السعودي' : 'Saudi Riyal'}</option>
                    <option value="AED">AED — {isAr ? 'الدرهم الإماراتي' : 'UAE Dirham'}</option>
                    <option value="KWD">KWD — {isAr ? 'الدينار الكويتي' : 'Kuwaiti Dinar'}</option>
                    <option value="BHD">BHD — {isAr ? 'الدينار البحريني' : 'Bahraini Dinar'}</option>
                    <option value="QAR">QAR — {isAr ? 'الريال القطري' : 'Qatari Riyal'}</option>
                    <option value="OMR">OMR — {isAr ? 'الريال العماني' : 'Omani Rial'}</option>
                    <option value="EGP">EGP — {isAr ? 'الجنيه المصري' : 'Egyptian Pound'}</option>
                    <option value="JOD">JOD — {isAr ? 'الدينار الأردني' : 'Jordanian Dinar'}</option>
                    <option value="USD">USD — {isAr ? 'الدولار الأمريكي' : 'US Dollar'}</option>
                    <option value="EUR">EUR — {isAr ? 'اليورو' : 'Euro'}</option>
                    <option value="GBP">GBP — {isAr ? 'الجنيه الإسترليني' : 'British Pound'}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="vatRate" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.vatRate')} (%)
                  </label>
                  <input
                    id="vatRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    dir="ltr"
                    disabled={!canManage}
                    value={formData.vatRate}
                    onChange={(e) => setFormData({ ...formData, vatRate: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <input
                  id="selfApprovalAllowed"
                  type="checkbox"
                  disabled={!canManage}
                  checked={formData.selfApprovalAllowed}
                  onChange={(e) =>
                    setFormData({ ...formData, selfApprovalAllowed: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
                <div>
                  <label htmlFor="selfApprovalAllowed" className="text-sm font-medium text-gray-800">
                    {t('settings.selfApproval')}
                  </label>
                  <p className="text-xs text-gray-500">{t('settings.selfApprovalDesc')}</p>
                </div>
              </div>
            </div>

            {canManage && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saveSettingsMutation.isPending}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {saveSettingsMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            )}
          </form>
        )
      )}

      {activeTab === 'countries' && (
        <CountrySettingsTab isAr={isAr} canManage={canManage} />
      )}

      {activeTab === 'banks' && (
        <BankAccountSettingsTab isAr={isAr} canManage={canManage} />
      )}

      {activeTab === 'users' && (
        /* Users & Granular Permissions Tab */
        <div className="space-y-6">
          {canManage && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                <Plus className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">{t('settings.addUser')}</h2>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setStatusMsg(null)
                  createUserMutation.mutate(newUser)
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('settings.nameAr')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={newUser.nameAr}
                      onChange={(e) => setNewUser({ ...newUser, nameAr: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('auth.email')} *
                    </label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('auth.password')} *
                    </label>
                    <input
                      type="password"
                      required
                      dir="ltr"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('settings.userRole')}
                    </label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      <option value="ORG_STAFF">{t('settings.user')}</option>
                      <option value="ORG_MANAGER">{t('settings.manager')}</option>
                      <option value="ORG_ADMIN">{t('settings.orgAdmin')}</option>
                    </select>
                  </div>
                </div>

                {/* Granular Permissions Selection */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <span>{isAr ? 'الصلاحيات المخصصة للمستخدم' : 'Customizable User Permissions'}</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {ALL_PERMISSIONS_LIST.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer text-xs font-medium text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={
                            newUser.role === 'ORG_ADMIN' || newUser.permissions.includes(perm.key)
                          }
                          disabled={newUser.role === 'ORG_ADMIN'}
                          onChange={() => toggleNewUserPerm(perm.key)}
                          className="rounded text-blue-600"
                        />
                        <span>{isAr ? perm.ar : perm.en}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={createUserMutation.isPending}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
                  >
                    {createUserMutation.isPending ? t('common.loading') : t('settings.addUser')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">{t('settings.users')}</h2>
            </div>

            {loadingUsers ? (
              <div className="p-8 text-center text-sm text-gray-500">{t('common.loading')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-start">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-start">{t('common.name')}</th>
                      <th className="px-6 py-3 text-start">{t('common.email')}</th>
                      <th className="px-6 py-3 text-start">{t('settings.userRole')}</th>
                      <th className="px-6 py-3 text-start">{t('common.status')}</th>
                      {canManage && <th className="px-6 py-3 text-end">{t('common.actions')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(usersList || []).map((u: any) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3.5 font-medium text-gray-900">{u.nameAr}</td>
                        <td className="px-6 py-3.5 text-gray-600" dir="ltr">
                          {u.email}
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              u.isActive
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {u.isActive ? t('common.active') : t('common.inactive')}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-6 py-3.5 text-end">
                            {u.id !== user?.id && u.isActive && (
                              <button
                                type="button"
                                onClick={() => deactivateUserMutation.mutate(u.id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                              >
                                <UserX className="w-4 h-4" />
                                <span>{isAr ? 'تعطيل' : 'Deactivate'}</span>
                              </button>
                            )}
                            {u.id !== user?.id && !u.isActive && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      isAr
                                        ? `هل أنت متأكد من الحذف النهائي للمستخدم ${u.email}؟ لا يمكن حذف المستخدم إلا إذا لم يكن له أي سجلات نشاط سابقة في النظام.`
                                        : `Are you sure you want to permanently delete user ${u.email}? This is only permitted if they have zero historical activity.`
                                    )
                                  ) {
                                    deleteUserPermanentMutation.mutate(u.id)
                                  }
                                }}
                                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>{isAr ? 'حذف نهائي' : 'Delete'}</span>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'units' && (
        <UnitsSettingsTab
          isAr={isAr}
          canManage={canManage}
        />
      )}

      {activeTab === 'audit' && (
        <AuditLogSettingsTab
          isAr={isAr}
          isAdmin={user?.role === 'ORG_ADMIN'}
        />
      )}
    </div>
  )
}
