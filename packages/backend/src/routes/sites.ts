import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  authenticate,
  assertSameOrg,
  requirePermission,
  PERMISSIONS,
  AuthenticatedRequest,
} from '../middleware/auth';
import {
  NotFoundError,
  ValidationError,
  AuthorizationError,
  BusinessRuleError,
} from '../middleware/errorHandler';
import { SiteStatus, ClientStatus, Prisma, UserRole } from '@prisma/client';
import { isValidGoogleMapsUrl } from '../utils/geo';

const router = Router();

// All routes require authentication
router.use(authenticate);

function computeSiteCanDelete(counts?: { workEntries?: number; statementSites?: number }): boolean {
  if (!counts) return false;
  return (counts.workEntries ?? 0) === 0 && (counts.statementSites ?? 0) === 0;
}

// ─── List Sites ─────────────────────────────────────────────────

/**
 * GET /api/sites
 * List sites, optionally filtered by clientId, status, and search.
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const clientId = req.query.clientId as string | undefined;
  const statusParam = (req.query.status as string)?.trim();
  const excludeArchived = req.query.excludeArchived === 'true';
  const search = (req.query.search as string)?.trim();
  const sortBy = (req.query.sortBy as string) || 'createdAt';
  const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

  const where: Prisma.SiteWhereInput = { organizationId };

  if (clientId) where.clientId = clientId;
  if (statusParam === 'ARCHIVED' || statusParam === SiteStatus.CANCELLED) {
    where.status = SiteStatus.CANCELLED;
  } else if (statusParam === 'ALL_ACTIVE') {
    where.status = { not: SiteStatus.CANCELLED };
  } else if (statusParam === 'ALL') {
    // Include all statuses
  } else if (statusParam && Object.values(SiteStatus).includes(statusParam as SiteStatus)) {
    where.status = statusParam as SiteStatus;
  } else if (excludeArchived) {
    where.status = { not: SiteStatus.CANCELLED };
  }

  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: 'insensitive' } },
      { nameEn: { contains: search, mode: 'insensitive' } },
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ];
  }

  const allowedSortFields = ['createdAt', 'nameAr', 'nameEn', 'status'];
  const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [total, rawSites] = await Promise.all([
    prisma.site.count({ where }),
    prisma.site.findMany({
      where,
      skip,
      take: limit,
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true, status: true } },
        _count: { select: { workEntries: true, statementSites: true } },
      },
      orderBy: { [orderField]: sortOrder },
    }),
  ]);

  const sites = rawSites.map((s) => ({
    ...s,
    canDelete: computeSiteCanDelete(s._count),
  }));

  res.json({
    success: true,
    data: {
      items: sites,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── Get Single Site Details ────────────────────────────────────

/**
 * GET /api/sites/:id
 * Get a single site with work entries list and summary by status.
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const site = await prisma.site.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { workEntries: true, statementSites: true } },
      client: { select: { id: true, nameAr: true, nameEn: true, phone: true, status: true } },
      workEntries: {
        orderBy: { workDate: 'desc' },
        take: 100,
        include: {
          createdBy: { select: { id: true, nameAr: true } },
          approvedBy: { select: { id: true, nameAr: true } },
        },
      },
    },
  });

  if (!site) throw new NotFoundError('Site');
  assertSameOrg(organizationId, site.organizationId, 'Site');

  // Work entry summary by status
  const workEntrySummary = await prisma.workEntry.groupBy({
    by: ['status'],
    where: { siteId: site.id, organizationId },
    _count: { id: true },
    _sum: { totalAmount: true },
  });

  const totalAgg = await prisma.workEntry.aggregate({
    where: { siteId: site.id, organizationId },
    _count: { id: true },
    _sum: { totalAmount: true },
  });

  res.json({
    success: true,
    data: {
      ...site,
      canDelete: computeSiteCanDelete(site._count),
      workEntrySummary,
      stats: {
        totalEntries: totalAgg._count.id,
        totalValue: totalAgg._sum.totalAmount ?? 0,
      },
    },
  });
});

// ─── Create Site ────────────────────────────────────────────────

/**
 * POST /api/sites
 */
