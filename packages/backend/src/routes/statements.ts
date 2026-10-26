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
} from '../middleware/errorHandler';
import { StatementStatus, WorkEntryStatus, ClientStatus, InvoiceStatus, ZatcaStatus, Prisma } from '@prisma/client';
import { getNextSequenceNumber } from '../utils/sequences';
import { calculateVat, roundDecimal } from '../utils/finance';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── List Statements ────────────────────────────────────────────

/**
 * GET /api/statements
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.StatementWhereInput = { organizationId };
  if (req.query.clientId) where.clientId = req.query.clientId as string;
  if (req.query.siteId) {
    where.sites = { some: { siteId: req.query.siteId as string } };
  }
  if (req.query.status) {
    const s = req.query.status as string;
    if (Object.values(StatementStatus).includes(s as StatementStatus)) {
      where.status = s as StatementStatus;
    }
  }
  const search = (req.query.search as string)?.trim();
  if (search) {
    where.OR = [
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, statements] = await Promise.all([
    prisma.statement.count({ where }),
    prisma.statement.findMany({
      where,
      skip,
      take: limit,
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
        sites: { include: { site: { select: { id: true, nameAr: true, nameEn: true } } } },
        createdBy: { select: { id: true, nameAr: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json({
    success: true,
    data: {
      items: statements,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── Get Single Statement ───────────────────────────────────────

/**
 * GET /api/statements/:id
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const statement = await prisma.statement.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      sites: { include: { site: true } },
      lines: {
        include: {
          workEntry: {
            select: {
              id: true,
              referenceNo: true,
              workDate: true,
              quantity: true,
              billedQuantity: true,
              status: true,
              site: { select: { id: true, nameAr: true, nameEn: true } },
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      invoices: {
        select: {
          id: true,
          referenceNo: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          issueDate: true,
        },
      },
      createdBy: { select: { id: true, nameAr: true, email: true } },
      approvedBy: { select: { id: true, nameAr: true, email: true } },
    },
  });

  if (!statement) throw new NotFoundError('Statement');
  assertSameOrg(organizationId, statement.organizationId, 'Statement');

  res.json({ success: true, data: statement });
});

// ─── Create Statement ───────────────────────────────────────────

/**
 * POST /api/statements
 * Business rules:
 *   - Only APPROVED or PARTIALLY_BILLED work entries can be included
 *   - Cannot include FULLY_BILLED entries
 *   - approvedQuantity <= remaining (quantity - billedQuantity)
 *   - Snapshots org settings and work entry details at creation time
 */
