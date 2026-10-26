import {
  X,
  CreditCard,
  Calendar,
  Building2,
  Landmark,
  CheckCircle2,
  Clock,
  Receipt,
  FileText,
  ShieldCheck,
  Ban,
  User,
  ExternalLink,
  Edit2,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '../../lib/utils'

interface PaymentDetailModalProps {
  isOpen: boolean
  onClose: () => void
  payment: any
  isAr: boolean
  onEdit?: () => void
  onApprove?: () => void
  onDelete?: () => void
}

export function PaymentDetailModal({
  isOpen,
  onClose,
  payment,
  isAr,
  onEdit,
  onApprove,
  onDelete,
}: PaymentDetailModalProps) {
  if (!isOpen || !payment) return null

  const isApproved = payment.status === 'APPROVED'
  const isReversed = payment.status === 'REVERSED'

  const methodLabel = () => {
    switch (payment.method) {
      case 'BANK_TRANSFER':
        return isAr ? 'تحويل بنكي' : 'Bank Transfer'
      case 'CASH':
        return isAr ? 'نقدًا' : 'Cash'
      case 'CARD':
        return isAr ? 'بطاقة / مدى' : 'Card / Mada'
      case 'CHEQUE':
        return isAr ? 'شيك مصرفي' : 'Cheque'
      default:
        return isAr ? 'أخرى' : 'Other'
    }
  }

  const statusBadge = () => {
    if (isApproved) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          {isAr ? 'معتمد' : 'Approved'}
        </span>
      )
    }
    if (isReversed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <Ban className="w-3.5 h-3.5" />
          {isAr ? 'معكوس / ملغي' : 'Reversed'}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3.5 h-3.5" />
        {isAr ? 'مسجل (بانتظار الاعتماد)' : 'Recorded (Pending Approval)'}
      </span>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 leading-tight">
                  {isAr ? 'تفاصيل سند الدفعة المالية' : 'Payment Transaction Details'}
                </h3>
                {statusBadge()}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                {payment.referenceNo || `PAY-${payment.id.slice(0, 8)}`}
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {/* Main Amount Card */}
          <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-gray-500 block uppercase tracking-wider">
                {isAr ? 'المبلغ المحصل' : 'Collected Amount'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl sm:text-3xl font-extrabold text-blue-950 font-mono">
                  {formatCurrency(payment.amount, isAr ? 'ar' : 'en', payment.currency || payment.invoice?.currency || 'SAR')}
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:items-end text-xs text-gray-600 space-y-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium">
                  {isAr ? 'تاريخ السداد:' : 'Payment Date:'} {payment.paymentDate?.slice(0, 10)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-semibold text-gray-800">{methodLabel()}</span>
              </div>
            </div>
          </div>

          {/* Client & Linked Invoice Section */}
          <div className="bg-gray-50/60 rounded-xl p-4 border border-gray-200/80 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-gray-900">
                  {isAr ? 'بيانات العميل والفاتورة المرتبطة' : 'Client & Linked Invoice'}
                </span>
              </div>
              {payment.invoiceId && (
                <Link
                  to={`/invoices/${payment.invoiceId}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <span>{isAr ? 'عرض الفاتورة' : 'View Invoice'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500 block">{isAr ? 'اسم العميل' : 'Client Name'}</span>
                <span className="font-bold text-gray-900 text-sm">
                  {isAr
                    ? payment.client?.nameAr || payment.invoice?.client?.nameAr
                    : payment.client?.nameEn ||
                      payment.invoice?.client?.nameEn ||
                      payment.client?.nameAr ||
                      payment.invoice?.client?.nameAr ||
                      '—'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">{isAr ? 'رقم الفاتورة' : 'Invoice Number'}</span>
                <span className="font-mono font-bold text-gray-900 text-sm">
                  {payment.invoice?.referenceNo || '—'}
                </span>
              </div>
            </div>

            {payment.invoice && (
              <div className="pt-2 border-t border-gray-200/60 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-lg border border-gray-100">
                  <span className="text-gray-400 block text-[11px]">
                    {isAr ? 'إجمالي الفاتورة' : 'Total Amount'}
                  </span>
                  <span className="font-mono font-bold text-gray-800">
                    {formatCurrency(payment.invoice.totalAmount || 0, isAr ? 'ar' : 'en', payment.invoice.currency || payment.currency || 'SAR')}
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-gray-100">
                  <span className="text-gray-400 block text-[11px]">
                    {isAr ? 'المدفوع حالياً' : 'Total Paid'}
                  </span>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatCurrency(payment.invoice.paidAmount || 0, isAr ? 'ar' : 'en', payment.invoice.currency || payment.currency || 'SAR')}
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-gray-100">
                  <span className="text-gray-400 block text-[11px]">
                    {isAr ? 'الرصيد المتبقي' : 'Remaining Balance'}
                  </span>
                  <span className="font-mono font-bold text-amber-700">
                    {formatCurrency(payment.invoice.remainingAmount || 0, isAr ? 'ar' : 'en', payment.invoice.currency || payment.currency || 'SAR')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Payment Method Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold text-gray-900">
                {isAr ? 'تفاصيل وسيلة الدفع' : 'Payment Method Specifics'}
              </h4>
            </div>

            {payment.method === 'BANK_TRANSFER' && (
              <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-2.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-500 block">
                      {isAr ? 'الحساب المستلم (الشركة)' : 'Receiving Account'}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {payment.bankAccount
                        ? `${isAr ? payment.bankAccount.bankNameAr : payment.bankAccount.bankNameEn} — ${payment.bankAccount.accountName}`
                        : isAr
                        ? 'الحساب الافتراضي'
                        : 'Default Account'}
                    </span>
                    {payment.bankAccount?.iban && (
                      <span className="text-[11px] font-mono text-gray-500 block mt-0.5">
                        {payment.bankAccount.iban}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500 block">
                      {isAr ? 'بنك المحوّل (العميل)' : 'Sender Bank'}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {payment.senderBankName || '—'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                  <div>
                    <span className="text-gray-500 block">
                      {isAr ? 'الرقم المرجعي للتحويل' : 'Transfer Reference No'}
                    </span>
                    <span className="font-mono font-bold text-gray-900">
                      {payment.referenceNo || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">
                      {isAr ? 'تاريخ الحوالة' : 'Transfer Date'}
                    </span>
                    <span className="font-medium text-gray-900">
                      {payment.transferDate?.slice(0, 10) || payment.paymentDate?.slice(0, 10) || '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {payment.method === 'CASH' && (
              <div className="bg-white border border-gray-200 rounded-xl p-3.5 text-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-gray-500 block">
                    {isAr ? 'رقم سند القبض النقدي' : 'Cash Receipt No'}
                  </span>
                  <span className="font-mono font-bold text-gray-900">
                    {payment.receiptNumber || payment.referenceNo || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">
                    {isAr ? 'طريقة الاستلام' : 'Receipt Method'}
                  </span>
                  <span className="font-semibold text-emerald-700">
                    {isAr ? 'استلام نقدي في الصندوق' : 'Direct Cash Receipt'}
                  </span>
                </div>
              </div>
            )}

            {payment.method === 'CARD' && (
              <div className="bg-white border border-gray-200 rounded-xl p-3.5 text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-gray-500 block">
                    {isAr ? 'شبكة البطاقة' : 'Card Provider'}
                  </span>
                  <span className="font-bold text-purple-700">
                    {payment.cardProvider || 'MADA'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">
                    {isAr ? 'معرف جهاز نقاط البيع (POS)' : 'Terminal ID (POS)'}
                  </span>
                  <span className="font-mono font-bold text-gray-900">
                    {payment.terminalId || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">
                    {isAr ? 'رقم العملية / التفويض' : 'Auth / Reference No'}
                  </span>
                  <span className="font-mono font-bold text-gray-900">
                    {payment.referenceNo || '—'}
                  </span>
                </div>
              </div>
            )}

            {payment.method === 'CHEQUE' && (
              <div className="bg-white border border-gray-200 rounded-xl p-3.5 text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-gray-500 block">{isAr ? 'رقم الشيك' : 'Cheque Number'}</span>
                  <span className="font-mono font-bold text-amber-800">
                    {payment.chequeNumber || payment.referenceNo || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">
                    {isAr ? 'البنك المسحوب عليه' : 'Drawee Bank'}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {payment.senderBankName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">
                    {isAr ? 'تاريخ استحقاق الشيك' : 'Cheque Due Date'}
                  </span>
                  <span className="font-medium text-gray-900">
                    {payment.chequeDate?.slice(0, 10) || '—'}
                  </span>
                </div>
              </div>
            )}

            {payment.method === 'OTHER' && (
              <div className="bg-white border border-gray-200 rounded-xl p-3.5 text-xs">
                <span className="text-gray-500 block">
                  {isAr ? 'وصف طريقة الدفع' : 'Description'}
                </span>
                <span className="font-medium text-gray-900">{payment.description || '—'}</span>
              </div>
            )}

            {payment.notes && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-xs">
                <span className="text-gray-500 block font-semibold mb-1">
                  {isAr ? 'ملاحظات محاسبية' : 'Accounting Notes'}
                </span>
                <p className="text-gray-700 whitespace-pre-wrap">{payment.notes}</p>
              </div>
            )}
          </div>

          {/* Audit & Governance Details */}
          <div className="bg-gray-50/50 rounded-xl p-3.5 border border-gray-150 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-gray-500 font-semibold mb-1">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span>{isAr ? 'سجل الحوكمة والتدقيق' : 'Governance & Audit Trail'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600">
              <div>
                <span className="text-gray-400 block text-[11px]">
                  {isAr ? 'تاريخ الإنشاء' : 'Recorded At'}
                </span>
                <span>
                  {payment.createdAt
                    ? new Date(payment.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')
                    : '—'}
                </span>
              </div>
              {isApproved && (
                <div>
                  <span className="text-gray-400 block text-[11px]">
                    {isAr ? 'معتمد بواسطة' : 'Approved By'}
                  </span>
                  <span className="font-semibold text-emerald-800 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {payment.approvedBy
                      ? isAr
                        ? payment.approvedBy.nameAr || payment.approvedBy.nameEn
                        : payment.approvedBy.nameEn || payment.approvedBy.nameAr
                      : isAr
                      ? 'مدير النظام'
                      : 'System Manager'}
                    {payment.approvedAt && (
                      <span className="font-normal text-gray-400 ms-1 text-[11px]">
                        ({new Date(payment.approvedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {!isApproved && !isReversed && onApprove && (
              <button
                type="button"
                onClick={onApprove}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAr ? 'اعتماد الدفعة' : 'Approve Payment'}</span>
              </button>
            )}
            {!isReversed && onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold transition-colors border border-amber-200"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'تعديل' : 'Edit'}</span>
              </button>
            )}
            {!isReversed && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors border border-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'حذف / عكس' : 'Delete / Reverse'}</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 transition-colors shadow-2xs"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
