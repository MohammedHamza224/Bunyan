import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  FlaskConical,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  X,
  FileText,
  Receipt,
  Wallet,
  Building,
  MapPin,
  ClipboardList,
} from 'lucide-react'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'

interface TestDataset {
  id: string
  name: string
  description?: string
  scenario: string
  status: 'ACTIVE' | 'PURGED'
  recordCount: number
  createdAt: string
  createdBy?: {
    nameAr?: string
    nameEn?: string
    email?: string
  }
  summary?: Record<string, number>
}

export function TestDataManagementTab() {
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState<
    'standard_contracting' | 'direct_invoicing' | 'unbilled_works' | 'enterprise_six_customers'
  >('enterprise_six_customers')
  const [customName, setCustomName] = useState('')
  const [customDescription, setCustomDescription] = useState('')

  const [detailsDatasetId, setDetailsDatasetId] = useState<string | null>(null)
  const [purgingDataset, setPurgingDataset] = useState<TestDataset | null>(null)

  const [notification, setNotification] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Query datasets list
  const {
    data: datasetsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['testDatasets'],
    queryFn: async () => {
      const res = await api.get('/test-data/datasets')
      return (res.data?.data || []) as TestDataset[]
    },
  })
  const datasets = datasetsData || []

  // Query single dataset details when modal open
  const { data: datasetDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['testDatasetDetails', detailsDatasetId],
    queryFn: async () => {
      if (!detailsDatasetId) return null
      const res = await api.get(`/test-data/datasets/${detailsDatasetId}`)
      return res.data?.data
    },
    enabled: !!detailsDatasetId,
  })

  // Mutation to generate dataset
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/test-data/generate', {
        scenario: selectedScenario,
        name: customName.trim() || undefined,
        description: customDescription.trim() || undefined,
      })
      return res.data?.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['testDatasets'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })

      setGenerateModalOpen(false)
      setCustomName('')
      setCustomDescription('')
      setNotification({
        type: 'success',
        message: isAr
          ? `تم إنشاء حزمة البيانات التجريبية بنجاح (${data.recordCount} سجلات مترابطة).`
          : `Test dataset generated successfully (${data.recordCount} linked records).`,
      })
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'فشل إنشاء حزمة البيانات التجريبية' : 'Failed to generate test dataset'),
      })
    },
  })

  // Mutation to purge dataset
  const purgeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/test-data/datasets/${id}/purge`)
      return res.data?.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['testDatasets'] })
      queryClient.invalidateQueries({ queryKey: ['testDatasetDetails'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })

      setPurgingDataset(null)
      setNotification({
        type: 'success',
        message: isAr
          ? `تم الحذف الآمن لسجلات الحزمة التجريبية بنجاح (تم حذف ${data.deletedCount} سجل، والبيانات الأصلية محفوظة تماماً).`
          : `Test dataset purged safely (${data.deletedCount} records deleted; real business data completely preserved).`,
      })
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف الحزمة التجريبية' : 'Failed to purge test dataset'),
      })
    },
  })

  const scenarioMeta = {
    standard_contracting: {
      titleAr: 'دورة مقاولات متكاملة (مستخلص + فاتورة + سداد جزئي)',
      titleEn: 'Full Contracting Lifecycle (Statement + Invoice + Partial Payment)',
      descAr:
        'إنشاء عميل، موقع مشروع، 3 أعمال منفذة ومعتمدة، مستخلص أعمال صادر، فاتورة ضريبية، وسند قبض بنكي جزئي.',
      descEn:
        'Creates 1 Client, 1 Site, 3 Approved Work Entries, 1 Statement, 1 Tax Invoice, and 1 Partial Payment.',
      badges: ['عميل (1)', 'موقع (1)', 'أعمال (3)', 'مستخلص (1)', 'فاتورة (1)', 'دفعة (1)'],
    },
    direct_invoicing: {
      titleAr: 'فوترة مباشرة وسداد كامل (بدون مستخلص)',
      titleEn: 'Direct Invoicing & Full Payment (No Statement)',
      descAr:
        'إنشاء عميل، موقع، عمل منفذ، فاتورة ضريبية مباشرة معتمدة، وسند قبض مسدد بالكامل.',
      descEn:
        'Creates 1 Client, 1 Site, 1 Work Entry, 1 Direct Tax Invoice, and 1 Full Payment.',
      badges: ['عميل (1)', 'موقع (1)', 'أعمال (1)', 'فاتورة (1)', 'دفعة (1)'],
    },
    unbilled_works: {
      titleAr: 'أعمال منجزة قيد الفوترة (مسودة مستخلص)',
      titleEn: 'Unbilled Approved Works (Draft Statement)',
      descAr:
        'إنشاء عميل، موقع، بندي عمل معتمدين، ومسودة مستخلص أعمال جاهزة للاعتماد والفوترة لاحقاً.',
      descEn:
        'Creates 1 Client, 1 Site, 2 Approved Work Entries, and 1 Draft Statement ready for approval.',
      badges: ['عميل (1)', 'موقع (1)', 'أعمال (2)', 'مستخلص مسودة (1)'],
    },
    enterprise_six_customers: {
      titleAr: 'حزمة المنشأة الشاملة (6 عملاء و15 مشروعاً مع كشوف الحسابات)',
      titleEn: 'Comprehensive Enterprise Suite (6 Clients, 15 Projects & Account Statements)',
      descAr:
        'إنشاء 6 عملاء مختلفين، 15 مشروعاً، 45 عملاً متنوعاً، 13 مستخلصاً، 14 فاتورة، و11 دفعة مالية تغطي كافة السيناريوهات ومطابقة كشوف الحسابات.',
      descEn:
        'Creates 6 distinct Clients, 15 Projects, 45 Work Entries, 13 Statements, 14 Invoices, and 11 Payments covering all financial and account statement scenarios.',
      badges: ['عملاء (6)', 'مشاريع (15)', 'أعمال (45)', 'مستخلصات (13)', 'فواتير (14)', 'دفعات (11)'],
    },
  }

  return (
    <div className="space-y-6" data-testid="test-data-management-tab">
      {/* Header & Overview */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isAr ? 'إدارة البيانات التجريبية' : 'Test Data Management'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr
                  ? 'إنشاء مجموعات بيانات تجريبية مترابطة تلقائياً لاختبار دورات العمل والمستندات المحاسبية وحذفها بأمان.'
                  : 'Automatically generate interconnected test datasets to test workflows and documents, and safely purge them.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            title={isAr ? 'تحديث السجلات' : 'Refresh'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid="generate-test-data-btn"
            onClick={() => setGenerateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إنشاء حزمة بيانات تجريبية' : 'Generate Test Dataset'}</span>
          </button>
        </div>
      </div>

      {/* Safety & Isolation Guarantee Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/80 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-gray-700 space-y-1">
          <p className="font-bold text-gray-900">
            {isAr
              ? 'ضمان الحماية والعزل التام للبيانات التشغيلية'
              : 'Complete Protection & Isolation of Business Data'}
          </p>
          <p className="text-gray-600 leading-relaxed">
            {isAr
              ? 'تتم فهرسة كافة السجلات التجريبية وتتبعها عبر جدول معرفات مخصص. عند طلب الحذف الآمن، يتم حذف سجلات الحزمة التجريبية المحددة فقط دون التأثير أو المساس بأي عملاء، مشاريع، أو فواتير أصلية في النظام.'
              : 'All test records are tracked via dedicated dataset mapping. Purging is strictly isolated to the selected test dataset; real business customers, projects, and invoices are never touched.'}
          </p>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Datasets Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
            {isAr ? 'سجل الحزم التجريبية المنشأة' : 'Generated Datasets History'}
          </h3>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {datasets.length} {isAr ? 'حزم' : 'datasets'}
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-gray-500">
            {isAr ? 'جارٍ تحميل الحزم التجريبية...' : 'Loading test datasets...'}
          </div>
        ) : datasets.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500 space-y-2">
            <FlaskConical className="w-8 h-8 text-gray-300 mx-auto" />
            <p>
              {isAr
                ? 'لا توجد حزم بيانات تجريبية حالياً. انقر على "إنشاء حزمة بيانات تجريبية" لإنشاء دورة عمل مترابطة.'
                : 'No test datasets currently exist. Click "Generate Test Dataset" to generate interconnected test records.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="py-2.5 px-3.5 text-start">{isAr ? 'الحزمة / السيناريو' : 'Dataset & Scenario'}</th>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'تاريخ الإنشاء' : 'Created At'}</th>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'بواسطة' : 'Created By'}</th>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'توزيع السجلات' : 'Records Distribution'}</th>
                  <th className="py-2.5 px-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-2.5 px-3.5 text-end">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {datasets.map((ds) => {
                  const meta =
                    scenarioMeta[ds.scenario as keyof typeof scenarioMeta] ||
                    scenarioMeta.standard_contracting

                  return (
                    <tr key={ds.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-gray-900">{ds.name}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {isAr ? meta.titleAr : meta.titleEn}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-gray-600 whitespace-nowrap" dir="ltr">
                        {new Date(ds.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                      </td>
                      <td className="py-3 px-3 text-gray-700">
                        {ds.createdBy?.nameAr || ds.createdBy?.nameEn || ds.createdBy?.email || '—'}
                      </td>
                      <td className="py-3 px-3">
                        {ds.status === 'ACTIVE' && ds.summary ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(ds.summary).map(([k, count]) => (
                              <span
                                key={k}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200"
                              >
                                {k}: {count}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {ds.status === 'ACTIVE' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            {isAr ? 'نشطة (متاحة في النظام)' : 'Active (Available)'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                            {isAr ? 'محذوفة بأمان' : 'Safely Purged'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailsDatasetId(ds.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                            title={isAr ? 'عرض تفاصيل وسجلات الحزمة' : 'View records and details'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isAr ? 'استعراض' : 'View'}</span>
                          </button>

                          {ds.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => setPurgingDataset(ds)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                              title={isAr ? 'حذف آمن لهذه الحزمة' : 'Safely purge dataset'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{isAr ? 'حذف آمن' : 'Purge'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Generate Test Dataset ───────────────────────────── */}
      {generateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-xl w-full p-5 shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                <FlaskConical className="w-5 h-5" />
                <span>{isAr ? 'إنشاء حزمة بيانات تجريبية جديدة' : 'Generate New Test Dataset'}</span>
              </div>
              <button
                type="button"
                onClick={() => setGenerateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Scenario Options */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">
                  {isAr ? 'اختر سيناريو دورة العمل' : 'Select Workflow Scenario'}
                </label>
                <div className="space-y-2">
                  {(
                    [
                      'enterprise_six_customers',
                      'standard_contracting',
                      'direct_invoicing',
                      'unbilled_works',
                    ] as const
                  ).map((sc) => {
                      const meta = scenarioMeta[sc]
                      const selected = selectedScenario === sc
                      return (
                        <div
                          key={sc}
                          onClick={() => setSelectedScenario(sc)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            selected
                              ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-500'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-900">
                              {isAr ? meta.titleAr : meta.titleEn}
                            </span>
                            <span
                              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                selected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                              }`}
                            >
                              {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                          </div>
                          <p className="text-gray-600 text-[11px] mt-1">
                            {isAr ? meta.descAr : meta.descEn}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {meta.badges.map((b, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700"
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    }
                  )}
                </div>
              </div>

              {/* Name & Description Inputs */}
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'اسم مخصص للحزمة (اختياري)' : 'Custom Dataset Name (Optional)'}
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={
                    isAr ? 'اتركه فارغاً للتسمية التلقائية...' : 'Leave blank for auto name...'
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  {isAr ? 'وصف أو ملاحظات (اختياري)' : 'Notes / Description (Optional)'}
                </label>
                <textarea
                  rows={2}
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder={
                    isAr
                      ? 'ملاحظات لأغراض الفحص والتدقيق...'
                      : 'Notes for testing and verification...'
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setGenerateModalOpen(false)}
                className="px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50"
              >
                {generateMutation.isPending
                  ? isAr
                    ? 'جارٍ التوليد...'
                    : 'Generating...'
                  : isAr
                  ? 'تأكيد التوليد'
                  : 'Confirm Generation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Dataset Details & Direct Links ───────────────────── */}
      {detailsDatasetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-3xl w-full p-5 shadow-2xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
                <Eye className="w-5 h-5 text-blue-600" />
                <span>
                  {isAr ? 'تفاصيل السجلات المترابطة للحزمة' : 'Dataset Records & Direct Links'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailsDatasetId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDetails ? (
              <div className="py-12 text-center text-xs text-gray-500">
                {isAr ? 'جارٍ جلب تفاصيل السجلات...' : 'Loading records details...'}
              </div>
            ) : datasetDetails ? (
              <div className="space-y-4 text-xs">
                {/* Meta Summary Card */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-gray-700">
                  <div>
                    <span className="text-[10px] text-gray-500 block">
                      {isAr ? 'اسم الحزمة' : 'Dataset'}
                    </span>
                    <span className="font-bold text-gray-900">{datasetDetails.dataset.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">
                      {isAr ? 'السيناريو' : 'Scenario'}
                    </span>
                    <span className="font-medium text-gray-800">
                      {datasetDetails.dataset.scenario}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">
                      {isAr ? 'إجمالي السجلات' : 'Records'}
                    </span>
                    <span className="font-bold text-indigo-700">
                      {datasetDetails.dataset.recordCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">
                      {isAr ? 'الحالة' : 'Status'}
                    </span>
                    <span className="font-semibold text-emerald-700">
                      {datasetDetails.dataset.status}
                    </span>
                  </div>
                </div>

                {/* Clients Section */}
                {datasetDetails.entities.clients?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                      <Building className="w-4 h-4 text-blue-600" />
                      <span>{isAr ? 'العملاء (Clients)' : 'Clients'}</span>
                    </div>
                    {datasetDetails.entities.clients.map((c: any) => (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-lg border border-gray-200 bg-white flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-gray-900">{c.nameAr}</span>
                          <span className="text-gray-500 ms-2 font-mono text-[11px]">
                            {c.vatNumber ? `(ضريبة: ${c.vatNumber})` : ''}
                          </span>
                        </div>
                        <Link
                          to={`/clients`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline text-[11px] font-semibold"
                        >
                          <span>{isAr ? 'عرض وتعديل في صفحة العملاء' : 'View in Clients'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sites Section */}
                {datasetDetails.entities.sites?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                      <span>{isAr ? 'المواقع والمشاريع (Sites / Projects)' : 'Sites / Projects'}</span>
                    </div>
                    {datasetDetails.entities.sites.map((s: any) => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded-lg border border-gray-200 bg-white flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-gray-900">{s.nameAr}</span>
                          <span className="text-gray-500 ms-2 font-mono text-[11px]">
                            ({s.referenceNo})
                          </span>
                        </div>
                        <Link
                          to={`/sites`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-emerald-600 hover:underline text-[11px] font-semibold"
                        >
                          <span>{isAr ? 'عرض وتعديل في صفحة المواقع' : 'View in Sites'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}

                {/* Work Entries Section */}
                {datasetDetails.entities.workEntries?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                      <ClipboardList className="w-4 h-4 text-amber-600" />
                      <span>{isAr ? 'الأعمال المنفذة (Work Entries)' : 'Work Entries'}</span>
                    </div>
                    <div className="space-y-1">
                      {datasetDetails.entities.workEntries.map((we: any) => (
                        <div
                          key={we.id}
                          className="p-2 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-between"
                        >
                          <div>
                            <span className="font-semibold text-gray-900">{we.itemNameAr}</span>
                            <span className="text-gray-500 ms-2 text-[11px]">
                              {we.quantity} {we.unit} × {formatCurrency(we.unitPrice, isAr ? 'ar' : 'en')} = {formatCurrency(we.totalAmount, isAr ? 'ar' : 'en')}
                            </span>
                          </div>
                          <Link
                            to={`/work-entries`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-amber-700 hover:underline text-[11px]"
                          >
                            <span>{we.referenceNo}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Statements Section */}
                {datasetDetails.entities.statements?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                      <FileText className="w-4 h-4 text-purple-600" />
                      <span>{isAr ? 'المستخلصات (Statements)' : 'Statements'}</span>
                    </div>
                    {datasetDetails.entities.statements.map((stm: any) => (
                      <div
                        key={stm.id}
                        className="p-2.5 rounded-lg border border-gray-200 bg-white flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-gray-900">{stm.referenceNo}</span>
                          <span className="text-gray-600 ms-2">
                            {stm.title} — {isAr ? 'الإجمالي:' : 'Total:'} {formatCurrency(stm.totalAmount, isAr ? 'ar' : 'en')}
                          </span>
                        </div>
                        <Link
                          to={`/statements/${stm.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-purple-700 hover:underline text-[11px] font-semibold"
                        >
                          <span>{isAr ? 'فتح المستخلص' : 'Open Statement'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}

                {/* Invoices Section */}
                {datasetDetails.entities.invoices?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                      <Receipt className="w-4 h-4 text-blue-600" />
                      <span>{isAr ? 'الفواتير الضريبية (Tax Invoices)' : 'Tax Invoices'}</span>
                    </div>
                    {datasetDetails.entities.invoices.map((inv: any) => (
                      <div
                        key={inv.id}
                        className="p-2.5 rounded-lg border border-gray-200 bg-white flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono font-bold text-gray-900">{inv.referenceNo}</span>
                          <span className="text-gray-600 ms-2 text-[11px]">
                            {isAr ? 'الإجمالي: ' : 'Total: '}{formatCurrency(inv.totalAmount, isAr ? 'ar' : 'en')} | {isAr ? 'المسدد: ' : 'Paid: '}{formatCurrency(inv.paidAmount, isAr ? 'ar' : 'en')} | {isAr ? 'المتبقي: ' : 'Remaining: '}
                            <strong className="text-rose-600">{formatCurrency(inv.remainingAmount, isAr ? 'ar' : 'en')}</strong>
                          </span>
                        </div>
                        <Link
                          to={`/invoices/${inv.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline text-[11px] font-semibold"
                        >
                          <span>{isAr ? 'فتح الفاتورة والطباعة' : 'Open & Print'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}

                {/* Payments Section */}
                {datasetDetails.entities.payments?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <span>{isAr ? 'المدفوعات وسندات القبض (Payments)' : 'Payments'}</span>
                    </div>
                    {datasetDetails.entities.payments.map((p: any) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-lg border border-gray-200 bg-white flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono font-bold text-emerald-800">
                            {p.referenceNo}
                          </span>
                          <span className="text-gray-600 ms-2 text-[11px]">
                            {isAr ? 'المبلغ: ' : 'Amount: '}<strong>{formatCurrency(p.amount, isAr ? 'ar' : 'en')}</strong> | {isAr ? 'الطريقة: ' : 'Method: '}{p.method} | {isAr ? 'الحالة: ' : 'Status: '}{' '}
                            {p.status}
                          </span>
                        </div>
                        <Link
                          to={`/payments`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline text-[11px] font-semibold"
                        >
                          <span>{isAr ? 'عرض في صفحة المدفوعات' : 'View in Payments'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end text-xs">
              <button
                type="button"
                onClick={() => setDetailsDatasetId(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Safe Purge Confirmation ─────────────────────────── */}
      {purgingDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center gap-2.5 text-red-700 font-bold text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>{isAr ? 'تأكيد الحذف الآمن للحزمة التجريبية' : 'Confirm Safe Dataset Purge'}</span>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              {isAr
                ? `أنت على وشك حذف سجلات الحزمة "${purgingDataset.name}". سيتم إزالة السجلات المرتبطة بها فقط بالترتيب الآمن، ولن يتم المساس بأي بيانات تجارية أصلية في المؤسسة.`
                : `You are about to safely purge records created by "${purgingDataset.name}". Only its tracked records will be removed; original business records will remain unaffected.`}
            </p>

            {purgingDataset.summary && (
              <div className="p-3 bg-red-50/50 rounded-lg border border-red-100 text-xs space-y-1">
                <p className="font-bold text-red-900">
                  {isAr ? 'السجلات التي سيتم حذفها:' : 'Records to be purged:'}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {Object.entries(purgingDataset.summary).map(([k, c]) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded bg-white text-red-800 font-semibold border border-red-200 text-[11px]"
                    >
                      {k}: {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPurgingDataset(null)}
                className="px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={purgeMutation.isPending}
                onClick={() => purgeMutation.mutate(purgingDataset.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50"
              >
                {purgeMutation.isPending
                  ? isAr
                    ? 'جارٍ الحذف...'
                    : 'Purging...'
                  : isAr
                  ? 'تأكيد الحذف'
                  : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
