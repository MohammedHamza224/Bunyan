// =============================================================
// Tests: Work Entries — Core Business Rules
// =============================================================
import { request, createTestOrg, createTestClient, createTestSite, createTestWorkEntry, createTestWorkItem, authHeader } from './helpers';
import { prisma } from '../lib/prisma';

describe('Work Entries — Business Rules', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let clientId: string;
  let siteId: string;
  let workItemId: string;

  beforeAll(async () => {
    org = await createTestOrg('work-entries');
    const client = await createTestClient(org.orgId);
    const site = await createTestSite(org.orgId, client.id);
    const item = await createTestWorkItem(org.orgId);
    clientId = client.id;
    siteId = site.id;
    workItemId = item.id;
  });

  describe('Creating work entries', () => {
    it('creates a work entry and calculates totalAmount', async () => {
      const res = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          siteId,
          itemNameAr: 'دهان داخلي',
          unit: 'م²',
          quantity: 50,
          unitPrice: 25,
          workDate: '2024-01-15',
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.totalAmount)).toBe(1250); // 50 * 25
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('populates snapshot data from work item template', async () => {
      const res = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          siteId,
          workItemTemplateId: workItemId,
          quantity: 10,
          unitPrice: 100,
          workDate: '2024-01-15',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.itemNameAr).toBe('بند اختباري');
      expect(res.body.data.unit).toBe('م²');
    });
  });

  describe('Approval workflow', () => {
    it('transitions DRAFT → PENDING_APPROVAL → APPROVED', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);

      // Submit
      const submitRes = await request
        .post(`/api/work-entries/${entry.id}/submit`)
        .set(authHeader(org.accessToken));
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.data.status).toBe('PENDING_APPROVAL');

      // Approve (selfApprovalAllowed = true by default)
      const approveRes = await request
        .post(`/api/work-entries/${entry.id}/approve`)
        .set(authHeader(org.accessToken));
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');
      expect(approveRes.body.data.approvedById).toBeTruthy();
      expect(approveRes.body.data.approvedAt).toBeTruthy();
    });

    it('records rejector and reason on rejection', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);

      await request.post(`/api/work-entries/${entry.id}/submit`).set(authHeader(org.accessToken));

      const res = await request
        .post(`/api/work-entries/${entry.id}/reject`)
        .set(authHeader(org.accessToken))
        .send({ rejectionReason: 'الكمية غير صحيحة' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.rejectionReason).toBe('الكمية غير صحيحة');
    });

    it('prevents editing an APPROVED work entry', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId, { approved: true });

      const res = await request
        .put(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken))
        .send({ quantity: 99 });

      expect(res.status).toBe(422);
    });
  });

  describe('Template price isolation', () => {
    it('changing template price does not affect existing entries', async () => {
      const item = await createTestWorkItem(org.orgId, { defaultPrice: 100 });

      // Create entry using template
      const entryRes = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          siteId,
          workItemTemplateId: item.id,
          quantity: 10,
          unitPrice: 100, // use template price
          workDate: '2024-01-15',
        });
      expect(entryRes.status).toBe(201);
      const entryId = entryRes.body.data.id;

      // Update template price
      await request
        .put(`/api/work-items/${item.id}`)
        .set(authHeader(org.accessToken))
        .send({ defaultPrice: 999 });

      // Entry price should be unchanged
      const entryCheck = await request
        .get(`/api/work-entries/${entryId}`)
        .set(authHeader(org.accessToken));

      expect(Number(entryCheck.body.data.unitPrice)).toBe(100);
      expect(Number(entryCheck.body.data.totalAmount)).toBe(1000);
    });
  });
});
