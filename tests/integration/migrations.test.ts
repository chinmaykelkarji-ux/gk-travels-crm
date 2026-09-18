// Migration chain regression: replaying every folder in prisma/migrations on
// an empty database must produce exactly schema.prisma, create the SQL view
// the receivables ledger reads, and be idempotent on a second deploy.
//
// This is what guards the production cutover (docs/travelos/RUNBOOK-production-cutover.md):
// once production is baselined, every future deploy runs the same chain.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { hasTestDb, prisma, TEST_DB_URL } from './helpers/db';

const MIGRATE_DB = 'travelos_migrate_test';

function urlFor(dbName: string): string {
  const u = new URL(TEST_DB_URL);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function run(cmd: string, dbUrl: string): string {
  return execSync(cmd, { env: { ...process.env, DATABASE_URL: dbUrl }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe.skipIf(!hasTestDb)('prisma migration chain', () => {
  const migrateUrl = hasTestDb ? urlFor(MIGRATE_DB) : '';
  let migrated: PrismaClient | null = null;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${MIGRATE_DB}" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${MIGRATE_DB}"`);
    migrated = new PrismaClient({ datasources: { db: { url: migrateUrl } } });
  });

  afterAll(async () => {
    await migrated?.$disconnect();
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${MIGRATE_DB}" WITH (FORCE)`);
  });

  it('migrate deploy applies every folder on an empty database', () => {
    const out = run('npx prisma migrate deploy', migrateUrl);
    expect(out).toMatch(/applied|Applying migration/i);
    expect(out).not.toMatch(/\berror\b/i);
  });

  it('the deployed database matches schema.prisma exactly (no drift in either direction)', () => {
    const diff = run(`npx prisma migrate diff --from-url "${migrateUrl}" --to-schema-datamodel prisma/schema.prisma --script`, migrateUrl);
    expect(diff.trim()).toMatch(/^-- This is an empty migration\.?$|^$/);
  });

  it('creates the customer_ledger_balances view, identity columns and the adopted voucher columns', async () => {
    const views = await migrated!.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'public'`,
    );
    expect(views.map(v => v.table_name)).toContain('customer_ledger_balances');

    const cols = await migrated!.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND (
         (table_name = 'customers' AND column_name IN ('passportNo', 'panNumber')) OR
         (table_name = 'vouchers'  AND column_name IN ('items', 'grandTotal', 'showPricing'))
       )`,
    );
    expect(cols).toHaveLength(5);

    // The ledger view must be queryable even with no rows.
    const ledger = await migrated!.$queryRawUnsafe<unknown[]>(`SELECT * FROM "customer_ledger_balances"`);
    expect(ledger).toEqual([]);
  });

  it('is idempotent: a second deploy is a no-op', () => {
    const out = run('npx prisma migrate deploy', migrateUrl);
    expect(out).toMatch(/No pending migrations|already in sync/i);
  });
});
