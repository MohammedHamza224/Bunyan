// READ-ONLY database audit. Every query runs inside a READ ONLY transaction.
// Usage: node scripts/db-audit-readonly.js <label> [envFile]
//   envFile defaults to ../.env ; for production use ../.env.production.local
// Writes JSON snapshot to AUDIT_OUT_DIR (or cwd). Never prints connection strings.
const path = require('path');
const fs = require('fs');
const label = process.argv[2] || 'local';
const envFile = process.argv[3] || path.join(__dirname, '..', '.env');
const env = require('dotenv').parse(fs.readFileSync(envFile));
const url = env.DATABASE_URL;
if (!url) { console.error(`DATABASE_URL not found in ${path.basename(envFile)}`); process.exit(1); }

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url } } });

const host = (() => { try { return new URL(url).hostname; } catch { return 'unparseable'; } })();

(async () => {
  const snap = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const q = (sql) => tx.$queryRawUnsafe(sql);

    const version = (await q('SELECT version() AS v'))[0].v;
    const tables = (await q(`SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).map((r) => r.table_name);

    const columns = await q(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`);

    const constraints = await q(`SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
        string_agg(DISTINCT kcu.column_name, ',') AS columns,
        max(ccu.table_name) AS ref_table, string_agg(DISTINCT ccu.column_name, ',') AS ref_columns
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_type = 'FOREIGN KEY' AND tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema='public' AND tc.constraint_type IN ('PRIMARY KEY','FOREIGN KEY','UNIQUE')
      GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type ORDER BY tc.table_name, tc.constraint_type`);

    const enums = await q(`SELECT t.typname AS enum, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname`);

    const counts = {};
    for (const t of tables) counts[t] = Number((await q(`SELECT count(*)::int AS c FROM "${t}"`))[0].c);

    let migrations = null;
    if (tables.includes('_prisma_migrations')) {
      migrations = await q(`SELECT migration_name, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back
        FROM _prisma_migrations ORDER BY started_at`);
    }

    const pick = async (sql) => (tables.includes(sql.table) ? q(sql.text) : []);
    const users = await pick({ table: 'users', text: `SELECT id, "organizationId", lower(email) AS email, role::text, "isActive", "createdAt" FROM users ORDER BY "createdAt"` });
    const orgs = await pick({ table: 'organizations', text: `SELECT id, "isActive", "createdAt" FROM organizations ORDER BY "createdAt"` });

    return { label, host, version, tables, columns, constraints, enums, counts, migrations, users, orgs };
  }, { timeout: 60000 });

  const outDir = process.env.AUDIT_OUT_DIR || process.cwd();
  const file = path.join(outDir, `db-audit-${label}.json`);
  fs.writeFileSync(file, JSON.stringify(snap, (k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  console.log(`[${label}] host=${host} tables=${snap.tables.length} -> ${file}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(`[${label}] FAILED:`, e.message.split('\n').slice(-3).join(' '));
  await prisma.$disconnect();
  process.exit(1);
});
