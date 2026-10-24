// =============================================================
// Tests: Phase 1 — Org Settings, Granular Permissions, Tenant Isolation & Audit Log
// =============================================================
import { request, createTestOrg, authHeader } from './helpers';
import { prisma } from '../lib/prisma';

describe('Phase 1: Organization Settings, Permissions & Isolation', () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;

  beforeAll(async () => {
    orgA = await createTestOrg('phase1-orgA');
    orgB = await createTestOrg('phase1-orgB');
  });

  describe('1. Organization Settings & Initial Empty State', () => {
    it('creates organization with blank official fields when not provided and SAR as default currency', async () => {
      const regRes = await request.post('/api/auth/register').send({
        email: 'blank-org@test.com',
        password: 'Password1',
        nameAr: 'مدير المؤسسة',
      });

      expect(regRes.status).toBe(201);
      const token = regRes.body.data.tokens.accessToken;

      const settingsRes = await request
        .get('/api/organizations/settings')
        .set(authHeader(token));

      expect(settingsRes.status).toBe(200);
      expect(settingsRes.body.data.businessName).toBeNull();
      expect(settingsRes.body.data.vatNumber).toBeNull();
      expect(settingsRes.body.data.defaultCurrency).toBe('SAR');
      expect(settingsRes.body.data.defaultLanguage).toBe('ar');
    });

    it('saves and retrieves organization settings accurately and records audit log', async () => {
      const updateRes = await request
        .put('/api/organizations/settings')
        .set(authHeader(orgA.accessToken))
        .send({
          businessName: 'مؤسسة البناء الحديث للمقاولات',
          businessNameEn: 'Modern Construction Est.',
          phone: '+966500000001',
          email: 'contact@modernbuild.sa',
          address: 'الرياض - حي العليا',
          vatNumber: '310123456700003',
          defaultLanguage: 'ar',
          defaultCurrency: 'SAR',
          vatRate: 15,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.businessName).toBe('مؤسسة البناء الحديث للمقاولات');
      expect(updateRes.body.data.vatNumber).toBe('310123456700003');

      // Retrieve and verify persistence
      const getRes = await request
        .get('/api/organizations/settings')
        .set(authHeader(orgA.accessToken));

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.businessName).toBe('مؤسسة البناء الحديث للمقاولات');
      expect(getRes.body.data.address).toBe('الرياض - حي العليا');
      expect(getRes.body.data.defaultCurrency).toBe('SAR');

      // Check Audit Log was recorded
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: orgA.orgId,
          action: 'SETTINGS_UPDATE',
        },
      });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Multi-Tenant Isolation for Settings & Users', () => {
    it('isolates settings between Organization A and Organization B', async () => {
      const getOrgBSettings = await request
        .get('/api/organizations/settings')
        .set(authHeader(orgB.accessToken));

      expect(getOrgBSettings.status).toBe(200);
      expect(getOrgBSettings.body.data.businessName).not.toBe('مؤسسة البناء الحديث للمقاولات');
    });

    it('prevents Organization B admin from modifying or deactivating Organization A users', async () => {
      const updateAttempt = await request
        .put(`/api/organizations/users/${orgA.userId}`)
        .set(authHeader(orgB.accessToken))
        .send({ nameAr: 'اختراق' });

      expect(updateAttempt.status).toBe(403);

      const deleteAttempt = await request
        .delete(`/api/organizations/users/${orgA.userId}`)
        .set(authHeader(orgB.accessToken));

      expect(deleteAttempt.status).toBe(403);
    });
  });

  describe('3. Granular User Permissions & Unauthorized Access Prevention', () => {
    let limitedUserToken: string;
    let limitedUserId: string;

    it('allows ORG_ADMIN to create a user with custom granular permissions', async () => {
      const createRes = await request
        .post('/api/organizations/users')
        .set(authHeader(orgA.accessToken))
        .send({
          email: 'staff-limited@orgA.com',
          password: 'Password1',
          nameAr: 'موظف تسجيل أعمال',
          role: 'ORG_STAFF',
          permissions: ['VIEW_DATA', 'CREATE_WORK'],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.effectivePermissions).toEqual(['VIEW_DATA', 'CREATE_WORK']);
      limitedUserId = createRes.body.data.id;

      // Login as the limited user
      const loginRes = await request.post('/api/auth/login').send({
        email: 'staff-limited@orgA.com',
        password: 'Password1',
      });
      expect(loginRes.status).toBe(200);
      limitedUserToken = loginRes.body.data.tokens.accessToken;
    });

    it('blocks user without MANAGE_SETTINGS from updating organization settings', async () => {
      const res = await request
        .put('/api/organizations/settings')
        .set(authHeader(limitedUserToken))
        .send({ businessName: 'تغيير غير مصرح' });

      expect(res.status).toBe(403);
    });

    it('blocks user without MANAGE_SETTINGS from creating or deactivating users', async () => {
      const res = await request
        .post('/api/organizations/users')
        .set(authHeader(limitedUserToken))
        .send({
          email: 'another@orgA.com',
          password: 'Password1',
          nameAr: 'مستخدم آخر',
        });

      expect(res.status).toBe(403);

      const delRes = await request
        .delete(`/api/organizations/users/${orgA.userId}`)
        .set(authHeader(limitedUserToken));

      expect(delRes.status).toBe(403);
    });

    it('allows ORG_ADMIN to grant MANAGE_SETTINGS permission dynamically', async () => {
      const grantRes = await request
        .put(`/api/organizations/users/${limitedUserId}`)
        .set(authHeader(orgA.accessToken))
        .send({
          permissions: ['VIEW_DATA', 'CREATE_WORK', 'MANAGE_SETTINGS'],
        });

      expect(grantRes.status).toBe(200);
      expect(grantRes.body.data.effectivePermissions).toContain('MANAGE_SETTINGS');

      // Now the user can update settings
      const updateRes = await request
        .put('/api/organizations/settings')
        .set(authHeader(limitedUserToken))
        .send({ city: 'الرياض' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.city).toBe('الرياض');
    });
  });
});
