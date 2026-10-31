const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// 1. Initialize Local Source Connection
const localEnv = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
const localPrisma = new PrismaClient({ datasources: { db: { url: localEnv.DATABASE_URL } } });

// 2. Initialize Supabase Target Connection
const supaEnvFile = path.join(__dirname, '../.env.production.local');
const supaEnv = require('dotenv').parse(fs.readFileSync(supaEnvFile));
const supaUrl = supaEnv.DATABASE_URL.includes('connect_timeout')
  ? supaEnv.DATABASE_URL
  : supaEnv.DATABASE_URL + '&connect_timeout=30';
const supaPrisma = new PrismaClient({ datasources: { db: { url: supaUrl } } });

async function executeMigration() {
  const startTime = new Date().toISOString();
  console.log('=============================================================');
  console.log('   BUNYAN DATABASE PRODUCTION MIGRATION EXECUTION            ');
  console.log('=============================================================');
  console.log(`Start Time: ${startTime}`);

  // Fetch complete dataset from local
  console.log('\n[1/6] Extracting source dataset from Localhost PGlite...');
  const localData = {
    organizations: await localPrisma.organization.findMany(),
    orgSettings: await localPrisma.orgSettings.findMany(),
    orgBankAccounts: await localPrisma.orgBankAccount.findMany(),
    users: await localPrisma.user.findMany(),
    unitsOfMeasure: await localPrisma.unitOfMeasure.findMany(),
    clients: await localPrisma.client.findMany(),
    sites: await localPrisma.site.findMany(),
    workItemTemplates: await localPrisma.workItemTemplate.findMany(),
    workEntries: await localPrisma.workEntry.findMany(),
    statements: await localPrisma.statement.findMany(),
    statementSites: await localPrisma.statementSite.findMany(),
    statementLines: await localPrisma.statementLine.findMany(),
    invoices: await localPrisma.invoice.findMany(),
    invoiceLines: await localPrisma.invoiceLine.findMany(),
    payments: await localPrisma.payment.findMany(),
    documentSequences: await localPrisma.documentSequence.findMany(),
    auditLogs: await localPrisma.auditLog.findMany(),
    testDatasets: await localPrisma.testDataset.findMany(),
    testDatasetRecords: await localPrisma.testDatasetRecord.findMany(),
  };
  console.log(`✅ Loaded ${Object.keys(localData).length} model collections from Localhost.`);

  console.log('\n[2/6] Executing atomic database transaction on Supabase...');

  await supaPrisma.$transaction(async (tx) => {
    // A. Migrate Primary Organization
    console.log('  -> Inserting Primary Organization...');
    for (const org of localData.organizations) {
      await tx.organization.upsert({
        where: { id: org.id },
        create: org,
        update: { isActive: org.isActive },
      });
    }

    console.log('  -> Inserting OrgSettings...');
    for (const set of localData.orgSettings) {
      await tx.orgSettings.upsert({
        where: { id: set.id },
        create: set,
        update: set,
      });
    }

    console.log('  -> Inserting OrgBankAccounts...');
    for (const bank of localData.orgBankAccounts) {
      await tx.orgBankAccount.upsert({
        where: { id: bank.id },
        create: bank,
        update: bank,
      });
    }

    // B. Reconcile Users
    console.log('  -> Reconciling Users...');
    for (const user of localData.users) {
      const existing = await tx.user.findFirst({
        where: { email: { equals: user.email.toLowerCase().trim(), mode: 'insensitive' } },
      });

      if (existing) {
        // Update user in place preserving exact local CUID and password hash
        await tx.user.update({
          where: { id: existing.id },
          data: {
            id: user.id, // Update to match local CUID for foreign keys
            organizationId: user.organizationId,
            passwordHash: user.passwordHash,
            nameAr: user.nameAr,
            nameEn: user.nameEn,
            role: user.role,
            permissions: user.permissions,
            isActive: user.isActive,
          },
        });
      } else {
        await tx.user.create({ data: user });
      }
    }

    // C. Units of Measure
    console.log('  -> Inserting UnitsOfMeasure...');
    if (localData.unitsOfMeasure && localData.unitsOfMeasure.length > 0) {
      await tx.unitOfMeasure.createMany({
        data: localData.unitsOfMeasure,
        skipDuplicates: true,
      });
    }

    // D. Master Entities
    console.log('  -> Inserting Clients (bulk)...');
    if (localData.clients.length > 0) {
      await tx.client.createMany({
        data: localData.clients,
        skipDuplicates: true,
      });
    }

    console.log('  -> Inserting Sites (bulk)...');
    if (localData.sites.length > 0) {
      await tx.site.createMany({
        data: localData.sites,
        skipDuplicates: true,
      });
    }

    console.log('  -> Inserting WorkItemTemplates (bulk)...');
    if (localData.workItemTemplates.length > 0) {
      await tx.workItemTemplate.createMany({
        data: localData.workItemTemplates,
        skipDuplicates: true,
      });
    }

    // E. Operational Work Entries
    console.log('  -> Inserting WorkEntries (bulk)...');
    if (localData.workEntries.length > 0) {
      await tx.workEntry.createMany({
        data: localData.workEntries,
        skipDuplicates: true,
      });
    }

    // F. Statements
    console.log('  -> Inserting Statements & Lines (bulk)...');
    if (localData.statements.length > 0) {
      await tx.statement.createMany({
        data: localData.statements,
        skipDuplicates: true,
      });
    }
    if (localData.statementSites.length > 0) {
      await tx.statementSite.createMany({
        data: localData.statementSites,
        skipDuplicates: true,
      });
    }
    if (localData.statementLines.length > 0) {
      await tx.statementLine.createMany({
        data: localData.statementLines,
        skipDuplicates: true,
      });
    }

    // G. Invoices & Lines
    console.log('  -> Inserting Invoices & Lines (bulk)...');
    if (localData.invoices.length > 0) {
      await tx.invoice.createMany({
        data: localData.invoices,
        skipDuplicates: true,
      });
    }
    if (localData.invoiceLines.length > 0) {
      await tx.invoiceLine.createMany({
        data: localData.invoiceLines,
        skipDuplicates: true,
      });
    }

    // H. Payments
    console.log('  -> Inserting Payments (bulk)...');
    if (localData.payments.length > 0) {
      await tx.payment.createMany({
        data: localData.payments,
        skipDuplicates: true,
      });
    }

    // I. Document Sequences
    console.log('  -> Synchronizing DocumentSequences...');
    for (const seq of localData.documentSequences) {
      await tx.documentSequence.upsert({
        where: { id: seq.id },
        create: seq,
        update: {
          currentNumber: seq.currentNumber,
          prefix: seq.prefix,
          year: seq.year,
        },
      });
    }

    // J. Test Data Benchmark & Audit Logs
    console.log('  -> Inserting Test Datasets & Records (bulk)...');
    if (localData.testDatasets.length > 0) {
      await tx.testDataset.createMany({
        data: localData.testDatasets,
        skipDuplicates: true,
      });
    }
    if (localData.testDatasetRecords.length > 0) {
      await tx.testDatasetRecord.createMany({
        data: localData.testDatasetRecords,
        skipDuplicates: true,
      });
    }

    console.log('  -> Appending AuditLogs (bulk)...');
    if (localData.auditLogs.length > 0) {
      await tx.auditLog.createMany({
        data: localData.auditLogs,
        skipDuplicates: true,
      });
    }

    // K. Security: Invalidate Old Refresh Tokens
    console.log('  -> Purging obsolete refresh tokens for session hygiene...');
    await tx.refreshToken.deleteMany({});
  }, {
    timeout: 300000, // 5 minutes transaction timeout
  });

  const endTime = new Date().toISOString();
  console.log(`\n🎉 MIGRATION TRANSACTION COMMITTED SUCCESSFULLY!`);
  console.log(`End Time: ${endTime}`);

  await Promise.all([localPrisma.$disconnect(), supaPrisma.$disconnect()]);
}

executeMigration().catch(async (e) => {
  console.error('\n❌ MIGRATION FAILED WITH ERROR:', e);
  await Promise.all([localPrisma.$disconnect(), supaPrisma.$disconnect()]);
  process.exit(1);
});
