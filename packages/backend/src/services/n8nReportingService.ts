import { Decimal } from '@prisma/client/runtime/library';
import {
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  StatementStatus,
  WorkEntryStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { resolvePeriodRange, PeriodPreset } from './reportingService';
import { roundDecimal } from '../utils/finance';
import { ValidationError } from '../middleware/errorHandler';

interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function parsePagination(query: PaginationQuery, defaultLimit = 50, maxLimit = 100): { skip: number; take: number; page: number; limit: number } {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const rawLimit = parseInt(String(query.limit || defaultLimit), 10) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);
  const skip = (page - 1) * limit;
  return { skip, take: limit, page, limit };
}

function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * 1. WEEKLY FINANCIAL SUMMARY
 * Computes weekly financial KPIs for revenue, collections, and approved works.
 *
 * Date range resolution (in priority order):
 *   1. Explicit range: startDate + endDate  → use the supplied boundaries directly.
 *   2. Reference date: weekDate             → calculate the Mon–Sun week that contains it.
 *   3. Default                              → calculate the Mon–Sun week that contains today.
 */
export async function getWeeklyFinancialSummary(
  organizationId: string,
  query: {
    startDate?: string;
    endDate?: string;
    weekDate?: string;
    currency?: string;
  }
) {
  let monday: Date;
  let sunday: Date;

  if (query.startDate || query.endDate) {
    // Explicit date range mode — both boundaries are required together
    if (!query.startDate || !query.endDate) {
      throw new ValidationError('Both startDate and endDate are required when using an explicit date range');
    }

    const parsedStart = new Date(query.startDate);
    const parsedEnd   = new Date(query.endDate);

    if (isNaN(parsedStart.getTime())) {
      throw new ValidationError('Invalid startDate parameter: must be a valid ISO date (YYYY-MM-DD)');
    }
    if (isNaN(parsedEnd.getTime())) {
      throw new ValidationError('Invalid endDate parameter: must be a valid ISO date (YYYY-MM-DD)');
    }
    if (parsedStart > parsedEnd) {
      throw new ValidationError('startDate must be on or before endDate');
    }

    // Normalise to full UTC days so time component of the input string is irrelevant
    monday = new Date(Date.UTC(parsedStart.getUTCFullYear(), parsedStart.getUTCMonth(), parsedStart.getUTCDate(), 0, 0, 0, 0));
    sunday = new Date(Date.UTC(parsedEnd.getUTCFullYear(),   parsedEnd.getUTCMonth(),   parsedEnd.getUTCDate(),   23, 59, 59, 999));
  } else {
    // Reference-date / default mode — calculate Mon–Sun of the given (or current) week
    const refDate = query.weekDate ? new Date(query.weekDate) : new Date();
    if (isNaN(refDate.getTime())) {
      throw new ValidationError('Invalid weekDate parameter: must be a valid ISO date (YYYY-MM-DD)');
    }

    const day = refDate.getUTCDay(); // 0 = Sunday, 1 = Monday
    const diffToMonday = day === 0 ? -6 : 1 - day;
    monday = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate() + diffToMonday, 0, 0, 0, 0));
    sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6, 23, 59, 59, 999));
  }

  // Calculate the equivalent prior period of the same length for trend comparison
  const periodLengthMs = sunday.getTime() - monday.getTime() + 1;
  const priorMonday = new Date(monday.getTime() - periodLengthMs);
  const priorSunday = new Date(sunday.getTime() - periodLengthMs);

  const orgSettings = await prisma.orgSettings.findUnique({
    where: { organizationId },
    select: { defaultCurrency: true, vatRate: true },
  });
  const currency = query.currency?.trim().toUpperCase() || orgSettings?.defaultCurrency || 'SAR';

  // Execute parallel queries for the current week and prior week
  const [
    currentInvoices,
    priorInvoices,
    currentPayments,
    priorPayments,
    currentApprovedWorks,
    priorApprovedWorks,
    activeReceivables,
    statementsIssued,
  ] = await Promise.all([
    // Current week approved/sent invoices
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
        issueDate: { gte: monday, lte: sunday },
      },
      select: {
        id: true,
        referenceNo: true,
        invoiceType: true,
        subtotal: true,
        vatAmount: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        paymentStatus: true,
        issueDate: true,
      },
    }),
    // Prior week invoices for trend comparison
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
        issueDate: { gte: priorMonday, lte: priorSunday },
      },
      select: { totalAmount: true, invoiceType: true },
    }),
    // Current week confirmed payments
    prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: { gte: monday, lte: sunday },
      },
      select: { id: true, amount: true, method: true, paymentDate: true },
    }),
    // Prior week payments
    prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: { gte: priorMonday, lte: priorSunday },
      },
      select: { amount: true },
    }),
    // Current week approved work entries
    prisma.workEntry.findMany({
      where: {
        organizationId,
        status: { in: [WorkEntryStatus.APPROVED, WorkEntryStatus.PARTIALLY_BILLED, WorkEntryStatus.FULLY_BILLED] },
        workDate: { gte: monday, lte: sunday },
      },
      select: { quantity: true, unitPrice: true },
    }),
    // Prior week approved work entries
    prisma.workEntry.findMany({
      where: {
        organizationId,
        status: { in: [WorkEntryStatus.APPROVED, WorkEntryStatus.PARTIALLY_BILLED, WorkEntryStatus.FULLY_BILLED] },
        workDate: { gte: priorMonday, lte: priorSunday },
      },
      select: { quantity: true, unitPrice: true },
    }),
    // Active outstanding receivables (point in time)
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
        remainingAmount: { gt: 0 },
      },
      select: { remainingAmount: true },
    }),
    // Statements issued in week (strictly tracked separately, never added to invoice revenue)
    prisma.statement.findMany({
      where: {
        organizationId,
        status: { in: [StatementStatus.APPROVED, StatementStatus.INVOICED] },
        issueDate: { gte: monday, lte: sunday },
      },
      select: { id: true, totalAmount: true },
    }),
  ]);

  // Aggregate current week invoices
  let invoicedTaxable = new Decimal(0);
  let invoicedVat = new Decimal(0);
  let netInvoicedTotal = new Decimal(0);

  for (const inv of currentInvoices) {
    if (inv.invoiceType === InvoiceType.CREDIT_NOTE) {
      invoicedTaxable = invoicedTaxable.sub(inv.subtotal);
      invoicedVat = invoicedVat.sub(inv.vatAmount);
      netInvoicedTotal = netInvoicedTotal.sub(inv.totalAmount);
    } else {
      invoicedTaxable = invoicedTaxable.add(inv.subtotal);
      invoicedVat = invoicedVat.add(inv.vatAmount);
      netInvoicedTotal = netInvoicedTotal.add(inv.totalAmount);
    }
  }

  // Aggregate prior week invoices
  let priorInvoicedTotal = new Decimal(0);
  for (const inv of priorInvoices) {
    if (inv.invoiceType === InvoiceType.CREDIT_NOTE) {
      priorInvoicedTotal = priorInvoicedTotal.sub(inv.totalAmount);
    } else {
      priorInvoicedTotal = priorInvoicedTotal.add(inv.totalAmount);
    }
  }

  // Aggregate payments
  let collectionsTotal = new Decimal(0);
  for (const p of currentPayments) {
    collectionsTotal = collectionsTotal.add(p.amount);
  }

  let priorCollectionsTotal = new Decimal(0);
  for (const p of priorPayments) {
    priorCollectionsTotal = priorCollectionsTotal.add(p.amount);
  }

  // Aggregate approved work entries value
  let approvedWorksValue = new Decimal(0);
  for (const w of currentApprovedWorks) {
    approvedWorksValue = approvedWorksValue.add(w.quantity.mul(w.unitPrice));
  }

  let priorApprovedWorksValue = new Decimal(0);
  for (const w of priorApprovedWorks) {
    priorApprovedWorksValue = priorApprovedWorksValue.add(w.quantity.mul(w.unitPrice));
  }

  // Outstanding receivables sum
  let totalReceivables = new Decimal(0);
  for (const r of activeReceivables) {
    totalReceivables = totalReceivables.add(r.remainingAmount);
  }

  // Statements total sum
  let statementsTotal = new Decimal(0);
  for (const s of statementsIssued) {
    statementsTotal = statementsTotal.add(s.totalAmount);
  }

  const calcGrowth = (curr: Decimal, prior: Decimal) => {
    if (prior.eq(0)) return curr.gt(0) ? 100 : 0;
    return Number(roundDecimal(curr.sub(prior).div(prior).mul(100), 2));
  };

  return {
    weekRange: {
      startDate: monday.toISOString().slice(0, 10),
      endDate: sunday.toISOString().slice(0, 10),
    },
    currency,
    financials: {
      netInvoicedRevenue: Number(roundDecimal(netInvoicedTotal, 2)),
      invoicedTaxableSubtotal: Number(roundDecimal(invoicedTaxable, 2)),
      invoicedVatAmount: Number(roundDecimal(invoicedVat, 2)),
      invoicesCount: currentInvoices.length,
      collectionsTotal: Number(roundDecimal(collectionsTotal, 2)),
      paymentsCount: currentPayments.length,
      totalOutstandingReceivables: Number(roundDecimal(totalReceivables, 2)),
      approvedWorksValue: Number(roundDecimal(approvedWorksValue, 2)),
      approvedWorksCount: currentApprovedWorks.length,
      statementsIssuedValue: Number(roundDecimal(statementsTotal, 2)),
      statementsIssuedCount: statementsIssued.length,
    },
    trendsComparedToPriorWeek: {
      invoicedGrowthPercent: calcGrowth(netInvoicedTotal, priorInvoicedTotal),
      collectionsGrowthPercent: calcGrowth(collectionsTotal, priorCollectionsTotal),
      approvedWorksGrowthPercent: calcGrowth(approvedWorksValue, priorApprovedWorksValue),
    },
  };
}

