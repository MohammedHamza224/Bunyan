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
import {
  InvoiceStatus,
  PaymentStatus,
  WorkEntryStatus,
  StatementStatus,
  InvoiceType,
  ZatcaStatus,
  ClientStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { getNextSequenceNumber } from '../utils/sequences';
import { calculateVat, roundDecimal } from '../utils/finance';
import {
  ZATCA_GENESIS_PIH,
  validateZatcaMandatoryFields,
  buildZatcaInvoiceBundle,
  decodeZatcaQrTlvBase64,
  generateZatcaQrSvg,
  generateZatcaQrDataUrl,
  generateZatcaQrTlvBase64,
} from '../utils/zatca';
import { zatcaService } from '../services/zatcaService';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Update workEntry billing status after billed quantity changes.
 */
async function syncWorkEntryBillingStatus(
  tx: Prisma.TransactionClient,
  workEntryId: string
): Promise<void> {
  const we = await tx.workEntry.findUnique({ where: { id: workEntryId } });
  if (!we) return;

  let newStatus: WorkEntryStatus = we.status;
  if (we.billedQuantity.lte(0)) {
    newStatus = WorkEntryStatus.APPROVED;
  } else if (we.billedQuantity.gte(we.quantity)) {
    newStatus = WorkEntryStatus.FULLY_BILLED;
  } else {
    newStatus = WorkEntryStatus.PARTIALLY_BILLED;
  }

  if (newStatus !== we.status) {
    await tx.workEntry.update({ where: { id: workEntryId }, data: { status: newStatus } });
  }
}

/**
 * Allocate the next monotonic ZATCA Invoice Counter Value (ICV) and fetch the
 * Previous Invoice Hash (PIH) from the organization's last approved invoice/note.
 * Uses row-level lock on document_sequences to guarantee strict sequential ordering.
 */
async function allocateZatcaIcvAndPih(
  tx: Prisma.TransactionClient,
  organizationId: string,
  excludeInvoiceId?: string
): Promise<{ icv: number; pih: string }> {
  // Ensure sequence row exists then lock it
  await tx.documentSequence.upsert({
    where: { organizationId_docType: { organizationId, docType: 'zatca_icv' } },
    update: {},
    create: {
      organizationId,
      docType: 'zatca_icv',
      prefix: 'ICV',
      lastNumber: 0,
      yearReset: false,
      currentYear: new Date().getFullYear(),
    },
  });

  await tx.$queryRaw`SELECT id FROM document_sequences WHERE "organizationId" = ${organizationId} AND "docType" = 'zatca_icv' FOR UPDATE`;

  // Find the most recently approved invoice/note that has an ICV & xmlHash
  const recentApproved = await tx.invoice.findMany({
    where: {
      organizationId,
      status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.CANCELLED] },
      zatcaXml: { not: null },
      ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
    },
    select: { id: true, zatcaResponse: true },
  });

  let maxIcv = 0;
  let lastXmlHash = ZATCA_GENESIS_PIH;

  for (const inv of recentApproved) {
    const resp = (inv.zatcaResponse as Record<string, any>) || {};
    if (typeof resp.icv === 'number' && resp.icv > maxIcv && resp.xmlHash) {
      maxIcv = resp.icv;
      lastXmlHash = resp.xmlHash;
    }
  }

  const nextIcv = maxIcv + 1;

  await tx.documentSequence.update({
    where: { organizationId_docType: { organizationId, docType: 'zatca_icv' } },
    data: { lastNumber: nextIcv },
  });

  return {
    icv: nextIcv,
    pih: maxIcv === 0 ? ZATCA_GENESIS_PIH : lastXmlHash,
  };
}

// ─── List Invoices ──────────────────────────────────────────────

/**
 * GET /api/invoices
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.InvoiceWhereInput = { organizationId };
  if (req.query.clientId) where.clientId = req.query.clientId as string;
  if (req.query.statementId) where.statementId = req.query.statementId as string;
  if (req.query.status) {
    const s = req.query.status as string;
    if (Object.values(InvoiceStatus).includes(s as InvoiceStatus)) {
      where.status = s as InvoiceStatus;
    }
  }
  if (req.query.paymentStatus) {
    const ps = req.query.paymentStatus as string;
    if (Object.values(PaymentStatus).includes(ps as PaymentStatus)) {
      where.paymentStatus = ps as PaymentStatus;
    }
  }
  if (req.query.invoiceType) {
    const rawType = req.query.invoiceType as string;
    const it =
      rawType === 'SIMPLIFIED_INVOICE' ? InvoiceType.SIMPLIFIED_TAX_INVOICE : rawType;
    if (Object.values(InvoiceType).includes(it as InvoiceType)) {
      where.invoiceType = it as InvoiceType;
    }
  }
  const search = (req.query.search as string)?.trim();
  if (search) {
    where.OR = [
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true, vatNumber: true } },
        statement: { select: { id: true, referenceNo: true } },
        createdBy: { select: { id: true, nameAr: true } },
        _count: { select: { lines: true, payments: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json({
    success: true,
    data: {
      items: invoices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── Overdue Invoices ───────────────────────────────────────────

/**
 * GET /api/invoices/overdue
 */
