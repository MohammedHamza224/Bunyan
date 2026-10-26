import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  CreditCard,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Landmark,
  FileText,
} from 'lucide-react'
import { api } from '../../lib/api'
import { formatCurrency, getCurrencySymbol } from '../../lib/utils'

export const POPULAR_SAUDI_BANKS = [
  { id: 'AL_RAJHI', ar: 'مصرف الراجحي', en: 'Al Rajhi Bank' },
  { id: 'SNB', ar: 'البنك الأهلي السعودي (SNB)', en: 'Saudi National Bank (SNB)' },
  { id: 'RIYAD_BANK', ar: 'بنك الرياض', en: 'Riyad Bank' },
  { id: 'ALINMA', ar: 'مصرف الإنماء', en: 'Alinma Bank' },
  { id: 'BSF', ar: 'البنك السعودي الفرنسي (BSF)', en: 'Banque Saudi Fransi' },
  { id: 'ANB', ar: 'البنك العربي الوطني (ANB)', en: 'Arab National Bank' },
  { id: 'ALBILAD', ar: 'بنك البلاد', en: 'Bank Albilad' },
  { id: 'SAIB', ar: 'البنك السعودي للاستثمار (SAIB)', en: 'The Saudi Investment Bank' },
  { id: 'ALJAZIRA', ar: 'بنك الجزيرة', en: 'Bank AlJazira' },
  { id: 'GIB', ar: 'بنك الخليج الدولي (GIB)', en: 'Gulf International Bank' },
]

interface PaymentRegistrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  isAr: boolean
  invoiceId?: string
  preloadedInvoice?: any
  paymentToEdit?: any
  mode?: 'create' | 'edit'
}