/**
 * 2. MONTHLY FINANCIAL SUMMARY
 * Computes monthly financial KPIs, collection efficiency rate, and status breakdown.
 */
export async function getMonthlyFinancialSummary(
  organizationId: string,
  query: {
    month?: string; // YYYY-MM
    currency?: string;
  }
) {
  let dateFrom: Date;
  let dateTo: Date;

  if (query.month && /^\d{4}-\d{2}$/.test(query.month.trim())) {
    const [y, m] = query.month.trim().split('-').map(Number);
    dateFrom = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    dateTo = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  } else {
    const now = new Date();
    dateFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    dateTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  }

  const orgSettings = await prisma.orgSettings.findUnique({
    where: { organizationId },
    select: { defaultCurrency: true, vatRate: true },
  });
  const currency = query.currency?.trim().toUpperCase() || orgSettings?.defaultCurrency || 'SAR';

  const [
    monthInvoices,
    monthPayments,
    monthApprovedWorks,
    activeClientsCount,
    activeSitesCount,
    allActiveReceivables,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
        issueDate: { gte: dateFrom, lte: dateTo },
      },
      select: {
        id: true,
        referenceNo: true,
        invoiceType: true,
        subtotal: true,
        vatAmount: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        paymentStatus: true,
        dueDate: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: { gte: dateFrom, lte: dateTo },
      },
      select: { amount: true, method: true },
    }),
    prisma.workEntry.findMany({
      where: {
        organizationId,
        status: { in: [WorkEntryStatus.APPROVED, WorkEntryStatus.PARTIALLY_BILLED, WorkEntryStatus.FULLY_BILLED] },
        workDate: { gte: dateFrom, lte: dateTo },
      },
      select: { quantity: true, unitPrice: true },
    }),
    prisma.client.count({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.site.count({ where: { organizationId, status: 'ACTIVE' } }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
        remainingAmount: { gt: 0 },
      },
      select: { remainingAmount: true, dueDate: true },
    }),
  ]);

  let grossInvoiceValue = new Decimal(0);
  let netTaxableSubtotal = new Decimal(0);
  let netVatAmount = new Decimal(0);
  let netInvoiceRevenue = new Decimal(0);

  const statusCounts: Record<string, { count: number; totalAmount: number }> = {
    PAID: { count: 0, totalAmount: 0 },
    PARTIALLY_PAID: { count: 0, totalAmount: 0 },
    UNPAID: { count: 0, totalAmount: 0 },
    OVERDUE: { count: 0, totalAmount: 0 },
  };

  const now = new Date();
  for (const inv of monthInvoices) {
    const isCreditNote = inv.invoiceType === InvoiceType.CREDIT_NOTE;
    const sign = isCreditNote ? -1 : 1;

    if (!isCreditNote) {
      grossInvoiceValue = grossInvoiceValue.add(inv.totalAmount);
    }
    netTaxableSubtotal = netTaxableSubtotal.add(inv.subtotal.mul(sign));
    netVatAmount = netVatAmount.add(inv.vatAmount.mul(sign));
    netInvoiceRevenue = netInvoiceRevenue.add(inv.totalAmount.mul(sign));

    // Determine payment status bucket
    const isOverdue = inv.remainingAmount.gt(0) && inv.dueDate && new Date(inv.dueDate) < now;
    const bucket = isOverdue ? 'OVERDUE' : (inv.paymentStatus as string);
    if (statusCounts[bucket]) {
      statusCounts[bucket].count += 1;
      statusCounts[bucket].totalAmount += Number(inv.totalAmount);
    }
  }

  let collectionsTotal = new Decimal(0);
  for (const p of monthPayments) {
    collectionsTotal = collectionsTotal.add(p.amount);
  }

  let approvedWorksValue = new Decimal(0);
  for (const w of monthApprovedWorks) {
    approvedWorksValue = approvedWorksValue.add(w.quantity.mul(w.unitPrice));
  }

  let totalActiveReceivables = new Decimal(0);
  let totalOverdueReceivables = new Decimal(0);
  for (const r of allActiveReceivables) {
    totalActiveReceivables = totalActiveReceivables.add(r.remainingAmount);
    if (r.dueDate && new Date(r.dueDate) < now) {
      totalOverdueReceivables = totalOverdueReceivables.add(r.remainingAmount);
    }
  }

  const collectionEfficiencyRate = netInvoiceRevenue.gt(0)
    ? Number(roundDecimal(collectionsTotal.div(netInvoiceRevenue).mul(100), 2))
    : 0;

  return {
    month: dateFrom.toISOString().slice(0, 7),
    monthRange: {
      startDate: dateFrom.toISOString().slice(0, 10),
      endDate: dateTo.toISOString().slice(0, 10),
    },
    currency,
    financials: {
      netInvoicedRevenue: Number(roundDecimal(netInvoiceRevenue, 2)),
      grossInvoiceValue: Number(roundDecimal(grossInvoiceValue, 2)),
      taxableSubtotal: Number(roundDecimal(netTaxableSubtotal, 2)),
      vatAmount: Number(roundDecimal(netVatAmount, 2)),
      invoicesCount: monthInvoices.length,
      collectionsTotal: Number(roundDecimal(collectionsTotal, 2)),
      paymentsCount: monthPayments.length,
      collectionEfficiencyRatePercent: collectionEfficiencyRate,
      approvedWorksValue: Number(roundDecimal(approvedWorksValue, 2)),
      totalOutstandingReceivables: Number(roundDecimal(totalActiveReceivables, 2)),
      totalOverdueReceivables: Number(roundDecimal(totalOverdueReceivables, 2)),
    },
    operationalMetrics: {
      activeClientsCount,
      activeSitesCount,
    },
    invoicesByStatus: statusCounts,
  };
}