router.get('/overdue', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      dueDate: { lt: new Date() },
      paymentStatus: { not: PaymentStatus.PAID },
      status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
    },
    include: {
      client: { select: { id: true, nameAr: true, nameEn: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  res.json({ success: true, data: invoices });
});

// ─── Get Single Invoice ─────────────────────────────────────────

/**
 * GET /api/invoices/:id
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      statement: { select: { id: true, referenceNo: true } },
      lines: {
        include: {
          workEntry: { select: { id: true, referenceNo: true, workDate: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      payments: {
        include: {
          bankAccount: true,
          recordedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
        },
        orderBy: { paymentDate: 'asc' },
      },
      createdBy: { select: { id: true, nameAr: true, email: true } },
    },
  });

  if (!invoice) throw new NotFoundError('Invoice');
  assertSameOrg(organizationId, invoice.organizationId, 'Invoice');

  // Fetch the organization's default company receiving bank account
  const defaultBankAccount =
    (await prisma.orgBankAccount.findFirst({
      where: { organizationId: invoice.organizationId, isDefault: true, isActive: true },
    })) ||
    (await prisma.orgBankAccount.findFirst({
      where: { organizationId: invoice.organizationId, isActive: true },
    }));

  // Also fetch any Credit or Debit notes linked to this invoice (stored via cancelledById)
  const relatedNotes = await prisma.invoice.findMany({
    where: {
      organizationId,
      cancelledById: invoice.id,
      invoiceType: { in: [InvoiceType.CREDIT_NOTE, InvoiceType.DEBIT_NOTE] },
    },
    select: {
      id: true,
      referenceNo: true,
      invoiceType: true,
      issueDate: true,
      totalAmount: true,
      status: true,
      cancellationReason: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    success: true,
    data: {
      ...invoice,
      defaultBankAccount,
      relatedNotes,
    },
  });
});

// ─── Create Invoice from Statement(s) ───────────────────────────

/**
 * POST /api/invoices/from-statement
 * Creates invoice from one (statementId) or multiple (statementIds[]) APPROVED statements.
 */
router.post(
  '/from-statement',
  requirePermission(PERMISSIONS.ISSUE_INVOICES),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: createdById } = authReq.user;

    const {
      statementId,
      statementIds,
      invoiceType,
      issueDate,
      dueDate,
      supplyDate,
      notes,
      vatRate: customVatRate,
      isTaxExempt,
    } = req.body;

    const targetStatementIds: string[] = Array.isArray(statementIds)
      ? statementIds
      : statementId
      ? [statementId]
      : [];

    if (targetStatementIds.length === 0) {
      throw new ValidationError('statementId or statementIds[] is required');
    }
    if (!issueDate) throw new ValidationError('issueDate is required');

    const invoice = await prisma.$transaction(async (tx) => {
      const sortedStmtIds = [...new Set(targetStatementIds)].sort();
      for (const sId of sortedStmtIds) {
        await tx.$queryRaw`SELECT id FROM statements WHERE id = ${sId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      }

      const statements = await tx.statement.findMany({
        where: { id: { in: sortedStmtIds }, organizationId },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
          client: true,
        },
      });

      if (statements.length !== sortedStmtIds.length) {
        throw new NotFoundError('Statement');
      }

      const firstClient = statements[0].client;
      if (firstClient.status === ClientStatus.INACTIVE) {
        throw new BusinessRuleError('Cannot create an invoice for an archived/inactive client');
      }
      for (const st of statements) {
        if (st.clientId !== firstClient.id) {
          throw new BusinessRuleError('All grouped statements must belong to the same client');
        }
        if (st.status !== StatementStatus.APPROVED) {
          throw new BusinessRuleError(
            `Statement ${st.referenceNo} must be APPROVED, current status: ${st.status}`
          );
        }
      }

      const orgSettings = await tx.orgSettings.findUnique({ where: { organizationId } });
      const clientSnapshot = {
        id: firstClient.id,
        nameAr: firstClient.nameAr,
        nameEn: firstClient.nameEn,
        clientType: firstClient.clientType,
        vatNumber: firstClient.vatNumber,
        address: firstClient.address,
        phone: firstClient.phone,
        email: firstClient.email,
      };

      let vatRate = statements[0].vatRate;
      if (isTaxExempt === true) {
        vatRate = new Decimal(0);
      } else if (customVatRate !== undefined && customVatRate !== null && customVatRate !== '') {
        vatRate = new Decimal(Number(customVatRate).toString());
      }

      const allStmtLines = statements.flatMap((st) => st.lines);

      const uniqueWorkEntryIds = [...new Set(allStmtLines.map((l) => l.workEntryId))].sort();
      for (const weId of uniqueWorkEntryIds) {
        await tx.$queryRaw`SELECT id FROM work_entries WHERE id = ${weId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      }

      for (const line of allStmtLines) {
        const we = await tx.workEntry.findFirst({
          where: { id: line.workEntryId, organizationId },
        });
        if (!we) throw new NotFoundError(`WorkEntry (${line.workEntryId})`);

        const remaining = we.quantity.sub(we.billedQuantity);
        if (line.approvedQuantity.gt(remaining)) {
          throw new BusinessRuleError(
            `WorkEntry ${we.referenceNo}: statement quantity (${line.approvedQuantity}) exceeds remaining unbilled quantity (${remaining})`
          );
        }

        await tx.workEntry.update({
          where: { id: line.workEntryId },
          data: { billedQuantity: { increment: line.approvedQuantity } },
        });
        await syncWorkEntryBillingStatus(tx, line.workEntryId);
      }

      const subtotal = roundDecimal(
        statements.reduce((s, st) => s.add(st.subtotal), new Decimal(0)),
        4
      );
      const discountAmount = roundDecimal(
        statements.reduce((s, st) => s.add(st.discountAmount), new Decimal(0)),
        4
      );
      const taxableAmount = roundDecimal(subtotal.sub(discountAmount), 4);
      const vatAmount = calculateVat(taxableAmount, vatRate);
      const totalAmount = roundDecimal(taxableAmount.add(vatAmount), 4);

      const { referenceNo } = await getNextSequenceNumber(tx, organizationId, 'invoice');

      const normalizedType =
        invoiceType === 'SIMPLIFIED_INVOICE' ? InvoiceType.SIMPLIFIED_TAX_INVOICE : invoiceType;

      const resolvedInvoiceType: InvoiceType =
        (normalizedType as InvoiceType) ||
        (firstClient.clientType === 'INDIVIDUAL' && !firstClient.vatNumber
          ? InvoiceType.SIMPLIFIED_TAX_INVOICE
          : InvoiceType.TAX_INVOICE);

      const issueDateObj = new Date(issueDate);
      let initialZatcaQrCode: string | null = null;
      if (orgSettings?.businessName && orgSettings?.vatNumber) {
        try {
          initialZatcaQrCode = generateZatcaQrTlvBase64({
            sellerName: orgSettings.businessName,
            vatNumber: orgSettings.vatNumber,
            timestampIso: issueDateObj.toISOString(),
            totalWithVat: totalAmount.toString(),
            vatTotal: vatAmount.toString(),
          });
        } catch {
          // Non-blocking for draft creation
        }
      }

      const createdLinesData = allStmtLines.map((line, idx) => {
        const lineVat = calculateVat(line.lineTotal, vatRate);
        const lineTot = roundDecimal(line.lineTotal.add(lineVat), 4);
        return {
          workEntryId: line.workEntryId,
          itemNameAr: line.itemNameAr,
          itemNameEn: line.itemNameEn,
          unit: line.unit,
          unitEn: line.unitEn,
          quantity: line.approvedQuantity,
          unitPrice: line.unitPrice,
          lineSubtotal: line.lineTotal,
          vatRate,
          vatAmount: lineVat,
          lineTotal: lineTot,
          sortOrder: idx,
        };
      });

      const inv = await tx.invoice.create({
        data: {
          organizationId,
          clientId: firstClient.id,
          statementId: sortedStmtIds[0],
          referenceNo,
          invoiceType: resolvedInvoiceType,
          issueDate: issueDateObj,
          dueDate: dueDate ? new Date(dueDate) : null,
          supplyDate: supplyDate ? new Date(supplyDate) : null,
          orgSnapshot: orgSettings ?? {},
          clientSnapshot,
          subtotal,
          discountAmount,
          taxableAmount,
          vatRate,
          vatAmount,
          totalAmount,
          remainingAmount: totalAmount,
          paidAmount: new Decimal(0),
          notes: notes || null,
          zatcaQrCode: initialZatcaQrCode,
          zatcaStatus: ZatcaStatus.NOT_SUBMITTED,
          zatcaResponse: {
            statementIds: sortedStmtIds,
          },
          createdById,
          lines: {
            create: createdLinesData,
          },
        },
        include: { lines: true },
      });

      await tx.statement.updateMany({
        where: { id: { in: sortedStmtIds }, organizationId },
        data: { status: StatementStatus.INVOICED },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: createdById,
          action: 'CREATE',
          entityType: 'Invoice',
          entityId: inv.id,
          description: `Created invoice ${inv.referenceNo} from statement(s) ${statements
            .map((s) => s.referenceNo)
            .join(', ')}`,
          metadata: {
            referenceNo: inv.referenceNo,
            statementIds: sortedStmtIds,
            totalAmount: inv.totalAmount.toString(),
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return inv;
    });

    res.status(201).json({ success: true, data: invoice });
  }
);

// ─── Create Direct Invoice ──────────────────────────────────────

/**
 * POST /api/invoices/direct
 * Create invoice directly from approved work entries (partial or full billing).
 */
router.post(
  '/direct',
  requirePermission(PERMISSIONS.ISSUE_INVOICES),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: createdById } = authReq.user;

    const {
      clientId,
      workEntryLines,
      lines,
      invoiceType,
      issueDate,
      dueDate,
      supplyDate,
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

    const invoice = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({ where: { id: clientId, organizationId } });
      if (!client) throw new NotFoundError('Client');
      if (client.status === ClientStatus.INACTIVE) {
        throw new BusinessRuleError('Cannot create an invoice for an archived/inactive client');
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

      const clientSnapshot = {
        id: client.id,
        nameAr: client.nameAr,
        nameEn: client.nameEn,
        clientType: client.clientType,
        vatNumber: client.vatNumber,
        address: client.address,
        phone: client.phone,
        email: client.email,
      };

      const uniqueWorkEntryIds = [
        ...new Set(inputLines.map((l: any) => l.workEntryId).filter(Boolean)),
      ].sort();
      for (const weId of uniqueWorkEntryIds) {
        await tx.$queryRaw`SELECT id FROM work_entries WHERE id = ${weId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      }

      const processedLines: {
        workEntryId: string;
        billedQty: Decimal;
        unitPrice: Decimal;
        discountPct: Decimal;
        discountAmount: Decimal;
        lineSubtotal: Decimal;
        vatRate: Decimal;
        vatAmount: Decimal;
        lineTotal: Decimal;
        itemNameAr: string;
        itemNameEn: string | null;
        itemDescAr: string | null;
        unit: string;
        unitEn: string | null;
        idx: number;
      }[] = [];

      for (let i = 0; i < inputLines.length; i++) {
        const {
          workEntryId,
          billedQuantity,
          quantity,
          discountPct: lineDiscountPctInput,
          discountAmount: lineDiscountAmtInput,
        } = inputLines[i];
        const lineQty = billedQuantity ?? quantity;
        if (!workEntryId) throw new ValidationError(`Line ${i}: workEntryId is required`);
        if (lineQty === undefined || lineQty === null) {
          throw new ValidationError(`Line ${i}: quantity is required`);
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
            `WorkEntry ${we.referenceNo} has status ${we.status}. Only APPROVED or PARTIALLY_BILLED entries can be invoiced.`
          );
        }

        const remaining = we.quantity.sub(we.billedQuantity);
        const bq = new Decimal(lineQty.toString());

        if (bq.lte(0)) throw new ValidationError(`Line ${i}: billedQuantity must be > 0`);
        if (bq.gt(remaining)) {
          throw new BusinessRuleError(
            `WorkEntry ${we.referenceNo}: billedQuantity (${bq}) exceeds remaining (${remaining})`
          );
        }

        await tx.workEntry.update({
          where: { id: workEntryId },
          data: { billedQuantity: { increment: bq } },
        });
        await syncWorkEntryBillingStatus(tx, workEntryId);

        const grossLine = roundDecimal(bq.mul(we.unitPrice), 4);
        const discountPct = new Decimal(lineDiscountPctInput?.toString() ?? '0');
        const lineDiscountAmount = lineDiscountAmtInput
          ? roundDecimal(new Decimal(lineDiscountAmtInput.toString()), 4)
          : roundDecimal(grossLine.mul(discountPct).div(100), 4);
        const lineSubtotal = roundDecimal(grossLine.sub(lineDiscountAmount), 4);
        const lineVat = calculateVat(lineSubtotal, vatRate);
        const lineTotal = roundDecimal(lineSubtotal.add(lineVat), 4);

        processedLines.push({
          workEntryId,
          billedQty: bq,
          unitPrice: we.unitPrice,
          discountPct,
          discountAmount: lineDiscountAmount,
          lineSubtotal,
          vatRate,
          vatAmount: lineVat,
          lineTotal,
          itemNameAr: we.itemNameAr,
          itemNameEn: we.itemNameEn,
          itemDescAr: we.itemDescAr,
          unit: we.unit,
          unitEn: we.unitEn,
          idx: i,
        });
      }

      const subtotal = roundDecimal(
        processedLines.reduce((s, l) => s.add(l.lineSubtotal), new Decimal(0)),
        4
      );
      const discountAmount = roundDecimal(new Decimal(discountAmountInput?.toString() ?? '0'), 4);
      if (discountAmount.lt(0) || discountAmount.gt(subtotal)) {
        throw new ValidationError('discountAmount must be between 0 and subtotal');
      }
      const taxableAmount = roundDecimal(subtotal.sub(discountAmount), 4);
      const vatAmount = calculateVat(taxableAmount, vatRate);
      const totalAmount = roundDecimal(taxableAmount.add(vatAmount), 4);

      const { referenceNo } = await getNextSequenceNumber(tx, organizationId, 'invoice');

      const normalizedType =
        invoiceType === 'SIMPLIFIED_INVOICE' ? InvoiceType.SIMPLIFIED_TAX_INVOICE : invoiceType;

      const resolvedInvoiceType: InvoiceType =
        (normalizedType as InvoiceType) ||
        (client.clientType === 'INDIVIDUAL' && !client.vatNumber
          ? InvoiceType.SIMPLIFIED_TAX_INVOICE
          : InvoiceType.TAX_INVOICE);

      const issueDateObj = new Date(issueDate);
      let initialZatcaQrCode: string | null = null;
      if (orgSettings?.businessName && orgSettings?.vatNumber) {
        try {
          initialZatcaQrCode = generateZatcaQrTlvBase64({
            sellerName: orgSettings.businessName,
            vatNumber: orgSettings.vatNumber,
            timestampIso: issueDateObj.toISOString(),
            totalWithVat: totalAmount.toString(),
            vatTotal: vatAmount.toString(),
          });
        } catch {
          // Non-blocking for draft creation
        }
      }

      const inv = await tx.invoice.create({
        data: {
          organizationId,
          clientId,
          referenceNo,
          invoiceType: resolvedInvoiceType,
          issueDate: issueDateObj,
          dueDate: dueDate ? new Date(dueDate) : null,
          supplyDate: supplyDate ? new Date(supplyDate) : null,
          orgSnapshot: orgSettings ?? {},
          clientSnapshot,
          subtotal,
          discountAmount,
          taxableAmount,
          vatRate,
          vatAmount,
          totalAmount,
          remainingAmount: totalAmount,
          paidAmount: new Decimal(0),
          notes: notes || null,
          zatcaQrCode: initialZatcaQrCode,
          zatcaStatus: ZatcaStatus.NOT_SUBMITTED,
          createdById,
          lines: {
            create: processedLines.map((l) => ({
              workEntryId: l.workEntryId,
              itemNameAr: l.itemNameAr,
              itemNameEn: l.itemNameEn,
              itemDescAr: l.itemDescAr,
              unit: l.unit,
              unitEn: l.unitEn,
              quantity: l.billedQty,
              unitPrice: l.unitPrice,
              discountPct: l.discountPct,
              discountAmount: l.discountAmount,
              lineSubtotal: l.lineSubtotal,
              vatRate: l.vatRate,
              vatAmount: l.vatAmount,
              lineTotal: l.lineTotal,
              sortOrder: l.idx,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: createdById,
          action: 'CREATE',
          entityType: 'Invoice',
          entityId: inv.id,
          description: `Created direct invoice ${inv.referenceNo} with total ${inv.totalAmount}`,
          metadata: {
            referenceNo: inv.referenceNo,
            clientId,
            totalAmount: inv.totalAmount.toString(),
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return inv;
    });

    res.status(201).json({ success: true, data: invoice });
  }
);

// ─── Update Invoice (Locked if Issued) ──────────────────────────

/**
 * PUT /api/invoices/:id
 * Financial fields of issued (APPROVED/SENT/CANCELLED) invoices are strictly immutable.
 */
router.put('/:id', requirePermission(PERMISSIONS.ISSUE_INVOICES), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError('Invoice');
  assertSameOrg(organizationId, existing.organizationId, 'Invoice');

  if (existing.status !== InvoiceStatus.DRAFT) {
    throw new BusinessRuleError(
      `Issued or cancelled invoices (${existing.status}) are locked and cannot be modified without a legal credit note or debit note.`
    );
  }

  const { dueDate, supplyDate, notes, discountAmount } = req.body;

  let recalculatedFields: Record<string, any> = {};
  if (discountAmount !== undefined && discountAmount !== null && discountAmount !== '') {
    const newDiscount = roundDecimal(new Decimal(discountAmount.toString()), 4);
    if (newDiscount.lt(0) || newDiscount.gt(existing.subtotal)) {
      throw new ValidationError('discountAmount must be between 0 and subtotal');
    }
    const taxableAmount = roundDecimal(existing.subtotal.sub(newDiscount), 4);
    const vatAmount = calculateVat(taxableAmount, existing.vatRate);
    const totalAmount = roundDecimal(taxableAmount.add(vatAmount), 4);
    const remainingAmount = roundDecimal(totalAmount.sub(existing.paidAmount), 4);
    recalculatedFields = {
      discountAmount: newDiscount,
      taxableAmount,
      vatAmount,
      totalAmount,
      remainingAmount,
    };
  }

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(supplyDate !== undefined && { supplyDate: supplyDate ? new Date(supplyDate) : null }),
      ...(notes !== undefined && { notes }),
      ...recalculatedFields,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      userId,
      action: 'UPDATE',
      entityType: 'Invoice',
      entityId: updated.id,
      description: `Updated draft invoice ${updated.referenceNo}`,
      ipAddress: req.ip || req.socket.remoteAddress,
    },
  });

  res.json({ success: true, data: updated });
});

// ─── Approve Invoice (Enforces ZATCA Validation, ICV & PIH) ─────

/**
 * POST /api/invoices/:id/approve
 * Validates mandatory ZATCA seller/buyer fields (rejecting missing or fake data),
 * allocates sequential ICV, chains PIH from previous invoice hash, generates real QR & UBL 2.1 XML,
 * and locks the invoice.
 */
router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.ISSUE_INVOICES),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, client: true },
    });
    if (!invoice) throw new NotFoundError('Invoice');
    assertSameOrg(organizationId, invoice.organizationId, 'Invoice');

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BusinessRuleError(
        `Can only approve DRAFT invoices, current status: ${invoice.status}`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const orgSettings = await tx.orgSettings.findUnique({ where: { organizationId } });

      // Enforce mandatory ZATCA fields according to invoice type — NO fake fallbacks allowed
      const validation = validateZatcaMandatoryFields({
        invoiceType: invoice.invoiceType,
        vatRate: invoice.vatRate.toString(),
        sellerNameAr: orgSettings?.businessName,
        sellerVatNumber: orgSettings?.vatNumber,
        sellerAddress: orgSettings?.address,
        buyerNameAr: invoice.client.nameAr,
        buyerVatNumber: invoice.client.vatNumber,
        buyerAddress: invoice.client.address,
      });

      if (!validation.valid) {
        throw new BusinessRuleError(validation.errors.join(' | '));
      }

      // Allocate next sequential ICV and chain PIH from the last approved invoice
      const { icv, pih } = await allocateZatcaIcvAndPih(tx, organizationId, invoice.id);

      const clientSnapshot = {
        id: invoice.client.id,
        nameAr: invoice.client.nameAr,
        nameEn: invoice.client.nameEn,
        clientType: invoice.client.clientType,
        vatNumber: invoice.client.vatNumber,
        address: invoice.client.address,
        phone: invoice.client.phone,
        email: invoice.client.email,
      };

      const zatcaBundle = await buildZatcaInvoiceBundle(
        {
          id: invoice.id,
          referenceNo: invoice.referenceNo,
          invoiceType: invoice.invoiceType,
          issueDate: invoice.issueDate,
          supplyDate: invoice.supplyDate,
          currency: orgSettings?.defaultCurrency || 'SAR',
          sellerNameAr: orgSettings!.businessName!,
          sellerVatNumber: orgSettings?.vatNumber || '',
          sellerAddress: orgSettings?.address || '',
          sellerCommercialReg: orgSettings?.commercialReg || '',
          buyerNameAr: invoice.client.nameAr,
          buyerVatNumber: invoice.client.vatNumber,
          buyerAddress: invoice.client.address,
          subtotal: invoice.subtotal.toString(),
          discountAmount: invoice.discountAmount.toString(),
          taxableAmount: invoice.taxableAmount.toString(),
          vatRate: invoice.vatRate.toString(),
          vatAmount: invoice.vatAmount.toString(),
          totalAmount: invoice.totalAmount.toString(),
          icv,
          pih,
          lines: invoice.lines.map((l) => ({
            itemNameAr: l.itemNameAr,
            quantity: l.quantity.toString(),
            unitPrice: l.unitPrice.toString(),
            discountAmount: l.discountAmount.toString(),
            lineSubtotal: l.lineSubtotal.toString(),
            vatRate: l.vatRate.toString(),
            vatAmount: l.vatAmount.toString(),
            lineTotal: l.lineTotal.toString(),
          })),
        },
        invoice.zatcaUuid
      );

      const prevResponse = (invoice.zatcaResponse as Record<string, any>) || {};

      // Status is PENDING_SUBMISSION (Locally validated, ICV/PIH chained & ready for transmission to ZATCA)
      const zatcaStatus = ZatcaStatus.PENDING_SUBMISSION;

      const inv = await tx.invoice.update({
        where: { id: req.params.id },
        data: {
          status: InvoiceStatus.APPROVED,
          orgSnapshot: orgSettings ?? {},
          clientSnapshot,
          zatcaStatus,
          zatcaUuid: zatcaBundle.zatcaUuid,
          zatcaQrCode: zatcaBundle.zatcaQrCode,
          zatcaXml: zatcaBundle.zatcaXml,
          zatcaSubmittedAt: new Date(),
          zatcaResponse: {
            ...prevResponse,
            icv: zatcaBundle.icv,
            pih: zatcaBundle.pih,
            xmlHash: zatcaBundle.xmlHash,
            qrCodeSvg: zatcaBundle.qrCodeSvg,
            qrCodeDataUrl: zatcaBundle.qrCodeDataUrl,
            integrationStage: 'LOCAL_GENERATED_READY_FOR_FATOORA',
          },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'APPROVE',
          entityType: 'Invoice',
          entityId: inv.id,
          description: `Approved invoice ${inv.referenceNo} (ICV: ${icv})`,
          metadata: {
            referenceNo: inv.referenceNo,
            zatcaUuid: inv.zatcaUuid,
            icv,
            pih,
            xmlHash: zatcaBundle.xmlHash,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return inv;
    });

    res.json({ success: true, data: updated });
  }
);

// ─── Issue Credit Note / Debit Note (الإشعارات الدائنة والمدينة) ─

/**
 * POST /api/invoices/:id/notes
 * Issues a ZATCA-compliant Credit Note (CREDIT_NOTE, TypeCode 381) or Debit Note (DEBIT_NOTE, TypeCode 383)
 * linked to an original APPROVED/SENT invoice without modifying the original invoice's issued financial figures.
 */
router.post(
  '/:id/notes',
  requirePermission(PERMISSIONS.ISSUE_INVOICES),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const {
      noteType, // 'CREDIT_NOTE' | 'DEBIT_NOTE'
      reason,   // instructionNote (mandatory in ZATCA)
      issueDate,
      lines,    // Array of { itemNameAr, unit, quantity, unitPrice, workEntryId? }
      releaseWorkQuantity, // For CREDIT_NOTE: whether to release billedQuantity on linked workEntries
    } = req.body;

    if (noteType !== InvoiceType.CREDIT_NOTE && noteType !== InvoiceType.DEBIT_NOTE) {
      throw new ValidationError('noteType must be CREDIT_NOTE or DEBIT_NOTE');
    }
    if (!reason?.trim()) {
      throw new ValidationError('reason (InstructionNote) is required for Credit/Debit notes');
    }

    const noteInvoice = await prisma.$transaction(async (tx) => {
      // Lock original invoice
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${req.params.id} AND "organizationId" = ${organizationId} FOR UPDATE`;

      const originalInvoice = await tx.invoice.findFirst({
        where: { id: req.params.id, organizationId },
        include: { lines: { orderBy: { sortOrder: 'asc' } }, client: true },
      });

      if (!originalInvoice) throw new NotFoundError('Original Invoice');

      if (
        originalInvoice.status !== InvoiceStatus.APPROVED &&
        originalInvoice.status !== InvoiceStatus.SENT
      ) {
        throw new BusinessRuleError(
          `Credit or Debit notes can only be issued against an APPROVED or SENT invoice (current status: ${originalInvoice.status})`
        );
      }

      if (
        originalInvoice.invoiceType === InvoiceType.CREDIT_NOTE ||
        originalInvoice.invoiceType === InvoiceType.DEBIT_NOTE
      ) {
        throw new BusinessRuleError('Cannot issue a Credit/Debit note against another note');
      }

      const orgSettings = await tx.orgSettings.findUnique({ where: { organizationId } });
      const vatRate = originalInvoice.vatRate;
      const isSimplifiedSubType =
        originalInvoice.invoiceType === InvoiceType.SIMPLIFIED_TAX_INVOICE;

      // Validate ZATCA mandatory fields including BillingReference and InstructionNote
      const validation = validateZatcaMandatoryFields({
        invoiceType: noteType,
        isSimplifiedSubType,
        vatRate: vatRate.toString(),
        sellerNameAr: orgSettings?.businessName,
        sellerVatNumber: orgSettings?.vatNumber,
        sellerAddress: orgSettings?.address,
        buyerNameAr: originalInvoice.client.nameAr,
        buyerVatNumber: originalInvoice.client.vatNumber,
        buyerAddress: originalInvoice.client.address,
        billingReferenceId: originalInvoice.referenceNo,
        instructionNote: reason.trim(),
      });

      if (!validation.valid) {
        throw new BusinessRuleError(validation.errors.join(' | '));
      }

      const rawLines =
        Array.isArray(lines) && lines.length > 0
          ? lines
          : originalInvoice.lines.map((l) => ({
              workEntryId: l.workEntryId,
              itemNameAr: l.itemNameAr,
              itemNameEn: l.itemNameEn,
              unit: l.unit,
              unitEn: l.unitEn,
              quantity: l.quantity.toString(),
              unitPrice: l.unitPrice.toString(),
            }));

      const processedLines = rawLines.map((l: any, idx: number) => {
        const qty = new Decimal(l.quantity.toString());
        const price = new Decimal(l.unitPrice.toString());
        if (qty.lte(0) || price.lt(0)) {
          throw new ValidationError(`Line ${idx + 1}: invalid quantity or unitPrice`);
        }
        const lineSubtotal = roundDecimal(qty.mul(price), 4);
        const lineVat = calculateVat(lineSubtotal, vatRate);
        const lineTotal = roundDecimal(lineSubtotal.add(lineVat), 4);
        return {
          workEntryId: l.workEntryId || null,
          itemNameAr: String(l.itemNameAr || 'بند تسوية').trim(),
          itemNameEn: l.itemNameEn || null,
          unit: String(l.unit || 'وحدة').trim(),
          unitEn: l.unitEn || null,
          quantity: qty,
          unitPrice: price,
          lineSubtotal,
          vatRate,
          vatAmount: lineVat,
          lineTotal,
          sortOrder: idx,
        };
      });

      const subtotal = roundDecimal(
        processedLines.reduce((s, l) => s.add(l.lineSubtotal), new Decimal(0)),
        4
      );
      const discountAmount = new Decimal(0);
      const taxableAmount = subtotal;
      const vatAmount = calculateVat(taxableAmount, vatRate);
      const totalAmount = roundDecimal(taxableAmount.add(vatAmount), 4);

      if (
        noteType === InvoiceType.CREDIT_NOTE &&
        totalAmount.gt(originalInvoice.remainingAmount)
      ) {
        throw new BusinessRuleError(
          `Credit Note amount (${totalAmount}) cannot exceed original invoice remaining balance (${originalInvoice.remainingAmount})`
        );
      }

      // Generate reference number for the note
      const { referenceNo: seqRef } = await getNextSequenceNumber(tx, organizationId, 'invoice');
      const notePrefix = noteType === InvoiceType.CREDIT_NOTE ? 'CRN' : 'DBN';
      const referenceNo = seqRef.replace(/^INV-/, `${notePrefix}-`);

      // Allocate next sequential ICV and chain PIH
      const { icv, pih } = await allocateZatcaIcvAndPih(tx, organizationId);

      const issueDateObj = issueDate ? new Date(issueDate) : new Date();

      const zatcaBundle = await buildZatcaInvoiceBundle({
        id: referenceNo,
        referenceNo,
        invoiceType: noteType,
        isSimplifiedSubType,
        issueDate: issueDateObj,
        currency: orgSettings?.defaultCurrency || 'SAR',
        sellerNameAr: orgSettings!.businessName!,
        sellerVatNumber: orgSettings?.vatNumber || '',
        sellerAddress: orgSettings?.address || '',
        sellerCommercialReg: orgSettings?.commercialReg || '',
        buyerNameAr: originalInvoice.client.nameAr,
        buyerVatNumber: originalInvoice.client.vatNumber,
        buyerAddress: originalInvoice.client.address,
        subtotal: subtotal.toString(),
        discountAmount: '0',
        taxableAmount: taxableAmount.toString(),
        vatRate: vatRate.toString(),
        vatAmount: vatAmount.toString(),
        totalAmount: totalAmount.toString(),
        icv,
        pih,
        billingReferenceId: originalInvoice.referenceNo,
        billingReferenceUuid: originalInvoice.zatcaUuid,
        instructionNote: reason.trim(),
        lines: processedLines.map((l) => ({
          itemNameAr: l.itemNameAr,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineSubtotal: l.lineSubtotal.toString(),
          vatRate: l.vatRate.toString(),
          vatAmount: l.vatAmount.toString(),
          lineTotal: l.lineTotal.toString(),
        })),
      });

      const createdNote = await tx.invoice.create({
        data: {
          organizationId,
          clientId: originalInvoice.clientId,
          statementId: originalInvoice.statementId,
          referenceNo,
          invoiceType: noteType,
          issueDate: issueDateObj,
          orgSnapshot: orgSettings ?? {},
          clientSnapshot: originalInvoice.clientSnapshot ?? {},
          subtotal,
          discountAmount,
          taxableAmount,
          vatRate,
          vatAmount,
          totalAmount,
          paidAmount: totalAmount,
          remainingAmount: new Decimal(0),
          status: InvoiceStatus.APPROVED,
          paymentStatus: PaymentStatus.PAID,
          cancelledById: originalInvoice.id, // Links this note to the original invoice
          cancellationReason: reason.trim(), // Stores the ZATCA InstructionNote
          notes: `${noteType === InvoiceType.CREDIT_NOTE ? 'إشعار دائن' : 'إشعار مدين'} مرتبط بالفاتورة ${originalInvoice.referenceNo}: ${reason.trim()}`,
          zatcaStatus: ZatcaStatus.PENDING_SUBMISSION,
          zatcaUuid: zatcaBundle.zatcaUuid,
          zatcaQrCode: zatcaBundle.zatcaQrCode,
          zatcaXml: zatcaBundle.zatcaXml,
          zatcaSubmittedAt: new Date(),
          zatcaResponse: {
            icv: zatcaBundle.icv,
            pih: zatcaBundle.pih,
            xmlHash: zatcaBundle.xmlHash,
            qrCodeSvg: zatcaBundle.qrCodeSvg,
            qrCodeDataUrl: zatcaBundle.qrCodeDataUrl,
            billingReferenceId: originalInvoice.referenceNo,
            billingReferenceUuid: originalInvoice.zatcaUuid,
            instructionNote: reason.trim(),
            integrationStage: 'LOCAL_GENERATED_READY_FOR_FATOORA',
          },
          createdById: userId,
          lines: {
            create: processedLines,
          },
        },
        include: { lines: true },
      });

      // Adjust the original invoice's remainingAmount (without altering its historical subtotal/totalAmount!)
      if (noteType === InvoiceType.CREDIT_NOTE) {
        const newRemaining = Decimal.max(
          new Decimal(0),
          roundDecimal(originalInvoice.remainingAmount.sub(totalAmount), 4)
        );
        const newPaymentStatus =
          newRemaining.lte(0)
            ? PaymentStatus.PAID
            : originalInvoice.paidAmount.gt(0)
            ? PaymentStatus.PARTIALLY_PAID
            : PaymentStatus.UNPAID;

        await tx.invoice.update({
          where: { id: originalInvoice.id },
          data: {
            remainingAmount: newRemaining,
            paymentStatus: newPaymentStatus,
          },
        });

        // Optionally release billedQuantity on linked workEntries if requested
        if (releaseWorkQuantity) {
          for (const line of processedLines) {
            if (line.workEntryId) {
              await tx.$queryRaw`SELECT id FROM work_entries WHERE id = ${line.workEntryId} AND "organizationId" = ${organizationId} FOR UPDATE`;
              const we = await tx.workEntry.findUnique({ where: { id: line.workEntryId } });
              if (we) {
                const updatedBilled = Decimal.max(
                  new Decimal(0),
                  we.billedQuantity.sub(line.quantity)
                );
                await tx.workEntry.update({
                  where: { id: line.workEntryId },
                  data: { billedQuantity: updatedBilled },
                });
                await syncWorkEntryBillingStatus(tx, line.workEntryId);
              }
            }
          }
        }
      } else {
        // DEBIT_NOTE increases the remaining balance owed by the client
        const newRemaining = roundDecimal(originalInvoice.remainingAmount.add(totalAmount), 4);
        await tx.invoice.update({
          where: { id: originalInvoice.id },
          data: {
            remainingAmount: newRemaining,
            paymentStatus:
              originalInvoice.paidAmount.gt(0)
                ? PaymentStatus.PARTIALLY_PAID
                : PaymentStatus.UNPAID,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'ISSUE_INVOICE',
          entityType: 'Invoice',
          entityId: createdNote.id,
          description: `Issued ${noteType} ${createdNote.referenceNo} against invoice ${originalInvoice.referenceNo}. Reason: ${reason.trim()}`,
          metadata: {
            noteId: createdNote.id,
            noteReferenceNo: createdNote.referenceNo,
            noteType,
            originalInvoiceId: originalInvoice.id,
            originalInvoiceRef: originalInvoice.referenceNo,
            reason: reason.trim(),
            totalAmount: createdNote.totalAmount.toString(),
            icv: zatcaBundle.icv,
            pih: zatcaBundle.pih,
            xmlHash: zatcaBundle.xmlHash,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return createdNote;
    });

    res.status(201).json({ success: true, data: noteInvoice });
  }
);

// ─── Cancel Invoice ─────────────────────────────────────────────

/**
 * POST /api/invoices/:id/cancel
 * Reverses billedQuantity on linked work entries, reverts statement status if applicable,
 * and logs cancellation reason in AuditLog.
 */
router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.ISSUE_INVOICES),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;
    const { cancellationReason } = req.body;

    if (!cancellationReason?.trim()) {
      throw new ValidationError('cancellationReason is required');
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: req.params.id, organizationId },
        include: { lines: true },
      });

      if (!invoice) throw new NotFoundError('Invoice');

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new BusinessRuleError('Invoice is already cancelled');
      }

      if (invoice.paidAmount.gt(0)) {
        throw new BusinessRuleError(
          'Cannot cancel an invoice that has recorded payments. Reverse payments or issue a Credit Note instead.'
        );
      }

      for (const line of invoice.lines) {
        if (line.workEntryId) {
          await tx.$queryRaw`SELECT id FROM work_entries WHERE id = ${line.workEntryId} AND "organizationId" = ${organizationId} FOR UPDATE`;
          const we = await tx.workEntry.findUnique({ where: { id: line.workEntryId } });
          if (we) {
            const newBilled = Decimal.max(new Decimal(0), we.billedQuantity.sub(line.quantity));
            await tx.workEntry.update({
              where: { id: line.workEntryId },
              data: { billedQuantity: newBilled },
            });
            await syncWorkEntryBillingStatus(tx, line.workEntryId);
          }
        }
      }

      const respJson = (invoice.zatcaResponse as Record<string, any>) || {};
      const linkedStatementIds: string[] = Array.isArray(respJson.statementIds)
        ? respJson.statementIds
        : invoice.statementId
        ? [invoice.statementId]
        : [];

      if (linkedStatementIds.length > 0) {
        await tx.statement.updateMany({
          where: { id: { in: linkedStatementIds }, organizationId },
          data: { status: StatementStatus.APPROVED },
        });
      }

      const updated = await tx.invoice.update({
        where: { id: req.params.id },
        data: {
          status: InvoiceStatus.CANCELLED,
          remainingAmount: new Decimal(0),
          cancellationReason: cancellationReason.trim(),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CANCEL',
          entityType: 'Invoice',
          entityId: updated.id,
          description: `Cancelled invoice ${updated.referenceNo}. Reason: ${cancellationReason.trim()}`,
          metadata: {
            referenceNo: updated.referenceNo,
            cancellationReason: cancellationReason.trim(),
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return updated;
    });

    res.json({ success: true, data: result });
  }
);

// ─── ZATCA Data, Real QR SVG & Chain Verification Endpoint ──────

/**
 * GET /api/invoices/:id/zatca
 * Returns ZATCA QR TLV Base64, real scannable QR SVG & Data URL, decoded TLV tags,
 * UBL 2.1 XML, ICV, PIH, and cryptographic hash chain verification.
 */
router.get('/:id/zatca', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { client: true, lines: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!invoice) throw new NotFoundError('Invoice');
  assertSameOrg(organizationId, invoice.organizationId, 'Invoice');

  let currentQrCode = invoice.zatcaQrCode;

  // If zatcaQrCode is not yet set in database (e.g. Draft invoice or pre-approval preview),
  // dynamically generate a valid ZATCA Phase 1 TLV string using genuine organization data.
  if (!currentQrCode) {
    const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
    const orgSnap = (invoice.orgSnapshot as Record<string, any>) || {};
    const sellerName = (orgSnap.businessName || orgSettings?.businessName || '').trim();
    const sellerVat = (orgSnap.vatNumber || orgSettings?.vatNumber || '').trim();

    if (sellerName && sellerVat) {
      const timestampIso = invoice.issueDate
        ? new Date(invoice.issueDate).toISOString()
        : new Date(invoice.createdAt).toISOString();
      try {
        currentQrCode = generateZatcaQrTlvBase64({
          sellerName,
          vatNumber: sellerVat,
          timestampIso,
          totalWithVat: invoice.totalAmount.toString(),
          vatTotal: invoice.vatAmount.toString(),
        });

        // If invoice is already APPROVED, persist it to DB so it is permanently cached
        if (invoice.status === InvoiceStatus.APPROVED) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { zatcaQrCode: currentQrCode },
          });
        }
      } catch (err) {
        console.warn('Failed to dynamically generate ZATCA Phase 1 QR for invoice', invoice.id, err);
      }
    }
  }

  const decodedQrTags = currentQrCode
    ? decodeZatcaQrTlvBase64(currentQrCode)
    : {};

  const respJson = (invoice.zatcaResponse as Record<string, any>) || {};
  let qrCodeSvg: string | null = respJson.qrCodeSvg || null;
  let qrCodeDataUrl: string | null = respJson.qrCodeDataUrl || null;

  if (currentQrCode && (!qrCodeSvg || !qrCodeDataUrl)) {
    [qrCodeSvg, qrCodeDataUrl] = await Promise.all([
      generateZatcaQrSvg(currentQrCode),
      generateZatcaQrDataUrl(currentQrCode),
    ]);
  }

  // Verify the organization's ICV/PIH cryptographic chain
  const allIssued = await prisma.invoice.findMany({
    where: {
      organizationId,
      zatcaXml: { not: null },
    },
    select: { id: true, referenceNo: true, zatcaResponse: true },
  });

  const sortedChain = allIssued
    .map((inv) => {
      const r = (inv.zatcaResponse as Record<string, any>) || {};
      return {
        id: inv.id,
        referenceNo: inv.referenceNo,
        icv: r.icv as number,
        pih: r.pih as string,
        xmlHash: r.xmlHash as string,
      };
    })
    .filter((item) => typeof item.icv === 'number')
    .sort((a, b) => a.icv - b.icv);

  let chainValid = true;
  for (let i = 0; i < sortedChain.length; i++) {
    const curr = sortedChain[i];
    if (i === 0) {
      if (curr.icv !== 1 || curr.pih !== ZATCA_GENESIS_PIH) {
        chainValid = false;
        break;
      }
    } else {
      const prev = sortedChain[i - 1];
      if (curr.icv !== prev.icv + 1 || curr.pih !== prev.xmlHash) {
        chainValid = false;
        break;
      }
    }
  }

  res.json({
    success: true,
    data: {
      invoiceId: invoice.id,
      referenceNo: invoice.referenceNo,
      invoiceType: invoice.invoiceType,
      zatcaStatus: invoice.zatcaStatus,
      zatcaUuid: invoice.zatcaUuid,
      zatcaQrCode: currentQrCode,
      qrCodeSvg,
      qrCodeDataUrl,
      decodedQrTags,
      isDraftPreview: invoice.status === InvoiceStatus.DRAFT,
      zatcaXml: invoice.zatcaXml,
      icv: respJson.icv ?? null,
      pih: respJson.pih ?? null,
      xmlHash: respJson.xmlHash ?? null,
      chainValid,
      billingReferenceId: respJson.billingReferenceId ?? null,
      instructionNote: respJson.instructionNote ?? null,
      zatcaResponse: invoice.zatcaResponse,
      zatcaSubmittedAt: invoice.zatcaSubmittedAt,
    },
  });
});

