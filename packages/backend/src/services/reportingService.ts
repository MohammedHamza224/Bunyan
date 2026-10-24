import { Decimal } from '@prisma/client/runtime/library';
import {
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  StatementStatus,
  WorkEntryStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { assertSameOrg } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { roundDecimal } from '../utils/finance';

export type PeriodPreset =
  | 'today'
  | 'last7days'
  | 'currentMonth'
  | 'previousMonth'
  | 'currentYear'
  | 'custom'
  | 'all';

export interface DateRangeResult {
  period: PeriodPreset;
  dateFrom: Date | null;
  dateTo: Date | null;
}

/**
 * Parses and validates period presets and custom dateFrom / dateTo strings.
 */
export function resolvePeriodRange(
  periodInput?: string,
  dateFromInput?: string,
  dateToInput?: string,
  nowInput?: Date
): DateRangeResult {
  const now = nowInput ? new Date(nowInput) : new Date();
  const period = (periodInput as PeriodPreset) || (dateFromInput || dateToInput ? 'custom' : 'all');

  const parseDateStrict = (val: string, fieldName: string, isEndOfDay: boolean): Date => {
    const trimmed = val.trim();
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) {
      throw new ValidationError(`Invalid date format for ${fieldName}: ${val}`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      if (isEndOfDay) {
        return new Date(`${trimmed}T23:59:59.999Z`);
      }
      return new Date(`${trimmed}T00:00:00.000Z`);
    }
    return d;
  };

  if (period === 'today') {
    const yyyyMmDd = now.toISOString().slice(0, 10);
    return {
      period: 'today',
      dateFrom: new Date(`${yyyyMmDd}T00:00:00.000Z`),
      dateTo: new Date(`${yyyyMmDd}T23:59:59.999Z`),
    };
  }

  if (period === 'last7days') {
    const endDay = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return {
      period: 'last7days',
      dateFrom: new Date(`${start}T00:00:00.000Z`),
      dateTo: new Date(`${endDay}T23:59:59.999Z`),
    };
  }

  if (period === 'currentMonth') {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const dateFrom = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const dateTo = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    return { period: 'currentMonth', dateFrom, dateTo };
  }

  if (period === 'previousMonth') {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const dateFrom = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const dateTo = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { period: 'previousMonth', dateFrom, dateTo };
  }

  if (period === 'currentYear') {
    const year = now.getUTCFullYear();
    const dateFrom = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const dateTo = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    return { period: 'currentYear', dateFrom, dateTo };
  }

  if (period === 'custom' || dateFromInput || dateToInput) {
    const dateFrom = dateFromInput ? parseDateStrict(dateFromInput, 'dateFrom', false) : null;
    const dateTo = dateToInput ? parseDateStrict(dateToInput, 'dateTo', true) : null;
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new ValidationError('dateFrom cannot be after dateTo');
    }
    return { period: 'custom', dateFrom, dateTo };
  }

  return { period: 'all', dateFrom: null, dateTo: null };
}

/**
 * Extracts the document currency from its frozen orgSnapshot or falls back to the organization's defaultCurrency.
 */
export function resolveDocCurrency(orgSnapshot: any, fallbackCurrency = 'SAR'): string {
  if (orgSnapshot && typeof orgSnapshot === 'object') {
    const c = orgSnapshot.defaultCurrency || orgSnapshot.currency;
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim().toUpperCase();
    }
  }
  return (fallbackCurrency || 'SAR').trim().toUpperCase();
}

/**
 * Computes overdue days between dueDate and asOfDate (strictly based on UTC calendar days).
 * Returns null if dueDate is null.
 */
export function calculateOverdueDays(dueDate: Date | null | undefined, asOfDate: Date): number | null {
  if (!dueDate) return null;
  const dueUtc = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const refUtc = Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate());
  const diffDays = Math.floor((refUtc - dueUtc) / (1000 * 60 * 60 * 24));
  return diffDays;
}

export type AgingBucketKey =
  | 'NOT_DUE'
  | 'OVERDUE_1_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_61_90'
  | 'OVERDUE_90_PLUS'
  | 'UNCLASSIFIED';

export function classifyAgingBucket(overdueDays: number | null): AgingBucketKey {
  if (overdueDays === null) return 'UNCLASSIFIED';
  if (overdueDays <= 0) return 'NOT_DUE';
  if (overdueDays <= 30) return 'OVERDUE_1_30';
  if (overdueDays <= 60) return 'OVERDUE_31_60';
  if (overdueDays <= 90) return 'OVERDUE_61_90';
  return 'OVERDUE_90_PLUS';
}

// =============================================================
// 1. DASHBOARD ANALYTICS
// =============================================================

