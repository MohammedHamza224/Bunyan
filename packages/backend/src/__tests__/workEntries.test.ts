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

    it('allows editing a DRAFT work entry and recalculates totalAmount', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId, { quantity: 10, unitPrice: 50 });

      const res = await request
        .put(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken))
        .send({
          itemNameAr: 'بند معدل',
          unit: 'م²',
          quantity: 25,
          unitPrice: 60,
          workDate: '2024-02-01',
          descriptionAr: 'وصف جديد ومعدل',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.itemNameAr).toBe('بند معدل');
      expect(Number(res.body.data.quantity)).toBe(25);
      expect(Number(res.body.data.unitPrice)).toBe(60);
      expect(Number(res.body.data.totalAmount)).toBe(1500); // 25 * 60

      // Verify DB record
      const dbEntry = await prisma.workEntry.findUnique({ where: { id: entry.id } });
      expect(Number(dbEntry?.totalAmount)).toBe(1500);
      expect(dbEntry?.itemDescAr).toBe('وصف جديد ومعدل');

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.orgId,
          entityId: entry.id,
          action: 'UPDATE',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).toBeTruthy();
      expect(auditLog?.metadata).toHaveProperty('previousQuantity', '10');
      expect(auditLog?.metadata).toHaveProperty('newQuantity', '25');
    });

    it('allows editing a REJECTED work entry', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);
      await request.post(`/api/work-entries/${entry.id}/submit`).set(authHeader(org.accessToken));
      await request.post(`/api/work-entries/${entry.id}/reject`).set(authHeader(org.accessToken)).send({ rejectionReason: 'مرفوض للتعديل' });

      const res = await request
        .put(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken))
        .send({
          itemNameAr: 'بند بعد التعديل',
          unit: 'م²',
          quantity: 12,
          unitPrice: 80,
          workDate: '2024-02-02',
        });

      expect(res.status).toBe(200);
      expect(Number(res.body.data.totalAmount)).toBe(960);
    });

    it('rejects invalid edit payloads with negative quantity or unit price', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);

      const res = await request
        .put(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken))
        .send({
          quantity: -5,
          unitPrice: 100,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Deleting work entries', () => {
    it('deletes an eligible DRAFT work entry and records an audit log', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);

      const res = await request
        .delete(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion from DB
      const dbEntry = await prisma.workEntry.findUnique({ where: { id: entry.id } });
      expect(dbEntry).toBeNull();

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.orgId,
          entityId: entry.id,
          action: 'DELETE',
        },
      });
      expect(auditLog).toBeTruthy();
    });

    it('deletes a REJECTED work entry', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);
      await request.post(`/api/work-entries/${entry.id}/submit`).set(authHeader(org.accessToken));
      await request.post(`/api/work-entries/${entry.id}/reject`).set(authHeader(org.accessToken)).send({ rejectionReason: 'مرفوض' });

      const res = await request
        .delete(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      const dbEntry = await prisma.workEntry.findUnique({ where: { id: entry.id } });
      expect(dbEntry).toBeNull();
    });

    it('blocks deletion of a work entry with billedQuantity > 0', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);
      await prisma.workEntry.update({
        where: { id: entry.id },
        data: { billedQuantity: 5, status: 'PARTIALLY_BILLED' },
      });

      const res = await request
        .delete(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(422);
      const errMsg = res.body.error?.message || res.body.error || '';
      expect(errMsg).toContain('5');
    });

    it('blocks deletion of a work entry linked to an active Statement', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId, { approved: true });

      // Create an active statement linked to this entry
      const statement = await prisma.statement.create({
        data: {
          organizationId: org.orgId,
          clientId,
          referenceNo: 'STM-TEST-0001',
          issueDate: new Date(),
          orgSnapshot: {},
          subtotal: 1000,
          taxableAmount: 1000,
          vatRate: 15,
          vatAmount: 150,
          totalAmount: 1150,
          status: 'APPROVED',
          createdById: org.userId,
          lines: {
            create: {
              itemNameAr: entry.itemNameAr,
              unit: entry.unit,
              approvedQuantity: 10,
              unitPrice: 100,
              lineTotal: 1000,
              workEntryId: entry.id,
            },
          },
        },
      });

      const res = await request
        .delete(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(422);
      const errMsg = res.body.error?.message || res.body.error || '';
      expect(errMsg).toContain(statement.referenceNo);
      expect(errMsg).toContain('APPROVED');
    });

    it('allows deletion of a work entry if linked statement is CANCELLED', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);

      // Create a CANCELLED statement linked to this entry
      await prisma.statement.create({
        data: {
          organizationId: org.orgId,
          clientId,
          referenceNo: 'STM-CANCELLED-0001',
          issueDate: new Date(),
          orgSnapshot: {},
          subtotal: 1000,
          taxableAmount: 1000,
          vatRate: 15,
          vatAmount: 150,
          totalAmount: 1150,
          status: 'CANCELLED',
          createdById: org.userId,
          lines: {
            create: {
              itemNameAr: entry.itemNameAr,
              unit: entry.unit,
              approvedQuantity: 10,
              unitPrice: 100,
              lineTotal: 1000,
              workEntryId: entry.id,
            },
          },
        },
      });

      const res = await request
        .delete(`/api/work-entries/${entry.id}`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      const dbEntry = await prisma.workEntry.findUnique({ where: { id: entry.id } });
      expect(dbEntry).toBeNull();
    });

    it('enforces multi-tenant isolation on edit and delete', async () => {
      const otherOrg = await createTestOrg('other-tenant');
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);

      // Other org tries to edit
      const editRes = await request
        .put(`/api/work-entries/${entry.id}`)
        .set(authHeader(otherOrg.accessToken))
        .send({ itemNameAr: 'محاولة اختراق' });
      expect([403, 404]).toContain(editRes.status);

      // Other org tries to delete
      const deleteRes = await request
        .delete(`/api/work-entries/${entry.id}`)
        .set(authHeader(otherOrg.accessToken));
      expect([403, 404]).toContain(deleteRes.status);
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
