// =============================================================
// Tests: Clients & Sites
// =============================================================
import { request, createTestOrg, createTestClient, createTestSite, authHeader } from './helpers';

describe('Clients API', () => {
  let org1: Awaited<ReturnType<typeof createTestOrg>>;
  let org2: Awaited<ReturnType<typeof createTestOrg>>;

  beforeAll(async () => {
    org1 = await createTestOrg('clients-1');
    org2 = await createTestOrg('clients-2');
  });

  it('creates a client', async () => {
    const res = await request
      .post('/api/clients')
      .set(authHeader(org1.accessToken))
      .send({
        nameAr: 'شركة التطوير العمراني',
        nameEn: 'Urban Development Co.',
        clientType: 'COMPANY',
        phone: '+966501234567',
        email: 'info@urbandeve.sa',
        vatNumber: '300000000000003',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.nameAr).toBe('شركة التطوير العمراني');
    expect(res.body.data.organizationId).toBe(org1.orgId);
  });

  it('lists only own organization clients', async () => {
    // Create a client for org2
    await createTestClient(org2.orgId, { nameAr: 'عميل المنظمة الثانية' });

    const res = await request
      .get('/api/clients')
      .set(authHeader(org1.accessToken));

    expect(res.status).toBe(200);
    // Should not contain org2's client
    const names = res.body.data.items.map((c: any) => c.nameAr);
    expect(names).not.toContain('عميل المنظمة الثانية');
  });

  it('cannot access another org\'s client by ID', async () => {
    const org2Client = await createTestClient(org2.orgId);

    const res = await request
      .get(`/api/clients/${org2Client.id}`)
      .set(authHeader(org1.accessToken));

    expect(res.status).toBe(403);
  });

  it('soft-deletes a client (sets status to INACTIVE)', async () => {
    const client = await createTestClient(org1.orgId, { nameAr: 'عميل للحذف' });

    const res = await request
      .delete(`/api/clients/${client.id}`)
      .set(authHeader(org1.accessToken));

    expect(res.status).toBe(200);

    // Verify client still exists with INACTIVE status
    const getRes = await request
      .get(`/api/clients/${client.id}`)
      .set(authHeader(org1.accessToken));

    expect(getRes.body.data.status).toBe('INACTIVE');
  });

  it('adds multiple sites to a client', async () => {
    const client = await createTestClient(org1.orgId);

    const site1 = await request
      .post('/api/sites')
      .set(authHeader(org1.accessToken))
      .send({
        clientId: client.id,
        nameAr: 'موقع أول',
        nameEn: 'Site One',
        status: 'ACTIVE',
      });

    const site2 = await request
      .post('/api/sites')
      .set(authHeader(org1.accessToken))
      .send({
        clientId: client.id,
        nameAr: 'موقع ثاني',
        nameEn: 'Site Two',
        status: 'ACTIVE',
      });

    expect(site1.status).toBe(201);
    expect(site2.status).toBe(201);

    const clientDetail = await request
      .get(`/api/clients/${client.id}`)
      .set(authHeader(org1.accessToken));

    expect(clientDetail.body.data.sites.length).toBe(2);
  });
});

describe('Organization Isolation', () => {
  it('prevents cross-organization site access', async () => {
    const orgA = await createTestOrg('iso-a');
    const orgB = await createTestOrg('iso-b');

    const clientA = await createTestClient(orgA.orgId);
    const siteA = await createTestSite(orgA.orgId, clientA.id);

    // Try to access orgA's site from orgB's token
    const res = await request
      .get(`/api/sites/${siteA.id}`)
      .set(authHeader(orgB.accessToken));

    expect(res.status).toBe(403);
  });
});
