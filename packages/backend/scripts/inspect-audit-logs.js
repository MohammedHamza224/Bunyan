const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.log('No org found');
    return;
  }
  const total = await prisma.auditLog.count({ where: { organizationId: org.id } });
  console.log(`Total audit logs for org ${org.id}: ${total}`);

  // Group by entityType and action
  const byType = await prisma.auditLog.groupBy({
    by: ['entityType', 'action'],
    where: { organizationId: org.id },
    _count: true,
  });

  console.log('\nAudit logs breakdown:');
  byType.forEach((b) => {
    console.log(` - Entity: ${b.entityType} | Action: ${b.action} | Count: ${b._count}`);
  });

  // Check date ranges
  const oldest = await prisma.auditLog.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, entityType: true, action: true },
  });
  const newest = await prisma.auditLog.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, entityType: true, action: true },
  });
  console.log(`\nOldest log date: ${oldest?.createdAt}`);
  console.log(`Newest log date: ${newest?.createdAt}`);
  console.log(`Current server time: ${new Date().toISOString()}`);

  // Test default 90 days cutoff
  const d90 = new Date();
  d90.setDate(d90.getDate() - 90);
  const olderThan90 = await prisma.auditLog.count({
    where: { organizationId: org.id, createdAt: { lt: d90 } },
  });
  console.log(`Records older than 90 days: ${olderThan90}`);

  // Test 30 days cutoff
  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const olderThan30 = await prisma.auditLog.count({
    where: { organizationId: org.id, createdAt: { lt: d30 } },
  });
  console.log(`Records older than 30 days: ${olderThan30}`);

  await prisma.$disconnect();
}

main().catch(console.error);
