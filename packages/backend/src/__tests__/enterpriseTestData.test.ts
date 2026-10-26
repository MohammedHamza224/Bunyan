import { prisma } from '../lib/prisma';
import { request, createTestOrg, authHeader } from './helpers';
import { getCustomerStatementReport } from '../services/reportingService';

describe('Enterprise 6-Customer Test Data Generation (بيانات 6 عملاء مؤسسية)', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let preExistingClientId: string;

  beforeAll(async () => {
    org = await createTestOrg('enterprise-test-data');

    // Create a real business client to verify strict isolation
    const preClient = await prisma.client.create({
      data: {
        organizationId: org.orgId,
        nameAr: 'شركة المقاولات الأصلية الحقيقية',
        nameEn: 'Original Real Construction Client',
        clientType: 'COMPANY',
        vatNumber: '319888888800003',
        status: 'ACTIVE',
      },
    });
    preExistingClientId = preClient.id;
  }, 30000);

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
  }, 30000);

  let datasetId: string;

  it('generates the enterprise 6-customer dataset via API with 104 interconnected records', async () => {
    const res = await request
      .post('/api/test-data/generate')
      .set(authHeader(org.accessToken))
      .send({
        scenario: 'enterprise_six_customers',
        name: 'مجموعة البيانات المؤسسية الشاملة - اختبار آلي',
        description: 'مجموعة تجريبية تغطي 6 عملاء ومشاريع ومستخلصات وفواتير وسندات قبض',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.scenario).toBe('enterprise_six_customers');
    expect(res.body.data.recordCount).toBe(104);

    datasetId = res.body.data.datasetId;
    expect(datasetId).toBeDefined();

    // Verify entity distribution in database
    const records = await prisma.testDatasetRecord.findMany({
      where: { datasetId },
    });
    expect(records.length).toBe(104);

    const counts: Record<string, number> = {};
    for (const r of records) {
      counts[r.entityType] = (counts[r.entityType] || 0) + 1;
    }

    expect(counts['Client']).toBe(6);
    expect(counts['Site']).toBe(15);
    expect(counts['WorkEntry']).toBe(45);
    expect(counts['Statement']).toBe(13);
    expect(counts['Invoice']).toBe(14);
    expect(counts['Payment']).toBe(11);
  }, 45000);

  it('reconciles Customer Account Statements for all 6 generated customers', async () => {
    const clientRecords = await prisma.testDatasetRecord.findMany({
      where: { datasetId, entityType: 'Client' },
    });
    expect(clientRecords.length).toBe(6);

    for (const cRec of clientRecords) {
      const client = await prisma.client.findUnique({
        where: { id: cRec.entityId },
        include: { invoices: true },
      });
      expect(client).toBeDefined();

      const report = await getCustomerStatementReport(org.orgId, {
        clientId: client!.id,
        dateFrom: '2025-01-01',
        dateTo: '2026-12-31',
      });

      const approvedInvs = client!.invoices.filter(
        (inv) => inv.status === 'APPROVED' || inv.status === 'SENT'
      );
      const totalApprovedVal = approvedInvs.reduce((acc, inv) => acc + Number(inv.totalAmount), 0);
      const totalPaidVal = client!.invoices.reduce((acc, inv) => acc + Number(inv.paidAmount), 0);
      const netRemainingVal = approvedInvs.reduce((acc, inv) => acc + Number(inv.remainingAmount), 0);

      // Financial balance assertions
      expect(Number(report.totalDebits)).toBeCloseTo(totalApprovedVal, 2);
      expect(Number(report.totalCredits)).toBeCloseTo(totalPaidVal, 2);
      expect(Number(report.closingBalance)).toBeCloseTo(netRemainingVal, 2);
      expect(report.reconciled).toBe(true);
    }
  }, 30000);

  it('preserves pre-existing client completely untouched', async () => {
    const preClient = await prisma.client.findUnique({
      where: { id: preExistingClientId },
    });
    expect(preClient).toBeDefined();
    expect(preClient!.nameAr).toBe('شركة المقاولات الأصلية الحقيقية');

    // Ensure it is not tracked in dataset records
    const trackedPreClient = await prisma.testDatasetRecord.findFirst({
      where: { datasetId, entityId: preExistingClientId },
    });
    expect(trackedPreClient).toBeNull();
  });

  it('safely purges the test dataset without affecting pre-existing records', async () => {
    const deleteRes = await request
      .post(`/api/test-data/datasets/${datasetId}/purge`)
      .set(authHeader(org.accessToken));

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.data.deletedCount).toBe(104);

    // Verify dataset is marked PURGED
    const purgedDataset = await prisma.testDataset.findUnique({
      where: { id: datasetId },
    });
    expect(purgedDataset?.status).toBe('PURGED');
    expect(purgedDataset?.recordCount).toBe(0);

    // Verify pre-existing client still exists
    const preClientAfter = await prisma.client.findUnique({
      where: { id: preExistingClientId },
    });
    expect(preClientAfter).toBeDefined();
    expect(preClientAfter!.nameAr).toBe('شركة المقاولات الأصلية الحقيقية');

    // Verify test clients were deleted
    const remainingTestClients = await prisma.client.findMany({
      where: {
        organizationId: org.orgId,
        id: { not: preExistingClientId },
      },
    });
    expect(remainingTestClients.length).toBe(0);
  }, 30000);
});
