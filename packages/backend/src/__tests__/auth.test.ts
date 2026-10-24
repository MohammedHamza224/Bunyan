// =============================================================
// Tests: Authentication & Secure Password Reset Workflow
// =============================================================
import { request, createTestOrg, authHeader } from './helpers';
import { prisma } from '../lib/prisma';
import { hashResetToken } from '../services/authService';

describe('Auth API & Password Reset Workflow', () => {
  let testOrg: Awaited<ReturnType<typeof createTestOrg>>;

  describe('POST /api/auth/register', () => {
    it('registers a new organization and returns tokens', async () => {
      const res = await request.post('/api/auth/register').send({
        organizationName: 'Auth Test Org',
        email: 'newuser@auth-test.com',
        password: 'Password1',
        nameAr: 'مستخدم جديد',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
      expect(res.body.data.tokens.refreshToken).toBeTruthy();
      expect(res.body.data.user.email).toBe('newuser@auth-test.com');
      expect(res.body.data.user.organizationId).toBeTruthy();
    });

    it('rejects duplicate email', async () => {
      await request.post('/api/auth/register').send({
        organizationName: 'Dup Org',
        email: 'dup@test.com',
        password: 'Password1',
        nameAr: 'مكرر',
      });

      const res = await request.post('/api/auth/register').send({
        organizationName: 'Dup Org 2',
        email: 'dup@test.com',
        password: 'Password1',
        nameAr: 'مكرر 2',
      });

      expect(res.status).toBe(409);
    });

    it('rejects weak password', async () => {
      const res = await request.post('/api/auth/register').send({
        organizationName: 'Weak Org',
        email: 'weak@test.com',
        password: 'password', // no uppercase, no number
        nameAr: 'ضعيف',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeAll(async () => {
      testOrg = await createTestOrg('auth-login');
    });

    it('logs in with valid credentials', async () => {
      const res = await request.post('/api/auth/login').send({
        email: 'admin-auth-login@test.com',
        password: 'Password1',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
    });

    it('logs in with uppercase and whitespace-padded email', async () => {
      const res = await request.post('/api/auth/login').send({
        email: '  ADMIN-AUTH-LOGIN@TEST.COM  ',
        password: 'Password1',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
      expect(res.body.data.user.email).toBe('admin-auth-login@test.com');
    });

    it('logs in with Bunyan domain aliases (e.g. admin@bunyan.sa, admin@bunyan.com)', async () => {
      const resSa = await request.post('/api/auth/login').send({
        email: 'admin@bunyan.sa',
        password: 'Password1',
      });
      expect(resSa.status).toBe(200);
      expect(resSa.body.data.tokens.accessToken).toBeTruthy();

      const resCom = await request.post('/api/auth/login').send({
        email: 'admin@bunyan.com',
        password: 'Password1',
      });
      expect(resCom.status).toBe(200);
      expect(resCom.body.data.tokens.accessToken).toBeTruthy();
    });

    it('rejects invalid password', async () => {
      const res = await request.post('/api/auth/login').send({
        email: 'admin-auth-login@test.com',
        password: 'WrongPassword1',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user when authenticated', async () => {
      testOrg = await createTestOrg('auth-me');
      const res = await request
        .get('/api/auth/me')
        .set(authHeader(testOrg.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testOrg.userId);
    });

    it('returns 401 without token', async () => {
      const res = await request.get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('issues new access token', async () => {
      testOrg = await createTestOrg('auth-refresh');
      const res = await request.post('/api/auth/refresh').send({
        refreshToken: testOrg.refreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeTruthy();
    });

    it('rejects invalid refresh token', async () => {
      const res = await request.post('/api/auth/refresh').send({
        refreshToken: 'invalid.token.here',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('Secure Password Reset Workflow (/forgot-password, /verify-reset-token, /reset-password)', () => {
    let resetOrg: Awaited<ReturnType<typeof createTestOrg>>;
    const resetEmail = 'admin-pwd-reset@test.com';

    beforeAll(async () => {
      resetOrg = await createTestOrg('pwd-reset');
    });

    it('prevents user enumeration by returning 200 OK with generic message for non-existent email', async () => {
      const res = await request.post('/api/auth/forgot-password').send({
        email: 'nonexistent-account@test.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('If an account with that email exists');
      expect(res.body.data.devResetToken).toBeUndefined();
    });

    it('generates a hashed reset token, invalidates previous unused tokens, and verifies token validity', async () => {
      // First request
      const req1 = await request.post('/api/auth/forgot-password').send({
        email: resetEmail,
      });
      expect(req1.status).toBe(200);
      const token1 = req1.body.data.devResetToken;
      expect(token1).toBeTruthy();

      // Verify raw token is NOT stored in DB, only its SHA-256 hash
      const rawLookup = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: token1 },
      });
      expect(rawLookup).toBeNull();

      const hashedLookup = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token1) },
      });
      expect(hashedLookup).toBeTruthy();
      expect(hashedLookup!.usedAt).toBeNull();

      // Second request for the same user should invalidate token1
      const req2 = await request.post('/api/auth/forgot-password').send({
        email: resetEmail,
      });
      expect(req2.status).toBe(200);
      const token2 = req2.body.data.devResetToken;
      expect(token2).toBeTruthy();
      expect(token2).not.toBe(token1);

      // Verify token1 is now rejected as invalidated
      const verify1 = await request
        .get('/api/auth/verify-reset-token')
        .query({ token: token1 });
      expect(verify1.status).toBe(401);

      // Verify token2 is valid
      const verify2 = await request
        .get('/api/auth/verify-reset-token')
        .query({ token: token2 });
      expect(verify2.status).toBe(200);
      expect(verify2.body.data.valid).toBe(true);

      // Rejects weak password on reset
      const weakReset = await request.post('/api/auth/reset-password').send({
        token: token2,
        newPassword: 'weak',
      });
      expect(weakReset.status).toBe(400);

      // Rejects mismatched confirmPassword
      const mismatchReset = await request.post('/api/auth/reset-password').send({
        token: token2,
        newPassword: 'NewSecurePassword99',
        confirmPassword: 'DifferentPassword99',
      });
      expect(mismatchReset.status).toBe(400);

      // Completes password reset with valid token2 and strong password
      const completeRes = await request.post('/api/auth/reset-password').send({
        token: token2,
        newPassword: 'NewSecurePassword99',
        confirmPassword: 'NewSecurePassword99',
      });
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.success).toBe(true);

      // Single-use enforcement: reusing token2 again must fail with 401
      const reuseRes = await request.post('/api/auth/reset-password').send({
        token: token2,
        newPassword: 'AnotherPassword88',
      });
      expect(reuseRes.status).toBe(401);

      // Old password must no longer work
      const oldLogin = await request.post('/api/auth/login').send({
        email: resetEmail,
        password: 'Password1',
      });
      expect(oldLogin.status).toBe(401);

      // Previously issued refreshToken must be revoked
      const oldRefresh = await request.post('/api/auth/refresh').send({
        refreshToken: resetOrg.refreshToken,
      });
      expect(oldRefresh.status).toBe(401);

      // New password logs in successfully
      const newLogin = await request.post('/api/auth/login').send({
        email: resetEmail,
        password: 'NewSecurePassword99',
      });
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.data.tokens.accessToken).toBeTruthy();
    });
  });

  describe('Remember Me Session Lifecycle, Token Rotation, Server Expiration & Logout', () => {
    const rememberEmail = 'admin-remember-me@test.com';

    beforeAll(async () => {
      await createTestOrg('remember-me');
    });

    it('creates a standard 24h non-persistent refresh session when rememberMe is false or omitted', async () => {
      const before = Date.now();
      const res = await request.post('/api/auth/login').send({
        email: rememberEmail,
        password: 'Password1',
        rememberMe: false,
      });

      expect(res.status).toBe(200);
      const { tokens } = res.body.data;
      expect(tokens.rememberMe).toBe(false);

      const dbToken = await prisma.refreshToken.findUnique({
        where: { token: tokens.refreshToken },
      });
      expect(dbToken).toBeTruthy();

      const ttlHours = (dbToken!.expiresAt.getTime() - before) / (1000 * 60 * 60);
      // Should be ~24 hours (between 23.5h and 24.5h)
      expect(ttlHours).toBeGreaterThan(23.5);
      expect(ttlHours).toBeLessThan(24.5);

      // Rotating the non-persistent token preserves rememberMe = false and 24h TTL
      const refreshRes = await request.post('/api/auth/refresh').send({
        refreshToken: tokens.refreshToken,
      });
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.tokens.rememberMe).toBe(false);
    });

    it('creates a 30-day persistent refresh session when rememberMe is true and preserves it on rotation', async () => {
      const before = Date.now();
      const res = await request.post('/api/auth/login').send({
        email: rememberEmail,
        password: 'Password1',
        rememberMe: true,
      });

      expect(res.status).toBe(200);
      const { tokens } = res.body.data;
      expect(tokens.rememberMe).toBe(true);

      const dbToken = await prisma.refreshToken.findUnique({
        where: { token: tokens.refreshToken },
      });
      expect(dbToken).toBeTruthy();

      const ttlDays = (dbToken!.expiresAt.getTime() - before) / (1000 * 60 * 60 * 24);
      // Should be ~30 days (between 29.5d and 30.5d)
      expect(ttlDays).toBeGreaterThan(29.5);
      expect(ttlDays).toBeLessThan(30.5);

      // Rotating the persistent token preserves rememberMe = true and 30d TTL
      const refreshRes = await request.post('/api/auth/refresh').send({
        refreshToken: tokens.refreshToken,
      });
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.tokens.rememberMe).toBe(true);

      const rotatedDbToken = await prisma.refreshToken.findUnique({
        where: { token: refreshRes.body.data.tokens.refreshToken },
      });
      expect(rotatedDbToken).toBeTruthy();
      const rotatedTtlDays =
        (rotatedDbToken!.expiresAt.getTime() - before) / (1000 * 60 * 60 * 24);
      expect(rotatedTtlDays).toBeGreaterThan(29.5);

      // Old rotated token is revoked and cannot be reused
      const replayRes = await request.post('/api/auth/refresh').send({
        refreshToken: tokens.refreshToken,
      });
      expect(replayRes.status).toBe(401);
    });

    it('enforces server-side expiration and logout invalidation', async () => {
      const loginRes = await request.post('/api/auth/login').send({
        email: rememberEmail,
        password: 'Password1',
        rememberMe: true,
      });
      const refreshToken = loginRes.body.data.tokens.refreshToken;

      // Simulate server-side expiration by setting expiresAt in the past
      await prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const expiredRefresh = await request.post('/api/auth/refresh').send({
        refreshToken,
      });
      expect(expiredRefresh.status).toBe(401);

      // Now test logout invalidation on an active session
      const loginRes2 = await request.post('/api/auth/login').send({
        email: rememberEmail,
        password: 'Password1',
        rememberMe: true,
      });
      const activeRefreshToken = loginRes2.body.data.tokens.refreshToken;

      const logoutRes = await request.post('/api/auth/logout').send({
        refreshToken: activeRefreshToken,
      });
      expect(logoutRes.status).toBe(200);

      const afterLogoutRefresh = await request.post('/api/auth/refresh').send({
        refreshToken: activeRefreshToken,
      });
      expect(afterLogoutRefresh.status).toBe(401);
    });
  });
});
