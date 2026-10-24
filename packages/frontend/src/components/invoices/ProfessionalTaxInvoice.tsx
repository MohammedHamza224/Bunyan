import { useTranslation } from 'react-i18next'
import { ShieldCheck, QrCode, Loader2, AlertCircle, CheckCircle2, Building2, CreditCard, Banknote } from 'lucide-react'
import { tafqeetArabic, numberToWordsEnglish } from '../../lib/tafqeet'
import { BunyanGeometricMark } from '../auth/AuthSplitLayout'

interface InvoiceLine {
  id: string
  itemNameAr: string
  itemNameEn?: string | null
  description?: string | null
  unit: string
  unitEn?: string | null
  quantity: number | string
  unitPrice: number | string
  lineSubtotal: number | string
  vatRate: number | string
  vatAmount: number | string
  lineTotal: number | string
}

interface ProfessionalTaxInvoiceProps {
  invoice: any
  qrImageSrc?: string | null
  zatcaData?: any
  qrLoading?: boolean
}

export function ProfessionalTaxInvoice({
  invoice,
  qrImageSrc,
  zatcaData,
  qrLoading,
}: ProfessionalTaxInvoiceProps) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const orgSnapshot = (invoice.orgSnapshot || {}) as Record<string, any>
  const clientSnapshot = (invoice.clientSnapshot || invoice.client || {}) as Record<string, any>

  const isCreditNote = invoice.invoiceType === 'CREDIT_NOTE'
  const isDebitNote = invoice.invoiceType === 'DEBIT_NOTE'
  const isSimplified =
    invoice.invoiceType === 'SIMPLIFIED_TAX_INVOICE' ||
    invoice.invoiceType === 'SIMPLIFIED_INVOICE'
  const isNote = isCreditNote || isDebitNote

  // Currency resolution: never assume SAR if a different currency is configured
  const currency = invoice.currency || orgSnapshot.defaultCurrency || 'SAR'

  const getCurrencyLabels = () => {
    if (currency === 'SAR') {
      return {
        symbol: 'SAR',
        symbolAr: 'ر.س',
        enWord: 'Saudi Riyals',
        enFraction: 'Halalas',
        arWord: 'ريال سعودي',
        arFraction: 'هللة',
      }
    }
    if (currency === 'USD') {
      return {
        symbol: 'USD',
        symbolAr: 'د.أ',
        enWord: 'US Dollars',
        enFraction: 'Cents',
        arWord: 'دولار أمريكي',
        arFraction: 'سنت',
      }
    }
    if (currency === 'EUR') {
      return {
        symbol: 'EUR',
        symbolAr: 'يورو',
        enWord: 'Euros',
        enFraction: 'Cents',
        arWord: 'يورو',
        arFraction: 'سنت',
      }
    }
    return {
      symbol: currency,
      symbolAr: currency,
      enWord: currency,
      enFraction: 'Parts',
      arWord: currency,
      arFraction: 'أجزاء',
    }
  }

  const curr = getCurrencyLabels()

  const getDocTitleAr = () => {
    if (isCreditNote) return 'إشعار دائن ضريبي'
    if (isDebitNote) return 'إشعار مدين ضريبي'
    if (isSimplified) return 'فاتورة ضريبية مبسطة'
    return 'فاتورة ضريبية'
  }

  const getDocTitleEn = () => {
    if (isCreditNote) return 'TAX CREDIT NOTE'
    if (isDebitNote) return 'TAX DEBIT NOTE'
    if (isSimplified) return 'SIMPLIFIED TAX INVOICE'
    return 'TAX INVOICE'
  }

  const formatLocalDate = (dateStr?: string | null) => {
    if (!dateStr) return '-'
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toISOString().slice(0, 10)
    } catch {
      return dateStr
    }
  }

  const totalAmountNum = Number(invoice.totalAmount || 0)
  const arabicWords = tafqeetArabic(totalAmountNum, curr.arWord, curr.arFraction)
  const englishWords = numberToWordsEnglish(totalAmountNum, curr.enWord, curr.enFraction)

  return (
    <div
      className="a4-print-sheet bg-white border border-gray-200 shadow-sm print:shadow-none print:border-0 rounded-2xl print:rounded-none overflow-hidden text-gray-900 font-sans print:p-0"
      dir="ltr"
      data-testid="professional-tax-invoice"
    >
      {/* Top Gold Accent Line */}
      <div className="h-2 bg-[#E29A26] w-full print:bg-[#E29A26]" />

      <div className="p-6 sm:p-8 space-y-4 print:p-1 print:space-y-1.5">
        {/* =========================================================
            1. Corporate Header: English Left, Logo Center, Arabic Right
            ========================================================= */}
        <div className="flex flex-col sm:flex-row print:flex-row items-center justify-between gap-4 border-b border-gray-200 pb-3.5 print:pb-2 print:gap-2">
          {/* Left Column: English Company Identification */}
          <div className="text-left space-y-1 text-xs text-gray-600 sm:w-[38%] print:w-[38%]" lang="en" dir="ltr">
            <h3 className="text-base font-extrabold text-[#18324B] uppercase tracking-wide leading-tight">
              {orgSnapshot.businessNameEn || 'BUNYAN CONTRACTING CO.'}
            </h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs items-baseline">
              <span className="font-semibold text-gray-700 whitespace-nowrap">C.R. No:</span>
              <span className="font-mono font-bold text-gray-900 tracking-wide whitespace-nowrap select-all" dir="ltr">
                {orgSnapshot.commercialReg || '-'}
              </span>

              <span className="font-semibold text-gray-700 whitespace-nowrap">VAT Reg No:</span>
              <span className="font-mono font-bold text-[#18324B] tracking-wide whitespace-nowrap select-all" dir="ltr">
                {orgSnapshot.vatNumber || '-'}
              </span>

              <span className="font-semibold text-gray-700 whitespace-nowrap">Address:</span>
              <span className="text-gray-600 leading-snug">
                {orgSnapshot.addressEn || orgSnapshot.address || 'Dammam, Eastern Province, Saudi Arabia'}
              </span>

              {orgSnapshot.phone && (
                <>
                  <span className="font-semibold text-gray-700 whitespace-nowrap">Tel:</span>
                  <span className="text-gray-600 font-mono whitespace-nowrap" dir="ltr">
                    {orgSnapshot.phone}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Center: Corporate Brand Emblem */}
          <div className="flex flex-col items-center justify-center shrink-0 sm:w-[24%] print:w-[24%] mx-auto py-1">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#EAF0F5] border border-[#18324B]/20 text-[#18324B] shadow-2xs">
              <BunyanGeometricMark className="w-5 h-5 text-[#18324B]" />
              <span className="font-extrabold text-sm tracking-wide">بنيان • BUNYAN</span>
            </div>
            <span className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">
              Construction & Contracting
            </span>
            <span className="text-[9px] text-[#E29A26] font-bold tracking-widest uppercase">
              Kingdom of Saudi Arabia
            </span>
          </div>

          {/* Right Column: Arabic Company Identification */}
          <div className="text-right space-y-1 text-xs text-gray-600 sm:w-[38%] print:w-[38%]" lang="ar" dir="rtl">
            <h3 className="text-base font-extrabold text-[#18324B] leading-tight">
              {orgSnapshot.businessName || 'شركة بنيان للمقاولات'}
            </h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs items-baseline text-right" dir="rtl">
              <span className="font-semibold text-gray-700 whitespace-nowrap text-right">السجل التجاري:</span>
              <span className="font-mono font-bold text-gray-900 tracking-wide whitespace-nowrap justify-self-start select-all" dir="ltr">
                {orgSnapshot.commercialReg || '-'}
              </span>

              <span className="font-semibold text-gray-700 whitespace-nowrap text-right">الرقم الضريبي:</span>
              <span className="font-mono font-bold text-[#18324B] tracking-wide whitespace-nowrap justify-self-start select-all" dir="ltr">
                {orgSnapshot.vatNumber || '-'}
              </span>

              <span className="font-semibold text-gray-700 whitespace-nowrap text-right">العنوان:</span>
              <span className="text-gray-600 leading-snug text-right justify-self-start">
                {orgSnapshot.address || orgSnapshot.addressEn || 'الدمام، المنطقة الشرقية، المملكة العربية السعودية'}
              </span>

              {orgSnapshot.phone && (
                <>
                  <span className="font-semibold text-gray-700 whitespace-nowrap text-right">الهاتف:</span>
                  <span className="text-gray-600 font-mono whitespace-nowrap justify-self-start" dir="ltr">
                    {orgSnapshot.phone}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================
            2. Document Title Banner: English Left, Arabic Right
            ========================================================= */}
        <div className="flex flex-col sm:flex-row print:flex-row items-center justify-between gap-3 bg-gradient-to-r from-gray-50 via-[#FFF9EE] to-gray-50 border border-[#E29A26]/50 p-3 print:py-1.5 print:px-3 rounded-xl shadow-2xs">
          {/* English Document Title (Left) */}
          <div className="text-left sm:w-1/3 print:w-1/3" lang="en" dir="ltr">
            <span className="text-base sm:text-lg print:text-base font-extrabold text-[#18324B] block tracking-wide">
              {getDocTitleEn()}
            </span>
            <span className="text-[10px] text-gray-500 font-medium block">
              Standard Tax Invoice • ZATCA Compliant
            </span>
          </div>

          {/* Center Reference Badge */}
          <div className="flex flex-col items-center justify-center bg-white px-4 py-1.5 print:py-1 print:px-3 rounded-lg border border-gray-200 shadow-xs shrink-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              <span lang="en">Invoice No.</span>
              <span>/</span>
              <span lang="ar" dir="rtl">رقم الفاتورة</span>
            </div>
            <span className="font-mono text-sm sm:text-base print:text-sm font-extrabold text-blue-700">
              {invoice.referenceNo}
            </span>
          </div>

          {/* Arabic Document Title (Right) */}
          <div className="text-right sm:w-1/3 print:w-1/3" lang="ar" dir="rtl">
            <span className="text-base sm:text-lg print:text-base font-extrabold text-[#18324B] block">
              {getDocTitleAr()}
            </span>
            <span className="text-[10px] text-gray-500 font-medium block">
              فاتورة ضريبية قياسية معتمدة لضريبة القيمة المضافة
            </span>
          </div>
        </div>

        {/* =========================================================
            3. Paired Bilingual Metadata Grid (English Left, Arabic Right)
            ========================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 gap-2.5 print:gap-1.5 text-xs">
          {/* Card 1: Invoice Date */}
          <div className="border border-gray-200 rounded-lg p-2.5 print:py-1 print:px-2 bg-gray-50/70 flex items-center justify-between">
            <div className="text-left" lang="en" dir="ltr">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Invoice Date</span>
              <span className="font-mono font-bold text-gray-900">{formatLocalDate(invoice.issueDate)}</span>
            </div>
            <div className="text-right" lang="ar" dir="rtl">
              <span className="text-[10px] font-bold text-gray-500 block">تاريخ الفاتورة</span>
              <span className="font-mono font-bold text-gray-900">{formatLocalDate(invoice.issueDate)}</span>
            </div>
          </div>

          {/* Card 2: Supply Date */}
          <div className="border border-gray-200 rounded-lg p-2.5 print:py-1 print:px-2 bg-gray-50/70 flex items-center justify-between">
            <div className="text-left" lang="en" dir="ltr">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Supply Date</span>
              <span className="font-mono font-bold text-gray-900">{formatLocalDate(invoice.supplyDate || invoice.issueDate)}</span>
            </div>
            <div className="text-right" lang="ar" dir="rtl">
              <span className="text-[10px] font-bold text-gray-500 block">تاريخ التوريد</span>
              <span className="font-mono font-bold text-gray-900">{formatLocalDate(invoice.supplyDate || invoice.issueDate)}</span>
            </div>
          </div>

          {/* Card 3: Due Date */}
          <div className="border border-gray-200 rounded-lg p-2.5 print:py-1 print:px-2 bg-gray-50/70 flex items-center justify-between">
            <div className="text-left" lang="en" dir="ltr">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Due Date</span>
              <span className="font-mono font-bold text-gray-900">{formatLocalDate(invoice.dueDate)}</span>
            </div>
            <div className="text-right" lang="ar" dir="rtl">
              <span className="text-[10px] font-bold text-gray-500 block">تاريخ الاستحقاق</span>
              <span className="font-mono font-bold text-gray-900">{formatLocalDate(invoice.dueDate)}</span>
            </div>
          </div>

          {/* Card 4: Project / Site Name */}
          <div className="border border-gray-200 rounded-lg p-2.5 print:py-1 print:px-2 bg-gray-50/70 flex items-center justify-between">
            <div className="text-left truncate max-w-[48%]" lang="en" dir="ltr">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Project / Site</span>
              <span className="font-bold text-gray-900 truncate block">
                {invoice.statement?.site?.nameEn || clientSnapshot.nameEn || clientSnapshot.nameAr || 'General Project'}
              </span>
            </div>
            <div className="text-right truncate max-w-[48%]" lang="ar" dir="rtl">
              <span className="text-[10px] font-bold text-gray-500 block">اسم المشروع والموقع</span>
              <span className="font-bold text-gray-900 truncate block">
                {invoice.statement?.site?.nameAr || clientSnapshot.nameAr || 'مشروع عام'}
              </span>
            </div>
          </div>

          {/* Card 5: Statement Reference */}
          <div className="border border-gray-200 rounded-lg p-2.5 print:py-1 print:px-2 bg-gray-50/70 flex items-center justify-between">
            <div className="text-left" lang="en" dir="ltr">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Statement Ref</span>
              <span className="font-mono font-bold text-blue-700">{invoice.statement?.referenceNo || invoice.referenceNo}</span>
            </div>
            <div className="text-right" lang="ar" dir="rtl">
              <span className="text-[10px] font-bold text-gray-500 block">مرجع كشف الحساب</span>
              <span className="font-mono font-bold text-blue-700">{invoice.statement?.referenceNo || invoice.referenceNo}</span>
            </div>
          </div>

          {/* Card 6: Payment Status */}
          <div className="border border-gray-200 rounded-lg p-2.5 print:py-1 print:px-2 bg-gray-50/70 flex items-center justify-between">
            <div className="text-left" lang="en" dir="ltr">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Payment Status</span>
              <span
                className={`font-bold ${
                  invoice.paymentStatus === 'PAID'
                    ? 'text-emerald-700'
                    : invoice.paymentStatus === 'PARTIALLY_PAID'
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {invoice.paymentStatus === 'PAID'
                  ? 'Fully Paid'
                  : invoice.paymentStatus === 'PARTIALLY_PAID'
                  ? 'Partially Paid'
                  : 'Unpaid'}
              </span>
            </div>
            <div className="text-right" lang="ar" dir="rtl">
              <span className="text-[10px] font-bold text-gray-500 block">حالة الدفع والسداد</span>
              <span
                className={`font-bold ${
                  invoice.paymentStatus === 'PAID'
                    ? 'text-emerald-700'
                    : invoice.paymentStatus === 'PARTIALLY_PAID'
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {invoice.paymentStatus === 'PAID'
                  ? 'مدفوعة بالكامل'
                  : invoice.paymentStatus === 'PARTIALLY_PAID'
                  ? 'مدفوعة جزئياً'
                  : 'غير مدفوعة'}
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================
            4. Symmetrical Customer Details Grid: English Left, Arabic Right
            ========================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 print:gap-2">
          {/* Customer Details (Buyer - English - Left) */}
          <div className="border border-gray-200 rounded-xl p-3 print:p-2 bg-gray-50/50 space-y-1.5 print:space-y-1 text-xs text-left h-full flex flex-col justify-between" lang="en" dir="ltr">
            <div className="text-[11px] font-bold text-[#18324B] uppercase tracking-wider border-b border-gray-200 pb-1">
              Customer Details (Buyer)
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs items-baseline">
              <span className="font-semibold text-gray-600 whitespace-nowrap">Customer Name:</span>
              <span className="font-bold text-gray-900 leading-snug">
                {clientSnapshot.nameEn || clientSnapshot.nameAr || '-'}
              </span>

              {clientSnapshot.commercialReg && (
                <>
                  <span className="font-semibold text-gray-600 whitespace-nowrap">C.R. No:</span>
                  <span className="font-mono font-bold text-gray-900 whitespace-nowrap select-all" dir="ltr">
                    {clientSnapshot.commercialReg}
                  </span>
                </>
              )}

              <span className="font-semibold text-gray-600 whitespace-nowrap">VAT Reg No:</span>
              <span className="font-mono font-bold text-[#18324B] whitespace-nowrap select-all" dir="ltr">
                {clientSnapshot.vatNumber || '-'}
              </span>

              <span className="font-semibold text-gray-600 whitespace-nowrap">Address:</span>
              <span className="text-gray-700 leading-snug">
                {clientSnapshot.address || clientSnapshot.addressEn || '-'}
              </span>

              {clientSnapshot.phone && (
                <>
                  <span className="font-semibold text-gray-600 whitespace-nowrap">Phone / Mobile:</span>
                  <span className="font-mono text-gray-700 whitespace-nowrap" dir="ltr">
                    {clientSnapshot.phone}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Customer Details (Buyer - Arabic - Right) */}
          <div className="border border-gray-200 rounded-xl p-3 print:p-2 bg-gray-50/50 space-y-1.5 print:space-y-1 text-xs text-right h-full flex flex-col justify-between" lang="ar" dir="rtl">
            <div className="text-[11px] font-bold text-[#18324B] border-b border-gray-200 pb-1">
              بيانات العميل (المشتري)
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs items-baseline text-right" dir="rtl">
              <span className="font-semibold text-gray-600 whitespace-nowrap text-right">اسم العميل:</span>
              <span className="font-bold text-gray-900 leading-snug text-right justify-self-start">
                {clientSnapshot.nameAr || clientSnapshot.nameEn || '-'}
              </span>

              {clientSnapshot.commercialReg && (
                <>
                  <span className="font-semibold text-gray-600 whitespace-nowrap text-right">السجل التجاري:</span>
                  <span className="font-mono font-bold text-gray-900 whitespace-nowrap justify-self-start select-all" dir="ltr">
                    {clientSnapshot.commercialReg}
                  </span>
                </>
              )}

              <span className="font-semibold text-gray-600 whitespace-nowrap text-right">الرقم الضريبي:</span>
              <span className="font-mono font-bold text-[#18324B] whitespace-nowrap justify-self-start select-all" dir="ltr">
                {clientSnapshot.vatNumber || '-'}
              </span>

              <span className="font-semibold text-gray-600 whitespace-nowrap text-right">العنوان الوطني:</span>
              <span className="text-gray-700 leading-snug text-right justify-self-start">
                {clientSnapshot.address || clientSnapshot.addressAr || '-'}
              </span>

              {clientSnapshot.phone && (
                <>
                  <span className="font-semibold text-gray-600 whitespace-nowrap text-right">رقم الهاتف:</span>
                  <span className="font-mono text-gray-700 whitespace-nowrap justify-self-start" dir="ltr">
                    {clientSnapshot.phone}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================
            5. Bilingual Line Items Table (Table-Fixed, Predictable Widths)
            ========================================================= */}
        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-xs border-collapse table-fixed">
            <thead>
              <tr className="bg-[#18324B] text-white">
                {/* Index Column (4%) */}
                <th className="py-2 print:py-1 px-1 text-center font-bold w-[4%] border-r border-[#244565]">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-slate-300" lang="en">#</span>
                    <span className="text-[11px]" lang="ar">م</span>
                  </div>
                </th>

                {/* Description Column: English Left, Arabic Right (33%) */}
                <th className="py-2 print:py-1 px-3 print:px-2 font-bold w-[33%] border-r border-[#244565]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 text-left" lang="en" dir="ltr">
                      Item Description
                    </span>
                    <span className="text-[11px] font-bold text-amber-300 text-right" lang="ar" dir="rtl">
                      البيان وتفاصيل الأعمال
                    </span>
                  </div>
                </th>

                {/* Unit Column (7%) */}
                <th className="py-2 print:py-1 px-1 text-center font-bold w-[7%] border-r border-[#244565]">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-slate-300" lang="en">Unit</span>
                    <span className="text-[11px]" lang="ar">الوحدة</span>
                  </div>
                </th>

                {/* Quantity Column (8%) */}
                <th className="py-2 print:py-1 px-1 text-center font-bold w-[8%] border-r border-[#244565]">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-slate-300" lang="en">Qty</span>
                    <span className="text-[11px]" lang="ar">الكمية</span>
                  </div>
                </th>

                {/* Unit Price Column (11%) */}
                <th className="py-2 print:py-1 px-2 print:px-1.5 text-right font-bold w-[11%] border-r border-[#244565]">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-300" lang="en">Unit Price</span>
                    <span className="text-[11px]" lang="ar" dir="rtl">سعر الوحدة</span>
                  </div>
                </th>

                {/* Subtotal Column (12%) */}
                <th className="py-2 print:py-1 px-2 print:px-1.5 text-right font-bold w-[12%] border-r border-[#244565]">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-300" lang="en">Subtotal</span>
                    <span className="text-[11px]" lang="ar" dir="rtl">قبل الضريبة</span>
                  </div>
                </th>

                {/* VAT Rate Column (6%) */}
                <th className="py-2 print:py-1 px-1 text-center font-bold w-[6%] border-r border-[#244565]">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-slate-300" lang="en">VAT</span>
                    <span className="text-[11px]">%</span>
                  </div>
                </th>

                {/* VAT Amount Column (9%) */}
                <th className="py-2 print:py-1 px-2 print:px-1.5 text-right font-bold w-[9%] border-r border-[#244565]">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-300" lang="en">VAT Amt</span>
                    <span className="text-[11px]" lang="ar" dir="rtl">الضريبة</span>
                  </div>
                </th>

                {/* Total Incl. VAT Column (10%) */}
                <th className="py-2 print:py-1 px-2.5 print:px-2 text-right font-bold w-[10%] bg-[#102437]">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-amber-300" lang="en">Total</span>
                    <span className="text-[11px] text-white" lang="ar" dir="rtl">الإجمالي</span>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 text-gray-800">
              {(invoice.lines || []).map((line: InvoiceLine, idx: number) => {
                const subtotal = Number(line.lineSubtotal || 0)
                const vat = Number(line.vatAmount || 0)
                const total = Number(line.lineTotal || 0)
                const qty = Number(line.quantity || 0)
                const price = Number(line.unitPrice || 0)
                const vatRate = Number(line.vatRate || 15)

                return (
                  <tr
                    key={line.id || idx}
                    className={idx % 2 === 1 ? 'bg-gray-50/70' : 'bg-white'}
                  >
                    {/* Index */}
                    <td className="py-2 print:py-1 px-1 text-center text-gray-500 font-mono border-r border-gray-100">
                      {idx + 1}
                    </td>

                    {/* Bilingual Description: English on Left, Arabic Right */}
                    <td className="py-2 print:py-1 px-3 print:px-2 border-r border-gray-100">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1">
                        <span className="text-xs font-semibold text-gray-900 text-left" lang="en" dir="ltr">
                          {line.itemNameEn || line.itemNameAr}
                        </span>
                        <span className="text-xs font-bold text-gray-900 text-right" lang="ar" dir="rtl">
                          {line.itemNameAr}
                        </span>
                      </div>
                      {line.description && (
                        <p className="text-[10px] text-gray-500 font-normal mt-0.5 leading-snug" dir="auto">
                          {line.description}
                        </p>
                      )}
                    </td>

                    {/* Unit */}
                    <td className="py-2 print:py-1 px-1 text-center text-gray-600 font-mono text-[11px] border-r border-gray-100 truncate">
                      {line.unit || 'م²'}
                    </td>

                    {/* Quantity */}
                    <td className="py-2 print:py-1 px-1 text-center font-bold text-gray-900 font-mono border-r border-gray-100">
                      {qty.toLocaleString()}
                    </td>

                    {/* Unit Price */}
                    <td className="py-2 print:py-1 px-2 print:px-1.5 text-right font-mono text-gray-800 border-r border-gray-100">
                      {price.toFixed(2)}
                    </td>

                    {/* Subtotal */}
                    <td className="py-2 print:py-1 px-2 print:px-1.5 text-right font-mono font-medium text-gray-900 border-r border-gray-100">
                      {subtotal.toFixed(2)}
                    </td>

                    {/* VAT % */}
                    <td className="py-2 print:py-1 px-1 text-center font-mono text-gray-600 border-r border-gray-100">
                      {vatRate}%
                    </td>

                    {/* VAT Amount */}
                    <td className="py-2 print:py-1 px-2 print:px-1.5 text-right font-mono text-gray-800 border-r border-gray-100">
                      {vat.toFixed(2)}
                    </td>

                    {/* Total (Incl. VAT) */}
                    <td className="py-2 print:py-1 px-2.5 print:px-2 text-right font-mono font-bold text-[#18324B] bg-amber-50/20">
                      {total.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* =========================================================
            6. Side-by-Side: Dedicated QR Code (Left) & Totals Table (Right)
            Protected with print-avoid-break to prevent awkward page splits
            ========================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:gap-2 items-start print-avoid-break">
          {/* Left: Dedicated Scannable ZATCA QR Code Container */}
          <div
            className="border border-gray-200 rounded-xl p-3.5 print:p-2 bg-white flex flex-col items-center justify-center text-center space-y-2 print:space-y-1 shadow-2xs"
            data-testid="zatca-qr-card"
          >
            {qrImageSrc ? (
              <img
                src={qrImageSrc}
                alt="ZATCA E-Invoice QR Code"
                className="w-32 h-32 object-contain rounded-lg p-1 border border-gray-100 shadow-xs print:w-24 print:h-24"
                data-testid="zatca-qr-img"
              />
            ) : qrLoading ? (
              <div className="w-32 h-32 print:w-24 print:h-24 flex flex-col items-center justify-center bg-gray-50 rounded-lg text-xs text-gray-500 border border-gray-100 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                <span>Generating QR / جارٍ توليد الرمز...</span>
              </div>
            ) : (
              <div className="w-32 h-32 print:w-24 print:h-24 flex flex-col items-center justify-center bg-gray-50 rounded-lg text-[11px] text-gray-500 border border-gray-200 p-2 text-center gap-1.5">
                <QrCode className="w-8 h-8 text-amber-500" />
                <span>Awaiting Tax No. / بانتظار الرقم الضريبي</span>
              </div>
            )}

            <div className="space-y-1 print:space-y-0.5 w-full text-center">
              {invoice.status === 'APPROVED' || invoice.status === 'SENT' ? (
                <div className="flex flex-col items-center gap-0.5">
                  <div className="inline-flex items-center gap-1.5 text-xs print:text-[11px] font-bold text-emerald-700" lang="en">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Verified ZATCA E-Invoice QR Code</span>
                  </div>
                  <span className="text-[11px] print:text-[10px] font-semibold text-emerald-700" lang="ar" dir="rtl">
                    رمز الفاتورة الإلكترونية المعتمد من هيئة الزكاة
                  </span>
                </div>
              ) : invoice.status === 'CANCELLED' ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Cancelled Invoice / فاتورة ملغاة</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-0.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700" lang="en">
                    <QrCode className="w-4 h-4 text-amber-600" />
                    <span>Draft Preview — Scannable ZATCA QR</span>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-700" lang="ar" dir="rtl">
                    معاينة مسودة — رمز قابل للمسح
                  </span>
                </div>
              )}

              <p className="text-[10px] text-gray-400 font-mono truncate max-w-full">
                {invoice.zatcaUuid
                  ? `UUID: ${invoice.zatcaUuid.slice(0, 18)}...`
                  : invoice.status === 'APPROVED'
                  ? 'ZATCA Phase 2 Verified'
                  : 'ZATCA Phase 1 Standard TLV'}
              </p>
            </div>
          </div>

          {/* Right: Symmetrical 3-Column Financial Totals Table */}
          {/* Format: English Label (Left) | Amount with Currency (Center) | Arabic Label (Right) */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 text-xs shadow-2xs">
            <div className="divide-y divide-gray-200">
              {/* Row 1: Subtotal */}
              <div className="flex items-center justify-between py-2 print:py-1 px-3.5 print:px-2.5 bg-white">
                <span className="text-left font-semibold text-gray-700 w-5/12" lang="en" dir="ltr">
                  Subtotal (Excl. VAT)
                </span>
                <span className="text-center font-mono font-bold text-gray-900 w-3/12 whitespace-nowrap">
                  {Number(invoice.subtotal || 0).toFixed(2)} {curr.symbol}
                </span>
                <span className="text-right font-semibold text-gray-700 w-4/12" lang="ar" dir="rtl">
                  الإجمالي غير شامل الضريبة
                </span>
              </div>

              {/* Row 2: Discount (if applicable) */}
              {Number(invoice.discountAmount || 0) > 0 && (
                <div className="flex items-center justify-between py-2 print:py-1 px-3.5 print:px-2.5 bg-white text-rose-600">
                  <span className="text-left font-semibold w-5/12" lang="en" dir="ltr">
                    Discount Amount
                  </span>
                  <span className="text-center font-mono font-bold w-3/12 whitespace-nowrap">
                    - {Number(invoice.discountAmount).toFixed(2)} {curr.symbol}
                  </span>
                  <span className="text-right font-semibold w-4/12" lang="ar" dir="rtl">
                    مبلغ الخصم التجاري
                  </span>
                </div>
              )}

              {/* Row 3: Taxable Amount */}
              <div className="flex items-center justify-between py-2 print:py-1 px-3.5 print:px-2.5 bg-white">
                <span className="text-left font-semibold text-gray-700 w-5/12" lang="en" dir="ltr">
                  Taxable Amount
                </span>
                <span className="text-center font-mono font-bold text-gray-900 w-3/12 whitespace-nowrap">
                  {Number(invoice.taxableAmount || 0).toFixed(2)} {curr.symbol}
                </span>
                <span className="text-right font-semibold text-gray-700 w-4/12" lang="ar" dir="rtl">
                  المبلغ الخاضع للضريبة
                </span>
              </div>

              {/* Row 4: VAT Amount */}
              <div className="flex items-center justify-between py-2 print:py-1 px-3.5 print:px-2.5 bg-white">
                <span className="text-left font-semibold text-gray-700 w-5/12" lang="en" dir="ltr">
                  VAT Amount ({Number(invoice.vatRate || 15)}%)
                </span>
                <span className="text-center font-mono font-bold text-[#E29A26] w-3/12 whitespace-nowrap">
                  {Number(invoice.vatAmount || 0).toFixed(2)} {curr.symbol}
                </span>
                <span className="text-right font-semibold text-gray-700 w-4/12" lang="ar" dir="rtl">
                  ضريبة القيمة المضافة ({Number(invoice.vatRate || 15)}%)
                </span>
              </div>

              {/* Row 5: Total Including VAT (Prominent Highlighted Row) */}
              <div className="flex items-center justify-between py-2.5 print:py-1.5 px-3.5 print:px-2.5 bg-[#18324B] text-white">
                <span className="text-left text-xs sm:text-sm print:text-xs font-extrabold uppercase tracking-wide w-5/12" lang="en" dir="ltr">
                  TOTAL (INCL. VAT)
                </span>
                <span className="text-center font-mono text-sm sm:text-base print:text-sm font-extrabold text-[#FFF4DF] w-3/12 whitespace-nowrap">
                  {totalAmountNum.toFixed(2)} {curr.symbol}
                </span>
                <span className="text-right text-xs sm:text-sm print:text-xs font-extrabold w-4/12" lang="ar" dir="rtl">
                  الإجمالي شامل الضريبة
                </span>
              </div>

              {/* Row 6 & 7: Payment Breakdown (Paid & Remaining) */}
              {!isNote && (
                <>
                  <div className="flex items-center justify-between py-1.5 print:py-1 px-3.5 print:px-2.5 bg-white text-emerald-700">
                    <span className="text-left font-semibold w-5/12" lang="en" dir="ltr">
                      Amount Paid
                    </span>
                    <span className="text-center font-mono font-bold w-3/12 whitespace-nowrap">
                      {Number(invoice.paidAmount || 0).toFixed(2)} {curr.symbol}
                    </span>
                    <span className="text-right font-semibold w-4/12" lang="ar" dir="rtl">
                      المبلغ المدفوع
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 print:py-1 px-3.5 print:px-2.5 bg-white text-amber-900">
                    <span className="text-left font-semibold w-5/12" lang="en" dir="ltr">
                      Remaining Balance
                    </span>
                    <span className="text-center font-mono font-bold w-3/12 whitespace-nowrap">
                      {Number(invoice.remainingAmount || 0).toFixed(2)} {curr.symbol}
                    </span>
                    <span className="text-right font-semibold w-4/12" lang="ar" dir="rtl">
                      الرصيد المتبقي
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================
            7. Amount in Words Box (Bilingual Tafqeet: English Left, Arabic Right)
            Protected with print-avoid-break
            ========================================================= */}
        <div className="p-3 print:py-1.5 print:px-2.5 rounded-xl border border-gray-200 bg-gray-50/70 text-xs shadow-2xs print-avoid-break">
          <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-2.5 divide-y md:divide-y-0 md:divide-x print:divide-y-0 print:divide-x divide-gray-200">
            {/* English Amount in Words (Left) */}
            <div className="text-left space-y-0.5" lang="en" dir="ltr">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Total Amount in Words (English)
              </span>
              <p className="font-semibold text-gray-900 leading-snug">
                {englishWords}
              </p>
            </div>

            {/* Arabic Amount in Words (Right) */}
            <div className="text-right space-y-0.5 pt-1.5 md:pt-0 md:pr-4 print:pt-0 print:pr-3" lang="ar" dir="rtl">
              <span className="text-[10px] font-bold text-gray-500 tracking-wider block">
                إجمالي المبلغ المستحق كتابة (باللغة العربية)
              </span>
              <p className="font-semibold text-gray-900 leading-snug">
                {arabicWords}
              </p>
            </div>
          </div>
        </div>

        {/* =========================================================
            8. Payment History & Recorded Transactions Section
            Bilingual, print-optimized table with print-avoid-break
            ========================================================= */}
        {!isNote && Array.isArray(invoice.payments) && invoice.payments.length > 0 && (
          <div className="border border-gray-200 rounded-xl p-3 print:py-1.5 print:px-2 bg-white text-xs space-y-2 print:space-y-1 shadow-2xs print-avoid-break">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1.5 print:pb-1">
              <span className="font-bold text-[#18324B] uppercase tracking-wide text-left" lang="en" dir="ltr">
                Payment History & Recorded Transactions
              </span>
              <span className="text-[10px] text-gray-500 font-medium">
                {invoice.payments.length}{' '}
                {invoice.payments.length === 1
                  ? 'Transaction / دفعة مسجلة'
                  : 'Transactions / دفعات مسجلة'}
              </span>
              <span className="font-bold text-[#18324B] text-right" lang="ar" dir="rtl">
                سجل سداد الفاتورة والعمليات المالية المقيدة
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border border-gray-100 rounded-lg overflow-hidden">
                <thead className="bg-[#18324B]/5 text-gray-700 font-bold border-b border-gray-200 text-[11px] print:text-[10px]">
                  <tr>
                    <th className="py-1.5 px-2.5 text-start w-24">
                      <span className="block" lang="en" dir="ltr">Date</span>
                      <span className="block text-[10px] text-gray-500" lang="ar" dir="rtl">التاريخ</span>
                    </th>
                    <th className="py-1.5 px-2.5 text-start w-32">
                      <span className="block" lang="en" dir="ltr">Method</span>
                      <span className="block text-[10px] text-gray-500" lang="ar" dir="rtl">طريقة الدفع</span>
                    </th>
                    <th className="py-1.5 px-2.5 text-start">
                      <span className="block" lang="en" dir="ltr">Reference & Transaction Details</span>
                      <span className="block text-[10px] text-gray-500" lang="ar" dir="rtl">المرجع وتفاصيل العملية</span>
                    </th>
                    <th className="py-1.5 px-2.5 text-end w-28">
                      <span className="block" lang="en" dir="ltr">Amount Paid</span>
                      <span className="block text-[10px] text-gray-500" lang="ar" dir="rtl">المبلغ المسدد</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoice.payments.map((p: any, idx: number) => {
                    const methodInfo = (() => {
                      switch (p.method) {
                        case 'BANK_TRANSFER':
                          return { ar: 'تحويل بنكي', en: 'Bank Transfer' }
                        case 'CASH':
                          return { ar: 'نقداً', en: 'Cash' }
                        case 'CARD':
                          return { ar: 'بطاقة مدى / ائتمان', en: 'Card / Mada' }
                        case 'CHEQUE':
                          return { ar: 'شيك مصرفي', en: 'Cheque' }
                        case 'OTHER':
                        default:
                          return { ar: 'أخرى', en: 'Other' }
                      }
                    })()

                    const detailParts: { labelAr: string; labelEn: string; val: string }[] = []
                    if (p.method === 'BANK_TRANSFER') {
                      if (p.bankAccount?.bankNameAr || p.bankAccount?.bankNameEn) {
                        detailParts.push({
                          labelAr: 'الحساب المستلم',
                          labelEn: 'Receiving Bank',
                          val: p.bankAccount.bankNameAr || p.bankAccount.bankNameEn,
                        })
                      }
                      if (p.senderBankName) {
                        detailParts.push({
                          labelAr: 'بنك المحول',
                          labelEn: 'Sender Bank',
                          val: p.senderBankName,
                        })
                      }
                      if (p.transferDate) {
                        detailParts.push({
                          labelAr: 'تاريخ التحويل',
                          labelEn: 'Transfer Date',
                          val: p.transferDate.slice(0, 10),
                        })
                      }
                      if (p.referenceNo) {
                        detailParts.push({
                          labelAr: 'المرجع البنكي',
                          labelEn: 'Ref No',
                          val: p.referenceNo,
                        })
                      }
                    } else if (p.method === 'CASH') {
                      if (p.receiptNumber) {
                        detailParts.push({
                          labelAr: 'سند قبض رقم',
                          labelEn: 'Receipt Voucher',
                          val: p.receiptNumber,
                        })
                      }
                      if (p.referenceNo) {
                        detailParts.push({
                          labelAr: 'المرجع',
                          labelEn: 'Ref No',
                          val: p.referenceNo,
                        })
                      }
                    } else if (p.method === 'CARD') {
                      if (p.cardProvider) {
                        detailParts.push({
                          labelAr: 'الشبكة',
                          labelEn: 'Provider',
                          val: p.cardProvider,
                        })
                      }
                      if (p.referenceNo) {
                        detailParts.push({
                          labelAr: 'رقم العملية (Auth)',
                          labelEn: 'Auth / Ref',
                          val: p.referenceNo,
                        })
                      }
                      if (p.terminalId) {
                        detailParts.push({
                          labelAr: 'جهاز نقاط البيع (POS)',
                          labelEn: 'Terminal ID',
                          val: p.terminalId,
                        })
                      }
                    } else if (p.method === 'CHEQUE') {
                      if (p.chequeNumber) {
                        detailParts.push({
                          labelAr: 'رقم الشيك',
                          labelEn: 'Cheque No',
                          val: p.chequeNumber,
                        })
                      }
                      if (p.senderBankName) {
                        detailParts.push({
                          labelAr: 'المسحوب عليه',
                          labelEn: 'Drawee Bank',
                          val: p.senderBankName,
                        })
                      }
                      if (p.chequeDate) {
                        detailParts.push({
                          labelAr: 'تاريخ الشيك',
                          labelEn: 'Cheque Date',
                          val: p.chequeDate.slice(0, 10),
                        })
                      }
                      if (p.referenceNo) {
                        detailParts.push({
                          labelAr: 'المرجع',
                          labelEn: 'Ref No',
                          val: p.referenceNo,
                        })
                      }
                    } else {
                      if (p.description) {
                        detailParts.push({
                          labelAr: 'البيان',
                          labelEn: 'Description',
                          val: p.description,
                        })
                      }
                      if (p.referenceNo) {
                        detailParts.push({
                          labelAr: 'المرجع',
                          labelEn: 'Ref No',
                          val: p.referenceNo,
                        })
                      }
                    }

                    return (
                      <tr key={p.id || idx} className="hover:bg-gray-50/50">
                        <td className="py-1.5 px-2.5 font-mono text-[11px] text-gray-800 whitespace-nowrap align-top">
                          {formatLocalDate(p.paymentDate)}
                        </td>
                        <td className="py-1.5 px-2.5 align-top">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                            <span>{methodInfo.en}</span>
                            <span className="text-gray-400">/</span>
                            <span dir="rtl">{methodInfo.ar}</span>
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 text-gray-700 align-top">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                            {detailParts.length === 0 && (
                              <span className="text-gray-400 font-mono text-xs">-</span>
                            )}
                            {detailParts.map((d, dIdx) => (
                              <span
                                key={dIdx}
                                className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200/80 rounded px-1.5 py-0.5"
                              >
                                <span className="text-gray-500 text-[10px]">
                                  {d.labelEn} / {d.labelAr}:
                                </span>
                                <span className="font-semibold text-gray-900 font-mono text-[10.5px]">
                                  {d.val}
                                </span>
                              </span>
                            ))}
                            {p.notes && (
                              <span className="text-gray-500 italic text-[10px] block w-full">
                                ملاحظة / Note: {p.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 px-2.5 text-end font-mono font-bold text-emerald-800 whitespace-nowrap align-top text-xs">
                          {Number(p.amount).toFixed(2)} {curr.symbol}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50/80 border-t border-gray-200 font-semibold text-[11px]">
                  <tr>
                    <td colSpan={3} className="py-1.5 px-2.5 text-end text-gray-600">
                      <span lang="en">Total Settled to Date / </span>
                      <span lang="ar" dir="rtl">إجمالي المسدد حتى تاريخه:</span>
                    </td>
                    <td className="py-1.5 px-2.5 text-end font-mono font-extrabold text-emerald-800">
                      {Number(invoice.paidAmount || 0).toFixed(2)} {curr.symbol}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================
            9. Bank Details & Settlement Instructions: Bilingual
            Protected with print-avoid-break
            ========================================================= */}
        {(() => {
          const activeBank = invoice.defaultBankAccount || orgSnapshot.defaultBankAccount || null
          const bankNameAr = activeBank?.bankNameAr || 'البنك الأهلي السعودي'
          const bankNameEn = activeBank?.bankNameEn || 'Saudi National Bank (SNB)'
          const beneficiaryAr =
            activeBank?.beneficiaryNameAr || orgSnapshot.businessName || 'شركة بنيان للمقاولات'
          const beneficiaryEn =
            activeBank?.beneficiaryNameEn || orgSnapshot.businessNameEn || 'BUNYAN CONTRACTING CO.'
          const rawIban = activeBank?.iban || 'SA0310000000000000000000'
          const displayIban = rawIban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim()
          const isPaidInFull =
            !isNote &&
            Number(invoice.remainingAmount || 0) <= 0 &&
            Number(invoice.paidAmount || 0) > 0

          if (isPaidInFull) {
            return (
              <div className="border border-emerald-300 bg-emerald-50/70 rounded-xl p-3 print:py-1.5 print:px-2 text-xs space-y-1.5 print:space-y-1 shadow-2xs print-avoid-break">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5 print:pb-1">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-bold" lang="en" dir="ltr">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="uppercase tracking-wide">Invoice Fully Paid & Settled</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                    SETTLED • مسددة بالكامل
                  </span>
                  <div className="flex items-center gap-1.5 text-emerald-900 font-bold" lang="ar" dir="rtl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>تم سداد كامل قيمة الفاتورة • شكراً لتعاملكم</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row print:flex-row items-center justify-between text-[11px] print:text-[10px] text-emerald-900 gap-1 pt-0.5">
                  <div className="text-left" lang="en" dir="ltr">
                    <span className="text-emerald-700 font-medium">Official Receiving Account: </span>
                    <span className="font-semibold">{bankNameEn}</span>
                    <span className="font-mono ml-2 text-emerald-950 font-bold">{displayIban}</span>
                  </div>
                  <div className="text-right" lang="ar" dir="rtl">
                    <span className="text-emerald-700 font-medium">الحساب البنكي المعتمد: </span>
                    <span className="font-semibold">{bankNameAr}</span>
                    <span className="font-mono mr-2 text-emerald-950 font-bold">{displayIban}</span>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div className="border border-gray-200 rounded-xl p-3 print:py-1.5 print:px-2 bg-white text-xs space-y-2 print:space-y-1 shadow-2xs print-avoid-break">
              <div className="flex items-center justify-between border-b border-gray-100 pb-1.5 print:pb-1">
                <span className="font-bold text-[#18324B] uppercase tracking-wide text-left" lang="en" dir="ltr">
                  Bank Payment Instructions
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  CURRENCY / العملة: {curr.symbol} ({curr.arWord})
                </span>
                <span className="font-bold text-[#18324B] text-right" lang="ar" dir="rtl">
                  البيانات والتعليمات البنكية للسداد
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-2 print:gap-1.5 text-gray-700">
                {/* Bank Name */}
                <div className="border border-gray-100 rounded-lg p-2 print:py-1 print:px-1.5 bg-gray-50/50 flex flex-col justify-between">
                  <div className="text-left" lang="en" dir="ltr">
                    <span className="text-[10px] font-bold text-gray-500 uppercase block">Bank Name</span>
                    <span className="font-medium text-gray-900 text-xs">{bankNameEn}</span>
                  </div>
                  <div className="text-right mt-1 pt-1 border-t border-gray-100" lang="ar" dir="rtl">
                    <span className="text-[10px] font-bold text-gray-500 block">اسم البنك</span>
                    <span className="font-medium text-gray-900 text-xs">{bankNameAr}</span>
                  </div>
                </div>

                {/* Beneficiary Name */}
                <div className="border border-gray-100 rounded-lg p-2 print:py-1 print:px-1.5 bg-gray-50/50 flex flex-col justify-between">
                  <div className="text-left" lang="en" dir="ltr">
                    <span className="text-[10px] font-bold text-gray-500 uppercase block">Beneficiary Name</span>
                    <span className="font-medium text-gray-900 text-xs truncate block">
                      {beneficiaryEn}
                    </span>
                  </div>
                  <div className="text-right mt-1 pt-1 border-t border-gray-100" lang="ar" dir="rtl">
                    <span className="text-[10px] font-bold text-gray-500 block">اسم المستفيد</span>
                    <span className="font-medium text-gray-900 text-xs truncate block">
                      {beneficiaryAr}
                    </span>
                  </div>
                </div>

                {/* IBAN */}
                <div className="border border-gray-100 rounded-lg p-2 print:py-1 print:px-1.5 bg-gray-50/50 flex flex-col justify-between">
                  <div className="text-left" lang="en" dir="ltr">
                    <span className="text-[10px] font-bold text-gray-500 uppercase block">IBAN Number</span>
                    <span className="font-mono font-bold text-gray-900 text-xs tracking-wider">
                      {displayIban}
                    </span>
                  </div>
                  <div className="text-right mt-1 pt-1 border-t border-gray-100" lang="ar" dir="rtl">
                    <span className="text-[10px] font-bold text-gray-500 block">رقم الآيبان الرسمي</span>
                    <span className="font-mono font-bold text-gray-900 text-xs tracking-wider">
                      {displayIban}
                    </span>
                  </div>
                </div>
              </div>

              {/* Extra account metadata if available */}
              {(activeBank?.branch || activeBank?.swiftCode || activeBank?.accountNumber) && (
                <div className="flex flex-wrap items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100 gap-2">
                  {activeBank.accountNumber && (
                    <div>
                      <span className="font-medium">Account No / رقم الحساب: </span>
                      <span className="font-mono font-bold text-gray-700">
                        {activeBank.accountNumber}
                      </span>
                    </div>
                  )}
                  {activeBank.swiftCode && (
                    <div>
                      <span className="font-medium">SWIFT / BIC: </span>
                      <span className="font-mono font-bold text-gray-700">
                        {activeBank.swiftCode}
                      </span>
                    </div>
                  )}
                  {activeBank.branch && (
                    <div>
                      <span className="font-medium">Branch / الفرع: </span>
                      <span className="text-gray-700">{activeBank.branch}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* =========================================================
            9. Three Signatures and Stamp Boxes: Bilingual
            Protected with print-avoid-break
            ========================================================= */}
        <div className="grid grid-cols-3 gap-2.5 print:gap-1.5 pt-1 text-xs print-avoid-break">
          {/* Box 1: Prepared By */}
          <div className="border border-gray-200 rounded-xl p-2.5 print:p-1.5 text-center bg-white min-h-[90px] print:min-h-[58px] flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase" lang="en" dir="ltr">Prepared By</span>
              <span className="text-[10px] font-bold text-gray-500" lang="ar" dir="rtl">أعدت بواسطة</span>
            </div>
            <div className="border-t border-dashed border-gray-300 pt-1 text-[11px] text-gray-600 font-medium">
              {invoice.createdBy?.nameAr || 'المحاسب المسؤول'}
            </div>
          </div>

          {/* Box 2: Approved By */}
          <div className="border border-gray-200 rounded-xl p-2.5 print:p-1.5 text-center bg-white min-h-[90px] print:min-h-[58px] flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase" lang="en" dir="ltr">Approved By</span>
              <span className="text-[10px] font-bold text-gray-500" lang="ar" dir="rtl">اعتمدت بواسطة</span>
            </div>
            <div className="border-t border-dashed border-gray-300 pt-1 text-[11px] text-gray-600 font-medium">
              الإدارة المالية / المدير العام
            </div>
          </div>

          {/* Box 3: Received By (Client) */}
          <div className="border border-gray-200 rounded-xl p-2.5 print:p-1.5 text-center bg-white min-h-[90px] print:min-h-[58px] flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase" lang="en" dir="ltr">Received By</span>
              <span className="text-[10px] font-bold text-gray-500" lang="ar" dir="rtl">استلمت بواسطة (العميل)</span>
            </div>
            <div className="border-t border-dashed border-gray-300 pt-1 text-[11px] text-gray-500">
              الاسم والتوقيع والختم الرسمي
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          10. Footer & Bottom Gold Accent Line
          ========================================================= */}
      <div className="border-t border-gray-200 bg-gray-50 py-2.5 print:py-1.5 px-6 print:px-3 flex flex-col sm:flex-row print:flex-row items-center justify-between text-[11px] print:text-[10px] text-gray-500 font-sans gap-2" dir="ltr">
        <span className="text-left font-medium" lang="en">
          BUNYAN Construction Management Platform • Official Tax Invoice
        </span>
        <span className="font-mono font-bold text-gray-700">
          PAGE 1 OF 1 • REF: {invoice.referenceNo}
        </span>
        <span className="text-right font-medium" lang="ar" dir="rtl">
          منصة بنيان لإدارة أعمال المقاولات • فاتورة ضريبية رسمية
        </span>
      </div>
      <div className="h-1.5 bg-[#E29A26] w-full print:bg-[#E29A26]" />
    </div>
  )
}