/**
 * 3. INVOICE TOTALS AND STATUSES
 * Detailed breakdown of invoices grouped by lifecycle status and payment status.
 */
export async function getInvoiceTotalsAndStatuses(
  organizationId: string,
  query: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    currency?: string;
  }
) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const orgSettings = await prisma.orgSettings.findUnique({
    where: { organizationId },
    select: { defaultCurrency: true },
  });
  const currency = query.currency?.trim().toUpperCase() || orgSettings?.defaultCurrency || 'SAR';

  const dateFilter: Prisma.DateTimeFilter | undefined =
    range.dateFrom || range.dateTo
      ? {
          ...(range.dateFrom && { gte: range.dateFrom }),
          ...(range.dateTo && { lte: range.dateTo }),
        }
      : undefined;

  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      ...(dateFilter && { issueDate: dateFilter }),
    },
    select: {
      id: true,
      referenceNo: true,
      invoiceType: true,
      status: true,
      paymentStatus: true,
      subtotal: true,
      vatAmount: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      dueDate: true,
    },
  });

  const now = new Date();
  const byLifecycleStatus: Record<string, { count: number; totalAmount: number; subtotal: number; vat: number }> = {
    APPROVED: { count: 0, totalAmount: 0, subtotal: 0, vat: 0 },
    SENT: { count: 0, totalAmount: 0, subtotal: 0, vat: 0 },
    DRAFT: { count: 0, totalAmount: 0, subtotal: 0, vat: 0 },
    CANCELLED: { count: 0, totalAmount: 0, subtotal: 0, vat: 0 },
  };

  const byPaymentStatus: Record<string, { count: number; totalAmount: number; remainingAmount: number }> = {
    PAID: { count: 0, totalAmount: 0, remainingAmount: 0 },
    PARTIALLY_PAID: { count: 0, totalAmount: 0, remainingAmount: 0 },
    UNPAID: { count: 0, totalAmount: 0, remainingAmount: 0 },
    OVERDUE: { count: 0, totalAmount: 0, remainingAmount: 0 },
  };

  let recognizedNetRevenue = new Decimal(0);
  let totalRemainingBalance = new Decimal(0);

  for (const inv of invoices) {
    const isApprovedOrSent = inv.status === InvoiceStatus.APPROVED || inv.status === InvoiceStatus.SENT;
    const isCreditNote = inv.invoiceType === InvoiceType.CREDIT_NOTE;
    const sign = isCreditNote ? -1 : 1;

    // Track lifecycle
    if (byLifecycleStatus[inv.status]) {
      byLifecycleStatus[inv.status].count += 1;
      byLifecycleStatus[inv.status].totalAmount += Number(inv.totalAmount) * sign;
      byLifecycleStatus[inv.status].subtotal += Number(inv.subtotal) * sign;
      byLifecycleStatus[inv.status].vat += Number(inv.vatAmount) * sign;
    }

    // Only APPROVED or SENT invoices contribute to recognized revenue and active balances
    if (isApprovedOrSent) {
      recognizedNetRevenue = recognizedNetRevenue.add(inv.totalAmount.mul(sign));
      totalRemainingBalance = totalRemainingBalance.add(inv.remainingAmount);

      const isOverdue = inv.remainingAmount.gt(0) && inv.dueDate && new Date(inv.dueDate) < now;
      const pStatus = isOverdue ? 'OVERDUE' : (inv.paymentStatus as string);
      if (byPaymentStatus[pStatus]) {
        byPaymentStatus[pStatus].count += 1;
        byPaymentStatus[pStatus].totalAmount += Number(inv.totalAmount);
        byPaymentStatus[pStatus].remainingAmount += Number(inv.remainingAmount);
      }
    }
  }

  return {
    period: range.period,
    dateRange: {
      dateFrom: range.dateFrom ? range.dateFrom.toISOString() : null,
      dateTo: range.dateTo ? range.dateTo.toISOString() : null,
    },
    currency,
    summary: {
      totalInvoicesCount: invoices.length,
      recognizedRevenueInvoicesCount: byLifecycleStatus.APPROVED.count + byLifecycleStatus.SENT.count,
      recognizedNetRevenue: Number(roundDecimal(recognizedNetRevenue, 2)),
      totalRemainingBalance: Number(roundDecimal(totalRemainingBalance, 2)),
    },
    byLifecycleStatus,
    byPaymentStatus,
  };
}

