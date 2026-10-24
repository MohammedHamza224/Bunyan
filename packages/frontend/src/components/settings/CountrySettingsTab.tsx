import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Globe2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Star,
  Edit2,
  Trash2,
  Search,
  ShieldCheck,
  Building,
  Coins,
  Percent,
  Clock,
  Phone,
  FileText,
  X,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../../lib/api'

// Pre-configured ISO 3166-1 / ISO 4217 country standards catalog
export interface PreconfiguredCountry {
  code: string
  nameAr: string
  nameEn: string
  currencyCode: string
  currencyNameAr: string
  currencyNameEn: string
  currencySymbol: string
  standardTaxRate: number
  taxLabelAr: string
  taxLabelEn: string
  crLabelAr: string
  crLabelEn: string
  timezone: string
  phoneCode: string
  electronicInvoicing: string
}

export const PRECONFIGURED_COUNTRIES: PreconfiguredCountry[] = [
  {
    code: 'SA',
    nameAr: 'المملكة العربية السعودية',
    nameEn: 'Saudi Arabia',
    currencyCode: 'SAR',
    currencyNameAr: 'ريال سعودي',
    currencyNameEn: 'Saudi Riyal',
    currencySymbol: 'ر.س',
    standardTaxRate: 15,
    taxLabelAr: 'الرقم الضريبي',
    taxLabelEn: 'Tax Identification Number (VAT)',
    crLabelAr: 'السجل التجاري',
    crLabelEn: 'Commercial Registration',
    timezone: 'Asia/Riyadh',
    phoneCode: '+966',
    electronicInvoicing: 'ZATCA_PHASE_2',
  },
  {
    code: 'AE',
    nameAr: 'الإمارات العربية المتحدة',
    nameEn: 'United Arab Emirates',
    currencyCode: 'AED',
    currencyNameAr: 'درهم إماراتي',
    currencyNameEn: 'UAE Dirham',
    currencySymbol: 'د.إ',
    standardTaxRate: 5,
    taxLabelAr: 'رقم التسجيل الضريبي (TRN)',
    taxLabelEn: 'Tax Registration Number (TRN)',
    crLabelAr: 'الرخصة التجارية',
    crLabelEn: 'Trade License Number',
    timezone: 'Asia/Dubai',
    phoneCode: '+971',
    electronicInvoicing: 'STANDARD',
  },
  {
    code: 'KW',
    nameAr: 'دولة الكويت',
    nameEn: 'Kuwait',
    currencyCode: 'KWD',
    currencyNameAr: 'دينار كويتي',
    currencyNameEn: 'Kuwaiti Dinar',
    currencySymbol: 'د.ك',
    standardTaxRate: 0,
    taxLabelAr: 'الرقم الضريبي',
    taxLabelEn: 'Tax Identification Number',
    crLabelAr: 'السجل التجاري',
    crLabelEn: 'Commercial Registration',
    timezone: 'Asia/Kuwait',
    phoneCode: '+965',
    electronicInvoicing: 'STANDARD',
  },
  {
    code: 'BH',
    nameAr: 'مملكة البحرين',
    nameEn: 'Bahrain',
    currencyCode: 'BHD',
    currencyNameAr: 'دينار بحريني',
    currencyNameEn: 'Bahraini Dinar',
    currencySymbol: 'د.ب',
    standardTaxRate: 10,
    taxLabelAr: 'رقم حساب القيمة المضافة',
    taxLabelEn: 'VAT Account Number',
    crLabelAr: 'القيد التجاري',
    crLabelEn: 'Commercial Registration',
    timezone: 'Asia/Bahrain',
    phoneCode: '+973',
    electronicInvoicing: 'STANDARD',
  },
  {
    code: 'QA',
    nameAr: 'دولة قطر',
    nameEn: 'Qatar',
    currencyCode: 'QAR',
    currencyNameAr: 'ريال قطري',
    currencyNameEn: 'Qatari Riyal',
    currencySymbol: 'ر.ق',
    standardTaxRate: 0,
    taxLabelAr: 'الرقم التعريفي الضريبي (TIN)',
    taxLabelEn: 'Tax Identification Number (TIN)',
    crLabelAr: 'السجل التجاري',
    crLabelEn: 'Commercial Registration',
    timezone: 'Asia/Qatar',
    phoneCode: '+974',
    electronicInvoicing: 'STANDARD',
  },
  {
    code: 'OM',
    nameAr: 'سلطنة عمان',
    nameEn: 'Oman',
    currencyCode: 'OMR',
    currencyNameAr: 'ريال عماني',
    currencyNameEn: 'Omani Rial',
    currencySymbol: 'ر.ع',
    standardTaxRate: 5,
    taxLabelAr: 'رقم التعريف الضريبي (VAT ID)',
    taxLabelEn: 'VAT Identification Number',
    crLabelAr: 'السجل التجاري',
    crLabelEn: 'Commercial Registration',
    timezone: 'Asia/Muscat',
    phoneCode: '+968',
    electronicInvoicing: 'STANDARD',
  },
  {
    code: 'EG',
    nameAr: 'جمهورية مصر العربية',
    nameEn: 'Egypt',
    currencyCode: 'EGP',
    currencyNameAr: 'جنيه مصري',
    currencyNameEn: 'Egyptian Pound',
    currencySymbol: 'ج.م',
    standardTaxRate: 14,
    taxLabelAr: 'رقم التسجيل الضريبي',
    taxLabelEn: 'Tax Registration Number',
    crLabelAr: 'السجل التجاري',
    crLabelEn: 'Commercial Registration',
    timezone: 'Africa/Cairo',
    phoneCode: '+20',
    electronicInvoicing: 'STANDARD',
  },
  {
    code: 'JO',
    nameAr: 'المملكة الأردنية الهاشمية',
    nameEn: 'Jordan',
    currencyCode: 'JOD',
    currencyNameAr: 'دينار أردني',
    currencyNameEn: 'Jordanian Dinar',
    currencySymbol: 'د.أ',
    standardTaxRate: 16,
    taxLabelAr: 'الرقم الضريبي',
    taxLabelEn: 'Tax Identification Number',
    crLabelAr: 'السجل التجاري',
    crLabelEn: 'Commercial Registration',
    timezone: 'Asia/Amman',
    phoneCode: '+962',
    electronicInvoicing: 'STANDARD',
  },
  {
    code: 'US',
    nameAr: 'الولايات المتحدة الأمريكية',
    nameEn: 'United States',
    currencyCode: 'USD',
    currencyNameAr: 'دولار أمريكي',
    currencyNameEn: 'US Dollar',
    currencySymbol: '$',
    standardTaxRate: 0,
    taxLabelAr: 'رقم تعريف صاحب العمل (EIN)',
    taxLabelEn: 'Employer Identification Number (EIN)',
    crLabelAr: 'رقم التسجيل التجاري',
    crLabelEn: 'Business Registration Number',
    timezone: 'America/New_York',
    phoneCode: '+1',
    electronicInvoicing: 'STANDARD',
  },
  {
    code: 'GB',
    nameAr: 'المملكة المتحدة',
    nameEn: 'United Kingdom',
    currencyCode: 'GBP',
    currencyNameAr: 'جنيه إسترليني',
    currencyNameEn: 'British Pound',
    currencySymbol: '£',
    standardTaxRate: 20,
    taxLabelAr: 'رقم تسجيل ضريبة القيمة المضافة (VRN)',
    taxLabelEn: 'VAT Registration Number (VRN)',
    crLabelAr: 'رقم السجل بالشركات',
    crLabelEn: 'Companies House Number',
    timezone: 'Europe/London',
    phoneCode: '+44',
    electronicInvoicing: 'STANDARD',
  },
]

