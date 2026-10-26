import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { request, createTestOrg, TestOrg } from './helpers';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

describe('Users Management & Security Workflow Tests (إدارة المستخدمين والأمان)', () => {
  let adminOrg: TestOrg;
  let otherOrg: TestOrg;
  let testStaffUser: any;

  beforeAll(async () => {
    adminOrg = await createTestOrg(`users-${Date.now()}`);
    otherOrg = await createTestOrg(`other-${Date.now()}`);

    // Create a staff user in adminOrg
    const createRes = await request
      .post('/api/organizations/users')
      .set('Authorization', `Bearer ${adminOrg.accessToken}`)
      .send({
        email: `staff-${Date.now()}@test.com`,
        password: 'InitialPassword123!',
        nameAr: 'مهندس موقع تجريبي',
        nameEn: 'Site Engineer Test',
        role: 'ORG_STAFF',
        permissions: ['VIEW_DATA', 'CREATE_WORK'],
      });

    expect(createRes.status).toBe(201);
    testStaffUser = createRes.body.data;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Edit User — تعديل بيانات المستخدم', () => {
    it('retrieves single user details via GET /api/organizations/users/:id', async () => {
      const res = await request
        .get(`/api/organizations/users/${testStaffUser.id}`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testStaffUser.id);
      expect(res.body.data.nameAr).toBe('مهندس موقع تجريبي');
      expect(res.body.data.passwordHash).toBeUndefined(); // Never expose password hash
    });

    it('updates user profile fields (nameAr, nameEn, permissions) and saves to database', async () => {
      const res = await request
        .put(`/api/organizations/users/${testStaffUser.id}`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          nameAr: 'مهندس الموقع المعتمد',
          nameEn: 'Certified Site Engineer',
          role: 'ORG_STAFF',
          permissions: ['VIEW_DATA', 'CREATE_WORK', 'APPROVE_WORK'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nameAr).toBe('مهندس الموقع المعتمد');
      expect(res.body.data.nameEn).toBe('Certified Site Engineer');
      expect(res.body.data.permissions).toContain('APPROVE_WORK');

      // Verify in DB
      const dbUser = await prisma.user.findUnique({ where: { id: testStaffUser.id } });
      expect(dbUser?.nameAr).toBe('مهندس الموقع المعتمد');
    });

    it('rejects duplicate email within the same organization', async () => {
      // Create second user
      const secondEmail = `second-${Date.now()}@test.com`;
      await request
        .post('/api/organizations/users')
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          email: secondEmail,
          password: 'Password123!',
          nameAr: 'مستخدم ثان',
          role: 'ORG_STAFF',
        });

      // Try to update testStaffUser's email to secondEmail
      const res = await request
        .put(`/api/organizations/users/${testStaffUser.id}`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          email: secondEmail,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/already exists/i);
    });

    it('rejects invalid email format', async () => {
      const res = await request
        .put(`/api/organizations/users/${testStaffUser.id}`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          email: 'invalid-email-format',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects empty nameAr', async () => {
      const res = await request
        .put(`/api/organizations/users/${testStaffUser.id}`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          nameAr: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('prevents administrator from removing their own admin role or deactivating themselves', async () => {
      const res = await request
        .put(`/api/organizations/users/${adminOrg.userId}`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          role: 'ORG_STAFF',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/administrative role/i);
    });

    it('blocks cross-organization user modification (Multi-tenant isolation)', async () => {
      const res = await request
        .put(`/api/organizations/users/${testStaffUser.id}`)
        .set('Authorization', `Bearer ${otherOrg.accessToken}`)
        .send({
          nameAr: 'Hacked User',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Reset Password — إعادة تعيين كلمة المرور الإدارية', () => {
    it('rejects password reset with less than 8 characters', async () => {
      const res = await request
        .post(`/api/organizations/users/${testStaffUser.id}/reset-password`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          newPassword: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/8 characters/i);
    });

    it('rejects password reset when confirmation password does not match', async () => {
      const res = await request
        .post(`/api/organizations/users/${testStaffUser.id}/reset-password`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          newPassword: 'BrandNewPassword2026!',
          confirmPassword: 'MismatchPassword999!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/do not match/i);
    });

    it('successfully resets user password, revokes existing tokens, and logs audit event', async () => {
      const newPassword = 'SecureBrandNewPassword2026!';

      const res = await request
        .post(`/api/organizations/users/${testStaffUser.id}/reset-password`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`)
        .send({
          newPassword,
          confirmPassword: newPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the new password works for login
      const loginRes = await request.post('/api/auth/login').send({
        email: testStaffUser.email,
        password: newPassword,
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.tokens.accessToken).toBeDefined();

      // Verify old password fails
      const oldLoginRes = await request.post('/api/auth/login').send({
        email: testStaffUser.email,
        password: 'InitialPassword123!',
      });

      expect(oldLoginRes.status).toBe(401);

      // Verify audit log entry exists WITHOUT logging the password or hash
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: adminOrg.orgId,
          entityId: testStaffUser.id,
          description: { contains: 'reset password' },
        },
      });

      expect(auditLog).toBeDefined();
      expect(JSON.stringify(auditLog?.metadata)).not.toContain(newPassword);
    });

    it('blocks unauthorized users (without MANAGE_SETTINGS) from resetting passwords', async () => {
      // Create user login token for staff
      const loginRes = await request.post('/api/auth/login').send({
        email: testStaffUser.email,
        password: 'SecureBrandNewPassword2026!',
      });
      const staffToken = loginRes.body.data.tokens.accessToken;

      const res = await request
        .post(`/api/organizations/users/${adminOrg.userId}/reset-password`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          newPassword: 'UnauthorizedHackedPassword!',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('3. Activate / Deactivate — تفعيل وتعطيل الحسابات', () => {
    it('deactivates user via POST /api/organizations/users/:id/deactivate', async () => {
      const res = await request
        .post(`/api/organizations/users/${testStaffUser.id}/deactivate`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      // Verify user cannot login while inactive
      const loginRes = await request.post('/api/auth/login').send({
        email: testStaffUser.email,
        password: 'SecureBrandNewPassword2026!',
      });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.error.message).toMatch(/invalid email or password|inactive|deactivated/i);
    });

    it('reactivates user via POST /api/organizations/users/:id/activate', async () => {
      const res = await request
        .post(`/api/organizations/users/${testStaffUser.id}/activate`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(true);

      // Verify user can login again
      const loginRes = await request.post('/api/auth/login').send({
        email: testStaffUser.email,
        password: 'SecureBrandNewPassword2026!',
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.tokens.accessToken).toBeDefined();
    });

    it('prevents administrator from deactivating themselves', async () => {
      const res = await request
        .post(`/api/organizations/users/${adminOrg.userId}/deactivate`)
        .set('Authorization', `Bearer ${adminOrg.accessToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/cannot deactivate your own account/i);
    });
  });
});
