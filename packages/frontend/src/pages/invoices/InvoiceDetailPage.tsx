import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import {
  ArrowLeft,
  ArrowRight,
  Printer,
  CheckCircle2,
  XCircle,
  CreditCard,
  Download,
  ShieldCheck,
  FilePlus2,
  Link2,
  X,
  Trash2,
} from 'lucide-react'
import { api } from '../../lib/api'
import {
  buildZatcaPhase1TlvBase64,
  decodeZatcaTlvBase64,
  generateZatcaQrDataUrl,
} from '../../lib/zatca'
import { ProfessionalTaxInvoice } from '../../components/invoices/ProfessionalTaxInvoice'
import { PaymentRegistrationModal } from '../../components/payments/PaymentRegistrationModal'

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const isAr = i18n.language === 'ar'

  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')
  const [localQrDataUrl, setLocalQrDataUrl] = useState<string | null>(null)
  const [localDecodedTags, setLocalDecodedTags] = useState<Record<number, string>>({})

  const [noteForm, setNoteForm] = useState({
    noteType: 'CREDIT_NOTE' as 'CREDIT_NOTE' | 'DEBIT_NOTE',
    reason: '',
    issueDate: new Date().toISOString().slice(0, 10),
    itemNameAr: 'تسوية مالية على الفاتورة الأصلية',
    unit: 'مقطوعية',
    quantity: '1',
    unitPrice: '',
    releaseWorkQuantity: false,
  })

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await api.get(`/invoices/${id}`)
      return res.data?.data
    },
    enabled: !!id,
  })

  const { data: zatcaData, isLoading: zatcaLoading } = useQuery({
    queryKey: ['invoice-zatca', id],
    queryFn: async () => {
      const res = await api.get(`/invoices/${id}/zatca`)
      return res.data?.data
    },
    enabled: !!id,
  })

  // Generate client-side real QR Data URL and decode tags if needed
  useEffect(() => {
    let tlvPayload = zatcaData?.zatcaQrCode || invoice?.zatcaQrCode

    // If TLV is not yet provided by backend, synthesize it from snapshot data
    if (!tlvPayload && invoice) {
      const orgSnap = (invoice.orgSnapshot || {}) as Record<string, any>
      const sellerName = (orgSnap.businessName || orgSnap.businessNameAr || '').trim()
      const vatNumber = (orgSnap.vatNumber || '').trim()
      if (sellerName && vatNumber) {
        try {
          const timestampIso = invoice.issueDate
            ? new Date(invoice.issueDate).toISOString()
            : new Date(invoice.createdAt).toISOString()
          tlvPayload = buildZatcaPhase1TlvBase64({
            sellerName,
            vatNumber,
            timestampIso,
            totalWithVat: invoice.totalAmount,
            vatTotal: invoice.vatAmount,
          })
        } catch {
          // Incomplete data
        }
      }
    }

    if (!tlvPayload) {
      setLocalQrDataUrl(null)
      setLocalDecodedTags({})
      return
    }

    // Decode tags for inspector
    const tags = decodeZatcaTlvBase64(tlvPayload)
    setLocalDecodedTags(tags)

    if (zatcaData?.qrCodeDataUrl) {
      setLocalQrDataUrl(zatcaData.qrCodeDataUrl)
      return
    }

    generateZatcaQrDataUrl(tlvPayload)
      .then((url) => setLocalQrDataUrl(url))
      .catch(() => setLocalQrDataUrl(null))
  }, [zatcaData?.zatcaQrCode, zatcaData?.qrCodeDataUrl, invoice])

  const approveMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/invoices/${id}/approve`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['invoice-zatca', id] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error?.message || 'Error approving invoice')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      await api.post(`/invoices/${id}/cancel`, { cancellationReason: reason })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      queryClient.invalidateQueries({ queryKey: ['workEntries'] })
      setCancelModalOpen(false)
      setCancellationReason('')
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error?.message || 'Error cancelling invoice')
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/invoices/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/invoices')
    },
    onError: (err: any) => {
      setErrorMsg(
        err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف مسودة الفاتورة' : 'Failed to delete draft invoice')
      )
    },
  })

  const issueNoteMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post(`/invoices/${id}/notes`, payload)
      return res.data?.data
    },
    onSuccess: (createdNote) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['invoice-zatca', id] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setNoteModalOpen(false)
      setErrorMsg(null)
      if (createdNote?.id) {
        navigate(`/invoices/${createdNote.id}`)
      }
    },
    onError: (err: any) => {
      setErrorMsg(
        err?.response?.data?.error?.message ||
          (isAr ? 'تعذر إصدار الإشعار' : 'Failed to issue credit/debit note')
      )
    },
  })

  if (isLoading) {
    return (
      <div className="p-12 text-center text-gray-500">
        {isAr ? 'جاري تحميل الفاتورة...' : 'Loading invoice...'}
      </div>
    )
  }

  if (isError || !invoice) {
    return (
      <div className="p-12 text-center space-y-3">
        <p className="text-red-600">{isAr ? 'الفاتورة غير موجودة' : 'Invoice not found'}</p>
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          {isAr ? 'العودة للفواتير' : 'Back to Invoices'}
        </button>
      </div>
    )
  }

  const BackIcon = isAr ? ArrowRight : ArrowLeft
  const orgSnapshot = (invoice.orgSnapshot || {}) as Record<string, any>
  const clientSnapshot = (invoice.clientSnapshot || invoice.client || {}) as Record<string, any>
  const decodedTags =
    zatcaData?.decodedQrTags && Object.keys(zatcaData.decodedQrTags).length > 0
      ? zatcaData.decodedQrTags
      : localDecodedTags
  const zatcaResp = (invoice.zatcaResponse || {}) as Record<string, any>
  const qrImageSrc = zatcaData?.qrCodeDataUrl || zatcaResp.qrCodeDataUrl || localQrDataUrl

  const isSimplified =
    invoice.invoiceType === 'SIMPLIFIED_TAX_INVOICE' ||
    invoice.invoiceType === 'SIMPLIFIED_INVOICE'
  const isCreditNote = invoice.invoiceType === 'CREDIT_NOTE'
  const isDebitNote = invoice.invoiceType === 'DEBIT_NOTE'
  const isNote = isCreditNote || isDebitNote

  const getDocumentTitle = () => {
    if (isCreditNote) {
      return isAr ? 'إشعار دائن ضريبي' : 'TAX CREDIT NOTE'
    }
    if (isDebitNote) {
      return isAr ? 'إشعار مدين ضريبي' : 'TAX DEBIT NOTE'
    }
    if (isSimplified) {
      return isAr ? 'فاتورة ضريبية مبسطة' : 'SIMPLIFIED TAX INVOICE'
    }
    return isAr ? 'فاتورة ضريبية' : 'TAX INVOICE'
  }

  const getSubtypeLabel = () => {
    if (isCreditNote) {
      return isAr
        ? 'إشعار دائن ضريبي (ZATCA TypeCode 381)'
        : 'Tax Credit Note (ZATCA TypeCode 381)'
    }
    if (isDebitNote) {
      return isAr
        ? 'إشعار مدين ضريبي (ZATCA TypeCode 383)'
        : 'Tax Debit Note (ZATCA TypeCode 383)'
    }
    if (isSimplified) {
      return isAr
        ? 'فاتورة ضريبية مبسطة (ZATCA Subtype 0200000 - TypeCode 388)'
        : 'Simplified Tax Invoice (ZATCA Subtype 0200000 - TypeCode 388)'
    }
    return isAr
      ? 'فاتورة ضريبية قياسية (ZATCA Subtype 0100000 - TypeCode 388)'
      : 'Standard Tax Invoice (ZATCA Subtype 0100000 - TypeCode 388)'
  }

  const downloadZatcaXml = () => {
    if (!invoice.zatcaXml) return
    const blob = new Blob([invoice.zatcaXml], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${invoice.referenceNo}-ZATCA-UBL21.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Action Bar (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/invoices')}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          >
            <BackIcon className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{invoice.referenceNo}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                {invoice.status}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                {invoice.paymentStatus}
              </span>
            </div>
            <p className="text-xs text-gray-500">{getSubtypeLabel()}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" />
            <span>{isAr ? 'طباعة PDF (A4)' : 'Print PDF (A4)'}</span>
          </button>

          {invoice.zatcaXml && (
            <button
              type="button"
              onClick={downloadZatcaXml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-semibold hover:bg-emerald-100"
            >
              <Download className="w-4 h-4" />
              <span>{isAr ? 'تحميل ZATCA XML (UBL 2.1)' : 'Download ZATCA XML'}</span>
            </button>
          )}

          {invoice.status === 'DRAFT' && (
            <>
              <button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAr ? 'اعتماد وإصدار الفاتورة' : 'Approve & Issue'}</span>
              </button>
              <button
                type="button"
                disabled={deleteDraftMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      isAr
                        ? 'هل أنت متأكد من رغبتك في حذف مسودة الفاتورة نهائياً؟'
                        : 'Are you sure you want to permanently delete this draft invoice?'
                    )
                  ) {
                    deleteDraftMutation.mutate()
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isAr ? 'حذف المسودة نهائياً' : 'Delete Draft'}</span>
              </button>
            </>
          )}

          {(invoice.status === 'APPROVED' || invoice.status === 'SENT') && !isNote && (
            <button
              type="button"
              onClick={() => {
                setNoteForm({
                  noteType: 'CREDIT_NOTE',
                  reason: '',
                  issueDate: new Date().toISOString().slice(0, 10),
                  itemNameAr: isAr
                    ? `تسوية على الفاتورة رقم ${invoice.referenceNo}`
                    : `Adjustment on Invoice ${invoice.referenceNo}`,
                  unit: isAr ? 'مقطوعية' : 'Lump sum',
                  quantity: '1',
                  unitPrice: String(Number(invoice.taxableAmount)),
                  releaseWorkQuantity: false,
                })
                setNoteModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm font-semibold hover:bg-amber-100"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>{isAr ? 'إصدار إشعار دائن / مدين' : 'Issue Credit / Debit Note'}</span>
            </button>
          )}

          {invoice.status !== 'CANCELLED' && !isNote && Number(invoice.remainingAmount) > 0 && (
            <button
              type="button"
              onClick={() => setPaymentModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <CreditCard className="w-4 h-4" />
              <span>{isAr ? 'تسجيل دفعة' : 'Record Payment'}</span>
            </button>
          )}

          {invoice.status !== 'CANCELLED' && !isNote && Number(invoice.paidAmount) === 0 && (
            <button
              type="button"
              onClick={() => setCancelModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
            >
              <XCircle className="w-4 h-4" />
              <span>{isAr ? 'إلغاء الفاتورة' : 'Cancel'}</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm print:hidden">
          {errorMsg}
        </div>
      )}

      {/* A4 Printable Tax Invoice Sheet */}
      <ProfessionalTaxInvoice
        invoice={invoice}
        qrImageSrc={qrImageSrc}
        zatcaData={zatcaData}
        qrLoading={zatcaLoading && !qrImageSrc}
      />

      {/* Linked Credit / Debit Notes Section (Hidden in Print) */}
      {Array.isArray(invoice.relatedNotes) && invoice.relatedNotes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4 print:hidden">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Link2 className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-gray-900">
              {isAr
                ? 'الإشعارات الدائنة والمدينة المرتبطة بهذه الفاتورة'
                : 'Linked Credit & Debit Notes'}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-start">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-4 text-start">{isAr ? 'رقم الإشعار' : 'Note No'}</th>
                  <th className="py-2.5 px-4 text-start">{isAr ? 'النوع' : 'Type'}</th>
                  <th className="py-2.5 px-4 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="py-2.5 px-4 text-start">{isAr ? 'السبب' : 'Reason'}</th>
                  <th className="py-2.5 px-4 text-end">{isAr ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoice.relatedNotes.map((n: any) => (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-blue-600">
                      <Link to={`/invoices/${n.id}`} className="hover:underline">
                        {n.referenceNo}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-semibold">
                      {n.invoiceType === 'CREDIT_NOTE'
                        ? isAr
                          ? 'إشعار دائن (381)'
                          : 'Credit Note (381)'
                        : isAr
                        ? 'إشعار مدين (383)'
                        : 'Debit Note (383)'}
                    </td>
                    <td className="py-2.5 px-4">
                      {n.issueDate ? n.issueDate.slice(0, 10) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-gray-600">{n.cancellationReason || '-'}</td>
                    <td className="py-2.5 px-4 text-end font-bold">
                      {Number(n.totalAmount).toFixed(2)} SAR
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ZATCA E-Invoicing Technical Details Card (Hidden in Print) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4 print:hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="text-base font-bold text-gray-900">
            {isAr
              ? 'بيانات الفوترة الإلكترونية السعودية والتسلسل التشفيري (ZATCA TLV, UBL 2.1, ICV & PIH)'
              : 'ZATCA E-Invoicing & Cryptographic Chain Metadata (TLV, UBL 2.1, ICV & PIH)'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-1.5">
            <span className="font-bold text-gray-700 block">
              {isAr ? 'حقول TLV المشفرة في رمز QR (Tags 1–5):' : 'Decoded ZATCA TLV QR Tags:'}
            </span>
            <p>
              <strong>Tag 1 (Seller):</strong> {decodedTags[1] || '-'}
            </p>
            <p>
              <strong>Tag 2 (VAT No):</strong>{' '}
              <span className="font-mono">{decodedTags[2] || '-'}</span>
            </p>
            <p>
              <strong>Tag 3 (Timestamp):</strong>{' '}
              <span className="font-mono">{decodedTags[3] || '-'}</span>
            </p>
            <p>
              <strong>Tag 4 (Invoice Total):</strong> {decodedTags[4] || '-'} SAR
            </p>
            <p>
              <strong>Tag 5 (VAT Total):</strong> {decodedTags[5] || '-'} SAR
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 space-y-1.5">
            <span className="font-bold text-gray-700 block">
              {isAr
                ? 'التسلسل التشفيري للفواتير (ICV & PIH) والهاش (SHA-256):'
                : 'Cryptographic Counter (ICV), Previous Hash (PIH) & SHA-256:'}
            </span>
            <p>
              <strong>ZATCA Status:</strong> {invoice.zatcaStatus}
            </p>
            <p>
              <strong>ICV (Invoice Counter Value):</strong>{' '}
              <span className="font-mono font-bold text-blue-700">
                {zatcaData?.icv ?? zatcaResp.icv ?? '-'}
              </span>
            </p>
            <p className="break-all">
              <strong>PIH (Previous Invoice Hash):</strong>{' '}
              <span className="font-mono text-[11px]">
                {zatcaData?.pih ?? zatcaResp.pih ?? '-'}
              </span>
            </p>
            <p className="break-all">
              <strong>Current XML SHA-256 Hash:</strong>{' '}
              <span className="font-mono text-[11px]">
                {zatcaData?.xmlHash ?? zatcaResp.xmlHash ?? '-'}
              </span>
            </p>
            {zatcaData?.chainValid !== undefined && (
              <p>
                <strong>{isAr ? 'سلامة سلسلة الربط التشفيري:' : 'Cryptographic Chain Integrity:'}</strong>{' '}
                <span
                  className={`font-bold ${
                    zatcaData.chainValid ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {zatcaData.chainValid
                    ? isAr
                      ? 'سليمة ومترابطة (Valid ICV/PIH Chain)'
                      : 'Valid ICV/PIH Chain'
                    : isAr
                    ? 'غير مترابطة'
                    : 'Chain Broken'}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Payments Recorded on this Invoice (Hidden in Print) */}
      {!isNote && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4 print:hidden">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-base font-bold text-gray-900">
              {isAr ? 'سجل المدفوعات والتحصيلات المرتبطة بالفاتورة' : 'Recorded Payments & Receipts'}
            </h3>
            {Number(invoice.remainingAmount) > 0 && (
              <button
                type="button"
                onClick={() => setPaymentModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة دفعة جديدة' : 'Add Payment'}</span>
              </button>
            )}
          </div>
          {!invoice.payments || invoice.payments.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              {isAr ? 'لم يتم تسجيل أي دفعات لهذه الفاتورة بعد.' : 'No payments recorded yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-start">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 text-xs font-semibold">
                  <tr>
                    <th className="py-2.5 px-4 text-start">{isAr ? 'تاريخ الدفع' : 'Date'}</th>
                    <th className="py-2.5 px-4 text-start">{isAr ? 'طريقة السداد' : 'Method'}</th>
                    <th className="py-2.5 px-4 text-start">{isAr ? 'تفاصيل السداد والمرجع' : 'Details & Reference'}</th>
                    <th className="py-2.5 px-4 text-start">{isAr ? 'الحساب المستلم' : 'Receiving Account'}</th>
                    <th className="py-2.5 px-4 text-end">{isAr ? 'المبلغ المسدد' : 'Amount'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoice.payments.map((p: any) => {
                    const methodBadge = (() => {
                      switch (p.method) {
                        case 'BANK_TRANSFER':
                          return {
                            label: isAr ? 'تحويل بنكي' : 'Bank Transfer',
                            classes: 'bg-blue-50 text-blue-700 border-blue-200',
                          }
                        case 'CASH':
                          return {
                            label: isAr ? 'نقداً' : 'Cash',
                            classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          }
                        case 'CARD':
                          return {
                            label: isAr ? 'بطاقة بنكية / مدى' : 'Card / Mada',
                            classes: 'bg-purple-50 text-purple-700 border-purple-200',
                          }
                        case 'CHEQUE':
                          return {
                            label: isAr ? 'شيك مصرفي' : 'Cheque',
                            classes: 'bg-amber-50 text-amber-700 border-amber-200',
                          }
                        case 'OTHER':
                        default:
                          return {
                            label: isAr ? 'أخرى' : 'Other',
                            classes: 'bg-gray-50 text-gray-700 border-gray-200',
                          }
                      }
                    })()

                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                          {p.paymentDate ? p.paymentDate.slice(0, 10) : '-'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${methodBadge.classes}`}
                          >
                            {methodBadge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-700">
                          <div className="space-y-0.5">
                            {p.referenceNo && (
                              <div className="font-mono font-medium text-gray-900">
                                <span className="text-gray-400 mr-1">Ref:</span>
                                {p.referenceNo}
                              </div>
                            )}
                            {p.senderBankName && (
                              <div className="text-gray-600">
                                <span>{isAr ? 'البنك المحول:' : 'Sender Bank:'} </span>
                                <span className="font-medium text-gray-900">{p.senderBankName}</span>
                              </div>
                            )}
                            {p.receiptNumber && (
                              <div className="text-gray-600">
                                <span>{isAr ? 'رقم سند القبض:' : 'Voucher No:'} </span>
                                <span className="font-mono font-medium text-gray-900">{p.receiptNumber}</span>
                              </div>
                            )}
                            {p.cardProvider && (
                              <div className="text-gray-600">
                                <span>{isAr ? 'الشبكة:' : 'Network:'} </span>
                                <span className="font-medium text-gray-900">{p.cardProvider}</span>
                                {p.terminalId && <span className="ml-1 text-gray-400">({p.terminalId})</span>}
                              </div>
                            )}
                            {p.chequeNumber && (
                              <div className="text-gray-600">
                                <span>{isAr ? 'شيك رقم:' : 'Cheque No:'} </span>
                                <span className="font-mono font-medium text-gray-900">{p.chequeNumber}</span>
                                {p.chequeDate && <span className="ml-1 text-gray-400">({p.chequeDate.slice(0, 10)})</span>}
                              </div>
                            )}
                            {p.description && (
                              <div className="text-gray-600 italic">{p.description}</div>
                            )}
                            {p.notes && (
                              <div className="text-gray-500 italic text-[11px]">{p.notes}</div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {p.bankAccount ? (
                            <div className="text-gray-900">
                              <span className="font-semibold">
                                {isAr ? p.bankAccount.bankNameAr : p.bankAccount.bankNameEn}
                              </span>
                              <div className="font-mono text-[11px] text-gray-500">
                                ..{p.bankAccount.iban.slice(-6)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-end font-bold text-emerald-700 whitespace-nowrap">
                          {Number(p.amount).toFixed(2)} SAR
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Issue Credit / Debit Note Modal */}
      {noteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">
                {isAr
                  ? `إصدار إشعار دائن / مدين مرتبط بالفاتورة (${invoice.referenceNo})`
                  : `Issue Credit / Debit Note (${invoice.referenceNo})`}
              </h3>
              <button type="button" onClick={() => setNoteModalOpen(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                issueNoteMutation.mutate({
                  noteType: noteForm.noteType,
                  reason: noteForm.reason.trim(),
                  issueDate: noteForm.issueDate,
                  releaseWorkQuantity: noteForm.releaseWorkQuantity,
                  lines: [
                    {
                      itemNameAr: noteForm.itemNameAr.trim(),
                      unit: noteForm.unit.trim() || 'مقطوعية',
                      quantity: Number(noteForm.quantity),
                      unitPrice: Number(noteForm.unitPrice),
                    },
                  ],
                })
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'نوع الإشعار وفق ZATCA *' : 'Note Type *'}
                </label>
                <select
                  value={noteForm.noteType}
                  onChange={(e) =>
                    setNoteForm({
                      ...noteForm,
                      noteType: e.target.value as 'CREDIT_NOTE' | 'DEBIT_NOTE',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                >
                  <option value="CREDIT_NOTE">
                    {isAr
                      ? 'إشعار دائن (Credit Note - 381) — لتخفيض القيمة المستحقة'
                      : 'Credit Note (381) — Reduce invoice balance'}
                  </option>
                  <option value="DEBIT_NOTE">
                    {isAr
                      ? 'إشعار مدين (Debit Note - 383) — لزيادة القيمة المستحقة'
                      : 'Debit Note (383) — Increase invoice balance'}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr
                    ? 'سبب إصدار الإشعار (إلزامي في ZATCA InstructionNote) *'
                    : 'Reason for Note (ZATCA InstructionNote) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    isAr
                      ? 'مثال: تسوية كميات أعمال أو خصم متفق عليه بعد الإصدار'
                      : 'e.g., Post-issuance quantity adjustment or agreed discount'
                  }
                  value={noteForm.reason}
                  onChange={(e) => setNoteForm({ ...noteForm, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'البيان / وصف بند التسوية *' : 'Adjustment Description *'}
                </label>
                <input
                  type="text"
                  required
                  value={noteForm.itemNameAr}
                  onChange={(e) => setNoteForm({ ...noteForm, itemNameAr: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'الكمية *' : 'Quantity *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={noteForm.quantity}
                    onChange={(e) => setNoteForm({ ...noteForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'المبلغ قبل الضريبة للوحدة (SAR) *' : 'Unit Price Excl. VAT (SAR) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={noteForm.unitPrice}
                    onChange={(e) => setNoteForm({ ...noteForm, unitPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNoteModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={issueNoteMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
                >
                  {isAr ? 'إصدار واعتماد الإشعار' : 'Issue & Approve Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Comprehensive Multi-Method Payment Registration Modal */}
      <PaymentRegistrationModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        isAr={isAr}
        invoiceId={invoice.id}
        preloadedInvoice={invoice}
      />

      {/* Cancel Invoice Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              {isAr ? 'إلغاء الفاتورة وعكس الكميات' : 'Cancel Invoice'}
            </h3>
            <textarea
              rows={3}
              required
              placeholder={isAr ? 'سبب الإلغاء *' : 'Cancellation reason *'}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
              >
                {isAr ? 'تراجع' : 'Back'}
              </button>
              <button
                type="button"
                disabled={!cancellationReason.trim() || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancellationReason.trim())}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {isAr ? 'تأكيد الإلغاء' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
