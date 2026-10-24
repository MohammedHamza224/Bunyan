import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Star,
  Edit2,
  Trash2,
  Check,
  X,
  CreditCard,
  Copy,
  ShieldCheck,
} from 'lucide-react'
import { api } from '../../lib/api'

interface BankAccountSettingsTabProps {
  isAr: boolean
  canManage: boolean
}

export function BankAccountSettingsTab({ isAr, canManage }: BankAccountSettingsTabProps) {
  const queryClient = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<any | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Form State
  const [form, setForm] = useState({
    bankNameAr: '',
    bankNameEn: '',
    beneficiaryNameAr: '',
    beneficiaryNameEn: '',
    iban: '',
    accountNumber: '',
    currency: 'SAR',
    branch: '',
    swiftCode: '',
    isDefault: false,
    isActive: true,
    notes: '',
  })

  // Query bank accounts
  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['orgBankAccounts'],
    queryFn: async () => {
      const res = await api.get('/organizations/bank-accounts')
      return res.data?.data || []
    },
  })
  const accounts = Array.isArray(accountsData) ? accountsData : []

  // Create / Update Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingAccount) {
        return api.put(`/organizations/bank-accounts/${editingAccount.id}`, payload)
      } else {
        return api.post('/organizations/bank-accounts', payload)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgBankAccounts'] })
      queryClient.invalidateQueries({ queryKey: ['companyReceivingBankAccounts'] })
      setModalOpen(false)
      setEditingAccount(null)
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم حفظ بيانات الحساب البنكي بنجاح'
          : 'Bank account saved successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isAr ? 'فشل حفظ الحساب البنكي' : 'Failed to save bank account'),
      })
    },
  })

  // Set Default Mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.put(`/organizations/bank-accounts/${id}/set-default`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgBankAccounts'] })
      queryClient.invalidateQueries({ queryKey: ['companyReceivingBankAccounts'] })
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم تعيين الحساب كحساب رئيسي بنجاح'
          : 'Default receiving bank account updated successfully',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر تعيين الحساب الرئيسي' : 'Failed to set default account'),
      })
    },
  })

  // Toggle Active Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return api.put(`/organizations/bank-accounts/${id}`, { isActive })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgBankAccounts'] })
      queryClient.invalidateQueries({ queryKey: ['companyReceivingBankAccounts'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم تحديث حالة الحساب' : 'Account status updated',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || 'Error updating status',
      })
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/organizations/bank-accounts/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgBankAccounts'] })
      queryClient.invalidateQueries({ queryKey: ['companyReceivingBankAccounts'] })
      setFeedback({
        type: 'success',
        message: isAr ? 'تم حذف الحساب البنكي بنجاح' : 'Bank account deleted',
      })
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف الحساب' : 'Failed to delete bank account'),
      })
    },
  })

  const openCreateModal = () => {
    setEditingAccount(null)
    setForm({
      bankNameAr: '',
      bankNameEn: '',
      beneficiaryNameAr: '',
      beneficiaryNameEn: '',
      iban: 'SA',
      accountNumber: '',
      currency: 'SAR',
      branch: '',
      swiftCode: '',
      isDefault: accounts.length === 0,
      isActive: true,
      notes: '',
    })
    setModalOpen(true)
  }

  const openEditModal = (acc: any) => {
    setEditingAccount(acc)
    setForm({
      bankNameAr: acc.bankNameAr,
      bankNameEn: acc.bankNameEn,
      beneficiaryNameAr: acc.beneficiaryNameAr,
      beneficiaryNameEn: acc.beneficiaryNameEn,
      iban: acc.iban,
      accountNumber: acc.accountNumber || '',
      currency: acc.currency || 'SAR',
      branch: acc.branch || '',
      swiftCode: acc.swiftCode || '',
      isDefault: acc.isDefault,
      isActive: acc.isActive,
      notes: acc.notes || '',
    })
    setModalOpen(true)
  }

  const handleCopyIban = (iban: string, id: string) => {
    navigator.clipboard.writeText(iban)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6" data-testid="bank-accounts-settings-tab">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isAr ? 'الحسابات البنكية لاستقبال الدفعات' : 'Company Receiving Bank Accounts'}
              </h2>
              <p className="text-xs text-gray-500">
                {isAr
                  ? 'إدارة الحسابات البنكية المعتمدة للشركة التي تُعرض في الفواتير وتُستخدم لتسجيل الحوالات'
                  : 'Manage company receiving bank accounts displayed on invoices and used for payments'}
              </p>
            </div>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              data-testid="add-bank-account-btn"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة حساب بنكي جديد' : 'Add Bank Account'}</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Accounts List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-900">
              {isAr ? 'قائمة الحسابات البنكية المعتمدة' : 'Registered Bank Accounts'}
            </h3>
          </div>
          <span className="text-xs font-mono text-gray-500">
            {isAr ? `إجمالي الحسابات: ${accounts.length}` : `Total Accounts: ${accounts.length}`}
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-gray-400">
            {isAr ? 'جارٍ تحميل الحسابات البنكية...' : 'Loading bank accounts...'}
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500 space-y-3">
            <Building2 className="w-8 h-8 text-gray-300 mx-auto" />
            <p>
              {isAr
                ? 'لا توجد حسابات بنكية مضافة حالياً. أضف حساب الشركة الرئيسي ليظهر في الفواتير.'
                : 'No bank accounts registered. Add a company account to display on invoices.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc: any) => (
              <div
                key={acc.id}
                className={`p-4 rounded-xl border transition-all space-y-3 ${
                  acc.isDefault
                    ? 'border-blue-300 bg-blue-50/30 shadow-xs'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-gray-900">
                        {isAr ? acc.bankNameAr : acc.bankNameEn || acc.bankNameAr}
                      </h4>
                      {acc.isDefault && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                          <Star className="w-3 h-3 fill-blue-600 text-blue-600" />
                          {isAr ? 'الحساب الرئيسي' : 'Default'}
                        </span>
                      )}
                      {!acc.isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                          {isAr ? 'معطّل' : 'Inactive'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isAr ? acc.beneficiaryNameAr : acc.beneficiaryNameEn || acc.beneficiaryNameAr}
                    </p>
                  </div>

                  {/* Actions */}
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(acc)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title={isAr ? 'تعديل' : 'Edit'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              isAr
                                ? `هل أنت متأكد من حذف الحساب البنكي (${acc.bankNameAr})؟`
                                : `Are you sure you want to delete bank account (${acc.bankNameEn})?`
                            )
                          ) {
                            deleteMutation.mutate(acc.id)
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={isAr ? 'حذف' : 'Delete'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* IBAN Card */}
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200/80 flex items-center justify-between font-mono text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-sans text-gray-400 block">
                      IBAN / الآيبان
                    </span>
                    <span className="font-bold text-gray-900 tracking-wider" dir="ltr">
                      {acc.iban}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyIban(acc.iban, acc.id)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg transition-colors text-[10px] flex items-center gap-1"
                    title={isAr ? 'نسخ الآيبان' : 'Copy IBAN'}
                  >
                    {copiedId === acc.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Details Footer */}
                <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-500 pt-1 gap-2">
                  <div className="flex items-center gap-3">
                    <span>
                      {isAr ? 'العملة:' : 'Currency:'}{' '}
                      <strong className="text-gray-700">{acc.currency || 'SAR'}</strong>
                    </span>
                    {acc.accountNumber && (
                      <span>
                        {isAr ? 'رقم الحساب:' : 'Account No:'}{' '}
                        <span className="font-mono">{acc.accountNumber}</span>
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      {!acc.isDefault && acc.isActive && (
                        <button
                          type="button"
                          onClick={() => setDefaultMutation.mutate(acc.id)}
                          disabled={setDefaultMutation.isPending}
                          className="text-[10px] font-bold text-blue-600 hover:underline"
                        >
                          {isAr ? 'تعيين كرئيسي' : 'Set as Default'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          toggleActiveMutation.mutate({
                            id: acc.id,
                            isActive: !acc.isActive,
                          })
                        }
                        className={`text-[10px] font-bold ${
                          acc.isActive ? 'text-amber-600 hover:underline' : 'text-emerald-600 hover:underline'
                        }`}
                      >
                        {acc.isActive
                          ? isAr
                            ? 'تعطيل'
                            : 'Deactivate'
                          : isAr
                          ? 'تفعيل'
                          : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Bank Account Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                {editingAccount
                  ? isAr
                    ? 'تعديل بيانات الحساب البنكي'
                    : 'Edit Bank Account'
                  : isAr
                  ? 'إضافة حساب بنكي جديد للشركة'
                  : 'Add Company Bank Account'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                saveMutation.mutate(form)
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'اسم البنك بالعربية *' : 'Bank Name (Arabic) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.bankNameAr}
                    onChange={(e) => setForm({ ...form, bankNameAr: e.target.value })}
                    placeholder={isAr ? 'مثال: البنك الأهلي السعودي' : 'e.g. SNB'}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'اسم البنك بالإنجليزية *' : 'Bank Name (English) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.bankNameEn}
                    onChange={(e) => setForm({ ...form, bankNameEn: e.target.value })}
                    placeholder="e.g. Saudi National Bank (SNB)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'اسم المستفيد بالعربية *' : 'Beneficiary Name (Arabic) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.beneficiaryNameAr}
                    onChange={(e) => setForm({ ...form, beneficiaryNameAr: e.target.value })}
                    placeholder={isAr ? 'شركة بنيان للمقاولات' : 'Bunyan Contracting'}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'اسم المستفيد بالإنجليزية *' : 'Beneficiary Name (English) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.beneficiaryNameEn}
                    onChange={(e) => setForm({ ...form, beneficiaryNameEn: e.target.value })}
                    placeholder="BUNYAN CONTRACTING CO."
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'رقم الآيبان (IBAN) *' : 'IBAN Number *'}
                </label>
                <input
                  type="text"
                  required
                  value={form.iban}
                  onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })}
                  placeholder="SA03 1000 0000 0000 0000 0000"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono font-bold tracking-wider focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'رقم الحساب' : 'Account No'}
                  </label>
                  <input
                    type="text"
                    value={form.accountNumber}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                    placeholder="100000000"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'العملة' : 'Currency'}
                  </label>
                  <input
                    type="text"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                    placeholder="SAR"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'رمز السويفت (SWIFT)' : 'SWIFT / BIC'}
                  </label>
                  <input
                    type="text"
                    value={form.swiftCode}
                    onChange={(e) => setForm({ ...form, swiftCode: e.target.value.toUpperCase() })}
                    placeholder="NCBKSARI"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'اسم الفرع (اختياري)' : 'Branch Name (Optional)'}
                </label>
                <input
                  type="text"
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder={isAr ? 'فرع الرياض الرئيسي' : 'Riyadh Main Branch'}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    {isAr
                      ? 'تعيين كحساب رئيسي للفواتير والتحصيل'
                      : 'Set as default receiving account on invoices'}
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{isAr ? 'حساب مفعّل ونشط' : 'Active account'}</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {saveMutation.isPending
                    ? isAr
                      ? 'جارٍ الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ الحساب'
                    : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
