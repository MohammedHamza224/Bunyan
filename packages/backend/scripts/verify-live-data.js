const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({
    include: {
      bankAccounts: true,
      invoices: {
        include: {
          payments: {
            include: { bankAccount: true },
          },
        },
      },
    },
  });

  if (!org) {
    console.log('No organization found');
    return;
  }

  console.log('=== ORGANIZATION ===');
  console.log('Name (Ar):', org.businessNameAr);
  console.log('Name (En):', org.businessNameEn);
  console.log('VAT No:', org.vatNumber);

  console.log('\n=== COMPANY RECEIVING BANK ACCOUNTS ===');
  console.log('Total bank accounts:', org.bankAccounts.length);
  org.bankAccounts.forEach((b) => {
    console.log(`- Bank: ${b.bankNameAr} (${b.bankNameEn})`);
    console.log(`  Beneficiary: ${b.beneficiaryNameAr}`);
    console.log(`  IBAN: ${b.iban}`);
    console.log(`  Default: ${b.isDefault} | Active: ${b.isActive}`);
  });

  console.log('\n=== INVOICES & PAYMENTS ===');
  console.log('Total invoices:', org.invoices.length);
  org.invoices.forEach((inv) => {
    console.log(`\nInvoice: ${inv.referenceNo} (ID: ${inv.id}) [Status: ${inv.status}, Payment: ${inv.paymentStatus}]`);
    console.log(`  Total: ${inv.totalAmount} | Paid: ${inv.paidAmount} | Remaining: ${inv.remainingAmount}`);
    console.log(`  Payments count: ${inv.payments.length}`);
    inv.payments.forEach((p) => {
      console.log(`  * ID: ${p.id} | Date: ${p.paymentDate.toISOString().slice(0, 10)}`);
      console.log(`    Method: ${p.method} | Amount: ${p.amount}`);
      console.log(`    Receiving Bank: ${p.bankAccount ? p.bankAccount.bankNameAr : 'None'}`);
      console.log(`    Ref: ${p.referenceNo || 'None'}`);
    });
  });

  const users = await prisma.user.findMany();
  console.log('\n=== USERS ===');
  users.forEach((u) => console.log(`- ${u.email} (${u.role}) - Name: ${u.nameAr}`));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