router.post('/', requirePermission(PERMISSIONS.CREATE_STATEMENTS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: createdById } = authReq.user;

  const {
    clientId,
    siteIds,
    workEntryLines,
    lines,
    title,
    issueDate,
    periodStart,
    periodEnd,
    notes,
    discountAmount: discountAmountInput,
    vatRate: customVatRate,
    isTaxExempt,
  } = req.body;

  const inputLines = workEntryLines || lines;

  if (!clientId) throw new ValidationError('clientId is required');
  if (!inputLines || !Array.isArray(inputLines) || inputLines.length === 0) {
    throw new ValidationError('lines[] is required and must be non-empty');
  }
  if (!issueDate) throw new ValidationError('issueDate is required');

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({ where: { id: clientId, organizationId } });
    if (!client) throw new NotFoundError('Client');
    if (client.status === ClientStatus.INACTIVE) {
      throw new BusinessRuleError('Cannot create a statement for an archived/inactive client');
    }

    const orgSettings = await tx.orgSettings.findUnique({ where: { organizationId } });

    let vatRate = new Decimal(orgSettings?.vatRate?.toString() ?? '15');
    if (isTaxExempt === true) {
      vatRate = new Decimal(0);
    } else if (customVatRate !== undefined && customVatRate !== null && customVatRate !== '') {
      const parsedRate = Number(customVatRate);
      if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100) {
        throw new ValidationError('vatRate must be between 0 and 100');
      }
      vatRate = new Decimal(parsedRate.toString());
    }

    // Track cumulative requested quantity per workEntryId within the same payload
    const requestedByEntry = new Map<string, Decimal>();
    const discoveredSiteIds = new Set<string>(Array.isArray(siteIds) ? siteIds : []);

    const processedLines: {
      workEntryId: string;
      approvedQuantity: Decimal;
      unitPrice: Decimal;
      lineTotal: Decimal;
      sortOrder: number;
      itemNameAr: string;
      itemNameEn: string | null;
      unit: string;
      unitEn: string | null;
    }[] = [];

    for (let i = 0; i < inputLines.length; i++) {
      const { workEntryId, approvedQuantity, quantity } = inputLines[i];
      const lineQty = approvedQuantity ?? quantity;
      if (!workEntryId) throw new ValidationError(`Line ${i}: workEntryId is required`);
      if (lineQty === undefined || lineQty === null) {
        throw new ValidationError(`Line ${i}: approvedQuantity is required`);
      }

      const we = await tx.workEntry.findFirst({
        where: { id: workEntryId, organizationId, clientId },
      });

      if (!we) throw new NotFoundError(`WorkEntry (${workEntryId})`);

      if (
        we.status !== WorkEntryStatus.APPROVED &&
        we.status !== WorkEntryStatus.PARTIALLY_BILLED
      ) {
        throw new BusinessRuleError(
          `WorkEntry ${we.referenceNo} has status ${we.status}. Only APPROVED or PARTIALLY_BILLED entries can be included.`
        );
      }

      const aq = new Decimal(lineQty.toString());
      if (aq.lte(0)) throw new ValidationError(`Line ${i}: approvedQuantity must be > 0`);

      const prevRequested = requestedByEntry.get(workEntryId) || new Decimal(0);
      const totalRequestedForEntry = prevRequested.add(aq);
      requestedByEntry.set(workEntryId, totalRequestedForEntry);

      const remaining = we.quantity.sub(we.billedQuantity);
      if (totalRequestedForEntry.gt(remaining)) {
        throw new BusinessRuleError(
          `WorkEntry ${we.referenceNo}: approvedQuantity (${totalRequestedForEntry}) exceeds remaining (${remaining})`
        );
      }

      discoveredSiteIds.add(we.siteId);

      processedLines.push({
        workEntryId,
        approvedQuantity: aq,
        unitPrice: we.unitPrice,
        lineTotal: roundDecimal(aq.mul(we.unitPrice), 4),
        sortOrder: i,
        itemNameAr: we.itemNameAr,
        itemNameEn: we.itemNameEn,
        unit: we.unit,
        unitEn: we.unitEn,
      });
    }

    const subtotal = roundDecimal(
      processedLines.reduce((sum, l) => sum.add(l.lineTotal), new Decimal(0)),
      4
    );
    const discountAmount = roundDecimal(new Decimal(discountAmountInput?.toString() ?? '0'), 4);
    if (discountAmount.lt(0) || discountAmount.gt(subtotal)) {
      throw new ValidationError('discountAmount must be between 0 and subtotal');
    }
    const taxableAmount = roundDecimal(subtotal.sub(discountAmount), 4);
    const vatAmount = calculateVat(taxableAmount, vatRate);
    const totalAmount = roundDecimal(taxableAmount.add(vatAmount), 4);

    const { referenceNo } = await getNextSequenceNumber(tx, organizationId, 'statement');

    const finalSiteIds = Array.from(discoveredSiteIds);

    const statement = await tx.statement.create({
      data: {
        organizationId,
        clientId,
        referenceNo,
        title: title || null,
        issueDate: new Date(issueDate),
        periodStart: periodStart ? new Date(periodStart) : null,
        periodEnd: periodEnd ? new Date(periodEnd) : null,
        orgSnapshot: orgSettings ?? {},
        subtotal,
        discountAmount,
        taxableAmount,
        vatRate,
        vatAmount,
        totalAmount,
        notes: notes || null,
        createdById,
        sites: finalSiteIds.length
          ? { create: finalSiteIds.map((siteId: string) => ({ siteId })) }
          : undefined,
        lines: {
          create: processedLines.map((l) => ({
            workEntryId: l.workEntryId,
            itemNameAr: l.itemNameAr,
            itemNameEn: l.itemNameEn,
            unit: l.unit,
            unitEn: l.unitEn,
            approvedQuantity: l.approvedQuantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            sortOrder: l.sortOrder,
          })),
        },
      },
      include: { lines: true, sites: true, client: true },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId: createdById,
        action: 'CREATE',
        entityType: 'Statement',
        entityId: statement.id,
        description: `Created statement ${statement.referenceNo} with total ${statement.totalAmount}`,
        metadata: {
          referenceNo: statement.referenceNo,
          clientId,
          subtotal: statement.subtotal.toString(),
          vatAmount: statement.vatAmount.toString(),
          totalAmount: statement.totalAmount.toString(),
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return statement;
  });

  res.status(201).json({ success: true, data: result });
});