// ─── Submit Invoice to ZATCA FATOORA API ────────────────────────

/**
 * POST /api/invoices/:id/zatca/submit
 * Submits an approved invoice to the official ZATCA FATOORA API
 * (Clearance for B2B Standard Tax Invoice, Reporting for B2C Simplified Tax Invoice).
 * If official CSID credentials are not configured, returns 422 with clear diagnostic instructions.
 */
router.post('/:id/zatca/submit', requirePermission(PERMISSIONS.ISSUE_INVOICES), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  try {
    const result = await zatcaService.processZatcaSubmission(req.params.id, organizationId);
    res.status(result.canSubmit && result.success ? 200 : 422).json({
      success: result.success,
      data: result,
      message: result.message,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'ZATCA_SUBMISSION_ERROR',
        message: err.message,
      },
    });
  }
});

// ─── Offline Local ZATCA Compliance Verification ─────────────────

/**
 * GET /api/invoices/:id/zatca/verify
 * Performs complete local verification against ZATCA rules:
 * Mandatory fields, UBL 2.1 XML schema compliance, SHA-256 hash match,
 * TLV QR code encoding/decoding, ICV and PIH chain link.
 */
router.get('/:id/zatca/verify', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  try {
    const verification = await zatcaService.verifyInvoiceOffline(req.params.id, organizationId);
    res.json({
      success: true,
      data: verification,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'ZATCA_VERIFY_ERROR',
        message: err.message,
      },
    });
  }
});