export async function getDashboardAnalytics(
  organizationId: string,
  query: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    currency?: string;
  }
) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const defaultCurrency = orgSettings?.defaultCurrency || 'SAR';
  const filterCurrency = query.currency ? query.currency.trim().toUpperCase() : null;

  const issueDateFilter: Prisma.DateTimeFilter | undefined =
    range.dateFrom || range.dateTo
      ? {
          ...(range.dateFrom && { gte: range.dateFrom }),
          ...(range.dateTo && { lte: range.dateTo }),
        }
      : undefined;

  const workDateFilter: Prisma.DateTimeFilter | undefined =
    range.dateFrom || range.dateTo
      ? {
          ...(range.dateFrom && { gte: range.dateFrom }),
          ...(range.dateTo && { lte: range.dateTo }),
        }
      : undefined;

  const [
    clientCount,
    activeSiteCount,
    pendingApprovalCount,
    approvedAndPartialEntries,
    approvedStatementsInPeriod,
    draftStatementsCount,
    issuedInvoicesInPeriod,
    allActiveReceivableInvoices,
    paymentsInPeriod,
    recentWorkEntries,
    pendingWorkEntries,
    recentStatements,
    recentInvoices,
    recentPayments,
    recentActivity,
  ] = await Promise.all([
    prisma.client.count({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.site.count({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.workEntry.count({
      where: { organizationId, status: WorkEntryStatus.PENDING_APPROVAL },
    }),
    // All APPROVED and PARTIALLY_BILLED work entries to calculate accurate unbilled approved value
    prisma.workEntry.findMany({
      where: {
        organizationId,
        status: { in: [WorkEntryStatus.APPROVED, WorkEntryStatus.PARTIALLY_BILLED] },
      },
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
        site: { select: { id: true, nameAr: true, nameEn: true } },
      },
      orderBy: { workDate: 'desc' },
    }),
    // Statements issued in period (APPROVED or INVOICED)
    prisma.statement.findMany({
      where: {
        organizationId,
        status: { in: [StatementStatus.APPROVED, StatementStatus.INVOICED] },
        ...(issueDateFilter && { issueDate: issueDateFilter }),
      },
      select: { id: true, totalAmount: true, status: true, orgSnapshot: true },
    }),
    prisma.statement.count({
      where: { organizationId, status: StatementStatus.DRAFT },
    }),
    // Issued invoices & notes in the selected period
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
        ...(issueDateFilter && { issueDate: issueDateFilter }),
      },
      select: {
        id: true,
        referenceNo: true,
        invoiceType: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        paymentStatus: true,
        dueDate: true,
        orgSnapshot: true,
      },
    }),
    // Point-in-time active receivables (all APPROVED/SENT base invoices with remaining balance)
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
        invoiceType: { in: [InvoiceType.TAX_INVOICE, InvoiceType.SIMPLIFIED_TAX_INVOICE] },
      },
      select: {
        id: true,
        referenceNo: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        paymentStatus: true,
        dueDate: true,
        orgSnapshot: true,
      },
    }),
    // Active payments recorded in the selected period
    prisma.payment.findMany({
      where: {
        organizationId,
        ...(issueDateFilter && { paymentDate: issueDateFilter }),
      },
      include: {
        invoice: { select: { id: true, referenceNo: true, orgSnapshot: true } },
      },
    }),
    // Operational lists
    prisma.workEntry.findMany({
      where: {
        organizationId,
        ...(workDateFilter && { workDate: workDateFilter }),
      },
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
        site: { select: { id: true, nameAr: true, nameEn: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.workEntry.findMany({
      where: { organizationId, status: WorkEntryStatus.PENDING_APPROVAL },
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
        site: { select: { id: true, nameAr: true, nameEn: true } },
      },
      orderBy: { workDate: 'desc' },
      take: 8,
    }),
    prisma.statement.findMany({
      where: {
        organizationId,
        ...(issueDateFilter && { issueDate: issueDateFilter }),
      },
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
      },
      orderBy: { issueDate: 'desc' },
      take: 6,
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        ...(issueDateFilter && { issueDate: issueDateFilter }),
      },
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
      },
      orderBy: { issueDate: 'desc' },
      take: 6,
    }),
    prisma.payment.findMany({
      where: {
        organizationId,
        ...(issueDateFilter && { paymentDate: issueDateFilter }),
      },
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
        invoice: { select: { id: true, referenceNo: true } },
      },
      orderBy: { paymentDate: 'desc' },
      take: 6,
    }),
    prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: { select: { id: true, nameAr: true, email: true } },
      },
    }),
  ]);

  // 1. Calculate Approved Unbilled Work Value accurately: sum((quantity - billedQuantity) * unitPrice)
  let approvedUnbilledValue = new Decimal(0);
  const unbilledWorkEntriesList: any[] = [];
  for (const we of approvedAndPartialEntries) {
    const remQty = we.quantity.sub(we.billedQuantity);
    if (remQty.gt(0)) {
      const unbilledVal = roundDecimal(remQty.mul(we.unitPrice), 4);
      approvedUnbilledValue = approvedUnbilledValue.add(unbilledVal);
      unbilledWorkEntriesList.push({
        id: we.id,
        referenceNo: we.referenceNo,
        itemNameAr: we.itemNameAr,
        itemNameEn: we.itemNameEn,
        workDate: we.workDate,
        status: we.status,
        quantity: Number(we.quantity),
        billedQuantity: Number(we.billedQuantity),
        remainingQuantity: Number(remQty),
        unbilledQuantity: Number(remQty),
        unitPrice: Number(we.unitPrice),
        unbilledValue: Number(roundDecimal(unbilledVal, 2)),
        unbilledAmount: Number(roundDecimal(unbilledVal, 2)),
        unit: we.unit,
        client: we.client,
        site: we.site,
      });
    }
  }

  const targetCurrency = filterCurrency || defaultCurrency;

  // 2. Statements in period (never added to invoices!)
  let totalStatements = 0;
  let totalStatementsValue = new Decimal(0);
  for (const stm of approvedStatementsInPeriod) {
    const curr = resolveDocCurrency(stm.orgSnapshot, defaultCurrency);
    if (curr !== targetCurrency) continue;
    totalStatements += 1;
    totalStatementsValue = totalStatementsValue.add(stm.totalAmount);
  }

  // 3. Period Invoices & Credit/Debit Notes (grouped by currency & filtered to targetCurrency for top-level KPIs)
  const byCurrency: Record<
    string,
    {
      currency: string;
      grossInvoiceValue: number;
      creditNotesTotal: number;
      debitNotesTotal: number;
      netInvoiceValue: number;
      totalCollected: number;
      totalOutstanding: number;
      overdueAmount: number;
    }
  > = {};

  const ensureCurr = (curr: string) => {
    if (!byCurrency[curr]) {
      byCurrency[curr] = {
        currency: curr,
        grossInvoiceValue: 0,
        creditNotesTotal: 0,
        debitNotesTotal: 0,
        netInvoiceValue: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        overdueAmount: 0,
      };
    }
    return byCurrency[curr];
  };

  let totalInvoices = 0;
  let paidInvoicesCount = 0;
  let grossInvoiceValue = new Decimal(0);
  let creditNotesTotal = new Decimal(0);
  let debitNotesTotal = new Decimal(0);

  for (const inv of issuedInvoicesInPeriod) {
    const curr = resolveDocCurrency(inv.orgSnapshot, defaultCurrency);
    const bucket = ensureCurr(curr);
    const amt = new Decimal(inv.totalAmount.toString());

    if (inv.invoiceType === InvoiceType.CREDIT_NOTE) {
      bucket.creditNotesTotal = Number(roundDecimal(new Decimal(bucket.creditNotesTotal).add(amt), 2));
      bucket.netInvoiceValue = Number(roundDecimal(new Decimal(bucket.netInvoiceValue).sub(amt), 2));
      if (curr === targetCurrency) {
        creditNotesTotal = creditNotesTotal.add(amt);
      }
    } else if (inv.invoiceType === InvoiceType.DEBIT_NOTE) {
      bucket.debitNotesTotal = Number(roundDecimal(new Decimal(bucket.debitNotesTotal).add(amt), 2));
      bucket.netInvoiceValue = Number(roundDecimal(new Decimal(bucket.netInvoiceValue).add(amt), 2));
      if (curr === targetCurrency) {
        debitNotesTotal = debitNotesTotal.add(amt);
      }
    } else {
      bucket.grossInvoiceValue = Number(
        roundDecimal(new Decimal(bucket.grossInvoiceValue).add(amt), 2)
      );
      bucket.netInvoiceValue = Number(roundDecimal(new Decimal(bucket.netInvoiceValue).add(amt), 2));
      if (curr === targetCurrency) {
        totalInvoices += 1;
        grossInvoiceValue = grossInvoiceValue.add(amt);
        if (inv.paymentStatus === PaymentStatus.PAID) {
          paidInvoicesCount += 1;
        }
      }
    }
  }

  const netInvoiceValue = grossInvoiceValue.sub(creditNotesTotal).add(debitNotesTotal);

  // 4. Period Collections (Active Payments)
  let totalCollected = new Decimal(0);
  for (const pay of paymentsInPeriod) {
    const curr = resolveDocCurrency(pay.invoice?.orgSnapshot, defaultCurrency);
    const bucket = ensureCurr(curr);
    bucket.totalCollected = Number(roundDecimal(new Decimal(bucket.totalCollected).add(pay.amount), 2));
    if (curr === targetCurrency) {
      totalCollected = totalCollected.add(pay.amount);
    }
  }

  // 5. Point-in-time Receivables (Unpaid, Partially Paid, Overdue)
  const now = new Date();
  let totalOutstanding = new Decimal(0);
  let overdueAmount = new Decimal(0);
  let unpaidInvoicesCount = 0;
  let partiallyPaidInvoicesCount = 0;
  let overdueInvoicesCount = 0;

  for (const inv of allActiveReceivableInvoices) {
    const curr = resolveDocCurrency(inv.orgSnapshot, defaultCurrency);
    const bucket = ensureCurr(curr);

    const rem = new Decimal(inv.remainingAmount.toString());
    if (rem.gt(0)) {
      bucket.totalOutstanding = Number(
        roundDecimal(new Decimal(bucket.totalOutstanding).add(rem), 2)
      );

      const overdueDays = calculateOverdueDays(inv.dueDate, now);
      if (overdueDays !== null && overdueDays > 0) {
        bucket.overdueAmount = Number(roundDecimal(new Decimal(bucket.overdueAmount).add(rem), 2));
      }

      if (curr === targetCurrency) {
        totalOutstanding = totalOutstanding.add(rem);
        if (inv.paymentStatus === PaymentStatus.UNPAID) {
          unpaidInvoicesCount += 1;
        } else if (inv.paymentStatus === PaymentStatus.PARTIALLY_PAID) {
          partiallyPaidInvoicesCount += 1;
        }
        if (overdueDays !== null && overdueDays > 0) {
          overdueInvoicesCount += 1;
          overdueAmount = overdueAmount.add(rem);
        }
      }
    }
  }

  const availableCurrencies = Object.keys(byCurrency);

  return {
    period: range.period,
    dateFrom: range.dateFrom ? range.dateFrom.toISOString() : null,
    dateTo: range.dateTo ? range.dateTo.toISOString() : null,
    defaultCurrency,
    currency: targetCurrency,
    hasMultipleCurrencies: availableCurrencies.length > 1,
    availableCurrencies: availableCurrencies.length > 0 ? availableCurrencies : [defaultCurrency],
    currencyBreakdown: Object.values(byCurrency),
    // Backward-compatible & Phase 4 KPIs
    clientCount,
    activeSiteCount,
    pendingApprovalCount,
    approvedUnbilledValue: Number(roundDecimal(approvedUnbilledValue, 2)),
    approvedUnbilledCount: unbilledWorkEntriesList.length,
    totalStatements,
    totalStatementsValue: Number(roundDecimal(totalStatementsValue, 2)),
    draftStatementsCount,
    totalInvoices,
    totalInvoiceValue: Number(roundDecimal(grossInvoiceValue, 2)),
    grossInvoiceValue: Number(roundDecimal(grossInvoiceValue, 2)),
    creditNotesTotal: Number(roundDecimal(creditNotesTotal, 2)),
    debitNotesTotal: Number(roundDecimal(debitNotesTotal, 2)),
    netInvoiceValue: Number(roundDecimal(netInvoiceValue, 2)),
    totalCollected: Number(roundDecimal(totalCollected, 2)),
    totalOutstanding: Number(roundDecimal(totalOutstanding, 2)),
    unpaidInvoicesCount,
    partiallyPaidInvoicesCount,
    paidInvoicesCount,
    overdueInvoicesCount,
    overdueAmount: Number(roundDecimal(overdueAmount, 2)),
    byCurrency: Object.values(byCurrency),
    // Operational lists
    recentWorkEntries,
    pendingWorkEntries,
    pendingApprovalEntries: pendingWorkEntries,
    unbilledWorkEntries: unbilledWorkEntriesList.slice(0, 8),
    recentStatements,
    recentInvoices,
    recentPayments,
    recentActivity,
  };
}

// =============================================================
// 2. INVOICES REPORT (تقرير الفواتير)
// =============================================================