// ─── Update Statement ───────────────────────────────────────────

/**
 * PUT /api/statements/:id
 * Only DRAFT statements.
 */
router.put('/:id', requirePermission(PERMISSIONS.CREATE_STATEMENTS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.statement.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('Statement');
  assertSameOrg(organizationId, existing.organizationId, 'Statement');

  if (existing.status !== StatementStatus.DRAFT) {
    throw new BusinessRuleError(
      `Can only edit DRAFT statements, current status: ${existing.status}`
    );
  }

  const { title, notes, issueDate, periodStart, periodEnd, discountAmount } = req.body;

  let recalculatedFields: Record<string, any> = {};
  if (discountAmount !== undefined && discountAmount !== null && discountAmount !== '') {
    const newDiscount = roundDecimal(new Decimal(discountAmount.toString()), 4);
    if (newDiscount.lt(0) || newDiscount.gt(existing.subtotal)) {
      throw new ValidationError('discountAmount must be between 0 and subtotal');
    }
    const taxableAmount = roundDecimal(existing.subtotal.sub(newDiscount), 4);
    const vatAmount = calculateVat(taxableAmount, existing.vatRate);
    const totalAmount = roundDecimal(taxableAmount.add(vatAmount), 4);
    recalculatedFields = {
      discountAmount: newDiscount,
      taxableAmount,
      vatAmount,
      totalAmount,
    };
  }

  const updated = await prisma.statement.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(notes !== undefined && { notes }),
      ...(issueDate !== undefined && { issueDate: new Date(issueDate) }),
      ...(periodStart !== undefined && { periodStart: periodStart ? new Date(periodStart) : null }),
      ...(periodEnd !== undefined && { periodEnd: periodEnd ? new Date(periodEnd) : null }),
      ...recalculatedFields,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      userId,
      action: 'UPDATE',
      entityType: 'Statement',
      entityId: updated.id,
      description: `Updated statement ${updated.referenceNo}`,
      ipAddress: req.ip || req.socket.remoteAddress,
    },
  });

  res.json({ success: true, data: updated });
});

// ─── Approve Statement ──────────────────────────────────────────

/**
 * POST /api/statements/:id/approve
 */
