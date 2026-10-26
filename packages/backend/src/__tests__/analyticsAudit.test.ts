import { prisma } from '../lib/prisma';
import { createTestOrg, createTestClient } from './helpers';
import { getDashboardAnalytics, getInvoicesReport, getReceivablesReport } from '../services/reportingService';
import { InvoiceStatus, InvoiceType, PaymentStatus } from '@prisma/client';

describe('BUNYAN Financial & Operational Analytics Audit Test Suite', () => {
  let org: any;
  let client: any;

  beforeAll(async () => {
    org = await createTestOrg(`analytics-audit-${Date.now()}`);
    client = await createTestClient(org.orgId, {
      nameAr: 'شركة الرافدين للمقاولات العامة',
      nameEn: 'Al-Rafidain Contracting Co.',
      vatNumber: '399999999900003',
    });
  });

  afterAll(async () => {
    try {
      await prisma.payment.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.invoiceLine.deleteMany({ where: { invoice: { organizationId: org.orgId } } });
      await prisma.invoice.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.statement.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.workEntry.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.site.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.client.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.user.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.orgSettings.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.organization.deleteMany({ where: { id: org.orgId } });
    } catch {
      // ignore cleanup errors
    }
  });

  it('verifies that Payment Status Donut partitions 100% of issued invoices with mutual exclusivity', async () => {
    const today = new Date();
    const pastDueDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago (overdue)
    const futureDueDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days ahead

    // 1. Fully Paid Invoice (10,000 + 1,500 VAT = 11,500)
    await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        createdById: org.userId,
        orgSnapshot: { defaultCurrency: 'SAR' },
        clientSnapshot: { nameAr: client.nameAr },
        invoiceType: InvoiceType.TAX_INVOICE,
        referenceNo: 'INV-AUDIT-001',
        issueDate: today,
        dueDate: futureDueDate,
        status: InvoiceStatus.APPROVED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 10000,
        taxableAmount: 10000,
        vatRate: 15,
        vatAmount: 1500,
        totalAmount: 11500,
        paidAmount: 11500,
        remainingAmount: 0,
      },
    });

    // 2. Partially Paid Invoice (20,000 + 3,000 VAT = 23,000, paid 10,000, remaining 13,000) - Overdue
    await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        createdById: org.userId,
        orgSnapshot: { defaultCurrency: 'SAR' },
        clientSnapshot: { nameAr: client.nameAr },
        invoiceType: InvoiceType.TAX_INVOICE,
        referenceNo: 'INV-AUDIT-002',
        issueDate: today,
        dueDate: pastDueDate, // OVERDUE
        status: InvoiceStatus.APPROVED,
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
        subtotal: 20000,
        taxableAmount: 20000,
        vatRate: 15,
        vatAmount: 3000,
        totalAmount: 23000,
        paidAmount: 10000,
        remainingAmount: 13000,
      },
    });

    // 3. Unpaid Invoice (30,000 + 4,500 VAT = 34,500, remaining 34,500) - Not overdue
    await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        createdById: org.userId,
        orgSnapshot: { defaultCurrency: 'SAR' },
        clientSnapshot: { nameAr: client.nameAr },
        invoiceType: InvoiceType.TAX_INVOICE,
        referenceNo: 'INV-AUDIT-003',
        issueDate: today,
        dueDate: futureDueDate,
        status: InvoiceStatus.APPROVED,
        paymentStatus: PaymentStatus.UNPAID,
        subtotal: 30000,
        taxableAmount: 30000,
        vatRate: 15,
        vatAmount: 4500,
        totalAmount: 34500,
        paidAmount: 0,
        remainingAmount: 34500,
      },
    });

    const analytics = await getDashboardAnalytics(org.orgId, { period: 'all' });

    // Verify total invoices count
    expect(analytics.totalInvoices).toBe(3);

    // Verify donut chart slices: MUST have exactly PAID, PARTIALLY_PAID, UNPAID
    const slices = analytics.paymentStatusDistribution;
    expect(slices.length).toBe(3);

    const paidSlice = slices.find((s) => s.key === 'PAID');
    const partialSlice = slices.find((s) => s.key === 'PARTIALLY_PAID');
    const unpaidSlice = slices.find((s) => s.key === 'UNPAID');

    expect(paidSlice).toBeDefined();
    expect(partialSlice).toBeDefined();
    expect(unpaidSlice).toBeDefined();

    // Verify counts partition 100% of invoices
    expect(paidSlice!.count).toBe(1);
    expect(partialSlice!.count).toBe(1);
    expect(unpaidSlice!.count).toBe(1);
    expect(paidSlice!.count + partialSlice!.count + unpaidSlice!.count).toBe(analytics.totalInvoices);

    // Verify amounts
    expect(paidSlice!.amount).toBe(11500); // Fully paid total amount
    expect(partialSlice!.amount).toBe(13000); // Remaining balance of partially paid invoice
    expect(unpaidSlice!.amount).toBe(34500); // Remaining balance of unpaid invoice

    // Slices MUST NOT contain OVERDUE as a category
    expect(slices.some((s) => s.key === 'OVERDUE')).toBe(false);

    // Overdue is correctly reported as an independent top-level indicator
    expect(analytics.overdueInvoicesCount).toBe(1);
    expect(analytics.overdueAmount).toBe(13000);
    expect(analytics.overdueSummary).toEqual({ count: 1, amount: 13000 });

    // Total outstanding receivables equals partially paid remaining (13,000) + unpaid (34,500) = 47,500
    expect(analytics.totalOutstanding).toBe(47500);
  });

  it('verifies that Credit Notes correctly reduce invoiced totals in monthly financial performance', async () => {
    const today = new Date();

    // Create a Credit Note of 5,000 SAR against the organization
    await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        createdById: org.userId,
        orgSnapshot: { defaultCurrency: 'SAR' },
        clientSnapshot: { nameAr: client.nameAr },
        invoiceType: InvoiceType.CREDIT_NOTE,
        referenceNo: 'CN-AUDIT-001',
        issueDate: today,
        status: InvoiceStatus.APPROVED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 4347.83,
        taxableAmount: 4347.83,
        vatRate: 15,
        vatAmount: 652.17,
        totalAmount: 5000,
        paidAmount: 5000,
        remainingAmount: 0,
        cancellationReason: 'خصم تجاري معتمد',
      },
    });

    const analytics = await getDashboardAnalytics(org.orgId, { period: 'all' });

    // Gross invoices (3 base invoices) = 11,500 + 23,000 + 34,500 = 69,000
    expect(analytics.grossInvoiceValue).toBe(69000);
    expect(analytics.creditNotesTotal).toBe(5000);

    // Net invoice value = 69,000 - 5,000 = 64,000
    expect(analytics.netInvoiceValue).toBe(64000);

    // Pre-tax taxable subtotal and statutory VAT breakdown
    expect(analytics.taxableSubtotal).toBeDefined();
    expect(analytics.vatAmount).toBeDefined();
    // Subtotal + VAT must equal netInvoiceValue (64,000)
    const sumSubtotalAndVat = Number((analytics.taxableSubtotal + analytics.vatAmount).toFixed(2));
    expect(Math.abs(sumSubtotalAndVat - analytics.netInvoiceValue)).toBeLessThanOrEqual(0.01);

    // Check Monthly Financial Performance Bar Chart
    const currentMonthKey = today.toISOString().slice(0, 7);
    const monthItem = analytics.monthlyFinancialPerformance.find((m) => m.month === currentMonthKey);
    expect(monthItem).toBeDefined();

    // Monthly invoicedAmount must equal net invoiced value (64,000) rather than inflating to 74,000!
    expect(monthItem!.invoicedAmount).toBe(64000);
  });

  it('verifies that Monthly Financial Performance Column Chart dynamically spans active transaction months and reconciles with financial reports', async () => {
    // Add past transactions in a prior month (e.g. 2 months ago)
    const now = new Date();
    const pastMonthDate = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    const pastMonthKey = pastMonthDate.toISOString().slice(0, 7);

    const pastInv = await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        createdById: org.userId,
        orgSnapshot: { defaultCurrency: 'SAR' },
        clientSnapshot: { nameAr: client.nameAr },
        invoiceType: InvoiceType.TAX_INVOICE,
        referenceNo: 'INV-HIST-001',
        issueDate: pastMonthDate,
        status: InvoiceStatus.APPROVED,
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
        subtotal: 10000,
        taxableAmount: 10000,
        vatRate: 15,
        vatAmount: 1500,
        totalAmount: 11500,
        paidAmount: 5000,
        remainingAmount: 6500,
      },
    });

    await prisma.payment.create({
      data: {
        organizationId: org.orgId,
        invoiceId: pastInv.id,
        clientId: client.id,
        recordedById: org.userId,
        amount: 5000,
        paymentDate: pastMonthDate,
        method: 'BANK_TRANSFER',
        status: 'CONFIRMED',
        idempotencyKey: 'IDEMP-HIST-001',
      },
    });

    const analytics = await getDashboardAnalytics(org.orgId, { period: 'all' });

    // 1. Verify that the historical month is actively present in the chart buckets
    const pastMonthBucket = analytics.monthlyFinancialPerformance.find((m) => m.month === pastMonthKey);
    expect(pastMonthBucket).toBeDefined();
    expect(pastMonthBucket!.invoicedAmount).toBe(11500);
    expect(pastMonthBucket!.collectedAmount).toBe(5000);
    expect(pastMonthBucket!.outstandingAmount).toBe(6500);

    // 2. Exact Financial Reconciliation across the entire chart:
    const chartTotalInvoiced = analytics.monthlyFinancialPerformance.reduce(
      (sum, m) => Number((sum + m.invoicedAmount).toFixed(2)),
      0
    );
    const chartTotalCollected = analytics.monthlyFinancialPerformance.reduce(
      (sum, m) => Number((sum + m.collectedAmount).toFixed(2)),
      0
    );

    // Chart Invoiced Total must reconcile with Dashboard Net Invoices KPI & Invoices Report
    expect(chartTotalInvoiced).toBe(analytics.netInvoiceValue);

    // Chart Collected Total must reconcile with Dashboard Collections KPI & Collections Report
    expect(chartTotalCollected).toBe(analytics.totalCollected);

    // 3. Test currentYear period generation: must return full 12-month calendar progression
    const yearAnalytics = await getDashboardAnalytics(org.orgId, { period: 'currentYear' });
    expect(yearAnalytics.monthlyFinancialPerformance.length).toBe(12);
    expect(yearAnalytics.monthlyFinancialPerformance[0].month.endsWith('-01')).toBe(true);
    expect(yearAnalytics.monthlyFinancialPerformance[11].month.endsWith('-12')).toBe(true);
    expect(yearAnalytics.monthlyFinancialPerformance[0].labelAr).toContain('يناير');
    expect(yearAnalytics.monthlyFinancialPerformance[0].labelEn).toContain('Jan');
  });
});