export async function getInvoicesReport(organizationId: string, query: Record<string, any>) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const defaultCurrency = orgSettings?.defaultCurrency || 'SAR';

  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit as string) || 25));

  const includeCancelled =
    query.includeCancelled === 'true' ||
    query.includeCancelled === true ||
    query.status === 'CANCELLED';

  const where: Prisma.InvoiceWhereInput = { organizationId };

  if (query.clientId) where.clientId = String(query.clientId);
  if (query.status && Object.values(InvoiceStatus).includes(query.status as InvoiceStatus)) {
    where.status = query.status as InvoiceStatus;
  } else if (!includeCancelled) {
    where.status = { not: InvoiceStatus.CANCELLED };
  }

  if (query.invoiceType && Object.values(InvoiceType).includes(query.invoiceType as InvoiceType)) {
    where.invoiceType = query.invoiceType as InvoiceType;
  }

  if (
    query.paymentStatus &&
    Object.values(PaymentStatus).includes(query.paymentStatus as PaymentStatus)
  ) {
    where.paymentStatus = query.paymentStatus as PaymentStatus;
  }

  if (range.dateFrom || range.dateTo) {
    where.issueDate = {
      ...(range.dateFrom && { gte: range.dateFrom }),
      ...(range.dateTo && { lte: range.dateTo }),
    };
  }

  if (query.siteId) {
    const siteIdStr = String(query.siteId);
    where.OR = [
      { lines: { some: { workEntry: { siteId: siteIdStr } } } },
      { statement: { sites: { some: { siteId: siteIdStr } } } },
    ];
  }

  const search = (query.search as string)?.trim();
  if (search) {
    const searchCond: Prisma.InvoiceWhereInput[] = [
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { client: { nameAr: { contains: search, mode: 'insensitive' } } },
      { client: { nameEn: { contains: search, mode: 'insensitive' } } },
    ];
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: searchCond }];
  }

  if (query.minAmount !== undefined && query.minAmount !== '') {
    const min = Number(query.minAmount);
    if (isNaN(min)) throw new ValidationError('Invalid minAmount');
    where.totalAmount = { ...(where.totalAmount as any), gte: new Decimal(min) };
  }
  if (query.maxAmount !== undefined && query.maxAmount !== '') {
    const max = Number(query.maxAmount);
    if (isNaN(max)) throw new ValidationError('Invalid maxAmount');
    where.totalAmount = { ...(where.totalAmount as any), lte: new Decimal(max) };
  }

  // Fetch matching invoices + all approved credit/debit notes for this org to compute netAmount per invoice
  const [rawInvoices, allNotes] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true, vatNumber: true } },
        statement: {
          select: {
            id: true,
            referenceNo: true,
            sites: { include: { site: { select: { id: true, nameAr: true, nameEn: true } } } },
          },
        },
        lines: {
          include: {
            workEntry: {
              select: {
                id: true,
                site: { select: { id: true, nameAr: true, nameEn: true } },
              },
            },
          },
        },
      },
      orderBy: { issueDate: 'desc' },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
        invoiceType: { in: [InvoiceType.CREDIT_NOTE, InvoiceType.DEBIT_NOTE] },
      },
      select: {
        id: true,
        referenceNo: true,
        invoiceType: true,
        cancelledById: true,
        totalAmount: true,
      },
    }),
  ]);

  const notesByParentId = new Map<string, { credit: Decimal; debit: Decimal }>();
  for (const note of allNotes) {
    if (!note.cancelledById) continue;
    const current = notesByParentId.get(note.cancelledById) || {
      credit: new Decimal(0),
      debit: new Decimal(0),
    };
    if (note.invoiceType === InvoiceType.CREDIT_NOTE) {
      current.credit = current.credit.add(note.totalAmount);
    } else if (note.invoiceType === InvoiceType.DEBIT_NOTE) {
      current.debit = current.debit.add(note.totalAmount);
    }
    notesByParentId.set(note.cancelledById, current);
  }

  const now = new Date();
  const filterCurrency = query.currency ? String(query.currency).trim().toUpperCase() : null;
  const overdueOnly = query.overdueOnly === 'true' || query.overdueOnly === true;

  let enriched = rawInvoices.map((inv) => {
    const currency = resolveDocCurrency(inv.orgSnapshot, defaultCurrency);
    const noteAdj = notesByParentId.get(inv.id) || {
      credit: new Decimal(0),
      debit: new Decimal(0),
    };

    const isNote =
      inv.invoiceType === InvoiceType.CREDIT_NOTE || inv.invoiceType === InvoiceType.DEBIT_NOTE;
    const grossAmount = new Decimal(inv.totalAmount.toString());
    const netAmount = isNote
      ? inv.invoiceType === InvoiceType.CREDIT_NOTE
        ? grossAmount.negated()
        : grossAmount
      : grossAmount.sub(noteAdj.credit).add(noteAdj.debit);

    // Collect distinct sites linked to this invoice via lines or statement
    const siteMap = new Map<string, { id: string; nameAr: string; nameEn: string | null }>();
    for (const l of inv.lines) {
      if (l.workEntry?.site) {
        siteMap.set(l.workEntry.site.id, l.workEntry.site);
      }
    }
    if (inv.statement?.sites) {
      for (const s of inv.statement.sites) {
        if (s.site) siteMap.set(s.site.id, s.site);
      }
    }

    const overdueDays =
      inv.status !== InvoiceStatus.CANCELLED &&
      !isNote &&
      inv.remainingAmount.gt(0) &&
      inv.dueDate
        ? calculateOverdueDays(inv.dueDate, now)
        : null;
    const isOverdue = overdueDays !== null && overdueDays > 0;

    return {
      id: inv.id,
      referenceNo: inv.referenceNo,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      supplyDate: inv.supplyDate,
      client: inv.client,
      clientNameAr: inv.client?.nameAr || '',
      sites: Array.from(siteMap.values()),
      statement: inv.statement
        ? { id: inv.statement.id, referenceNo: inv.statement.referenceNo }
        : null,
      invoiceType: inv.invoiceType,
      currency,
      subtotal: Number(roundDecimal(inv.subtotal, 2)),
      discountAmount: Number(roundDecimal(inv.discountAmount, 2)),
      taxableAmount: Number(roundDecimal(inv.taxableAmount, 2)),
      vatRate: Number(inv.vatRate),
      vatAmount: Number(roundDecimal(inv.vatAmount, 2)),
      totalAmount: Number(roundDecimal(grossAmount, 2)),
      grossAmount: Number(roundDecimal(grossAmount, 2)),
      creditNotesAmount: Number(roundDecimal(noteAdj.credit, 2)),
      debitNotesAmount: Number(roundDecimal(noteAdj.debit, 2)),
      netAmount: Number(roundDecimal(netAmount, 2)),
      paidAmount: Number(roundDecimal(inv.paidAmount, 2)),
      remainingAmount: Number(roundDecimal(inv.remainingAmount, 2)),
      status: inv.status,
      paymentStatus: inv.paymentStatus,
      zatcaStatus: inv.zatcaStatus,
      isOverdue,
      overdueDays: isOverdue ? overdueDays : 0,
      cancellationReason: inv.cancellationReason,
    };
  });

  if (filterCurrency) {
    enriched = enriched.filter((i) => i.currency === filterCurrency);
  }
  if (overdueOnly) {
    enriched = enriched.filter((i) => i.isOverdue);
  }

  // Sorting
  const sortBy = (query.sortBy as string) || 'issueDate';
  const sortOrder = (query.sortOrder as string) === 'asc' ? 1 : -1;
  enriched.sort((a, b) => {
    if (sortBy === 'totalAmount' || sortBy === 'amount') {
      return (a.totalAmount - b.totalAmount) * sortOrder;
    }
    if (sortBy === 'remainingAmount') {
      return (a.remainingAmount - b.remainingAmount) * sortOrder;
    }
    if (sortBy === 'referenceNo') {
      return a.referenceNo.localeCompare(b.referenceNo) * sortOrder;
    }
    if (sortBy === 'client') {
      return (a.client?.nameAr || '').localeCompare(b.client?.nameAr || '') * sortOrder;
    }
    return (new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()) * sortOrder;
  });

  // Compute full-dataset summary (across ALL matching records, separated by currency)
  const byCurrency: Record<
    string,
    {
      currency: string;
      activeCount: number;
      grossTotal: number;
      creditNotesTotal: number;
      debitNotesTotal: number;
      netTotal: number;
      paidTotal: number;
      remainingTotal: number;
      cancelledCount: number;
      cancelledTotal: number;
    }
  > = {};

  for (const row of enriched) {
    if (!byCurrency[row.currency]) {
      byCurrency[row.currency] = {
        currency: row.currency,
        activeCount: 0,
        grossTotal: 0,
        creditNotesTotal: 0,
        debitNotesTotal: 0,
        netTotal: 0,
        paidTotal: 0,
        remainingTotal: 0,
        cancelledCount: 0,
        cancelledTotal: 0,
      };
    }
    const b = byCurrency[row.currency];

    if (row.status === InvoiceStatus.CANCELLED) {
      b.cancelledCount += 1;
      b.cancelledTotal = Number(roundDecimal(new Decimal(b.cancelledTotal).add(row.grossAmount), 2));
      continue;
    }

    // Exclude DRAFT from active financial totals unless explicitly filtering by status=DRAFT
    if (row.status === InvoiceStatus.DRAFT && query.status !== 'DRAFT') {
      continue;
    }

    if (row.invoiceType === InvoiceType.CREDIT_NOTE) {
      b.creditNotesTotal = Number(
        roundDecimal(new Decimal(b.creditNotesTotal).add(row.grossAmount), 2)
      );
      b.netTotal = Number(roundDecimal(new Decimal(b.netTotal).sub(row.grossAmount), 2));
    } else if (row.invoiceType === InvoiceType.DEBIT_NOTE) {
      b.debitNotesTotal = Number(
        roundDecimal(new Decimal(b.debitNotesTotal).add(row.grossAmount), 2)
      );
      b.netTotal = Number(roundDecimal(new Decimal(b.netTotal).add(row.grossAmount), 2));
    } else {
      b.activeCount += 1;
      b.grossTotal = Number(roundDecimal(new Decimal(b.grossTotal).add(row.grossAmount), 2));
      b.creditNotesTotal = Number(
        roundDecimal(new Decimal(b.creditNotesTotal).add(row.creditNotesAmount), 2)
      );
      b.debitNotesTotal = Number(
        roundDecimal(new Decimal(b.debitNotesTotal).add(row.debitNotesAmount), 2)
      );
      b.netTotal = Number(roundDecimal(new Decimal(b.netTotal).add(row.netAmount), 2));
      b.paidTotal = Number(roundDecimal(new Decimal(b.paidTotal).add(row.paidAmount), 2));
      b.remainingTotal = Number(
        roundDecimal(new Decimal(b.remainingTotal).add(row.remainingAmount), 2)
      );
    }
  }

  // Note: If both parent invoice AND its standalone CREDIT_NOTE row are in `enriched`, prevent double counting of creditNotesTotal/netTotal in `byCurrency`!
  // Let's compute `byCurrency` cleanly so that if a note's parent is in `enriched`, we don't apply the note twice:
  const resetByCurrency: typeof byCurrency = {};
  const includedBaseIds = new Set(
    enriched
      .filter(
        (r) =>
          r.status !== InvoiceStatus.CANCELLED &&
          (r.status !== InvoiceStatus.DRAFT || query.status === 'DRAFT') &&
          r.invoiceType !== InvoiceType.CREDIT_NOTE &&
          r.invoiceType !== InvoiceType.DEBIT_NOTE
      )
      .map((r) => r.id)
  );

  for (const row of enriched) {
    if (!resetByCurrency[row.currency]) {
      resetByCurrency[row.currency] = {
        currency: row.currency,
        activeCount: 0,
        grossTotal: 0,
        creditNotesTotal: 0,
        debitNotesTotal: 0,
        netTotal: 0,
        paidTotal: 0,
        remainingTotal: 0,
        cancelledCount: 0,
        cancelledTotal: 0,
      };
    }
    const b = resetByCurrency[row.currency];

    if (row.status === InvoiceStatus.CANCELLED) {
      b.cancelledCount += 1;
      b.cancelledTotal = Number(roundDecimal(new Decimal(b.cancelledTotal).add(row.grossAmount), 2));
      continue;
    }

    if (row.status === InvoiceStatus.DRAFT && query.status !== 'DRAFT') {
      continue;
    }

    if (row.invoiceType === InvoiceType.CREDIT_NOTE) {
      // Only add if we are filtering specifically for CREDIT_NOTE (where base invoices aren't in the list)
      if (includedBaseIds.size === 0) {
        b.activeCount += 1;
        b.creditNotesTotal = Number(
          roundDecimal(new Decimal(b.creditNotesTotal).add(row.grossAmount), 2)
        );
        b.netTotal = Number(roundDecimal(new Decimal(b.netTotal).sub(row.grossAmount), 2));
      }
    } else if (row.invoiceType === InvoiceType.DEBIT_NOTE) {
      if (includedBaseIds.size === 0) {
        b.activeCount += 1;
        b.debitNotesTotal = Number(
          roundDecimal(new Decimal(b.debitNotesTotal).add(row.grossAmount), 2)
        );
        b.netTotal = Number(roundDecimal(new Decimal(b.netTotal).add(row.grossAmount), 2));
      }
    } else {
      b.activeCount += 1;
      b.grossTotal = Number(roundDecimal(new Decimal(b.grossTotal).add(row.grossAmount), 2));
      b.creditNotesTotal = Number(
        roundDecimal(new Decimal(b.creditNotesTotal).add(row.creditNotesAmount), 2)
      );
      b.debitNotesTotal = Number(
        roundDecimal(new Decimal(b.debitNotesTotal).add(row.debitNotesAmount), 2)
      );
      b.netTotal = Number(roundDecimal(new Decimal(b.netTotal).add(row.netAmount), 2));
      b.paidTotal = Number(roundDecimal(new Decimal(b.paidTotal).add(row.paidAmount), 2));
      b.remainingTotal = Number(
        roundDecimal(new Decimal(b.remainingTotal).add(row.remainingAmount), 2)
      );
    }
  }

  const total = enriched.length;
  const skip = (page - 1) * limit;
  const paginatedItems = enriched.slice(skip, skip + limit);

  const primaryCurr = resetByCurrency[filterCurrency || defaultCurrency] ||
    Object.values(resetByCurrency)[0] || {
      currency: defaultCurrency,
      activeCount: 0,
      grossTotal: 0,
      creditNotesTotal: 0,
      debitNotesTotal: 0,
      netTotal: 0,
      paidTotal: 0,
      remainingTotal: 0,
      cancelledCount: 0,
      cancelledTotal: 0,
    };

  return {
    items: paginatedItems,
    allMatchingItems: enriched,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      ...primaryCurr,
      grossInvoiceAmount: primaryCurr.grossTotal,
      totalCreditNotes: primaryCurr.creditNotesTotal,
      totalDebitNotes: primaryCurr.debitNotesTotal,
      netInvoiceAmount: primaryCurr.netTotal,
      totalPaid: primaryCurr.paidTotal,
      totalRemaining: primaryCurr.remainingTotal,
      byCurrency: Object.values(resetByCurrency),
    },
  };
}