// ─── PDF Data ───────────────────────────────────────────────────

/**
 * GET /api/invoices/:id/pdf-data
 */
router.get('/:id/pdf-data', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      statement: { select: { id: true, referenceNo: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
      payments: {
        include: {
          bankAccount: true,
          recordedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
        },
        orderBy: { paymentDate: 'asc' },
      },
      createdBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
    },
  });

  if (!invoice) throw new NotFoundError('Invoice');
  assertSameOrg(organizationId, invoice.organizationId, 'Invoice');

  // Fetch the organization's default company receiving bank account
  const defaultBankAccount =
    (await prisma.orgBankAccount.findFirst({
      where: { organizationId: invoice.organizationId, isDefault: true, isActive: true },
    })) ||
    (await prisma.orgBankAccount.findFirst({
      where: { organizationId: invoice.organizationId, isActive: true },
    }));

  res.json({ success: true, data: { ...invoice, defaultBankAccount } });
});

// ─── Delete Invoice (Draft Only / Permanent) ────────────────────

/**
 * DELETE /api/invoices/:id
 * Permanently delete a DRAFT or CANCELLED invoice with 0 payments and no protected dependencies.
 * Also supports administrative test data cleanup for authorized admins (?testCleanup=true).
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.ISSUE_INVOICES),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, role, permissions } = authReq.user;
    const { id } = req.params;
    const isTestCleanup = req.query.testCleanup === 'true' || req.body?.isTestCleanup === true;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        payments: true,
        lines: true,
      },
    });

    if (!invoice) throw new NotFoundError('Invoice');
    assertSameOrg(organizationId, invoice.organizationId, 'Invoice');

    // Safeguard 1: ZATCA Compliance check (always enforced, even in test cleanup)
    if (
      invoice.zatcaStatus === ZatcaStatus.REPORTED ||
      invoice.zatcaStatus === ZatcaStatus.CLEARED
    ) {
      throw new BusinessRuleError(
        'Cannot delete an invoice that has been officially reported to or cleared by ZATCA (الهيئة العامة للزكاة والضريبة والجمارك). Official tax invoices must be retained for legal and compliance audit trails.'
      );
    }

    const isAdmin =
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ORG_ADMIN ||
      (permissions && permissions.includes(PERMISSIONS.MANAGE_SETTINGS));

    if (isTestCleanup) {
      if (!isAdmin) {
        throw new AuthorizationError(
          'Administrative test data cleanup requires MANAGE_SETTINGS or ORG_ADMIN privileges.'
        );
      }
    } else {
      // Normal business deletion rules:
      const canDelete =
        invoice.status === InvoiceStatus.DRAFT ||
        invoice.status === InvoiceStatus.CANCELLED;

      if (!canDelete) {
        throw new BusinessRuleError(
          `Cannot delete invoice with status ${invoice.status}. Only DRAFT or CANCELLED invoices can be deleted; approved or sent invoices must be cancelled first to preserve financial auditability.`
        );
      }

      // Safeguard 2: Payments check (active or recorded payments)
      if (invoice.payments && invoice.payments.length > 0) {
        throw new BusinessRuleError(
          'Cannot delete an invoice that has associated payment records. Delete or reverse all payment records first to preserve financial auditability.'
        );
      }

      if (invoice.paidAmount.gt(0)) {
        throw new BusinessRuleError(
          'Cannot delete an invoice that has recorded paid amounts. Financial payment history must be preserved.'
        );
      }

      // Safeguard 3: Linked Credit or Debit notes
      const linkedNotes = await prisma.invoice.findMany({
        where: { cancelledById: invoice.id, organizationId },
        select: { id: true, referenceNo: true, invoiceType: true },
      });
      if (linkedNotes.length > 0) {
        throw new BusinessRuleError(
          `Cannot delete an invoice that has linked credit or debit notes (${linkedNotes.map((n) => n.referenceNo).join(', ')}). Delete or handle the associated notes first.`
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // If administrative test cleanup, cascade delete linked notes and payments
      if (isTestCleanup) {
        const linkedNotes = await tx.invoice.findMany({
          where: { cancelledById: invoice.id, organizationId },
          select: { id: true },
        });
        if (linkedNotes.length > 0) {
          const noteIds = linkedNotes.map((n) => n.id);
          await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: noteIds } } });
          await tx.payment.deleteMany({ where: { invoiceId: { in: noteIds } } });
          await tx.invoice.deleteMany({ where: { id: { in: noteIds } } });
        }

        // Delete associated payment records
        if (invoice.payments && invoice.payments.length > 0) {
          await tx.payment.deleteMany({ where: { invoiceId: id } });
        }
      }

      // Reconcile any work entries linked through direct invoice lines
      if (invoice.status === InvoiceStatus.DRAFT || isTestCleanup) {
        for (const line of invoice.lines) {
          if (line.workEntryId) {
            const workEntry = await tx.workEntry.findUnique({ where: { id: line.workEntryId } });
            if (workEntry) {
              const newBilledQty = Math.max(0, Number(workEntry.billedQuantity) - Number(line.quantity));
              const newStatus =
                newBilledQty === 0
                  ? WorkEntryStatus.APPROVED
                  : newBilledQty < Number(workEntry.quantity)
                  ? WorkEntryStatus.PARTIALLY_BILLED
                  : WorkEntryStatus.FULLY_BILLED;

              await tx.workEntry.update({
                where: { id: line.workEntryId },
                data: {
                  billedQuantity: newBilledQty,
                  status: newStatus,
                },
              });
            }
          }
        }
      }

      // Reconcile linked statement(s) if any
      const respJson = (invoice.zatcaResponse as Record<string, any>) || {};
      const linkedStatementIds: string[] = Array.isArray(respJson.statementIds)
        ? respJson.statementIds
        : invoice.statementId
        ? [invoice.statementId]
        : [];

      if (linkedStatementIds.length > 0) {
        for (const stmtId of linkedStatementIds) {
          const otherInvoices = await tx.invoice.count({
            where: {
              id: { not: id },
              statementId: stmtId,
              organizationId,
              status: { not: InvoiceStatus.CANCELLED },
            },
          });
          if (otherInvoices === 0) {
            await tx.statement.updateMany({
              where: { id: stmtId, organizationId, status: StatementStatus.INVOICED },
              data: { status: StatementStatus.APPROVED },
            });
          }
        }
      }

      // Delete invoice lines
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });

      // Delete the invoice
      await tx.invoice.delete({ where: { id } });

      // Record audit log
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'Invoice',
          entityId: id,
          description: isTestCleanup
            ? `Admin test data cleanup permanently deleted invoice ${invoice.referenceNo} (reversed ${invoice.payments?.length || 0} payments)`
            : `Permanently deleted ${invoice.status.toLowerCase()} invoice ${invoice.referenceNo}`,
          metadata: {
            referenceNo: invoice.referenceNo,
            status: invoice.status,
            previousStatus: invoice.status,
            invoiceType: invoice.invoiceType,
            totalAmount: invoice.totalAmount.toString(),
            operation: isTestCleanup ? 'ADMIN_TEST_DATA_CLEANUP' : 'PERMANENT_DELETE',
            paymentsReversed: invoice.payments?.length || 0,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
    });

    res.json({
      success: true,
      message: isTestCleanup
        ? 'Invoice and associated test data deleted successfully'
        : invoice.status === InvoiceStatus.CANCELLED
        ? 'Cancelled invoice deleted permanently'
        : 'Draft invoice deleted permanently',
      data: { id, referenceNo: invoice.referenceNo, isTestCleanup },
    });
  }
);

export default router;
