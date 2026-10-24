// =============================================================
// Tests: Phase 4 — Interactive Dashboard, Financial & Operational Reports,
// Customer Account Statement, Site Analytics, Receivables Aging,
// Multi-Currency Separation, Native Excel (.xlsx) Export & Cross-Tenant Isolation
// =============================================================
import ExcelJS from 'exceljs';
import { request, createTestOrg, authHeader } from './helpers';
import { prisma } from '../lib/prisma';

jest.setTimeout(30000);

describe('Phase 4: Dashboard, Financial Reports, Customer Statement, Aging & Excel Export', () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;
  let client1Id: string;
  let client2Id: string;
  let site1Id: string;
  let site2Id: string;
  let siteClient2Id: string;

  // Store created document IDs for verification
  let invPaidId: string;
  let invPartialId: string;
  let invOverdue45Id: string;
  let invCancelledId: string;
  let invNoDueDateId: string;

  beforeAll(async () => {
    orgA = await createTestOrg('phase4-org-a');
    orgB = await createTestOrg('phase4-org-b');

    // Configure Org A ZATCA Seller Settings
    await request
      .put('/api/organizations/settings')
      .set(authHeader(orgA.accessToken))
      .send({
        businessName: 'شركة البناء المتقدم للمقاولات',
        businessNameEn: 'Advanced Construction Co.',
        vatNumber: '310123456700003',
        commercialReg: '1010998877',
        address: 'الرياض - حي العليا',
        defaultCurrency: 'SAR',
        vatRate: 15,
      });

    // Create Client 1 (B2B)
    const c1Res = await request
      .post('/api/clients')
      .set(authHeader(orgA.accessToken))
      .send({
        nameAr: 'شركة إعمار المشاريع القابضة',
        nameEn: 'Emaar Projects Holding',
        clientType: 'COMPANY',
        vatNumber: '300555666700003',
        address: 'الرياض - طريق الملك سلمان',
      });
    client1Id = c1Res.body.data.id;

    // Create Client 2 (B2B)
    const c2Res = await request
      .post('/api/clients')
      .set(authHeader(orgA.accessToken))
      .send({
        nameAr: 'مؤسسة الواحة للتطوير العقاري',
        nameEn: 'Oasis Real Estate Est.',
        clientType: 'COMPANY',
        vatNumber: '300444333200003',
        address: 'الدمام - الكورنيش',
      });
    client2Id = c2Res.body.data.id;

    // Create Sites for Client 1
    const s1Res = await request
      .post('/api/sites')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: client1Id,
        nameAr: 'مشروع البرج التجاري - الموقع أ',
        nameEn: 'Commercial Tower - Site A',
      });
    site1Id = s1Res.body.data.id;

    const s2Res = await request
      .post('/api/sites')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: client1Id,
        nameAr: 'مشروع المجمع السكني - الموقع ب',
        nameEn: 'Residential Complex - Site B',
      });
    site2Id = s2Res.body.data.id;

    const sClient2Res = await request
      .post('/api/sites')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: client2Id,
        nameAr: 'مشروع الواحة التجاري',
        nameEn: 'Oasis Commercial Project',
      });
    siteClient2Id = sClient2Res.body.data.id;
  });

  describe('14.1 & 14.2 Dashboard KPIs, Statements vs Invoices Separation, Credit/Debit Notes & Cancelled Invoices', () => {
    it('returns clean zero KPIs for an empty organization without errors', async () => {
      const res = await request
        .get('/api/dashboard')
        .set(authHeader(orgB.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.grossInvoiceValue).toBe(0);
      expect(res.body.data.netInvoiceValue).toBe(0);
      expect(res.body.data.totalCollected).toBe(0);
      expect(res.body.data.totalOutstanding).toBe(0);
      expect(res.body.data.approvedUnbilledValue).toBe(0);
    });

    it('accurately calculates Gross vs Net Invoices, Credit/Debit Notes, Statements (no double counting), Unbilled Works, and excludes Cancelled/Draft invoices', async () => {
      // 1. Create Work Entry 1 on Site 1: 100 units * 100 SAR = 10,000 SAR (Will be billed via Statement -> Invoice 1)
      const we1Res = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client1Id,
          siteId: site1Id,
          itemNameAr: 'أعمال خرسانة مسلحة للقواعد',
          unit: 'متر مكعب',
          quantity: 100,
          unitPrice: 100,
          workDate: '2026-01-10',
        });
      const we1Id = we1Res.body.data.id;
      await request.post(`/api/work-entries/${we1Id}/submit`).set(authHeader(orgA.accessToken));
      await request.post(`/api/work-entries/${we1Id}/approve`).set(authHeader(orgA.accessToken));

      // Create Statement 1 from we1 (10,000 + 15% VAT = 11,500) and approve it
      const stm1Res = await request
        .post('/api/statements')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client1Id,
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          issueDate: '2026-01-15',
          lines: [{ workEntryId: we1Id, quantity: 100 }],
        });
      const stm1Id = stm1Res.body.data.id;
      await request.post(`/api/statements/${stm1Id}/approve`).set(authHeader(orgA.accessToken));

      // Create Invoice 1 from Statement 1 (Gross: 11,500 SAR), approve it, and pay in full (11,500 SAR)
      const inv1Res = await request
        .post('/api/invoices/from-statement')
        .set(authHeader(orgA.accessToken))
        .send({
          statementId: stm1Id,
          issueDate: '2026-01-15',
          dueDate: '2026-02-15',
          invoiceType: 'TAX_INVOICE',
        });
      invPaidId = inv1Res.body.data.id;
      await request.post(`/api/invoices/${invPaidId}/approve`).set(authHeader(orgA.accessToken));

      await request
        .post('/api/payments')
        .set(authHeader(orgA.accessToken))
        .send({
          invoiceId: invPaidId,
          amount: 11500,
          paymentDate: '2026-01-20',
          method: 'BANK_TRANSFER',
          referenceNo: 'TR-1001',
        });

      // 2. Create Work Entry 2 on Site 1: 200 units * 100 SAR = 20,000 SAR
      // Bill 150 units (15,000 + 15% VAT = 17,250 SAR) directly on Invoice 2, leaving 50 units (5,000 SAR) PARTIALLY_BILLED unbilled!
      const we2Res = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client1Id,
          siteId: site1Id,
          itemNameAr: 'أعمال مباني طابوق معزول',
          unit: 'متر مربع',
          quantity: 200,
          unitPrice: 100,
          workDate: '2026-02-05',
        });
      const we2Id = we2Res.body.data.id;
      await request.post(`/api/work-entries/${we2Id}/submit`).set(authHeader(orgA.accessToken));
      await request.post(`/api/work-entries/${we2Id}/approve`).set(authHeader(orgA.accessToken));

      const inv2Res = await request
        .post('/api/invoices/direct')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client1Id,
          issueDate: '2026-02-10',
          dueDate: '2099-12-31', // Not due yet
          invoiceType: 'TAX_INVOICE',
          lines: [{ workEntryId: we2Id, quantity: 150 }],
        });
      invPartialId = inv2Res.body.data.id;
      await request.post(`/api/invoices/${invPartialId}/approve`).set(authHeader(orgA.accessToken));

      // Issue Credit Note against Invoice 2: 1,000 + 15% VAT = 1,150 SAR -> reduces remaining to 16,100
      const cnRes = await request
        .post(`/api/invoices/${invPartialId}/notes`)
        .set(authHeader(orgA.accessToken))
        .send({
          noteType: 'CREDIT_NOTE',
          reason: 'خصم تسوية كميات مباني',
          issueDate: '2026-02-12',
          lines: [
            {
              itemNameAr: 'تسوية كميات مباني',
              unit: 'متر مربع',
              quantity: 10,
              unitPrice: 100,
            },
          ],
        });
      expect(cnRes.status).toBe(201);

      // Issue Debit Note against Invoice 2: 500 + 15% VAT = 575 SAR -> increases remaining to 16,675
      const dnRes = await request
        .post(`/api/invoices/${invPartialId}/notes`)
        .set(authHeader(orgA.accessToken))
        .send({
          noteType: 'DEBIT_NOTE',
          reason: 'إضافة أعمال إضافية على الفاتورة',
          issueDate: '2026-02-14',
          lines: [
            {
              itemNameAr: 'أعمال إضافية',
              unit: 'متر مربع',
              quantity: 5,
              unitPrice: 100,
            },
          ],
        });
      expect(dnRes.status).toBe(201);

      // Record TWO partial payments on Invoice 2: 3,000 SAR + 2,000 SAR = 5,000 SAR
      // Remaining on Invoice 2 should be: 17,250 - 1,150 + 575 - 5,000 = 11,675 SAR
      await request
        .post('/api/payments')
        .set(authHeader(orgA.accessToken))
        .send({
          invoiceId: invPartialId,
          amount: 3000,
          paymentDate: '2026-02-15',
          method: 'BANK_TRANSFER',
          referenceNo: 'TR-2001',
        });
      await request
        .post('/api/payments')
        .set(authHeader(orgA.accessToken))
        .send({
          invoiceId: invPartialId,
          amount: 2000,
          paymentDate: '2026-02-18',
          method: 'CHEQUE',
          referenceNo: 'CHQ-2002',
        });

      // 3. Create Work Entry 3 on Site 2: 40 units * 100 SAR = 4,000 SAR (Approved, completely unbilled)
      const we3Res = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client1Id,
          siteId: site2Id,
          itemNameAr: 'أعمال عزل مائي وحراري للأسطح',
          unit: 'متر مربع',
          quantity: 40,
          unitPrice: 100,
          workDate: '2026-03-01',
        });
      const we3Id = we3Res.body.data.id;
      await request.post(`/api/work-entries/${we3Id}/submit`).set(authHeader(orgA.accessToken));
      await request.post(`/api/work-entries/${we3Id}/approve`).set(authHeader(orgA.accessToken));

      // 4. Create Work Entry 4 on Site 2: 80 units * 100 SAR = 8,000 SAR -> Billed on Invoice 3 (Overdue), then CANCELLED!
      const we4Res = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client1Id,
          siteId: site2Id,
          itemNameAr: 'أعمال تشطيبات دهانات داخلية',
          unit: 'متر مربع',
          quantity: 80,
          unitPrice: 100,
          workDate: '2026-03-05',
        });
      const we4Id = we4Res.body.data.id;
      await request.post(`/api/work-entries/${we4Id}/submit`).set(authHeader(orgA.accessToken));
      await request.post(`/api/work-entries/${we4Id}/approve`).set(authHeader(orgA.accessToken));

      const invCancelRes = await request
        .post('/api/invoices/direct')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client1Id,
          issueDate: '2026-03-06',
          dueDate: '2026-03-20',
          invoiceType: 'TAX_INVOICE',
          lines: [{ workEntryId: we4Id, quantity: 80 }],
        });
      invCancelledId = invCancelRes.body.data.id;
      await request.post(`/api/invoices/${invCancelledId}/approve`).set(authHeader(orgA.accessToken));
      // Cancel this invoice — its 9,200 SAR must be excluded from active financial totals, and we4 reverts to APPROVED unbilled (8,000 SAR)
      const cancelRes = await request
        .post(`/api/invoices/${invCancelledId}/cancel`)
        .set(authHeader(orgA.accessToken))
        .send({ cancellationReason: 'خطأ في بيانات الفاتورة' });
      expect(cancelRes.status).toBe(200);

      // Now re-bill 30 units of we4 (3,000 + 15% VAT = 3,450 SAR) on an OVERDUE invoice (due 45 days ago)
      // Remaining unbilled on we4 = 50 units * 100 = 5,000 SAR
      const overdueDueDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const overdueIssueDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const invOverdueRes = await request
        .post('/api/invoices/direct')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client1Id,
          issueDate: overdueIssueDate,
          dueDate: overdueDueDate,
          invoiceType: 'TAX_INVOICE',
          lines: [{ workEntryId: we4Id, quantity: 30 }],
        });
      invOverdue45Id = invOverdueRes.body.data.id;
      await request.post(`/api/invoices/${invOverdue45Id}/approve`).set(authHeader(orgA.accessToken));

      // Verify Dashboard KPIs:
      // Active Base Invoices:
      // - invPaidId: 11,500 SAR (PAID)
      // - invPartialId: 17,250 SAR (PARTIALLY_PAID, Credit Note 1,150, Debit Note 575, Paid 5,000 -> Remaining 11,675)
      // - invOverdue45Id: 3,450 SAR (UNPAID, Overdue -> Remaining 3,450)
      // Total Gross = 11,500 + 17,250 + 3,450 = 32,200 SAR
      // Total Net = 32,200 - 1,150 + 575 = 31,625 SAR
      // Total Collected = 11,500 + 5,000 = 16,500 SAR
      // Total Outstanding = 11,675 + 3,450 = 15,125 SAR (Notice: Net 31,625 - Collected 16,500 = 15,125!)
      // Approved Unbilled Work Value:
      // - we2 remaining: 50 * 100 = 5,000
      // - we3 remaining: 40 * 100 = 4,000
      // - we4 remaining: 50 * 100 = 5,000
      // Total Approved Unbilled = 14,000 SAR
      const dashRes = await request
        .get('/api/dashboard')
        .set(authHeader(orgA.accessToken));

      expect(dashRes.status).toBe(200);
      const d = dashRes.body.data;
      expect(d.grossInvoiceValue).toBe(32200);
      expect(d.creditNotesTotal).toBe(1150);
      expect(d.debitNotesTotal).toBe(575);
      expect(d.netInvoiceValue).toBe(31625);
      expect(d.totalCollected).toBe(16500);
      expect(d.totalOutstanding).toBe(15125);
      expect(d.unpaidInvoicesCount).toBe(1);
      expect(d.partiallyPaidInvoicesCount).toBe(1);
      expect(d.paidInvoicesCount).toBe(1);
      expect(d.overdueInvoicesCount).toBe(1);
      expect(d.overdueAmount).toBe(3450);
      expect(d.approvedUnbilledValue).toBe(14000);
      // Statement 1 is 11,500 SAR — verify it is reported separately and NEVER added to grossInvoiceValue
      expect(d.totalStatements).toBe(1);
      expect(d.totalStatementsValue).toBe(11500);

      // Verify Client 1 detail stats match 100%
      const clientDetailRes = await request
        .get(`/api/clients/${client1Id}`)
        .set(authHeader(orgA.accessToken));
      expect(clientDetailRes.status).toBe(200);
      expect(clientDetailRes.body.data.stats.grossInvoiceValue).toBe(32200);
      expect(clientDetailRes.body.data.stats.netInvoiceValue).toBe(31625);
      expect(clientDetailRes.body.data.stats.totalPaid).toBe(16500);
      expect(clientDetailRes.body.data.stats.outstandingBalance).toBe(15125);
    });
  });

  describe('14.3 Payment Reversal & Exclusion from Active Collections', () => {
    it('excludes deleted/reversed payments from active collection totals while preserving them in REVERSED history', async () => {
      // Record a 1,000 SAR payment on invOverdue45Id, then delete/reverse it
      const payRes = await request
        .post('/api/payments')
        .set(authHeader(orgA.accessToken))
        .send({
          invoiceId: invOverdue45Id,
          amount: 1000,
          paymentDate: '2026-03-25',
          method: 'CASH',
          referenceNo: 'CSH-REV-99',
        });
      expect(payRes.status).toBe(201);
      const paymentId = payRes.body.data.id;

      // Delete (reverse) the payment
      const delRes = await request
        .delete(`/api/payments/${paymentId}`)
        .set(authHeader(orgA.accessToken));
      expect(delRes.status).toBe(200);

      // Check Collections Report
      const colRes = await request
        .get('/api/reports/collections')
        .set(authHeader(orgA.accessToken));
      expect(colRes.status).toBe(200);
      expect(colRes.body.data.summary.totalActiveCollected).toBe(16500);
      expect(colRes.body.data.summary.totalReversedAmount).toBe(1000);
      expect(colRes.body.data.summary.activeCount).toBe(3);
      expect(colRes.body.data.summary.reversedCount).toBe(1);

      const reversedItem = colRes.body.data.items.find((i: any) => i.id === paymentId);
      expect(reversedItem).toBeDefined();
      expect(reversedItem.status).toBe('REVERSED');
      expect(reversedItem.amount).toBe(1000);
    });
  });

  describe('14.4 Customer Account Statement: Opening Balance, Chronological Ledger & Closing Balance Reconciliation', () => {
    it('calculates accurate historical Opening Balance, Debit/Credit running balance, and reconciles Closing Balance', async () => {
      // Full statement for Client 1 (All time)
      const fullRes = await request
        .get('/api/reports/customer-statement')
        .query({ clientId: client1Id })
        .set(authHeader(orgA.accessToken));

      expect(fullRes.status).toBe(200);
      const full = fullRes.body.data;
      expect(full.summary.openingBalanceAvailable).toBe(true);
      expect(full.summary.openingBalance).toBe(0);
      expect(full.summary.totalInvoices).toBe(32200);
      expect(full.summary.totalDebitNotes).toBe(575);
      expect(full.summary.totalCreditNotes).toBe(1150);
      expect(full.summary.totalPayments).toBe(16500);
      // Closing Balance = 0 + (32,200 + 575) - (1,150 + 16,500) = 15,125 SAR
      expect(full.summary.closingBalance).toBe(15125);

      // Now query with dateFrom = '2026-02-01'
      // Prior to 2026-02-01:
      // - 2026-01-15: Invoice 1 (+11,500)
      // - 2026-01-20: Payment 1 (-11,500)
      // Let's also test dateFrom = '2026-02-13' so prior to 2026-02-13 we have:
      // - 2026-01-15: Invoice 1 (+11,500)
      // - 2026-01-20: Payment 1 (-11,500)
      // - 2026-02-10: Invoice 2 (+17,250)
      // - 2026-02-12: Credit Note (-1,150)
      // Historical Opening Balance at 2026-02-13 = 17,250 - 1,150 = 16,100 SAR!
      const periodRes = await request
        .get('/api/reports/customer-statement')
        .query({
          clientId: client1Id,
          dateFrom: '2026-02-13',
          dateTo: '2026-12-31',
        })
        .set(authHeader(orgA.accessToken));

      expect(periodRes.status).toBe(200);
      const pData = periodRes.body.data;
      expect(pData.summary.openingBalanceAvailable).toBe(true);
      // Note: invOverdue45Id has issueDate = 60 days ago from 2026-10-23 (~2026-08-24), which is inside [2026-02-13, 2026-12-31]
      expect(pData.summary.openingBalance).toBe(16100);
      // Within period [2026-02-13, 2026-12-31]:
      // - 2026-02-14: Debit Note (+575)
      // - 2026-02-15: Payment (-3,000)
      // - 2026-02-18: Payment (-2,000)
      // - ~2026-08-24: invOverdue45Id (+3,450)
      // Total Debits in period = 575 + 3,450 = 4,025
      // Total Credits in period = 5,000
      // Closing Balance = 16,100 + 4,025 - 5,000 = 15,125 SAR!
      expect(pData.summary.totalDebits).toBe(4025);
      expect(pData.summary.totalCredits).toBe(5000);
      expect(pData.summary.closingBalance).toBe(15125);

      // Verify when filtering by single transactionType='PAYMENT', openingBalanceAvailable is false
      const filteredTypeRes = await request
        .get('/api/reports/customer-statement')
        .query({
          clientId: client1Id,
          dateFrom: '2026-02-13',
          transactionType: 'PAYMENT',
        })
        .set(authHeader(orgA.accessToken));
      expect(filteredTypeRes.status).toBe(200);
      expect(filteredTypeRes.body.data.summary.openingBalanceAvailable).toBe(false);
      expect(filteredTypeRes.body.data.summary.openingBalance).toBeNull();
    });
  });

  describe('14.5 Accounts Receivable Aging Report: Exact Day Boundaries, Missing DueDate & No Duplication', () => {
    it('classifies invoices into exact aging buckets (0, 1-30, 31-60, 61-90, 90+, and UNCLASSIFIED when dueDate is null) without duplicating multi-payment invoices', async () => {
      // Create a work entry for Client 2 to issue boundary test invoices
      const weRes = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client2Id,
          siteId: siteClient2Id,
          itemNameAr: 'أعمال توريد وتركيب رخام',
          unit: 'متر مربع',
          quantity: 100,
          unitPrice: 100,
          workDate: '2026-01-01',
        });
      const weAgingId = weRes.body.data.id;
      await request.post(`/api/work-entries/${weAgingId}/submit`).set(authHeader(orgA.accessToken));
      await request.post(`/api/work-entries/${weAgingId}/approve`).set(authHeader(orgA.accessToken));

      // Create an invoice with NO dueDate (dueDate = null) -> 10 units = 1,000 + 150 VAT = 1,150 SAR
      const invNullDueRes = await request
        .post('/api/invoices/direct')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client2Id,
          issueDate: '2026-01-05',
          invoiceType: 'TAX_INVOICE',
          lines: [{ workEntryId: weAgingId, quantity: 10 }],
        });
      invNoDueDateId = invNullDueRes.body.data.id;
      await request.post(`/api/invoices/${invNoDueDateId}/approve`).set(authHeader(orgA.accessToken));

      // Create an invoice overdue by 95 days -> 10 units = 1,150 SAR
      const due95DaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const issue100DaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const inv95Res = await request
        .post('/api/invoices/direct')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client2Id,
          issueDate: issue100DaysAgo,
          dueDate: due95DaysAgo,
          invoiceType: 'TAX_INVOICE',
          lines: [{ workEntryId: weAgingId, quantity: 10 }],
        });
      await request
        .post(`/api/invoices/${inv95Res.body.data.id}/approve`)
        .set(authHeader(orgA.accessToken));

      // Query Aging Report
      const agingRes = await request
        .get('/api/reports/aging')
        .set(authHeader(orgA.accessToken));

      expect(agingRes.status).toBe(200);
      const aging = agingRes.body.data;

      // Verify buckets:
      // - NOT_DUE: invPartialId (remaining 11,675 SAR) -> even though it has 2 payments, it appears ONLY ONCE!
      expect(aging.buckets.NOT_DUE.count).toBe(1);
      expect(aging.buckets.NOT_DUE.amount).toBe(11675);

      // - OVERDUE_31_60: invOverdue45Id (remaining 3,450 SAR, 45 days overdue)
      expect(aging.buckets.OVERDUE_31_60.count).toBe(1);
      expect(aging.buckets.OVERDUE_31_60.amount).toBe(3450);

      // - OVERDUE_90_PLUS: inv95Res (remaining 1,150 SAR, 95 days overdue)
      expect(aging.buckets.OVERDUE_90_PLUS.count).toBe(1);
      expect(aging.buckets.OVERDUE_90_PLUS.amount).toBe(1150);

      // - UNCLASSIFIED: invNoDueDateId (remaining 1,150 SAR, dueDate is null)
      expect(aging.buckets.UNCLASSIFIED.count).toBe(1);
      expect(aging.buckets.UNCLASSIFIED.amount).toBe(1150);

      // Total Aging Outstanding = 11,675 + 3,450 + 1,150 + 1,150 = 17,425 SAR
      expect(aging.summary.totalOutstanding).toBe(17425);

      // Reconcile with Dashboard & Receivables Report
      const dashRes = await request.get('/api/dashboard').set(authHeader(orgA.accessToken));
      const recRes = await request.get('/api/reports/receivables').set(authHeader(orgA.accessToken));
      expect(dashRes.body.data.totalOutstanding).toBe(17425);
      expect(recRes.body.data.summary.totalOutstanding).toBe(17425);
    });
  });

  describe('14.6 Multi-Currency Separation Tests', () => {
    it('separates totals by currency when documents exist in multiple currencies and never adds them together', async () => {
      // Switch Org A defaultCurrency to USD temporarily to issue a USD invoice, then switch back to SAR
      await request
        .put('/api/organizations/settings')
        .set(authHeader(orgA.accessToken))
        .send({ defaultCurrency: 'USD' });

      const weUsdRes = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client2Id,
          siteId: siteClient2Id,
          itemNameAr: 'استشارات هندسية خاصة بالدولار',
          unit: 'مقطوعية',
          quantity: 1,
          unitPrice: 2000,
          workDate: '2026-04-01',
        });
      const weUsdId = weUsdRes.body.data.id;
      await request.post(`/api/work-entries/${weUsdId}/submit`).set(authHeader(orgA.accessToken));
      await request.post(`/api/work-entries/${weUsdId}/approve`).set(authHeader(orgA.accessToken));

      const invUsdRes = await request
        .post('/api/invoices/direct')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: client2Id,
          issueDate: '2026-04-02',
          dueDate: '2026-05-02',
          invoiceType: 'TAX_INVOICE',
          lines: [{ workEntryId: weUsdId, quantity: 1 }],
        });
      await request
        .post(`/api/invoices/${invUsdRes.body.data.id}/approve`)
        .set(authHeader(orgA.accessToken));

      // Restore defaultCurrency to SAR
      await request
        .put('/api/organizations/settings')
        .set(authHeader(orgA.accessToken))
        .send({ defaultCurrency: 'SAR' });

      // Check Dashboard in SAR: USD invoice (2,300 USD) must NOT be mixed into SAR totals!
      const dashSar = await request
        .get('/api/dashboard')
        .query({ currency: 'SAR' })
        .set(authHeader(orgA.accessToken));
      expect(dashSar.status).toBe(200);
      expect(dashSar.body.data.currency).toBe('SAR');
      expect(dashSar.body.data.hasMultipleCurrencies).toBe(true);
      expect(dashSar.body.data.availableCurrencies).toEqual(expect.arrayContaining(['SAR', 'USD']));
      expect(dashSar.body.data.totalOutstanding).toBe(17425); // SAR only!

      // Check Dashboard in USD: returns strictly USD figures (2,000 + 15% VAT = 2,300 USD)
      const dashUsd = await request
        .get('/api/dashboard')
        .query({ currency: 'USD' })
        .set(authHeader(orgA.accessToken));
      expect(dashUsd.status).toBe(200);
      expect(dashUsd.body.data.currency).toBe('USD');
      expect(dashUsd.body.data.grossInvoiceValue).toBe(2300);
      expect(dashUsd.body.data.totalOutstanding).toBe(2300);
    });
  });

  describe('14.7 Site Report 6 Metrics & Native Excel (.xlsx) Export Verification', () => {
    it('returns the 6 distinct metrics per site in /api/reports/sites', async () => {
      const siteRepRes = await request
        .get('/api/reports/sites')
        .query({ siteId: site1Id })
        .set(authHeader(orgA.accessToken));

      expect(siteRepRes.status).toBe(200);
      const siteItem = siteRepRes.body.data.items[0];
      expect(siteItem).toBeDefined();
      expect(siteItem.siteId).toBe(site1Id);
      expect(siteItem.metrics).toEqual(
        expect.objectContaining({
          totalRecordedWorkValue: expect.any(Number),
          totalApprovedWorkValue: expect.any(Number),
          approvedUninvoicedWorkValue: expect.any(Number),
          totalIssuedInvoiceValue: expect.any(Number),
          netInvoiceValue: expect.any(Number),
          actualCollected: expect.any(Number),
          remainingBalance: expect.any(Number),
        })
      );
    });

    it('exports a valid native Excel (.xlsx) file with real numeric and Date cells matching report data', async () => {
      const excelRes = await request
        .get('/api/reports/export/excel')
        .query({ type: 'invoices', currency: 'SAR' })
        .set(authHeader(orgA.accessToken))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(excelRes.status).toBe(200);
      expect(excelRes.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(excelRes.body);

      const sheet = workbook.worksheets[0];
      expect(sheet).toBeDefined();
      expect(sheet!.rowCount).toBeGreaterThanOrEqual(4);

      // Row 2 is the first data row (Row 1 is column headers)
      const firstDataRow = sheet!.getRow(2);
      const dateCell = firstDataRow.getCell(2);
      const grossAmountCell = firstDataRow.getCell(7);
      const netAmountCell = firstDataRow.getCell(8);

      expect(dateCell.value).toBeInstanceOf(Date);
      expect(typeof grossAmountCell.value).toBe('number');
      expect(typeof netAmountCell.value).toBe('number');
    });
  });

  describe('14.8 Authorization & Cross-Tenant Isolation', () => {
    it('prevents Organization B from accessing Organization A reports, customer statements, or Excel exports', async () => {
      // Org B requests Org A's client statement -> 403 Forbidden / 404 Not Found
      const stmRes = await request
        .get('/api/reports/customer-statement')
        .query({ clientId: client1Id })
        .set(authHeader(orgB.accessToken));
      expect([403, 404]).toContain(stmRes.status);

      // Org B requests Invoices Report -> sees 0 invoices (isolated from Org A)
      const invRepRes = await request
        .get('/api/reports/invoices')
        .set(authHeader(orgB.accessToken));
      expect(invRepRes.status).toBe(200);
      expect(invRepRes.body.data.items).toHaveLength(0);
      expect(invRepRes.body.data.summary.grossInvoiceAmount).toBe(0);

      // Unauthenticated request -> 401
      const unauthRes = await request.get('/api/reports/aging');
      expect(unauthRes.status).toBe(401);
    });
  });
});
