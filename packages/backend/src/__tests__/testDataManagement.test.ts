import { prisma } from '../lib/prisma';
import { request, createTestOrg, authHeader } from './helpers';
import { getCustomerStatementReport } from '../services/reportingService';

describe('Test Data Management System (إدارة البيانات التجريبية)', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let preExistingClientId: string;

  beforeAll(async () => {
    org = await createTestOrg('test-data-mgr');

    // Create a pre-existing business client to prove it will NEVER be deleted or modified
    const preClient = await prisma.client.create({
      data: {
        organizationId: org.orgId,
        nameAr: 'عميل حقيقي دائم للمؤسسة',
        nameEn: 'Permanent Real Business Client',
        clientType: 'COMPANY',
        vatNumber: '319999999900003',
        status: 'ACTIVE',
      },
    });
    preExistingClientId = preClient.id;
  });

  afterAll(async () => {
    try {
      await prisma.testDatasetRecord.deleteMany({
        where: { dataset: { organizationId: org.orgId } },
      });
      await prisma.testDataset.deleteMany({
        where: { organizationId: org.orgId },
      });
      await prisma.payment.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.invoiceLine.deleteMany({
        where: { invoice: { organizationId: org.orgId } },
      });
      await prisma.invoice.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.statementLine.deleteMany({
        where: { statement: { organizationId: org.orgId } },
      });
      await prisma.statement.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.workEntry.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.site.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.client.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.user.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.orgSettings.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.organization.deleteMany({ where: { id: org.orgId } });
    } catch {
      // ignore
    }
  });

  it('generates a complete, interconnected contracting test dataset', async () => {
    const res = await request
      .post('/api/test-data/generate')
      .set(authHeader(org.accessToken))
      .send({
        scenario: 'standard_contracting',
        name: 'حزمة اختبار دورة المقاولات الشاملة',
        description: 'اختبار مؤتمت للتحقق من الربط المالي والعلائقي',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.datasetId).toBeDefined();
    expect(data.recordCount).toBe(8); // 1 Client + 1 Site + 3 WorkEntries + 1 Statement + 1 Invoice + 1 Payment

    // Verify all 8 records exist in real database
    const trackedRecords = await prisma.testDatasetRecord.findMany({
      where: { datasetId: data.datasetId },
    });
    expect(trackedRecords.length).toBe(8);

    const clientRec = trackedRecords.find((r) => r.entityType === 'Client');
    const siteRec = trackedRecords.find((r) => r.entityType === 'Site');
    const invRec = trackedRecords.find((r) => r.entityType === 'Invoice');
    const payRec = trackedRecords.find((r) => r.entityType === 'Payment');
    const stmtRec = trackedRecords.find((r) => r.entityType === 'Statement');

    expect(clientRec).toBeDefined();
    expect(siteRec).toBeDefined();
    expect(invRec).toBeDefined();
    expect(payRec).toBeDefined();
    expect(stmtRec).toBeDefined();

    // Verify financial integrity
    const invoiceInDb = await prisma.invoice.findUnique({
      where: { id: invRec!.entityId },
      include: { payments: true, statement: true },
    });
    expect(invoiceInDb).toBeDefined();
    expect(Number(invoiceInDb!.totalAmount)).toBe(80960);
    expect(Number(invoiceInDb!.paidAmount)).toBe(50000);
    expect(Number(invoiceInDb!.remainingAmount)).toBe(30960);
    expect(invoiceInDb!.paymentStatus).toBe('PARTIALLY_PAID');
    expect(invoiceInDb!.statementId).toBe(stmtRec!.entityId);

    // Verify Customer Account Statement calculation
    const statementReport = await getCustomerStatementReport(org.orgId, {
      clientId: clientRec!.entityId,
    });
    expect(Number(statementReport.summary.totalDebits)).toBe(80960);
    expect(Number(statementReport.summary.totalCredits)).toBe(50000);
    expect(Number(statementReport.summary.closingBalance)).toBe(30960);
  });

  it('lists datasets and retrieves dataset details', async () => {
    const listRes = await request
      .get('/api/test-data/datasets')
      .set(authHeader(org.accessToken));

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    const ds = listRes.body.data[0];
    expect(ds.summary.Client).toBe(1);
    expect(ds.summary.Site).toBe(1);
    expect(ds.summary.WorkEntry).toBe(3);
    expect(ds.summary.Statement).toBe(1);
    expect(ds.summary.Invoice).toBe(1);
    expect(ds.summary.Payment).toBe(1);

    const detailsRes = await request
      .get(`/api/test-data/datasets/${ds.id}`)
      .set(authHeader(org.accessToken));

    expect(detailsRes.status).toBe(200);
    expect(detailsRes.body.data.entities.clients.length).toBe(1);
    expect(detailsRes.body.data.entities.invoices.length).toBe(1);
    expect(detailsRes.body.data.entities.payments.length).toBe(1);
  });

  it('allows standard editing of generated records via normal API endpoints', async () => {
    const datasetsRes = await request
      .get('/api/test-data/datasets')
      .set(authHeader(org.accessToken));
    const dsId = datasetsRes.body.data[0].id;

    const detailsRes = await request
      .get(`/api/test-data/datasets/${dsId}`)
      .set(authHeader(org.accessToken));
    const generatedClient = detailsRes.body.data.entities.clients[0];

    // Edit the client via regular PUT /api/clients/:id
    const editRes = await request
      .put(`/api/clients/${generatedClient.id}`)
      .set(authHeader(org.accessToken))
      .send({
        nameAr: `${generatedClient.nameAr} - معدل تجريبياً`,
        phone: '0599999999',
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.data.nameAr).toContain('معدل تجريبياً');
  });

  it('safely purges ONLY the test dataset records and preserves pre-existing business records', async () => {
    const datasetsRes = await request
      .get('/api/test-data/datasets')
      .set(authHeader(org.accessToken));
    const dsId = datasetsRes.body.data[0].id;

    // Purge dataset
    const purgeRes = await request
      .post(`/api/test-data/datasets/${dsId}/purge`)
      .set(authHeader(org.accessToken));

    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.success).toBe(true);
    expect(purgeRes.body.data.deletedCount).toBe(8);

    // Verify dataset status is now PURGED
    const updatedDs = await prisma.testDataset.findUnique({
      where: { id: dsId },
    });
    expect(updatedDs?.status).toBe('PURGED');
    expect(updatedDs?.recordCount).toBe(0);

    // CRUCIAL: Verify pre-existing business client is completely untouched!
    const preExistingClient = await prisma.client.findUnique({
      where: { id: preExistingClientId },
    });
    expect(preExistingClient).not.toBeNull();
    expect(preExistingClient?.nameAr).toBe('عميل حقيقي دائم للمؤسسة');
  });
});
