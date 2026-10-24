import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS } from '../src/middleware/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking database initial state...');

  const existingOrg = await prisma.organization.findFirst();
  if (existingOrg) {
    console.log('Organization already exists. Skipping initial seed.');
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const adminNameAr = process.env.INITIAL_ADMIN_NAME_AR || 'مدير النظام';

  if (isProd && (!adminEmail || !adminPassword)) {
    throw new Error(
      'In production, INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables are required for seeding.'
    );
  }

  if (!adminEmail || !adminPassword) {
    console.log(
      'No INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD provided. Use the /register endpoint or UI to create your organization.'
    );
    return;
  }

  const org = await prisma.organization.create({ data: {} });

  // Create initial empty settings — owner fills official details in Settings UI
  await prisma.orgSettings.create({
    data: {
      organizationId: org.id,
      businessName: null,
      defaultLanguage: 'ar',
      defaultCurrency: 'SAR',
      vatRate: 15,
      selfApprovalAllowed: true,
      invoicePrefix: 'INV',
      statementPrefix: 'STM',
      workEntryPrefix: 'WRK',
    },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const adminUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: adminEmail.toLowerCase().trim(),
      passwordHash,
      nameAr: adminNameAr,
      role: UserRole.ORG_ADMIN,
      permissions: ALL_PERMISSIONS,
    },
  });

  const sequences = [
    { docType: 'invoice', prefix: 'INV' },
    { docType: 'statement', prefix: 'STM' },
    { docType: 'work_entry', prefix: 'WRK' },
  ];

  for (const seq of sequences) {
    await prisma.documentSequence.create({
      data: {
        organizationId: org.id,
        docType: seq.docType,
        prefix: seq.prefix,
        lastNumber: 0,
        currentYear: new Date().getFullYear(),
        yearReset: true,
      },
    });
  }

  console.log(`Initial organization (${org.id}) and admin (${adminUser.email}) created.`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
