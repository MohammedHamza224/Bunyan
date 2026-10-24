import { Router, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
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
  BusinessRuleError,
  AuthorizationError,
} from '../middleware/errorHandler';
import { ClientStatus, ClientType, InvoiceStatus, Prisma, UserRole } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate);

function computeClientCanDelete(counts?: {
  sites?: number;
  workEntries?: number;
  statements?: number;
  invoices?: number;
  payments?: number;
}): boolean {
  if (!counts) return false;
  return (
    (counts.sites ?? 0) === 0 &&
    (counts.workEntries ?? 0) === 0 &&
    (counts.statements ?? 0) === 0 &&
    (counts.invoices ?? 0) === 0 &&
    (counts.payments ?? 0) === 0
  );
}

// ─── List Clients ───────────────────────────────────────────────

/**
 * GET /api/clients
 * List clients with pagination, search, status/type filter, and sorting.
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;
  const search = (req.query.search as string)?.trim();
  const statusParam = (req.query.status as string)?.trim();
  const excludeArchived = req.query.excludeArchived === 'true';
  const clientType = req.query.clientType as ClientType | undefined;
  const sortBy = (req.query.sortBy as string) || 'createdAt';
  const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

  const where: Prisma.ClientWhereInput = { organizationId };

  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: 'insensitive' } },
      { nameEn: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { vatNumber: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (statusParam === 'ARCHIVED' || statusParam === ClientStatus.INACTIVE) {
    where.status = ClientStatus.INACTIVE;
  } else if (statusParam === ClientStatus.ACTIVE) {
    where.status = ClientStatus.ACTIVE;
  } else if (statusParam === 'ALL') {
    // Include both ACTIVE and INACTIVE
  } else if (excludeArchived) {
    where.status = ClientStatus.ACTIVE;
  }

  if (clientType && Object.values(ClientType).includes(clientType)) {
    where.clientType = clientType;
  }

  const allowedSortFields = ['createdAt', 'nameAr', 'nameEn', 'status'];
  const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [total, rawClients] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            sites: true,
            workEntries: true,
            statements: true,
            invoices: true,
            payments: true,
          },
        },
      },
      orderBy: { [orderField]: sortOrder },
    }),
  ]);

  const clients = rawClients.map((c) => ({
    ...c,
    canDelete: computeClientCanDelete(c._count),
  }));

  res.json({
    success: true,
    data: {
      items: clients,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── Get Single Client Details ──────────────────────────────────

/**
 * GET /api/clients/:id
 * Get a single client with related sites, work entries, statements, invoices, payments, and financial balance.
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: {
          sites: true,
          workEntries: true,
          statements: true,
          invoices: true,
          payments: true,
        },
      },
      sites: {
        orderBy: { createdAt: 'desc' },
      },
      workEntries: {
        orderBy: { workDate: 'desc' },
        take: 50,
        include: {
          site: { select: { id: true, nameAr: true, nameEn: true } },
        },
      },
      statements: {
        orderBy: { issueDate: 'desc' },
        take: 50,
      },
      invoices: {
        orderBy: { issueDate: 'desc' },
        take: 50,
      },
      payments: {
        orderBy: { paymentDate: 'desc' },
        take: 50,
        include: {
          invoice: { select: { id: true, referenceNo: true } },
        },
      },
    },
  });

  if (!client) throw new NotFoundError('Client');
  assertSameOrg(organizationId, client.organizationId, 'Client');

  // Compute accurate financial summary from database (excluding DRAFT and CANCELLED invoices)
  const [workEntryStats, issuedInvoices, paymentsAgg] = await Promise.all([
    prisma.workEntry.aggregate({
      where: { clientId: client.id, organizationId },
      _count: { id: true },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.findMany({
      where: {
        clientId: client.id,
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
      },
      select: {
        id: true,
        invoiceType: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
      },
    }),
    prisma.payment.aggregate({
      where: { clientId: client.id, organizationId },
      _sum: { amount: true },
    }),
  ]);

  let grossInvoiceValue = new Decimal(0);
  let netInvoiceValue = new Decimal(0);
  let outstandingBalance = new Decimal(0);
  let baseInvoicesCount = 0;

  for (const inv of issuedInvoices) {
    const amt = new Decimal(inv.totalAmount.toString());
    if (inv.invoiceType === 'CREDIT_NOTE') {
      netInvoiceValue = netInvoiceValue.sub(amt);
    } else if (inv.invoiceType === 'DEBIT_NOTE') {
      netInvoiceValue = netInvoiceValue.add(amt);
    } else {
      baseInvoicesCount += 1;
      grossInvoiceValue = grossInvoiceValue.add(amt);
      netInvoiceValue = netInvoiceValue.add(amt);
      outstandingBalance = outstandingBalance.add(new Decimal(inv.remainingAmount.toString()));
    }
  }

  const totalPaid = new Decimal(paymentsAgg._sum.amount?.toString() ?? '0');

  res.json({
    success: true,
    data: {
      ...client,
      canDelete: computeClientCanDelete(client._count),
      stats: {
        totalWorkEntries: workEntryStats._count.id,
        totalWorkValue: Number(workEntryStats._sum.totalAmount ?? 0),
        totalInvoices: baseInvoicesCount,
        grossInvoiceValue: Number(grossInvoiceValue),
        totalInvoiceValue: Number(grossInvoiceValue),
        netInvoiceValue: Number(netInvoiceValue),
        totalPaid: Number(totalPaid),
        outstandingBalance: Number(outstandingBalance),
      },
    },
  });
});

// ─── Create Client ──────────────────────────────────────────────

/**
 * POST /api/clients
 */
