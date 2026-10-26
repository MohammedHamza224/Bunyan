import { prisma } from '../lib/prisma';
import { request, createTestOrg, createTestClient } from './helpers';
import { getCustomerStatementReport } from '../services/reportingService';

describe('Customer Account Statement Audit & Integrity Verification', () => {
  let org: any;
  let client: any;

  beforeAll(async () => {
    org = await createTestOrg(`stmt-audit-${Date.now()}`);
    client = await createTestClient(org.orgId, {
      nameAr: 'شركة الوفاق للاستثمار والتطوير',
      nameEn: 'Al-Wifaq Investment & Development Co.',
      vatNumber: '312345678900003',
    });
  });

  afterAll(async () => {
    // Clean up test org data
    try {
      await prisma.payment.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.invoiceLine.deleteMany({
        where: { invoice: { organizationId: org.orgId } },
      });
      await prisma.invoice.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.statement.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.client.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.user.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.orgSettings.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.organization.deleteMany({ where: { id: org.orgId } });
    } catch {
      // ignore
    }
  });

  it('correctly calculates opening balance, running balances, and closing formula', async () => {
    // 1. Transaction prior to period: Invoice on 2026-01-10 for 5000 SAR
    const pastInv = await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        createdById: org.userId,
        orgSnapshot: { nameAr: 'المؤسسة' },
        clientSnapshot: { nameAr: client.nameAr },
        invoiceType: 'TAX_INVOICE',
        referenceNo: `INV-2026-PAST`,
        issueDate: new Date('2026-01-10T10:00:00.000Z'),
        status: 'APPROVED',
        paymentStatus: 'PARTIALLY_PAID',
        subtotal: 5000,
        taxableAmount: 5000,
        vatRate: 0,
        vatAmount: 0,
        totalAmount: 5000,
        remainingAmount: 3000,
      },
    });

    // 2. Transaction prior to period: Payment on 2026-01-15 for 2000 SAR
    await prisma.payment.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        invoiceId: pastInv.id,
        recordedById: org.userId,
        idempotencyKey: `idemp-past-${Date.now()}`,
        referenceNo: `PAY-2026-PAST`,
        amount: 2000,
        paymentDate: new Date('2026-01-15T10:00:00.000Z'),
        method: 'BANK_TRANSFER',
        status: 'CONFIRMED',
      },
    });

    // Opening balance before 2026-02-01 should be: 5000 - 2000 = 3000 SAR.

    // 3. Transactions inside period (2026-02-01 to 2026-02-28):
    // In-period Invoice 1 on 2026-02-05 for 4000 SAR
    const inv1 = await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        createdById: org.userId,
        orgSnapshot: { nameAr: 'المؤسسة' },
        clientSnapshot: { nameAr: client.nameAr },
        invoiceType: 'TAX_INVOICE',
        referenceNo: `INV-2026-001`,
        issueDate: new Date('2026-02-05T09:00:00.000Z'),
        status: 'APPROVED',
        paymentStatus: 'PARTIALLY_PAID',
        subtotal: 4000,
        taxableAmount: 4000,
        vatRate: 0,
        vatAmount: 0,
        totalAmount: 4000,
        remainingAmount: 2500,
      },
    });

    // In-period Payment 1 on same day (2026-02-05) for 1500 SAR
    // Testing same-day ordering: Invoice must be processed BEFORE payment
    await prisma.payment.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        invoiceId: inv1.id,
        recordedById: org.userId,
        idempotencyKey: `idemp-001-${Date.now()}`,
        referenceNo: `PAY-2026-001`,
        amount: 1500,
        paymentDate: new Date('2026-02-05T14:00:00.000Z'),
        method: 'BANK_TRANSFER',
        status: 'CONFIRMED',
      },
    });

    // In-period Payment 2 (Cancelled) on 2026-02-10 for 1000 SAR — MUST BE EXCLUDED
    await prisma.payment.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        invoiceId: inv1.id,
        recordedById: org.userId,
        idempotencyKey: `idemp-cancelled-${Date.now()}`,
        referenceNo: `PAY-2026-CANCELLED`,
        amount: 1000,
        paymentDate: new Date('2026-02-10T10:00:00.000Z'),
        method: 'CASH',
        status: 'CANCELLED',
      },
    });

    // In-period Payment 3 (Reversed) on 2026-02-12 for 500 SAR — MUST BE EXCLUDED
    await prisma.payment.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        invoiceId: inv1.id,
        recordedById: org.userId,
        idempotencyKey: `idemp-reversed-${Date.now()}`,
        referenceNo: `PAY-2026-REVERSED`,
        amount: 500,
        paymentDate: new Date('2026-02-12T10:00:00.000Z'),
        method: 'BANK_TRANSFER',
        status: 'REVERSED',
      },
    });

    // In-period Credit Note on 2026-02-18 for 500 SAR
    await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        createdById: org.userId,
        orgSnapshot: { nameAr: 'المؤسسة' },
        clientSnapshot: { nameAr: client.nameAr },
        invoiceType: 'CREDIT_NOTE',
        referenceNo: `CR-2026-001`,
        issueDate: new Date('2026-02-18T10:00:00.000Z'),
        status: 'APPROVED',
        paymentStatus: 'PAID',
        subtotal: 500,
        taxableAmount: 500,
        vatRate: 0,
        vatAmount: 0,
        totalAmount: 500,
        remainingAmount: 0,
        cancelledById: inv1.id,
      },
    });

    // Call statement report service
    const report = await getCustomerStatementReport(org.orgId, {
      clientId: client.id,
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });

    // Check Opening Balance:
    // Past Invoices (5000) - Past Payments (2000) = 3000
    expect(report.summary.openingBalanceAvailable).toBe(true);
    expect(Number(report.summary.openingBalance)).toBe(3000);

    // In-period transactions:
    // 1) INV-2026-001: debit = 4000, runningBalance = 3000 + 4000 = 7000
    // 2) PAY-2026-001: credit = 1500, runningBalance = 7000 - 1500 = 5500
    // 3) CR-2026-001:  credit = 500,  runningBalance = 5500 - 500 = 5000
    // Cancelled and Reversed payments must not appear in transactions!
    const docNos = report.transactions.map((t: any) => t.documentNo);
    expect(docNos).toContain('INV-2026-001');
    expect(docNos).toContain('PAY-2026-001');
    expect(docNos).toContain('CR-2026-001');
    expect(docNos).not.toContain('PAY-2026-CANCELLED');
    expect(docNos).not.toContain('PAY-2026-REVERSED');

    // Verify same-day ordering: INV-2026-001 appears before PAY-2026-001
    const invIndex = docNos.indexOf('INV-2026-001');
    const payIndex = docNos.indexOf('PAY-2026-001');
    expect(invIndex).toBeLessThan(payIndex);

    // Verify running balances:
    expect(Number(report.transactions[invIndex].runningBalance)).toBe(7000);
    expect(Number(report.transactions[payIndex].runningBalance)).toBe(5500);

    // Verify summary totals:
    expect(Number(report.summary.totalDebits)).toBe(4000);
    expect(Number(report.summary.totalCredits)).toBe(2000); // 1500 payment + 500 credit note
    expect(Number(report.summary.totalInvoices)).toBe(4000);
    expect(Number(report.summary.totalPayments)).toBe(1500);
    expect(Number(report.summary.totalCreditNotes)).toBe(500);

    // Verify Invariant: Closing Balance = Opening Balance + Total Debits - Total Credits
    // 3000 + 4000 - 2000 = 5000
    expect(Number(report.summary.closingBalance)).toBe(5000);
    expect(Number(report.closingBalance)).toBe(5000);

    // Verify Related Reference for Credit Note
    const crTx = report.transactions.find((t: any) => t.documentNo === 'CR-2026-001');
    expect(crTx?.relatedRef).toBe('INV-2026-001');
  });

  it('supports API endpoint GET /api/reports/customer-statement and Excel export', async () => {
    // Test API route
    const res = await request
      .get('/api/reports/customer-statement')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .query({
        clientId: client.id,
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary.closingBalance).toBe(5000);

    // Test Excel export route
    const excelRes = await request
      .get('/api/reports/export/excel')
      .set('Authorization', `Bearer ${org.accessToken}`)
      .query({
        reportType: 'customer-statement',
        clientId: client.id,
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      })
      .buffer(true)
      .parse((res, callback) => {
        const data: any[] = [];
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(data)));
      });

    expect(excelRes.status).toBe(200);
    expect(excelRes.header['content-type']).toContain('spreadsheetml.sheet');
    expect(excelRes.body.length).toBeGreaterThan(1000);
  });
});
