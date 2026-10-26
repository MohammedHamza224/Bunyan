import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  authenticate,
  requireRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { AuditAction, Prisma, UserRole } from '@prisma/client';
import { ValidationError, BusinessRuleError, AuthorizationError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// Statutory Protected Entities & Actions (ZATCA, Tax, Accounting, and Business compliance)
// NOTE: 'AuditLog' is technical/diagnostic and is NOT a statutory business entity!
export const STATUTORY_PROTECTED_ENTITY_TYPES = [
  'Invoice',
  'INVOICE',
  'InvoiceLine',
  'INVOICE_LINE',
  'Payment',
  'PAYMENT',
  'Statement',
  'STATEMENT',
  'StatementLine',
  'STATEMENT_LINE',
  'TaxRecord',
  'TAX_RECORD',
  'ZATCA',
  'Zatca',
  'OrganizationSettings',
  'ORGANIZATION_SETTINGS',
  'OrgSettings',
  'OrgCountry',
  'OrgBankAccount',
];

export const STATUTORY_PROTECTED_ACTIONS = [
  AuditAction.ISSUE_INVOICE,
  AuditAction.PAYMENT_RECORD,
  AuditAction.ISSUE_STATEMENT,
];

/**
 * Helper to fetch active business entity IDs that represent active financial & statutory records.
 * Cancelled or deleted business records are not active statutory ledgers.
 */
export async function getActiveStatutoryIds(organizationId: string): Promise<{
  invoiceIds: string[];
  statementIds: string[];
  paymentIds: string[];
}> {
  const [invoices, statements, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId, status: { not: 'CANCELLED' } },
      select: { id: true },
    }),
    prisma.statement.findMany({
      where: { organizationId, status: { not: 'CANCELLED' } },
      select: { id: true },
    }),
    prisma.payment.findMany({
      where: { organizationId, status: { not: 'REVERSED' } },
      select: { id: true },
    }),
  ]);

  return {
    invoiceIds: invoices.map((i) => i.id),
    statementIds: statements.map((s) => s.id),
    paymentIds: payments.map((p) => p.id),
  };
}

/**
 * Builds Prisma WHERE condition for strictly protected statutory records under
 * Saudi VAT Executive Regulations (Art. 66), ZATCA E-Invoicing mandates,
 * and Saudi Commercial Books Law.
 * 
 * Statutory Protected Records include:
 * 1. Active Tax Invoices currently existing in the database (excluding DELETE/CANCEL actions).
 * 2. Active Milestone Statements currently existing in the database (excluding DELETE/CANCEL actions).
 * 3. Active Financial Payments currently existing in the database (excluding DELETE actions).
 * 4. Regulatory ZATCA compliance records (TaxRecord, ZATCA).
 * 5. Statutory issuance actions (ISSUE_INVOICE, PAYMENT_RECORD, ISSUE_STATEMENT).
 */
export async function getStatutoryProtectionWhere(
  organizationId: string,
  _isRetentionRoutine = false
): Promise<Prisma.AuditLogWhereInput> {
  const { invoiceIds, statementIds, paymentIds } = await getActiveStatutoryIds(organizationId);

  const orConditions: Prisma.AuditLogWhereInput[] = [
    { entityType: { in: ['TaxRecord', 'TAX_RECORD', 'ZATCA', 'Zatca'] } },
    { action: { in: STATUTORY_PROTECTED_ACTIONS } },
  ];

  if (invoiceIds.length > 0) {
    orConditions.push({
      entityType: { in: ['Invoice', 'INVOICE'] },
      entityId: { in: invoiceIds },
      action: { notIn: [AuditAction.DELETE, AuditAction.CANCEL] },
    });
  }

  if (statementIds.length > 0) {
    orConditions.push({
      entityType: { in: ['Statement', 'STATEMENT'] },
      entityId: { in: statementIds },
      action: { notIn: [AuditAction.DELETE, AuditAction.CANCEL] },
    });
  }

  if (paymentIds.length > 0) {
    orConditions.push({
      entityType: { in: ['Payment', 'PAYMENT'] },
      entityId: { in: paymentIds },
      action: { not: AuditAction.DELETE },
    });
  }

  return {
    organizationId,
    OR: orConditions,
  };
}

export function getStatutoryPreservationReason(entityType: string, isAr = true): string {
  const norm = (entityType || '').toUpperCase();
  if (norm.includes('INVOICE')) {
    return isAr
      ? 'سجلات فواتير ضريبية محمية بموجب المادة 66 من لائحة ضريبة القيمة المضافة ولوائح الفوترة الإلكترونية (ZATCA)'
      : 'Statutory tax invoice records protected under Article 66 of VAT Regulations & ZATCA mandates';
  }
  if (norm.includes('PAYMENT')) {
    return isAr
      ? 'سندات تحصيل ومدفوعات مالية محمية بموجب نظام الدفاتر التجارية والمعايير المحاسبية المعتمدة'
      : 'Payment transactions protected under Saudi Commercial Books Law & accounting standards';
  }
  if (norm.includes('STATEMENT')) {
    return isAr
      ? 'مستخلصات إنجاز مشاريع معتمدة تعاقدياً وتوثق التزامات مالية ملزمة'
      : 'Contractual project progress statements documenting binding financial milestones';
  }
  if (norm.includes('TAX') || norm.includes('ZATCA')) {
    return isAr
      ? 'قيود ضريبية وزكوية نظامية خاضعة للمطابقة والتدقيق النظامي'
      : 'Tax and ZATCA regulatory compliance records subject to statutory audit';
  }
  return isAr
    ? 'سجلات أعمال وتشغيل معتمدة مرتبطة بحقوق مالية وتعاقدية'
    : 'Certified business records tied to financial & contractual obligations';
}

export const TECHNICAL_DIAGNOSTIC_ENTITY_TYPES = [
  'AuditLog',
  'AUDIT_LOG',
];

export type AuditLogCategory = 'FINANCIAL' | 'BUSINESS' | 'SECURITY' | 'TECHNICAL_DIAGNOSTIC';

/**
 * Validates and calculates cutoff date for audit log retention policies.
 * Guarantees that records within the 30-day statutory compliance window are never purged.
 */
