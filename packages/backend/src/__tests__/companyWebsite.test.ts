import { prisma } from '../lib/prisma';
import { request, createTestOrg, authHeader } from './helpers';

describe('Company Website Settings API (الموقع الإلكتروني للمنشأة)', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;

  beforeAll(async () => {
    org = await createTestOrg('company-website-test');
  });

  afterAll(async () => {
    try {
      await prisma.orgSettings.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.user.deleteMany({ where: { organizationId: org.orgId } });
      await prisma.organization.deleteMany({ where: { id: org.orgId } });
    } catch {
      // ignore
    }
  });

  it('allows saving an optional valid company website URL', async () => {
    const res = await request
      .put('/api/organizations/settings')
      .set(authHeader(org.accessToken))
      .send({
        website: 'https://bunyan-enterprise.example.com',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.website).toBe('https://bunyan-enterprise.example.com');

    // Verify persisted in DB
    const persisted = await prisma.orgSettings.findUnique({
      where: { organizationId: org.orgId },
    });
    expect(persisted?.website).toBe('https://bunyan-enterprise.example.com');
  });

  it('allows clearing the website URL by sending empty string or null', async () => {
    const res = await request
      .put('/api/organizations/settings')
      .set(authHeader(org.accessToken))
      .send({
        website: '',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.website).toBeNull();

    const persisted = await prisma.orgSettings.findUnique({
      where: { organizationId: org.orgId },
    });
    expect(persisted?.website).toBeNull();
  });

  it('rejects invalid website URLs with user-friendly error message', async () => {
    const res = await request
      .put('/api/organizations/settings')
      .set(authHeader(org.accessToken))
      .send({
        website: 'not-a-valid-url-without-protocol',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('http://');
  });
});
