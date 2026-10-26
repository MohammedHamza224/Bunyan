import { request, createTestOrg, authHeader, TestOrg } from './helpers';
import { prisma } from '../lib/prisma';
import { AuditAction, UserRole } from '@prisma/client';
import { classifyAuditEvent, sanitizeCsvField } from '../routes/auditLogs';

describe('Audit Log Management & Security Enhancement', () => {
  let org: TestOrg & { staffAccessToken?: string };

  beforeAll(async () => {
    org = await createTestOrg(`audit_${Date.now()}`);

    // Create a staff user to test access control
    const staffUser = await prisma.user.create({
      data: {
        organizationId: org.orgId,
        email: `staff_${Date.now()}@bunyan.test`,
        passwordHash: 'dummy_hash',
        nameAr: 'موظف تجريبي',
        nameEn: 'Test Staff',
        role: UserRole.ORG_STAFF,
      },
    });

    // We can simulate staff access token using jwt
    const jwt = require('jsonwebtoken');
    const { config } = require('../config');
    org.staffAccessToken = jwt.sign(
      {
        userId: staffUser.id,
        organizationId: org.orgId,
        email: staffUser.email,
        role: UserRole.ORG_STAFF,
        nameAr: staffUser.nameAr,
        nameEn: staffUser.nameEn,
      },
      config.jwtAccessSecret,
      { expiresIn: '1h' }
    );

    // Seed distinct audit log events across categories
    await prisma.auditLog.createMany({
      data: [
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.LOGIN,
          entityType: 'User',
          entityId: org.userId,
          description: 'User login from IP 192.168.1.50',
          createdAt: new Date('2025-01-10T10:00:00.000Z'),
        },
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.ISSUE_INVOICE,
          entityType: 'Invoice',
          entityId: 'INV-2025-001',
          description: 'Issued official tax invoice INV-2025-001',
          createdAt: new Date('2025-02-15T12:00:00.000Z'),
        },
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.PAYMENT_RECORD,
          entityType: 'Payment',
          entityId: 'PAY-2025-001',
          description: 'Recorded bank transfer payment of 50000 SAR',
          createdAt: new Date('2025-02-20T14:00:00.000Z'),
        },
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.CREATE,
          entityType: 'WorkEntry',
          entityId: 'WE-2025-001',
          description: 'Created foundation concrete work entry',
          createdAt: new Date('2025-03-01T08:00:00.000Z'),
        },
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.CREATE,
          entityType: 'Client',
          entityId: 'CLI-2025-001',
          description: 'Created client Al-Rowad Contracting',
          createdAt: new Date('2025-03-05T09:00:00.000Z'),
        },
      ],
    });
  });

  describe('1. Classification & CSV Sanitization Logic', () => {
    it('accurately classifies Security events', () => {
      expect(classifyAuditEvent(AuditAction.LOGIN, 'User')).toBe('SECURITY');
      expect(classifyAuditEvent(AuditAction.LOGOUT, 'Auth')).toBe('SECURITY');
      expect(classifyAuditEvent(AuditAction.USER_MANAGE, 'User')).toBe('SECURITY');
    });

    it('accurately classifies Financial events', () => {
      expect(classifyAuditEvent(AuditAction.ISSUE_INVOICE, 'Invoice')).toBe('FINANCIAL');
      expect(classifyAuditEvent(AuditAction.PAYMENT_RECORD, 'Payment')).toBe('FINANCIAL');
      expect(classifyAuditEvent(AuditAction.APPROVE, 'Statement')).toBe('FINANCIAL');
    });

    it('accurately classifies Business Data events', () => {
      expect(classifyAuditEvent(AuditAction.CREATE, 'WorkEntry')).toBe('BUSINESS');
      expect(classifyAuditEvent(AuditAction.UPDATE, 'Client')).toBe('BUSINESS');
      expect(classifyAuditEvent(AuditAction.APPROVE, 'Site')).toBe('BUSINESS');
    });

    it('sanitizes formula injection characters (=, +, -, @) safely', () => {
      expect(sanitizeCsvField('=SUM(A1:A10)')).toBe(`'=SUM(A1:A10)`);
      expect(sanitizeCsvField('+cmd|/c calc')).toBe(`'+cmd|/c calc`);
      expect(sanitizeCsvField('@import')).toBe(`'@import`);
      expect(sanitizeCsvField('Normal Text')).toBe('Normal Text');
    });
  });

  describe('2. Authorization & RBAC Protection', () => {
    it('permits ORG_ADMIN to view audit logs', async () => {
      const res = await request
        .get('/api/audit-logs')
        .set(authHeader(org.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('denies ORG_STAFF from viewing audit logs (403 Forbidden)', async () => {
      const res = await request
        .get('/api/audit-logs')
        .set(authHeader(org.staffAccessToken!));
      expect(res.status).toBe(403);
    });

    it('denies ORG_STAFF from exporting audit logs (403 Forbidden)', async () => {
      const res = await request
        .get('/api/audit-logs/export')
        .set(authHeader(org.staffAccessToken!));
      expect(res.status).toBe(403);
    });

    it('denies ORG_STAFF from previewing or executing cleanup', async () => {
      const previewRes = await request
        .post('/api/audit-logs/cleanup/preview')
        .send({ olderThanDays: 180 })
        .set(authHeader(org.staffAccessToken!));
      expect(previewRes.status).toBe(403);

      const execRes = await request
        .post('/api/audit-logs/cleanup/execute')
        .send({
          olderThanDays: 180,
          confirmationToken: 'CONFIRM_AUDIT_LOG_CLEANUP',
          policyAcknowledged: true,
        })
        .set(authHeader(org.staffAccessToken!));
      expect(execRes.status).toBe(403);
    });
  });

  describe('3. Filtering & Search', () => {
    it('filters by category = FINANCIAL', async () => {
      const res = await request
        .get('/api/audit-logs?category=FINANCIAL')
        .set(authHeader(org.accessToken));
      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(2);
      items.forEach((item: any) => {
        expect(item.category).toBe('FINANCIAL');
      });
    });

    it('filters by category = SECURITY', async () => {
      const res = await request
        .get('/api/audit-logs?category=SECURITY')
        .set(authHeader(org.accessToken));
      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      items.forEach((item: any) => {
        expect(item.category).toBe('SECURITY');
      });
    });

    it('filters by date range (dateFrom and dateTo)', async () => {
      const res = await request
        .get('/api/audit-logs?dateFrom=2025-02-01&dateTo=2025-02-28')
        .set(authHeader(org.accessToken));
      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(2); // Invoice & Payment
    });

    it('searches by description text', async () => {
      const res = await request
        .get('/api/audit-logs?search=concrete')
        .set(authHeader(org.accessToken));
      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].entityType).toBe('WorkEntry');
    });

    it('returns actors list for dropdown via GET /api/audit-logs/actors', async () => {
      const res = await request
        .get('/api/audit-logs/actors')
        .set(authHeader(org.accessToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((u: any) => u.id === org.userId)).toBe(true);
    });
  });

  describe('4. Secure CSV Export', () => {
    it('exports audit logs as CSV with UTF-8 BOM and logs the administrative export', async () => {
      const res = await request
        .get('/api/audit-logs/export?category=FINANCIAL')
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.startsWith('\uFEFF')).toBe(true);
      expect(res.text).toContain('INV-2025-001');
      expect(res.text).toContain('FINANCIAL');

      // Check that the export was documented in the audit log
      const exportLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.orgId,
          entityId: 'AUDIT_LOG_EXPORT',
        },
      });
      expect(exportLog).toBeDefined();
      expect((exportLog?.metadata as any)?.operation).toBe('EXPORT');
    });
  });

  describe('5. Safe Retention Preview & Controlled Cleanup', () => {
    it('calculates eligible vs protected records in retention preview', async () => {
      const res = await request
        .post('/api/audit-logs/cleanup/preview')
        .send({ beforeDate: '2025-04-01' })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const { totalEligibleCount, protectedCount, protectedEntityTypes } = res.body.data;
      expect(protectedEntityTypes).toContain('Invoice');
      expect(protectedEntityTypes).toContain('Payment');
      expect(protectedCount).toBeGreaterThanOrEqual(2); // Invoice & Payment protected
      expect(totalEligibleCount).toBeGreaterThanOrEqual(1); // Non-protected records
    });

    it('rejects cleanup execution if confirmation token is missing or invalid', async () => {
      const res = await request
        .post('/api/audit-logs/cleanup/execute')
        .send({
          beforeDate: '2025-04-01',
          confirmationToken: 'WRONG_TOKEN',
          policyAcknowledged: true,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('CONFIRM_AUDIT_LOG_CLEANUP');
    });

    it('rejects cleanup execution if policy compliance is not acknowledged', async () => {
      const res = await request
        .post('/api/audit-logs/cleanup/execute')
        .send({
          beforeDate: '2025-04-01',
          confirmationToken: 'CONFIRM_AUDIT_LOG_CLEANUP',
          policyAcknowledged: false,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('acknowledgment');
    });

    it('executes controlled cleanup safely and documents it in immutable audit trail', async () => {
      const res = await request
        .post('/api/audit-logs/cleanup/execute')
        .send({
          beforeDate: '2025-04-01',
          confirmationToken: 'CONFIRM_AUDIT_LOG_CLEANUP',
          policyAcknowledged: true,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purgedCount).toBeGreaterThanOrEqual(1);

      // Verify that protected records (Invoices, Payments) were NOT deleted
      const protectedRemaining = await prisma.auditLog.count({
        where: {
          organizationId: org.orgId,
          entityType: { in: ['Invoice', 'Payment'] },
        },
      });
      expect(protectedRemaining).toBeGreaterThanOrEqual(2);

      // Verify cleanup audit record was recorded
      const cleanupAudit = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.orgId,
          entityId: 'RETENTION_CLEANUP',
        },
      });
      expect(cleanupAudit).toBeDefined();
      expect((cleanupAudit?.metadata as any)?.operation).toBe('RETENTION_CLEANUP');
    });
  });

  describe('6. Direct Administrative Clear Audit Log', () => {
    it('returns clear preview with total and statutory breakdown', async () => {
      const res = await request
        .get('/api/audit-logs/clear/preview')
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalRecords).toBeGreaterThan(0);
      expect(typeof res.body.data.statutoryCount).toBe('number');
    });

    it('denies ORG_STAFF from invoking clear audit log endpoint (403 Forbidden)', async () => {
      const res = await request
        .post('/api/audit-logs/clear')
        .send({ confirmed: true })
        .set(authHeader(org.staffAccessToken!));

      expect(res.status).toBe(403);
    });

    it('rejects clear operation without explicit confirmation', async () => {
      const res = await request
        .post('/api/audit-logs/clear')
        .send({ confirmed: false })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Explicit confirmation');
    });

    it('clears operational audit logs while preserving statutory records without infinite log noise', async () => {
      // First seed a customer and site audit log (operational records)
      await prisma.auditLog.createMany({
        data: [
          {
            organizationId: org.orgId,
            userId: org.userId,
            action: AuditAction.CREATE,
            entityType: 'Client',
            entityId: 'client-test-999',
            description: 'Created Client Al-Amal',
            metadata: { clientName: 'شركة الأمل' },
          },
          {
            organizationId: org.orgId,
            userId: org.userId,
            action: AuditAction.DELETE,
            entityType: 'Client',
            entityId: 'client-test-999',
            description: 'Deleted Client Al-Amal',
            metadata: { clientName: 'شركة الأمل', isDeleted: true },
          },
          {
            organizationId: org.orgId,
            userId: org.userId,
            action: AuditAction.CREATE,
            entityType: 'Site',
            entityId: 'site-test-888',
            description: 'Created Project Site',
          },
        ],
      });

      const countBefore = await prisma.auditLog.count({ where: { organizationId: org.orgId } });
      expect(countBefore).toBeGreaterThanOrEqual(3);

      const res = await request
        .post('/api/audit-logs/clear')
        .send({ confirmed: true, preserveStatutory: true })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purgedCount).toBeGreaterThanOrEqual(3);

      // Verify that operational records (Clients, Sites) were completely purged
      const operationalRemaining = await prisma.auditLog.count({
        where: {
          organizationId: org.orgId,
          entityType: { in: ['Client', 'Site'] },
        },
      });
      expect(operationalRemaining).toBe(0);

      // Verify that statutory financial records (Invoices, Payments) remain preserved
      const statutoryRemaining = await prisma.auditLog.count({
        where: {
          organizationId: org.orgId,
          entityType: { in: ['Invoice', 'Payment'] },
        },
      });
      expect(statutoryRemaining).toBeGreaterThanOrEqual(1);

      // CRITICAL: Verify that the clear operation did NOT insert a new audit log
      // (preventing the infinite clutter cycle where clearing logs creates new logs)
      const clearAuditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: org.orgId,
          action: AuditAction.DELETE,
          entityId: 'CLEAR_AUDIT_LOG',
        },
      });
      expect(clearAuditLogs.length).toBe(0);
    });

    it('handles already empty or subsequent clear gracefully', async () => {
      // Create a disposable organization with NO logs
      const emptyOrg = await createTestOrg();
      await prisma.auditLog.deleteMany({ where: { organizationId: emptyOrg.orgId } });

      const res = await request
        .post('/api/audit-logs/clear')
        .send({ confirmed: true })
        .set(authHeader(emptyOrg.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purgedCount).toBe(0);
      expect(res.body.data.totalBefore).toBe(0);
    });
  });
});