router.post('/', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;
  const {
    clientId,
    nameAr,
    nameEn,
    address,
    googleMapsUrl,
    description,
    referenceNo,
    startDate,
    endDate,
    status,
    notes,
  } = req.body;

  if (!clientId) throw new ValidationError('clientId is required');
  if (!nameAr || !String(nameAr).trim()) throw new ValidationError('nameAr is required');

  // Verify client exists, belongs to the same organization, and is not archived
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundError('Client');
  if (client.organizationId !== organizationId) {
    throw new AuthorizationError('Cannot link site to a client from another organization');
  }
  if (client.status === ClientStatus.INACTIVE) {
    throw new BusinessRuleError(
      'Cannot create a new site for an archived client. Please restore the client first.'
    );
  }

  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    throw new ValidationError('endDate cannot be earlier than startDate');
  }

  const cleanMapsUrl = googleMapsUrl ? String(googleMapsUrl).trim() : null;
  if (cleanMapsUrl && !isValidGoogleMapsUrl(cleanMapsUrl)) {
    throw new ValidationError(
      'Invalid Google Maps URL. Please provide a secure HTTPS link from Google Maps (e.g. https://maps.google.com/ or https://maps.app.goo.gl/)'
    );
  }

  const site = await prisma.$transaction(async (tx) => {
    const created = await tx.site.create({
      data: {
        organizationId,
        clientId,
        nameAr: String(nameAr).trim(),
        nameEn: nameEn ? String(nameEn).trim() : null,
        address: address ? String(address).trim() : null,
        googleMapsUrl: cleanMapsUrl,
        description: description ? String(description).trim() : null,
        referenceNo: referenceNo ? String(referenceNo).trim() : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status && Object.values(SiteStatus).includes(status) ? status : SiteStatus.ACTIVE,
        notes: notes ? String(notes).trim() : null,
      },
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'CREATE',
        entityType: 'Site',
        entityId: created.id,
        description: `Created site: ${created.nameAr}`,
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return created;
  });

  res.status(201).json({ success: true, data: { ...site, canDelete: true } });
});

// ─── Update Site ────────────────────────────────────────────────

/**
 * PUT /api/sites/:id
 */
router.put('/:id', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.site.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { workEntries: true, statementSites: true } } },
  });
  if (!existing) throw new NotFoundError('Site');
  assertSameOrg(organizationId, existing.organizationId, 'Site');

  const {
    id: _id,
    organizationId: _oid,
    createdAt: _ca,
    updatedAt: _ua,
    client: _client,
    workEntries: _we,
    workEntrySummary: _wes,
    stats: _stats,
    _count,
    canDelete: _cd,
    ...rawUpdateData
  } = req.body;

  if (rawUpdateData.nameAr !== undefined && !String(rawUpdateData.nameAr).trim()) {
    throw new ValidationError('nameAr cannot be empty');
  }

  // If clientId is being changed, verify new client belongs to org and no linked works exist
  if (rawUpdateData.clientId && rawUpdateData.clientId !== existing.clientId) {
    const newClient = await prisma.client.findUnique({ where: { id: rawUpdateData.clientId } });
    if (!newClient) throw new NotFoundError('Client');
    if (newClient.organizationId !== organizationId) {
      throw new AuthorizationError('Cannot link site to a client from another organization');
    }
    if (newClient.status === ClientStatus.INACTIVE) {
      throw new BusinessRuleError('Cannot transfer site to an archived client');
    }
    if (existing._count.workEntries > 0 || existing._count.statementSites > 0) {
      throw new BusinessRuleError(
        'Cannot change the client of a site that already has linked work entries or statements'
      );
    }
  }

  const updateData: Prisma.SiteUpdateInput = {};
  if (rawUpdateData.clientId && rawUpdateData.clientId !== existing.clientId) {
    updateData.client = { connect: { id: rawUpdateData.clientId } };
  }
  if (rawUpdateData.nameAr !== undefined) updateData.nameAr = String(rawUpdateData.nameAr).trim();
  if (rawUpdateData.nameEn !== undefined) {
    updateData.nameEn = rawUpdateData.nameEn ? String(rawUpdateData.nameEn).trim() : null;
  }
  if (rawUpdateData.address !== undefined) {
    updateData.address = rawUpdateData.address ? String(rawUpdateData.address).trim() : null;
  }
  if (rawUpdateData.googleMapsUrl !== undefined) {
    if (rawUpdateData.googleMapsUrl && String(rawUpdateData.googleMapsUrl).trim()) {
      const trimmedUrl = String(rawUpdateData.googleMapsUrl).trim();
      if (!isValidGoogleMapsUrl(trimmedUrl)) {
        throw new ValidationError(
          'Invalid Google Maps URL. Please provide a secure HTTPS link from Google Maps (e.g. https://maps.google.com/ or https://maps.app.goo.gl/)'
        );
      }
      updateData.googleMapsUrl = trimmedUrl;
    } else {
      updateData.googleMapsUrl = null;
    }
  }
  if (rawUpdateData.description !== undefined) {
    updateData.description = rawUpdateData.description ? String(rawUpdateData.description).trim() : null;
  }
  if (rawUpdateData.referenceNo !== undefined) {
    updateData.referenceNo = rawUpdateData.referenceNo ? String(rawUpdateData.referenceNo).trim() : null;
  }
  if (rawUpdateData.notes !== undefined) {
    updateData.notes = rawUpdateData.notes ? String(rawUpdateData.notes).trim() : null;
  }
  if (rawUpdateData.status && Object.values(SiteStatus).includes(rawUpdateData.status)) {
    updateData.status = rawUpdateData.status;
  }
  if (rawUpdateData.startDate !== undefined) {
    updateData.startDate = rawUpdateData.startDate ? new Date(rawUpdateData.startDate) : null;
  }
  if (rawUpdateData.endDate !== undefined) {
    updateData.endDate = rawUpdateData.endDate ? new Date(rawUpdateData.endDate) : null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const site = await tx.site.update({
      where: { id: req.params.id },
      data: updateData,
      include: { client: { select: { id: true, nameAr: true, nameEn: true } } },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'UPDATE',
        entityType: 'Site',
        entityId: site.id,
        description: `Updated site: ${site.nameAr}`,
        metadata: { updatedFields: Object.keys(updateData) },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return site;
  });

  res.json({ success: true, data: updated });
});

