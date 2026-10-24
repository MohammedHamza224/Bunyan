import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  CreditCard,
  Building2,
  DollarSign,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Wallet,
} from 'lucide-react'
import { api } from '../../lib/api'

interface PaymentRegistrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  isAr: boolean
  invoiceId?: string
  preloadedInvoice?: any
}

export function PaymentRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  isAr,
  invoiceId,
  preloadedInvoice,
}: PaymentRegistrationModalProps) {
  const queryClient = useQueryClient()

  // Form state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoiceId || '')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'CARD' | 'CHEQUE' | 'OTHER'>(
    'BANK_TRANSFER'
  )

  // Method-specific fields
  const [bankAccountId, setBankAccountId] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [senderBankName, setSenderBankName] = useState('')
  const [transferDate, setTransferDate] = useState('')
  const [chequeNumber, setChequeNumber] = useState('')
  const [chequeDate, setChequeDate] = useState('')
  const [cardProvider, setCardProvider] = useState('MADA')
  const [terminalId, setTerminalId] = useState('')
  const [receiptNumber, setReceiptNumber] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')

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
    enabled: isOpen && !invoiceId,
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

  // Pre-select default bank account when loaded
  useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccountId) {
      const defaultAcc = bankAccounts.find((b: any) => b.isDefault) || bankAccounts[0]
      if (defaultAcc) {
        setBankAccountId(defaultAcc.id)
      }
    }
  }, [bankAccounts, bankAccountId])

  // Sync invoice and amount when modal opens or invoiceId changes
  useEffect(() => {
    if (invoiceId) {
      setSelectedInvoiceId(invoiceId)
    }
    if (preloadedInvoice) {
      setAmount(String(Number(preloadedInvoice.remainingAmount || 0)))
    }
  }, [invoiceId, preloadedInvoice])

  // Mutation to record payment
  const recordMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/payments', payload)
      return res.data
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
          (isAr ? 'فشل تسجيل الدفعة' : 'Failed to record payment')
      )
    },
  })

  if (!isOpen) return null

  // Find currently targeted invoice
  const currentInvoice =
    preloadedInvoice ||
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

    if (currentInvoice && numAmount > Number(currentInvoice.remainingAmount)) {
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
      idempotencyKey: `pay_${selectedInvoiceId}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`,
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

    recordMutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {isAr ? 'تسجيل دفعة وتحصيل فاتورة' : 'Record Invoice Payment'}
              </h3>
              <p className="text-xs text-gray-500">
                {isAr
                  ? 'ربط الدفعة بالفاتورة وتوثيق الطريقة وتحديث الرصيد محاسبياً'
                  : 'Link transaction to invoice, capture method details, and update balance'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {formError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invoice Selection */}
          {!invoiceId && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
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
                    {isAr ? 'المتبقي:' : 'Remaining:'} {Number(inv.remainingAmount).toFixed(2)} SAR)
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
                  {Number(currentInvoice.remainingAmount).toFixed(2)} SAR
                </span>
              </div>
            </div>
          )}

          {/* Amount and Payment Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {isAr ? 'مبلغ السداد (SAR) *' : 'Payment Amount (SAR) *'}
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
              <label className="block text-xs font-bold text-gray-700 mb-1">
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
            <label className="block text-xs font-bold text-gray-700 mb-1">
              {isAr ? 'طريقة السداد المعتمدة *' : 'Payment Method *'}
            </label>
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
                  onClick={() => setMethod(m.id as any)}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                    method === m.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {isAr ? m.ar : m.en}
                </button>
              ))}
            </div>
          </div>

          {/* ── Conditional Fields per Method ── */}

          {/* 1. BANK TRANSFER */}
          {method === 'BANK_TRANSFER' && (
            <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-200 space-y-3">
              <span className="text-xs font-bold text-gray-800 block border-b border-gray-200/80 pb-1.5">
                {isAr ? 'تفاصيل التحويل البنكي والحساب المستلم' : 'Bank Transfer & Receiving Account Details'}
              </span>

              {/* Company Receiving Bank Account */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  {isAr ? 'الحساب البنكي للشركة المستلم للدفعة *' : 'Company Receiving Bank Account *'}
                </label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
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
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  {isAr
                    ? 'يتم اختيار الحساب الرئيسي تلقائياً، ويمكنك اختيار أي حساب نشط آخر للشركة.'
                    : 'Default account is pre-selected; you may select any active company account.'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Transaction / Reference No */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'رقم الحوالة / المرجع البنكي *' : 'Transfer Reference / Confirmation No *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder={isAr ? 'مثال: TRF-10928302' : 'e.g. TRF-10928302'}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Customer Sending Bank */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {isAr ? 'بنك العميل المحوّل منه (اختياري)' : 'Customer Sending Bank (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={senderBankName}
                    onChange={(e) => setSenderBankName(e.target.value)}
                    placeholder={isAr ? 'مثال: مصرف الراجحي' : 'e.g. Al Rajhi Bank'}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  {isAr ? 'تاريخ الحوالة الفعلي (إذا اختلف عن تاريخ التسجيل)' : 'Transfer Execution Date'}
                </label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* 2. CASH */}
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

          {/* 3. CARD / MADA */}
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

          {/* 4. CHEQUE */}
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

          {/* 5. OTHER */}
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

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={recordMutation.isPending}
              data-testid="save-payment-submit-btn"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {recordMutation.isPending
                  ? isAr
                    ? 'جارٍ الحفظ...'
                    : 'Saving...'
                  : isAr
                  ? 'حفظ الدفعة وتحديث الفاتورة'
                  : 'Save Payment'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
