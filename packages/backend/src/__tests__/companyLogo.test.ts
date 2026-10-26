import fs from 'fs';
import path from 'path';
import { request, createTestOrg } from './helpers';
import { prisma } from '../lib/prisma';
import { config } from '../config';

describe('Company Logo Management API', () => {
  let testOrg: any;
  const createdFiles: string[] = [];

  beforeAll(async () => {
    testOrg = await createTestOrg(`logo-${Date.now()}`);
  });

  afterAll(async () => {
    // Clean up created files on disk
    for (const f of createdFiles) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {}
      }
    }
  });

  it('rejects unauthenticated logo upload', async () => {
    const res = await request
      .post('/api/organizations/logo')
      .attach('logo', Buffer.from('fake-png'), { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
  });

  it('rejects unsupported file formats (e.g. text/plain)', async () => {
    const res = await request
      .post('/api/organizations/logo')
      .set('Authorization', `Bearer ${testOrg.accessToken}`)
      .attach('logo', Buffer.from('not an image'), { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects oversized files (> 5MB)', async () => {
    // 5.5 MB buffer
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0);

    const res = await request
      .post('/api/organizations/logo')
      .set('Authorization', `Bearer ${testOrg.accessToken}`)
      .attach('logo', largeBuffer, { filename: 'oversized.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('successfully uploads and stores a valid PNG logo', async () => {
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );

    const res = await request
      .post('/api/organizations/logo')
      .set('Authorization', `Bearer ${testOrg.accessToken}`)
      .attach('logo', pngBuffer, { filename: 'company-logo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.logoUrl).toBeDefined();
    expect(res.body.data.logoUrl).toMatch(/^\/uploads\/logo-/);

    const logoUrl = res.body.data.logoUrl;
    const filename = path.basename(logoUrl);
    const diskPath = path.resolve(config.uploadDir, filename);
    createdFiles.push(diskPath);

    expect(fs.existsSync(diskPath)).toBe(true);

    // Verify OrgSettings in database
    const settings = await prisma.orgSettings.findUnique({
      where: { organizationId: testOrg.orgId },
    });
    expect(settings?.logoUrl).toBe(logoUrl);

    // Verify Audit Log
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: testOrg.orgId,
        action: 'SETTINGS_UPDATE',
        description: 'Company logo uploaded and updated',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeDefined();
  });

  it('replaces existing logo cleanly and deletes the old file', async () => {
    const pngBuffer1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );

    // Upload first
    const res1 = await request
      .post('/api/organizations/logo')
      .set('Authorization', `Bearer ${testOrg.accessToken}`)
      .attach('logo', pngBuffer1, { filename: 'first.png', contentType: 'image/png' });

    expect(res1.status).toBe(200);
    const oldUrl = res1.body.data.logoUrl;
    const oldDiskPath = path.resolve(config.uploadDir, path.basename(oldUrl));

    expect(fs.existsSync(oldDiskPath)).toBe(true);

    // Upload second
    const pngBuffer2 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );

    const res2 = await request
      .post('/api/organizations/logo')
      .set('Authorization', `Bearer ${testOrg.accessToken}`)
      .attach('logo', pngBuffer2, { filename: 'second.png', contentType: 'image/png' });

    expect(res2.status).toBe(200);
    const newUrl = res2.body.data.logoUrl;
    const newDiskPath = path.resolve(config.uploadDir, path.basename(newUrl));
    createdFiles.push(newDiskPath);

    // Old file should be deleted
    expect(fs.existsSync(oldDiskPath)).toBe(false);
    // New file should exist
    expect(fs.existsSync(newDiskPath)).toBe(true);

    const settings = await prisma.orgSettings.findUnique({
      where: { organizationId: testOrg.orgId },
    });
    expect(settings?.logoUrl).toBe(newUrl);
  });

  it('removes logo via DELETE and cleans up disk file', async () => {
    const res = await request
      .delete('/api/organizations/logo')
      .set('Authorization', `Bearer ${testOrg.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.logoUrl).toBeNull();

    const settings = await prisma.orgSettings.findUnique({
      where: { organizationId: testOrg.orgId },
    });
    expect(settings?.logoUrl).toBeNull();

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: testOrg.orgId,
        action: 'SETTINGS_UPDATE',
        description: 'Company logo removed',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeDefined();
  });
});
