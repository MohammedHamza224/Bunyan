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
import { Prisma, UserRole } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate);

function computeWorkItemCanDelete(counts?: { workEntries?: number }): boolean {
  if (!counts) return false;
  return (counts.workEntries ?? 0) === 0;
}

// ─── List Work Items ────────────────────────────────────────────

/**
 * GET /api/work-items
 * List work item templates with pagination, search, and active/archived status filter.
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
  const skip = (page - 1) * limit;
  const search = (req.query.search as string)?.trim();
  const includeInactive = req.query.includeInactive === 'true';
  const statusFilter = (req.query.status as string)?.trim(); // 'ACTIVE' | 'ARCHIVED' | 'ALL'
  const excludeArchived = req.query.excludeArchived === 'true';

  const where: Prisma.WorkItemTemplateWhereInput = {
    organizationId,
  };

  if (statusFilter === 'ARCHIVED' || statusFilter === 'INACTIVE') {
    where.isActive = false;
  } else if (statusFilter === 'ALL' || includeInactive) {
    // no filter on isActive
  } else if (statusFilter === 'ACTIVE' || excludeArchived) {
    where.isActive = true;
  } else {
    // Default: show active unless specified
    where.isActive = true;
  }

  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: 'insensitive' } },
      { nameEn: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { descriptionAr: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, rawItems] = await Promise.all([
    prisma.workItemTemplate.count({ where }),
    prisma.workItemTemplate.findMany({
      where,
      skip,
      take: limit,
      include: {
        unitOfMeasure: true,
        _count: { select: { workEntries: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
  ]);

  const items = rawItems.map((item) => ({
    ...item,
    canDelete: computeWorkItemCanDelete(item._count),
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
});

// ─── Get Single Work Item ───────────────────────────────────────

/**
 * GET /api/work-items/:id
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const item = await prisma.workItemTemplate.findUnique({
    where: { id: req.params.id },
    include: {
      unitOfMeasure: true,
      _count: { select: { workEntries: true } },
      workEntries: {
        take: 20,
        orderBy: { workDate: 'desc' },
        select: {
          id: true,
          referenceNo: true,
          workDate: true,
          quantity: true,
          unitPrice: true,
          totalAmount: true,
          status: true,
          client: { select: { id: true, nameAr: true, nameEn: true } },
          site: { select: { id: true, nameAr: true, nameEn: true } },
        },
      },
    },
  });
  if (!item) throw new NotFoundError('WorkItemTemplate');
  assertSameOrg(organizationId, item.organizationId, 'WorkItemTemplate');

  res.json({
    success: true,
    data: {
      ...item,
      canDelete: computeWorkItemCanDelete(item._count),
    },
  });
});

// ─── Create Work Item ───────────────────────────────────────────

/**
 * POST /api/work-items
 * Requires CREATE_WORK permission.
 */