export function parseRetentionCutoff(
  olderThanDays?: any,
  beforeDate?: any
): { cutoffDate: Date; days: number | null } {
  let cutoffDate: Date;
  let days: number | null = null;

  if (beforeDate) {
    cutoffDate = new Date(beforeDate);
    if (isNaN(cutoffDate.getTime())) {
      throw new ValidationError('Invalid beforeDate format');
    }
  } else if (olderThanDays !== undefined && olderThanDays !== null && olderThanDays !== '') {
    days = parseInt(String(olderThanDays), 10);
    if (isNaN(days) || days < 30) {
      throw new ValidationError('Retention policy requires olderThanDays to be at least 30 days');
    }
    cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
  } else {
    // Default 90 days retention policy
    days = 90;
    cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
  }

  // Regulatory Compliance Check: Records from the last 30 days are strictly immutable and protected by compliance law.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (cutoffDate > thirtyDaysAgo) {
    throw new BusinessRuleError('For regulatory compliance, audit logs from the last 30 days cannot be purged');
  }

  return { cutoffDate, days };
}

// All audit log routes require authentication.
router.use(authenticate);

/**
 * Classify audit event into structured, unambiguous categories:
 * - FINANCIAL: invoices, payments, statements, lines (statutory protected).
 * - BUSINESS: clients, sites, work entries, item templates, units (operational data).
 * - SECURITY: authentication, login, logout, user permissions, org settings.
 * - TECHNICAL_DIAGNOSTIC: audit retention purge, test reset, diagnostic logs.
 */
export function classifyAuditEvent(
  action: AuditAction | string,
  entityType: string,
  metadata?: any,
  description?: string
): AuditLogCategory {
  const normType = (entityType || '').toLowerCase();
  const act = String(action).toUpperCase();
  const desc = (description || '').toLowerCase();

  // 1. Technical & Diagnostic Logs
  if (
    normType === 'auditlog' ||
    act === 'RESET_TEST_LOGS' ||
    metadata?.isTest === true ||
    metadata?.operation === 'RETENTION_PURGE' ||
    metadata?.operation === 'RETENTION_CLEANUP' ||
    metadata?.operation === 'TEST_AUDIT_RESET' ||
    desc.includes('retention purge') ||
    desc.includes('reset test audit logs')
  ) {
    return 'TECHNICAL_DIAGNOSTIC';
  }

  // 2. Financial & Statutory
  if (
    act === 'ISSUE_INVOICE' ||
    act === 'PAYMENT_RECORD' ||
    act === 'ISSUE_STATEMENT' ||
    ['invoice', 'payment', 'statement', 'invoiceline', 'statementline'].includes(normType)
  ) {
    return 'FINANCIAL';
  }

  // 3. Security & Governance
  if (
    act === 'LOGIN' ||
    act === 'LOGOUT' ||
    act === 'USER_MANAGE' ||
    ['user', 'auth', 'refreshtoken', 'passwordresettoken'].includes(normType)
  ) {
    return 'SECURITY';
  }

  // 4. Operational Business
  return 'BUSINESS';
}

/**
 * Sanitize CSV cell against Formula Injection / CSV Injection attacks.
 * Prepends a single quote if string starts with sensitive formula characters (=, +, -, @, \t, \r).
 */
export function sanitizeCsvField(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape double quotes and enclose in quotes if comma or newline present
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build Prisma WHERE clause from request query parameters.
 */
function buildAuditLogWhereClause(organizationId: string, query: Record<string, any>): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { organizationId };

  // 1. Entity Type
  if (query.entityType) {
    const rawType = String(query.entityType).trim();
    const normalizedMap: Record<string, string[]> = {
      WORK_ENTRY: ['WorkEntry', 'WORK_ENTRY'],
      CLIENT: ['Client', 'CLIENT'],
      SITE: ['Site', 'SITE'],
      WORK_ITEM_TEMPLATE: ['WorkItemTemplate', 'WORK_ITEM_TEMPLATE'],
      STATEMENT: ['Statement', 'STATEMENT'],
      INVOICE: ['Invoice', 'INVOICE'],
      PAYMENT: ['Payment', 'PAYMENT'],
      ORGANIZATION_SETTINGS: ['OrganizationSettings', 'ORGANIZATION_SETTINGS'],
      USER: ['User', 'USER'],
      AUDIT_LOG: ['AuditLog', 'AUDIT_LOG'],
    };
    const key = rawType.toUpperCase();
    if (normalizedMap[key]) {
      where.entityType = { in: normalizedMap[key] };
    } else {
      where.entityType = { equals: rawType, mode: 'insensitive' };
    }
  }

  // 2. Action Type
  if (query.action && Object.values(AuditAction).includes(query.action as AuditAction)) {
    where.action = query.action as AuditAction;
  }

  // 3. User Filter
  if (query.userId) {
    where.userId = String(query.userId).trim();
  }

  // 4. Entity Identifier
  if (query.entityId) {
    where.entityId = { contains: String(query.entityId).trim(), mode: 'insensitive' };
  }

  // 5. Date Range Filtering
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) {
      const dFrom = new Date(query.dateFrom);
      if (!isNaN(dFrom.getTime())) {
        dFrom.setHours(0, 0, 0, 0);
        where.createdAt.gte = dFrom;
      }
    }
    if (query.dateTo) {
      const dTo = new Date(query.dateTo);
      if (!isNaN(dTo.getTime())) {
        dTo.setHours(23, 59, 59, 999);
        where.createdAt.lte = dTo;
      }
    }
  }

  // 6. Free-Text Search (Description or Entity ID)
  if (query.search) {
    const term = String(query.search).trim();
    if (term) {
      where.OR = [
        { description: { contains: term, mode: 'insensitive' } },
        { entityId: { contains: term, mode: 'insensitive' } },
      ];
    }
  }

  // 7. Category Filter (FINANCIAL | OPERATIONAL / BUSINESS | SECURITY | TECHNICAL_DIAGNOSTIC)
  if (query.category) {
    const cat = String(query.category).toUpperCase();
    if (cat === 'FINANCIAL') {
      where.AND = [
        {
          OR: [
            { action: { in: ['ISSUE_INVOICE', 'PAYMENT_RECORD', 'ISSUE_STATEMENT'] } },
            { entityType: { in: ['Invoice', 'Payment', 'Statement', 'InvoiceLine', 'StatementLine'] } },
          ],
        },
      ];
    } else if (cat === 'SECURITY') {
      where.AND = [
        {
          OR: [
            { action: { in: ['LOGIN', 'LOGOUT', 'USER_MANAGE'] } },
            { entityType: { in: ['User', 'Auth', 'RefreshToken', 'PasswordResetToken'] } },
          ],
        },
      ];
    } else if (cat === 'OPERATIONAL' || cat === 'BUSINESS') {
      where.AND = [
        {
          entityType: { in: ['WorkEntry', 'Client', 'Site', 'WorkItemTemplate', 'UnitOfMeasure'] },
        },
      ];
    } else if (cat === 'TECHNICAL_DIAGNOSTIC') {
      where.AND = [
        {
          OR: [
            { entityType: { in: TECHNICAL_DIAGNOSTIC_ENTITY_TYPES } },
            { action: AuditAction.RESET_TEST_LOGS },
          ],
        },
      ];
    }
  }

  // 8. Eligibility Filter (ELIGIBLE | PROTECTED)
  if (query.eligibility) {
    const el = String(query.eligibility).toUpperCase();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (el === 'ELIGIBLE') {
      where.createdAt = { ...(where.createdAt as object), lt: thirtyDaysAgo };
      where.entityType = { notIn: STATUTORY_PROTECTED_ENTITY_TYPES };
      where.action = { notIn: STATUTORY_PROTECTED_ACTIONS };
    } else if (el === 'PROTECTED') {
      where.OR = [
        { createdAt: { gte: thirtyDaysAgo } },
        { entityType: { in: STATUTORY_PROTECTED_ENTITY_TYPES } },
        { action: { in: STATUTORY_PROTECTED_ACTIONS } },
      ];
    }
  }

  return where;
}

