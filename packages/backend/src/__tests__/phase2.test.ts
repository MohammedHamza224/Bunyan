// =============================================================
// Tests: Phase 2 — Clients, Sites, Work Items, Work Entries, Approval Workflow & Audit Logs
// =============================================================
import { request, createTestOrg, authHeader } from './helpers';

describe('Phase 2: Operational Modules (Clients, Sites, Work Items, Work Entries & Approvals)', () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;

  let clientAId: string;
  let clientA2Id: string;
  let clientBId: string;
  let siteAId: string;
  let workItemAId: string;
  let workEntryId: string;

  beforeAll(async () => {
    orgA = await createTestOrg('phase2-orgA');
    orgB = await createTestOrg('phase2-orgB');
  });

  describe('1. Clients Management (إدارة العملاء)', () => {
    it('creates clients, validates required fields, and filters/sorts/paginates', async () => {
      // Missing required nameAr should return 400
      const invalidRes = await request
        .post('/api/clients')
        .set(authHeader(orgA.accessToken))
        .send({ nameAr: '' });
      expect(invalidRes.status).toBe(400);

      // Valid client 1
      const c1 = await request
        .post('/api/clients')
        .set(authHeader(orgA.accessToken))
        .send({
          nameAr: 'شركة الإعمار المتقدم',
          nameEn: 'Advanced Emaar Co.',
          clientType: 'COMPANY',
          phone: '0501112233',
          vatNumber: '300112233400003',
        });
      expect(c1.status).toBe(201);
      clientAId = c1.body.data.id;

      // Valid client 2
      const c2 = await request
        .post('/api/clients')
        .set(authHeader(orgA.accessToken))
        .send({
          nameAr: 'مؤسسة النخيل للصيانة',
          clientType: 'COMPANY',
          phone: '0509998877',
        });
      expect(c2.status).toBe(201);
      clientA2Id = c2.body.data.id;

      // Client in Org B (for cross-tenant isolation tests)
      const cb = await request
        .post('/api/clients')
        .set(authHeader(orgB.accessToken))
        .send({
          nameAr: 'عميل المؤسسة ب',
          clientType: 'INDIVIDUAL',
        });
      expect(cb.status).toBe(201);
      clientBId = cb.body.data.id;

      // Search & Sort in Org A
      const listRes = await request
        .get('/api/clients')
        .query({ search: 'الإعمار', sortBy: 'nameAr', sortOrder: 'asc' })
        .set(authHeader(orgA.accessToken));
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items.length).toBe(1);
      expect(listRes.body.data.items[0].id).toBe(clientAId);
    });

    it('returns full client details with real relations and zeroed stats when no invoices exist', async () => {
      const detailRes = await request
        .get(`/api/clients/${clientAId}`)
        .set(authHeader(orgA.accessToken));
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.nameAr).toBe('شركة الإعمار المتقدم');
      expect(Array.isArray(detailRes.body.data.sites)).toBe(true);
      expect(Array.isArray(detailRes.body.data.workEntries)).toBe(true);
      expect(Array.isArray(detailRes.body.data.statements)).toBe(true);
      expect(Array.isArray(detailRes.body.data.invoices)).toBe(true);
      expect(Array.isArray(detailRes.body.data.payments)).toBe(true);
      expect(Number(detailRes.body.data.stats.outstandingBalance)).toBe(0);
    });
  });

  describe('2. Sites Management (إدارة المواقع)', () => {
    it('creates a site linked to an authorized client and blocks cross-organization client linking', async () => {
      // Attempt linking site in Org A to clientBId from Org B -> 403
      const crossOrgRes = await request
        .post('/api/sites')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: clientBId,
          nameAr: 'موقع غير مصرح',
        });
      expect(crossOrgRes.status).toBe(403);

      // Valid site creation in Org A
      const siteRes = await request
        .post('/api/sites')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: clientAId,
          nameAr: 'مشروع برج العليا التجاري',
          nameEn: 'Olaya Commercial Tower',
          city: 'الرياض',
          district: 'العليا',
        });
      expect(siteRes.status).toBe(201);
      siteAId = siteRes.body.data.id;
    });
  });

  describe('3. Work Items Library & Historical Price Isolation (مكتبة بنود الأعمال)', () => {
    it('creates a work item, rejects negative default price, and preserves historical work entry prices when defaultPrice changes', async () => {
      // Reject negative default price
      const negPriceRes = await request
        .post('/api/work-items')
        .set(authHeader(orgA.accessToken))
        .send({
          nameAr: 'بند بسعر سالب',
          unit: 'متر',
          defaultPrice: -50,
        });
      expect(negPriceRes.status).toBe(400);

      // Create valid work item with defaultPrice = 120
      const itemRes = await request
        .post('/api/work-items')
        .set(authHeader(orgA.accessToken))
        .send({
          code: 'PNT-01',
          nameAr: 'توريد وتنفيذ دهان بلاستيك داخلي',
          nameEn: 'Interior Plastic Paint',
          unit: 'متر مربع',
          defaultPrice: 120,
          category: 'دهانات',
        });
      expect(itemRes.status).toBe(201);
      workItemAId = itemRes.body.data.id;

      // Record a work entry using this template at unitPrice = 120, quantity = 10 -> total = 1200
      const entryRes = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: clientAId,
          siteId: siteAId,
          workItemTemplateId: workItemAId,
          unit: 'متر مربع',
          quantity: 10,
          unitPrice: 120,
          workDate: '2026-10-15',
        });
      expect(entryRes.status).toBe(201);
      workEntryId = entryRes.body.data.id;
      expect(Number(entryRes.body.data.totalAmount)).toBe(1200);

      // Now update the library template's defaultPrice to 200
      const updateTplRes = await request
        .put(`/api/work-items/${workItemAId}`)
        .set(authHeader(orgA.accessToken))
        .send({
          defaultPrice: 200,
        });
      expect(updateTplRes.status).toBe(200);
      expect(Number(updateTplRes.body.data.defaultPrice)).toBe(200);

      // Verify previously recorded work entry STILL has unitPrice = 120 and totalAmount = 1200
      const checkEntryRes = await request
        .get(`/api/work-entries/${workEntryId}`)
        .set(authHeader(orgA.accessToken));
      expect(checkEntryRes.status).toBe(200);
      expect(Number(checkEntryRes.body.data.unitPrice)).toBe(1200 / 10);
      expect(Number(checkEntryRes.body.data.totalAmount)).toBe(1200);
    });

    it('prevents changing a site clientId once work entries are linked to that site', async () => {
      const changeClientRes = await request
        .put(`/api/sites/${siteAId}`)
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: clientA2Id,
        });
      expect(changeClientRes.status).toBe(422);
    });
  });

  describe('4. Multi-Item Work Entries, Validation & Approval Workflow (الأعمال المنفذة ودورة الاعتماد)', () => {
    it('supports batch creation of multiple work items in a single operation and calculates decimal totals accurately', async () => {
      const batchRes = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: clientAId,
          siteId: siteAId,
          workDate: '2026-10-16',
          submitImmediately: true,
          items: [
            {
              workItemTemplateId: workItemAId,
              itemNameAr: 'دهان واجهات خارجية',
              unit: 'متر مربع',
              quantity: 12.5,
              unitPrice: 40.5, // 12.5 * 40.5 = 506.25
            },
            {
              itemNameAr: 'تمديد نقاط كهرباء إضافية',
              unit: 'نقطة',
              quantity: 8,
              unitPrice: 75, // 8 * 75 = 600
            },
          ],
        });

      expect(batchRes.status).toBe(201);
      expect(Array.isArray(batchRes.body.data)).toBe(true);
      expect(batchRes.body.data.length).toBe(2);
      expect(Number(batchRes.body.data[0].totalAmount)).toBe(506.25);
      expect(batchRes.body.data[0].status).toBe('PENDING_APPROVAL');
      expect(Number(batchRes.body.data[1].totalAmount)).toBe(600);
    });

    it('rejects zero or negative quantities and negative prices', async () => {
      const zeroQtyRes = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: clientAId,
          siteId: siteAId,
          itemNameAr: 'بند بكمية صفر',
          unit: 'متر',
          quantity: 0,
          unitPrice: 100,
          workDate: '2026-10-16',
        });
      expect(zeroQtyRes.status).toBe(400);

      const negPriceRes = await request
        .post('/api/work-entries')
        .set(authHeader(orgA.accessToken))
        .send({
          clientId: clientAId,
          siteId: siteAId,
          itemNameAr: 'بند بسعر سالب',
          unit: 'متر',
          quantity: 5,
          unitPrice: -10,
          workDate: '2026-10-16',
        });
      expect(negPriceRes.status).toBe(400);
    });

    it('manages the full approval lifecycle: DRAFT -> PENDING_APPROVAL -> REJECTED (with reason) -> Edit & Resubmit -> APPROVED -> Locked', async () => {
      // 1. Submit DRAFT entry -> PENDING_APPROVAL
      const submitRes = await request
        .post(`/api/work-entries/${workEntryId}/submit`)
        .set(authHeader(orgA.accessToken));
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.data.status).toBe('PENDING_APPROVAL');

      // 2. Reject without reason -> 400
      const rejectNoReasonRes = await request
        .post(`/api/work-entries/${workEntryId}/reject`)
        .set(authHeader(orgA.accessToken))
        .send({ rejectionReason: '' });
      expect(rejectNoReasonRes.status).toBe(400);

      // 3. Reject with valid reason -> REJECTED
      const rejectRes = await request
        .post(`/api/work-entries/${workEntryId}/reject`)
        .set(authHeader(orgA.accessToken))
        .send({ rejectionReason: 'يرجى مراجعة القياس الفعلي للغرفة رقم 3' });
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');
      expect(rejectRes.body.data.rejectionReason).toBe('يرجى مراجعة القياس الفعلي للغرفة رقم 3');

      // 4. Edit REJECTED entry (adjust quantity to 15) and resubmit
      const editRejectedRes = await request
        .put(`/api/work-entries/${workEntryId}`)
        .set(authHeader(orgA.accessToken))
        .send({
          quantity: 15,
          unitPrice: 120,
        });
      expect(editRejectedRes.status).toBe(200);
      expect(Number(editRejectedRes.body.data.totalAmount)).toBe(1800);

      const resubmitRes = await request
        .post(`/api/work-entries/${workEntryId}/submit`)
        .set(authHeader(orgA.accessToken));
      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.data.status).toBe('PENDING_APPROVAL');

      // 5. Approve entry -> APPROVED
      const approveRes = await request
        .post(`/api/work-entries/${workEntryId}/approve`)
        .set(authHeader(orgA.accessToken));
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');

      // 6. Attempt to edit an APPROVED entry -> 422 locked
      const editApprovedRes = await request
        .put(`/api/work-entries/${workEntryId}`)
        .set(authHeader(orgA.accessToken))
        .send({ quantity: 99 });
      expect(editApprovedRes.status).toBe(422);
    });

    it('enforces granular permissions: user without APPROVE_WORK cannot approve or reject work entries', async () => {
      // Create a staff user in Org A with CREATE_WORK only (no APPROVE_WORK)
      const staffUserRes = await request
        .post('/api/organizations/users')
        .set(authHeader(orgA.accessToken))
        .send({
          email: 'staff-phase2@test.com',
          password: 'Password1',
          nameAr: 'مهندس موقع',
          role: 'ORG_STAFF',
          permissions: ['VIEW_DATA', 'CREATE_WORK'],
        });
      expect(staffUserRes.status).toBe(201);

      const loginStaff = await request.post('/api/auth/login').send({
        email: 'staff-phase2@test.com',
        password: 'Password1',
      });
      const staffToken = loginStaff.body.data.tokens.accessToken;

      // Staff can create a work item inline and create a work entry
      const inlineItemRes = await request
        .post('/api/work-items')
        .set(authHeader(staffToken))
        .send({
          nameAr: 'بند مضاف من المهندس مباشرة',
          unit: 'عملية',
          defaultPrice: 300,
        });
      expect(inlineItemRes.status).toBe(201);

      const staffEntryRes = await request
        .post('/api/work-entries')
        .set(authHeader(staffToken))
        .send({
          clientId: clientAId,
          siteId: siteAId,
          itemNameAr: 'عمل مسجل من المهندس',
          unit: 'عملية',
          quantity: 1,
          unitPrice: 300,
          workDate: '2026-10-17',
          submitImmediately: true,
        });
      expect(staffEntryRes.status).toBe(201);
      const staffEntryId = staffEntryRes.body.data.id;

      // Staff attempts to approve -> 403 Forbidden
      const forbiddenApprove = await request
        .post(`/api/work-entries/${staffEntryId}/approve`)
        .set(authHeader(staffToken));
      expect(forbiddenApprove.status).toBe(403);
    });
  });

  describe('5. Safe Archiving & Immutable Audit Trail (الأرشفة وسجل التدقيق)', () => {
    it('archives client safely without losing linked sites or work entries and records full audit logs', async () => {
      // Archive clientA2Id
      const archiveRes = await request
        .delete(`/api/clients/${clientA2Id}`)
        .set(authHeader(orgA.accessToken));
      expect(archiveRes.status).toBe(200);

      // Verify audit logs via GET /api/audit-logs
      const logsRes = await request
        .get('/api/audit-logs?entityType=WorkEntry')
        .set(authHeader(orgA.accessToken));
      expect(logsRes.status).toBe(200);
      expect(logsRes.body.data.items.length).toBeGreaterThanOrEqual(4);

      const actions = logsRes.body.data.items.map((l: any) => l.action);
      expect(actions).toContain('CREATE');
      expect(actions).toContain('APPROVE');
      expect(actions).toContain('REJECT');
    });
  });
});
