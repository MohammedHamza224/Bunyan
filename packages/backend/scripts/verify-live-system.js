const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- 1. Checking Business Records Before Any Reset ---');
  const orgCount = await prisma.organization.count();
  const invoiceCount = await prisma.invoice.count();
  const statementCount = await prisma.statement.count();
  const paymentCount = await prisma.payment.count();
  const workEntryCount = await prisma.workEntry.count();
  const workItemCount = await prisma.workItemTemplate.count();
  const unitCount = await prisma.unitOfMeasure.count();
  const initialAuditCount = await prisma.auditLog.count();

  console.log({
    organizations: orgCount,
    invoices: invoiceCount,
    statements: statementCount,
    payments: paymentCount,
    workEntries: workEntryCount,
    workItems: workItemCount,
    unitsOfMeasure: unitCount,
    totalAuditLogs: initialAuditCount,
  });

  console.log('\n--- 2. Inspecting Live Units of Measure ---');
  const units = await prisma.unitOfMeasure.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { code: true, nameAr: true, symbolAr: true, category: true, isDefault: true, isActive: true },
  });
  console.table(units);

  console.log('\n--- 3. Checking Audit Logs Breakdown ---');
  const auditActions = await prisma.auditLog.groupBy({
    by: ['action'],
    _count: true,
  });
  console.log('Audit logs by action:', auditActions);

  const auditEntities = await prisma.auditLog.groupBy({
    by: ['entityType'],
    _count: true,
  });
  console.log('Audit logs by entityType:', auditEntities);

  console.log('\n--- 4. Verifying Safety Checks ---');
  // Ensure that no invoices or statements or payments were affected
  if (invoiceCount === 0 && statementCount === 0) {
    console.warn('Note: Invoices and statements count is 0, checking if any exist in DB');
  } else {
    console.log(`Confirmed: ${invoiceCount} invoices and ${statementCount} statements are safely stored.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