interface CountrySettingsTabProps {
  isAr: boolean
  canManage: boolean
}

export function CountrySettingsTab({ isAr, canManage }: CountrySettingsTabProps) {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingCountry, setEditingCountry] = useState<any | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  // Form state for adding new country
  const [newCountryForm, setNewCountryForm] = useState({
    countryCode: 'AE',
    nameAr: 'الإمارات العربية المتحدة',
    nameEn: 'United Arab Emirates',
    currencyCode: 'AED',
    currencyNameAr: 'درهم إماراتي',
    currencyNameEn: 'UAE Dirham',
    currencySymbol: 'د.إ',
    standardTaxRate: '5',
    taxNumber: '',
    taxNumberLabelAr: 'رقم التسجيل الضريبي (TRN)',
    taxNumberLabelEn: 'Tax Registration Number (TRN)',
    commercialReg: '',
    commercialRegLabelAr: 'الرخصة التجارية',
    commercialRegLabelEn: 'Trade License Number',
    timezone: 'Asia/Dubai',
    dateFormat: 'DD/MM/YYYY',
    phoneCode: '+971',
    electronicInvoicingStatus: 'STANDARD',
    notes: '',
    isDefault: false,
  })

  // Query configured countries
  const { data: countries = [], isLoading } = useQuery({
    queryKey: ['orgCountries'],
    queryFn: async () => {
      const res = await api.get('/organizations/countries')
      return res.data?.data || []
    },
  })

  // Select a preset country from catalog
  const handleSelectPreset = (code: string) => {
    const preset = PRECONFIGURED_COUNTRIES.find((c) => c.code === code)
    if (preset) {
      setNewCountryForm((prev) => ({
        ...prev,
        countryCode: preset.code,
        nameAr: preset.nameAr,
        nameEn: preset.nameEn,
        currencyCode: preset.currencyCode,
        currencyNameAr: preset.currencyNameAr,
        currencyNameEn: preset.currencyNameEn,
        currencySymbol: preset.currencySymbol,
        standardTaxRate: String(preset.standardTaxRate),
        taxNumberLabelAr: preset.taxLabelAr,
        taxNumberLabelEn: preset.taxLabelEn,
        commercialRegLabelAr: preset.crLabelAr,
        commercialRegLabelEn: preset.crLabelEn,
        timezone: preset.timezone,
        phoneCode: preset.phoneCode,
        electronicInvoicingStatus: preset.electronicInvoicing,
      }))
    }
  }

  // Add country mutation
  const createCountryMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/organizations/countries', payload)
      return res.data?.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgCountries'] })
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] })
      setIsAddModalOpen(false)
      setFeedback({
        type: 'success',
        message: isAr
          ? `تمت إضافة إعدادات دولة ${data.nameAr} (${data.countryCode}) بنجاح.`
          : `Country settings for ${data.nameEn} (${data.countryCode}) added successfully.`,
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          (isAr ? 'فشلت إضافة إعدادات الدولة' : 'Failed to add country settings'),
      })
    },
  })

  // Update country mutation
  const updateCountryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/organizations/countries/${id}`, data)
      return res.data?.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgCountries'] })
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] })
      setEditingCountry(null)
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم تحديث إعدادات ${data.nameAr} بنجاح.`
          : `Updated settings for ${data.nameEn} successfully.`,
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          (isAr ? 'فشل تحديث إعدادات الدولة' : 'Failed to update country settings'),
      })
    },
  })

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/organizations/countries/${id}/set-default`)
      return res.data?.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgCountries'] })
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] })
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم تعيين ${data.nameAr} كدولة افتراضية للمنشأة بنجاح.`
          : `Set ${data.nameEn} as the default country successfully.`,
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err.response?.data?.error?.message ||
          (isAr ? 'تعذر تعيين الدولة الافتراضية' : 'Failed to set default country'),
      })
    },
  })

  // Delete country mutation
  const deleteCountryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/organizations/countries/${id}`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgCountries'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم حذف إعدادات الدولة بنجاح.' : 'Country settings removed successfully.',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف إعدادات الدولة' : 'Failed to delete country settings'),
      })
    },
  })

  const filteredCountries = countries.filter((c: any) => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return true
    return (
      c.countryCode.toLowerCase().includes(q) ||
      c.nameAr.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.currencyCode.toLowerCase().includes(q)
    )
  })

  const configuredCodes = new Set(countries.map((c: any) => c.countryCode))

  return (
    <div className="space-y-6" data-testid="country-settings-tab">
      {/* Tab Header Banner */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                <Globe2 className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">
                {isAr ? 'إعدادات الدول وإدارة العملات والضرائب' : 'Country Settings & Tax Management'}
              </h2>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed max-w-3xl">
              {isAr
                ? 'يتيح لك نظام بنيان تهيئة وإدارة دول متعددة لمعاملات المنشأة وفق المعايير الدولية (ISO 3166-1). يتم الحفاظ تلقائياً على إعدادات المملكة العربية السعودية واشتراطات هيئة الزكاة والضريبة (ZATCA)، مع دعم العملات المستقلة والضرائب الإقليمية دون التأثير على السجلات المالية التاريخية.'
                : 'Configure and manage multiple operating countries using standard ISO 3166-1 alpha-2 codes. Preserves Saudi Arabia ZATCA e-invoicing mandates while supporting regional currencies, tax identifiers, and rounding rules without affecting historical records.'}
            </p>
          </div>

          {canManage && (
            <button
              type="button"
              data-testid="add-country-btn"
              onClick={() => {
                setFeedback(null)
                // Default next country candidate not yet configured
                const candidate = PRECONFIGURED_COUNTRIES.find((c) => !configuredCodes.has(c.code))
                if (candidate) {
                  handleSelectPreset(candidate.code)
                }
                setIsAddModalOpen(true)
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة دولة جديدة' : 'Add Supported Country'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div
          role="alert"
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Overview Stats */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute top-3 text-gray-400 pointer-events-none start-3" />
          <input
            type="text"
            placeholder={isAr ? 'بحث بالدولة أو الرمز أو العملة...' : 'Search country, code, currency...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full ps-9 pe-4 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
          />
        </div>

        <div className="text-xs text-gray-500 font-medium self-end sm:self-center">
          {isAr
            ? `إجمالي الدول المهيأة: ${countries.length}`
            : `Total Configured Countries: ${countries.length}`}
        </div>
      </div>

      {/* Configured Countries Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-gray-500">
            {isAr ? 'جاري تحميل إعدادات الدول...' : 'Loading country configurations...'}
          </div>
        ) : filteredCountries.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Globe2 className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-sm font-semibold text-gray-700">
              {isAr ? 'لا توجد دول مطابقة لبحثك' : 'No matching countries found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200 font-semibold tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 text-start">{isAr ? 'الدولة والرمز' : 'Country & Code'}</th>
                  <th className="px-5 py-3.5 text-start">{isAr ? 'العملة القياسية' : 'Standard Currency'}</th>
                  <th className="px-5 py-3.5 text-start">{isAr ? 'نسبة الضريبة القياسية' : 'Standard VAT / Tax'}</th>
                  <th className="px-5 py-3.5 text-start">{isAr ? 'التسجيل التجاري والضريبي' : 'Tax & Registration'}</th>
                  <th className="px-5 py-3.5 text-start">{isAr ? 'الفوترة الإلكترونية' : 'E-Invoicing Regime'}</th>
                  <th className="px-5 py-3.5 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  {canManage && <th className="px-5 py-3.5 text-end">{isAr ? 'الإجراءات' : 'Actions'}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCountries.map((c: any) => (
                  <tr
                    key={c.id}
                    data-testid={`country-row-${c.countryCode}`}
                    className="hover:bg-gray-50/70 transition-colors"
                  >
                    {/* Country & Code */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2 py-1 rounded bg-[#18324B] text-white font-mono text-[11px] font-bold">
                          {c.countryCode}
                        </span>
                        <div>
                          <div className="font-bold text-gray-900 flex items-center gap-1.5">
                            <span>{isAr ? c.nameAr : c.nameEn}</span>
                            {c.isDefault && (
                              <span
                                title={isAr ? 'الدولة الافتراضية للمنشأة' : 'Default Organization Country'}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200"
                              >
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                {isAr ? 'افتراضية' : 'Default'}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-500">
                            {isAr ? c.nameEn : c.nameAr}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Currency */}
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-900 font-mono">
                        {c.currencyCode} ({c.currencySymbol})
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {isAr ? c.currencyNameAr : c.currencyNameEn}
                      </div>
                    </td>

                    {/* Tax Rate */}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 font-mono font-bold text-xs">
                        <Percent className="w-3 h-3 text-gray-500" />
                        {Number(c.standardTaxRate).toFixed(2)}%
                      </span>
                    </td>

                    {/* Tax & Commercial Registration */}
                    <td className="px-5 py-4 space-y-1">
                      <div>
                        <span className="text-[10px] text-gray-500 block">
                          {isAr ? c.taxNumberLabelAr : c.taxNumberLabelEn}:
                        </span>
                        <span className="font-mono font-medium text-gray-900">
                          {c.taxNumber || (
                            <span className="text-gray-400 italic">
                              {isAr ? 'غير محدد' : 'Unspecified'}
                            </span>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 block">
                          {isAr ? c.commercialRegLabelAr : c.commercialRegLabelEn}:
                        </span>
                        <span className="font-mono font-medium text-gray-900">
                          {c.commercialReg || (
                            <span className="text-gray-400 italic">
                              {isAr ? 'غير محدد' : 'Unspecified'}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* E-Invoicing */}
                    <td className="px-5 py-4">
                      {c.electronicInvoicingStatus === 'ZATCA_PHASE_2' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          ZATCA Phase 2 (هيئة الزكاة)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
                          {isAr ? 'معايير الفوترة القياسية' : 'Standard Billing'}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          c.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                      >
                        {c.isActive
                          ? isAr
                            ? 'نشطة'
                            : 'Active'
                          : isAr
                          ? 'غير نشطة'
                          : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    {canManage && (
                      <td className="px-5 py-4 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          {!c.isDefault && (
                            <button
                              type="button"
                              title={isAr ? 'تعيين كدولة افتراضية' : 'Set as default country'}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    isAr
                                      ? `هل تريد تعيين دولة ${c.nameAr} كالدولة الافتراضية للمنشأة؟`
                                      : `Set ${c.nameEn} as the default operating country?`
                                  )
                                ) {
                                  setDefaultMutation.mutate(c.id)
                                }
                              }}
                              className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            title={isAr ? 'تعديل الإعدادات' : 'Edit country settings'}
                            onClick={() => {
                              setEditingCountry({ ...c, standardTaxRate: String(c.standardTaxRate) })
                            }}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {!c.isDefault && (
                            <button
                              type="button"
                              title={isAr ? 'حذف الدولة' : 'Remove country configuration'}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    isAr
                                      ? `هل أنت متأكد من حذف إعدادات دولة ${c.nameAr}؟ لن تتأثر المعاملات أو الفواتير التاريخية السابقة.`
                                      : `Are you sure you want to delete ${c.nameEn} settings? Historical invoices will remain preserved.`
                                  )
                                ) {
                                  deleteCountryMutation.mutate(c.id)
                                }
                              }}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Country Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-gray-900">
                  {isAr ? 'إضافة دولة جديدة للنظام' : 'Add New Supported Country'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                createCountryMutation.mutate({
                  ...newCountryForm,
                  standardTaxRate: Number(newCountryForm.standardTaxRate),
                })
              }}
              className="p-6 space-y-4"
            >
              {/* Preset Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  {isAr ? 'اختر الدولة من قائمة المعايير الدولية (ISO 3166-1)' : 'Select Country from ISO Standard Catalog'}
                </label>
                <select
                  value={newCountryForm.countryCode}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  {PRECONFIGURED_COUNTRIES.map((item) => (
                    <option
                      key={item.code}
                      value={item.code}
                      disabled={configuredCodes.has(item.code)}
                    >
                      {item.code} — {item.nameAr} ({item.nameEn}) [
                      {configuredCodes.has(item.code)
                        ? isAr
                          ? 'مهيأة بالفعل'
                          : 'Already Configured'
                        : item.currencyCode}
                      ]
                    </option>
                  ))}
                </select>
              </div>

              {/* Names & Codes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'رمز الدولة (ISO 3166-1)' : 'Country Code (ISO 2-letter)'} *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={newCountryForm.countryCode}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, countryCode: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl font-mono uppercase bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'الاسم بالعربية' : 'Arabic Name'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCountryForm.nameAr}
                    onChange={(e) => setNewCountryForm({ ...newCountryForm, nameAr: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'الاسم بالإنجليزية' : 'English Name'} *
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={newCountryForm.nameEn}
                    onChange={(e) => setNewCountryForm({ ...newCountryForm, nameEn: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl"
                  />
                </div>
              </div>

              {/* Currency & Tax Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'رمز العملة (ISO 4217)' : 'Currency Code'} *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    dir="ltr"
                    value={newCountryForm.currencyCode}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, currencyCode: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'رمز العرض' : 'Currency Symbol'}
                  </label>
                  <input
                    type="text"
                    value={newCountryForm.currencySymbol}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, currencySymbol: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'اسم العملة بالعربية' : 'Currency Name (Ar)'}
                  </label>
                  <input
                    type="text"
                    value={newCountryForm.currencyNameAr}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, currencyNameAr: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'نسبة الضريبة القياسية (%)' : 'Standard Tax Rate (%)'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    required
                    dir="ltr"
                    value={newCountryForm.standardTaxRate}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, standardTaxRate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              {/* Tax & Business Registration for this country */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'الرقم الضريبي للمنشأة بهذه الدولة' : 'Tax Registration Number in this Country'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="e.g. 100234567800003"
                    value={newCountryForm.taxNumber}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, taxNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'السجل التجاري / الرخصة التجارية' : 'Commercial Registration / Trade License'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="e.g. 1010123456"
                    value={newCountryForm.commercialReg}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, commercialReg: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              {/* Regional Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'المنطقة الزمنية' : 'Timezone'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newCountryForm.timezone}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, timezone: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'مفتاح الاتصال الدولي' : 'Phone Country Code'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newCountryForm.phoneCode}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, phoneCode: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'نظام الفوترة الإلكترونية' : 'E-Invoicing Framework'}
                  </label>
                  <select
                    value={newCountryForm.electronicInvoicingStatus}
                    onChange={(e) =>
                      setNewCountryForm({
                        ...newCountryForm,
                        electronicInvoicingStatus: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl bg-white"
                  >
                    <option value="STANDARD">{isAr ? 'معايير الفوترة القياسية' : 'Standard Billing'}</option>
                    <option value="ZATCA_PHASE_2">ZATCA Phase 2 (السعودية فقط)</option>
                  </select>
                </div>
              </div>

              {/* Set as default checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newCountryForm.isDefault}
                    onChange={(e) =>
                      setNewCountryForm({ ...newCountryForm, isDefault: e.target.checked })
                    }
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-gray-800">
                    {isAr ? 'تعيين هذه الدولة كدولة افتراضية للمنشأة' : 'Designate as Default Organization Country'}
                  </span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-xs font-semibold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createCountryMutation.isPending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {createCountryMutation.isPending
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ الدولة'
                    : 'Save Country'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Country Modal */}
      {editingCountry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  {isAr
                    ? `تعديل إعدادات ${editingCountry.nameAr} (${editingCountry.countryCode})`
                    : `Edit Settings for ${editingCountry.nameEn} (${editingCountry.countryCode})`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCountry(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                updateCountryMutation.mutate({
                  id: editingCountry.id,
                  data: {
                    nameAr: editingCountry.nameAr,
                    nameEn: editingCountry.nameEn,
                    standardTaxRate: Number(editingCountry.standardTaxRate),
                    taxNumber: editingCountry.taxNumber,
                    taxNumberLabelAr: editingCountry.taxNumberLabelAr,
                    taxNumberLabelEn: editingCountry.taxNumberLabelEn,
                    commercialReg: editingCountry.commercialReg,
                    commercialRegLabelAr: editingCountry.commercialRegLabelAr,
                    commercialRegLabelEn: editingCountry.commercialRegLabelEn,
                    currencySymbol: editingCountry.currencySymbol,
                    timezone: editingCountry.timezone,
                    phoneCode: editingCountry.phoneCode,
                    isActive: editingCountry.isActive,
                    notes: editingCountry.notes,
                  },
                })
              }}
              className="p-6 space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'نسبة الضريبة القياسية (%)' : 'Standard Tax Rate (%)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  dir="ltr"
                  value={editingCountry.standardTaxRate}
                  onChange={(e) =>
                    setEditingCountry({ ...editingCountry, standardTaxRate: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? editingCountry.taxNumberLabelAr : editingCountry.taxNumberLabelEn}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editingCountry.taxNumber || ''}
                  onChange={(e) =>
                    setEditingCountry({ ...editingCountry, taxNumber: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? editingCountry.commercialRegLabelAr : editingCountry.commercialRegLabelEn}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editingCountry.commercialReg || ''}
                  onChange={(e) =>
                    setEditingCountry({ ...editingCountry, commercialReg: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr ? 'المنطقة الزمنية' : 'Timezone'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editingCountry.timezone || ''}
                    onChange={(e) =>
                      setEditingCountry({ ...editingCountry, timezone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {isAr ? 'رمز العملة للعرض' : 'Currency Symbol'}
                  </label>
                  <input
                    type="text"
                    value={editingCountry.currencySymbol || ''}
                    onChange={(e) =>
                      setEditingCountry({ ...editingCountry, currencySymbol: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  />
                </div>
              </div>

              {!editingCountry.isDefault && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingCountry.isActive}
                      onChange={(e) =>
                        setEditingCountry({ ...editingCountry, isActive: e.target.checked })
                      }
                      className="rounded text-blue-600"
                    />
                    <span className="font-semibold text-gray-800">
                      {isAr ? 'تفعيل الدولة في النظام' : 'Country is Active'}
                    </span>
                  </label>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingCountry(null)}
                  className="px-4 py-2 border border-gray-300 font-semibold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateCountryMutation.isPending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {updateCountryMutation.isPending
                    ? isAr
                      ? 'جاري التحديث...'
                      : 'Updating...'
                    : isAr
                    ? 'تحديث الإعدادات'
                    : 'Update Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