router.post(
  '/',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;
    const {
      code,
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      unit,
      unitEn,
      unitOfMeasureId,
      defaultPrice,
      notes,
      sortOrder,
      isActive,
    } = req.body;

    let resolvedUnitOfMeasureId: string | null = null;
    let resolvedUnit = unit ? String(unit).trim() : '';
    let resolvedUnitEn = unitEn ? String(unitEn).trim() : null;

    if (unitOfMeasureId) {
      const uom = await prisma.unitOfMeasure.findFirst({
        where: { id: unitOfMeasureId, organizationId },
      });
      if (uom) {
        resolvedUnitOfMeasureId = uom.id;
        resolvedUnit = uom.symbolAr;
        resolvedUnitEn = uom.symbolEn;
      }
    } else if (resolvedUnit) {
      const uom = await prisma.unitOfMeasure.findFirst({
        where: {
          organizationId,
          OR: [
            { symbolAr: resolvedUnit },
            { nameAr: resolvedUnit },
            { code: resolvedUnit },
          ],
        },
      });
      if (uom) {
        resolvedUnitOfMeasureId = uom.id;
        resolvedUnit = uom.symbolAr;
        if (!resolvedUnitEn) resolvedUnitEn = uom.symbolEn;
      }
    }

    if (!nameAr || !String(nameAr).trim()) throw new ValidationError('nameAr is required');
    if (!resolvedUnit) throw new ValidationError('unit is required');

    let parsedPrice: Decimal | null = null;
    if (defaultPrice !== undefined && defaultPrice !== null && defaultPrice !== '') {
      const num = Number(defaultPrice);
      if (isNaN(num) || num < 0) {
        throw new ValidationError('defaultPrice cannot be negative');
      }
      parsedPrice = new Decimal(num.toString());
    }

    // Optional short code uniqueness check within org if code is provided
    if (code && String(code).trim()) {
      const existingCode = await prisma.workItemTemplate.findFirst({
        where: { organizationId, code: String(code).trim() },
      });
      if (existingCode) {
        throw new ValidationError(`A work item with code "${code}" already exists in your organization`);
      }
    }

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.workItemTemplate.create({
        data: {
          organizationId,
          code: code ? String(code).trim() : null,
          nameAr: String(nameAr).trim(),
          nameEn: nameEn ? String(nameEn).trim() : null,
          descriptionAr: descriptionAr ? String(descriptionAr).trim() : null,
          descriptionEn: descriptionEn ? String(descriptionEn).trim() : null,
          unit: resolvedUnit,
          unitEn: resolvedUnitEn,
          unitOfMeasureId: resolvedUnitOfMeasureId,
          defaultPrice: parsedPrice,
          notes: notes ? String(notes).trim() : null,
          sortOrder: sortOrder ?? 0,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
        include: { unitOfMeasure: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CREATE',
          entityType: 'WorkItemTemplate',
          entityId: created.id,
          description: `Created work item template: ${created.nameAr}`,
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return created;
    });

    res.status(201).json({ success: true, data: { ...item, canDelete: true } });
  }
);

// ─── Update Work Item ───────────────────────────────────────────

/**
 * PUT /api/work-items/:id
 * Modifying defaultPrice here NEVER alters historical WorkEntry records.
 */
router.put(
  '/:id',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const existing = await prisma.workItemTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('WorkItemTemplate');
    assertSameOrg(organizationId, existing.organizationId, 'WorkItemTemplate');

    const {
      id: _id,
      organizationId: _oid,
      createdAt: _ca,
      updatedAt: _ua,
      _count,
      canDelete: _cd,
      workEntries: _we,
      ...rawUpdateData
    } = req.body;

    if (rawUpdateData.nameAr !== undefined && !String(rawUpdateData.nameAr).trim()) {
      throw new ValidationError('nameAr cannot be empty');
    }
    if (rawUpdateData.unit !== undefined && !String(rawUpdateData.unit).trim()) {
      throw new ValidationError('unit cannot be empty');
    }

    // Code uniqueness check if changed
    if (
      rawUpdateData.code !== undefined &&
      rawUpdateData.code !== null &&
      String(rawUpdateData.code).trim() &&
      String(rawUpdateData.code).trim() !== existing.code
    ) {
      const existingCode = await prisma.workItemTemplate.findFirst({
        where: {
          organizationId,
          code: String(rawUpdateData.code).trim(),
          id: { not: existing.id },
        },
      });
      if (existingCode) {
        throw new ValidationError(
          `A work item with code "${rawUpdateData.code}" already exists in your organization`
        );
      }
    }

    const updateData: Prisma.WorkItemTemplateUpdateInput = {};
    if (rawUpdateData.code !== undefined) {
      updateData.code = rawUpdateData.code ? String(rawUpdateData.code).trim() : null;
    }
    if (rawUpdateData.nameAr !== undefined) updateData.nameAr = String(rawUpdateData.nameAr).trim();
    if (rawUpdateData.nameEn !== undefined) {
      updateData.nameEn = rawUpdateData.nameEn ? String(rawUpdateData.nameEn).trim() : null;
    }
    if (rawUpdateData.descriptionAr !== undefined) {
      updateData.descriptionAr = rawUpdateData.descriptionAr ? String(rawUpdateData.descriptionAr).trim() : null;
    }
    if (rawUpdateData.descriptionEn !== undefined) {
      updateData.descriptionEn = rawUpdateData.descriptionEn ? String(rawUpdateData.descriptionEn).trim() : null;
    }
    if (rawUpdateData.unitOfMeasureId !== undefined) {
      if (rawUpdateData.unitOfMeasureId) {
        const uom = await prisma.unitOfMeasure.findFirst({
          where: { id: rawUpdateData.unitOfMeasureId, organizationId },
        });
        if (uom) {
          updateData.unitOfMeasure = { connect: { id: uom.id } };
          updateData.unit = uom.symbolAr;
          updateData.unitEn = uom.symbolEn;
        }
      } else {
        updateData.unitOfMeasure = { disconnect: true };
      }
    } else if (rawUpdateData.unit !== undefined) {
      const uStr = String(rawUpdateData.unit).trim();
      updateData.unit = uStr;
      const uom = await prisma.unitOfMeasure.findFirst({
        where: {
          organizationId,
          OR: [{ symbolAr: uStr }, { nameAr: uStr }, { code: uStr }],
        },
      });
      if (uom) {
        updateData.unitOfMeasure = { connect: { id: uom.id } };
        if (!rawUpdateData.unitEn) updateData.unitEn = uom.symbolEn;
      }
    }
    if (rawUpdateData.unitEn !== undefined && rawUpdateData.unitOfMeasureId === undefined) {
      updateData.unitEn = rawUpdateData.unitEn ? String(rawUpdateData.unitEn).trim() : null;
    }
    if (rawUpdateData.notes !== undefined) {
      updateData.notes = rawUpdateData.notes ? String(rawUpdateData.notes).trim() : null;
    }
    if (rawUpdateData.sortOrder !== undefined) updateData.sortOrder = Number(rawUpdateData.sortOrder) || 0;
    if (rawUpdateData.isActive !== undefined) updateData.isActive = Boolean(rawUpdateData.isActive);

    if (
      rawUpdateData.defaultPrice !== undefined &&
      rawUpdateData.defaultPrice !== null &&
      rawUpdateData.defaultPrice !== ''
    ) {
      const num = Number(rawUpdateData.defaultPrice);
      if (isNaN(num) || num < 0) {
        throw new ValidationError('defaultPrice cannot be negative');
      }
      updateData.defaultPrice = new Decimal(num.toString());
    } else if (rawUpdateData.defaultPrice === '' || rawUpdateData.defaultPrice === null) {
      updateData.defaultPrice = null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.workItemTemplate.update({
        where: { id: req.params.id },
        data: updateData,
        include: { unitOfMeasure: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'UPDATE',
          entityType: 'WorkItemTemplate',
          entityId: item.id,
          description: `Updated work item template: ${item.nameAr}`,
          metadata: { updatedFields: Object.keys(updateData) },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return item;
    });

    res.json({ success: true, data: updated });
  }
);

// ─── Archive Work Item ──────────────────────────────────────────

/**
 * POST /api/work-items/:id/archive
 * Archives a work item (isActive = false).
 */
router.post(
  '/:id/archive',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const existing = await prisma.workItemTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('WorkItemTemplate');
    assertSameOrg(organizationId, existing.organizationId, 'WorkItemTemplate');

    const archived = await prisma.$transaction(async (tx) => {
      const item = await tx.workItemTemplate.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'UPDATE',
          entityType: 'WorkItemTemplate',
          entityId: existing.id,
          description: `Archived work item template: ${existing.nameAr}`,
          metadata: { operation: 'ARCHIVE', previousStatus: existing.isActive, newStatus: false },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return item;
    });

    res.json({ success: true, data: archived, message: 'Work item archived successfully' });
  }
);

// ─── Restore Archived Work Item ─────────────────────────────────

/**
 * POST /api/work-items/:id/restore
 * Restores an archived work item (isActive = true).
 */
router.post(
  '/:id/restore',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const existing = await prisma.workItemTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('WorkItemTemplate');
    assertSameOrg(organizationId, existing.organizationId, 'WorkItemTemplate');

    const restored = await prisma.$transaction(async (tx) => {
      const item = await tx.workItemTemplate.update({
        where: { id: existing.id },
        data: { isActive: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'UPDATE',
          entityType: 'WorkItemTemplate',
          entityId: existing.id,
          description: `Restored work item template: ${existing.nameAr}`,
          metadata: { operation: 'RESTORE', previousStatus: existing.isActive, newStatus: true },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return item;
    });

    res.json({ success: true, data: restored, message: 'Work item restored successfully' });
  }
);

// ─── Safe Delete & Permanent Delete Helper ──────────────────────

async function handleWorkItemDeletion(
  req: AuthenticatedRequest,
  res: Response,
  isPermanentEndpoint: boolean
) {
  const { organizationId, id: userId, role, permissions } = req.user;
  const mode = (req.query.mode as string)?.toLowerCase();
  const isHardDelete =
    isPermanentEndpoint ||
    mode === 'delete' ||
    mode === 'permanent' ||
    req.query.permanent === 'true';

  const existing = await prisma.workItemTemplate.findUnique({
    where: { id: req.params.id },
    include: {
      unitOfMeasure: true,
      _count: { select: { workEntries: true } },
    },
  });

  if (!existing) throw new NotFoundError('WorkItemTemplate');
  assertSameOrg(organizationId, existing.organizationId, 'WorkItemTemplate');

  // Legacy default soft delete sets isActive = false
  if (!isHardDelete) {
    await prisma.$transaction([
      prisma.workItemTemplate.update({
        where: { id: existing.id },
        data: { isActive: false },
      }),
      prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'WorkItemTemplate',
          entityId: existing.id,
          description: `Archived work item template: ${existing.nameAr}`,
          metadata: { operation: 'ARCHIVE' },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      }),
    ]);

    return res.json({ success: true, message: 'Work item archived successfully' });
  }

  // Explicit permanent deletion requires administrator or settings permission
  if (isPermanentEndpoint || mode === 'permanent' || req.query.permanent === 'true') {
    const canPermanentDelete =
      role === UserRole.ORG_ADMIN ||
      role === UserRole.SUPER_ADMIN ||
      permissions.includes(PERMISSIONS.MANAGE_SETTINGS);
    if (!canPermanentDelete) {
      throw new AuthorizationError('Permanent deletion requires administrator or settings permission');
    }
  }

  // Enforce strict dependency check: cannot delete if linked to any work entries
  if (!computeWorkItemCanDelete(existing._count)) {
    throw new BusinessRuleError(
      `Cannot delete work item "${existing.nameAr}" because it is referenced by ${existing._count.workEntries} historical work entry(ies). Please archive the work item instead to protect historical records.`
    );
  }

  await prisma.$transaction([
    prisma.workItemTemplate.delete({
      where: { id: existing.id },
    }),
    prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'DELETE',
        entityType: 'WorkItemTemplate',
        entityId: existing.id,
        description: `Permanently deleted work item template: ${existing.nameAr}`,
        metadata: {
          operation: isPermanentEndpoint || mode === 'permanent' ? 'PERMANENT_DELETE' : 'SAFE_DELETE',
          deletedRecord: {
            nameAr: existing.nameAr,
            nameEn: existing.nameEn,
            code: existing.code,
            unit: existing.unit,
          },
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    }),
  ]);

  return res.json({
    success: true,
    message: 'Work item deleted permanently',
  });
}

/**
 * DELETE /api/work-items/:id/permanent
 */
router.delete(
  '/:id/permanent',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    await handleWorkItemDeletion(req as AuthenticatedRequest, res, true);
  }
);

/**
 * DELETE /api/work-items/:id
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    await handleWorkItemDeletion(req as AuthenticatedRequest, res, false);
  }
);

export default router;