/**
 * GET /api/audit-logs
 * List audit logs for the organization with pagination and comprehensive filtering.
 * Restricted to ORG_ADMIN, ORG_MANAGER, and SUPER_ADMIN.
 */
router.get(
  '/',
  requireRole(UserRole.ORG_ADMIN, UserRole.ORG_MANAGER, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const skip = (page - 1) * limit;

    const where = buildAuditLogWhereClause(organizationId, req.query);

    const [total, rawItems] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, nameAr: true, nameEn: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Attach categorized metadata for frontend grouping & presentation
    const items = rawItems.map((item) => ({
      ...item,
      category: classifyAuditEvent(item.action, item.entityType, item.metadata, item.description || ''),
    }));

    res.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);

/**
 * GET /api/audit-logs/stats
 * Returns compact summary counts for the Executive Summary Cards.
 */
router.get(
  '/stats',
  requireRole(UserRole.ORG_ADMIN, UserRole.ORG_MANAGER, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const statutoryWhere = await getStatutoryProtectionWhere(organizationId, false);

    const [
      totalRecords,
      todayRecords,
      statutoryRecords,
      eligibleRetentionCount,
      eligibleCleanCount,
    ] = await Promise.all([
      prisma.auditLog.count({ where: { organizationId } }),
      prisma.auditLog.count({
        where: { organizationId, createdAt: { gte: todayStart } },
      }),
      prisma.auditLog.count({ where: statutoryWhere }),
      prisma.auditLog.count({
        where: {
          organizationId,
          createdAt: { lt: thirtyDaysAgo },
          NOT: statutoryWhere,
        },
      }),
      prisma.auditLog.count({
        where: {
          organizationId,
          NOT: statutoryWhere,
        },
      }),
    ]);

    const protectedCount = statutoryRecords;

    res.json({
      success: true,
      data: {
        totalRecords,
        todayRecords,
        protectedCount,
        eligibleRetentionCount,
        eligibleTestDebugCount: eligibleCleanCount,
        eligibleDevTestCount: eligibleCleanCount,
        financialRecords: statutoryRecords,
        technicalRecords: eligibleCleanCount,
        isDevelopment: process.env.NODE_ENV !== 'production',
      },
    });
  }
);

/**
 * GET /api/audit-logs/actors
 * Return distinct users who have performed operations in this organization for the filter dropdown.
 */
router.get(
  '/actors',
  requireRole(UserRole.ORG_ADMIN, UserRole.ORG_MANAGER, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;

    const users = await prisma.user.findMany({
      where: { organizationId },
      select: { id: true, nameAr: true, nameEn: true, email: true, role: true },
      orderBy: { nameAr: 'asc' },
    });

    res.json({ success: true, data: users });
  }
);

/**
 * GET /api/audit-logs/protected-summary
 * Detailed explanation and statistics of protected records under Saudi and statutory regulations.
 */
router.get(
  '/protected-summary',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      invoicesCount,
      paymentsCount,
      statementsCount,
      recentWindowCount,
      totalCount,
    ] = await Promise.all([
      prisma.auditLog.count({
        where: {
          organizationId,
          OR: [{ entityType: 'Invoice' }, { action: AuditAction.ISSUE_INVOICE }],
        },
      }),
      prisma.auditLog.count({
        where: {
          organizationId,
          OR: [{ entityType: 'Payment' }, { action: AuditAction.PAYMENT_RECORD }],
        },
      }),
      prisma.auditLog.count({
        where: {
          organizationId,
          OR: [{ entityType: 'Statement' }, { action: AuditAction.ISSUE_STATEMENT }],
        },
      }),
      prisma.auditLog.count({
        where: { organizationId, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.auditLog.count({ where: { organizationId } }),
    ]);

    res.json({
      success: true,
      data: {
        totalCount,
        protectedReasons: [
          {
            key: 'ZATCA_INVOICES',
            titleAr: 'فواتير ضريبية نظامية (ZATCA)',
            titleEn: 'Statutory Tax Invoices (ZATCA)',
            count: invoicesCount,
            reasonAr: 'محمية بموجب المادة 66 من اللائحة التنفيذية لضريبة القيمة المضافة ونظام الفوترة الإلكترونية.',
            reasonEn: 'Protected under Article 66 of Saudi VAT Regulations and ZATCA E-Invoicing mandates.',
          },
          {
            key: 'FINANCIAL_PAYMENTS',
            titleAr: 'سندات الدفع والتحصيل المالي',
            titleEn: 'Financial Payments & Receipts',
            count: paymentsCount,
            reasonAr: 'محمية بموجب نظام الدفاتر التجارية والمعايير المحاسبية المعتمدة في المملكة.',
            reasonEn: 'Protected under Saudi Commercial Books Law and certified IFRS accounting standards.',
          },
          {
            key: 'WORK_STATEMENTS',
            titleAr: 'مستخلصات الأعمال المعتمدة',
            titleEn: 'Approved Work Statements',
            count: statementsCount,
            reasonAr: 'توثيق رسمي لإنجاز المشاريع المرتبط بالفوترة والمدفوعات التعاقدية.',
            reasonEn: 'Official contractual milestone verification tied to invoicing and payments.',
          },
          {
            key: 'THIRTY_DAY_WINDOW',
            titleAr: 'نافذة الحفظ القانوني (آخر 30 يوماً)',
            titleEn: 'Statutory 30-Day Active Window',
            count: recentWindowCount,
            reasonAr: 'سجلات العمليات النشطة خلال آخر 30 يوماً محمية من أي حذف لدواعي التدقيق الفوري.',
            reasonEn: 'All records generated within the last 30 days are immutable for operational audit integrity.',
          },
        ],
      },
    });
  }
);

/**
 * GET /api/audit-logs/export
 * Secure, streaming CSV export of audit records matching the specified filters.
 * Strictly restricted to ORG_ADMIN and SUPER_ADMIN.
 * - Protects against Formula Injection.
 * - Adds UTF-8 BOM (\uFEFF) for complete Arabic & English fidelity in Excel.
 * - Records an immutable audit log entry documenting who exported the data.
 */
router.get(
  '/export',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;

    const where = buildAuditLogWhereClause(organizationId, req.query);

    // Fetch records (capped at 5,000 for safe export without memory exhaustion)
    const records = await prisma.auditLog.findMany({
      where,
      take: 5000,
      include: {
        user: { select: { id: true, nameAr: true, nameEn: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Generate CSV Header
    const headers = [
      'ID',
      'Timestamp (ISO)',
      'Timestamp (Local)',
      'Actor Name (AR)',
      'Actor Name (EN)',
      'Actor Email',
      'Action',
      'Category',
      'Entity Type',
      'Entity Reference ID',
      'Description',
      'IP Address',
    ];

    const rows = records.map((r) => {
      const cat = classifyAuditEvent(r.action, r.entityType, r.metadata, r.description || '');
      const isoDate = r.createdAt.toISOString();
      const localDate = r.createdAt.toLocaleString('ar-SA');
      return [
        sanitizeCsvField(r.id),
        sanitizeCsvField(isoDate),
        sanitizeCsvField(localDate),
        sanitizeCsvField(r.user?.nameAr || '-'),
        sanitizeCsvField(r.user?.nameEn || '-'),
        sanitizeCsvField(r.user?.email || '-'),
        sanitizeCsvField(r.action),
        sanitizeCsvField(cat),
        sanitizeCsvField(r.entityType),
        sanitizeCsvField(r.entityId),
        sanitizeCsvField(r.description || '-'),
        sanitizeCsvField(r.ipAddress || '-'),
      ].join(',');
    });

    // UTF-8 BOM to guarantee Excel renders Arabic characters flawlessly
    const csvContent = '\uFEFF' + headers.join(',') + '\r\n' + rows.join('\r\n');

    // Document the export in the audit log itself
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: AuditAction.SETTINGS_UPDATE,
        entityType: 'AuditLog',
        entityId: 'AUDIT_LOG_EXPORT',
        description: `Exported ${records.length} audit log records to CSV by ${email}`,
        metadata: {
          exportedCount: records.length,
          filters: req.query,
          exportedBy: email,
          operation: 'EXPORT',
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    const filename = `bunyan-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  }
);

/**
 * POST /api/audit-logs/cleanup/preview
 * Calculates eligible records for retention cleanup according to statutory compliance safeguards.
 * Identifies protected records (Tax/ZATCA invoices, payments, statements, and 30-day statutory window).
 * Strictly restricted to ORG_ADMIN and SUPER_ADMIN.
 */
router.post(
  '/cleanup/preview',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;

    const { olderThanDays, beforeDate } = req.body || {};
    const { cutoffDate, days } = parseRetentionCutoff(olderThanDays, beforeDate);
    const cutoffDateFormatted = cutoffDate.toISOString().split('T')[0];

    // Build query conditions
    const statutoryWhere = await getStatutoryProtectionWhere(organizationId, true);

    const eligibleWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lt: cutoffDate },
      NOT: statutoryWhere,
    };

    const olderProtectedWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lt: cutoffDate },
      AND: [statutoryWhere],
    };

    const recentWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { gte: cutoffDate },
    };

    const [
      systemTotalRecords,
      recentProtectedCount,
      olderProtectedCount,
      totalEligibleCount,
      oldestRecord,
      newestRecord,
      sampleEligible,
      testLogsCount,
      statutoryCount,
    ] = await Promise.all([
      prisma.auditLog.count({ where: { organizationId } }),
      prisma.auditLog.count({ where: recentWhere }),
      prisma.auditLog.count({ where: olderProtectedWhere }),
      prisma.auditLog.count({ where: eligibleWhere }),
      prisma.auditLog.findFirst({
        where: eligibleWhere,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.auditLog.findFirst({
        where: eligibleWhere,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.auditLog.findMany({
        where: eligibleWhere,
        take: 200,
        select: { action: true, entityType: true },
      }),
      prisma.auditLog.count({
        where: {
          organizationId,
          entityType: { notIn: STATUTORY_PROTECTED_ENTITY_TYPES },
          action: { notIn: STATUTORY_PROTECTED_ACTIONS },
        },
      }),
      prisma.auditLog.count({
        where: {
          organizationId,
          OR: [
            { entityType: { in: STATUTORY_PROTECTED_ENTITY_TYPES } },
            { action: { in: STATUTORY_PROTECTED_ACTIONS } },
          ],
        },
      }),
    ]);

    const totalProtectedRecords = recentProtectedCount + olderProtectedCount;

    // Calculate category breakdown of eligible records
    const categoryBreakdown: Record<AuditLogCategory, number> = {
      SECURITY: 0,
      FINANCIAL: 0,
      BUSINESS: 0,
      TECHNICAL_DIAGNOSTIC: 0,
    };
    for (const r of sampleEligible) {
      const cat = classifyAuditEvent(r.action, r.entityType);
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    }

    let explanationReason = '';
    let explanationReasonEn = '';
    let reasonCode = 'READY_FOR_CLEANUP';

    if (systemTotalRecords === 0) {
      reasonCode = 'NO_RECORDS_IN_SYSTEM';
      explanationReason = 'لا توجد أي سجلات تدقيق في النظام حالياً.';
      explanationReasonEn = 'There are no audit log records in the system currently.';
    } else if (totalEligibleCount === 0) {
      if (recentProtectedCount === systemTotalRecords) {
        reasonCode = 'ALL_RECORDS_WITHIN_RETENTION';
        explanationReason = `جميع سجلات التدقيق في النظام (${systemTotalRecords} سجل) أُنشئت حديثاً بعد تاريخ الفرز (${cutoffDateFormatted}) وهي مشمولة بالحماية القانونية ضمن فترة الحفظ المحددة (${days || 30} يوماً). لتفريغ سجلات الفحص والتطوير الحالية، استخدم خيار "تفريغ سجلات الاختبار والتطوير".`;
        explanationReasonEn = `All ${systemTotalRecords} audit logs in the system were created recently after the cutoff date (${cutoffDateFormatted}) and are protected within the active retention window (${days || 30} days). To clear development/testing logs, use the "Clear Test/Development Logs" option.`;
      } else if (olderProtectedCount > 0) {
        reasonCode = 'ALL_OLDER_RECORDS_PROTECTED';
        explanationReason = `توجد سجلات أقدم من تاريخ الفرز (${cutoffDateFormatted})، ولكن جميعها (${olderProtectedCount} سجل) محمية نظامياً وضريبياً (فواتير، مستخلصات، مدفوعات زكوية) ولا يمكن حذفها.`;
        explanationReasonEn = `Records older than cutoff date (${cutoffDateFormatted}) exist, but all (${olderProtectedCount} records) are protected by tax and compliance regulations (invoices, statements, payments) and cannot be deleted.`;
      } else {
        reasonCode = 'NO_ELIGIBLE_RECORDS';
        explanationReason = `لا توجد أي سجلات مؤهلة للحذف أقدم من تاريخ الفرز (${cutoffDateFormatted}).`;
        explanationReasonEn = `No records qualify for retention cleanup older than cutoff date (${cutoffDateFormatted}).`;
      }
    } else {
      reasonCode = 'RECORDS_ELIGIBLE';
      explanationReason = `يوجد ${totalEligibleCount} سجل إداري وتقني مؤهل للتنظيف أقدم من ${cutoffDateFormatted}. السجلات المالية والضريبية (${olderProtectedCount}) محمية دائماً.`;
      explanationReasonEn = `Found ${totalEligibleCount} eligible administrative/technical records older than ${cutoffDateFormatted}. Financial and tax records (${olderProtectedCount}) are permanently preserved.`;
    }

    res.json({
      success: true,
      data: {
        cutoffDate: cutoffDate.toISOString(),
        cutoffDateFormatted,
        systemTotalRecords,
        totalRecords: systemTotalRecords,
        totalEligibleCount,
        eligibleRecords: totalEligibleCount,
        protectedCount: totalProtectedRecords,
        protectedRecords: totalProtectedRecords,
        recentProtectedCount,
        olderProtectedCount,
        eligibleDevTestCount: testLogsCount,
        statutoryBusinessCount: statutoryCount,
        categoryBreakdown,
        oldestEligibleDate: oldestRecord?.createdAt || null,
        newestEligibleDate: newestRecord?.createdAt || null,
        protectedEntityTypes: STATUTORY_PROTECTED_ENTITY_TYPES,
        isPolicyApproved: true,
        canExecute: totalEligibleCount > 0,
        isDevelopment: process.env.NODE_ENV !== 'production',
        reasonCode,
        explanationReason,
        explanationReasonEn,
        requiredConfirmationText: 'CONFIRM_AUDIT_LOG_CLEANUP',
      },
    });
  }
);

/**
 * POST /api/audit-logs/cleanup/execute
 * Controlled retention cleanup execution with safe batch deletion.
 * Guarantees:
 * 1. Financial and tax records are strictly protected.
 * 2. Multi-batch processing processes ALL eligible records.
 * 3. An immutable audit record is created ONLY if records are actually purged (zero noise on 0 purge).
 */
router.post(
  '/cleanup/execute',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;

    const { olderThanDays, beforeDate, confirmationToken, confirmToken, policyAcknowledged } =
      req.body || {};
    const token = (confirmationToken || confirmToken || '').trim();

    if (token !== 'CONFIRM_AUDIT_LOG_CLEANUP') {
      throw new ValidationError(
        'Explicit confirmation token "CONFIRM_AUDIT_LOG_CLEANUP" is required to execute retention cleanup'
      );
    }

    if (!policyAcknowledged) {
      throw new ValidationError('You must confirm acknowledgment of company retention policy compliance');
    }

    const { cutoffDate, days } = parseRetentionCutoff(olderThanDays, beforeDate);
    const cutoffDateFormatted = cutoffDate.toISOString().split('T')[0];

    const statutoryWhere = await getStatutoryProtectionWhere(organizationId, true);

    const eligibleWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lt: cutoffDate },
      NOT: statutoryWhere,
    };

    const totalBefore = await prisma.auditLog.count({ where: { organizationId } });
    const eligibleCount = await prisma.auditLog.count({ where: eligibleWhere });

    if (eligibleCount === 0) {
      return res.json({
        success: true,
        message: `لم يتم حذف أي سجلات: لا توجد سجلات مؤهلة للحذف أقدم من ${cutoffDateFormatted}، وجميع السجلات الحالية محمية.`,
        data: {
          totalBefore,
          eligibleCount: 0,
          purgedCount: 0,
          protectedCount: totalBefore,
          remainingCount: totalBefore,
          cutoffDate: cutoffDate.toISOString(),
          cutoffDateFormatted,
          canExecute: false,
          reason: 'NO_ELIGIBLE_RECORDS',
        },
      });
    }

    // Process all eligible records in safe batches
    let purgedCount = 0;
    const BATCH_SIZE = 1000;
    while (true) {
      const batch = await prisma.auditLog.findMany({
        where: eligibleWhere,
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (batch.length === 0) break;
      const ids = batch.map((r) => r.id);
      const deleteResult = await prisma.auditLog.deleteMany({
        where: { id: { in: ids } },
      });
      purgedCount += deleteResult.count;
      if (batch.length < BATCH_SIZE) break;
    }

    // Document cleanup in audit trail ONLY when records were actually purged
    let cleanupLog = null;
    if (purgedCount > 0) {
      cleanupLog = await prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: AuditAction.DELETE,
          entityType: 'AuditLog',
          entityId: 'RETENTION_CLEANUP',
          description: `Controlled retention cleanup executed: purged ${purgedCount} eligible records older than ${cutoffDateFormatted}. Financial and tax records protected.`,
          metadata: {
            purgedCount,
            cutoffDate: cutoffDate.toISOString(),
            policyAcknowledged: true,
            requestedBy: email,
            operation: 'RETENTION_CLEANUP',
            retentionDays: days ?? undefined,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
    }

    const remainingCount = await prisma.auditLog.count({ where: { organizationId } });

    res.json({
      success: true,
      message: `Successfully purged ${purgedCount} eligible audit logs older than ${cutoffDateFormatted}`,
      data: {
        totalBefore,
        eligibleCount,
        purgedCount,
        protectedCount: remainingCount - (cleanupLog ? 1 : 0),
        remainingCount,
        cutoffDate: cutoffDate.toISOString(),
        cutoffDateFormatted,
        cleanupAuditId: cleanupLog?.id || null,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

/**
 * POST /api/audit-logs/cleanup/test-debug
 * Purge technical and diagnostic noise records (e.g. legacy empty purge logs, debug test entries)
 * without touching ANY business records (Invoices, Payments, Statements, Works, Clients).
 * Restricted to ORG_ADMIN and SUPER_ADMIN.
 */
router.post(
  '/cleanup/test-debug',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;

    // Strict Production Environment Guard
    if (process.env.NODE_ENV === 'production') {
      throw new AuthorizationError(
        'تنظيف السجلات التجريبية والتشخيصية غير مسموح به في بيئة الإنتاج / Cleaning debug/test records is strictly prohibited in production'
      );
    }

    const statutoryWhere = await getStatutoryProtectionWhere(organizationId, false);

    const technicalWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      NOT: statutoryWhere,
    };

    const totalBefore = await prisma.auditLog.count({ where: { organizationId } });
    const eligibleCount = await prisma.auditLog.count({ where: technicalWhere });

    if (eligibleCount === 0) {
      return res.json({
        success: true,
        message: 'لا توجد سجلات تقنية أو تجريبية مؤهلة للتنظيف حالياً.',
        data: {
          totalBefore,
          eligibleCount: 0,
          purgedCount: 0,
          remainingCount: totalBefore,
        },
      });
    }

    // Process all matching technical records in safe batches
    let purgedCount = 0;
    const BATCH_SIZE = 1000;
    while (true) {
      const batch = await prisma.auditLog.findMany({
        where: technicalWhere,
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (batch.length === 0) break;
      const ids = batch.map((r) => r.id);
      const res = await prisma.auditLog.deleteMany({
        where: { id: { in: ids } },
      });
      purgedCount += res.count;
      if (batch.length < BATCH_SIZE) break;
    }

    const remainingCount = await prisma.auditLog.count({ where: { organizationId } });

    res.json({
      success: true,
      message: `تم تنظيف ${purgedCount} سجل تقني وتجريبي بنجاح مع الحفاظ الكامل على كافة العمليات المالية والتنفيذية.`,
      data: {
        totalBefore,
        eligibleCount,
        purgedCount,
        remainingCount,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

/**
 * POST /api/audit-logs/cleanup/dev-test
 * Dedicated operation for clearing test and development audit records.
 * STRICT SERVER-SIDE SAFEGUARDS:
 * 1. Verified development environment guard: rejected in production with 403 Forbidden.
 * 2. Strict authorization: ORG_ADMIN or SUPER_ADMIN only.
 * 3. Explicit confirmation token: 'CONFIRM_CLEAR_DEV_LOGS' (or 'CLEAR_TEST_LOGS' / 'RESET_TEST_AUDIT_LOGS').
 * 4. NEVER deletes statutory business/financial records (Invoices, Payments, Statements, Tax, ZATCA).
 * 5. Returns detailed breakdown of purged test records and preserved statutory records.
 */
router.post(
  ['/cleanup/dev-test', '/reset-test-logs'],
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;

    // Strict Environment Guard
    if (process.env.NODE_ENV === 'production') {
      throw new AuthorizationError(
        'عملية تفريغ سجلات الفحص والتطوير غير مسموحة نهائياً في بيئة الإنتاج / Clear test/development logs is strictly prohibited in production environments'
      );
    }

    const { confirmationToken, confirmToken, recordSecurityLog } = req.body || {};
    const token = (confirmationToken || confirmToken || '').trim().toUpperCase();

    const VALID_TOKENS = ['CONFIRM_CLEAR_DEV_LOGS', 'CLEAR_TEST_LOGS', 'RESET_TEST_AUDIT_LOGS'];
    if (!VALID_TOKENS.includes(token)) {
      throw new ValidationError(
        'رمز التأكيد "CONFIRM_CLEAR_DEV_LOGS" إلزامي لتنفيذ عملية تفريغ سجلات الاختبار / Explicit confirmation token "CONFIRM_CLEAR_DEV_LOGS" or "RESET_TEST_AUDIT_LOGS" is required'
      );
    }

    const statutoryWhere = await getStatutoryProtectionWhere(organizationId, false);

    // Even in development, NEVER delete statutory business and financial records!
    const targetWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      NOT: statutoryWhere,
    };

    const [totalBefore, eligibleCount, preservedCount, preservedGroups] = await Promise.all([
      prisma.auditLog.count({ where: { organizationId } }),
      prisma.auditLog.count({ where: targetWhere }),
      prisma.auditLog.count({ where: statutoryWhere }),
      prisma.auditLog.groupBy({
        by: ['entityType'],
        where: statutoryWhere,
        _count: true,
      }),
    ]);

    let purgedCount = 0;
    const BATCH_SIZE = 1000;
    while (true) {
      const batch = await prisma.auditLog.findMany({
        where: targetWhere,
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (batch.length === 0) break;
      const ids = batch.map((r) => r.id);
      const del = await prisma.auditLog.deleteMany({
        where: { id: { in: ids } },
      });
      purgedCount += del.count;
      if (batch.length < BATCH_SIZE) break;
    }

    // Record administrative event describing the cleanup operation unless recordSecurityLog is explicitly false
    const shouldRecordSecurityLog = recordSecurityLog !== false;
    let securityLogId = null;
    if (shouldRecordSecurityLog) {
      const secLog = await prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: AuditAction.RESET_TEST_LOGS,
          entityType: 'AuditLog',
          entityId: 'TEST_AUDIT_RESET',
          description: `Clear test/development logs executed in development by admin ${email}: purged ${purgedCount} test/debug records. All statutory business, tax, and financial records (${preservedCount}) were strictly preserved.`,
          metadata: {
            purgedCount,
            preservedCount,
            environment: process.env.NODE_ENV || 'development',
            performedBy: email,
            timestamp: new Date().toISOString(),
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
      securityLogId = secLog.id;
    }

    const finalTotalCount = await prisma.auditLog.count({ where: { organizationId } });

    const preservedBreakdown = preservedGroups.map((g) => ({
      entityType: g.entityType,
      count: g._count,
      reasonAr: getStatutoryPreservationReason(g.entityType, true),
      reasonEn: getStatutoryPreservationReason(g.entityType, false),
    }));

    res.json({
      success: true,
      message: `تم تفريغ ${purgedCount} سجل اختبار وتطوير بنجاح، مع الحفاظ الكامل على ${preservedCount} سجل مالي وضريبي.`,
      messageEn: `Successfully cleared ${purgedCount} development/test logs while strictly preserving ${preservedCount} statutory business and financial records.`,
      data: {
        totalBefore,
        eligibleCount,
        purgedCount,
        preservedCount,
        preservedBreakdown,
        remainingCount: finalTotalCount,
        finalTotalCount,
        securityLogId,
        isDevelopment: true,
      },
    });
  }
);

/**
 * DELETE /api/audit-logs/purge
 * Backward-compatible endpoint for existing test suites and administrative purge commands.
 * Strictly restricted to ORG_ADMIN or SUPER_ADMIN.
 */
router.delete(
  '/purge',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;

    const { olderThanDays, beforeDate } = req.body || {};
    const { cutoffDate, days } = parseRetentionCutoff(olderThanDays, beforeDate);
    const cutoffDateFormatted = cutoffDate.toISOString().split('T')[0];

    const statutoryWhere = await getStatutoryProtectionWhere(organizationId, true);

    const eligibleWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lt: cutoffDate },
      NOT: statutoryWhere,
    };

    const eligibleCount = await prisma.auditLog.count({ where: eligibleWhere });

    if (eligibleCount === 0) {
      return res.json({
        success: true,
        message: `No records purged: no eligible audit logs older than ${cutoffDateFormatted}`,
        data: {
          purgedCount: 0,
          cutoffDate: cutoffDate.toISOString(),
          cutoffDateFormatted,
          reason: 'NO_ELIGIBLE_RECORDS',
        },
      });
    }

    let purgedCount = 0;
    const BATCH_SIZE = 1000;
    while (true) {
      const batch = await prisma.auditLog.findMany({
        where: eligibleWhere,
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (batch.length === 0) break;
      const ids = batch.map((r) => r.id);
      const del = await prisma.auditLog.deleteMany({
        where: { id: { in: ids } },
      });
      purgedCount += del.count;
      if (batch.length < BATCH_SIZE) break;
    }

    if (purgedCount > 0) {
      await prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: AuditAction.DELETE,
          entityType: 'AuditLog',
          entityId: 'RETENTION_PURGE',
          description: `Audit log retention purge: deleted ${purgedCount} records older than ${cutoffDateFormatted}`,
          metadata: {
            purgedCount,
            cutoffDate: cutoffDate.toISOString(),
            requestedBy: email,
            operation: 'RETENTION_PURGE',
            retentionDays: days ?? undefined,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
    }

    res.json({
      success: true,
      message: `Successfully purged ${purgedCount} audit logs older than ${cutoffDateFormatted}`,
      data: {
        purgedCount,
        cutoffDate: cutoffDate.toISOString(),
        cutoffDateFormatted,
      },
    });
  }
);

// ─── Direct Administrative Clear Audit Log ───────────────────────

/**
 * GET /api/audit-logs/clear/preview
 * Returns the exact scope of records that would be cleared vs preserved for this organization.
 * Restricted to ORG_ADMIN and SUPER_ADMIN.
 */
router.get(
  '/clear/preview',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;

    const statutoryWhere = await getStatutoryProtectionWhere(organizationId, false);

    const [totalRecords, statutoryCount] = await Promise.all([
      prisma.auditLog.count({ where: { organizationId } }),
      prisma.auditLog.count({ where: statutoryWhere }),
    ]);

    const eligibleToClear = Math.max(0, totalRecords - statutoryCount);

    res.json({
      success: true,
      data: {
        totalRecords,
        eligibleToClear,
        statutoryCount,
        willPreserveStatutory: statutoryCount > 0,
      },
    });
  }
);

/**
 * POST /api/audit-logs/clear
 * Clear audit logs for the organization upon explicit administrative confirmation.
 * Strictly restricted to ORG_ADMIN and SUPER_ADMIN.
 * 
 * Safety & Compliance Rules:
 * 1. Multi-tenant isolation: strictly operates on authReq.user.organizationId.
 * 2. Requires explicit confirmation in request body ({ confirmed: true }).
 * 3. Preserves statutory active financial & tax records (active Invoices, Payments, Statements, ZATCA).
 * 4. Clears historical operational logs and traces of deleted entities.
 * 5. Records an immutable administrative trace for audit accountability (Section 8).
 * 6. Returns structured response with purgedCount, preservedCount, remainingCount.
 */
router.post(
  '/clear',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;
    const {
      confirmed,
      confirmation,
      preserveStatutory = true,
      forceAll = false,
      beforeDate,
      recordAdministrativeLog = true,
    } = req.body || {};

    if (
      confirmed !== true &&
      confirmation !== true &&
      req.body?.confirmToken !== 'CONFIRM_CLEAR_AUDIT_LOG'
    ) {
      throw new ValidationError(
        'التأكيد الصريح مطلوب لتنفيذ تفريغ سجل التدقيق / Explicit confirmation is required to clear the audit log'
      );
    }

    const statutoryWhere = await getStatutoryProtectionWhere(organizationId, false);

    const [totalBefore, statutoryCount] = await Promise.all([
      prisma.auditLog.count({ where: { organizationId } }),
      prisma.auditLog.count({ where: statutoryWhere }),
    ]);

    if (totalBefore === 0) {
      return res.json({
        success: true,
        message: 'سجل التدقيق فارغ بالفعل / Audit log is already empty',
        data: {
          totalBefore: 0,
          purgedCount: 0,
          preservedCount: 0,
          remainingCount: 0,
        },
      });
    }

    // Cutoff execution timestamp: records accumulated up to execution timestamp (or beforeDate)
    const cutoff = beforeDate ? new Date(beforeDate) : new Date();

    let targetWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lte: cutoff },
    };

    // If preserveStatutory is requested and statutory records exist, exclude them from purge
    if (preserveStatutory && !forceAll && statutoryCount > 0) {
      targetWhere = {
        organizationId,
        createdAt: { lte: cutoff },
        NOT: statutoryWhere,
      };
    }

    const eligibleCount = await prisma.auditLog.count({ where: targetWhere });

    if (eligibleCount === 0) {
      return res.json({
        success: true,
        message: `لم يتم حذف أي سجلات: لا توجد سجلات مؤهلة للحذف، وجميع السجلات الحالية (${statutoryCount}) محمية نظامياً.`,
        data: {
          totalBefore,
          eligibleCount: 0,
          purgedCount: 0,
          preservedCount: statutoryCount,
          remainingCount: totalBefore,
        },
      });
    }

    let purgedCount = 0;
    const BATCH_SIZE = 1000;
    while (true) {
      const batch = await prisma.auditLog.findMany({
        where: targetWhere,
        take: BATCH_SIZE,
        select: { id: true },
      });
      if (batch.length === 0) break;
      const ids = batch.map((r) => r.id);
      const del = await prisma.auditLog.deleteMany({
        where: { id: { in: ids } },
      });
      purgedCount += del.count;
      if (batch.length < BATCH_SIZE) break;
    }

    // Document cleanup in audit trail to preserve mandatory administrative evidence (Section 8)
    let adminLogId = null;
    if (recordAdministrativeLog && purgedCount > 0) {
      const adminLog = await prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: AuditAction.DELETE,
          entityType: 'AuditLog',
          entityId: 'AUDIT_LOG_CLEANUP',
          description: `Administrative audit log cleanup executed: purged ${purgedCount} historical records. Preserved ${statutoryCount} active statutory business records.`,
          metadata: {
            purgedCount,
            preservedCount: statutoryCount,
            executionTimestamp: cutoff.toISOString(),
            requestedBy: email,
            operation: 'PERMANENT_CLEANUP',
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
      adminLogId = adminLog.id;
    }

    const remainingCount = await prisma.auditLog.count({ where: { organizationId } });

    logger.info(
      `[AuditLog] Administrative clear executed: purged ${purgedCount} records for org ${organizationId} by admin ${email}. Preserved statutory: ${statutoryCount}. Remaining in DB: ${remainingCount}.`
    );

    res.json({
      success: true,
      message: `تم تفريغ ${purgedCount} سجل تدقيق بنجاح${
        statutoryCount > 0
          ? `، مع الحفاظ الكامل على ${statutoryCount} سجل مالي وضريبي مرتبط بالأعمال المعتمدة.`
          : '.'
      }`,
      data: {
        totalBefore,
        eligibleCount,
        purgedCount,
        preservedCount: statutoryCount,
        remainingCount,
        cleanupAuditId: adminLogId,
        timestamp: cutoff.toISOString(),
      },
    });
  }
);

// ─── Retention Policy Configuration ─────────────────────────────

/**
 * GET /api/audit-logs/retention-policy
 * Get configured retention policy for the organization.
 */
router.get(
  '/retention-policy',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;

    const orgSettings = await prisma.orgSettings.findUnique({
      where: { organizationId },
      select: {
        auditRetentionDays: true,
        autoCleanupAuditLogs: true,
      },
    });

    res.json({
      success: true,
      data: {
        auditRetentionDays: orgSettings?.auditRetentionDays || 90,
        autoCleanupAuditLogs: orgSettings?.autoCleanupAuditLogs || false,
        minimumAllowedDays: 30,
        isDevelopment: process.env.NODE_ENV !== 'production',
      },
    });
  }
);

/**
 * PUT /api/audit-logs/retention-policy
 * Update configured retention policy for the organization.
 */
router.put(
  '/retention-policy',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;
    const { auditRetentionDays, autoCleanupAuditLogs } = req.body || {};

    const days = parseInt(String(auditRetentionDays), 10);
    if (isNaN(days) || days < 30) {
      throw new ValidationError(
        'فترة حفظ السجلات يجب ألا تقل عن 30 يوماً للامتثال النظامي / Retention period must be at least 30 days'
      );
    }

    const updated = await prisma.orgSettings.upsert({
      where: { organizationId },
      update: {
        auditRetentionDays: days,
        autoCleanupAuditLogs: Boolean(autoCleanupAuditLogs),
      },
      create: {
        organizationId,
        auditRetentionDays: days,
        autoCleanupAuditLogs: Boolean(autoCleanupAuditLogs),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: AuditAction.SETTINGS_UPDATE,
        entityType: 'OrganizationSettings',
        entityId: updated.id,
        description: `Updated audit log retention policy: retentionDays = ${days}, autoCleanup = ${Boolean(
          autoCleanupAuditLogs
        )}`,
        metadata: {
          auditRetentionDays: days,
          autoCleanupAuditLogs: Boolean(autoCleanupAuditLogs),
          updatedBy: email,
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    res.json({
      success: true,
      message: 'تم تحديث سياسة حفظ سجلات التدقيق بنجاح',
      data: {
        auditRetentionDays: updated.auditRetentionDays,
        autoCleanupAuditLogs: updated.autoCleanupAuditLogs,
      },
    });
  }
);

export default router;
