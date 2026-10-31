// Read-only: prints row counts for every Prisma model in the database at DATABASE_URL (or argv[2]).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient, Prisma } = require('@prisma/client');

const url = process.argv[2] || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  const models = Prisma.dmmf.datamodel.models.map((m) => m.name);
  const out = {};
  for (const name of models) {
    const key = name.charAt(0).toLowerCase() + name.slice(1);
    try {
      out[name] = await prisma[key].count();
    } catch (e) {
      out[name] = 'ERR: ' + e.message.split('\n').pop().slice(0, 80);
    }
  }
  console.table(out);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('FAILED:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
