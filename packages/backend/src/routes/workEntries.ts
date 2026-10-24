import { Router, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import {
  authenticate,
  requirePermission,
  PERMISSIONS,
  assertSameOrg,
  AuthenticatedRequest,
} from '../middleware/auth';
import {
  NotFoundError,
  ValidationError,
  BusinessRuleError,
  AuthorizationError,
} from '../middleware/errorHandler';
import { WorkEntryStatus, ClientStatus, SiteStatus, Prisma } from '@prisma/client';
import { getNextSequenceNumber } from '../utils/sequences';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Helpers ────────────────────────────────────────────────────

function computeTotal(quantity: Decimal | number | string, unitPrice: Decimal | number | string) {
  const q = new Decimal(quantity.toString());
  const p = new Decimal(unitPrice.toString());
  return q.mul(p).toDecimalPlaces(4);
}

// Editable statuses: DRAFT and REJECTED (rejected entries can be corrected and resubmitted)
const EDITABLE_STATUSES: WorkEntryStatus[] = [
  WorkEntryStatus.DRAFT,
  WorkEntryStatus.REJECTED,
];

// ─── List Work Entries ──────────────────────────────────────────

/**
 * GET /api/work-entries
 * Filter by clientId, siteId, workItemTemplateId, search, status, dateFrom, dateTo.
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.WorkEntryWhereInput = { organizationId };

  if (req.query.clientId) where.clientId = req.query.clientId as string;
  if (req.query.siteId) where.siteId = req.query.siteId as string;
  if (req.query.workItemTemplateId) {
    where.workItemTemplateId = req.query.workItemTemplateId as string;
  }

  const search = (req.query.search as string)?.trim();
  if (search) {
    where.OR = [
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { itemNameAr: { contains: search, mode: 'insensitive' } },
      { itemNameEn: { contains: search, mode: 'insensitive' } },
      { itemDescAr: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (req.query.status) {
    const statuses = (req.query.status as string)
      .split(',')
      .filter((s) => Object.values(WorkEntryStatus).includes(s as WorkEntryStatus)) as WorkEntryStatus[];
    if (statuses.length > 0) where.status = { in: statuses };
  }

  if (req.query.dateFrom || req.query.dateTo) {
    where.workDate = {};
    if (req.query.dateFrom) {
      (where.workDate as Prisma.DateTimeFilter).gte = new Date(req.query.dateFrom as string);
    }
    if (req.query.dateTo) {
      (where.workDate as Prisma.DateTimeFilter).lte = new Date(req.query.dateTo as string);
    }
  }

  const [total, entries, sumAgg] = await Promise.all([
    prisma.workEntry.count({ where }),
    prisma.workEntry.findMany({
      where,
      skip,
      take: limit,
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
        site: { select: { id: true, nameAr: true, nameEn: true } },
        createdBy: { select: { id: true, nameAr: true } },
        approvedBy: { select: { id: true, nameAr: true } },
      },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.workEntry.aggregate({
      where,
      _sum: { totalAmount: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      items: entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summaryTotalAmount: sumAgg._sum.totalAmount ?? 0,
    },
  });
});

// ─── Get Single Work Entry with Audit Trail ─────────────────────

/**
 * GET /api/work-entries/:id
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const entry = await prisma.workEntry.findUnique({
    where: { id: req.params.id },
    include: {
      client: { select: { id: true, nameAr: true, nameEn: true } },
      site: { select: { id: true, nameAr: true, nameEn: true } },
      workItemTemplate: true,
      createdBy: { select: { id: true, nameAr: true, email: true } },
      approvedBy: { select: { id: true, nameAr: true, email: true } },
    },
  });

  if (!entry) throw new NotFoundError('WorkEntry');
  assertSameOrg(organizationId, entry.organizationId, 'WorkEntry');

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      organizationId,
      entityType: 'WorkEntry',
      entityId: entry.id,
    },
    include: {
      user: { select: { id: true, nameAr: true, nameEn: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: { ...entry, auditLogs } });
});

// ─── Create Work Entry / Bulk ───────────────────────────────────

/**
 * POST /api/work-entries
 * Creates a single work entry or multiple entries in one transaction (if body is an array or body.items is an array).
 */
router.post('/', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: createdById, permissions: userPerms } = authReq.user;

  const isBulkArray = Array.isArray(req.body);
  const isBatchObject = !isBulkArray && Array.isArray(req.body?.items);

  const entriesInput: any[] = isBulkArray
    ? req.body
    : isBatchObject
    ? req.body.items.map((item: any) => ({
        clientId: req.body.clientId,
        siteId: req.body.siteId,
        workDate: req.body.workDate,
        submitImmediately: req.body.submitImmediately,
        approveImmediately: req.body.approveImmediately,
        ...item,
      }))
    : [req.body];

  if (entriesInput.length === 0) throw new ValidationError('No entries provided');
  if (entriesInput.length > 100) throw new ValidationError('Cannot create more than 100 entries at once');

  const results = await prisma.$transaction(async (tx) => {
    const created = [];
    const orgSettings = await tx.orgSettings.findUnique({ where: { organizationId } });

    for (const body of entriesInput) {
      const {
        clientId,
        siteId,
        workItemTemplateId,
        itemNameAr,
        itemNameEn,
        itemDescAr,
        itemDescEn,
        unit,
        unitEn,
        quantity,
        unitPrice,
        workDate,
        periodStart,
        periodEnd,
        notes,
        submitImmediately,
        approveImmediately,
      } = body;

      if (!clientId) throw new ValidationError('clientId is required');
      if (!siteId) throw new ValidationError('siteId is required');
      if (quantity === undefined || quantity === null || quantity === '') {
        throw new ValidationError('quantity is required');
      }
      if (unitPrice === undefined || unitPrice === null || unitPrice === '') {
        throw new ValidationError('unitPrice is required');
      }
      if (!workDate) throw new ValidationError('workDate is required');

      const numQty = Number(quantity);
      const numPrice = Number(unitPrice);
      if (isNaN(numQty) || numQty <= 0) {
        throw new ValidationError('Quantity must be greater than zero');
      }
      if (isNaN(numPrice) || numPrice < 0) {
        throw new ValidationError('Unit price cannot be negative');
      }

      // Verify client & site belong to org
      const [client, site] = await Promise.all([
        tx.client.findUnique({ where: { id: clientId } }),
        tx.site.findUnique({ where: { id: siteId } }),
      ]);
      if (!client) throw new NotFoundError(`Client (${clientId})`);
      if (client.organizationId !== organizationId) {
        throw new AuthorizationError('Cannot register work for a client from another organization');
      }
      if (client.status === ClientStatus.INACTIVE) {
        throw new BusinessRuleError('Cannot register work for an archived/inactive client');
      }
      if (!site) throw new NotFoundError(`Site (${siteId})`);
      if (site.organizationId !== organizationId) {
        throw new AuthorizationError('Cannot register work for a site from another organization');
      }
      if (site.status === SiteStatus.CANCELLED) {
        throw new BusinessRuleError('Cannot register work for an archived/cancelled site');
      }
      if (site.clientId !== clientId) {
        throw new ValidationError('Selected site does not belong to the selected client');
      }

      // Snapshot from template if provided
      let snapshotNameAr = itemNameAr ? String(itemNameAr).trim() : '';
      let snapshotNameEn = itemNameEn ? String(itemNameEn).trim() : null;
      let snapshotDescAr = itemDescAr ? String(itemDescAr).trim() : null;
      let snapshotDescEn = itemDescEn ? String(itemDescEn).trim() : null;
      let snapshotUnit = unit ? String(unit).trim() : '';
      let snapshotUnitEn = unitEn ? String(unitEn).trim() : null;

      if (workItemTemplateId) {
        const template = await tx.workItemTemplate.findFirst({
          where: { id: workItemTemplateId, organizationId },
        });
        if (!template) throw new NotFoundError(`WorkItemTemplate (${workItemTemplateId})`);
        if (!template.isActive) {
          throw new BusinessRuleError('Cannot register work using an archived work item template');
        }

        snapshotNameAr = snapshotNameAr || template.nameAr;
        snapshotNameEn = snapshotNameEn || template.nameEn;
        snapshotDescAr = snapshotDescAr || template.descriptionAr;
        snapshotDescEn = snapshotDescEn || template.descriptionEn;
        snapshotUnit = snapshotUnit || template.unit;
        snapshotUnitEn = snapshotUnitEn || template.unitEn;
      }

      if (!snapshotNameAr) {
        throw new ValidationError('itemNameAr is required when not using a template');
      }
      if (!snapshotUnit) {
        throw new ValidationError('unit is required when not using a template');
      }

      const { referenceNo } = await getNextSequenceNumber(tx, organizationId, 'work_entry');
      const totalAmount = computeTotal(quantity, unitPrice);

      let initialStatus: WorkEntryStatus = WorkEntryStatus.DRAFT;
      let approvedById: string | null = null;
      let approvedAt: Date | null = null;

      if (approveImmediately) {
        if (!userPerms.includes(PERMISSIONS.APPROVE_WORK)) {
          throw new AuthorizationError('You do not have permission to approve work entries');
        }
        if (orgSettings && !orgSettings.selfApprovalAllowed) {
          throw new BusinessRuleError('Self-approval is disabled in organization settings');
        }
        initialStatus = WorkEntryStatus.APPROVED;
        approvedById = createdById;
        approvedAt = new Date();
      } else if (submitImmediately) {
        initialStatus = WorkEntryStatus.PENDING_APPROVAL;
      }

      const entry = await tx.workEntry.create({
        data: {
          organizationId,
          clientId,
          siteId,
          referenceNo,
          workItemTemplateId: workItemTemplateId || null,
          itemNameAr: snapshotNameAr,
          itemNameEn: snapshotNameEn,
          itemDescAr: snapshotDescAr,
          itemDescEn: snapshotDescEn,
          unit: snapshotUnit,
          unitEn: snapshotUnitEn,
          quantity: new Decimal(quantity.toString()),
          unitPrice: new Decimal(unitPrice.toString()),
          totalAmount,
          workDate: new Date(workDate),
          periodStart: periodStart ? new Date(periodStart) : null,
          periodEnd: periodEnd ? new Date(periodEnd) : null,
          notes: notes ? String(notes).trim() : null,
          createdById,
          status: initialStatus,
          approvedById,
          approvedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: createdById,
          action: initialStatus === WorkEntryStatus.APPROVED ? 'APPROVE' : 'CREATE',
          entityType: 'WorkEntry',
          entityId: entry.id,
          description: `Created work entry ${entry.referenceNo} (${entry.itemNameAr}) with status ${entry.status}`,
          metadata: {
            referenceNo: entry.referenceNo,
            quantity: entry.quantity.toString(),
            unitPrice: entry.unitPrice.toString(),
            totalAmount: entry.totalAmount.toString(),
            status: entry.status,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      created.push(entry);
    }

    return created;
  });

  if (isBulkArray || isBatchObject) {
    res.status(201).json({ success: true, data: results });
  } else {
    res.status(201).json({ success: true, data: results[0] });
  }
});

// ─── Update Work Entry ──────────────────────────────────────────

/**
 * PUT /api/work-entries/:id
 * Allowed when status is DRAFT or REJECTED.
 */
router.put('/:id', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.workEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('WorkEntry');
  assertSameOrg(organizationId, existing.organizationId, 'WorkEntry');

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new BusinessRuleError(`Cannot edit a work entry with status ${existing.status}`);
  }

  const {
    id: _id,
    organizationId: _oid,
    referenceNo: _ref,
    createdAt: _ca,
    updatedAt: _ua,
    createdById: _cbid,
    status: _status,
    approvedById: _abid,
    approvedAt: _aat,
    billedQuantity: _bq,
    client: _c,
    site: _s,
    workItemTemplate: _wit,
    createdBy: _cb,
    approvedBy: _ab,
    auditLogs: _al,
    ...updateData
  } = req.body;

  if (updateData.quantity !== undefined) {
    const q = Number(updateData.quantity);
    if (isNaN(q) || q <= 0) {
      throw new ValidationError('Quantity must be greater than zero');
    }
    updateData.quantity = new Decimal(updateData.quantity.toString());
  }

  if (updateData.unitPrice !== undefined) {
    const p = Number(updateData.unitPrice);
    if (isNaN(p) || p < 0) {
      throw new ValidationError('Unit price cannot be negative');
    }
    updateData.unitPrice = new Decimal(updateData.unitPrice.toString());
  }

  if (updateData.workDate) {
    updateData.workDate = new Date(updateData.workDate);
  }

  const newQuantity = updateData.quantity ?? existing.quantity;
  const newUnitPrice = updateData.unitPrice ?? existing.unitPrice;
  updateData.totalAmount = computeTotal(newQuantity, newUnitPrice);

  const updated = await prisma.$transaction(async (tx) => {
    const entry = await tx.workEntry.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'UPDATE',
        entityType: 'WorkEntry',
        entityId: entry.id,
        description: `Updated work entry ${entry.referenceNo}`,
        metadata: { updatedFields: Object.keys(updateData) },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return entry;
  });

  res.json({ success: true, data: updated });
});

// ─── Submit Work Entry for Approval ─────────────────────────────

/**
 * POST /api/work-entries/:id/submit
 * Transition: DRAFT or REJECTED → PENDING_APPROVAL
 */
router.post(
  '/:id/submit',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const entry = await prisma.workEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) throw new NotFoundError('WorkEntry');
    assertSameOrg(organizationId, entry.organizationId, 'WorkEntry');

    if (entry.status !== WorkEntryStatus.DRAFT && entry.status !== WorkEntryStatus.REJECTED) {
      throw new BusinessRuleError(
        `Can only submit DRAFT or REJECTED entries, current status: ${entry.status}`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const we = await tx.workEntry.update({
        where: { id: req.params.id },
        data: {
          status: WorkEntryStatus.PENDING_APPROVAL,
          rejectionReason: null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'UPDATE',
          entityType: 'WorkEntry',
          entityId: we.id,
          description: `Submitted work entry ${we.referenceNo} for approval`,
          metadata: { previousStatus: entry.status, newStatus: WorkEntryStatus.PENDING_APPROVAL },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return we;
    });

    res.json({ success: true, data: updated });
  }
);

// ─── Approve Work Entry ─────────────────────────────────────────

/**
 * POST /api/work-entries/:id/approve
 * Transition: PENDING_APPROVAL (or DRAFT) → APPROVED
 * Requires APPROVE_WORK permission.
 */
router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.APPROVE_WORK),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: approverId } = authReq.user;

    const entry = await prisma.workEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) throw new NotFoundError('WorkEntry');
    assertSameOrg(organizationId, entry.organizationId, 'WorkEntry');

    if (
      entry.status !== WorkEntryStatus.PENDING_APPROVAL &&
      entry.status !== WorkEntryStatus.DRAFT
    ) {
      throw new BusinessRuleError(
        `Can only approve PENDING_APPROVAL or DRAFT entries, current status: ${entry.status}`
      );
    }

    // Check self-approval policy
    const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
    if (orgSettings && !orgSettings.selfApprovalAllowed && entry.createdById === approverId) {
      throw new BusinessRuleError('Self-approval is not allowed in your organization settings');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const we = await tx.workEntry.update({
        where: { id: req.params.id },
        data: {
          status: WorkEntryStatus.APPROVED,
          approvedById: approverId,
          approvedAt: new Date(),
          rejectionReason: null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: approverId,
          action: 'APPROVE',
          entityType: 'WorkEntry',
          entityId: we.id,
          description: `Approved work entry ${we.referenceNo}`,
          metadata: { previousStatus: entry.status, newStatus: WorkEntryStatus.APPROVED },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return we;
    });

    res.json({ success: true, data: updated });
  }
);

