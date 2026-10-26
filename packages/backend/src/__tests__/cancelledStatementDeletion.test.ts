// =============================================================
// Tests: Statement Deletion — Safe Deletion of DRAFT & CANCELLED Statements
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
import { InvoiceStatus, ZatcaStatus } from '@prisma/client';

describe('Statement Safe Deletion (Draft & Cancelled Statements)', () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;
  let clientA: any;
  let siteA: any;

  beforeAll(async () => {
    orgA = await createTestOrg('stmt-del-orgA');
    orgB = await createTestOrg('stmt-del-orgB');
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

  it('Case A: allows deleting a CANCELLED statement with no linked invoices and records audit log', async () => {
    const we = await createApprovedWorkEntry(50, 100);

    // 1. Create a statement
    const createRes = await request
      .post('/api/statements')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        siteIds: [siteA.id],
        title: 'مستخلص للإلغاء والحذف',
        issueDate: '2026-10-25',
        lines: [{ workEntryId: we.id, approvedQuantity: 20 }],
      });
    expect(createRes.status).toBe(201);
    const stmtId = createRes.body.data.id;
    const refNo = createRes.body.data.referenceNo;

    // 2. Approve then Cancel it
    const approveRes = await request
      .post(`/api/statements/${stmtId}/approve`)
      .set(authHeader(orgA.accessToken));
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const cancelRes = await request
      .post(`/api/statements/${stmtId}/cancel`)
      .set(authHeader(orgA.accessToken))
      .send({ reason: 'إلغاء لخطأ في التسعير' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    // 3. Delete the CANCELLED statement
    const deleteRes = await request
      .delete(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.message).toContain('Cancelled statement deleted permanently');

    // 4. Verify it no longer exists
    const getRes = await request
      .get(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));
    expect(getRes.status).toBe(404);

    // 5. Verify audit log was recorded
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgA.orgId,
        entityType: 'Statement',
        entityId: stmtId,
        action: 'DELETE',
      },
    });
    expect(auditLog).toBeDefined();
    expect((auditLog?.metadata as any)?.referenceNo).toBe(refNo);
    expect((auditLog?.metadata as any)?.status).toBe('CANCELLED');
  });

  it('Case B: allows deleting a CANCELLED statement whose linked invoice is also CANCELLED and has no dependencies', async () => {
    const we = await createApprovedWorkEntry(40, 100);

    // 1. Create statement
    const createRes = await request
      .post('/api/statements')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        siteIds: [siteA.id],
        title: 'مستخلص تم فوترته ثم إلغاؤه',
        issueDate: '2026-10-25',
        lines: [{ workEntryId: we.id, approvedQuantity: 15 }],
      });
    expect(createRes.status).toBe(201);
    const stmtId = createRes.body.data.id;
    const stmtRef = createRes.body.data.referenceNo;

    // 2. Approve statement
    await request
      .post(`/api/statements/${stmtId}/approve`)
      .set(authHeader(orgA.accessToken));

    // 3. Generate invoice from statement
    const invRes = await request
      .post('/api/invoices/from-statement')
      .set(authHeader(orgA.accessToken))
      .send({
        statementId: stmtId,
        issueDate: '2026-10-25',
      });
    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body.data.id;
    const invRef = invRes.body.data.referenceNo;

    // 4. Cancel the invoice (reverses billing status, resets statement to APPROVED)
    const cancelInvRes = await request
      .post(`/api/invoices/${invoiceId}/cancel`)
      .set(authHeader(orgA.accessToken))
      .send({ cancellationReason: 'إلغاء الفاتورة تمهيداً لحذف المستخلص' });
    expect(cancelInvRes.status).toBe(200);

    // 5. Cancel the statement
    const cancelStmtRes = await request
      .post(`/api/statements/${stmtId}/cancel`)
      .set(authHeader(orgA.accessToken))
      .send({ reason: 'إلغاء المستخلص نهائياً' });
    expect(cancelStmtRes.status).toBe(200);
    expect(cancelStmtRes.body.data.status).toBe('CANCELLED');

    // 6. Delete the CANCELLED statement -> must cascade delete the eligible cancelled invoice cleanly
    const deleteRes = await request
      .delete(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // 7. Verify both statement and invoice are gone
    const getStmtRes = await request
      .get(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));
    expect(getStmtRes.status).toBe(404);

    const getInvRes = await request
      .get(`/api/invoices/${invoiceId}`)
      .set(authHeader(orgA.accessToken));
    expect(getInvRes.status).toBe(404);

    // 8. Verify audit logs for both
    const stmtAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'Statement', entityId: stmtId, action: 'DELETE' },
    });
    expect(stmtAudit).toBeDefined();

    const invAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'Invoice', entityId: invoiceId, action: 'DELETE' },
    });
    expect(invAudit).toBeDefined();
    expect((invAudit?.metadata as any)?.parentStatementRef).toBe(stmtRef);
  });

  it('Case C: blocks deleting a statement linked to ACTIVE or ISSUED invoices with clear message', async () => {
    const we = await createApprovedWorkEntry(40, 120);

    // 1. Create statement
    const createRes = await request
      .post('/api/statements')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        siteIds: [siteA.id],
        title: 'مستخلص مرتبط بفاتورة نشطة',
        issueDate: '2026-10-25',
        lines: [{ workEntryId: we.id, approvedQuantity: 10 }],
      });
    expect(createRes.status).toBe(201);
    const stmtId = createRes.body.data.id;

    // 2. Approve statement
    await request
      .post(`/api/statements/${stmtId}/approve`)
      .set(authHeader(orgA.accessToken));

    // 3. Generate invoice from statement
    const invRes = await request
      .post('/api/invoices/from-statement')
      .set(authHeader(orgA.accessToken))
      .send({
        statementId: stmtId,
        issueDate: '2026-10-25',
      });
    expect(invRes.status).toBe(201);
    const invoiceRef = invRes.body.data.referenceNo;

    // 4. Try to delete statement while invoice is still active
    const delRes = await request
      .delete(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));

    expect(delRes.status).toBe(422);
    expect(delRes.body.error?.message).toContain(invoiceRef);
    expect(delRes.body.error?.message).toContain('active or issued invoice');
  });

  it('Case D: blocks deleting statement when linked cancelled invoice has recorded payment history', async () => {
    const we = await createApprovedWorkEntry(30, 100);

    // 1. Create and approve statement
    const createRes = await request
      .post('/api/statements')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        siteIds: [siteA.id],
        title: 'مستخلص مع فاتورة مدفوعة',
        issueDate: '2026-10-25',
        lines: [{ workEntryId: we.id, approvedQuantity: 10 }],
      });
    const stmtId = createRes.body.data.id;

    await request
      .post(`/api/statements/${stmtId}/approve`)
      .set(authHeader(orgA.accessToken));

    // 2. Generate invoice
    const invRes = await request
      .post('/api/invoices/from-statement')
      .set(authHeader(orgA.accessToken))
      .send({
        statementId: stmtId,
        issueDate: '2026-10-25',
      });
    const invoiceId = invRes.body.data.id;

    // Record payment directly
    await prisma.payment.create({
      data: {
        organizationId: orgA.orgId,
        invoiceId,
        clientId: clientA.id,
        amount: 500,
        paymentDate: new Date(),
        referenceNo: 'PAY-STMT-001',
        method: 'BANK_TRANSFER',
        idempotencyKey: 'idemp-stmt-payment-001',
        recordedById: orgA.userId,
      },
    });

    // Set invoice and statement to cancelled
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CANCELLED, paidAmount: 500 },
    });
    await prisma.statement.update({
      where: { id: stmtId },
      data: { status: 'CANCELLED' },
    });

    // Try deleting statement -> must be blocked due to payment history
    const delRes = await request
      .delete(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));

    expect(delRes.status).toBe(422);
    expect(delRes.body.error?.message).toContain('payment history');
  });

  it('prevents deleting an APPROVED statement directly (must be cancelled first)', async () => {
    const we = await createApprovedWorkEntry(30, 150);

    const createRes = await request
      .post('/api/statements')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        siteIds: [siteA.id],
        title: 'مستخلص معتمد لا يحذف مباشرة',
        issueDate: '2026-10-25',
        lines: [{ workEntryId: we.id, approvedQuantity: 10 }],
      });
    expect(createRes.status).toBe(201);
    const stmtId = createRes.body.data.id;

    await request
      .post(`/api/statements/${stmtId}/approve`)
      .set(authHeader(orgA.accessToken));

    const deleteRes = await request
      .delete(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));

    expect(deleteRes.status).toBe(422);
    expect(deleteRes.body.error?.message).toContain('Only DRAFT or CANCELLED statements can be deleted');
  });

  it('allows deleting a DRAFT statement and releases work entries', async () => {
    const we = await createApprovedWorkEntry(25, 80);

    const createRes = await request
      .post('/api/statements')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        siteIds: [siteA.id],
        title: 'مسودة مستخلص للحذف',
        issueDate: '2026-10-25',
        lines: [{ workEntryId: we.id, approvedQuantity: 5 }],
      });
    expect(createRes.status).toBe(201);
    const stmtId = createRes.body.data.id;

    const deleteRes = await request
      .delete(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));
    expect(deleteRes.status).toBe(200);

    const getRes = await request
      .get(`/api/statements/${stmtId}`)
      .set(authHeader(orgA.accessToken));
    expect(getRes.status).toBe(404);
  });

  it('enforces tenant isolation: another organization cannot delete statements', async () => {
    const we = await createApprovedWorkEntry(15, 90);

    const createRes = await request
      .post('/api/statements')
      .set(authHeader(orgA.accessToken))
      .send({
        clientId: clientA.id,
        siteIds: [siteA.id],
        title: 'مستخلص منظمة أ',
        issueDate: '2026-10-25',
        lines: [{ workEntryId: we.id, approvedQuantity: 5 }],
      });
    expect(createRes.status).toBe(201);
    const stmtId = createRes.body.data.id;

    // Org B attempts to delete Org A's statement
    const deleteRes = await request
      .delete(`/api/statements/${stmtId}`)
      .set(authHeader(orgB.accessToken));

    expect(deleteRes.status).toBe(403);
  });
});
