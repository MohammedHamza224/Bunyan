// =============================================================
// Tests: Billing — Prevent Double Billing, Statements, Invoices
// =============================================================
import { request, createTestOrg, createTestClient, createTestSite, createTestWorkEntry, authHeader } from './helpers';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

describe('Billing Rules', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let clientId: string;
  let siteId: string;
  let approvedEntryId: string;
  let draftEntryId: string;

  beforeAll(async () => {
    org = await createTestOrg('billing');
    const client = await createTestClient(org.orgId);
    const site = await createTestSite(org.orgId, client.id);
    clientId = client.id;
    siteId = site.id;

    // Create an approved work entry
    const approved = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId, { approved: true, quantity: 100, unitPrice: 50 });
    approvedEntryId = approved.id;

    // Create a draft entry (not approved)
    const draft = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId);
    draftEntryId = draft.id;
  });

  describe('Statement creation', () => {
    it('creates statement from approved work entries', async () => {
      const res = await request
        .post('/api/statements')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          siteIds: [siteId],
          issueDate: '2024-01-31',
          lines: [
            {
              workEntryId: approvedEntryId,
              approvedQuantity: 80, // partial of 100
              unitPrice: 50,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.subtotal)).toBe(4000); // 80 * 50
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('rejects including a DRAFT (non-approved) work entry', async () => {
      const res = await request
        .post('/api/statements')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          siteIds: [siteId],
          issueDate: '2024-01-31',
          lines: [
            {
              workEntryId: draftEntryId,
              approvedQuantity: 10,
              unitPrice: 100,
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('rejects quantity exceeding available (remaining) quantity', async () => {
      const res = await request
        .post('/api/statements')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          siteIds: [siteId],
          issueDate: '2024-01-31',
          lines: [
            {
              workEntryId: approvedEntryId,
              approvedQuantity: 200, // more than entry's quantity of 100
              unitPrice: 50,
            },
          ],
        });

      expect(res.status).toBe(422);
    });
  });

  describe('Invoice creation and double-billing prevention', () => {
    let statementId: string;
    let invoiceId: string;

    beforeAll(async () => {
      // Create a fresh approved entry for invoice tests
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId, { approved: true, quantity: 40, unitPrice: 100 });

      // Create & approve a statement
      const stmtRes = await request
        .post('/api/statements')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          siteIds: [siteId],
          issueDate: '2024-02-01',
          lines: [{ workEntryId: entry.id, approvedQuantity: 40, unitPrice: 100 }],
        });

      statementId = stmtRes.body.data.id;

      // Approve statement
      await request
        .post(`/api/statements/${statementId}/approve`)
        .set(authHeader(org.accessToken));
    });

    it('creates invoice from approved statement', async () => {
      const res = await request
        .post('/api/invoices/from-statement')
        .set(authHeader(org.accessToken))
        .send({
          statementId,
          issueDate: '2024-02-01',
          dueDate: '2024-03-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.statementId).toBe(statementId);
      invoiceId = res.body.data.id;
    });

    it('prevents creating a second invoice from the same statement', async () => {
      const res = await request
        .post('/api/invoices/from-statement')
        .set(authHeader(org.accessToken))
        .send({
          statementId,
          issueDate: '2024-02-01',
        });

      expect(res.status).toBe(422);
    });

    it('calculates VAT correctly (15%)', async () => {
      const invoice = await request
        .get(`/api/invoices/${invoiceId}`)
        .set(authHeader(org.accessToken));

      const data = invoice.body.data;
      const subtotal = parseFloat(data.subtotal);
      const vatAmount = parseFloat(data.vatAmount);
      const vatRate = parseFloat(data.vatRate);
      const total = parseFloat(data.totalAmount);

      expect(vatAmount).toBeCloseTo((subtotal * vatRate) / 100, 2);
      expect(total).toBeCloseTo(subtotal + vatAmount, 2);
    });
  });

  describe('Partial billing', () => {
    it('supports billing work entry in multiple stages', async () => {
      const entry = await createTestWorkEntry(org.orgId, clientId, siteId, org.userId, { approved: true, quantity: 100, unitPrice: 200 });

      // First invoice: 60 units
      const directInv1 = await request
        .post('/api/invoices/direct')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          issueDate: '2024-02-01',
          lines: [{ workEntryId: entry.id, quantity: 60, unitPrice: 200 }],
        });
      expect(directInv1.status).toBe(201);

      // Approve it
      await request.post(`/api/invoices/${directInv1.body.data.id}/approve`).set(authHeader(org.accessToken));

      // Check billedQuantity
      const updatedEntry = await prisma.workEntry.findUnique({ where: { id: entry.id } });
      expect(updatedEntry!.billedQuantity.toNumber()).toBe(60);
      expect(updatedEntry!.status).toBe('PARTIALLY_BILLED');

      // Second invoice: remaining 40 units
      const directInv2 = await request
        .post('/api/invoices/direct')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          issueDate: '2024-02-15',
          lines: [{ workEntryId: entry.id, quantity: 40, unitPrice: 200 }],
        });
      expect(directInv2.status).toBe(201);

      // Cannot bill more than 100 total
      const directInv3 = await request
        .post('/api/invoices/direct')
        .set(authHeader(org.accessToken))
        .send({
          clientId,
          issueDate: '2024-02-20',
          lines: [{ workEntryId: entry.id, quantity: 1, unitPrice: 200 }], // already fully billed
        });
      expect(directInv3.status).toBe(422);
    });
  });
});