/**
 * 4. CONFIRMED PAYMENT COLLECTIONS
 * Filterable, paginated collections with payment method analysis.
 */
export async function getConfirmedPaymentCollections(
  organizationId: string,
  query: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    clientId?: string;
    paymentMethod?: string;
  } & PaginationQuery
) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const { skip, take, page, limit } = parsePagination(query);

  const whereClause: Prisma.PaymentWhereInput = {
    organizationId,
    ...(query.clientId && { clientId: query.clientId.trim() }),
    ...(query.paymentMethod && { method: query.paymentMethod.trim() as PaymentMethod }),
    ...(range.dateFrom || range.dateTo
      ? {
          paymentDate: {
            ...(range.dateFrom && { gte: range.dateFrom }),
            ...(range.dateTo && { lte: range.dateTo }),
          },
        }
      : {}),
  };

  const [totalCount, payments, methodAggregations] = await Promise.all([
    prisma.payment.count({ where: whereClause }),
    prisma.payment.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            clientType: true,
          },
        },
        invoice: {
          select: {
            id: true,
            referenceNo: true,
            totalAmount: true,
            paymentStatus: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
      skip,
      take,
    }),
    prisma.payment.groupBy({
      by: ['method'],
      where: whereClause,
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const byPaymentMethod: Record<string, { count: number; totalAmount: number }> = {};
  let totalCollected = new Decimal(0);

  for (const agg of methodAggregations) {
    const sum = agg._sum?.amount || new Decimal(0);
    totalCollected = totalCollected.add(sum);
    byPaymentMethod[agg.method] = {
      count: agg._count?._all || 0,
      totalAmount: Number(roundDecimal(sum, 2)),
    };
  }

  const sanitizedPayments = payments.map((p) => ({
    id: p.id,
    referenceNo: p.referenceNo,
    amount: Number(roundDecimal(p.amount, 2)),
    paymentDate: p.paymentDate.toISOString().slice(0, 10),
    paymentMethod: p.method,
    chequeNumber: p.chequeNumber,
    notes: p.notes,
    client: p.client,
    invoice: p.invoice,
    createdAt: p.createdAt.toISOString(),
  }));

  return {
    summary: {
      totalCollected: Number(roundDecimal(totalCollected, 2)),
      collectionsCount: totalCount,
      byPaymentMethod,
    },
    pagination: buildPaginationMeta(totalCount, page, limit),
    collections: sanitizedPayments,
  };
}

/**
 * 5. OUTSTANDING RECEIVABLES
 * Invoices with unpaid balances and comprehensive aging buckets (0-30, 31-60, 61-90, 90+ days).
 */
export async function getOutstandingReceivables(
  organizationId: string,
  query: {
    clientId?: string;
  } & PaginationQuery
) {
  const { skip, take, page, limit } = parsePagination(query);

  const whereClause: Prisma.InvoiceWhereInput = {
    organizationId,
    status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] },
    remainingAmount: { gt: 0 },
    invoiceType: { in: [InvoiceType.TAX_INVOICE, InvoiceType.SIMPLIFIED_TAX_INVOICE] },
    ...(query.clientId && { clientId: query.clientId.trim() }),
  };

  const [totalCount, receivableInvoices] = await Promise.all([
    prisma.invoice.count({ where: whereClause }),
    prisma.invoice.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            phone: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      skip,
      take,
    }),
  ]);

  const now = new Date();
  const agingBuckets = {
    current: { label: 'Current / Not Due', count: 0, totalAmount: new Decimal(0) },
    days1to30: { label: '1 - 30 Days Overdue', count: 0, totalAmount: new Decimal(0) },
    days31to60: { label: '31 - 60 Days Overdue', count: 0, totalAmount: new Decimal(0) },
    days61to90: { label: '61 - 90 Days Overdue', count: 0, totalAmount: new Decimal(0) },
    days90Plus: { label: '90+ Days Overdue', count: 0, totalAmount: new Decimal(0) },
  };

  let totalOutstanding = new Decimal(0);
  let totalOverdue = new Decimal(0);

  const items = receivableInvoices.map((inv) => {
    const rem = inv.remainingAmount;
    totalOutstanding = totalOutstanding.add(rem);

    let daysOverdue = 0;
    let isOverdue = false;
    if (inv.dueDate) {
      const diffMs = now.getTime() - new Date(inv.dueDate).getTime();
      daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (daysOverdue > 0) {
        isOverdue = true;
        totalOverdue = totalOverdue.add(rem);
      }
    }

    if (!isOverdue || daysOverdue <= 0) {
      agingBuckets.current.count += 1;
      agingBuckets.current.totalAmount = agingBuckets.current.totalAmount.add(rem);
    } else if (daysOverdue <= 30) {
      agingBuckets.days1to30.count += 1;
      agingBuckets.days1to30.totalAmount = agingBuckets.days1to30.totalAmount.add(rem);
    } else if (daysOverdue <= 60) {
      agingBuckets.days31to60.count += 1;
      agingBuckets.days31to60.totalAmount = agingBuckets.days31to60.totalAmount.add(rem);
    } else if (daysOverdue <= 90) {
      agingBuckets.days61to90.count += 1;
      agingBuckets.days61to90.totalAmount = agingBuckets.days61to90.totalAmount.add(rem);
    } else {
      agingBuckets.days90Plus.count += 1;
      agingBuckets.days90Plus.totalAmount = agingBuckets.days90Plus.totalAmount.add(rem);
    }

    return {
      id: inv.id,
      referenceNo: inv.referenceNo,
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
      totalAmount: Number(roundDecimal(inv.totalAmount, 2)),
      paidAmount: Number(roundDecimal(inv.paidAmount, 2)),
      remainingAmount: Number(roundDecimal(inv.remainingAmount, 2)),
      paymentStatus: inv.paymentStatus,
      daysOverdue: Math.max(0, daysOverdue),
      isOverdue,
      client: inv.client,
    };
  });

  return {
    summary: {
      totalReceivablesCount: totalCount,
      totalOutstandingAmount: Number(roundDecimal(totalOutstanding, 2)),
      totalOverdueAmount: Number(roundDecimal(totalOverdue, 2)),
      agingAnalysis: {
        current: { count: agingBuckets.current.count, amount: Number(roundDecimal(agingBuckets.current.totalAmount, 2)) },
        days1to30: { count: agingBuckets.days1to30.count, amount: Number(roundDecimal(agingBuckets.days1to30.totalAmount, 2)) },
        days31to60: { count: agingBuckets.days31to60.count, amount: Number(roundDecimal(agingBuckets.days31to60.totalAmount, 2)) },
        days61to90: { count: agingBuckets.days61to90.count, amount: Number(roundDecimal(agingBuckets.days61to90.totalAmount, 2)) },
        days90Plus: { count: agingBuckets.days90Plus.count, amount: Number(roundDecimal(agingBuckets.days90Plus.totalAmount, 2)) },
      },
    },
    pagination: buildPaginationMeta(totalCount, page, limit),
    receivables: items,
  };
}

