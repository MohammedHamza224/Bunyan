// =============================================================
// Tests: Payments
// =============================================================
import { request, createTestOrg, createTestClient, createTestSite, createTestWorkEntry, authHeader } from './helpers';

describe('Payments', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let clientId: string;
  let invoiceId: string;
  let invoiceTotal: number;

  beforeAll(async () => {
    org = await createTestOrg('payments');
    const client = await createTestClient(org.orgId);
    const site = await createTestSite(org.orgId, client.id);
    clientId = client.id;

    const entry = await createTestWorkEntry(org.orgId, clientId, site.id, org.userId, { approved: true, quantity: 10, unitPrice: 1000 });

    // Create & approve direct invoice
    const invRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(org.accessToken))
      .send({
        clientId,
        issueDate: '2024-03-01',
        lines: [{ workEntryId: entry.id, quantity: 10, unitPrice: 1000 }],
      });
    invoiceId = invRes.body.data.id;

    await request.post(`/api/invoices/${invoiceId}/approve`).set(authHeader(org.accessToken));

    const inv = await request.get(`/api/invoices/${invoiceId}`).set(authHeader(org.accessToken));
    invoiceTotal = parseFloat(inv.body.data.totalAmount);
  });

  it('records a partial payment', async () => {
    const res = await request
      .post('/api/payments')
      .set(authHeader(org.accessToken))
      .send({
        invoiceId,
        paymentDate: '2024-03-10',
        amount: 5000,
        method: 'BANK_TRANSFER',
        referenceNo: 'TXN-001',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.data.amount)).toBe(5000);

    // Check invoice payment status
    const inv = await request.get(`/api/invoices/${invoiceId}`).set(authHeader(org.accessToken));
    expect(inv.body.data.paymentStatus).toBe('PARTIALLY_PAID');
    expect(parseFloat(inv.body.data.paidAmount)).toBe(5000);
  });

  it('records multiple payments for same invoice', async () => {
    const remaining = await request.get(`/api/invoices/${invoiceId}`).set(authHeader(org.accessToken));
    const remainingAmount = parseFloat(remaining.body.data.remainingAmount);

    const res = await request
      .post('/api/payments')
      .set(authHeader(org.accessToken))
      .send({
        invoiceId,
        paymentDate: '2024-03-20',
        amount: remainingAmount,
        method: 'BANK_TRANSFER',
        referenceNo: 'TXN-002',
      });

    expect(res.status).toBe(201);

    const inv = await request.get(`/api/invoices/${invoiceId}`).set(authHeader(org.accessToken));
    expect(inv.body.data.paymentStatus).toBe('PAID');
    expect(parseFloat(inv.body.data.remainingAmount)).toBe(0);
  });

  it('prevents payment exceeding invoice total', async () => {
    // Create a new invoice for this test
    const org2 = await createTestOrg('payments-overflow');
    const client2 = await createTestClient(org2.orgId);
    const site2 = await createTestSite(org2.orgId, client2.id);
    const entry2 = await createTestWorkEntry(org2.orgId, client2.id, site2.id, org2.userId, { approved: true, quantity: 1, unitPrice: 100 });

    const invRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(org2.accessToken))
      .send({
        clientId: client2.id,
        issueDate: '2024-03-01',
        lines: [{ workEntryId: entry2.id, quantity: 1, unitPrice: 100 }],
      });
    const testInvoiceId = invRes.body.data.id;
    await request.post(`/api/invoices/${testInvoiceId}/approve`).set(authHeader(org2.accessToken));

    const inv = await request.get(`/api/invoices/${testInvoiceId}`).set(authHeader(org2.accessToken));
    const invTotal = parseFloat(inv.body.data.totalAmount);

    const res = await request
      .post('/api/payments')
      .set(authHeader(org2.accessToken))
      .send({
        invoiceId: testInvoiceId,
        paymentDate: '2024-03-05',
        amount: invTotal + 1000, // exceeds total
        method: 'CASH',
      });

    expect(res.status).toBe(422);
  });

  it('calculates remaining amount correctly after payments', async () => {
    const org3 = await createTestOrg('payments-remaining');
    const client3 = await createTestClient(org3.orgId);
    const site3 = await createTestSite(org3.orgId, client3.id);
    const entry3 = await createTestWorkEntry(org3.orgId, client3.id, site3.id, org3.userId, { approved: true, quantity: 5, unitPrice: 1000 });

    const invRes = await request
      .post('/api/invoices/direct')
      .set(authHeader(org3.accessToken))
      .send({
        clientId: client3.id,
        issueDate: '2024-03-01',
        lines: [{ workEntryId: entry3.id, quantity: 5, unitPrice: 1000 }],
      });
    const testInvId = invRes.body.data.id;
    await request.post(`/api/invoices/${testInvId}/approve`).set(authHeader(org3.accessToken));

    // Pay 2000
    await request.post('/api/payments').set(authHeader(org3.accessToken)).send({
      invoiceId: testInvId, paymentDate: '2024-03-05', amount: 2000, method: 'CASH',
    });

    // Pay 1000
    await request.post('/api/payments').set(authHeader(org3.accessToken)).send({
      invoiceId: testInvId, paymentDate: '2024-03-06', amount: 1000, method: 'CASH',
    });

    const inv = await request.get(`/api/invoices/${testInvId}`).set(authHeader(org3.accessToken));
    const total = parseFloat(inv.body.data.totalAmount);
    const paid = parseFloat(inv.body.data.paidAmount);
    const remaining = parseFloat(inv.body.data.remainingAmount);

    expect(paid).toBe(3000);
    expect(remaining).toBeCloseTo(total - 3000, 2);
    expect(inv.body.data.paymentStatus).toBe('PARTIALLY_PAID');
  });
});
