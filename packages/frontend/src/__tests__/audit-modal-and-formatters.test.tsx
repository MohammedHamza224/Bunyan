import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import {
  getActionLabel,
  getEntityLabel,
  formatAuditReference,
  extractAuditChanges,
  extractAuditReason,
  sanitizeMetadataForDisplay,
  formatAuditDescription,
} from '../lib/auditFormatters'
import { AuditDetailModal } from '../components/audit/AuditDetailModal'

describe('BUNYAN Audit Log — Human-Readable Formatters & Detail Modal', () => {
  describe('1. Context-Aware Action and Entity Labels', () => {
    it('maps actions contextually for Invoices', () => {
      expect(getActionLabel('CREATE', 'Invoice', true)).toBe('إنشاء مسودة فاتورة')
      expect(getActionLabel('ISSUE_INVOICE', 'Invoice', true)).toBe('إصدار فاتورة ضريبية')
      expect(getActionLabel('CANCEL', 'Invoice', true)).toBe('إلغاء فاتورة')
      expect(getActionLabel('DELETE', 'Invoice', true)).toBe('حذف مسودة فاتورة')

      // English
      expect(getActionLabel('CREATE', 'Invoice', false)).toBe('Draft Invoice Created')
      expect(getActionLabel('ISSUE_INVOICE', 'Invoice', false)).toBe('Tax Invoice Issued')
      expect(getActionLabel('CANCEL', 'Invoice', false)).toBe('Invoice Cancelled')
    })

    it('maps actions contextually for Statements', () => {
      expect(getActionLabel('CREATE', 'Statement', true)).toBe('إنشاء مسودة مستخلص')
      expect(getActionLabel('ISSUE_STATEMENT', 'Statement', true)).toBe('إصدار مستخلص أعمال')
      expect(getActionLabel('APPROVE', 'Statement', true)).toBe('اعتماد مستخلص أعمال')
      expect(getActionLabel('CANCEL', 'Statement', true)).toBe('إلغاء مستخلص أعمال')
      expect(getActionLabel('DELETE', 'Statement', true)).toBe('حذف مستخلص ملغي')

      // English
      expect(getActionLabel('ISSUE_STATEMENT', 'Statement', false)).toBe('Work Statement Issued')
      expect(getActionLabel('APPROVE', 'Statement', false)).toBe('Statement Approved')
    })

    it('maps actions contextually for Work Entries', () => {
      expect(getActionLabel('CREATE', 'WorkEntry', true)).toBe('تسجيل عمل منفذ')
      expect(getActionLabel('UPDATE', 'WorkEntry', true)).toBe('تعديل عمل منفذ')
      expect(getActionLabel('APPROVE', 'WorkEntry', true)).toBe('اعتماد عمل منفذ')
      expect(getActionLabel('REJECT', 'WorkEntry', true)).toBe('رفض عمل منفذ')
      expect(getActionLabel('DELETE', 'WorkEntry', true)).toBe('حذف قيد عمل')

      // English
      expect(getActionLabel('CREATE', 'WorkEntry', false)).toBe('Work Entry Recorded')
      expect(getActionLabel('REJECT', 'WorkEntry', false)).toBe('Work Entry Rejected')
    })

    it('maps standalone actions and unknown fallback cleanly', () => {
      expect(getActionLabel('LOGIN', '', true)).toBe('تسجيل الدخول')
      expect(getActionLabel('LOGOUT', '', true)).toBe('تسجيل الخروج')
      expect(getActionLabel('PAYMENT_RECORD', '', true)).toBe('تسجيل دفعة')
      expect(getActionLabel('CUSTOM_SYSTEM_SYNC', '', false)).toBe('Custom System Sync')
    })

    it('maps entity types to Arabic and English business terms', () => {
      expect(getEntityLabel('Invoice', true)).toBe('فاتورة ضريبية')
      expect(getEntityLabel('Statement', true)).toBe('مستخلص أعمال')
      expect(getEntityLabel('WorkEntry', true)).toBe('قيد عمل منفذ')
      expect(getEntityLabel('Client', true)).toBe('بيانات العميل')
      expect(getEntityLabel('Site', true)).toBe('موقع المشروع')
      expect(getEntityLabel('Payment', true)).toBe('سند تحصيل / دفعة')
      expect(getEntityLabel('User', true)).toBe('حساب مستخدم')

      // English
      expect(getEntityLabel('Invoice', false)).toBe('Tax Invoice')
      expect(getEntityLabel('Statement', false)).toBe('Work Statement')
      expect(getEntityLabel('WorkEntry', false)).toBe('Work Entry')
    })
  })

  describe('2. Metadata Changes (Diffs) Parsing', () => {
    it('extracts status, amount, and quantity changes accurately', () => {
      const metadata = {
        previousStatus: 'DRAFT',
        newStatus: 'APPROVED',
        previousTotalAmount: 1000,
        newTotalAmount: 1150,
        previousQuantity: 10,
        newQuantity: 25,
      }

      const diffs = extractAuditChanges(metadata, true)
      expect(diffs).toHaveLength(3)

      const statusDiff = diffs.find((d) => d.fieldKey === 'status')
      expect(statusDiff?.from).toBe('مسودة')
      expect(statusDiff?.to).toBe('معتمد')

      const amountDiff = diffs.find((d) => d.fieldKey === 'totalAmount')
      expect(amountDiff?.from).toContain('1,000')
      expect(amountDiff?.to).toContain('1,150')

      const qtyDiff = diffs.find((d) => d.fieldKey === 'quantity')
      expect(qtyDiff?.from).toBe('10')
      expect(qtyDiff?.to).toBe('25')
    })

    it('extracts recorded reasons and justifications', () => {
      expect(extractAuditReason({ rejectionReason: 'الكمية غير مطابقة' })).toBe('الكمية غير مطابقة')
      expect(extractAuditReason({ cancellationReason: 'تم إلغاء العقد مع العميل' })).toBe('تم إلغاء العقد مع العميل')
      expect(extractAuditReason({})).toBeNull()
    })

    it('sanitizes metadata and strips sensitive credentials', () => {
      const rawMetadata = {
        invoiceNumber: 'INV-2026-0001',
        totalAmount: 5000,
        password: 'SuperSecretPassword123',
        userPasswordHash: '$2b$10$abcdef',
        authToken: 'jwt.token.here',
        apiKeySecret: 'secret_key_123',
      }

      const cleaned = sanitizeMetadataForDisplay(rawMetadata)
      expect(cleaned).toHaveProperty('invoiceNumber', 'INV-2026-0001')
      expect(cleaned).toHaveProperty('totalAmount', 5000)
      expect(cleaned).not.toHaveProperty('password')
      expect(cleaned).not.toHaveProperty('userPasswordHash')
      expect(cleaned).not.toHaveProperty('authToken')
      expect(cleaned).not.toHaveProperty('apiKeySecret')
    })
  })

  describe('3. Professional Audit Details Dialog (UI Rendering)', () => {
    const sampleRecord = {
      id: 'audit-record-999',
      createdAt: '2026-10-25T10:30:00.000Z',
      action: 'APPROVE',
      entityType: 'Invoice',
      entityId: 'inv-uuid-12345',
      description: 'Approved tax invoice INV-2026-0012',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      user: {
        id: 'u1',
        nameAr: 'أحمد الغامدي',
        nameEn: 'Ahmed Al-Ghamdi',
        email: 'ahmed@bunyan.sa',
        role: 'ORG_ADMIN',
      },
      metadata: {
        invoiceNumber: 'INV-2026-0012',
        previousStatus: 'DRAFT',
        newStatus: 'APPROVED',
        previousTotalAmount: 10000,
        newTotalAmount: 11500,
        rejectionReason: null,
      },
    }

    it('renders clean business summary cards and changes table in Arabic without raw JSON', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <AuditDetailModal
            record={sampleRecord}
            isOpen={true}
            onClose={() => {}}
            isAr={true}
            isAdmin={true}
          />
        </MemoryRouter>
      )

      // Header & Title
      expect(html).toContain('تفاصيل سجل التدقيق والرقابة')
      expect(html).toContain('اعتماد فاتورة')

      // Business Overview Tiles
      expect(html).toContain('نوع الإجراء')
      expect(html).toContain('نوع السجل')
      expect(html).toContain('فاتورة ضريبية')
      expect(html).toContain('INV-2026-0012')
      expect(html).toContain('أحمد الغامدي')
      expect(html).toContain('مدير النظام')
      expect(html).toContain('تمت بنجاح وتوثيقها')

      // Changes Comparison Table
      expect(html).toContain('مقارنة القيم المعدلة (قبل وبعد)')
      expect(html).toContain('حالة السجل')
      expect(html).toContain('مسودة')
      expect(html).toContain('معتمد')
      expect(html).toContain('المبلغ الإجمالي')

      // Record Link
      expect(html).toContain('انتقال إلى فاتورة ضريبية')
      expect(html).toContain('/invoices/inv-uuid-12345')

      // Verify no raw passwords or unformatted JSON in main presentation
      expect(html).not.toContain('&quot;previousStatus&quot;: &quot;DRAFT&quot;')
    })

    it('renders English LTR layout symmetrically', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <AuditDetailModal
            record={sampleRecord}
            isOpen={true}
            onClose={() => {}}
            isAr={false}
            isAdmin={false}
          />
        </MemoryRouter>
      )

      expect(html).toContain('Audit Record Details')
      expect(html).toContain('Invoice Approved')
      expect(html).toContain('Tax Invoice')
      expect(html).toContain('INV-2026-0012')
      expect(html).toContain('Action Description')
      expect(html).toContain('Value Changes')
      expect(html).toContain('Draft')
      expect(html).toContain('Approved')
      expect(html).toContain('View Tax Invoice Record')
    })
  })
})
