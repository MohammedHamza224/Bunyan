const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment connection
const envFile = process.argv[2] || path.join(__dirname, '../.env.production.local');
const env = require('dotenv').parse(fs.readFileSync(envFile));
const url = env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL not found in env file');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

function escapeSqlLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'::timestamptz`;
  if (typeof val === 'object') {
    // Decimal from Prisma (has s, e, d properties or is Decimal object)
    if (val && typeof val.toFixed === 'function') {
      return String(val);
    }
    // Array or JSON
    if (Array.isArray(val)) {
      if (val.length === 0) return "'{}'";
      const escaped = val.map(v => typeof v === 'string' ? `"${v.replace(/"/g, '\\"')}"` : v).join(',');
      return `'{${escaped}}'`;
    }
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function exportFullBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '../../backups/production');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const jsonFile = path.join(backupDir, `supabase-backup-${timestamp}.json`);
  const sqlFile = path.join(backupDir, `supabase-backup-${timestamp}.sql`);

  console.log('Connecting to Supabase (read-only snapshot)...');
  
  const tables = [
    'organizations',
    'org_settings',
    'org_countries',
    'org_bank_accounts',
    'users',
    'clients',
    'sites',
    'units_of_measure',
    'work_item_templates',
    'work_entries',
    'statements',
    'statement_sites',
    'statement_lines',
    'invoices',
    'invoice_lines',
    'payments',
    'document_sequences',
    'audit_logs',
    'refresh_tokens',
    'password_reset_tokens',
    'test_datasets',
    'test_dataset_records'
  ];

  const fullData = {};
  let totalRows = 0;

  let sqlContent = `-- BUNYAN SUPABASE FULL DATABASE BACKUP\n`;
  sqlContent += `-- Timestamp: ${new Date().toISOString()}\n`;
  sqlContent += `-- Format: Complete PostgreSQL SQL DDL & INSERT statements\n`;
  sqlContent += `BEGIN;\n\n`;

  for (const table of tables) {
    const rows = await prisma[table === 'test_dataset_records' ? 'testDatasetRecord' :
      table === 'test_datasets' ? 'testDataset' :
      table === 'password_reset_tokens' ? 'passwordResetToken' :
      table === 'refresh_tokens' ? 'refreshToken' :
      table === 'audit_logs' ? 'auditLog' :
      table === 'document_sequences' ? 'documentSequence' :
      table === 'payments' ? 'payment' :
      table === 'invoice_lines' ? 'invoiceLine' :
      table === 'invoices' ? 'invoice' :
      table === 'statement_lines' ? 'statementLine' :
      table === 'statement_sites' ? 'statementSite' :
      table === 'statements' ? 'statement' :
      table === 'work_entries' ? 'workEntry' :
      table === 'work_item_templates' ? 'workItemTemplate' :
      table === 'units_of_measure' ? 'unitOfMeasure' :
      table === 'sites' ? 'site' :
      table === 'clients' ? 'client' :
      table === 'users' ? 'user' :
      table === 'org_bank_accounts' ? 'orgBankAccount' :
      table === 'org_countries' ? 'orgCountry' :
      table === 'org_settings' ? 'orgSettings' :
      'organization'].findMany();

    fullData[table] = rows;
    totalRows += rows.length;

    sqlContent += `-- Table: ${table} (${rows.length} rows)\n`;
    if (rows.length > 0) {
      for (const row of rows) {
        const cols = Object.keys(row).map(c => `"${c}"`).join(', ');
        const vals = Object.values(row).map(escapeSqlLiteral).join(', ');
        sqlContent += `INSERT INTO "${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
      }
    }
    sqlContent += `\n`;
  }

  sqlContent += `COMMIT;\n`;

  // Write files
  fs.writeFileSync(jsonFile, JSON.stringify(fullData, null, 2), 'utf8');
  fs.writeFileSync(sqlFile, sqlContent, 'utf8');

  // Compute checksums
  const jsonHash = crypto.createHash('sha256').update(fs.readFileSync(jsonFile)).digest('hex');
  const sqlHash = crypto.createHash('sha256').update(fs.readFileSync(sqlFile)).digest('hex');

  const jsonStats = fs.statSync(jsonFile);
  const sqlStats = fs.statSync(sqlFile);

  console.log(`[BACKUP COMPLETED]`);
  console.log(`Tables Extracted: ${tables.length}`);
  console.log(`Total Records: ${totalRows}`);
  console.log(`JSON File: ${path.basename(jsonFile)} (${jsonStats.size} bytes) SHA-256: ${jsonHash.slice(0, 16)}...`);
  console.log(`SQL File:  ${path.basename(sqlFile)} (${sqlStats.size} bytes) SHA-256: ${sqlHash.slice(0, 16)}...`);

  await prisma.$disconnect();
}

exportFullBackup().catch(async (e) => {
  console.error('BACKUP FAILED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
