import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  authenticate,
  requireRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { AuditAction, Prisma, UserRole } from '@prisma/client';
import { ValidationError, BusinessRuleError, AuthorizationError } from '../middleware/errorHandler';

const router = Router();

// Statutory Protected Entities & Actions (ZATCA, Tax, Accounting, and Administrative compliance)
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
  'AuditLog',
  'AUDIT_LOG',
  'OrganizationSettings',
  'ORGANIZATION_SETTINGS',
];

export const STATUTORY_PROTECTED_ACTIONS = [
  AuditAction.ISSUE_INVOICE,
  AuditAction.PAYMENT_RECORD,
  AuditAction.ISSUE_STATEMENT,
];

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
 * Classify audit event into structured business categories.
 * Security: authentication, session, password, user management, audit administrative actions.
 * Financial: invoices, payments, statements, credit/debit notes.
 * Business: clients, sites, work entries, item templates.
 */
export function classifyAuditEvent(action: AuditAction, entityType: string): 'SECURITY' | 'FINANCIAL' | 'BUSINESS' {
  const normType = (entityType || '').toLowerCase();
  
  // Security events
  if (
    action === 'LOGIN' ||
    action === 'LOGOUT' ||
    action === 'USER_MANAGE' ||
    ['user', 'auth', 'refreshtoken', 'passwordresettoken', 'auditlog'].includes(normType)
  ) {
    return 'SECURITY';
  }

  // Financial and approval events
  if (
    action === 'ISSUE_INVOICE' ||
    action === 'PAYMENT_RECORD' ||
    action === 'ISSUE_STATEMENT' ||
    ['invoice', 'payment', 'statement', 'invoiceline', 'statementline'].includes(normType)
  ) {
    return 'FINANCIAL';
  }

  // Business data events
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

  // 7. Category Filter (SECURITY | FINANCIAL | BUSINESS)
  if (query.category) {
    const cat = String(query.category).toUpperCase();
    if (cat === 'SECURITY') {
      where.AND = [
        {
          OR: [
            { action: { in: ['LOGIN', 'LOGOUT', 'USER_MANAGE'] } },
            { entityType: { in: ['User', 'Auth', 'RefreshToken', 'PasswordResetToken', 'AuditLog'] } },
          ],
        },
      ];
    } else if (cat === 'FINANCIAL') {
      where.AND = [
        {
          OR: [
            { action: { in: ['ISSUE_INVOICE', 'PAYMENT_RECORD', 'ISSUE_STATEMENT'] } },
            { entityType: { in: ['Invoice', 'Payment', 'Statement', 'InvoiceLine', 'StatementLine'] } },
          ],
        },
      ];
    } else if (cat === 'BUSINESS') {
      where.AND = [
        {
          entityType: { in: ['WorkEntry', 'Client', 'Site', 'WorkItemTemplate'] },
        },
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
      category: classifyAuditEvent(item.action, item.entityType),
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
      const cat = classifyAuditEvent(r.action, r.entityType);
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
    const eligibleWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lt: cutoffDate },
      entityType: { notIn: STATUTORY_PROTECTED_ENTITY_TYPES },
      action: { notIn: STATUTORY_PROTECTED_ACTIONS },
    };

    const olderProtectedWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lt: cutoffDate },
      OR: [
        { entityType: { in: STATUTORY_PROTECTED_ENTITY_TYPES } },
        { action: { in: STATUTORY_PROTECTED_ACTIONS } },
      ],
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
    ]);

    const totalProtectedRecords = recentProtectedCount + olderProtectedCount;

    // Calculate category breakdown of eligible records
    const categoryBreakdown = {
      SECURITY: 0,
      FINANCIAL: 0,
      BUSINESS: 0,
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
        explanationReason = `جميع سجلات التدقيق في النظام (${systemTotalRecords} سجل) أُنشئت حديثاً بعد تاريخ الفرز (${cutoffDateFormatted}) وهي محمية بالكامل ضمن فترة الحفظ المحددة.`;
        explanationReasonEn = `All ${systemTotalRecords} audit logs in the system were created recently after the cutoff date (${cutoffDateFormatted}) and are protected within the retention window.`;
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
      explanationReason = `يوجد ${totalEligibleCount} سجل إداري مؤهل للتنظيف أقدم من ${cutoffDateFormatted}. السجلات المالية والضريبية (${olderProtectedCount}) محمية دائماً.`;
      explanationReasonEn = `Found ${totalEligibleCount} eligible administrative records older than ${cutoffDateFormatted}. Financial and tax records (${olderProtectedCount}) are permanently preserved.`;
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
 * Controlled retention cleanup execution.
 * Requires:
 * 1. ORG_ADMIN or SUPER_ADMIN authorization.
 * 2. Explicit confirmation token ('CONFIRM_AUDIT_LOG_CLEANUP').
 * 3. Acknowledged policy compliance flag.
 * 4. Safe transaction with automatic exclusion of protected records.
 * 5. Immutable audit record generated ONLY when eligible records are deleted (prevents noise on zero deletion).
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

    const eligibleWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lt: cutoffDate },
      entityType: { notIn: STATUTORY_PROTECTED_ENTITY_TYPES },
      action: { notIn: STATUTORY_PROTECTED_ACTIONS },
    };

    // Pre-check count to prevent empty operations and noise
    const eligibleCount = await prisma.auditLog.count({ where: eligibleWhere });

    if (eligibleCount === 0) {
      // Do NOT create an audit log entry when 0 records are eligible (avoids noise)
      return res.json({
        success: true,
        message: `لم يتم حذف أي سجلات: لا توجد سجلات مؤهلة للحذف أقدم من ${cutoffDateFormatted}، وجميع السجلات الحالية محمية.`,
        data: {
          purgedCount: 0,
          cutoffDate: cutoffDate.toISOString(),
          cutoffDateFormatted,
          canExecute: false,
          reason: 'NO_ELIGIBLE_RECORDS',
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const deleteResult = await tx.auditLog.deleteMany({
        where: eligibleWhere,
      });

      // Immutable administrative audit log entry ONLY when records are actually deleted
      let cleanupLog = null;
      if (deleteResult.count > 0) {
        cleanupLog = await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: AuditAction.DELETE,
            entityType: 'AuditLog',
            entityId: 'RETENTION_CLEANUP',
            description: `Controlled retention cleanup executed: purged ${deleteResult.count} eligible records older than ${cutoffDateFormatted}. Financial, tax, and administrative records protected.`,
            metadata: {
              purgedCount: deleteResult.count,
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

      return { purgedCount: deleteResult.count, cleanupLog };
    });

    res.json({
      success: true,
      message: `Successfully purged ${result.purgedCount} eligible audit logs older than ${cutoffDateFormatted}`,
      data: {
        purgedCount: result.purgedCount,
        cutoffDate: cutoffDate.toISOString(),
        cutoffDateFormatted,
        cleanupAuditId: result.cleanupLog?.id || null,
      },
    });
  }
);

/**
 * DELETE /api/audit-logs/purge
 * Backward-compatible endpoint for existing test suites and administrative purge commands.
 * Strictly restricted to ORG_ADMIN or SUPER_ADMIN.
 * Applies statutory protections for financial and ZATCA records, and eliminates 0-count audit noise.
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

    const eligibleWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      createdAt: { lt: cutoffDate },
      entityType: { notIn: STATUTORY_PROTECTED_ENTITY_TYPES },
      action: { notIn: STATUTORY_PROTECTED_ACTIONS },
    };

    const eligibleCount = await prisma.auditLog.count({ where: eligibleWhere });

    if (eligibleCount === 0) {
      // Do NOT create noise audit log entry when 0 records are eligible
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

    const result = await prisma.$transaction(async (tx) => {
      const deleteResult = await tx.auditLog.deleteMany({
        where: eligibleWhere,
      });

      let purgeLog = null;
      if (deleteResult.count > 0) {
        purgeLog = await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: AuditAction.DELETE,
            entityType: 'AuditLog',
            entityId: 'RETENTION_PURGE',
            description: `Audit log retention purge: deleted ${deleteResult.count} records older than ${cutoffDateFormatted}`,
            metadata: {
              purgedCount: deleteResult.count,
              cutoffDate: cutoffDate.toISOString(),
              requestedBy: email,
              operation: 'RETENTION_PURGE',
              retentionDays: days ?? undefined,
            },
            ipAddress: req.ip || req.socket.remoteAddress,
          },
        });
      }

      return { purgedCount: deleteResult.count, purgeLog };
    });

    res.json({
      success: true,
      message: `Successfully purged ${result.purgedCount} audit logs older than ${cutoffDateFormatted}`,
      data: {
        purgedCount: result.purgedCount,
        cutoffDate: cutoffDate.toISOString(),
        cutoffDateFormatted,
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
      throw new ValidationError('فترة حفظ السجلات يجب ألا تقل عن 30 يوماً للامتثال النظامي / Retention period must be at least 30 days');
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
        description: `Updated audit log retention policy: retentionDays = ${days}, autoCleanup = ${Boolean(autoCleanupAuditLogs)}`,
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

// ─── Reset Test Audit Logs (Development / Testing Only) ─────────

/**
 * POST /api/audit-logs/reset-test-logs
 * Controlled developer/tester reset operation strictly forbidden in production.
 * Requirements:
 * 1. process.env.NODE_ENV !== 'production'.
 * 2. ORG_ADMIN or SUPER_ADMIN authorization.
 * 3. Explicit confirmation token: 'RESET_TEST_AUDIT_LOGS'.
 * 4. Preserves all business entities and statutory financial/tax records.
 * 5. Generates a permanent security audit record of the reset.
 */
router.post(
  '/reset-test-logs',
  requireRole(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;

    // Strict Environment Guard
    if (process.env.NODE_ENV === 'production') {
      throw new AuthorizationError(
        'عملية إعادة ضبط سجلات الفحص غير مسموحة نهائياً في بيئة الإنتاج / Reset test logs is strictly disabled in production environments'
      );
    }

    const { confirmationToken, confirmToken } = req.body || {};
    const token = (confirmationToken || confirmToken || '').trim();

    if (token !== 'RESET_TEST_AUDIT_LOGS') {
      throw new ValidationError(
        'رمز التأكيد "RESET_TEST_AUDIT_LOGS" إلزامي لتنفيذ عملية إعادة ضبط سجلات الاختبار / Explicit confirmation token "RESET_TEST_AUDIT_LOGS" is required'
      );
    }

    // Safety filter: NEVER delete statutory tax, invoice, payment, or statement records
    const testLogsWhere: Prisma.AuditLogWhereInput = {
      organizationId,
      entityType: { notIn: STATUTORY_PROTECTED_ENTITY_TYPES },
      action: { notIn: STATUTORY_PROTECTED_ACTIONS },
    };

    const eligibleTestCount = await prisma.auditLog.count({ where: testLogsWhere });

    const result = await prisma.$transaction(async (tx) => {
      const deleteResult = await tx.auditLog.deleteMany({
        where: testLogsWhere,
      });

      // Immutable security log documenting the reset operation
      const securityLog = await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: AuditAction.RESET_TEST_LOGS,
          entityType: 'AuditLog',
          entityId: 'TEST_AUDIT_RESET',
          description: `Reset test audit logs executed in ${process.env.NODE_ENV || 'development'} environment by admin ${email}: purged ${deleteResult.count} test/debug records. All statutory business, tax, and financial records were strictly preserved.`,
          metadata: {
            purgedCount: deleteResult.count,
            environment: process.env.NODE_ENV || 'development',
            performedBy: email,
            timestamp: new Date().toISOString(),
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return { purgedCount: deleteResult.count, securityLog };
    });

    const remainingProtected = await prisma.auditLog.count({ where: { organizationId } });

    res.json({
      success: true,
      message: `تمت إعادة ضبط سجلات التدقيق للاختبار بنجاح: تم حذف ${result.purgedCount} سجل تجريبي مع الحفاظ الكامل على ${remainingProtected} سجل نظامي ومالي وضريبي.`,
      data: {
        purgedCount: result.purgedCount,
        remainingProtectedCount: remainingProtected,
        securityLogId: result.securityLog.id,
      },
    });
  }
);

export default router;