// ─── Archive Site ───────────────────────────────────────────────

/**
 * POST /api/sites/:id/archive
 * Archives a site (status = CANCELLED) while preserving all linked work entries and statements.
 */
router.post('/:id/archive', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.site.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('Site');
  assertSameOrg(organizationId, existing.organizationId, 'Site');

  const archived = await prisma.$transaction(async (tx) => {
    const site = await tx.site.update({
      where: { id: existing.id },
      data: { status: SiteStatus.CANCELLED },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'UPDATE',
        entityType: 'Site',
        entityId: existing.id,
        description: `Archived site: ${existing.nameAr}`,
        metadata: { operation: 'ARCHIVE', previousStatus: existing.status, newStatus: SiteStatus.CANCELLED },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return site;
  });

  res.json({ success: true, data: archived, message: 'Site archived successfully' });
});

// ─── Restore Archived Site ──────────────────────────────────────

/**
 * POST /api/sites/:id/restore
 * Restores an archived/cancelled site back to ACTIVE status.
 */
router.post('/:id/restore', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.site.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('Site');
  assertSameOrg(organizationId, existing.organizationId, 'Site');

  const restored = await prisma.$transaction(async (tx) => {
    const site = await tx.site.update({
      where: { id: existing.id },
      data: { status: SiteStatus.ACTIVE },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'UPDATE',
        entityType: 'Site',
        entityId: existing.id,
        description: `Restored site: ${existing.nameAr}`,
        metadata: { operation: 'RESTORE', previousStatus: existing.status, newStatus: SiteStatus.ACTIVE },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return site;
  });

  res.json({ success: true, data: restored, message: 'Site restored successfully' });
});

// ─── Safe Delete & Permanent Delete Helper ──────────────────────

async function handleSiteDeletion(
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

  const existing = await prisma.site.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { workEntries: true, statementSites: true } },
    },
  });

  if (!existing) throw new NotFoundError('Site');
  assertSameOrg(organizationId, existing.organizationId, 'Site');

  // Legacy default DELETE /api/sites/:id without mode/permanent query param archives the site
  if (!isHardDelete) {
    await prisma.$transaction([
      prisma.site.update({
        where: { id: existing.id },
        data: { status: SiteStatus.CANCELLED },
      }),
      prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'Site',
          entityId: existing.id,
          description: `Archived site: ${existing.nameAr}`,
          metadata: { operation: 'ARCHIVE' },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      }),
    ]);

    return res.json({ success: true, message: 'Site cancelled successfully' });
  }

  // For explicit permanent deletion, require ORG_ADMIN, SUPER_ADMIN, or MANAGE_SETTINGS permission
  if (isPermanentEndpoint || mode === 'permanent' || req.query.permanent === 'true') {
    const canPermanentDelete =
      role === UserRole.ORG_ADMIN ||
      role === UserRole.SUPER_ADMIN ||
      permissions.includes(PERMISSIONS.MANAGE_SETTINGS);
    if (!canPermanentDelete) {
      throw new AuthorizationError('Permanent deletion requires administrator or settings permission');
    }
  }

  // Enforce strict dependency checks on the server
  const counts = existing._count;
  if (!computeSiteCanDelete(counts)) {
    const reasons: string[] = [];
    if (counts.workEntries > 0) reasons.push(`${counts.workEntries} work entry(ies)`);
    if (counts.statementSites > 0) reasons.push(`${counts.statementSites} statement(s)`);

    throw new BusinessRuleError(
      `Cannot delete site "${existing.nameAr}" because it has linked operational or financial records (${reasons.join(', ')}). Please archive the site instead to preserve historical data.`
    );
  }

  await prisma.$transaction([
    prisma.site.delete({
      where: { id: existing.id },
    }),
    prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'DELETE',
        entityType: 'Site',
        entityId: existing.id,
        description: `Permanently deleted site: ${existing.nameAr}`,
        metadata: {
          operation: isPermanentEndpoint || mode === 'permanent' ? 'PERMANENT_DELETE' : 'SAFE_DELETE',
          deletedRecord: {
            nameAr: existing.nameAr,
            nameEn: existing.nameEn,
            clientId: existing.clientId,
          },
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    }),
  ]);

  return res.json({
    success: true,
    message: 'Site deleted permanently',
  });
}

/**
 * DELETE /api/sites/:id/permanent
 */
router.delete(
  '/:id/permanent',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    await handleSiteDeletion(req as AuthenticatedRequest, res, true);
  }
);

/**
 * DELETE /api/sites/:id
 */
router.delete('/:id', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  await handleSiteDeletion(req as AuthenticatedRequest, res, false);
});

export default router;