// =============================================================
// 3. STATEMENTS REPORT (تقرير المستخلصات)
// =============================================================

export async function getStatementsReport(organizationId: string, query: Record<string, any>) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const defaultCurrency = orgSettings?.defaultCurrency || 'SAR';

  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit as string) || 25));

  const where: Prisma.StatementWhereInput = { organizationId };
  if (query.clientId) where.clientId = String(query.clientId);
  if (query.siteId) where.sites = { some: { siteId: String(query.siteId) } };
  if (query.status && Object.values(StatementStatus).includes(query.status as StatementStatus)) {
    where.status = query.status as StatementStatus;
  }
  if (range.dateFrom || range.dateTo) {
    where.issueDate = {
      ...(range.dateFrom && { gte: range.dateFrom }),
      ...(range.dateTo && { lte: range.dateTo }),
    };
  }
  const search = (query.search as string)?.trim();
  if (search) {
    where.OR = [
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { client: { nameAr: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const rawStatements = await prisma.statement.findMany({
    where,
    include: {
      client: { select: { id: true, nameAr: true, nameEn: true } },
      sites: { include: { site: { select: { id: true, nameAr: true, nameEn: true } } } },
      lines: {
        include: {
          workEntry: {
            select: {
              id: true,
              referenceNo: true,
              quantity: true,
              billedQuantity: true,
              unitPrice: true,
              status: true,
            },
          },
        },
      },
      invoices: {
        where: { status: { not: InvoiceStatus.CANCELLED } },
        select: { id: true, referenceNo: true, status: true, totalAmount: true },
      },
    },
    orderBy: { issueDate: 'desc' },
  });

  const enriched = rawStatements.map((stm) => {
    const currency = resolveDocCurrency(stm.orgSnapshot, defaultCurrency);
    const workValue = Number(roundDecimal(stm.subtotal, 2));
    const totalAmount = Number(roundDecimal(stm.totalAmount, 2));
    const approvedWorkValue =
      stm.status === StatementStatus.APPROVED || stm.status === StatementStatus.INVOICED
        ? totalAmount
        : 0;
    const isInvoiced = stm.status === StatementStatus.INVOICED || stm.invoices.length > 0;
    const invoicedValue = isInvoiced ? totalAmount : 0;
    const uninvoicedApprovedValue =
      stm.status === StatementStatus.APPROVED && !isInvoiced ? totalAmount : 0;

    return {
      id: stm.id,
      referenceNo: stm.referenceNo,
      title: stm.title,
      issueDate: stm.issueDate,
      periodStart: stm.periodStart,
      periodEnd: stm.periodEnd,
      client: stm.client,
      clientNameAr: stm.client?.nameAr || '',
      sites: stm.sites.map((s) => s.site),
      status: stm.status,
      currency,
      subtotal: workValue,
      vatAmount: Number(roundDecimal(stm.vatAmount, 2)),
      totalAmount,
      workValue,
      approvedWorkValue,
      invoicedValue,
      uninvoicedApprovedValue,
      linkedInvoices: stm.invoices,
    };
  });

  let totalStatementsCount = 0;
  let totalApprovedValue = new Decimal(0);
  let totalInvoicedValue = new Decimal(0);
  let totalUninvoicedApprovedValue = new Decimal(0);

  for (const row of enriched) {
    if (row.status === StatementStatus.CANCELLED) continue;
    totalStatementsCount += 1;
    totalApprovedValue = totalApprovedValue.add(row.approvedWorkValue);
    totalInvoicedValue = totalInvoicedValue.add(row.invoicedValue);
    totalUninvoicedApprovedValue = totalUninvoicedApprovedValue.add(row.uninvoicedApprovedValue);
  }

  const total = enriched.length;
  const skip = (page - 1) * limit;

  return {
    items: enriched.slice(skip, skip + limit),
    allMatchingItems: enriched,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      currency: defaultCurrency,
      activeCount: totalStatementsCount,
      totalCount: totalStatementsCount,
      totalApprovedValue: Number(roundDecimal(totalApprovedValue, 2)),
      totalApprovedWorkValue: Number(roundDecimal(totalApprovedValue, 2)),
      totalInvoicedValue: Number(roundDecimal(totalInvoicedValue, 2)),
      totalUninvoicedApprovedValue: Number(roundDecimal(totalUninvoicedApprovedValue, 2)),
    },
  };
}

// =============================================================
// 4. WORK ENTRIES REPORT (تقرير الأعمال المنفذة)
// =============================================================

export async function getWorkEntriesReport(organizationId: string, query: Record<string, any>) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const defaultCurrency = orgSettings?.defaultCurrency || 'SAR';

  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit as string) || 25));

  const where: Prisma.WorkEntryWhereInput = { organizationId };
  if (query.clientId) where.clientId = String(query.clientId);
  if (query.siteId) where.siteId = String(query.siteId);
  if (query.status) {
    const statuses = String(query.status)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => Object.values(WorkEntryStatus).includes(s as WorkEntryStatus));
    if (statuses.length === 1) {
      where.status = statuses[0] as WorkEntryStatus;
    } else if (statuses.length > 1) {
      where.status = { in: statuses as WorkEntryStatus[] };
    }
  }
  if (range.dateFrom || range.dateTo) {
    where.workDate = {
      ...(range.dateFrom && { gte: range.dateFrom }),
      ...(range.dateTo && { lte: range.dateTo }),
    };
  }
  const search = (query.search as string)?.trim();
  if (search) {
    where.OR = [
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { itemNameAr: { contains: search, mode: 'insensitive' } },
      { itemNameEn: { contains: search, mode: 'insensitive' } },
      { client: { nameAr: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const rawEntries = await prisma.workEntry.findMany({
    where,
    include: {
      client: { select: { id: true, nameAr: true, nameEn: true } },
      site: { select: { id: true, nameAr: true, nameEn: true } },
      statementLines: {
        include: {
          statement: { select: { id: true, referenceNo: true, status: true } },
        },
      },
      invoiceLines: {
        include: {
          invoice: { select: { id: true, referenceNo: true, status: true, invoiceType: true } },
        },
      },
    },
    orderBy: { workDate: 'desc' },
  });

  let totalRecordedValue = new Decimal(0);
  let totalApprovedValue = new Decimal(0);
  let totalBilledValue = new Decimal(0);
  let totalUnbilledApprovedValue = new Decimal(0);

  const enriched = rawEntries.map((we) => {
    const qty = new Decimal(we.quantity.toString());
    const billedQty = new Decimal(we.billedQuantity.toString());
    const remQty = Decimal.max(new Decimal(0), qty.sub(billedQty));
    const price = new Decimal(we.unitPrice.toString());
    const totalAmt = new Decimal(we.totalAmount.toString());
    const billedVal = roundDecimal(billedQty.mul(price), 4);
    const isApprovedStage =
      we.status === WorkEntryStatus.APPROVED ||
      we.status === WorkEntryStatus.PARTIALLY_BILLED ||
      we.status === WorkEntryStatus.FULLY_BILLED;
    const unbilledVal = isApprovedStage ? roundDecimal(remQty.mul(price), 4) : new Decimal(0);

    if (we.status !== WorkEntryStatus.REJECTED) {
      totalRecordedValue = totalRecordedValue.add(totalAmt);
    }
    if (isApprovedStage) {
      totalApprovedValue = totalApprovedValue.add(totalAmt);
      totalBilledValue = totalBilledValue.add(billedVal);
      totalUnbilledApprovedValue = totalUnbilledApprovedValue.add(unbilledVal);
    }

    const linkedStatements = we.statementLines
      .map((sl) => sl.statement)
      .filter((s) => s && s.status !== StatementStatus.CANCELLED);
    const linkedInvoices = we.invoiceLines
      .map((il) => il.invoice)
      .filter(
        (i) =>
          i &&
          i.status !== InvoiceStatus.CANCELLED &&
          i.invoiceType !== InvoiceType.CREDIT_NOTE &&
          i.invoiceType !== InvoiceType.DEBIT_NOTE
      );

    return {
      id: we.id,
      referenceNo: we.referenceNo,
      workDate: we.workDate,
      client: we.client,
      clientNameAr: we.client?.nameAr || '',
      site: we.site,
      siteNameAr: we.site?.nameAr || '',
      itemNameAr: we.itemNameAr,
      itemNameEn: we.itemNameEn,
      unit: we.unit,
      quantity: Number(qty),
      billedQuantity: Number(billedQty),
      unbilledQuantity: Number(remQty),
      unitPrice: Number(price),
      totalAmount: Number(roundDecimal(totalAmt, 2)),
      billedValue: Number(roundDecimal(billedVal, 2)),
      unbilledValue: Number(roundDecimal(unbilledVal, 2)),
      unbilledAmount: Number(roundDecimal(unbilledVal, 2)),
      status: we.status,
      currency: defaultCurrency,
      linkedStatements,
      linkedInvoices,
    };
  });

  const total = enriched.length;
  const skip = (page - 1) * limit;

  return {
    items: enriched.slice(skip, skip + limit),
    allMatchingItems: enriched,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      currency: defaultCurrency,
      totalCount: total,
      totalRecordedValue: Number(roundDecimal(totalRecordedValue, 2)),
      totalApprovedValue: Number(roundDecimal(totalApprovedValue, 2)),
      totalBilledValue: Number(roundDecimal(totalBilledValue, 2)),
      totalUnbilledApprovedValue: Number(roundDecimal(totalUnbilledApprovedValue, 2)),
      totalApprovedUnbilledValue: Number(roundDecimal(totalUnbilledApprovedValue, 2)),
    },
  };
}

// =============================================================
// 5. COLLECTIONS & PAYMENTS REPORT (تقرير التحصيلات والمدفوعات)
// =============================================================

export async function getCollectionsReport(organizationId: string, query: Record<string, any>) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const defaultCurrency = orgSettings?.defaultCurrency || 'SAR';

  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit as string) || 25));
  const statusFilter = ((query.status as string) || 'ALL').toUpperCase(); // ACTIVE | REVERSED | ALL
  const filterCurrency = query.currency ? String(query.currency).trim().toUpperCase() : null;

  const where: Prisma.PaymentWhereInput = { organizationId };
  if (query.clientId) where.clientId = String(query.clientId);
  if (query.invoiceId) where.invoiceId = String(query.invoiceId);
  if (query.method) where.method = String(query.method) as any;
  if (range.dateFrom || range.dateTo) {
    where.paymentDate = {
      ...(range.dateFrom && { gte: range.dateFrom }),
      ...(range.dateTo && { lte: range.dateTo }),
    };
  }

  const [activePayments, reversalLogs] = await Promise.all([
    statusFilter === 'REVERSED'
      ? Promise.resolve([])
      : prisma.payment.findMany({
          where,
          include: {
            client: { select: { id: true, nameAr: true, nameEn: true } },
            invoice: {
              select: {
                id: true,
                referenceNo: true,
                totalAmount: true,
                orgSnapshot: true,
              },
            },
            recordedBy: { select: { id: true, nameAr: true, email: true } },
          },
          orderBy: { paymentDate: 'desc' },
        }),
    statusFilter === 'ACTIVE'
      ? Promise.resolve([])
      : prisma.auditLog.findMany({
          where: {
            organizationId,
            entityType: 'Payment',
            action: 'DELETE',
            ...(range.dateFrom || range.dateTo
              ? {
                  createdAt: {
                    ...(range.dateFrom && { gte: range.dateFrom }),
                    ...(range.dateTo && { lte: range.dateTo }),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
        }),
  ]);

  const rows: any[] = [];

  for (const p of activePayments) {
    const currency = resolveDocCurrency(p.invoice?.orgSnapshot, defaultCurrency);
    if (filterCurrency && currency !== filterCurrency) continue;
    const amt = Number(roundDecimal(p.amount, 2));
    rows.push({
      id: p.id,
      paymentDate: p.paymentDate,
      referenceNo: p.referenceNo || p.id.slice(0, 8).toUpperCase(),
      client: p.client,
      clientNameAr: p.client?.nameAr || '',
      invoice: p.invoice ? { id: p.invoice.id, referenceNo: p.invoice.referenceNo } : null,
      invoiceReferenceNo: p.invoice?.referenceNo || '',
      method: p.method,
      currency,
      amount: amt,
      allocatedAmount: amt,
      unallocatedAmount: 0,
      status: 'ACTIVE',
      notes: p.notes,
      recordedBy: p.recordedBy,
    });
  }

  for (const log of reversalLogs) {
    // Parse amount and invoiceId from description: "Reversed payment of 400 on invoice cmvk..."
    const match = /Reversed payment of ([0-9.]+) on invoice (\S+)/i.exec(log.description || '');
    const amt = match ? Number(match[1]) : 0;
    const invId = match ? match[2] : null;
    if (query.invoiceId && invId !== query.invoiceId) continue;

    rows.push({
      id: log.entityId || log.id,
      paymentDate: log.createdAt,
      referenceNo: `REV-${(log.entityId || log.id).slice(0, 6).toUpperCase()}`,
      client: null,
      clientNameAr: '—',
      invoice: invId ? { id: invId, referenceNo: invId } : null,
      invoiceReferenceNo: invId || '—',
      method: 'BANK_TRANSFER',
      currency: defaultCurrency,
      amount: amt,
      allocatedAmount: 0,
      unallocatedAmount: 0,
      status: 'REVERSED',
      notes: log.description,
      recordedBy: null,
    });
  }

  const search = (query.search as string)?.trim().toLowerCase();
  const filteredRows = search
    ? rows.filter(
        (r) =>
          (r.referenceNo || '').toLowerCase().includes(search) ||
          (r.invoice?.referenceNo || '').toLowerCase().includes(search) ||
          (r.client?.nameAr || '').toLowerCase().includes(search)
      )
    : rows;

  const byCurrency: Record<
    string,
    {
      currency: string;
      activeCount: number;
      totalCollected: number;
      totalAllocated: number;
      totalUnallocated: number;
      reversedCount: number;
      totalReversed: number;
    }
  > = {};

  for (const r of filteredRows) {
    if (!byCurrency[r.currency]) {
      byCurrency[r.currency] = {
        currency: r.currency,
        activeCount: 0,
        totalCollected: 0,
        totalAllocated: 0,
        totalUnallocated: 0,
        reversedCount: 0,
        totalReversed: 0,
      };
    }
    const b = byCurrency[r.currency];
    if (r.status === 'ACTIVE') {
      b.activeCount += 1;
      b.totalCollected = Number(roundDecimal(new Decimal(b.totalCollected).add(r.amount), 2));
      b.totalAllocated = Number(
        roundDecimal(new Decimal(b.totalAllocated).add(r.allocatedAmount), 2)
      );
    } else {
      b.reversedCount += 1;
      b.totalReversed = Number(roundDecimal(new Decimal(b.totalReversed).add(r.amount), 2));
    }
  }

  const total = filteredRows.length;
  const skip = (page - 1) * limit;
  const primaryCurr = byCurrency[filterCurrency || defaultCurrency] ||
    Object.values(byCurrency)[0] || {
      currency: defaultCurrency,
      activeCount: 0,
      totalCollected: 0,
      totalAllocated: 0,
      totalUnallocated: 0,
      reversedCount: 0,
      totalReversed: 0,
    };

  return {
    items: filteredRows.slice(skip, skip + limit),
    allMatchingItems: filteredRows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      ...primaryCurr,
      totalActiveCollected: primaryCurr.totalCollected,
      totalReversedAmount: primaryCurr.totalReversed,
      byCurrency: Object.values(byCurrency),
    },
  };
}

// =============================================================
// 6. ACCOUNTS RECEIVABLE REPORT (تقرير الذمم المدينة)
// =============================================================

export async function getReceivablesReport(organizationId: string, query: Record<string, any>) {
  // Receivables are active APPROVED/SENT base invoices with remainingAmount > 0
  const invReport = await getInvoicesReport(organizationId, {
    ...query,
    includeCancelled: false,
    limit: 1000,
    page: 1,
  });

  const receivableItems = invReport.allMatchingItems.filter(
    (inv) =>
      (inv.status === InvoiceStatus.APPROVED || inv.status === InvoiceStatus.SENT) &&
      (inv.invoiceType === InvoiceType.TAX_INVOICE ||
        inv.invoiceType === InvoiceType.SIMPLIFIED_TAX_INVOICE) &&
      inv.remainingAmount > 0
  );

  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit as string) || 25));
  const skip = (page - 1) * limit;

  const byCurrency: Record<
    string,
    {
      currency: string;
      count: number;
      grossTotal: number;
      netTotal: number;
      paidTotal: number;
      outstandingTotal: number;
    }
  > = {};

  for (const r of receivableItems) {
    if (!byCurrency[r.currency]) {
      byCurrency[r.currency] = {
        currency: r.currency,
        count: 0,
        grossTotal: 0,
        netTotal: 0,
        paidTotal: 0,
        outstandingTotal: 0,
      };
    }
    const b = byCurrency[r.currency];
    b.count += 1;
    b.grossTotal = Number(roundDecimal(new Decimal(b.grossTotal).add(r.grossAmount), 2));
    b.netTotal = Number(roundDecimal(new Decimal(b.netTotal).add(r.netAmount), 2));
    b.paidTotal = Number(roundDecimal(new Decimal(b.paidTotal).add(r.paidAmount), 2));
    b.outstandingTotal = Number(
      roundDecimal(new Decimal(b.outstandingTotal).add(r.remainingAmount), 2)
    );
  }

  const defaultCurr = invReport.summary.currency || 'SAR';
  const primary = byCurrency[defaultCurr] ||
    Object.values(byCurrency)[0] || {
      currency: defaultCurr,
      count: 0,
      grossTotal: 0,
      netTotal: 0,
      paidTotal: 0,
      outstandingTotal: 0,
    };

  let overdueOutstanding = new Decimal(0);
  for (const r of receivableItems) {
    if (r.currency === defaultCurr && r.isOverdue) {
      overdueOutstanding = overdueOutstanding.add(r.remainingAmount);
    }
  }

  return {
    items: receivableItems.slice(skip, skip + limit),
    allMatchingItems: receivableItems,
    total: receivableItems.length,
    page,
    limit,
    totalPages: Math.ceil(receivableItems.length / limit) || 1,
    summary: {
      ...primary,
      totalOutstanding: primary.outstandingTotal,
      overdueOutstanding: Number(roundDecimal(overdueOutstanding, 2)),
      totalNetAmount: primary.netTotal,
      totalCount: primary.count,
      byCurrency: Object.values(byCurrency),
    },
  };
}