export function PaymentRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  isAr,
  invoiceId,
  preloadedInvoice,
  paymentToEdit,
  mode = 'create',
}: PaymentRegistrationModalProps) {
  const queryClient = useQueryClient()
  const isEditMode = mode === 'edit' || !!paymentToEdit

  // Form state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(
    () => paymentToEdit?.invoiceId || invoiceId || ''
  )
  const [amount, setAmount] = useState(
    () =>
      paymentToEdit?.amount != null
        ? String(paymentToEdit.amount)
        : preloadedInvoice?.remainingAmount != null
        ? String(Number(preloadedInvoice.remainingAmount || 0))
        : ''
  )
  const [paymentDate, setPaymentDate] = useState(
    () =>
      paymentToEdit?.paymentDate
        ? paymentToEdit.paymentDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10)
  )
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'CARD' | 'CHEQUE' | 'OTHER'>(
    () => paymentToEdit?.method || 'BANK_TRANSFER'
  )

  // Method-specific fields
  const [bankAccountId, setBankAccountId] = useState(() => paymentToEdit?.bankAccountId || '')
  const [referenceNo, setReferenceNo] = useState(() => paymentToEdit?.referenceNo || '')
  const [senderBankChoice, setSenderBankChoice] = useState(() => {
    if (paymentToEdit?.senderBankName) {
      const matching = POPULAR_SAUDI_BANKS.find(
        (b) =>
          b.id === paymentToEdit.senderBankName ||
          b.ar === paymentToEdit.senderBankName ||
          b.en === paymentToEdit.senderBankName
      )
      return matching ? matching.id : 'CUSTOM'
    }
    return ''
  })
  const [senderBankName, setSenderBankName] = useState(() => paymentToEdit?.senderBankName || '')
  const [transferDate, setTransferDate] = useState(() =>
    paymentToEdit?.transferDate ? paymentToEdit.transferDate.slice(0, 10) : ''
  )
  const [chequeNumber, setChequeNumber] = useState(() => paymentToEdit?.chequeNumber || '')
  const [chequeDate, setChequeDate] = useState(() =>
    paymentToEdit?.chequeDate ? paymentToEdit.chequeDate.slice(0, 10) : ''
  )
  const [cardProvider, setCardProvider] = useState(() => paymentToEdit?.cardProvider || 'MADA')
  const [terminalId, setTerminalId] = useState(() => paymentToEdit?.terminalId || '')
  const [receiptNumber, setReceiptNumber] = useState(() => paymentToEdit?.receiptNumber || '')
  const [description, setDescription] = useState(() => paymentToEdit?.description || '')
  const [notes, setNotes] = useState(() => paymentToEdit?.notes || '')

  const [formError, setFormError] = useState<string | null>(null)

  // Query open invoices (only if invoiceId is not preloaded)
  const { data: openInvoicesData } = useQuery({
    queryKey: ['openInvoicesForPayment'],
    queryFn: async () => {
      const res = await api.get('/invoices', { params: { limit: 100 } })
      return (res.data?.data?.items || []).filter(
        (inv: any) => inv.status !== 'CANCELLED' && Number(inv.remainingAmount) > 0
      )
    },
    enabled: isOpen && !invoiceId && !isEditMode,
  })
  const openInvoices = Array.isArray(openInvoicesData) ? openInvoicesData : []

  // Query active company receiving bank accounts
  const { data: bankAccountsData } = useQuery({
    queryKey: ['companyReceivingBankAccounts'],
    queryFn: async () => {
      const res = await api.get('/organizations/bank-accounts', { params: { activeOnly: true } })
      return res.data?.data || []
    },
    enabled: isOpen,
  })
  const bankAccounts = Array.isArray(bankAccountsData) ? bankAccountsData : []

  // Pre-select default bank account when loaded (only in create mode)
  useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccountId && !isEditMode) {
      const defaultAcc = bankAccounts.find((b: any) => b.isDefault) || bankAccounts[0]
      if (defaultAcc) {
        setBankAccountId(defaultAcc.id)
      }
    }
  }, [bankAccounts, bankAccountId, isEditMode])

  // Sync state when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setFormError(null)
      if (paymentToEdit) {
        setSelectedInvoiceId(paymentToEdit.invoiceId || invoiceId || '')
        setAmount(String(paymentToEdit.amount ?? ''))
        setPaymentDate(
          paymentToEdit.paymentDate
            ? paymentToEdit.paymentDate.slice(0, 10)
            : new Date().toISOString().slice(0, 10)
        )
        setMethod(paymentToEdit.method || 'BANK_TRANSFER')
        setBankAccountId(paymentToEdit.bankAccountId || '')
        setReferenceNo(paymentToEdit.referenceNo || '')

        if (paymentToEdit.senderBankName) {
          const matching = POPULAR_SAUDI_BANKS.find(
            (b) =>
              b.id === paymentToEdit.senderBankName ||
              b.ar === paymentToEdit.senderBankName ||
              b.en === paymentToEdit.senderBankName
          )
          if (matching) {
            setSenderBankChoice(matching.id)
            setSenderBankName(paymentToEdit.senderBankName)
          } else {
            setSenderBankChoice('CUSTOM')
            setSenderBankName(paymentToEdit.senderBankName)
          }
        } else {
          setSenderBankChoice('')
          setSenderBankName('')
        }

        setTransferDate(
          paymentToEdit.transferDate ? paymentToEdit.transferDate.slice(0, 10) : ''
        )
        setChequeNumber(paymentToEdit.chequeNumber || '')
        setChequeDate(
          paymentToEdit.chequeDate ? paymentToEdit.chequeDate.slice(0, 10) : ''
        )
        setCardProvider(paymentToEdit.cardProvider || 'MADA')
        setTerminalId(paymentToEdit.terminalId || '')
        setReceiptNumber(paymentToEdit.receiptNumber || '')
        setDescription(paymentToEdit.description || '')
        setNotes(paymentToEdit.notes || '')
      } else {
        if (invoiceId) setSelectedInvoiceId(invoiceId)
        if (preloadedInvoice) {
          setAmount(String(Number(preloadedInvoice.remainingAmount || 0)))
        } else {
          setAmount('')
        }
        setPaymentDate(new Date().toISOString().slice(0, 10))
        setMethod('BANK_TRANSFER')
        setReferenceNo('')
        setSenderBankChoice('')
        setSenderBankName('')
        setTransferDate('')
        setChequeNumber('')
        setChequeDate('')
        setCardProvider('MADA')
        setTerminalId('')
        setReceiptNumber('')
        setDescription('')
        setNotes('')
      }
    }
  }, [isOpen, paymentToEdit, invoiceId, preloadedInvoice])

  // Mutation to record or update payment
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (isEditMode && paymentToEdit?.id) {
        const res = await api.put(`/payments/${paymentToEdit.id}`, payload)
        return res.data
      } else {
        const res = await api.post('/payments', payload)
        return res.data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', selectedInvoiceId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      if (onSuccess) onSuccess()
      onClose()
    },
    onError: (err: any) => {
      setFormError(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          (isAr
            ? isEditMode
              ? 'فشل تعديل الدفعة'
              : 'فشل تسجيل الدفعة'
            : isEditMode
            ? 'Failed to update payment'
            : 'Failed to record payment')
      )
    },
  })

  if (!isOpen) return null

  // Find currently targeted invoice
  const currentInvoice =
    preloadedInvoice ||
    paymentToEdit?.invoice ||
    openInvoices.find((inv: any) => inv.id === selectedInvoiceId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!selectedInvoiceId) {
      setFormError(isAr ? 'يرجى اختيار الفاتورة المستحقة' : 'Please select an invoice')
      return
    }

    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError(isAr ? 'يرجى إدخال مبلغ صحيح أكبر من الصفر' : 'Please enter a valid amount > 0')
      return
    }

    if (isEditMode && paymentToEdit) {
      const originalAmount = Number(paymentToEdit.amount)
      const delta = numAmount - originalAmount
      if (delta > 0 && currentInvoice && delta > Number(currentInvoice.remainingAmount)) {
        setFormError(
          isAr
            ? `الزيادة المطلوبة (${delta.toFixed(2)}) تتجاوز الرصيد المتبقي للفاتورة (${Number(
                currentInvoice.remainingAmount
              ).toFixed(2)})`
            : `Amount increase (${delta.toFixed(2)}) exceeds invoice remaining balance (${Number(
                currentInvoice.remainingAmount
              ).toFixed(2)})`
        )
        return
      }
    } else if (currentInvoice && numAmount > Number(currentInvoice.remainingAmount)) {
      setFormError(
        isAr
          ? `المبلغ المدخل (${numAmount}) يتجاوز الرصيد المتبقي للفاتورة (${Number(
              currentInvoice.remainingAmount
            )})`
          : `Amount (${numAmount}) exceeds invoice remaining balance (${Number(
              currentInvoice.remainingAmount
            )})`
      )
      return
    }

    if (method === 'CHEQUE' && !chequeNumber.trim()) {
      setFormError(isAr ? 'رقم الشيك مطلوب لعمليات الدفع بالشيك' : 'Cheque number is required')
      return
    }

    if (method === 'OTHER' && !description.trim() && !notes.trim()) {
      setFormError(isAr ? 'يرجى إدخال وصف لطريقة الدفع' : 'Payment description is required')
      return
    }

    const payload: any = {
      invoiceId: selectedInvoiceId,
      amount: numAmount,
      paymentDate,
      method,
      referenceNo: referenceNo.trim() || null,
      notes: notes.trim() || null,
    }

    if (!isEditMode) {
      payload.idempotencyKey = `pay_${selectedInvoiceId}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`
    }

    if (method === 'BANK_TRANSFER') {
      payload.bankAccountId = bankAccountId || null
      payload.senderBankName = senderBankName.trim() || null
      payload.transferDate = transferDate || null
    } else if (method === 'CASH') {
      payload.receiptNumber = receiptNumber.trim() || null
    } else if (method === 'CARD') {
      payload.cardProvider = cardProvider || null
      payload.terminalId = terminalId.trim() || null
    } else if (method === 'CHEQUE') {
      payload.chequeNumber = chequeNumber.trim() || null
      payload.senderBankName = senderBankName.trim() || null
      payload.chequeDate = chequeDate || null
    } else if (method === 'OTHER') {
      payload.description = description.trim() || null
    }

    saveMutation.mutate(payload)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
        {/* Modal Header (Fixed / Non-Scrolling) */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                {isAr
                  ? isEditMode
                    ? 'تعديل بيانات الدفعة المالية'
                    : 'تسجيل دفعة وتحصيل فاتورة'
                  : isEditMode
                  ? 'Edit Payment Transaction'
                  : 'Record Invoice Payment'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr
                  ? isEditMode
                    ? 'تعديل بيانات الدفعة وتحديث رصيد الفاتورة المرتبطة محاسبياً'
                    : 'ربط الدفعة بالفاتورة وتوثيق الطريقة وتحديث الرصيد محاسبياً'
                  : isEditMode
                  ? 'Modify payment attributes and automatically reconcile invoice balances'
                  : 'Link transaction to invoice, capture method details, and update balance'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Container with Scrollable Body & Fixed Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* =========================================================
                SECTION 1 — Payment Information (بيانات السداد الأساسية)
                ========================================================= */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <Receipt className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-bold text-gray-900">
                  {isAr ? 'القسم الأول — بيانات السداد الأساسية' : 'Section 1 — Payment Information'}
                </h4>
              </div>

              {/* Invoice Selection */}
              {!invoiceId && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'الفاتورة المستحقة *' : 'Invoice *'}
                  </label>
                  <select
                    required
                    value={selectedInvoiceId}
                    onChange={(e) => {
                      const invId = e.target.value
                      setSelectedInvoiceId(invId)
                      const inv = openInvoices.find((i: any) => i.id === invId)
                      if (inv) {
                        setAmount(String(Number(inv.remainingAmount)))
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">{isAr ? '-- اختر الفاتورة المطلوب تحصيلها --' : '-- Select Invoice --'}</option>
                    {openInvoices.map((inv: any) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.referenceNo} - {inv.client?.nameAr || inv.client?.nameEn} (
                        {isAr ? 'المتبقي:' : 'Remaining:'} {formatCurrency(inv.remainingAmount, isAr ? 'ar' : 'en', inv.currency || 'SAR')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Active Invoice Context Banner */}
              {currentInvoice && (
                <div className="bg-blue-50/70 border border-blue-200 p-3 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-gray-500 block">{isAr ? 'الفاتورة المستهدفة:' : 'Target Invoice:'}</span>
                    <span className="font-bold text-blue-950 font-mono text-sm">
                      {currentInvoice.referenceNo}
                    </span>
                    <span className="text-gray-500 ms-2">
                      ({currentInvoice.client?.nameAr || currentInvoice.client?.nameEn || 'عميل'})
                    </span>
                  </div>
                  <div className="text-end">
                    <span className="text-gray-500 block">{isAr ? 'الرصيد المتبقي:' : 'Remaining Balance:'}</span>
                    <span className="font-extrabold text-blue-800 text-sm font-mono">
                      {formatCurrency(currentInvoice.remainingAmount, isAr ? 'ar' : 'en', currentInvoice.currency || 'SAR')}
                    </span>
                  </div>
                </div>
              )}

              {/* Amount and Payment Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr
                      ? `مبلغ السداد (${getCurrencySymbol(currentInvoice?.currency || 'SAR', true)}) *`
                      : `Payment Amount (${getCurrencySymbol(currentInvoice?.currency || 'SAR', false)}) *`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-mono font-bold bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ السداد الفعلي *' : 'Payment Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'طريقة السداد المعتمدة *' : 'Payment Method *'}
                </label>
                <select
                  data-testid="payment-method-select"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-semibold bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-2"
                >
                  <option value="BANK_TRANSFER">{isAr ? 'تحويل بنكي (Bank Transfer)' : 'Bank Transfer'}</option>
                  <option value="CASH">{isAr ? 'نقدًا (Cash)' : 'Cash'}</option>
                  <option value="CARD">{isAr ? 'بطاقة / مدى (Card / Mada)' : 'Card / Mada'}</option>
                  <option value="CHEQUE">{isAr ? 'شيك مصرفي (Cheque)' : 'Cheque'}</option>
                  <option value="OTHER">{isAr ? 'أخرى (Other)' : 'Other'}</option>
                </select>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: 'BANK_TRANSFER', ar: 'تحويل بنكي', en: 'Bank Transfer' },
                    { id: 'CASH', ar: 'نقدًا', en: 'Cash' },
                    { id: 'CARD', ar: 'بطاقة / مدى', en: 'Card / Mada' },
                    { id: 'CHEQUE', ar: 'شيك', en: 'Cheque' },
                    { id: 'OTHER', ar: 'أخرى', en: 'Other' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      data-testid={`payment-method-btn-${m.id}`}
                      onClick={() => setMethod(m.id as any)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                        method === m.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-1 ring-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {isAr ? m.ar : m.en}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* =========================================================
                SECTION 2 — Method Details (Bank Transfer or Others)
                ========================================================= */}

            {/* 1. BANK TRANSFER (Enhanced Two-Column Responsive Layout) */}
            {method === 'BANK_TRANSFER' && (
              <div className="bg-blue-50/40 p-4 rounded-2xl border border-blue-100/90 space-y-3.5">
                {/* Section 2 Header */}
                <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700" />
                    <h4 className="text-xs font-bold text-blue-950">
                      {isAr
                        ? 'القسم الثاني — تفاصيل التحويل البنكي'
                        : 'Section 2 — Bank Transfer Details'}
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-blue-700">
                    {isAr ? 'حساب الاستقبال والمطابقة البنكية' : 'Receiving Account & Verification'}
                  </span>
                </div>

                {/* Bank Transfer 2-Column Responsive Grid on Desktop / 1-Column on Mobile */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Field 1: Company Receiving Bank Account */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      {isAr ? 'الحساب البنكي للشركة المستلم للدفعة *' : 'Company Receiving Bank Account *'}
                    </label>
                    <select
                      data-testid="receiving-bank-select"
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {bankAccounts.length === 0 ? (
                        <option value="">{isAr ? 'لا توجد حسابات بنكية مضافة' : 'No bank accounts found'}</option>
                      ) : (
                        bankAccounts.map((b: any) => (
                          <option key={b.id} value={b.id}>
                            {isAr ? b.bankNameAr : b.bankNameEn} - {b.iban}{' '}
                            {b.isDefault ? (isAr ? '(الرئيسي)' : '(Default)') : ''}
                          </option>
                        ))
                      )}
                    </select>
                    {bankAccounts.length === 0 ? (
                      <div className="mt-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span>
                            {isAr
                              ? 'لم يتم تكوين أي حساب بنكي للشركة بعد.'
                              : 'No company bank accounts configured yet.'}
                          </span>{' '}
                          <a
                            href="/settings"
                            className="underline font-semibold text-blue-700 hover:text-blue-900"
                          >
                            {isAr ? 'إضافة حساب في الإعدادات' : 'Configure in Settings'}
                          </a>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        {isAr
                          ? 'يتم اختيار الحساب الرئيسي تلقائياً، ويمكنك اختيار أي حساب آخر.'
                          : 'Default account is pre-selected; you may choose any active company account.'}
                      </span>
                    )}
                  </div>

                  {/* Field 2: Customer Sending Bank */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      {isAr ? 'بنك العميل المحوّل منه' : 'Customer Sending Bank'}
                    </label>
                    <select
                      data-testid="sender-bank-select"
                      value={senderBankChoice}
                      onChange={(e) => {
                        const val = e.target.value
                        setSenderBankChoice(val)
                        if (val === 'CUSTOM') {
                          setSenderBankName('')
                        } else if (val) {
                          const bank = POPULAR_SAUDI_BANKS.find((b) => b.id === val)
                          setSenderBankName(bank ? (isAr ? bank.ar : bank.en) : val)
                        } else {
                          setSenderBankName('')
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">{isAr ? '-- اختر بنك العميل (اختياري) --' : '-- Select Customer Bank (Optional) --'}</option>
                      {POPULAR_SAUDI_BANKS.map((b) => (
                        <option key={b.id} value={b.id}>
                          {isAr ? b.ar : b.en}
                        </option>
                      ))}
                      <option value="CUSTOM">{isAr ? 'بنك آخر (إدخال يدوي)' : 'Other Bank (Manual Entry)'}</option>
                    </select>

                    {senderBankChoice === 'CUSTOM' && (
                      <div className="mt-1.5">
                        <input
                          type="text"
                          data-testid="custom-sender-bank-input"
                          value={senderBankName}
                          onChange={(e) => setSenderBankName(e.target.value)}
                          placeholder={isAr ? 'أدخل اسم بنك العميل...' : 'Enter customer bank name...'}
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    )}
                    <span className="text-[10px] text-gray-400 block mt-0.5">
                      {isAr
                        ? 'اختياري: يفيد في مطابقة كشف الحساب البنكي.'
                        : 'Optional: useful for bank statement reconciliation.'}
                    </span>
                  </div>

                  {/* Field 3: Transfer / Reference Number */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      {isAr ? 'رقم الحوالة / المرجع البنكي *' : 'Transfer Reference / Confirmation No *'}
                    </label>
                    <input
                      type="text"
                      data-testid="transfer-reference-input"
                      required
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      placeholder={isAr ? 'مثال: TRF-10928302' : 'e.g. TRF-10928302'}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-[10px] text-gray-400 block mt-0.5">
                      {isAr ? 'الرقم المرجعي الصادر من البنك المحول منه' : 'Reference number generated by the issuing bank'}
                    </span>
                  </div>

                  {/* Field 4: Actual Transfer Execution Date */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      {isAr ? 'تاريخ الحوالة الفعلي (إذا اختلف عن تاريخ التسجيل)' : 'Transfer Execution Date'}
                    </label>
                    <input
                      type="date"
                      data-testid="transfer-date-input"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-[10px] text-gray-400 block mt-0.5">
                      {isAr ? 'تاريخ قيد الحوالة البنكية فعلياً' : 'Actual date the funds were settled'}
                    </span>
                  </div>

                  {/* Field 5: Additional Transfer Notes (Full width in 2-column grid) */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      {isAr ? 'ملاحظات إضافية على التحويل البنكي' : 'Additional Transfer Notes'}
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={isAr ? 'أي ملاحظات محاسبية، اسم المودع، أو تفاصيل أخرى...' : 'Depositor name, reconciliation notes, or other details...'}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. CASH (Preserved 100%) */}
            {method === 'CASH' && (
              <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-200 space-y-3">
                <span className="text-xs font-bold text-gray-800 block border-b border-gray-200/80 pb-1.5">
                  {isAr ? 'تفاصيل السداد النقدي' : 'Cash Payment Details'}
                </span>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'رقم سند القبض / إيصال الصندوق (اختياري)' : 'Receipt / Cash Voucher No (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder={isAr ? 'مثال: VOUCH-2026-081' : 'e.g. VOUCH-2026-081'}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    {isAr
                      ? 'لا يلزم إدخال بيانات بنكية للسداد النقدي.'
                      : 'No bank details required for cash settlement.'}
                  </span>
                </div>
              </div>
            )}

            {/* 3. CARD / MADA (Preserved 100%) */}
            {method === 'CARD' && (
              <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-200 space-y-3">
                <span className="text-xs font-bold text-gray-800 block border-b border-gray-200/80 pb-1.5">
                  {isAr ? 'تفاصيل الدفع الإلكتروني بالبطاقة' : 'Card & POS Transaction Details'}
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      {isAr ? 'نوع الشبكة / البطاقة' : 'Card Scheme / Network'}
                    </label>
                    <select
                      value={cardProvider}
                      onChange={(e) => setCardProvider(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="MADA">{isAr ? 'مدى (MADA)' : 'Mada'}</option>
                      <option value="VISA">{isAr ? 'فيزا (Visa)' : 'Visa'}</option>
                      <option value="MASTERCARD">{isAr ? 'ماستركارد (Mastercard)' : 'Mastercard'}</option>
                      <option value="AMEX">{isAr ? 'أمريكان إكسبريس (AMEX)' : 'American Express'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      {isAr ? 'رقم التفويض / المرجع (Auth Code / RRN)' : 'Auth Code / Reference No'}
                    </label>
                    <input
                      type="text"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      placeholder="e.g. AUTH-992102"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'معرف جهاز نقطة البيع (Terminal ID) - اختياري' : 'POS Terminal ID (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={terminalId}
                    onChange={(e) => setTerminalId(e.target.value)}
                    placeholder="e.g. TID-9012"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* 4. CHEQUE (Preserved 100%) */}
            {method === 'CHEQUE' && (
              <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-200 space-y-3">
                <span className="text-xs font-bold text-gray-800 block border-b border-gray-200/80 pb-1.5">
                  {isAr ? 'بيانات الشيك البنكي' : 'Cheque Details'}
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      {isAr ? 'رقم الشيك *' : 'Cheque Number *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      placeholder="e.g. CHQ-001928"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      {isAr ? 'البنك المسحوب عليه' : 'Drawee Bank'}
                    </label>
                    <input
                      type="text"
                      value={senderBankName}
                      onChange={(e) => setSenderBankName(e.target.value)}
                      placeholder={isAr ? 'مثال: بنك الرياض' : 'e.g. Riyad Bank'}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'تاريخ الشيك / الاستحقاق' : 'Cheque Date'}
                  </label>
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* 5. OTHER (Preserved 100%) */}
            {method === 'OTHER' && (
              <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-200 space-y-3">
                <span className="text-xs font-bold text-gray-800 block border-b border-gray-200/80 pb-1.5">
                  {isAr ? 'تفاصيل طريقة السداد الأخرى' : 'Other Payment Method Details'}
                </span>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'وصف طريقة السداد أو التسوية *' : 'Payment Method Description *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={isAr ? 'مثال: مقاصة حسابات / تسوية عينية' : 'e.g. Offset / Settlement'}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'رقم المرجع (إن وجد)' : 'Reference No (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="e.g. REF-00928"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            )}

            {/* General Notes for Non-Bank-Transfer Methods */}
            {method !== 'BANK_TRANSFER' && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'ملاحظات إضافية على الدفعة' : 'Transaction Notes'}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isAr ? 'أي ملاحظات محاسبية أو تفاصيل إضافية...' : 'Any accounting notes...'}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            )}
          </div>

          {/* Modal Footer (Fixed / Non-Scrolling) */}
          <div className="px-5 sm:px-6 py-3.5 border-t border-gray-100 bg-gray-50/80 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 transition-colors shadow-2xs"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="save-payment-submit-btn"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {saveMutation.isPending
                  ? isAr
                    ? 'جارٍ الحفظ...'
                    : 'Saving...'
                  : isAr
                  ? isEditMode
                    ? 'حفظ التعديلات'
                    : 'حفظ الدفعة وتحديث الفاتورة'
                  : isEditMode
                  ? 'Save Changes'
                  : 'Save Payment'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