router.post('/', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;
  const { nameAr, nameEn, clientType, phone, email, address, vatNumber, notes, status } = req.body;

  if (!nameAr || !String(nameAr).trim()) {
    throw new ValidationError('nameAr is required');
  }

  if (email && String(email).trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    throw new ValidationError('Invalid email address');
  }

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        organizationId,
        nameAr: String(nameAr).trim(),
        nameEn: nameEn ? String(nameEn).trim() : null,
        clientType:
          clientType && Object.values(ClientType).includes(clientType)
            ? clientType
            : ClientType.COMPANY,
        phone: phone ? String(phone).trim() : null,
        email: email ? String(email).trim() : null,
        address: address ? String(address).trim() : null,
        vatNumber: vatNumber ? String(vatNumber).trim() : null,
        notes: notes ? String(notes).trim() : null,
        status:
          status && Object.values(ClientStatus).includes(status) ? status : ClientStatus.ACTIVE,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'CREATE',
        entityType: 'Client',
        entityId: created.id,
        description: `Created client: ${created.nameAr}`,
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return created;
  });

  res.status(201).json({ success: true, data: { ...client, canDelete: true } });
});

// ─── Update Client ──────────────────────────────────────────────

/**
 * PUT /api/clients/:id
 */
router.put('/:id', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('Client');
  assertSameOrg(organizationId, existing.organizationId, 'Client');

  const {
    id: _id,
    organizationId: _oid,
    createdAt: _ca,
    updatedAt: _ua,
    sites: _sites,
    workEntries: _we,
    statements: _stm,
    invoices: _inv,
    payments: _pay,
    _count,
    stats: _stats,
    canDelete: _cd,
    ...rawUpdateData
  } = req.body;

  if (rawUpdateData.nameAr !== undefined && !String(rawUpdateData.nameAr).trim()) {
    throw new ValidationError('nameAr cannot be empty');
  }

  if (
    rawUpdateData.email !== undefined &&
    rawUpdateData.email !== null &&
    String(rawUpdateData.email).trim() !== '' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(rawUpdateData.email).trim())
  ) {
    throw new ValidationError('Invalid email address');
  }

  const updateData: Prisma.ClientUpdateInput = {};
  if (rawUpdateData.nameAr !== undefined) updateData.nameAr = String(rawUpdateData.nameAr).trim();
  if (rawUpdateData.nameEn !== undefined) {
    updateData.nameEn = rawUpdateData.nameEn ? String(rawUpdateData.nameEn).trim() : null;
  }
  if (rawUpdateData.clientType && Object.values(ClientType).includes(rawUpdateData.clientType)) {
    updateData.clientType = rawUpdateData.clientType;
  }
  if (rawUpdateData.phone !== undefined) {
    updateData.phone = rawUpdateData.phone ? String(rawUpdateData.phone).trim() : null;
  }
  if (rawUpdateData.email !== undefined) {
    updateData.email = rawUpdateData.email ? String(rawUpdateData.email).trim() : null;
  }
  if (rawUpdateData.address !== undefined) {
    updateData.address = rawUpdateData.address ? String(rawUpdateData.address).trim() : null;
  }
  if (rawUpdateData.vatNumber !== undefined) {
    updateData.vatNumber = rawUpdateData.vatNumber ? String(rawUpdateData.vatNumber).trim() : null;
  }
  if (rawUpdateData.notes !== undefined) {
    updateData.notes = rawUpdateData.notes ? String(rawUpdateData.notes).trim() : null;
  }
  if (rawUpdateData.status && Object.values(ClientStatus).includes(rawUpdateData.status)) {
    updateData.status = rawUpdateData.status;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const client = await tx.client.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'UPDATE',
        entityType: 'Client',
        entityId: client.id,
        description: `Updated client: ${client.nameAr}`,
        metadata: { updatedFields: Object.keys(updateData) },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return client;
  });

  res.json({ success: true, data: updated });
});

