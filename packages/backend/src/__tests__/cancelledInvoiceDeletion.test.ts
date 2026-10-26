// =============================================================
// Tests: Invoice Deletion — Safe Deletion of DRAFT & CANCELLED Invoices
// =============================================================
import {
  request,
  createTestOrg,
  createTestClient,
  createTestSite,
  createTestWorkEntry,
  authHeader,
} from './helpers';
import { prisma } from '../lib/prisma';
import { InvoiceStatus, ZatcaStatus, UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { config } from '../config';

describe('Invoice Safe Deletion (Draft & Cancelled Invoices)', () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;
  let clientA: any;
  let siteA: any;

  beforeAll(async () => {
    orgA = await createTestOrg('inv-del-orgA');
    orgB = await createTestOrg('inv-del-orgB');
    clientA = await createTestClient(orgA.orgId);
    siteA = await createTestSite(orgA.orgId, clientA.id);
  });

  async function createApprovedWorkEntry(qty = 50, price = 100) {
    return createTestWorkEntry(orgA.orgId, clientA.id, siteA.id, orgA.userId, {
      approved: true,
      approvedById: orgA.userId,
      quantity: qty,
      unitPrice: price,
    });
  }

  it('allows deleting a CANCELLED invoice with no protected dependencies and records audit log', async () => {
    const we = await createApprovedWorkEntry(30, 100);

    // 1. Create a direct invoice
    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'بند اختبار للإلغاء والحذف',
            unit: 'م²',
            quantity: 10,
            unitPrice: 100,
          },
        ],
      });
    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.data.id;
    const refNo = createRes.body.data.referenceNo;

    // 2. Approve invoice
    const approveRes = await request
      .post(`/api/invoices/${invoiceId}/approve`)
      .set(authHeader(orgA.accessToken));
    expect(approveRes.status).toBe(200);

    // 3. Cancel invoice
    const cancelRes = await request
      .post(`/api/invoices/${invoiceId}/cancel`)
      .set(authHeader(orgA.accessToken))
      .send({ cancellationReason: 'تم الإلغاء لخطأ بالبيانات' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe(InvoiceStatus.CANCELLED);

    // 4. Delete the CANCELLED invoice
    const deleteRes = await request
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgA.accessToken));
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.message).toContain('Cancelled invoice deleted permanently');

    // 5. Verify invoice no longer exists
    const getRes = await request
      .get(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgA.accessToken));
    expect(getRes.status).toBe(404);

    // 6. Verify audit log was recorded
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgA.orgId,
        entityType: 'Invoice',
        entityId: invoiceId,
        action: 'DELETE',
      },
    });
    expect(auditLog).toBeDefined();
    expect((auditLog?.metadata as any)?.referenceNo).toBe(refNo);
    expect((auditLog?.metadata as any)?.previousStatus).toBe(InvoiceStatus.CANCELLED);
  });

  it('prevents deleting an APPROVED or SENT invoice (must be cancelled first)', async () => {
    const we = await createApprovedWorkEntry(20, 150);

    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'بند اختبار غير ملغي',
            unit: 'م²',
            quantity: 5,
            unitPrice: 150,
          },
        ],
      });
    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.data.id;

    await request
      .post(`/api/invoices/${invoiceId}/approve`)
      .set(authHeader(orgA.accessToken));

    // Try deleting approved invoice
    const deleteRes = await request
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgA.accessToken));

    expect(deleteRes.status).toBe(422);
    expect(deleteRes.body.error?.message).toContain('Only DRAFT or CANCELLED invoices can be deleted');
  });

  it('allows deleting a DRAFT invoice and reconciles work entries', async () => {
    const we = await createApprovedWorkEntry(20, 100);

    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'مسودة فاتورة للحذف',
            unit: 'م²',
            quantity: 10,
            unitPrice: 100,
          },
        ],
      });
    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.data.id;

    // Check that work entry billed quantity was incremented
    const weAfterCreate = await prisma.workEntry.findUnique({ where: { id: we.id } });
    expect(Number(weAfterCreate?.billedQuantity)).toBe(10);

    // Delete draft invoice
    const deleteRes = await request
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgA.accessToken));
    expect(deleteRes.status).toBe(200);

    // Verify work entry billed quantity was reconciled back to 0
    const weAfterDelete = await prisma.workEntry.findUnique({ where: { id: we.id } });
    expect(Number(weAfterDelete?.billedQuantity)).toBe(0);
  });

  it('prevents deleting an invoice with recorded payments', async () => {
    const we = await createApprovedWorkEntry(20, 100);

    // Create and approve invoice
    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'فاتورة مع دفعة',
            unit: 'م²',
            quantity: 5,
            unitPrice: 100,
          },
        ],
      });
    const invoiceId = createRes.body.data.id;

    await request
      .post(`/api/invoices/${invoiceId}/approve`)
      .set(authHeader(orgA.accessToken));

    // Record a payment directly
    await prisma.payment.create({
      data: {
        organizationId: orgA.orgId,
        invoiceId,
        clientId: clientA.id,
        amount: 575,
        paymentDate: new Date(),
        referenceNo: 'PAY-TEST-001',
        method: 'BANK_TRANSFER',
        idempotencyKey: 'idemp-test-payment-001',
        recordedById: orgA.userId,
      },
    });

    // Mark invoice as cancelled (e.g. forced or simulated) while payment record exists
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CANCELLED, paidAmount: 575 },
    });

    // Try to delete cancelled invoice that has payment records
    const deleteRes = await request
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgA.accessToken));

    expect(deleteRes.status).toBe(422);
    expect(deleteRes.body.error?.message).toContain('payment');
  });

  it('prevents deleting an invoice officially reported to ZATCA', async () => {
    const we = await createApprovedWorkEntry(10, 100);

    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'فاتورة مرفوعة للزكاة',
            unit: 'م²',
            quantity: 5,
            unitPrice: 100,
          },
        ],
      });
    const invoiceId = createRes.body.data.id;

    // Simulate ZATCA reported status
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELLED,
        zatcaStatus: ZatcaStatus.REPORTED,
      },
    });

    // Try deleting
    const deleteRes = await request
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgA.accessToken));

    expect(deleteRes.status).toBe(422);
    expect(deleteRes.body.error?.message).toContain('ZATCA');
  });

  it('prevents deleting an invoice that has linked credit or debit notes', async () => {
    const we = await createApprovedWorkEntry(15, 100);

    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'فاتورة مع إشعار دائن',
            unit: 'م²',
            quantity: 5,
            unitPrice: 100,
          },
        ],
      });
    const invoiceId = createRes.body.data.id;

    // Set invoice to cancelled and create a linked credit note referencing this invoice
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CANCELLED },
    });

    await prisma.invoice.create({
      data: {
        organizationId: orgA.orgId,
        clientId: clientA.id,
        cancelledById: invoiceId,
        referenceNo: 'CN-TEST-001',
        invoiceType: 'CREDIT_NOTE',
        issueDate: new Date(),
        orgSnapshot: {},
        clientSnapshot: {},
        subtotal: 100,
        taxableAmount: 100,
        vatRate: 15,
        vatAmount: 15,
        totalAmount: 115,
        remainingAmount: 115,
        status: InvoiceStatus.APPROVED,
        createdById: orgA.userId,
      },
    });

    const deleteRes = await request
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgA.accessToken));

    expect(deleteRes.status).toBe(422);
    expect(deleteRes.body.error?.message).toContain('linked credit or debit notes');
  });

  it('enforces tenant isolation: another organization cannot delete invoices', async () => {
    const we = await createApprovedWorkEntry(10, 100);

    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'فاتورة منظمة أ',
            unit: 'م²',
            quantity: 5,
            unitPrice: 100,
          },
        ],
      });
    const invoiceId = createRes.body.data.id;

    // Org B attempts to delete Org A's invoice
    const deleteRes = await request
      .delete(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgB.accessToken));

    expect(deleteRes.status).toBe(403);
  });

  it('allows authorized admin to perform test data cleanup on an approved/paid invoice (?testCleanup=true)', async () => {
    const we = await createApprovedWorkEntry(40, 100);

    // 1. Create and approve invoice
    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'بند تنظيف بيانات اختبار',
            unit: 'م²',
            quantity: 10,
            unitPrice: 100,
          },
        ],
      });
    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.data.id;
    const refNo = createRes.body.data.referenceNo;

    await request
      .post(`/api/invoices/${invoiceId}/approve`)
      .set(authHeader(orgA.accessToken));

    // 2. Record a payment
    const payment = await prisma.payment.create({
      data: {
        organizationId: orgA.orgId,
        invoiceId,
        clientId: clientA.id,
        amount: 1150,
        paymentDate: new Date(),
        referenceNo: 'PAY-TEST-CLEANUP-001',
        method: 'BANK_TRANSFER',
        idempotencyKey: `idemp-cleanup-${Date.now()}`,
        recordedById: orgA.userId,
      },
    });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount: 1150, remainingAmount: 0, paymentStatus: 'PAID' },
    });

    // 3. Admin invokes delete with ?testCleanup=true
    const cleanupRes = await request
      .delete(`/api/invoices/${invoiceId}?testCleanup=true`)
      .set(authHeader(orgA.accessToken));

    expect(cleanupRes.status).toBe(200);
    expect(cleanupRes.body.success).toBe(true);
    expect(cleanupRes.body.data.isTestCleanup).toBe(true);

    // 4. Verify invoice is deleted
    const getInv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(getInv).toBeNull();

    // 5. Verify payment was reversed/deleted
    const getPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(getPay).toBeNull();

    // 6. Verify audit log was recorded with ADMIN_TEST_DATA_CLEANUP
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgA.orgId,
        entityType: 'Invoice',
        entityId: invoiceId,
        action: 'DELETE',
      },
    });
    expect(auditLog).toBeDefined();
    expect((auditLog?.metadata as any)?.operation).toBe('ADMIN_TEST_DATA_CLEANUP');
    expect((auditLog?.metadata as any)?.paymentsReversed).toBe(1);
  });

  it('blocks testCleanup if invoice was officially reported to ZATCA', async () => {
    const we = await createApprovedWorkEntry(10, 100);

    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'بند اختبار زكاة لا يحذف',
            unit: 'م²',
            quantity: 5,
            unitPrice: 100,
          },
        ],
      });
    const invoiceId = createRes.body.data.id;

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.APPROVED,
        zatcaStatus: ZatcaStatus.REPORTED,
      },
    });

    const cleanupRes = await request
      .delete(`/api/invoices/${invoiceId}?testCleanup=true`)
      .set(authHeader(orgA.accessToken));

    expect(cleanupRes.status).toBe(422);
    expect(cleanupRes.body.error?.message).toContain('ZATCA');
  });

  it('prevents non-admin users without MANAGE_SETTINGS from using testCleanup', async () => {
    const staffUser = await prisma.user.create({
      data: {
        organizationId: orgA.orgId,
        email: `staff-${Date.now()}@test.com`,
        passwordHash: 'dummyhash',
        nameAr: 'موظف بدون صلاحية إشراف',
        role: UserRole.ORG_STAFF,
        permissions: ['VIEW_DATA', 'ISSUE_INVOICES'],
      },
    });

    const staffToken = jwt.sign(
      {
        userId: staffUser.id,
        organizationId: orgA.orgId,
        email: staffUser.email,
        role: staffUser.role,
      },
      config.jwtAccessSecret,
      { expiresIn: '1h' }
    );

    const we = await createApprovedWorkEntry(10, 100);
    const createRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-25',
        lines: [
          {
            workEntryId: we.id,
            itemNameAr: 'فاتورة معتمدة',
            unit: 'م²',
            quantity: 5,
            unitPrice: 100,
          },
        ],
      });
    const invoiceId = createRes.body.data.id;

    await request
      .post(`/api/invoices/${invoiceId}/approve`)
      .set(authHeader(orgA.accessToken));

    // Staff attempts test cleanup
    const staffCleanupRes = await request
      .delete(`/api/invoices/${invoiceId}?testCleanup=true`)
      .set(authHeader(staffToken));

    expect(staffCleanupRes.status).toBe(403);
    expect(staffCleanupRes.body.error?.message).toContain('MANAGE_SETTINGS or ORG_ADMIN');
  });
});
