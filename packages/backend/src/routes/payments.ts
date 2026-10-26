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
import { AuditAction, PaymentMethod, InvoiceStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import { generateIdempotencyKey } from '../utils/sequences';
import { roundDecimal } from '../utils/finance';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── List Payments ──────────────────────────────────────────────

/**
 * GET /api/payments
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.PaymentWhereInput = { organizationId };
  if (req.query.invoiceId) where.invoiceId = req.query.invoiceId as string;
  if (req.query.clientId) where.clientId = req.query.clientId as string;
  if (req.query.method) where.method = req.query.method as any;
  if (req.query.status) where.status = req.query.status as string;
  if (req.query.dateFrom || req.query.dateTo) {
    where.paymentDate = {};
    if (req.query.dateFrom) {
      (where.paymentDate as Prisma.DateTimeFilter).gte = new Date(req.query.dateFrom as string);
    }
    if (req.query.dateTo) {
      (where.paymentDate as Prisma.DateTimeFilter).lte = new Date(req.query.dateTo as string);
    }
  }

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      include: {
        invoice: {
          select: {
            id: true,
            referenceNo: true,
            totalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            paymentStatus: true,
          },
        },
        client: { select: { id: true, nameAr: true, nameEn: true } },
        recordedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
        approvedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
        bankAccount: {
          select: {
            id: true,
            bankNameAr: true,
            bankNameEn: true,
            beneficiaryNameAr: true,
            beneficiaryNameEn: true,
            iban: true,
            currency: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    }),
  ]);

  res.json({
    success: true,
    data: {
      items: payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── Get Single Payment ─────────────────────────────────────────

/**
 * GET /api/payments/:id
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const payment = await prisma.payment.findUnique({
    where: { id: req.params.id },
    include: {
      invoice: {
        select: { id: true, referenceNo: true, totalAmount: true, paidAmount: true, remainingAmount: true, paymentStatus: true },
      },
      client: { select: { id: true, nameAr: true, nameEn: true } },
      recordedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
      approvedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
      bankAccount: true,
    },
  });

  if (!payment) throw new NotFoundError('Payment');
  assertSameOrg(organizationId, payment.organizationId, 'Payment');

  res.json({ success: true, data: payment });
});

// ─── Record Payment ─────────────────────────────────────────────

/**
 * POST /api/payments
 * Records a payment with method-specific details and updates invoice payment status atomically with row-level lock.
 */
router.post('/', requirePermission(PERMISSIONS.RECORD_PAYMENTS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: recordedById, email } = authReq.user;

  const {
    invoiceId,
    paymentDate,
    amount,
    method,
    referenceNo,
    bankAccountId,
    senderBankName,
    transferDate,
    chequeNumber,
    chequeDate,
    cardProvider,
    terminalId,
    receiptNumber,
    description,
    notes,
    idempotencyKey: clientIdempotencyKey,
  } = req.body;

  if (!invoiceId) throw new ValidationError('invoiceId is required');
  if (!paymentDate) throw new ValidationError('paymentDate is required');
  if (amount === undefined || amount === null) throw new ValidationError('amount is required');

  const payAmount = new Decimal(amount.toString());
  if (payAmount.lte(0)) throw new ValidationError('amount must be greater than 0');

  // Normalize and validate PaymentMethod
  const validMethods: PaymentMethod[] = [
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.CASH,
    PaymentMethod.CARD,
    PaymentMethod.CHEQUE,
    PaymentMethod.OTHER,
  ];

  let paymentMethod: PaymentMethod = PaymentMethod.BANK_TRANSFER;
  if (method) {
    const normMethod = String(method).toUpperCase().trim() as PaymentMethod;
    if (!validMethods.includes(normMethod)) {
      throw new ValidationError(`طريقة الدفع غير صالحة: ${method}. المتاح: ${validMethods.join(', ')}`);
    }
    paymentMethod = normMethod;
  }

  // Method-specific validations
  let resolvedBankAccountId: string | null = null;
  let resolvedTransferDate: Date | null = null;
  let resolvedChequeDate: Date | null = null;

  let resolvedChequeNumber: string | null = chequeNumber?.trim() || null;
  if (paymentMethod === PaymentMethod.BANK_TRANSFER) {
    if (bankAccountId) {
      const bank = await prisma.orgBankAccount.findFirst({
        where: { id: bankAccountId, organizationId, isActive: true },
      });
      if (!bank) {
        throw new ValidationError('الحساب البنكي المحدد غير صالح أو غير مفعّل / Invalid or inactive company receiving bank account');
      }
      resolvedBankAccountId = bank.id;
    } else {
      // Find default active bank account
      const defaultBank = (await prisma.orgBankAccount.findFirst({
        where: { organizationId, isDefault: true, isActive: true },
      })) || (await prisma.orgBankAccount.findFirst({
        where: { organizationId, isActive: true },
      }));
      resolvedBankAccountId = defaultBank?.id || null;
    }

    if (transferDate) {
      const td = new Date(transferDate);
      if (!isNaN(td.getTime())) resolvedTransferDate = td;
    }
  } else if (paymentMethod === PaymentMethod.CHEQUE) {
    if (!resolvedChequeNumber && referenceNo?.trim()) {
      resolvedChequeNumber = referenceNo.trim();
    }
    if (!resolvedChequeNumber) {
      throw new ValidationError('رقم الشيك مطلوب لعمليات الدفع بالشيك / Cheque number is required');
    }
    if (chequeDate) {
      const cd = new Date(chequeDate);
      if (!isNaN(cd.getTime())) resolvedChequeDate = cd;
    }
  } else if (paymentMethod === PaymentMethod.OTHER) {
    if (!description && !notes && !referenceNo) {
      throw new ValidationError('يرجى تقديم وصف أو ملاحظات لطريقة الدفع الأخرى / Description is required when payment method is Other');
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // Row-level lock on invoice to prevent concurrent over-payments
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;

    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });

    if (!invoice) throw new NotFoundError('Invoice');

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BusinessRuleError('Cannot record a payment against a cancelled invoice');
    }

    if (payAmount.gt(invoice.remainingAmount)) {
      throw new BusinessRuleError(
        `Payment amount (${payAmount}) exceeds remaining balance (${invoice.remainingAmount})`
      );
    }

    const idempotencyKey = clientIdempotencyKey || generateIdempotencyKey();

    const payment = await tx.payment.create({
      data: {
        organizationId,
        invoiceId,
        clientId: invoice.clientId,
        paymentDate: new Date(paymentDate),
        amount: payAmount,
        method: paymentMethod,
        referenceNo: referenceNo?.trim() || null,
        bankAccountId: resolvedBankAccountId,
        senderBankName: senderBankName?.trim() || null,
        transferDate: resolvedTransferDate,
        chequeNumber: resolvedChequeNumber,
        chequeDate: resolvedChequeDate,
        cardProvider: cardProvider?.trim() || null,
        terminalId: terminalId?.trim() || null,
        receiptNumber: receiptNumber?.trim() || null,
        description: description?.trim() || null,
        notes: notes?.trim() || null,
        idempotencyKey,
        recordedById,
      },
      include: {
        bankAccount: true,
        invoice: { select: { id: true, referenceNo: true } },
        client: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });

    const newPaidAmount = roundDecimal(invoice.paidAmount.add(payAmount), 4);
    const newRemainingAmount = roundDecimal(invoice.remainingAmount.sub(payAmount), 4);

    let paymentStatus: PaymentStatus;
    if (newRemainingAmount.lte(0)) {
      paymentStatus = PaymentStatus.PAID;
    } else if (newPaidAmount.gt(0)) {
      paymentStatus = PaymentStatus.PARTIALLY_PAID;
    } else {
      paymentStatus = PaymentStatus.UNPAID;
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        paymentStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        userId: recordedById,
        action: AuditAction.PAYMENT_RECORD,
        entityType: 'Payment',
        entityId: payment.id,
        description: `Recorded ${paymentMethod} payment of ${payAmount} SAR against invoice ${invoice.referenceNo}`,
        metadata: {
          invoiceId,
          invoiceRef: invoice.referenceNo,
          amount: payAmount.toString(),
          method: paymentMethod,
          bankAccountId: resolvedBankAccountId,
          bankNameAr: payment.bankAccount?.bankNameAr,
          referenceNo: payment.referenceNo,
          chequeNumber: payment.chequeNumber,
          cardProvider: payment.cardProvider,
          receiptNumber: payment.receiptNumber,
          newRemainingAmount: newRemainingAmount.toString(),
          recordedBy: email,
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return payment;
  });

  res.status(201).json({ success: true, data: result });
});

