import { request, createTestOrg, authHeader, TestOrg } from './helpers';
import { prisma } from '../lib/prisma';
import { AuditAction, UserRole } from '@prisma/client';
import { parseRetentionCutoff } from '../routes/auditLogs';

describe('Audit Log Retention Safeguards & Zero-Deletion Noise Prevention', () => {
  let org: TestOrg;

  beforeAll(async () => {
    org = await createTestOrg(`retention_${Date.now()}`);

    // Clear any registration audit logs for this isolated test org
    await prisma.auditLog.deleteMany({
      where: { organizationId: org.orgId },
    });

    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

    // Seed test audit log records:
    // Record 1: 100 days old, non-financial (WorkEntry) -> ELIGIBLE for 90-day retention
    // Record 2: 100 days old, Invoice -> PROTECTED (ZATCA/Tax)
    // Record 3: 100 days old, Payment -> PROTECTED (ZATCA/Financial)
    // Record 4: 100 days old, Statement -> PROTECTED (Financial)
    // Record 5: 15 days old, WorkEntry -> PROTECTED by 30-day statutory window
    await prisma.auditLog.createMany({
      data: [
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.CREATE,
          entityType: 'WorkEntry',
          entityId: 'WE-OLD-ELIGIBLE',
          description: 'Old work entry log eligible for retention cleanup',
          createdAt: daysAgo(100),
        },
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.ISSUE_INVOICE,
          entityType: 'Invoice',
          entityId: 'INV-TAX-001',
          description: 'Old tax invoice protected under ZATCA compliance',
          createdAt: daysAgo(100),
        },
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.PAYMENT_RECORD,
          entityType: 'Payment',
          entityId: 'PAY-FIN-001',
          description: 'Old payment log protected under financial accounting rules',
          createdAt: daysAgo(100),
        },
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.ISSUE_STATEMENT,
          entityType: 'Statement',
          entityId: 'STMT-FIN-001',
          description: 'Old statement log protected under financial accounting rules',
          createdAt: daysAgo(100),
        },
        {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.CREATE,
          entityType: 'WorkEntry',
          entityId: 'WE-RECENT-PROTECTED',
          description: 'Recent work entry protected by 30-day statutory immutable window',
          createdAt: daysAgo(15),
        },
      ],
    });
  });

  describe('1. Retention Cutoff Calculation & Boundary Checks', () => {
    it('calculates accurate cutoff dates for standard retention periods', () => {
      const periods = [30, 60, 90, 180, 365];
      const now = Date.now();

      for (const p of periods) {
        const { cutoffDate, days } = parseRetentionCutoff(p);
        expect(days).toBe(p);
        const diffDays = Math.round((now - cutoffDate.getTime()) / (24 * 60 * 60 * 1000));
        expect(diffDays).toBe(p);
      }
    });

    it('rejects retention periods less than 30 days', () => {
      expect(() => parseRetentionCutoff(20)).toThrow(/at least 30 days/);
      expect(() => parseRetentionCutoff(0)).toThrow(/at least 30 days/);
      expect(() => parseRetentionCutoff(-5)).toThrow(/at least 30 days/);
    });

    it('rejects beforeDate that falls within the 30-day statutory window', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(() => parseRetentionCutoff(undefined, fiveDaysAgo)).toThrow(
        /last 30 days cannot be purged/
      );
    });
  });

  describe('2. Retention Preview & Transparency', () => {
    it('accurately identifies eligible vs protected records and transparently reports counts', async () => {
      const res = await request
        .post('/api/audit-logs/cleanup/preview')
        .send({ olderThanDays: 90 })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const {
        systemTotalRecords,
        totalEligibleCount,
        recentProtectedCount,
        olderProtectedCount,
        protectedRecords,
        canExecute,
        reasonCode,
      } = res.body.data;

      expect(systemTotalRecords).toBe(5);
      expect(totalEligibleCount).toBe(1); // WE-OLD-ELIGIBLE
      expect(recentProtectedCount).toBe(1); // 15 days old
      expect(olderProtectedCount).toBe(3); // Invoice, Payment, Statement
      expect(protectedRecords).toBe(4); // 1 recent + 3 older protected
      expect(canExecute).toBe(true);
      expect(reasonCode).toBe('RECORDS_ELIGIBLE');
    });
  });

  describe('3. Controlled Transactional Execution', () => {
    it('purges only eligible records, preserves all protected records, and records audit trail', async () => {
      const res = await request
        .post('/api/audit-logs/cleanup/execute')
        .send({
          olderThanDays: 90,
          confirmationToken: 'CONFIRM_AUDIT_LOG_CLEANUP',
          policyAcknowledged: true,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purgedCount).toBe(1);
      expect(res.body.data.cleanupAuditId).toBeTruthy();

      // Check that the eligible record was purged
      const deletedRecord = await prisma.auditLog.findFirst({
        where: { organizationId: org.orgId, entityId: 'WE-OLD-ELIGIBLE' },
      });
      expect(deletedRecord).toBeNull();

      // Check that protected financial records (Invoice, Payment, Statement) were retained
      const invoiceRecord = await prisma.auditLog.findFirst({
        where: { organizationId: org.orgId, entityId: 'INV-TAX-001' },
      });
      expect(invoiceRecord).not.toBeNull();

      const paymentRecord = await prisma.auditLog.findFirst({
        where: { organizationId: org.orgId, entityId: 'PAY-FIN-001' },
      });
      expect(paymentRecord).not.toBeNull();

      const statementRecord = await prisma.auditLog.findFirst({
        where: { organizationId: org.orgId, entityId: 'STMT-FIN-001' },
      });
      expect(statementRecord).not.toBeNull();

      // Check that the recent record was retained
      const recentRecord = await prisma.auditLog.findFirst({
        where: { organizationId: org.orgId, entityId: 'WE-RECENT-PROTECTED' },
      });
      expect(recentRecord).not.toBeNull();
    });
  });

  describe('4. Zero-Deletion Handling & Noise Prevention', () => {
    it('transparently reports zero eligible records in preview when none qualify', async () => {
      const res = await request
        .post('/api/audit-logs/cleanup/preview')
        .send({ olderThanDays: 90 })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.totalEligibleCount).toBe(0);
      expect(res.body.data.canExecute).toBe(false);
      expect(res.body.data.reasonCode).toBe('ALL_OLDER_RECORDS_PROTECTED');
      expect(res.body.data.explanationReason).toContain('محمية نظامياً وضريبياً');
    });

    it('does NOT create redundant noise audit entries when cleanup is attempted with zero eligible records', async () => {
      // Get count of audit logs before attempt
      const countBefore = await prisma.auditLog.count({ where: { organizationId: org.orgId } });

      const res = await request
        .post('/api/audit-logs/cleanup/execute')
        .send({
          olderThanDays: 90,
          confirmationToken: 'CONFIRM_AUDIT_LOG_CLEANUP',
          policyAcknowledged: true,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purgedCount).toBe(0);
      expect(res.body.data.canExecute).toBe(false);
      expect(res.body.message).toContain('لا توجد سجلات مؤهلة للحذف');

      // Get count of audit logs after attempt - must remain EXACTLY identical (no noise logged!)
      const countAfter = await prisma.auditLog.count({ where: { organizationId: org.orgId } });
      expect(countAfter).toBe(countBefore);
    });

    it('prevents noise entries in DELETE /api/audit-logs/purge when zero records are eligible', async () => {
      const countBefore = await prisma.auditLog.count({ where: { organizationId: org.orgId } });

      const res = await request
        .delete('/api/audit-logs/purge')
        .send({ olderThanDays: 90 })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purgedCount).toBe(0);
      expect(res.body.message).toContain('No records purged');

      // Must not add a noisy audit entry
      const countAfter = await prisma.auditLog.count({ where: { organizationId: org.orgId } });
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('5. Development / Test Cleanup Operation Safeguards', () => {
    it('rejects test cleanup if confirmation token is missing or invalid', async () => {
      const res = await request
        .post('/api/audit-logs/cleanup/dev-test')
        .send({ confirmationToken: 'INVALID_TOKEN' })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('CONFIRM_CLEAR_DEV_LOGS');
    });

    it('rejects test cleanup in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await request
          .post('/api/audit-logs/cleanup/dev-test')
          .send({ confirmationToken: 'CONFIRM_CLEAR_DEV_LOGS' })
          .set(authHeader(org.accessToken));

        expect(res.status).toBe(403);
        expect(res.body.error.message).toContain('production');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('purges only non-statutory test records, strictly preserving all statutory financial records', async () => {
      // Seed a couple of new test login logs and user manage logs
      await prisma.auditLog.createMany({
        data: [
          {
            organizationId: org.orgId,
            userId: org.userId,
            action: AuditAction.LOGIN,
            entityType: 'User',
            entityId: org.userId,
            description: 'Test login event',
          },
          {
            organizationId: org.orgId,
            userId: org.userId,
            action: AuditAction.USER_MANAGE,
            entityType: 'User',
            entityId: org.userId,
            description: 'Test user manage event',
          },
        ],
      });

      const res = await request
        .post('/api/audit-logs/cleanup/dev-test')
        .send({
          confirmationToken: 'CONFIRM_CLEAR_DEV_LOGS',
          recordSecurityLog: false,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purgedCount).toBeGreaterThanOrEqual(2);
      expect(res.body.data.preservedCount).toBeGreaterThanOrEqual(3); // Invoices, Payments, Statements preserved
      expect(res.body.data.preservedBreakdown).toBeDefined();

      // Verify that statutory financial records remain completely intact
      const preservedInvoices = await prisma.auditLog.count({
        where: { organizationId: org.orgId, entityType: 'Invoice' },
      });
      const preservedPayments = await prisma.auditLog.count({
        where: { organizationId: org.orgId, entityType: 'Payment' },
      });
      const preservedStatements = await prisma.auditLog.count({
        where: { organizationId: org.orgId, entityType: 'Statement' },
      });

      expect(preservedInvoices).toBeGreaterThanOrEqual(1);
      expect(preservedPayments).toBeGreaterThanOrEqual(1);
      expect(preservedStatements).toBeGreaterThanOrEqual(1);
    });
  });
});
