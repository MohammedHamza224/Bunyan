import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestOrg, authHeader } from './helpers';
import { UserRole, AuditAction } from '@prisma/client';

describe('Units of Measurement & Audit Log Reset/Retention', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;

  beforeAll(async () => {
    org = await createTestOrg('units-audit-suite');
  });

  afterAll(async () => {
    // Clean up
    await prisma.unitOfMeasure.deleteMany({ where: { organizationId: org.orgId } });
  });

  describe('1. Units of Measurement Catalog & Management', () => {
    it('automatically ensures standard construction units exist for organization', async () => {
      const res = await request(app)
        .get('/api/units')
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(12);

      const codes = res.body.data.map((u: any) => u.code);
      expect(codes).toContain('SQM'); // م²
      expect(codes).toContain('CBM'); // م³
      expect(codes).toContain('LM');  // م ط
      expect(codes).toContain('PCS'); // قطعة
      expect(codes).toContain('KG');  // كجم
      expect(codes).toContain('TON'); // طن
      expect(codes).toContain('LTR'); // لتر
      expect(codes).toContain('HR');  // ساعة
      expect(codes).toContain('DAY'); // يوم
      expect(codes).toContain('LUMP_SUM'); // مقطوعية
      expect(codes).toContain('BAG'); // كيس
      expect(codes).toContain('SET'); // طقم
    });

    it('creates a custom unit of measure with Arabic & English labels', async () => {
      const res = await request(app)
        .post('/api/units')
        .set(authHeader(org.accessToken))
        .send({
          code: 'ROLL',
          nameAr: 'لفة عزل',
          nameEn: 'Insulation Roll',
          symbolAr: 'لفة',
          symbolEn: 'roll',
          category: 'LENGTH',
          sortOrder: 20,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('ROLL');
      expect(res.body.data.nameAr).toBe('لفة عزل');
      expect(res.body.data.symbolAr).toBe('لفة');
      expect(res.body.data.symbolEn).toBe('roll');
    });

    it('prevents creating duplicate unit codes or duplicate Arabic symbols within the same organization', async () => {
      // Duplicate code
      const dupCode = await request(app)
        .post('/api/units')
        .set(authHeader(org.accessToken))
        .send({
          code: 'ROLL',
          nameAr: 'لفة أخرى',
          symbolAr: 'لفه2',
        });
      expect(dupCode.status).toBe(400);
      expect(dupCode.body.error.message).toContain('مسجل مسبقاً');

      // Duplicate symbol
      const dupSymbol = await request(app)
        .post('/api/units')
        .set(authHeader(org.accessToken))
        .send({
          code: 'ROLL2',
          nameAr: 'لفة سلك',
          symbolAr: 'لفة',
        });
      expect(dupSymbol.status).toBe(400);
      expect(dupSymbol.body.error.message).toContain('مسجل مسبقاً');
    });

    it('updates an existing unit of measure', async () => {
      const unit = await prisma.unitOfMeasure.findFirst({
        where: { organizationId: org.orgId, code: 'ROLL' },
      });
      expect(unit).toBeTruthy();

      const res = await request(app)
        .put(`/api/units/${unit!.id}`)
        .set(authHeader(org.accessToken))
        .send({
          nameAr: 'لفة عزل مائي معدلة',
          nameEn: 'Modified Insulation Roll',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.nameAr).toBe('لفة عزل مائي معدلة');
      expect(res.body.data.nameEn).toBe('Modified Insulation Roll');
    });

    it('prevents deleting a unit that is referenced in existing work items', async () => {
      const unit = await prisma.unitOfMeasure.findFirst({
        where: { organizationId: org.orgId, code: 'ROLL' },
      });
      expect(unit).toBeTruthy();

      // Create a work item using this unit
      await prisma.workItemTemplate.create({
        data: {
          organizationId: org.orgId,
          nameAr: 'بند عزل رول',
          unit: unit!.symbolAr,
          unitOfMeasureId: unit!.id,
          defaultPrice: 150,
        },
      });

      // Try deleting the unit
      const delRes = await request(app)
        .delete(`/api/units/${unit!.id}`)
        .set(authHeader(org.accessToken));

      expect(delRes.status).toBe(422);
      expect(delRes.body.error.message).toContain('لا يمكن حذف وحدة القياس');

      // Clean up work item so we can test clean deletion next
      await prisma.workItemTemplate.deleteMany({
        where: { organizationId: org.orgId, nameAr: 'بند عزل رول' },
      });
    });

    it('deletes an unused unit of measure', async () => {
      const unit = await prisma.unitOfMeasure.findFirst({
        where: { organizationId: org.orgId, code: 'ROLL' },
      });
      expect(unit).toBeTruthy();

      const delRes = await request(app)
        .delete(`/api/units/${unit!.id}`)
        .set(authHeader(org.accessToken));

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const check = await prisma.unitOfMeasure.findUnique({ where: { id: unit!.id } });
      expect(check).toBeNull();
    });
  });

  describe('2. Work Items Integration with Dynamic Units', () => {
    it('creates a work item linked to a selected unitOfMeasureId', async () => {
      const cbmUnit = await prisma.unitOfMeasure.findFirst({
        where: { organizationId: org.orgId, code: 'CBM' },
      });
      expect(cbmUnit).toBeTruthy();

      const res = await request(app)
        .post('/api/work-items')
        .set(authHeader(org.accessToken))
        .send({
          code: 'CONC-CBM',
          nameAr: 'صب خرسانة جاهزة للقواعد',
          nameEn: 'Ready-mix concrete pouring',
          unitOfMeasureId: cbmUnit!.id,
          defaultPrice: 280,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.unit).toBe(cbmUnit!.symbolAr); // 'م³'
      expect(res.body.data.unitEn).toBe(cbmUnit!.symbolEn); // 'm³'
      expect(res.body.data.unitOfMeasureId).toBe(cbmUnit!.id);
      expect(Number(res.body.data.defaultPrice)).toBe(280);
    });

    it('updates work item unit and preserves calculation accuracy', async () => {
      const item = await prisma.workItemTemplate.findFirst({
        where: { organizationId: org.orgId, code: 'CONC-CBM' },
      });
      expect(item).toBeTruthy();

      const sqmUnit = await prisma.unitOfMeasure.findFirst({
        where: { organizationId: org.orgId, code: 'SQM' },
      });

      const res = await request(app)
        .put(`/api/work-items/${item!.id}`)
        .set(authHeader(org.accessToken))
        .send({
          unitOfMeasureId: sqmUnit!.id,
          defaultPrice: 95,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.unit).toBe(sqmUnit!.symbolAr); // 'م²'
      expect(res.body.data.unitOfMeasureId).toBe(sqmUnit!.id);
      expect(Number(res.body.data.defaultPrice)).toBe(95);
    });
  });

  describe('3. Audit Log Retention Policy & Reset Test Logs', () => {
    it('fetches and updates retention policy', async () => {
      // Get policy
      const getRes = await request(app)
        .get('/api/audit-logs/retention-policy')
        .set(authHeader(org.accessToken));

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.auditRetentionDays).toBeDefined();

      // Update policy
      const putRes = await request(app)
        .put('/api/audit-logs/retention-policy')
        .set(authHeader(org.accessToken))
        .send({
          auditRetentionDays: 60,
          autoCleanupAuditLogs: true,
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.auditRetentionDays).toBe(60);
      expect(putRes.body.data.autoCleanupAuditLogs).toBe(true);
    });

    it('rejects retention policy below 30 days', async () => {
      const res = await request(app)
        .put('/api/audit-logs/retention-policy')
        .set(authHeader(org.accessToken))
        .send({
          auditRetentionDays: 15,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('30 يوماً');
    });

    it('rejects reset-test-logs without valid confirmation token', async () => {
      const res = await request(app)
        .post('/api/audit-logs/reset-test-logs')
        .set(authHeader(org.accessToken))
        .send({
          confirmToken: 'WRONG_TOKEN',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('RESET_TEST_AUDIT_LOGS');
    });

    it('executes reset-test-logs in development, preserving financial records and logging reset event', async () => {
      // Seed a financial record audit log (must NOT be deleted)
      await prisma.auditLog.create({
        data: {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.ISSUE_INVOICE,
          entityType: 'Invoice',
          entityId: 'INV-TEST-KEEP',
          description: 'Official Tax Invoice Issued',
        },
      });

      // Seed an administrative test log (eligible to be reset)
      await prisma.auditLog.create({
        data: {
          organizationId: org.orgId,
          userId: org.userId,
          action: AuditAction.LOGIN,
          entityType: 'User',
          entityId: org.userId,
          description: 'User login test',
        },
      });

      const resetRes = await request(app)
        .post('/api/audit-logs/reset-test-logs')
        .set(authHeader(org.accessToken))
        .send({
          confirmToken: 'RESET_TEST_AUDIT_LOGS',
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.data.purgedCount).toBeGreaterThanOrEqual(1);

      // Verify the statutory financial log was PRESERVED
      const preservedFinancial = await prisma.auditLog.findFirst({
        where: { organizationId: org.orgId, entityId: 'INV-TEST-KEEP' },
      });
      expect(preservedFinancial).toBeTruthy();

      // Verify the reset security log was recorded with action RESET_TEST_LOGS
      const securityLog = await prisma.auditLog.findFirst({
        where: { organizationId: org.orgId, action: AuditAction.RESET_TEST_LOGS },
      });
      expect(securityLog).toBeTruthy();
      expect(securityLog!.entityId).toBe('TEST_AUDIT_RESET');
    });

    it('strictly forbids reset-test-logs if NODE_ENV is production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        const res = await request(app)
          .post('/api/audit-logs/reset-test-logs')
          .set(authHeader(org.accessToken))
          .send({
            confirmToken: 'RESET_TEST_AUDIT_LOGS',
          });

        expect(res.status).toBe(403);
        expect(res.body.error.message).toContain('بيئة الإنتاج');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