/**
 * 6. CLIENT FINANCIAL SUMMARIES
 * Aggregated revenue, collections, outstanding balances, and active sites per client.
 */
export async function getClientFinancialSummaries(
  organizationId: string,
  query: {
    search?: string;
  } & PaginationQuery
) {
  const { skip, take, page, limit } = parsePagination(query);

  const whereClause: Prisma.ClientWhereInput = {
    organizationId,
    status: 'ACTIVE',
    ...(query.search && {
      OR: [
        { nameAr: { contains: query.search.trim(), mode: 'insensitive' } },
        { nameEn: { contains: query.search.trim(), mode: 'insensitive' } },
        { vatNumber: { contains: query.search.trim() } },
        { phone: { contains: query.search.trim() } },
      ],
    }),
  };

  const [totalCount, clients] = await Promise.all([
    prisma.client.count({ where: whereClause }),
    prisma.client.findMany({
      where: whereClause,
      include: {
        sites: {
          select: { id: true, status: true },
        },
        invoices: {
          where: { status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] } },
          select: {
            totalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            invoiceType: true,
            dueDate: true,
          },
        },
        payments: {
          select: { amount: true, paymentDate: true },
          orderBy: { paymentDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { nameAr: 'asc' },
      skip,
      take,
    }),
  ]);

  const now = new Date();
  const clientSummaries = clients.map((c) => {
    let totalBilled = new Decimal(0);
    let totalOutstanding = new Decimal(0);
    let totalOverdue = new Decimal(0);

    for (const inv of c.invoices) {
      const isCredit = inv.invoiceType === InvoiceType.CREDIT_NOTE;
      const sign = isCredit ? -1 : 1;
      totalBilled = totalBilled.add(inv.totalAmount.mul(sign));
      totalOutstanding = totalOutstanding.add(inv.remainingAmount);
      if (inv.remainingAmount.gt(0) && inv.dueDate && new Date(inv.dueDate) < now) {
        totalOverdue = totalOverdue.add(inv.remainingAmount);
      }
    }

    const activeSites = c.sites.filter((s) => s.status === 'ACTIVE').length;
    const lastPayment = c.payments[0] ? c.payments[0].paymentDate.toISOString().slice(0, 10) : null;

    return {
      id: c.id,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      clientType: c.clientType,
      vatNumber: c.vatNumber,
      phone: c.phone,
      email: c.email,
      activeSitesCount: activeSites,
      totalSitesCount: c.sites.length,
      financials: {
        totalBilled: Number(roundDecimal(totalBilled, 2)),
        totalOutstanding: Number(roundDecimal(totalOutstanding, 2)),
        totalOverdue: Number(roundDecimal(totalOverdue, 2)),
        lastPaymentDate: lastPayment,
      },
    };
  });

  return {
    pagination: buildPaginationMeta(totalCount, page, limit),
    clients: clientSummaries,
  };
}

/**
 * 7. SITE OPERATIONAL PERFORMANCE
 * Operational execution metrics, unbilled approved value, billed totals, and completion rates.
 */
export async function getSiteOperationalPerformance(
  organizationId: string,
  query: {
    clientId?: string;
    status?: string;
  } & PaginationQuery
) {
  const { skip, take, page, limit } = parsePagination(query);

  const whereClause: Prisma.SiteWhereInput = {
    organizationId,
    ...(query.clientId && { clientId: query.clientId.trim() }),
    ...(query.status && { status: query.status.trim() as any }),
  };

  const [totalCount, sites] = await Promise.all([
    prisma.site.count({ where: whereClause }),
    prisma.site.findMany({
      where: whereClause,
      include: {
        client: {
          select: { id: true, nameAr: true, nameEn: true },
        },
        workEntries: {
          select: {
            status: true,
            quantity: true,
            billedQuantity: true,
            unitPrice: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const performance = sites.map((s) => {
    let totalWorkCount = 0;
    let approvedCount = 0;
    let totalApprovedValue = new Decimal(0);
    let unbilledApprovedValue = new Decimal(0);
    let billedValue = new Decimal(0);

    for (const w of s.workEntries) {
      totalWorkCount += 1;
      const isApproved =
        w.status === WorkEntryStatus.APPROVED ||
        w.status === WorkEntryStatus.PARTIALLY_BILLED ||
        w.status === WorkEntryStatus.FULLY_BILLED;

      if (isApproved) {
        approvedCount += 1;
        const totalVal = w.quantity.mul(w.unitPrice);
        totalApprovedValue = totalApprovedValue.add(totalVal);

        const remQty = w.quantity.sub(w.billedQuantity);
        if (remQty.gt(0)) {
          unbilledApprovedValue = unbilledApprovedValue.add(remQty.mul(w.unitPrice));
        }

        billedValue = billedValue.add(w.billedQuantity.mul(w.unitPrice));
      }
    }

    const billingRatio = totalApprovedValue.gt(0)
      ? Number(roundDecimal(billedValue.div(totalApprovedValue).mul(100), 2))
      : 0;

    return {
      id: s.id,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      status: s.status,
      address: s.address,
      client: s.client,
      operationalMetrics: {
        totalWorkEntries: totalWorkCount,
        approvedWorkEntries: approvedCount,
        totalApprovedValue: Number(roundDecimal(totalApprovedValue, 2)),
        unbilledApprovedValue: Number(roundDecimal(unbilledApprovedValue, 2)),
        billedValue: Number(roundDecimal(billedValue, 2)),
        billingCompletionPercent: billingRatio,
      },
    };
  });

  return {
    pagination: buildPaginationMeta(totalCount, page, limit),
    sites: performance,
  };
}

/**
 * 8. APPROVED WORK ENTRIES
 * Filterable, paginated operational items approved for invoicing.
 */
export async function getApprovedWorkEntries(
  organizationId: string,
  query: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    clientId?: string;
    siteId?: string;
  } & PaginationQuery
) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);
  const { skip, take, page, limit } = parsePagination(query);

  const whereClause: Prisma.WorkEntryWhereInput = {
    organizationId,
    status: { in: [WorkEntryStatus.APPROVED, WorkEntryStatus.PARTIALLY_BILLED] },
    ...(query.clientId && { clientId: query.clientId.trim() }),
    ...(query.siteId && { siteId: query.siteId.trim() }),
    ...(range.dateFrom || range.dateTo
      ? {
          workDate: {
            ...(range.dateFrom && { gte: range.dateFrom }),
            ...(range.dateTo && { lte: range.dateTo }),
          },
        }
      : {}),
  };

  const [totalCount, entries] = await Promise.all([
    prisma.workEntry.count({ where: whereClause }),
    prisma.workEntry.findMany({
      where: whereClause,
      include: {
        client: { select: { id: true, nameAr: true, nameEn: true } },
        site: { select: { id: true, nameAr: true, nameEn: true } },
      },
      orderBy: { workDate: 'desc' },
      skip,
      take,
    }),
  ]);

  let totalUnbilledValue = new Decimal(0);

  const items = entries.map((we) => {
    const remQty = we.quantity.sub(we.billedQuantity);
    const unbilledAmount = remQty.gt(0) ? roundDecimal(remQty.mul(we.unitPrice), 2) : new Decimal(0);
    totalUnbilledValue = totalUnbilledValue.add(unbilledAmount);

    return {
      id: we.id,
      referenceNo: we.referenceNo,
      itemNameAr: we.itemNameAr,
      itemNameEn: we.itemNameEn,
      workDate: we.workDate.toISOString().slice(0, 10),
      status: we.status,
      unit: we.unit,
      quantity: Number(we.quantity),
      billedQuantity: Number(we.billedQuantity),
      unbilledQuantity: Number(remQty),
      unitPrice: Number(roundDecimal(we.unitPrice, 2)),
      totalValue: Number(roundDecimal(we.quantity.mul(we.unitPrice), 2)),
      unbilledValue: Number(unbilledAmount),
      client: we.client,
      site: we.site,
    };
  });

  return {
    summary: {
      approvedEntriesCount: totalCount,
      totalUnbilledValue: Number(roundDecimal(totalUnbilledValue, 2)),
    },
    pagination: buildPaginationMeta(totalCount, page, limit),
    workEntries: items,
  };
}

/**
 * 9. WORK COMPLETION STATISTICS
 * Pipeline completion velocity and conversion from registration to approval to billing.
 */
export async function getWorkCompletionStatistics(
  organizationId: string,
  query: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    siteId?: string;
  }
) {
  const range = resolvePeriodRange(query.period, query.dateFrom, query.dateTo);

  const whereClause: Prisma.WorkEntryWhereInput = {
    organizationId,
    ...(query.siteId && { siteId: query.siteId.trim() }),
    ...(range.dateFrom || range.dateTo
      ? {
          workDate: {
            ...(range.dateFrom && { gte: range.dateFrom }),
            ...(range.dateTo && { lte: range.dateTo }),
          },
        }
      : {}),
  };

  const statusAggregations = await prisma.workEntry.groupBy({
    by: ['status'],
    where: whereClause,
    _count: { id: true },
    _sum: { quantity: true },
  });

  const counts: Record<string, number> = {
    DRAFT: 0,
    PENDING_APPROVAL: 0,
    APPROVED: 0,
    REJECTED: 0,
    PARTIALLY_BILLED: 0,
    FULLY_BILLED: 0,
  };

  let totalEntries = 0;
  for (const agg of statusAggregations) {
    counts[agg.status] = agg._count.id;
    totalEntries += agg._count.id;
  }

  const approvedTotal = counts.APPROVED + counts.PARTIALLY_BILLED + counts.FULLY_BILLED;
  const billedTotal = counts.PARTIALLY_BILLED + counts.FULLY_BILLED;

  const approvalRatePercent = totalEntries > 0 ? Number(roundDecimal((approvedTotal / totalEntries) * 100, 2)) : 0;
  const billingConversionRatePercent = approvedTotal > 0 ? Number(roundDecimal((billedTotal / approvedTotal) * 100, 2)) : 0;

  return {
    period: range.period,
    dateRange: {
      dateFrom: range.dateFrom ? range.dateFrom.toISOString() : null,
      dateTo: range.dateTo ? range.dateTo.toISOString() : null,
    },
    pipeline: {
      totalWorkEntries: totalEntries,
      draftCount: counts.DRAFT,
      pendingApprovalCount: counts.PENDING_APPROVAL,
      approvedCount: counts.APPROVED,
      partiallyBilledCount: counts.PARTIALLY_BILLED,
      fullyBilledCount: counts.FULLY_BILLED,
      rejectedCount: counts.REJECTED,
      overallApprovalRatePercent: approvalRatePercent,
      billingConversionRatePercent: billingConversionRatePercent,
    },
  };
}