// =============================================================
// 7. CUSTOMER ACCOUNT STATEMENT (كشف حساب العميل)
// =============================================================

export async function getCustomerStatementReport(
  organizationId: string,
  query: {
    clientId?: string;
    dateFrom?: string;
    dateTo?: string;
    currency?: string;
    transactionType?: string;
  }
) {
  if (!query.clientId) {
    throw new ValidationError('clientId is required for Customer Account Statement');
  }

  const client = await prisma.client.findUnique({ where: { id: query.clientId } });
  if (!client) throw new NotFoundError('Client');
  assertSameOrg(organizationId, client.organizationId, 'Client');

  const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const defaultCurrency = orgSettings?.defaultCurrency || 'SAR';
  const targetCurrency = (query.currency || defaultCurrency).trim().toUpperCase();

  const range = resolvePeriodRange(
    query.dateFrom || query.dateTo ? 'custom' : 'all',
    query.dateFrom,
    query.dateTo
  );

  // Fetch all issued invoices (including Credit & Debit notes) and active payments for this client
  const [issuedInvoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        clientId: client.id,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
      },
      orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.payment.findMany({
      where: {
        organizationId,
        clientId: client.id,
      },
      include: {
        invoice: { select: { id: true, referenceNo: true, orgSnapshot: true } },
      },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  interface RawLedgerEvent {
    id: string;
    date: Date;
    createdAt: Date;
    documentNo: string;
    transactionType: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PAYMENT';
    descriptionAr: string;
    descriptionEn: string;
    currency: string;
    debit: Decimal;
    credit: Decimal;
    relatedRef: string | null;
  }

  const allEvents: RawLedgerEvent[] = [];

  for (const inv of issuedInvoices) {
    const curr = resolveDocCurrency(inv.orgSnapshot, defaultCurrency);
    if (curr !== targetCurrency) continue;

    const amt = new Decimal(inv.totalAmount.toString());
    const resp = (inv.zatcaResponse as Record<string, any>) || {};

    if (inv.invoiceType === InvoiceType.CREDIT_NOTE) {
      allEvents.push({
        id: inv.id,
        date: inv.issueDate,
        createdAt: inv.createdAt,
        documentNo: inv.referenceNo,
        transactionType: 'CREDIT_NOTE',
        descriptionAr: `إشعار دائن على الفاتورة ${resp.billingReferenceId || ''} - ${
          inv.cancellationReason || ''
        }`.trim(),
        descriptionEn: `Credit Note on Invoice ${resp.billingReferenceId || ''} - ${
          inv.cancellationReason || ''
        }`.trim(),
        currency: curr,
        debit: new Decimal(0),
        credit: amt,
        relatedRef: resp.billingReferenceId || null,
      });
    } else if (inv.invoiceType === InvoiceType.DEBIT_NOTE) {
      allEvents.push({
        id: inv.id,
        date: inv.issueDate,
        createdAt: inv.createdAt,
        documentNo: inv.referenceNo,
        transactionType: 'DEBIT_NOTE',
        descriptionAr: `إشعار مدين على الفاتورة ${resp.billingReferenceId || ''} - ${
          inv.cancellationReason || ''
        }`.trim(),
        descriptionEn: `Debit Note on Invoice ${resp.billingReferenceId || ''} - ${
          inv.cancellationReason || ''
        }`.trim(),
        currency: curr,
        debit: amt,
        credit: new Decimal(0),
        relatedRef: resp.billingReferenceId || null,
      });
    } else {
      allEvents.push({
        id: inv.id,
        date: inv.issueDate,
        createdAt: inv.createdAt,
        documentNo: inv.referenceNo,
        transactionType: 'INVOICE',
        descriptionAr:
          inv.invoiceType === InvoiceType.SIMPLIFIED_TAX_INVOICE
            ? `إصدار فاتورة ضريبية مبسطة (${inv.referenceNo})`
            : `إصدار فاتورة ضريبية قياسية (${inv.referenceNo})`,
        descriptionEn:
          inv.invoiceType === InvoiceType.SIMPLIFIED_TAX_INVOICE
            ? `Simplified Tax Invoice (${inv.referenceNo})`
            : `Standard Tax Invoice (${inv.referenceNo})`,
        currency: curr,
        debit: amt,
        credit: new Decimal(0),
        relatedRef: null,
      });
    }
  }

  for (const pay of payments) {
    const curr = resolveDocCurrency(pay.invoice?.orgSnapshot, defaultCurrency);
    if (curr !== targetCurrency) continue;

    allEvents.push({
      id: pay.id,
      date: pay.paymentDate,
      createdAt: pay.createdAt,
      documentNo: pay.referenceNo || `PAY-${pay.id.slice(0, 6).toUpperCase()}`,
      transactionType: 'PAYMENT',
      descriptionAr: `تحصيل دفعة (${pay.method}) سداداً للفاتورة ${pay.invoice?.referenceNo || ''}`,
      descriptionEn: `Payment received (${pay.method}) for Invoice ${
        pay.invoice?.referenceNo || ''
      }`,
      currency: curr,
      debit: new Decimal(0),
      credit: new Decimal(pay.amount.toString()),
      relatedRef: pay.invoice?.referenceNo || null,
    });
  }

  // Sort chronologically by transaction date, then createdAt
  allEvents.sort((a, b) => {
    const diff = a.date.getTime() - b.date.getTime();
    if (diff !== 0) return diff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const txTypeFilter =
    query.transactionType && query.transactionType !== 'ALL'
      ? query.transactionType.toUpperCase()
      : null;

  // When filtering by a single transactionType (e.g. only PAYMENTS), historical opening balance across all ledger types does not apply to a single-type subset
  const isFilteredByTxType = Boolean(txTypeFilter);

  let openingBalance = new Decimal(0);
  const periodEvents: RawLedgerEvent[] = [];

  for (const ev of allEvents) {
    if (range.dateFrom && ev.date.getTime() < range.dateFrom.getTime()) {
      if (!isFilteredByTxType) {
        openingBalance = openingBalance.add(ev.debit).sub(ev.credit);
      }
      continue;
    }
    if (range.dateTo && ev.date.getTime() > range.dateTo.getTime()) {
      continue;
    }
    if (txTypeFilter && ev.transactionType !== txTypeFilter) {
      continue;
    }
    periodEvents.push(ev);
  }

  let runningBalance = openingBalance;
  let totalDebits = new Decimal(0);
  let totalCredits = new Decimal(0);
  let totalInvoices = new Decimal(0);
  let totalDebitNotes = new Decimal(0);
  let totalCreditNotes = new Decimal(0);
  let totalPayments = new Decimal(0);

  const transactions = periodEvents.map((ev) => {
    totalDebits = totalDebits.add(ev.debit);
    totalCredits = totalCredits.add(ev.credit);
    if (ev.transactionType === 'INVOICE') totalInvoices = totalInvoices.add(ev.debit);
    if (ev.transactionType === 'DEBIT_NOTE') totalDebitNotes = totalDebitNotes.add(ev.debit);
    if (ev.transactionType === 'CREDIT_NOTE') totalCreditNotes = totalCreditNotes.add(ev.credit);
    if (ev.transactionType === 'PAYMENT') totalPayments = totalPayments.add(ev.credit);
    runningBalance = runningBalance.add(ev.debit).sub(ev.credit);

    return {
      id: ev.id,
      date: ev.date.toISOString(),
      documentNo: ev.documentNo,
      type: ev.transactionType,
      transactionType: ev.transactionType,
      descriptionAr: ev.descriptionAr,
      descriptionEn: ev.descriptionEn,
      relatedRef: ev.relatedRef,
      currency: ev.currency,
      debit: Number(roundDecimal(ev.debit, 2)),
      credit: Number(roundDecimal(ev.credit, 2)),
      runningBalance: isFilteredByTxType ? null : Number(roundDecimal(runningBalance, 2)),
    };
  });

  const closingBalance = openingBalance.add(totalDebits).sub(totalCredits);
  const summaryObj = {
    openingBalanceAvailable: !isFilteredByTxType,
    openingBalance: isFilteredByTxType ? null : Number(roundDecimal(openingBalance, 2)),
    totalInvoices: Number(roundDecimal(totalInvoices, 2)),
    totalDebitNotes: Number(roundDecimal(totalDebitNotes, 2)),
    totalCreditNotes: Number(roundDecimal(totalCreditNotes, 2)),
    totalPayments: Number(roundDecimal(totalPayments, 2)),
    totalDebits: Number(roundDecimal(totalDebits, 2)),
    totalCredits: Number(roundDecimal(totalCredits, 2)),
    closingBalance: isFilteredByTxType ? null : Number(roundDecimal(closingBalance, 2)),
  };

  return {
    generatedAt: new Date().toISOString(),
    currency: targetCurrency,
    organization: {
      businessName: orgSettings?.businessName || null,
      businessNameEn: orgSettings?.businessNameEn || null,
      vatNumber: orgSettings?.vatNumber || null,
      commercialReg: orgSettings?.commercialReg || null,
      address: orgSettings?.address || null,
      phone: orgSettings?.phone || null,
      email: orgSettings?.email || null,
      logoUrl: orgSettings?.logoUrl || null,
    },
    client: {
      id: client.id,
      nameAr: client.nameAr,
      nameEn: client.nameEn,
      clientType: client.clientType,
      vatNumber: client.vatNumber,
      phone: client.phone,
      email: client.email,
      address: client.address,
    },
    period: {
      dateFrom: range.dateFrom ? range.dateFrom.toISOString() : null,
      dateTo: range.dateTo ? range.dateTo.toISOString() : null,
    },
    filters: {
      dateFrom: range.dateFrom ? range.dateFrom.toISOString() : null,
      dateTo: range.dateTo ? range.dateTo.toISOString() : null,
      currency: targetCurrency,
      transactionType: txTypeFilter || 'ALL',
    },
    summary: summaryObj,
    openingBalanceAvailable: !isFilteredByTxType,
    openingBalanceNote: isFilteredByTxType
      ? 'الرصيد الافتتاحي ينطبق فقط عند عرض كامل الحركات المالية بدون تصفية نوع الحركة'
      : null,
    openingBalance: isFilteredByTxType ? null : Number(roundDecimal(openingBalance, 2)),
    totalDebits: Number(roundDecimal(totalDebits, 2)),
    totalCredits: Number(roundDecimal(totalCredits, 2)),
    closingBalance: isFilteredByTxType ? null : Number(roundDecimal(closingBalance, 2)),
    reconciled: true,
    transactions,
  };
}

// =============================================================
// 8. SITE & COMPLETED WORK REPORTS (تقارير المواقع والأعمال المنفذة)
// =============================================================

export async function getSitesReport(organizationId: string, query: Record<string, any>) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const defaultCurrency = orgSettings?.defaultCurrency || 'SAR';

  const siteWhere: Prisma.SiteWhereInput = { organizationId };
  if (query.clientId) siteWhere.clientId = String(query.clientId);
  if (query.siteId) siteWhere.id = String(query.siteId);
  const search = (query.search as string)?.trim();
  if (search) {
    siteWhere.OR = [
      { nameAr: { contains: search, mode: 'insensitive' } },
      { nameEn: { contains: search, mode: 'insensitive' } },
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { client: { nameAr: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const workDateCond: Prisma.DateTimeFilter | undefined =
    range.dateFrom || range.dateTo
      ? {
          ...(range.dateFrom && { gte: range.dateFrom }),
          ...(range.dateTo && { lte: range.dateTo }),
        }
      : undefined;

  const sites = await prisma.site.findMany({
    where: siteWhere,
    include: {
      client: { select: { id: true, nameAr: true, nameEn: true } },
      workEntries: {
        where: {
          ...(workDateCond && { workDate: workDateCond }),
          ...(query.workStatus &&
          Object.values(WorkEntryStatus).includes(query.workStatus as WorkEntryStatus)
            ? { status: query.workStatus as WorkEntryStatus }
            : {}),
        },
        include: {
          invoiceLines: {
            include: {
              invoice: {
                include: {
                  payments: true,
                },
              },
            },
          },
        },
        orderBy: { workDate: 'desc' },
      },
      statementSites: {
        include: {
          statement: {
            select: {
              id: true,
              referenceNo: true,
              issueDate: true,
              status: true,
              totalAmount: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Also fetch all approved Credit/Debit notes for the org to compute net invoice values accurately
  const allNotes = await prisma.invoice.findMany({
    where: {
      organizationId,
      status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
      invoiceType: { in: [InvoiceType.CREDIT_NOTE, InvoiceType.DEBIT_NOTE] },
    },
    select: {
      id: true,
      invoiceType: true,
      cancelledById: true,
      totalAmount: true,
    },
  });

  // Check how many sites each invoice spans (so we only attribute payment/outstanding balance directly when an invoice belongs to a single site)
  const invoiceSitesCheck = await prisma.invoiceLine.findMany({
    where: { invoice: { organizationId } },
    select: {
      invoiceId: true,
      workEntry: { select: { siteId: true } },
    },
  });
  const sitesPerInvoice = new Map<string, Set<string>>();
  for (const il of invoiceSitesCheck) {
    if (!il.workEntry?.siteId) continue;
    const set = sitesPerInvoice.get(il.invoiceId) || new Set<string>();
    set.add(il.workEntry.siteId);
    sitesPerInvoice.set(il.invoiceId, set);
  }

  const siteReports = sites.map((site) => {
    let totalRecordedWorkValue = new Decimal(0);
    let totalApprovedWorkValue = new Decimal(0);
    let invoicedWorkValue = new Decimal(0);
    let approvedUninvoicedWorkValue = new Decimal(0);

    let pendingCount = 0;
    let approvedCount = 0;

    const linkedInvoicesMap = new Map<string, any>();

    for (const we of site.workEntries) {
      const qty = new Decimal(we.quantity.toString());
      const billedQty = new Decimal(we.billedQuantity.toString());
      const remQty = Decimal.max(new Decimal(0), qty.sub(billedQty));
      const price = new Decimal(we.unitPrice.toString());
      const totalAmt = new Decimal(we.totalAmount.toString());

      if (we.status !== WorkEntryStatus.REJECTED) {
        totalRecordedWorkValue = totalRecordedWorkValue.add(totalAmt);
      }

      if (we.status === WorkEntryStatus.PENDING_APPROVAL) {
        pendingCount += 1;
      }

      const isApproved =
        we.status === WorkEntryStatus.APPROVED ||
        we.status === WorkEntryStatus.PARTIALLY_BILLED ||
        we.status === WorkEntryStatus.FULLY_BILLED;

      if (isApproved) {
        approvedCount += 1;
        totalApprovedWorkValue = totalApprovedWorkValue.add(totalAmt);
        invoicedWorkValue = invoicedWorkValue.add(roundDecimal(billedQty.mul(price), 4));
        approvedUninvoicedWorkValue = approvedUninvoicedWorkValue.add(
          roundDecimal(remQty.mul(price), 4)
        );
      }

      for (const il of we.invoiceLines) {
        const inv = il.invoice;
        if (
          inv &&
          (inv.status === InvoiceStatus.APPROVED || inv.status === InvoiceStatus.SENT) &&
          (inv.invoiceType === InvoiceType.TAX_INVOICE ||
            inv.invoiceType === InvoiceType.SIMPLIFIED_TAX_INVOICE)
        ) {
          linkedInvoicesMap.set(inv.id, inv);
        }
      }
    }

    let totalIssuedInvoiceValue = new Decimal(0);
    let netInvoiceValue = new Decimal(0);
    let totalActualCollections = new Decimal(0);
    let outstandingBalance = new Decimal(0);
    let hasSharedMultiSiteInvoices = false;

    const invoicesList: any[] = [];
    for (const inv of linkedInvoicesMap.values()) {
      const linkedSiteIds = sitesPerInvoice.get(inv.id);
      const isSingleSiteInvoice = !linkedSiteIds || linkedSiteIds.size <= 1;

      const invGross = new Decimal(inv.totalAmount.toString());
      let invCredit = new Decimal(0);
      let invDebit = new Decimal(0);
      for (const n of allNotes) {
        if (n.cancelledById === inv.id) {
          if (n.invoiceType === InvoiceType.CREDIT_NOTE) invCredit = invCredit.add(n.totalAmount);
          if (n.invoiceType === InvoiceType.DEBIT_NOTE) invDebit = invDebit.add(n.totalAmount);
        }
      }
      const invNet = invGross.sub(invCredit).add(invDebit);

      totalIssuedInvoiceValue = totalIssuedInvoiceValue.add(invGross);
      netInvoiceValue = netInvoiceValue.add(invNet);

      if (isSingleSiteInvoice) {
        totalActualCollections = totalActualCollections.add(inv.paidAmount);
        outstandingBalance = outstandingBalance.add(inv.remainingAmount);
      } else {
        hasSharedMultiSiteInvoices = true;
      }

      invoicesList.push({
        id: inv.id,
        referenceNo: inv.referenceNo,
        issueDate: inv.issueDate,
        status: inv.status,
        paymentStatus: inv.paymentStatus,
        totalAmount: Number(roundDecimal(invGross, 2)),
        netAmount: Number(roundDecimal(invNet, 2)),
        paidAmount: Number(roundDecimal(inv.paidAmount, 2)),
        remainingAmount: Number(roundDecimal(inv.remainingAmount, 2)),
        isSingleSiteInvoice,
      });
    }

    const statementsList = site.statementSites
      .map((ss) => ss.statement)
      .filter((s) => s && s.status !== StatementStatus.CANCELLED);

    const metricsObj = {
      totalRecordedWorkValue: Number(roundDecimal(totalRecordedWorkValue, 2)),
      totalApprovedWorkValue: Number(roundDecimal(totalApprovedWorkValue, 2)),
      invoicedWorkValue: Number(roundDecimal(invoicedWorkValue, 2)),
      approvedUninvoicedWorkValue: Number(roundDecimal(approvedUninvoicedWorkValue, 2)),
      totalIssuedInvoiceValue: Number(roundDecimal(totalIssuedInvoiceValue, 2)),
      netInvoiceValue: Number(roundDecimal(netInvoiceValue, 2)),
      totalActualCollections: Number(roundDecimal(totalActualCollections, 2)),
      actualCollected: Number(roundDecimal(totalActualCollections, 2)),
      outstandingBalance: Number(roundDecimal(outstandingBalance, 2)),
      remainingBalance: Number(roundDecimal(outstandingBalance, 2)),
      collectionsDirectlyAttributable: !hasSharedMultiSiteInvoices,
    };

    return {
      siteId: site.id,
      siteNameAr: site.nameAr,
      clientNameAr: site.client?.nameAr || '',
      hasMultiSiteSharedInvoices: hasSharedMultiSiteInvoices,
      site: {
        id: site.id,
        referenceNo: site.referenceNo,
        nameAr: site.nameAr,
        nameEn: site.nameEn,
        address: site.address,
        status: site.status,
      },
      client: site.client,
      currency: defaultCurrency,
      counts: {
        totalWorkEntries: site.workEntries.length,
        pendingApprovalEntries: pendingCount,
        approvedEntries: approvedCount,
        statementsCount: statementsList.length,
        invoicesCount: invoicesList.length,
      },
      financialSummary: metricsObj,
      metrics: metricsObj,
      workEntries: site.workEntries.map((we) => ({
        id: we.id,
        referenceNo: we.referenceNo,
        workDate: we.workDate,
        itemNameAr: we.itemNameAr,
        unit: we.unit,
        quantity: Number(we.quantity),
        billedQuantity: Number(we.billedQuantity),
        unbilledQuantity: Number(Decimal.max(new Decimal(0), we.quantity.sub(we.billedQuantity))),
        unitPrice: Number(we.unitPrice),
        totalAmount: Number(roundDecimal(we.totalAmount, 2)),
        status: we.status,
      })),
      statements: statementsList,
      invoices: invoicesList,
    };
  });

  // Aggregate across all matching sites
  let sumRecorded = new Decimal(0);
  let sumApproved = new Decimal(0);
  let sumUninvoiced = new Decimal(0);
  let sumIssuedInvoices = new Decimal(0);
  let sumNetInvoices = new Decimal(0);
  let sumCollections = new Decimal(0);
  let sumOutstanding = new Decimal(0);

  for (const sr of siteReports) {
    sumRecorded = sumRecorded.add(sr.financialSummary.totalRecordedWorkValue);
    sumApproved = sumApproved.add(sr.financialSummary.totalApprovedWorkValue);
    sumUninvoiced = sumUninvoiced.add(sr.financialSummary.approvedUninvoicedWorkValue);
    sumIssuedInvoices = sumIssuedInvoices.add(sr.financialSummary.totalIssuedInvoiceValue);
    sumNetInvoices = sumNetInvoices.add(sr.financialSummary.netInvoiceValue);
    sumCollections = sumCollections.add(sr.financialSummary.totalActualCollections);
    sumOutstanding = sumOutstanding.add(sr.financialSummary.outstandingBalance);
  }

  return {
    items: siteReports,
    total: siteReports.length,
    summary: {
      currency: defaultCurrency,
      sitesCount: siteReports.length,
      totalRecordedWorkValue: Number(roundDecimal(sumRecorded, 2)),
      totalApprovedWorkValue: Number(roundDecimal(sumApproved, 2)),
      approvedUninvoicedWorkValue: Number(roundDecimal(sumUninvoiced, 2)),
      totalApprovedUninvoicedWorkValue: Number(roundDecimal(sumUninvoiced, 2)),
      totalIssuedInvoiceValue: Number(roundDecimal(sumIssuedInvoices, 2)),
      netInvoiceValue: Number(roundDecimal(sumNetInvoices, 2)),
      totalNetInvoiceValue: Number(roundDecimal(sumNetInvoices, 2)),
      totalActualCollections: Number(roundDecimal(sumCollections, 2)),
      totalCollected: Number(roundDecimal(sumCollections, 2)),
      outstandingBalance: Number(roundDecimal(sumOutstanding, 2)),
    },
  };
}

// =============================================================
// 9. ACCOUNTS RECEIVABLE AGING REPORT (تقرير أعمار الديون)
// =============================================================

export async function getAgingReport(organizationId: string, query: Record<string, any>) {
  const orgSettings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  const defaultCurrency = orgSettings?.defaultCurrency || 'SAR';
  const filterCurrency = query.currency ? String(query.currency).trim().toUpperCase() : null;

  let asOfDate = new Date();
  if (query.asOfDate) {
    const parsed = new Date(String(query.asOfDate));
    if (isNaN(parsed.getTime())) {
      throw new ValidationError(`Invalid asOfDate: ${query.asOfDate}`);
    }
    asOfDate = parsed;
  }

  const where: Prisma.InvoiceWhereInput = {
    organizationId,
    status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
    invoiceType: { in: [InvoiceType.TAX_INVOICE, InvoiceType.SIMPLIFIED_TAX_INVOICE] },
    remainingAmount: { gt: new Decimal(0) },
  };

  if (query.clientId) where.clientId = String(query.clientId);
  if (query.siteId) {
    const siteIdStr = String(query.siteId);
    where.OR = [
      { lines: { some: { workEntry: { siteId: siteIdStr } } } },
      { statement: { sites: { some: { siteId: siteIdStr } } } },
    ];
  }
  const search = (query.search as string)?.trim();
  if (search) {
    where.AND = [
      {
        OR: [
          { referenceNo: { contains: search, mode: 'insensitive' } },
          { client: { nameAr: { contains: search, mode: 'insensitive' } } },
          { client: { nameEn: { contains: search, mode: 'insensitive' } } },
        ],
      },
    ];
  }

  // Query each eligible invoice ONCE (never joining payments in a way that duplicates rows!)
  const openInvoices = await prisma.invoice.findMany({
    where,
    include: {
      client: { select: { id: true, nameAr: true, nameEn: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
  });

  const rows: Array<{
    id: string;
    invoiceId: string;
    referenceNo: string;
    client: { id: string; nameAr: string; nameEn: string | null };
    clientNameAr: string;
    issueDate: Date;
    dueDate: Date | null;
    currency: string;
    totalAmount: number;
    netAmount: number;
    paidAmount: number;
    remainingAmount: number;
    outstandingBalance: number;
    overdueDays: number | null;
    bucket: AgingBucketKey;
  }> = [];

  const createEmptyBuckets = (currency: string) => ({
    currency,
    NOT_DUE: { count: 0, amount: 0 },
    OVERDUE_1_30: { count: 0, amount: 0 },
    OVERDUE_31_60: { count: 0, amount: 0 },
    OVERDUE_61_90: { count: 0, amount: 0 },
    OVERDUE_90_PLUS: { count: 0, amount: 0 },
    UNCLASSIFIED: { count: 0, amount: 0 },
    totalOutstanding: 0,
    invoicesCount: 0,
  });

  const byCurrency: Record<string, ReturnType<typeof createEmptyBuckets>> = {};
  const targetCurrency = filterCurrency || defaultCurrency;
  const bucketFilter = query.bucket ? String(query.bucket).trim().toUpperCase() : null;

  for (const inv of openInvoices) {
    const currency = resolveDocCurrency(inv.orgSnapshot, defaultCurrency);
    if (currency !== targetCurrency) continue;

    // Never substitute issueDate if dueDate is missing!
    const overdueDays = calculateOverdueDays(inv.dueDate, asOfDate);
    const bucket = classifyAgingBucket(overdueDays);
    if (bucketFilter && bucket !== bucketFilter) continue;

    const rem = Number(roundDecimal(inv.remainingAmount, 2));
    const paid = Number(roundDecimal(inv.paidAmount, 2));

    rows.push({
      id: inv.id,
      invoiceId: inv.id,
      referenceNo: inv.referenceNo,
      client: inv.client,
      clientNameAr: inv.client?.nameAr || '',
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currency,
      totalAmount: Number(roundDecimal(inv.totalAmount, 2)),
      netAmount: Number(roundDecimal(new Decimal(rem).add(paid), 2)),
      paidAmount: paid,
      remainingAmount: rem,
      outstandingBalance: rem,
      overdueDays: overdueDays !== null && overdueDays > 0 ? overdueDays : overdueDays,
      bucket,
    });

    if (!byCurrency[currency]) {
      byCurrency[currency] = createEmptyBuckets(currency);
    }
    const b = byCurrency[currency];
    b[bucket].count += 1;
    b[bucket].amount = Number(roundDecimal(new Decimal(b[bucket].amount).add(rem), 2));
    b.totalOutstanding = Number(roundDecimal(new Decimal(b.totalOutstanding).add(rem), 2));
    b.invoicesCount += 1;
  }

  const primary = byCurrency[targetCurrency] ||
    Object.values(byCurrency)[0] ||
    createEmptyBuckets(targetCurrency);

  return {
    asOfDate: asOfDate.toISOString(),
    currency: targetCurrency,
    items: rows,
    total: rows.length,
    buckets: primary,
    summary: {
      currency: targetCurrency,
      totalOutstanding: primary.totalOutstanding,
      invoicesCount: primary.invoicesCount,
    },
    byCurrency: Object.values(byCurrency),
  };
}