// ─── Reject Work Entry ──────────────────────────────────────────

/**
 * POST /api/work-entries/:id/reject
 * Transition: PENDING_APPROVAL → REJECTED
 * Requires APPROVE_WORK permission and a rejectionReason.
 */
router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.APPROVE_WORK),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: approverId } = authReq.user;
    const { rejectionReason } = req.body;

    if (!rejectionReason || !String(rejectionReason).trim()) {
      throw new ValidationError('rejectionReason is required');
    }

    const entry = await prisma.workEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) throw new NotFoundError('WorkEntry');
    assertSameOrg(organizationId, entry.organizationId, 'WorkEntry');

    if (entry.status !== WorkEntryStatus.PENDING_APPROVAL) {
      throw new BusinessRuleError(
        `Can only reject PENDING_APPROVAL entries, current status: ${entry.status}`
      );
    }

    const reasonText = String(rejectionReason).trim();

    const updated = await prisma.$transaction(async (tx) => {
      const we = await tx.workEntry.update({
        where: { id: req.params.id },
        data: {
          status: WorkEntryStatus.REJECTED,
          approvedById: approverId,
          approvedAt: new Date(),
          rejectionReason: reasonText,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: approverId,
          action: 'REJECT',
          entityType: 'WorkEntry',
          entityId: we.id,
          description: `Rejected work entry ${we.referenceNo}: ${reasonText}`,
          metadata: {
            previousStatus: entry.status,
            newStatus: WorkEntryStatus.REJECTED,
            rejectionReason: reasonText,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return we;
    });

    res.json({ success: true, data: updated });
  }
);

// ─── Delete Work Entry ──────────────────────────────────────────

/**
 * DELETE /api/work-entries/:id
 * Only DRAFT entries.
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const entry = await prisma.workEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) throw new NotFoundError('WorkEntry');
    assertSameOrg(organizationId, entry.organizationId, 'WorkEntry');

    if (entry.status !== WorkEntryStatus.DRAFT) {
      throw new BusinessRuleError(
        `Only DRAFT entries can be deleted, current status: ${entry.status}`
      );
    }

    await prisma.$transaction([
      prisma.workEntry.delete({ where: { id: req.params.id } }),
      prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'WorkEntry',
          entityId: entry.id,
          description: `Deleted draft work entry ${entry.referenceNo}`,
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      }),
    ]);

    res.json({ success: true, message: 'Work entry deleted successfully' });
  }
);

export default router;
