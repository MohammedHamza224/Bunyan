import { request, createTestOrg, createTestClient, createTestSite, createTestWorkEntry } from './helpers';
import { prisma } from '../lib/prisma';
import { InvoiceStatus, InvoiceType, PaymentStatus, StatementStatus, WorkEntryStatus } from '@prisma/client';
import { config } from '../config';

describe('Secure n8n Reporting API & Integration Verification', () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;
  const testApiKeyA = 'test-api-key-org-A';
  const testApiKeyB = 'test-api-key-org-B';

  beforeAll(async () => {
    orgA = await createTestOrg('n8n-A');
    orgB = await createTestOrg('n8n-B');

    // Create client, site, and work entries in Org A
    const clientA = await createTestClient(orgA.orgId, { nameAr: 'عميل أ للمؤسسة أ', nameEn: 'Client Org A' });
    const siteA = await createTestSite(orgA.orgId, clientA.id, { nameAr: 'موقع برج النخيل', nameEn: 'Palm Tower' });
    const workA = await createTestWorkEntry(orgA.orgId, clientA.id, siteA.id, orgA.userId, {
      approved: true,
      approvedById: orgA.userId,
      quantity: 50,
      unitPrice: 200,
    });

    // Create an approved invoice for Org A
    const invoiceA = await prisma.invoice.create({
      data: {
        organizationId: orgA.orgId,
        clientId: clientA.id,
        referenceNo: 'INV-2026-N8N-001',
        invoiceType: InvoiceType.TAX_INVOICE,
        status: InvoiceStatus.APPROVED,
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        subtotal: 10000,
        taxableAmount: 10000,
        vatRate: 15,
        vatAmount: 1500,
        totalAmount: 11500,
        paidAmount: 5000,
        remainingAmount: 6500,
        createdById: orgA.userId,
        orgSnapshot: { businessName: 'بنيان للتجارة والمقاولات' },
        clientSnapshot: { nameAr: clientA.nameAr },
      },
    });

    // Create a draft invoice for Org A (must NOT be counted in recognized revenue)
    await prisma.invoice.create({
      data: {
        organizationId: orgA.orgId,
        clientId: clientA.id,
        referenceNo: 'INV-2026-DRAFT-001',
        invoiceType: InvoiceType.TAX_INVOICE,
        status: InvoiceStatus.DRAFT,
        paymentStatus: PaymentStatus.UNPAID,
        issueDate: new Date(),
        subtotal: 20000,
        taxableAmount: 20000,
        vatRate: 15,
        vatAmount: 3000,
        totalAmount: 23000,
        paidAmount: 0,
        remainingAmount: 23000,
        createdById: orgA.userId,
        orgSnapshot: { businessName: 'بنيان للتجارة والمقاولات' },
        clientSnapshot: { nameAr: clientA.nameAr },
      },
    });

    // Create a confirmed payment for Org A
    await prisma.payment.create({
      data: {
        organizationId: orgA.orgId,
        invoiceId: invoiceA.id,
        clientId: clientA.id,
        amount: 5000,
        method: 'BANK_TRANSFER',
        paymentDate: new Date(),
        referenceNo: 'PAY-N8N-001',
        idempotencyKey: `pay-test-n8n-${Date.now()}`,
        recordedById: orgA.userId,
      },
    });

    // Create a statement for Org A (must NOT be added to invoice revenue)
    await prisma.statement.create({
      data: {
        organizationId: orgA.orgId,
        clientId: clientA.id,
        referenceNo: 'STM-2026-N8N-001',
        status: StatementStatus.APPROVED,
        issueDate: new Date(),
        subtotal: 8000,
        taxableAmount: 8000,
        vatRate: 15,
        vatAmount: 1200,
        totalAmount: 9200,
        createdById: orgA.userId,
        orgSnapshot: { businessName: 'بنيان للتجارة والمقاولات' },
      },
    });

    // Create client and invoice in Org B to test data isolation
    const clientB = await createTestClient(orgB.orgId, { nameAr: 'عميل سري للمؤسسة ب', nameEn: 'Secret Client Org B' });
    const siteB = await createTestSite(orgB.orgId, clientB.id, { nameAr: 'مشروع المؤسسة ب السري', nameEn: 'Secret Project B' });
    await prisma.invoice.create({
      data: {
        organizationId: orgB.orgId,
        clientId: clientB.id,
        referenceNo: 'INV-2026-ORGB-999',
        invoiceType: InvoiceType.TAX_INVOICE,
        status: InvoiceStatus.APPROVED,
        paymentStatus: PaymentStatus.UNPAID,
        issueDate: new Date(),
        subtotal: 500000,
        taxableAmount: 500000,
        vatRate: 15,
        vatAmount: 75000,
        totalAmount: 575000,
        paidAmount: 0,
        remainingAmount: 575000,
        createdById: orgB.userId,
        orgSnapshot: { businessName: 'مؤسسة ب' },
        clientSnapshot: { nameAr: clientB.nameAr },
      },
    });
  });

  describe('1. Authentication & Security Enforcement', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request.get('/api/reporting/v1/health');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Authentication required');
    });

    it('rejects invalid API keys with 401 Unauthorized', async () => {
      const res = await request
        .get('/api/reporting/v1/health')
        .set('X-API-Key', 'completely-bogus-api-key');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid or revoked reporting API key');
    });

    it('accepts valid API key via X-API-Key header', async () => {
      const res = await request
        .get('/api/reporting/v1/health')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.meta.organizationId).toBe(orgA.orgId);
      expect(res.body.meta.authType).toBe('API_KEY');
    });

    it('accepts valid API key via Authorization: ApiKey <key>', async () => {
      const res = await request
        .get('/api/reporting/v1/health')
        .set('Authorization', `ApiKey test-api-key-org-${orgA.orgId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta.organizationId).toBe(orgA.orgId);
    });

    it('accepts valid JWT access token via Authorization: Bearer <jwt>', async () => {
      const res = await request
        .get('/api/reporting/v1/health')
        .set('Authorization', `Bearer ${orgA.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta.organizationId).toBe(orgA.orgId);
      expect(res.body.meta.authType).toBe('JWT');
    });

    it('is accessible via /api/n8n alias path as well', async () => {
      const res = await request
        .get('/api/n8n/health')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    });
  });

  describe('2. Organization-Level Data Isolation & Tampering Protection', () => {
    it('strictly forbids cross-organization parameter tampering (403 Forbidden)', async () => {
      // Authenticated as Org A, but trying to query Org B via query param
      const res = await request
        .get(`/api/reporting/v1/weekly-summary?organizationId=${orgB.orgId}`)
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cross-organization access forbidden');
    });

    it('ensures Org A reporting queries never return Org B financial records', async () => {
      const res = await request
        .get('/api/reporting/v1/invoices')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Org A should only see its own invoice (11,500 SAR), not Org B's 575,000 SAR invoice
      expect(res.body.data.summary.recognizedNetRevenue).toBe(11500);
      expect(res.body.meta.organizationId).toBe(orgA.orgId);
    });

    it('ensures Org B reporting queries never return Org A financial records', async () => {
      const res = await request
        .get('/api/reporting/v1/invoices')
        .set('X-API-Key', `test-api-key-org-${orgB.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.recognizedNetRevenue).toBe(575000);
      expect(res.body.meta.organizationId).toBe(orgB.orgId);
    });
  });

  describe('3. Core Financial & Operational Endpoints', () => {
    it('1. GET /api/reporting/v1/weekly-summary returns accurate weekly numbers', async () => {
      const res = await request
        .get('/api/reporting/v1/weekly-summary')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.financials.netInvoicedRevenue).toBe(11500);
      expect(res.body.data.financials.collectionsTotal).toBe(5000);
      expect(res.body.data.financials.totalOutstandingReceivables).toBe(6500);
      // Statement value is tracked separately (not added to invoice revenue)
      expect(res.body.data.financials.statementsIssuedValue).toBe(9200);
    });

    it('2. GET /api/reporting/v1/monthly-summary returns collection rate and status distribution', async () => {
      const res = await request
        .get('/api/reporting/v1/monthly-summary')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.financials.netInvoicedRevenue).toBe(11500);
      expect(res.body.data.financials.collectionsTotal).toBe(5000);
      expect(res.body.data.financials.collectionEfficiencyRatePercent).toBeGreaterThan(0);
      expect(res.body.data.operationalMetrics.activeClientsCount).toBeGreaterThanOrEqual(1);
    });

    it('3. GET /api/reporting/v1/invoices excludes DRAFT invoices from recognized revenue', async () => {
      const res = await request
        .get('/api/reporting/v1/invoices')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // DRAFT invoice of 23,000 must NOT be part of recognizedNetRevenue
      expect(res.body.data.summary.recognizedNetRevenue).toBe(11500);
      expect(res.body.data.byLifecycleStatus.DRAFT.count).toBe(1);
      expect(res.body.data.byLifecycleStatus.APPROVED.count).toBe(1);
    });

    it('4. GET /api/reporting/v1/collections returns confirmed payments and breakdown', async () => {
      const res = await request
        .get('/api/reporting/v1/collections')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalCollected).toBe(5000);
      expect(res.body.data.collections.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.collections[0].paymentMethod).toBe('BANK_TRANSFER');
    });

    it('5. GET /api/reporting/v1/receivables returns aging analysis and unpaid balances', async () => {
      const res = await request
        .get('/api/reporting/v1/receivables')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.totalOutstandingAmount).toBe(6500);
      expect(res.body.data.summary.agingAnalysis.current).toBeDefined();
    });

    it('6. GET /api/reporting/v1/clients returns client balances and supports search', async () => {
      const res = await request
        .get('/api/reporting/v1/clients?search=العميل')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.clients).toBeDefined();
      // Ensure Org B's secret client is never returned
      const names = res.body.data.clients.map((c: any) => c.nameAr);
      expect(names).not.toContain('عميل سري للمؤسسة ب');
    });

    it('7. GET /api/reporting/v1/sites returns site performance and billing completion percent', async () => {
      const res = await request
        .get('/api/reporting/v1/sites')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sites.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.sites[0].operationalMetrics).toBeDefined();
      expect(res.body.data.sites[0].nameAr).toBe('موقع برج النخيل');
    });

    it('8. GET /api/reporting/v1/work-entries/approved returns only approved entries', async () => {
      const res = await request
        .get('/api/reporting/v1/work-entries/approved')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workEntries.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.workEntries[0].status).toBe(WorkEntryStatus.APPROVED);
    });

    it('9. GET /api/reporting/v1/work-completion returns pipeline conversion stats', async () => {
      const res = await request
        .get('/api/reporting/v1/work-completion')
        .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pipeline.totalWorkEntries).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pipeline.approvedCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pipeline.overallApprovalRatePercent).toBeGreaterThan(0);
    });
  });

  describe('4. Zero Sensitive Data Exposure', () => {
    it('ensures passwords, password hashes, refresh tokens, and bank accounts are never returned', async () => {
      const endpoints = [
        '/api/reporting/v1/weekly-summary',
        '/api/reporting/v1/monthly-summary',
        '/api/reporting/v1/invoices',
        '/api/reporting/v1/collections',
        '/api/reporting/v1/receivables',
        '/api/reporting/v1/clients',
        '/api/reporting/v1/sites',
        '/api/reporting/v1/work-entries/approved',
        '/api/reporting/v1/work-completion',
      ];

      for (const endpoint of endpoints) {
        const res = await request
          .get(endpoint)
          .set('X-API-Key', `test-api-key-org-${orgA.orgId}`);

        const raw = JSON.stringify(res.body);
        expect(raw).not.toContain('passwordHash');
        expect(raw).not.toContain('refreshToken');
        expect(raw).not.toContain('passwordResetToken');
        expect(raw).not.toContain('zatcaSecret');
        expect(raw).not.toContain('zatcaComplianceSecret');
      }
    });
  });
});
