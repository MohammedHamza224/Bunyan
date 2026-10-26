import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  Activity,
  Globe2,
  CreditCard,
  Ruler,
  FlaskConical,
  Upload,
  Trash2,
  Image as ImageIcon,
  Loader2,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import { AuditLogSettingsTab } from '../../components/settings/AuditLogSettingsTab'
import { CountrySettingsTab } from '../../components/settings/CountrySettingsTab'
import { BankAccountSettingsTab } from '../../components/settings/BankAccountSettingsTab'
import { UnitsSettingsTab } from '../../components/settings/UnitsSettingsTab'
import { UsersManagementTab } from '../../components/settings/UsersManagementTab'
import { TestDataManagementTab } from '../../components/settings/TestDataManagementTab'

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'
  const canManage = hasPermission('MANAGE_SETTINGS')

  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const validTabs = ['org', 'countries', 'banks', 'units', 'users', 'audit', 'testData']
  const [activeTab, setActiveTab] = useState<'org' | 'countries' | 'banks' | 'units' | 'users' | 'audit' | 'testData'>(
    tabParam && validTabs.includes(tabParam) ? (tabParam as any) : 'org'
  )

  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam as any)
    }
  }, [tabParam])

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Company Logo State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isRemovingLogo, setIsRemovingLogo] = useState(false)

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null)
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setLogoError(t('settings.invalidLogoType'))
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      setLogoError(t('settings.invalidLogoSize'))
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedFile(file)
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
  }

  const handleCancelSelectedFile = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl(null)
    setLogoError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDirectUploadLogo = async () => {
    if (!selectedFile) return
    setIsUploadingLogo(true)
    setLogoError(null)
    try {
      const uploadData = new FormData()
      uploadData.append('logo', selectedFile)
      const res = await api.post('/organizations/logo', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const newLogoUrl = res.data?.data?.logoUrl || res.data?.logoUrl
      setFormData((prev) => ({ ...prev, logoUrl: newLogoUrl }))
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
      setSelectedFile(null)
      setPreviewUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] })
      setStatusMsg({ type: 'success', text: t('settings.logoUploadedSuccess') })
    } catch (err: any) {
      setLogoError(err?.response?.data?.error?.message || err.message || t('errors.serverError'))
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    setIsRemovingLogo(true)
    setLogoError(null)
    try {
      await api.delete('/organizations/logo')
      setFormData((prev) => ({ ...prev, logoUrl: '' }))
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
      setSelectedFile(null)
      setPreviewUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] })
      setStatusMsg({ type: 'success', text: t('settings.logoRemovedSuccess') })
    } catch (err: any) {
      setLogoError(err?.response?.data?.error?.message || err.message || t('errors.serverError'))
    } finally {
      setIsRemovingLogo(false)
    }
  }

  // Organization Settings State
  const [formData, setFormData] = useState({
    businessName: '',
    businessNameEn: '',
    logoUrl: '',
    phone: '',
    email: '',
    website: '',
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
        website: settings.website || '',
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

  const handleSaveOrgSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatusMsg(null)
    setLogoError(null)

    let finalLogoUrl = formData.logoUrl.trim() || null

    if (selectedFile) {
      try {
        setIsUploadingLogo(true)
        const uploadData = new FormData()
        uploadData.append('logo', selectedFile)
        const res = await api.post('/organizations/logo', uploadData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        finalLogoUrl = res.data?.data?.logoUrl || res.data?.logoUrl || finalLogoUrl
        if (previewUrl && previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrl)
        }
        setSelectedFile(null)
        setPreviewUrl(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } catch (err: any) {
        setIsUploadingLogo(false)
        const msg = err?.response?.data?.error?.message || err.message || t('errors.serverError')
        setLogoError(msg)
        setStatusMsg({ type: 'error', text: msg })
        return
      } finally {
        setIsUploadingLogo(false)
      }
    }

    const websiteTrimmed = formData.website.trim()
    if (websiteTrimmed) {
      try {
        const parsed = new URL(websiteTrimmed)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error()
        }
      } catch {
        const msg = isAr
          ? 'الرجاء إدخال رابط موقع إلكتروني صالح يبدأ بـ http:// أو https:// (مثال: https://example.com)'
          : 'Please enter a valid website URL starting with http:// or https:// (e.g. https://example.com)'
        setStatusMsg({ type: 'error', text: msg })
        return
      }
    }

    saveSettingsMutation.mutate({
      businessName: formData.businessName.trim() || null,
      businessNameEn: formData.businessNameEn.trim() || null,
      logoUrl: finalLogoUrl,
      phone: formData.phone.trim() || null,
      email: formData.email.trim() || null,
      website: websiteTrimmed || null,
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
            <>
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
              <button
                type="button"
                data-testid="test-data-settings-tab-btn"
                onClick={() => {
                  setActiveTab('testData')
                  setStatusMsg(null)
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'testData'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FlaskConical className="w-4 h-4" />
                <span>{isAr ? 'إدارة البيانات التجريبية' : 'Test Data Management'}</span>
              </button>
            </>
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

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('settings.logo')}
                  </label>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="company-logo-file-input"
                    data-testid="company-logo-file-input"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!canManage || isUploadingLogo || isRemovingLogo}
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {/* Logo Display / Upload Container */}
                  <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/60 flex flex-col sm:flex-row items-center gap-5">
                    {/* Logo Preview Area */}
                    <div className="relative w-28 h-28 shrink-0 bg-white border border-gray-200 rounded-xl flex items-center justify-center p-2 shadow-2xs overflow-hidden">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Selected Logo Preview"
                          data-testid="logo-preview-img"
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : formData.logoUrl ? (
                        <img
                          src={formData.logoUrl}
                          alt="Current Company Logo"
                          data-testid="logo-current-img"
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400 text-center p-2">
                          <ImageIcon className="w-8 h-8 mb-1 text-gray-300" />
                          <span className="text-[11px] leading-tight">
                            {isAr ? 'لا يوجد شعار' : 'No Logo'}
                          </span>
                        </div>
                      )}

                      {(isUploadingLogo || isRemovingLogo) && (
                        <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Controls & Instructions */}
                    <div className="flex-1 space-y-2.5 text-center sm:text-start">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                          <span className="text-sm font-semibold text-gray-900">
                            {previewUrl
                              ? isAr
                                ? 'تم تحديد صورة جديدة'
                                : 'New image selected'
                              : formData.logoUrl
                              ? isAr
                                ? 'شعار الشركة الحالي'
                                : 'Current Company Logo'
                              : isAr
                              ? 'إضافة شعار الشركة'
                              : 'Add Company Logo'}
                          </span>
                          {previewUrl && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              {isAr ? 'معاينة غير محفوظة' : 'Unsaved preview'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {t('settings.logoUploadHelp')}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2.5 justify-center sm:justify-start">
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploadingLogo || isRemovingLogo}
                              data-testid="select-logo-btn"
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>
                                {formData.logoUrl || previewUrl
                                  ? t('settings.changeLogo')
                                  : t('settings.uploadLogo')}
                              </span>
                            </button>

                            {selectedFile && (
                              <>
                                <button
                                  type="button"
                                  onClick={handleDirectUploadLogo}
                                  disabled={isUploadingLogo}
                                  data-testid="upload-logo-confirm-btn"
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  {isUploadingLogo ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  <span>{isAr ? 'تأكيد الرفع' : 'Confirm Upload'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={handleCancelSelectedFile}
                                  disabled={isUploadingLogo}
                                  data-testid="cancel-logo-selection-btn"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-gray-500 hover:text-gray-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
                                </button>
                              </>
                            )}

                            {(formData.logoUrl || previewUrl) && !selectedFile && (
                              <button
                                type="button"
                                onClick={handleRemoveLogo}
                                disabled={isRemovingLogo || isUploadingLogo}
                                data-testid="remove-logo-btn"
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {isRemovingLogo ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                                <span>{t('settings.removeLogo')}</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* Error Message if any */}
                      {logoError && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium" data-testid="logo-error-msg">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{logoError}</span>
                        </div>
                      )}
                    </div>
                  </div>
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
                    data-testid="company-phone-input"
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

                <div>
                  <label htmlFor="companyWebsite" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.companyWebsite')}
                  </label>
                  <input
                    id="companyWebsite"
                    data-testid="company-website-input"
                    type="url"
                    dir="ltr"
                    disabled={!canManage}
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://example.com"
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
        <UsersManagementTab isAr={isAr} canManage={canManage} />
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

      {activeTab === 'testData' && canManage && (
        <TestDataManagementTab />
      )}
    </div>
  )
}
