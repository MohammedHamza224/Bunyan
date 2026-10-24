const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const records = await prisma.auditLog.findMany({
    select: { entityType: true, action: true },
    distinct: ['entityType', 'action'],
  });
  console.log('Distinct auditLog records:', records);
  const count = await prisma.auditLog.count();
  console.log('Total audit logs in DB:', count);
  await prisma.$disconnect();
}

main().catch(console.error);