// ─── Approve Payment ─────────────────────────────────────────────

/**
 * POST /api/payments/:id/approve
 * Approves a recorded payment.
 * Requires ORG_ADMIN, SUPER_ADMIN, or ORG_MANAGER role (or RECORD_PAYMENTS permission).
 */
router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.RECORD_PAYMENTS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: approverId, email } = authReq.user;

    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, organizationId },
      include: {
        invoice: { select: { id: true, referenceNo: true } },
      },
    });

    if (!payment) throw new NotFoundError('Payment');

    if (payment.status === 'APPROVED') {
      throw new BusinessRuleError('Payment is already approved');
    }

    if (payment.status === 'REVERSED' || payment.status === 'CANCELLED') {
      throw new BusinessRuleError('Cannot approve a reversed or cancelled payment');
    }

    const updatedPayment = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: req.params.id },
        data: {
          status: 'APPROVED',
          approvedById: approverId,
          approvedAt: new Date(),
        },
        include: {
          invoice: { select: { id: true, referenceNo: true, totalAmount: true, remainingAmount: true, paymentStatus: true } },
          client: { select: { id: true, nameAr: true, nameEn: true } },
          recordedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
          approvedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
          bankAccount: true,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: approverId,
          action: AuditAction.APPROVE,
          entityType: 'Payment',
          entityId: updated.id,
          description: `Approved payment of ${updated.amount} SAR for invoice ${updated.invoice?.referenceNo || payment.invoiceId}`,
          metadata: {
            invoiceId: updated.invoiceId,
            invoiceRef: updated.invoice?.referenceNo,
            amount: updated.amount.toString(),
            approvedBy: email,
            previousStatus: payment.status,
            newStatus: 'APPROVED',
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return updated;
    });

    res.json({
      success: true,
      message: 'Payment approved successfully',
      data: updatedPayment,
    });
  }
);