router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.CREATE_STATEMENTS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: approverId } = authReq.user;

    const statement = await prisma.statement.findUnique({ where: { id: req.params.id } });
    if (!statement) throw new NotFoundError('Statement');
    assertSameOrg(organizationId, statement.organizationId, 'Statement');

    if (statement.status !== StatementStatus.DRAFT) {
      throw new BusinessRuleError(
        `Can only approve DRAFT statements, current status: ${statement.status}`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const orgSettings = await tx.orgSettings.findUnique({ where: { organizationId } });
      const stmt = await tx.statement.update({
        where: { id: req.params.id },
        data: {
          status: StatementStatus.APPROVED,
          approvedById: approverId,
          approvedAt: new Date(),
          orgSnapshot: orgSettings ?? statement.orgSnapshot ?? {},
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: approverId,
          action: 'APPROVE',
          entityType: 'Statement',
          entityId: stmt.id,
          description: `Approved statement ${stmt.referenceNo}`,
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return stmt;
    });

    res.json({ success: true, data: updated });
  }
);

// ─── Cancel Statement ───────────────────────────────────────────

/**
 * POST /api/statements/:id/cancel
 * Cannot cancel INVOICED statements.
 */
router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.CREATE_STATEMENTS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const statement = await prisma.statement.findUnique({ where: { id: req.params.id } });
    if (!statement) throw new NotFoundError('Statement');
    assertSameOrg(organizationId, statement.organizationId, 'Statement');

    if (statement.status === StatementStatus.INVOICED) {
      throw new BusinessRuleError('Cannot cancel a statement that has been invoiced');
    }

    if (statement.status === StatementStatus.CANCELLED) {
      throw new BusinessRuleError('Statement is already cancelled');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const stmt = await tx.statement.update({
        where: { id: req.params.id },
        data: { status: StatementStatus.CANCELLED },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CANCEL',
          entityType: 'Statement',
          entityId: stmt.id,
          description: `Cancelled statement ${stmt.referenceNo}`,
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return stmt;
    });

    res.json({ success: true, data: updated });
  }
);

// ─── PDF Data ───────────────────────────────────────────────────

/**
 * GET /api/statements/:id/pdf-data
 * Returns all frozen snapshot data needed for A4 PDF rendering.
 */
router.get('/:id/pdf-data', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const statement = await prisma.statement.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      sites: { include: { site: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
      createdBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
      approvedBy: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });

  if (!statement) throw new NotFoundError('Statement');
  assertSameOrg(organizationId, statement.organizationId, 'Statement');

  res.json({ success: true, data: statement });
});

// ─── Delete Statement (Draft Only / Permanent) ──────────────────

