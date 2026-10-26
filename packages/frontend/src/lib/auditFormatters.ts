// =============================================================
// BUNYAN Audit Logs — Human-Readable Formatters & Metadata Parser
// Transforms technical database audit events into clear business terms.
// =============================================================

export interface AuditRecordLike {
  id: string
  createdAt: string | Date
  action: string
  entityType: string
  entityId?: string
  description?: string
  category?: string
  ipAddress?: string
  userAgent?: string
  user?: {
    id: string
    nameAr?: string
    nameEn?: string
    email?: string
    role?: string
  }
  metadata?: Record<string, any>
}

export interface AuditFieldDiff {
  field: string
  fieldKey: string
  from: string
  to: string
}

/**
 * Returns a human-friendly Arabic or English label for an audit action,
 * using context from the entity type whenever available.
 */
export function getActionLabel(action: string, entityType = '', isAr = true): string {
  const act = String(action || '').toUpperCase().trim()
  const ent = String(entityType || '').toLowerCase().trim()

  // Context-aware: Invoices
  if (ent.includes('invoice')) {
    switch (act) {
      case 'CREATE':
        return isAr ? 'إنشاء مسودة فاتورة' : 'Draft Invoice Created'
      case 'ISSUE_INVOICE':
        return isAr ? 'إصدار فاتورة ضريبية' : 'Tax Invoice Issued'
      case 'UPDATE':
        return isAr ? 'تعديل بيانات فاتورة' : 'Invoice Updated'
      case 'APPROVE':
        return isAr ? 'اعتماد فاتورة' : 'Invoice Approved'
      case 'CANCEL':
        return isAr ? 'إلغاء فاتورة' : 'Invoice Cancelled'
      case 'DELETE':
        return isAr ? 'حذف مسودة فاتورة' : 'Invoice Deleted'
    }
  }

  // Context-aware: Statements
  if (ent.includes('statement')) {
    switch (act) {
      case 'CREATE':
        return isAr ? 'إنشاء مسودة مستخلص' : 'Draft Statement Created'
      case 'ISSUE_STATEMENT':
        return isAr ? 'إصدار مستخلص أعمال' : 'Work Statement Issued'
      case 'UPDATE':
        return isAr ? 'تعديل مستخلص أعمال' : 'Statement Updated'
      case 'APPROVE':
        return isAr ? 'اعتماد مستخلص أعمال' : 'Statement Approved'
      case 'CANCEL':
        return isAr ? 'إلغاء مستخلص أعمال' : 'Statement Cancelled'
      case 'DELETE':
        return isAr ? 'حذف مستخلص ملغي' : 'Statement Deleted'
    }
  }

  // Context-aware: Work Entries
  if (ent.includes('workentry') || ent.includes('work_entry')) {
    switch (act) {
      case 'CREATE':
        return isAr ? 'تسجيل عمل منفذ' : 'Work Entry Recorded'
      case 'UPDATE':
        return isAr ? 'تعديل عمل منفذ' : 'Work Entry Updated'
      case 'APPROVE':
        return isAr ? 'اعتماد عمل منفذ' : 'Work Entry Approved'
      case 'REJECT':
        return isAr ? 'رفض عمل منفذ' : 'Work Entry Rejected'
      case 'DELETE':
        return isAr ? 'حذف قيد عمل' : 'Work Entry Deleted'
    }
  }

  // Context-aware: Payments
  if (ent.includes('payment')) {
    switch (act) {
      case 'CREATE':
      case 'PAYMENT_RECORD':
        return isAr ? 'تسجيل دفعة وسند قبض' : 'Payment Recorded'
      case 'UPDATE':
        return isAr ? 'تعديل سند الدفعة' : 'Payment Updated'
      case 'CANCEL':
        return isAr ? 'إلغاء سند الدفعة' : 'Payment Cancelled'
      case 'DELETE':
        return isAr ? 'حذف سند الدفعة' : 'Payment Deleted'
    }
  }

  // Context-aware: Clients & Sites
  if (ent.includes('client')) {
    switch (act) {
      case 'CREATE':
        return isAr ? 'إضافة عميل جديد' : 'Client Added'
      case 'UPDATE':
        return isAr ? 'تعديل بيانات عميل' : 'Client Updated'
      case 'DELETE':
        return isAr ? 'حذف عميل' : 'Client Deleted'
    }
  }
  if (ent.includes('site')) {
    switch (act) {
      case 'CREATE':
        return isAr ? 'إضافة موقع مشروع' : 'Project Site Added'
      case 'UPDATE':
        return isAr ? 'تعديل موقع مشروع' : 'Project Site Updated'
      case 'DELETE':
        return isAr ? 'حذف موقع مشروع' : 'Project Site Deleted'
    }
  }

  // Context-aware: Users & Auth
  if (ent.includes('user')) {
    switch (act) {
      case 'CREATE':
        return isAr ? 'إنشاء حساب مستخدم' : 'User Account Created'
      case 'UPDATE':
      case 'USER_MANAGE':
        return isAr ? 'تعديل بيانات مستخدم' : 'User Account Updated'
      case 'DELETE':
        return isAr ? 'تعطيل / حذف مستخدم' : 'User Account Removed'
    }
  }

  // Context-aware: Settings
  if (ent.includes('setting') || ent.includes('org')) {
    switch (act) {
      case 'UPDATE':
      case 'SETTINGS_UPDATE':
        return isAr ? 'تعديل إعدادات النظام' : 'System Settings Updated'
    }
  }

  // Standalone Action fallback mappings
  switch (act) {
    case 'CREATE':
      return isAr ? 'إضافة سجل' : 'Record Created'
    case 'UPDATE':
      return isAr ? 'تعديل سجل' : 'Record Updated'
    case 'DELETE':
      return isAr ? 'حذف سجل' : 'Record Deleted'
    case 'APPROVE':
      return isAr ? 'اعتماد مستند' : 'Document Approved'
    case 'REJECT':
      return isAr ? 'رفض مستند' : 'Document Rejected'
    case 'CANCEL':
      return isAr ? 'إلغاء مستند' : 'Document Cancelled'
    case 'LOGIN':
      return isAr ? 'تسجيل الدخول' : 'User Login'
    case 'LOGOUT':
      return isAr ? 'تسجيل الخروج' : 'User Logout'
    case 'PAYMENT_RECORD':
      return isAr ? 'تسجيل دفعة' : 'Payment Recorded'
    case 'ISSUE_INVOICE':
      return isAr ? 'إصدار فاتورة' : 'Invoice Issued'
    case 'ISSUE_STATEMENT':
      return isAr ? 'إصدار مستخلص' : 'Statement Issued'
    case 'SETTINGS_UPDATE':
      return isAr ? 'تعديل إعدادات' : 'Settings Updated'
    case 'USER_MANAGE':
      return isAr ? 'إدارة حسابات' : 'User Management'
    case 'RESET_TEST_LOGS':
      return isAr ? 'تنظيف السجلات الاختبارية' : 'Test Logs Cleaned'
    default:
      // Humanize unknown snake/screaming case
      return act
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

/**
 * Returns a human-friendly Arabic or English label for an entity type.
 */
export function getEntityLabel(entityType: string, isAr = true): string {
  const norm = String(entityType || '').toLowerCase().trim()

  switch (norm) {
    case 'invoice':
      return isAr ? 'فاتورة ضريبية' : 'Tax Invoice'
    case 'statement':
      return isAr ? 'مستخلص أعمال' : 'Work Statement'
    case 'workentry':
    case 'work_entry':
      return isAr ? 'قيد عمل منفذ' : 'Work Entry'
    case 'client':
      return isAr ? 'بيانات العميل' : 'Client'
    case 'site':
      return isAr ? 'موقع المشروع' : 'Project Site'
    case 'payment':
      return isAr ? 'سند تحصيل / دفعة' : 'Payment Receipt'
    case 'user':
      return isAr ? 'حساب مستخدم' : 'User Account'
    case 'orgsettings':
    case 'organization_settings':
    case 'settings':
      return isAr ? 'إعدادات المنشأة' : 'Organization Settings'
    case 'orgcountry':
      return isAr ? 'إعدادات الدولة والضريبة' : 'Country & Tax Settings'
    case 'orgbankaccount':
      return isAr ? 'الحساب البنكي' : 'Bank Account'
    case 'workitemtemplate':
    case 'work_item_template':
      return isAr ? 'قالب بند أعمال' : 'Work Item Template'
    case 'unitofmeasure':
    case 'unit_of_measure':
      return isAr ? 'وحدة قياس' : 'Unit of Measure'
    case 'auditlog':
    case 'audit_log':
      return isAr ? 'سجل رقابي ونظامي' : 'System Audit Log'
    default:
      return isAr ? 'سجل بالنظام' : 'System Entity'
  }
}

/**
 * Visual styling classes for action badges.
 */
export function getActionBadgeStyle(action: string): { bg: string; text: string; border: string } {
  const act = String(action || '').toUpperCase().trim()

  if (act.includes('DELETE') || act.includes('PURGE') || act.includes('CANCEL') || act.includes('REJECT')) {
    return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }
  }
  if (act.includes('APPROVE') || act.includes('ISSUE') || act.includes('PAYMENT')) {
    return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
  }
  if (act.includes('UPDATE') || act.includes('SETTINGS') || act.includes('USER_MANAGE')) {
    return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
  }
  if (act.includes('CREATE')) {
    return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' }
  }
  if (act.includes('LOGIN') || act.includes('LOGOUT')) {
    return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' }
  }
  return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
}

/**
 * Extracts a human-readable document reference number and navigation URL.
 * Handles deleted business records gracefully with fallback references and no broken URLs.
 */
export function formatAuditReference(
  log: AuditRecordLike,
  isAr = true
): { primary: string; secondary?: string; url?: string; isDeleted?: boolean } {
  const m = log.metadata || {}
  const ent = String(log.entityType || '').toLowerCase().trim()
  const id = log.entityId || ''
  const isDeleted =
    String(log.action || '').toUpperCase().includes('DELETE') ||
    m.isDeleted === true ||
    m.deleted === true

  // Known reference fields from metadata
  const businessRef =
    m.referenceNo ||
    m.invoiceNumber ||
    m.statementNumber ||
    m.paymentNumber ||
    m.clientName ||
    m.siteName ||
    m.itemNameAr ||
    m.email

  // Determine navigation URL ONLY if entity is NOT deleted and is viewable
  let url: string | undefined
  if (id && !isDeleted) {
    if (ent.includes('invoice')) url = `/invoices/${id}`
    else if (ent.includes('statement')) url = `/statements/${id}`
    else if (ent.includes('workentry') || ent.includes('work_entry')) url = `/work-entries/${id}`
    else if (ent.includes('client')) url = `/clients/${id}`
    else if (ent.includes('site')) url = `/sites/${id}`
  }

  if (businessRef) {
    return {
      primary: String(businessRef),
      secondary: isDeleted
        ? (isAr ? 'سجل محذوف' : 'Deleted Record')
        : (id ? `#${id.slice(-6)}` : undefined),
      url,
      isDeleted,
    }
  }

  if (id) {
    return {
      primary: isDeleted
        ? (isAr ? 'سجل محذوف' : 'Deleted Record')
        : `#${id.length > 12 ? id.slice(0, 8) + '...' : id}`,
      secondary: isDeleted && id ? `#${id.slice(-6)}` : undefined,
      url,
      isDeleted,
    }
  }

  return {
    primary: isDeleted ? (isAr ? 'سجل محذوف' : 'Deleted Record') : (isAr ? '—' : '—'),
    isDeleted,
  }
}

/**
 * Maps field keys to human-readable names.
 */
export function getFieldDisplayName(key: string, isAr = true): string {
  const mapAr: Record<string, string> = {
    status: 'حالة السجل',
    quantity: 'الكمية',
    unitPrice: 'سعر الوحدة',
    totalAmount: 'المبلغ الإجمالي',
    subtotal: 'المبلغ قبل الضريبة',
    vatAmount: 'مبلغ ضريبة القيمة المضافة',
    vatRate: 'نسبة الضريبة',
    unit: 'وحدة القياس',
    itemNameAr: 'اسم البند (عربي)',
    itemNameEn: 'اسم البند (إنجليزي)',
    workDate: 'تاريخ العمل',
    issueDate: 'تاريخ الإصدار',
    paymentDate: 'تاريخ الدفعة',
    paymentMethod: 'طريقة الدفع',
    clientName: 'اسم العميل',
    siteName: 'الموقع',
    notes: 'الملاحظات',
    description: 'الوصف',
    nameAr: 'الاسم بالعربية',
    nameEn: 'الاسم بالإنجليزية',
    vatNumber: 'الرقم الضريبي',
    phone: 'رقم الهاتف',
    email: 'البريد الإلكتروني',
    address: 'العنوان',
    role: 'الدور الوظيفي',
  }

  const mapEn: Record<string, string> = {
    status: 'Status',
    quantity: 'Quantity',
    unitPrice: 'Unit Price',
    totalAmount: 'Total Amount',
    subtotal: 'Subtotal',
    vatAmount: 'VAT Amount',
    vatRate: 'VAT Rate',
    unit: 'Unit',
    itemNameAr: 'Item Name (Ar)',
    itemNameEn: 'Item Name (En)',
    workDate: 'Work Date',
    issueDate: 'Issue Date',
    paymentDate: 'Payment Date',
    paymentMethod: 'Payment Method',
    clientName: 'Client Name',
    siteName: 'Site Name',
    notes: 'Notes',
    description: 'Description',
    nameAr: 'Arabic Name',
    nameEn: 'English Name',
    vatNumber: 'VAT Number',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    role: 'Role',
  }

  return isAr ? (mapAr[key] || key) : (mapEn[key] || key)
}

/**
 * Formats a single value (currency, number, status) into human-readable text.
 */
export function formatDiffValue(val: any, fieldKey = '', isAr = true): string {
  if (val === null || val === undefined || val === '') {
    return isAr ? 'لا يوجد' : 'None'
  }

  // Format Status enums
  const statusStr = String(val).toUpperCase()
  if (['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARTIALLY_BILLED', 'FULLY_BILLED', 'PAID', 'OVERDUE'].includes(statusStr)) {
    const statusMapAr: Record<string, string> = {
      DRAFT: 'مسودة',
      PENDING_APPROVAL: 'بانتظار الاعتماد',
      APPROVED: 'معتمد',
      REJECTED: 'مرفوض',
      CANCELLED: 'ملغي',
      PARTIALLY_BILLED: 'مفوتر جزئياً',
      FULLY_BILLED: 'مفوتر بالكامل',
      PAID: 'مدفوع بالكامل',
      OVERDUE: 'متأخر',
    }
    const statusMapEn: Record<string, string> = {
      DRAFT: 'Draft',
      PENDING_APPROVAL: 'Pending Approval',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      CANCELLED: 'Cancelled',
      PARTIALLY_BILLED: 'Partially Billed',
      FULLY_BILLED: 'Fully Billed',
      PAID: 'Paid',
      OVERDUE: 'Overdue',
    }
    return isAr ? statusMapAr[statusStr] || statusStr : statusMapEn[statusStr] || statusStr
  }

  // Amounts & Currencies
  if (fieldKey.toLowerCase().includes('amount') || fieldKey.toLowerCase().includes('total') || fieldKey.toLowerCase().includes('price')) {
    const num = Number(val)
    if (!isNaN(num)) {
      return `${num.toLocaleString(isAr ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${isAr ? 'ر.س' : 'SAR'}`
    }
  }

  // Numeric quantities
  if (fieldKey.toLowerCase().includes('quantity') || fieldKey.toLowerCase().includes('qty')) {
    const num = Number(val)
    if (!isNaN(num)) {
      return num.toLocaleString(isAr ? 'ar-SA-u-nu-latn' : 'en-US')
    }
  }

  // Booleans
  if (typeof val === 'boolean') {
    return val ? (isAr ? 'نعم / مفعّل' : 'Yes / Active') : (isAr ? 'لا / معطّل' : 'No / Disabled')
  }

  return String(val)
}

/**
 * Extracts structured before-and-after values from metadata for clean business presentation.
 */
export function extractAuditChanges(metadata?: Record<string, any>, isAr = true): AuditFieldDiff[] {
  if (!metadata || typeof metadata !== 'object') return []

  const diffs: AuditFieldDiff[] = []

  // Case 1: Status changes
  const prevStatus = metadata.previousStatus || metadata.oldStatus || metadata.fromStatus
  const newStatus = metadata.newStatus || metadata.toStatus
  if (prevStatus && newStatus && prevStatus !== newStatus) {
    diffs.push({
      fieldKey: 'status',
      field: getFieldDisplayName('status', isAr),
      from: formatDiffValue(prevStatus, 'status', isAr),
      to: formatDiffValue(newStatus, 'status', isAr),
    })
  }

  // Case 2: Total Amount changes
  const prevAmount = metadata.previousTotalAmount ?? metadata.oldTotalAmount ?? metadata.previousAmount
  const newAmount = metadata.newTotalAmount ?? metadata.totalAmount ?? metadata.amount
  if (prevAmount !== undefined && newAmount !== undefined && String(prevAmount) !== String(newAmount)) {
    diffs.push({
      fieldKey: 'totalAmount',
      field: getFieldDisplayName('totalAmount', isAr),
      from: formatDiffValue(prevAmount, 'totalAmount', isAr),
      to: formatDiffValue(newAmount, 'totalAmount', isAr),
    })
  }

  // Case 3: Quantity changes
  const prevQty = metadata.previousQuantity ?? metadata.oldQuantity
  const newQty = metadata.newQuantity ?? metadata.quantity
  if (prevQty !== undefined && newQty !== undefined && String(prevQty) !== String(newQty)) {
    diffs.push({
      fieldKey: 'quantity',
      field: getFieldDisplayName('quantity', isAr),
      from: formatDiffValue(prevQty, 'quantity', isAr),
      to: formatDiffValue(newQty, 'quantity', isAr),
    })
  }

  // Case 4: Unit Price changes
  const prevPrice = metadata.previousUnitPrice ?? metadata.oldUnitPrice
  const newPrice = metadata.newUnitPrice ?? metadata.unitPrice
  if (prevPrice !== undefined && newPrice !== undefined && String(prevPrice) !== String(newPrice)) {
    diffs.push({
      fieldKey: 'unitPrice',
      field: getFieldDisplayName('unitPrice', isAr),
      from: formatDiffValue(prevPrice, 'unitPrice', isAr),
      to: formatDiffValue(newPrice, 'unitPrice', isAr),
    })
  }

  // Case 5: Generic previousValues vs newValues object
  if (metadata.previousValues && metadata.newValues && typeof metadata.previousValues === 'object') {
    for (const [k, oldVal] of Object.entries(metadata.previousValues)) {
      const newVal = metadata.newValues[k]
      if (oldVal !== newVal && !diffs.some((d) => d.fieldKey === k)) {
        diffs.push({
          fieldKey: k,
          field: getFieldDisplayName(k, isAr),
          from: formatDiffValue(oldVal, k, isAr),
          to: formatDiffValue(newVal, k, isAr),
        })
      }
    }
  }

  // Case 6: Updated Fields list if no explicit from/to was recorded
  if (diffs.length === 0 && Array.isArray(metadata.updatedFields) && metadata.updatedFields.length > 0) {
    for (const f of metadata.updatedFields) {
      diffs.push({
        fieldKey: String(f),
        field: getFieldDisplayName(String(f), isAr),
        from: isAr ? 'قيمة سابقة' : 'Prior Value',
        to: isAr ? 'تم التحديث' : 'Updated',
      })
    }
  }

  return diffs
}

/**
 * Extracts change reason / justification if recorded in metadata.
 */
export function extractAuditReason(metadata?: Record<string, any>): string | null {
  if (!metadata) return null
  const reason =
    metadata.rejectionReason ||
    metadata.cancellationReason ||
    metadata.reason ||
    metadata.justification ||
    metadata.explanationReason ||
    metadata.notes
  return reason ? String(reason).trim() : null
}

/**
 * Filters out passwords, tokens, hashes, and internal secrets from technical metadata.
 */
export function sanitizeMetadataForDisplay(metadata?: Record<string, any>): Record<string, any> | null {
  if (!metadata || typeof metadata !== 'object') return null

  const sensitiveKeywords = [
    'password',
    'token',
    'secret',
    'hash',
    'cookie',
    'jwt',
    'authorization',
    'csrf',
    'bearer',
    'salt',
  ]

  const cleaned: Record<string, any> = {}
  for (const [k, v] of Object.entries(metadata)) {
    const isSensitive = sensitiveKeywords.some((s) => k.toLowerCase().includes(s))
    if (!isSensitive) {
      cleaned[k] = v
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null
}

/**
 * Formats description text into a clean business statement.
 */
export function formatAuditDescription(log: AuditRecordLike, isAr = true): string {
  if (log.description && !log.description.toLowerCase().includes('retention purge')) {
    // If description is already human-readable and doesn't look like raw code
    if (!log.description.startsWith('{') && !log.description.includes('PrismaClient')) {
      return log.description
    }
  }

  const actLabel = getActionLabel(log.action, log.entityType, isAr)
  const entLabel = getEntityLabel(log.entityType, isAr)
  const ref = formatAuditReference(log, isAr).primary

  if (ref && ref !== '—') {
    return isAr
      ? `تم تنفيذ ${actLabel} لـ ${entLabel} رقم (${ref})`
      : `Successfully performed ${actLabel} for ${entLabel} (${ref})`
  }

  return isAr
    ? `تم تنفيذ ${actLabel} على ${entLabel}`
    : `Performed ${actLabel} on ${entLabel}`
}