// ─── Update / Edit Payment ──────────────────────────────────────

/**
 * PUT /api/payments/:id
 * Updates payment details with financial integrity protection.
 * If the amount is modified, recomputes invoice paidAmount & remainingAmount atomically with row-level locks.
 */
router.put(
  '/:id',
  requirePermission(PERMISSIONS.RECORD_PAYMENTS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;

    const existingPayment = await prisma.payment.findFirst({
      where: { id: req.params.id, organizationId },
      include: {
        invoice: true,
      },
    });

    if (!existingPayment) throw new NotFoundError('Payment');

    if (existingPayment.status === 'REVERSED' || existingPayment.status === 'CANCELLED') {
      throw new BusinessRuleError('Cannot edit a reversed or cancelled payment');
    }

    if (existingPayment.invoice.status === InvoiceStatus.CANCELLED) {
      throw new BusinessRuleError('Cannot edit a payment linked to a cancelled invoice');
    }

    const {
      paymentDate,
      amount,
      method,
      referenceNo,
      bankAccountId,
      senderBankName,
      transferDate,
      chequeNumber,
      chequeDate,
      cardProvider,
      terminalId,
      receiptNumber,
      description,
      notes,
    } = req.body;

    const newAmount =
      amount !== undefined && amount !== null
        ? new Decimal(amount.toString())
        : existingPayment.amount;

    if (newAmount.lte(0)) {
      throw new ValidationError('Payment amount must be greater than 0');
    }

    // Normalize PaymentMethod if provided
    let paymentMethod: PaymentMethod = existingPayment.method;
    if (method) {
      const validMethods: PaymentMethod[] = [
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.CASH,
        PaymentMethod.CARD,
        PaymentMethod.CHEQUE,
        PaymentMethod.OTHER,
      ];
      const normMethod = String(method).toUpperCase().trim() as PaymentMethod;
      if (!validMethods.includes(normMethod)) {
        throw new ValidationError(`Invalid payment method: ${method}`);
      }
      paymentMethod = normMethod;
    }

    // Method-specific checks
    let resolvedBankAccountId: string | null = existingPayment.bankAccountId;
    let resolvedTransferDate: Date | null = existingPayment.transferDate;
    let resolvedChequeDate: Date | null = existingPayment.chequeDate;
    let resolvedChequeNumber: string | null =
      chequeNumber !== undefined
        ? chequeNumber?.trim() || null
        : existingPayment.chequeNumber;

    if (paymentMethod === PaymentMethod.BANK_TRANSFER) {
      if (bankAccountId) {
        const bank = await prisma.orgBankAccount.findFirst({
          where: { id: bankAccountId, organizationId, isActive: true },
        });
        if (!bank) {
          throw new ValidationError('Invalid or inactive company receiving bank account');
        }
        resolvedBankAccountId = bank.id;
      }
      if (transferDate) {
        const td = new Date(transferDate);
        if (!isNaN(td.getTime())) resolvedTransferDate = td;
      }
    } else if (paymentMethod === PaymentMethod.CHEQUE) {
      if (!resolvedChequeNumber && referenceNo?.trim()) {
        resolvedChequeNumber = referenceNo.trim();
      }
      if (!resolvedChequeNumber) {
        throw new ValidationError('Cheque number is required for cheque payments');
      }
      if (chequeDate) {
        const cd = new Date(chequeDate);
        if (!isNaN(cd.getTime())) resolvedChequeDate = cd;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Row-level lock on invoice to prevent concurrent balance mismatch
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${existingPayment.invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;

      const invoice = await tx.invoice.findFirst({
        where: { id: existingPayment.invoiceId, organizationId },
      });

      if (!invoice) throw new NotFoundError('Invoice');

      const amountDelta = roundDecimal(newAmount.sub(existingPayment.amount), 4);

      // If amount is increasing, ensure remainingAmount can cover the delta
      if (amountDelta.gt(0) && amountDelta.gt(invoice.remainingAmount)) {
        throw new BusinessRuleError(
          `Payment amount increase of (${amountDelta}) exceeds remaining invoice balance (${invoice.remainingAmount})`
        );
      }

      // Recompute invoice amounts if amount changed
      if (!amountDelta.isZero()) {
        const newPaidAmount = Decimal.max(
          new Decimal(0),
          roundDecimal(invoice.paidAmount.add(amountDelta), 4)
        );
        const newRemainingAmount = Decimal.max(
          new Decimal(0),
          roundDecimal(invoice.remainingAmount.sub(amountDelta), 4)
        );

        let paymentStatus: PaymentStatus;
        if (newRemainingAmount.lte(0)) {
          paymentStatus = PaymentStatus.PAID;
        } else if (newPaidAmount.gt(0)) {
          paymentStatus = PaymentStatus.PARTIALLY_PAID;
        } else {
          paymentStatus = PaymentStatus.UNPAID;
        }

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            paymentStatus,
          },
        });
      }

      const payment = await tx.payment.update({
        where: { id: req.params.id },
        data: {
          paymentDate: paymentDate ? new Date(paymentDate) : existingPayment.paymentDate,
          amount: newAmount,
          method: paymentMethod,
          referenceNo: referenceNo !== undefined ? referenceNo?.trim() || null : existingPayment.referenceNo,
          bankAccountId: resolvedBankAccountId,
          senderBankName:
            senderBankName !== undefined ? senderBankName?.trim() || null : existingPayment.senderBankName,
          transferDate: resolvedTransferDate,
          chequeNumber: resolvedChequeNumber,
          chequeDate: resolvedChequeDate,
          cardProvider: cardProvider !== undefined ? cardProvider?.trim() || null : existingPayment.cardProvider,
          terminalId: terminalId !== undefined ? terminalId?.trim() || null : existingPayment.terminalId,
          receiptNumber:
            receiptNumber !== undefined ? receiptNumber?.trim() || null : existingPayment.receiptNumber,
          description: description !== undefined ? description?.trim() || null : existingPayment.description,
          notes: notes !== undefined ? notes?.trim() || null : existingPayment.notes,
        },
        include: {
          invoice: {
            select: {
              id: true,
              referenceNo: true,
              totalAmount: true,
              paidAmount: true,
              remainingAmount: true,
              paymentStatus: true,
            },
          },
          client: { select: { id: true, nameAr: true, nameEn: true } },
          recordedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
          approvedBy: { select: { id: true, nameAr: true, nameEn: true, email: true } },
          bankAccount: true,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: AuditAction.UPDATE,
          entityType: 'Payment',
          entityId: payment.id,
          description: `Updated payment ${payment.id} for invoice ${invoice.referenceNo}: amount ${existingPayment.amount} -> ${newAmount}`,
          metadata: {
            invoiceId: invoice.id,
            invoiceRef: invoice.referenceNo,
            oldAmount: existingPayment.amount.toString(),
            newAmount: newAmount.toString(),
            amountDelta: amountDelta.toString(),
            method: paymentMethod,
            updatedBy: email,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return payment;
    });

    res.json({
      success: true,
      message: 'Payment updated successfully',
      data: updated,
    });
  }
);

// ─── Delete Payment ─────────────────────────────────────────────

/**
 * DELETE /api/payments/:id
 * Within 24 hours of creation. Reverses the payment amounts on the invoice.
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.RECORD_PAYMENTS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, role } = authReq.user;

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: req.params.id, organizationId },
      });

      if (!payment) throw new NotFoundError('Payment');

      // Financial safeguard: if payment is approved, require manager/admin privileges
      if (
        payment.status === 'APPROVED' &&
        role !== UserRole.ORG_ADMIN &&
        role !== UserRole.SUPER_ADMIN &&
        role !== UserRole.ORG_MANAGER
      ) {
        throw new BusinessRuleError('Deleting an approved payment requires manager or administrator privileges');
      }

      const ageMs = Date.now() - payment.createdAt.getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      if (ageMs > twentyFourHours) {
        throw new BusinessRuleError('Payments can only be deleted within 24 hours of recording');
      }

      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${payment.invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;

      await tx.payment.delete({ where: { id: req.params.id } });

      const invoice = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
      if (invoice) {
        const newPaidAmount = Decimal.max(
          new Decimal(0),
          roundDecimal(invoice.paidAmount.sub(payment.amount), 4)
        );
        const newRemainingAmount = roundDecimal(invoice.remainingAmount.add(payment.amount), 4);

        let paymentStatus: PaymentStatus;
        if (newPaidAmount.lte(0)) {
          paymentStatus = PaymentStatus.UNPAID;
        } else if (newRemainingAmount.lte(0)) {
          paymentStatus = PaymentStatus.PAID;
        } else {
          paymentStatus = PaymentStatus.PARTIALLY_PAID;
        }

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            paymentStatus,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'Payment',
          entityId: payment.id,
          description: `Reversed payment of ${payment.amount} on invoice ${payment.invoiceId}`,
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
    });

    res.json({ success: true, message: 'Payment deleted and invoice updated' });
  }
);

export default router;