/**
 * DELETE /api/statements/:id
 * Permanently delete a DRAFT statement with 0 linked invoices.
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.CREATE_STATEMENTS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;
    const { id } = req.params;

    const statement = await prisma.statement.findUnique({
      where: { id },
      include: {
        invoices: {
          include: {
            payments: true,
            lines: true,
          },
        },
        lines: true,
      },
    });

    if (!statement) throw new NotFoundError('Statement');
    assertSameOrg(organizationId, statement.organizationId, 'Statement');

    const linkedInvoices = statement.invoices || [];

    // Case C: Check for Active / Issued invoices first so the user gets guided to resolve them
    if (linkedInvoices.length > 0) {
      const activeInvoices = linkedInvoices.filter(
        (inv) => inv.status !== InvoiceStatus.CANCELLED
      );
      if (activeInvoices.length > 0) {
        const activeRefs = activeInvoices.map((inv) => inv.referenceNo).join(', ');
        throw new BusinessRuleError(
          `Cannot delete statement because it is linked to active or issued invoice(s) (${activeRefs}). Please cancel or resolve these invoices first.`
        );
      }
    }

    const canDelete =
      statement.status === StatementStatus.DRAFT ||
      statement.status === StatementStatus.CANCELLED;

    if (!canDelete) {
      throw new BusinessRuleError(
        `Cannot delete statement with status ${statement.status}. Only DRAFT or CANCELLED statements can be deleted; approved statements must be cancelled first.`
      );
    }

    if (linkedInvoices.length > 0) {
      // Case D: Check for Protected Financial Dependencies on Cancelled Invoices
      // 1. Recorded payments
      const invoicesWithPayments = linkedInvoices.filter(
        (inv) => (inv.payments && inv.payments.length > 0) || inv.paidAmount.gt(0)
      );
      if (invoicesWithPayments.length > 0) {
        const refs = invoicesWithPayments.map((inv) => inv.referenceNo).join(', ');
        throw new BusinessRuleError(
          `Cannot delete statement because linked invoice(s) (${refs}) have recorded payment history. Financial payment records must be preserved.`
        );
      }

      // 2. Officially reported to or cleared by ZATCA
      const reportedInvoices = linkedInvoices.filter(
        (inv) =>
          inv.zatcaStatus === ZatcaStatus.REPORTED ||
          inv.zatcaStatus === ZatcaStatus.CLEARED
      );
      if (reportedInvoices.length > 0) {
        const refs = reportedInvoices.map((inv) => inv.referenceNo).join(', ');
        throw new BusinessRuleError(
          `Cannot delete statement because linked invoice(s) (${refs}) have been officially reported to or cleared by ZATCA. Official tax records must be retained for compliance audit trails.`
        );
      }

      // 3. Linked Credit / Debit Notes
      const linkedInvoiceIds = linkedInvoices.map((inv) => inv.id);
      const linkedNotes = await prisma.invoice.findMany({
        where: {
          cancelledById: { in: linkedInvoiceIds },
          organizationId,
        },
        select: { id: true, referenceNo: true },
      });
      if (linkedNotes.length > 0) {
        const refs = linkedNotes.map((n) => n.referenceNo).join(', ');
        throw new BusinessRuleError(
          `Cannot delete statement because linked invoice(s) have associated credit or debit notes (${refs}).`
        );
      }

      // 4. Check if any linked invoice is also linked to other active statements
      for (const inv of linkedInvoices) {
        const respJson = (inv.zatcaResponse as Record<string, any>) || {};
        const otherStmtIds: string[] = (
          Array.isArray(respJson.statementIds) ? respJson.statementIds : []
        ).filter((sId: string) => sId !== id);

        if (otherStmtIds.length > 0) {
          const otherStatements = await prisma.statement.findMany({
            where: { id: { in: otherStmtIds }, organizationId },
            select: { id: true, referenceNo: true, status: true },
          });
          const activeOtherStmts = otherStatements.filter(
            (s) => s.status !== StatementStatus.CANCELLED
          );
          if (activeOtherStmts.length > 0) {
            const otherRefs = activeOtherStmts.map((s) => s.referenceNo).join(', ');
            throw new BusinessRuleError(
              `Cannot delete statement because linked invoice ${inv.referenceNo} is also linked to other active statement(s) (${otherRefs}).`
            );
          }
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      // Case B: If linked invoices are all cancelled and eligible, cascade delete them safely
      if (linkedInvoices.length > 0) {
        for (const inv of linkedInvoices) {
          // Delete invoice lines
          await tx.invoiceLine.deleteMany({ where: { invoiceId: inv.id } });

          // Delete the invoice
          await tx.invoice.delete({ where: { id: inv.id } });

          // Record audit log for invoice cascade deletion
          await tx.auditLog.create({
            data: {
              organizationId,
              userId,
              action: 'DELETE',
              entityType: 'Invoice',
              entityId: inv.id,
              description: `Cascade deleted cancelled invoice ${inv.referenceNo} during deletion of cancelled statement ${statement.referenceNo}`,
              metadata: {
                referenceNo: inv.referenceNo,
                previousStatus: inv.status,
                parentStatementRef: statement.referenceNo,
                operation: 'CASCADE_DELETE_WITH_STATEMENT',
              },
              ipAddress: req.ip || req.socket.remoteAddress,
            },
          });
        }
      }

      // Delete statement sites relations
      await tx.statementSite.deleteMany({ where: { statementId: id } });

      // Delete statement lines
      await tx.statementLine.deleteMany({ where: { statementId: id } });

      // Delete the statement
      await tx.statement.delete({ where: { id } });

      // Record audit log
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'Statement',
          entityId: id,
          description: `Permanently deleted ${statement.status.toLowerCase()} statement ${statement.referenceNo}` +
            (linkedInvoices.length > 0 ? ` and its ${linkedInvoices.length} eligible cancelled invoice(s)` : ''),
          metadata: {
            referenceNo: statement.referenceNo,
            totalAmount: statement.totalAmount.toString(),
            status: statement.status,
            deletedLinkedInvoiceCount: linkedInvoices.length,
            operation: 'PERMANENT_DELETE',
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
    });

    res.json({
      success: true,
      message:
        statement.status === StatementStatus.CANCELLED
          ? 'Cancelled statement deleted permanently'
          : 'Draft statement deleted permanently',
      data: { id, referenceNo: statement.referenceNo },
    });
  }
);

export default router;
