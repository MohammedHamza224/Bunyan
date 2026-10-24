// =============================================================
// Backend Test Setup — Scoped Cleanup (Preserves Real User Data)
// =============================================================
import { prisma } from '../lib/prisma';
import { config } from '../config';

// Ensure we're in test mode
if (config.nodeEnv !== 'test') {
  throw new Error('Tests must run with NODE_ENV=test');
}

async function cleanTestOrganizationsOnly() {
  const testOrgs = await prisma.organization.findMany({
    where: {
      OR: [
        {
          users: {
            some: {
              OR: [
                { email: { endsWith: '@test.com', mode: 'insensitive' } },
                { email: { endsWith: '@auth-test.com', mode: 'insensitive' } },
                { email: { endsWith: '@orga.com', mode: 'insensitive' } },
              ],
            },
          },
        },
        {
          users: {
            none: {},
          },
        },
      ],
    },
    select: { id: true },
  });

  const testOrgIds = testOrgs.map((o) => o.id);
  if (testOrgIds.length === 0) return;

  const testUsers = await prisma.user.findMany({
    where: { organizationId: { in: testOrgIds } },
    select: { id: true },
  });
  const testUserIds = testUsers.map((u) => u.id);

  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.payment.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.invoiceLine.deleteMany({
      where: { invoice: { organizationId: { in: testOrgIds } } },
    }),
    prisma.invoice.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.statementLine.deleteMany({
      where: { statement: { organizationId: { in: testOrgIds } } },
    }),
    prisma.statementSite.deleteMany({
      where: { statement: { organizationId: { in: testOrgIds } } },
    }),
    prisma.statement.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.workEntry.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.workItemTemplate.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.site.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.client.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: { in: testUserIds } } }),
    prisma.refreshToken.deleteMany({ where: { userId: { in: testUserIds } } }),
    prisma.user.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.documentSequence.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.orgSettings.deleteMany({ where: { organizationId: { in: testOrgIds } } }),
    prisma.organization.deleteMany({ where: { id: { in: testOrgIds } } }),
  ]);
}

// Clean only test organizations before and after each test file
beforeAll(async () => {
  await cleanTestOrganizationsOnly();
});

afterAll(async () => {
  await cleanTestOrganizationsOnly();
  await prisma.$disconnect();
});
