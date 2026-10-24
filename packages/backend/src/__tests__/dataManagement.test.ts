// =============================================================
// Comprehensive Tests: Consistent, Flexible, & Secure Data Management
// Clients (العملاء), Sites (المواقع), Work Items (بنود الأعمال)
// =============================================================
import {
  request,
  createTestOrg,
  createTestClient,
  createTestSite,
  createTestWorkItem,
  createTestWorkEntry,
  authHeader,
} from './helpers';
import { prisma } from '../lib/prisma';

describe('Data Management System (Clients, Sites, Work Items)', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;

  beforeAll(async () => {
    org = await createTestOrg('datamgmt-suite');
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Clients Management & Lifecycle
  // ─────────────────────────────────────────────────────────────
  describe('Clients Management', () => {
    it('creates a client with minimal required fields (flexible creation)', async () => {
      const res = await request
        .post('/api/clients')
        .set(authHeader(org.accessToken))
        .send({
          nameAr: 'عميل سريع فقط بالاسم',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nameAr).toBe('عميل سريع فقط بالاسم');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.clientType).toBe('COMPANY'); // sensible default
    });

    it('archives an active client via POST /api/clients/:id/archive and records audit log', async () => {
      const client = await createTestClient(org.orgId, { nameAr: 'عميل للأرشفة' });

      const res = await request
        .post(`/api/clients/${client.id}/archive`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('INACTIVE');

      // Verify in DB
      const dbClient = await prisma.client.findUnique({ where: { id: client.id } });
      expect(dbClient?.status).toBe('INACTIVE');

      // Verify Audit Log
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.orgId,
          entityType: 'Client',
          entityId: client.id,
          action: 'UPDATE',
        },
      });
      expect(auditLog).toBeDefined();
      expect((auditLog?.metadata as any)?.operation).toBe('ARCHIVE');
    });

    it('restores an archived client via POST /api/clients/:id/restore', async () => {
      const client = await createTestClient(org.orgId, {
        nameAr: 'عميل للاستعادة',
        status: 'INACTIVE',
      });

      const res = await request
        .post(`/api/clients/${client.id}/restore`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');

      const dbClient = await prisma.client.findUnique({ where: { id: client.id } });
      expect(dbClient?.status).toBe('ACTIVE');
    });

    it('filters clients list by status (ACTIVE, ARCHIVED, ALL)', async () => {
      const cActive = await createTestClient(org.orgId, { nameAr: 'عميل نشط للفلتر', status: 'ACTIVE' });
      const cArchived = await createTestClient(org.orgId, { nameAr: 'عميل مؤرشف للفلتر', status: 'INACTIVE' });

      // Active only
      const resActive = await request
        .get('/api/clients?status=ACTIVE')
        .set(authHeader(org.accessToken));
      const activeIds = resActive.body.data.items.map((c: any) => c.id);
      expect(activeIds).toContain(cActive.id);
      expect(activeIds).not.toContain(cArchived.id);

      // Archived only
      const resArchived = await request
        .get('/api/clients?status=ARCHIVED')
        .set(authHeader(org.accessToken));
      const archivedIds = resArchived.body.data.items.map((c: any) => c.id);
      expect(archivedIds).toContain(cArchived.id);
      expect(archivedIds).not.toContain(cActive.id);

      // ALL
      const resAll = await request
        .get('/api/clients?status=ALL')
        .set(authHeader(org.accessToken));
      const allIds = resAll.body.data.items.map((c: any) => c.id);
      expect(allIds).toContain(cActive.id);
      expect(allIds).toContain(cArchived.id);
    });

    it('safely deletes a client with zero dependencies when mode=delete', async () => {
      const client = await createTestClient(org.orgId, { nameAr: 'عميل بدون أي ارتباطات للحذف' });

      const res = await request
        .delete(`/api/clients/${client.id}?mode=delete`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbClient = await prisma.client.findUnique({ where: { id: client.id } });
      expect(dbClient).toBeNull();
    });

    it('blocks deletion of a client when dependent sites exist and returns BusinessRuleError', async () => {
      const client = await createTestClient(org.orgId, { nameAr: 'عميل مرتبط بموقع' });
      await createTestSite(org.orgId, client.id, { nameAr: 'موقع تابع للعميل' });

      const res = await request
        .delete(`/api/clients/${client.id}?mode=delete`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(res.body.error.message).toContain('موقع');

      // Verify client still exists in database
      const dbClient = await prisma.client.findUnique({ where: { id: client.id } });
      expect(dbClient).not.toBeNull();
    });

    it('computes canDelete accurately on GET /api/clients', async () => {
      const clientWithZeroDeps = await createTestClient(org.orgId, { nameAr: 'عميل حر' });
      const clientWithDeps = await createTestClient(org.orgId, { nameAr: 'عميل مشغول' });
      await createTestSite(org.orgId, clientWithDeps.id);

      const res = await request
        .get('/api/clients?status=ALL')
        .set(authHeader(org.accessToken));

      const items = res.body.data.items;
      const freeItem = items.find((c: any) => c.id === clientWithZeroDeps.id);
      const busyItem = items.find((c: any) => c.id === clientWithDeps.id);

      expect(freeItem.canDelete).toBe(true);
      expect(busyItem.canDelete).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Sites Management & Lifecycle
  // ─────────────────────────────────────────────────────────────
  describe('Sites Management', () => {
    it('creates a site under an active client', async () => {
      const client = await createTestClient(org.orgId, { nameAr: 'عميل نشط للموقع' });

      const res = await request
        .post('/api/sites')
        .set(authHeader(org.accessToken))
        .send({
          clientId: client.id,
          nameAr: 'موقع أبراج النخيل',
          nameEn: 'Palm Towers Site',
          status: 'ACTIVE',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nameAr).toBe('موقع أبراج النخيل');
    });

    it('blocks creating a site under an archived / inactive client', async () => {
      const archivedClient = await createTestClient(org.orgId, {
        nameAr: 'عميل غير نشط',
        status: 'INACTIVE',
      });

      const res = await request
        .post('/api/sites')
        .set(authHeader(org.accessToken))
        .send({
          clientId: archivedClient.id,
          nameAr: 'موقع مرفوض',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('archives a site via POST /api/sites/:id/archive and marks status CANCELLED', async () => {
      const client = await createTestClient(org.orgId);
      const site = await createTestSite(org.orgId, client.id, { nameAr: 'موقع للأرشفة' });

      const res = await request
        .post(`/api/sites/${site.id}/archive`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');

      const dbSite = await prisma.site.findUnique({ where: { id: site.id } });
      expect(dbSite?.status).toBe('CANCELLED');
    });

    it('restores an archived site via POST /api/sites/:id/restore back to ACTIVE', async () => {
      const client = await createTestClient(org.orgId);
      const site = await createTestSite(org.orgId, client.id, {
        nameAr: 'موقع ملغى للاستعادة',
        status: 'CANCELLED',
      });

      const res = await request
        .post(`/api/sites/${site.id}/restore`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');

      const dbSite = await prisma.site.findUnique({ where: { id: site.id } });
      expect(dbSite?.status).toBe('ACTIVE');
    });

    it('safely deletes a site with zero work entries and zero statements', async () => {
      const client = await createTestClient(org.orgId);
      const site = await createTestSite(org.orgId, client.id, { nameAr: 'موقع فارغ للحذف' });

      const res = await request
        .delete(`/api/sites/${site.id}?mode=delete`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbSite = await prisma.site.findUnique({ where: { id: site.id } });
      expect(dbSite).toBeNull();
    });

    it('blocks deletion of a site when work entries exist', async () => {
      const client = await createTestClient(org.orgId);
      const site = await createTestSite(org.orgId, client.id, { nameAr: 'موقع مرتبط بأعمال' });
      await createTestWorkEntry(org.orgId, client.id, site.id, org.userId);

      const res = await request
        .delete(`/api/sites/${site.id}?mode=delete`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(res.body.error.message.toLowerCase()).toContain('work entry');

      const dbSite = await prisma.site.findUnique({ where: { id: site.id } });
      expect(dbSite).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Work Items Management & Lifecycle
  // ─────────────────────────────────────────────────────────────
  describe('Work Items Management', () => {
    it('creates a work item with standard unit and optional default price', async () => {
      const res = await request
        .post('/api/work-items')
        .set(authHeader(org.accessToken))
        .send({
          nameAr: 'أعمال دهانات داخلية',
          nameEn: 'Interior Painting',
          unit: 'م²',
          unitEn: 'SQM',
          defaultPrice: 45.5,
          code: 'PNT-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nameAr).toBe('أعمال دهانات داخلية');
      expect(res.body.data.isActive).toBe(true);
    });

    it('archives a work item via POST /api/work-items/:id/archive (sets isActive=false)', async () => {
      const item = await createTestWorkItem(org.orgId, { nameAr: 'بند للأرشفة' });

      const res = await request
        .post(`/api/work-items/${item.id}/archive`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      const dbItem = await prisma.workItemTemplate.findUnique({ where: { id: item.id } });
      expect(dbItem?.isActive).toBe(false);
    });

    it('restores an archived work item via POST /api/work-items/:id/restore', async () => {
      const item = await createTestWorkItem(org.orgId, { nameAr: 'بند للاستعادة', isActive: false });

      const res = await request
        .post(`/api/work-items/${item.id}/restore`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(true);

      const dbItem = await prisma.workItemTemplate.findUnique({ where: { id: item.id } });
      expect(dbItem?.isActive).toBe(true);
    });

    it('safely deletes a work item with zero linked work entries', async () => {
      const item = await createTestWorkItem(org.orgId, { nameAr: 'بند بدون ارتباطات' });

      const res = await request
        .delete(`/api/work-items/${item.id}?mode=delete`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbItem = await prisma.workItemTemplate.findUnique({ where: { id: item.id } });
      expect(dbItem).toBeNull();
    });

    it('blocks deletion of a work item when referenced in work entries', async () => {
      const client = await createTestClient(org.orgId);
      const site = await createTestSite(org.orgId, client.id);
      const item = await createTestWorkItem(org.orgId, { nameAr: 'بند مستخدم في المشاريع' });

      // Create work entry referencing this workItemTemplateId
      await prisma.workEntry.create({
        data: {
          organizationId: org.orgId,
          clientId: client.id,
          siteId: site.id,
          workItemTemplateId: item.id,
          referenceNo: `WRK-TEST-${Date.now()}`,
          itemNameAr: item.nameAr,
          unit: item.unit,
          quantity: 20,
          unitPrice: 50,
          totalAmount: 1000,
          workDate: new Date(),
          status: 'DRAFT',
          createdById: org.userId,
        },
      });

      const res = await request
        .delete(`/api/work-items/${item.id}?mode=delete`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(res.body.error.message.toLowerCase()).toContain('work entry');

      const dbItem = await prisma.workItemTemplate.findUnique({ where: { id: item.id } });
      expect(dbItem).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Operational Integrity (Preventing New Actions on Archived Records)
  // ─────────────────────────────────────────────────────────────
  describe('Operational Integrity Enforcements', () => {
    it('blocks creating a work entry with an archived client', async () => {
      const client = await createTestClient(org.orgId, { status: 'INACTIVE' });
      const site = await createTestSite(org.orgId, client.id);

      const res = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: client.id,
          siteId: site.id,
          itemNameAr: 'عمل تجريبي',
          unit: 'م²',
          quantity: 10,
          unitPrice: 100,
          workDate: new Date().toISOString(),
        });

      expect(res.status).toBe(422);
      expect(res.body.error.message.toLowerCase()).toContain('archived/inactive');
    });

    it('blocks creating a work entry with an archived site', async () => {
      const client = await createTestClient(org.orgId, { status: 'ACTIVE' });
      const site = await createTestSite(org.orgId, client.id, { status: 'CANCELLED' });

      const res = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: client.id,
          siteId: site.id,
          itemNameAr: 'عمل تجريبي',
          unit: 'م²',
          quantity: 10,
          unitPrice: 100,
          workDate: new Date().toISOString(),
        });

      expect(res.status).toBe(422);
      expect(res.body.error.message.toLowerCase()).toContain('archived/cancelled');
    });

    it('blocks creating a work entry with an archived work item template', async () => {
      const client = await createTestClient(org.orgId, { status: 'ACTIVE' });
      const site = await createTestSite(org.orgId, client.id, { status: 'ACTIVE' });
      const item = await createTestWorkItem(org.orgId, { isActive: false });

      const res = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: client.id,
          siteId: site.id,
          workItemTemplateId: item.id,
          itemNameAr: item.nameAr,
          unit: item.unit,
          quantity: 10,
          unitPrice: 100,
          workDate: new Date().toISOString(),
        });

      expect(res.status).toBe(422);
      expect(res.body.error.message.toLowerCase()).toContain('archived work item template');
    });
  });
});