// ─── Archive Client ─────────────────────────────────────────────

/**
 * POST /api/clients/:id/archive
 * Archives a client (status = INACTIVE) while preserving all historical data.
 */
router.post('/:id/archive', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('Client');
  assertSameOrg(organizationId, existing.organizationId, 'Client');

  const archived = await prisma.$transaction(async (tx) => {
    const client = await tx.client.update({
      where: { id: existing.id },
      data: { status: ClientStatus.INACTIVE },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'UPDATE',
        entityType: 'Client',
        entityId: existing.id,
        description: `Archived client: ${existing.nameAr}`,
        metadata: { operation: 'ARCHIVE', previousStatus: existing.status, newStatus: ClientStatus.INACTIVE },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return client;
  });

  res.json({ success: true, data: archived, message: 'Client archived successfully' });
});

// ─── Restore Archived Client ────────────────────────────────────

/**
 * POST /api/clients/:id/restore
 * Restores an archived client back to ACTIVE status.
 */
router.post('/:id/restore', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('Client');
  assertSameOrg(organizationId, existing.organizationId, 'Client');

  const restored = await prisma.$transaction(async (tx) => {
    const client = await tx.client.update({
      where: { id: existing.id },
      data: { status: ClientStatus.ACTIVE },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'UPDATE',
        entityType: 'Client',
        entityId: existing.id,
        description: `Restored client: ${existing.nameAr}`,
        metadata: { operation: 'RESTORE', previousStatus: existing.status, newStatus: ClientStatus.ACTIVE },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return client;
  });

  res.json({ success: true, data: restored, message: 'Client restored successfully' });
});

// ─── Safe Delete & Permanent Delete Helper ──────────────────────

async function handleClientDeletion(
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

  const existing = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: {
          sites: true,
          workEntries: true,
          statements: true,
          invoices: true,
          payments: true,
        },
      },
    },
  });

  if (!existing) throw new NotFoundError('Client');
  assertSameOrg(organizationId, existing.organizationId, 'Client');

  // Legacy default DELETE /api/clients/:id without mode/permanent query param archives the client
  if (!isHardDelete) {
    await prisma.$transaction([
      prisma.client.update({
        where: { id: existing.id },
        data: { status: ClientStatus.INACTIVE },
      }),
      prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'Client',
          entityId: existing.id,
          description: `Archived client: ${existing.nameAr}`,
          metadata: { operation: 'ARCHIVE' },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      }),
    ]);

    return res.json({ success: true, message: 'Client archived (deactivated) successfully' });
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
  if (!computeClientCanDelete(counts)) {
    const reasons: string[] = [];
    if (counts.sites > 0) reasons.push(`${counts.sites} site(s)`);
    if (counts.workEntries > 0) reasons.push(`${counts.workEntries} work entry(ies)`);
    if (counts.statements > 0) reasons.push(`${counts.statements} statement(s)`);
    if (counts.invoices > 0) reasons.push(`${counts.invoices} invoice(s)`);
    if (counts.payments > 0) reasons.push(`${counts.payments} payment(s)`);

    throw new BusinessRuleError(
      `Cannot delete client "${existing.nameAr}" because it has linked operational or financial records (${reasons.join(', ')}). Please archive the client instead to preserve historical data.`
    );
  }

  await prisma.$transaction([
    prisma.client.delete({
      where: { id: existing.id },
    }),
    prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'DELETE',
        entityType: 'Client',
        entityId: existing.id,
        description: `Permanently deleted client: ${existing.nameAr}`,
        metadata: {
          operation: isPermanentEndpoint || mode === 'permanent' ? 'PERMANENT_DELETE' : 'SAFE_DELETE',
          deletedRecord: {
            nameAr: existing.nameAr,
            nameEn: existing.nameEn,
            clientType: existing.clientType,
          },
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    }),
  ]);

  return res.json({
    success: true,
    message: 'Client deleted permanently',
  });
}

/**
 * DELETE /api/clients/:id/permanent
 * Explicitly permanently deletes a client when it has zero dependent records.
 */
router.delete(
  '/:id/permanent',
  requirePermission(PERMISSIONS.CREATE_WORK),
  async (req, res: Response) => {
    await handleClientDeletion(req as AuthenticatedRequest, res, true);
  }
);

/**
 * DELETE /api/clients/:id
 * Supports soft-delete (default) or safe hard delete (?mode=delete or ?permanent=true).
 */
router.delete('/:id', requirePermission(PERMISSIONS.CREATE_WORK), async (req, res: Response) => {
  await handleClientDeletion(req as AuthenticatedRequest, res, false);
});

export default router;
