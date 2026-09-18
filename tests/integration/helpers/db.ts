// Shared database helpers for integration suites. `prisma` is the same
// singleton the server uses, so service functions and assertions share one
// connection (and one transaction view).
import { assertTestDatabase } from './guard';
import { currentOrganizationId } from '../../../server/src/core/requestContext';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? '';
export const hasTestDb   = Boolean(TEST_DB_URL);
if (hasTestDb) assertTestDatabase(TEST_DB_URL);

// Imported lazily so a missing TEST_DATABASE_URL never constructs a client.
export const { prisma } = hasTestDb
  ? await import('../../../server/src/lib/prisma.js')
  : { prisma: null as unknown as import('@prisma/client').PrismaClient };

/** Truncates every application table (keeps the schema). */
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (!rows.length) return;
  const list = rows.filter(r => r.tablename !== 'organizations').map(r => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await ensureOrganization('org_gktravels', 'GK Travels');
}

export async function ensureOrganization(id: string, name: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "organizations" ("id", "slug", "name", "updatedAt") VALUES ($1, $1, $2, NOW()) ON CONFLICT ("id") DO NOTHING`,
    id, name,
  );
}

// ── Fixtures ────────────────────────────────────────────────

export async function seedCompany(overrides: Record<string, unknown> = {}) {
  return prisma.companySettings.upsert({
    where:  { organizationId: (overrides.organizationId as string | undefined) ?? currentOrganizationId() },
    update: { ...overrides },
    create: {
      companyName:   'GK Travels',
      gstin:         '29AAAAA0000A1Z5',
      stateCode:     '29',
      state:         'Karnataka',
      addressLine1:  'Belagavi',
      invoicePrefix: 'GK',
      bankName:      'Test Bank',
      bankAccountNumber: '000111222',
      bankIfsc:      'TEST0000001',
      pan:           'AAAAA0000A',
      ...overrides,
    },
  });
}

export async function seedCustomer(id = 'CUS-2026-0001', overrides: Record<string, unknown> = {}) {
  return prisma.customer.create({
    data: {
      id,
      name:        'Test Customer',
      phone:       '9999900001',
      email:       'test@example.com',
      createdDate: '2026-09-01',
      ...overrides,
    },
  });
}

export async function seedTrip(id = 'GK-2026-0001', overrides: Record<string, unknown> = {}) {
  return prisma.trip.create({
    data: {
      id,
      customer:     'Test Customer',
      phone:        '9999900001',
      customerId:   'CUS-2026-0001',
      destination:  'Kashmir',
      pax:          2,
      departure:    '2026-10-20',
      returnDate:   '2026-10-27',
      status:       'confirmed',
      totalAmount:  100_000,
      gstRate:      5,
      gstAmount:    5_000,
      taxableAmount: 100_000,
      totalPayable: 105_000,
      paidAmount:   0,
      balanceDue:   105_000,
      supplierCost: 60_000,
      grossMargin:  40_000,
      marginPct:    40,
      createdDate:  '2026-09-01',
      ...overrides,
    },
  });
}

export async function seedBooking(id = 'BK-2026-0001', overrides: Record<string, unknown> = {}) {
  return prisma.booking.create({
    data: {
      id,
      type:         'flight',
      status:       'issued',
      customerName: 'Test Customer',
      customerId:   'CUS-2026-0001',
      refId:        'GK-2026-0001',
      sellingPrice: 20_000,
      supplierCost: 15_000,
      advance:      0,
      supplierPaid: 0,
      gstRate:      5,
      gstAmount:    1_000,
      taxableAmount: 20_000,
      totalPayable: 21_000,
      balanceDue:   21_000,
      supplierPending: 15_000,
      grossMargin:  5_000,
      marginPct:    25,
      createdDate:  '2026-09-01',
      ...overrides,
    },
  });
}

export async function seedVendor(id = 'VEN-2026-0001', overrides: Record<string, unknown> = {}) {
  return prisma.vendor.create({
    data: {
      id,
      name:        'Test Hotel Supplier',
      type:        'hotel',
      phone:       '9999900002',
      bankDetails: { accountHolder: 'Test Hotel', accountNo: '123456', ifsc: 'HDFC0000001', bankName: 'HDFC' },
      createdDate: '2026-09-01',
      ...overrides,
    },
  });
}

export async function seedUser(id: string, role: 'ADMIN' | 'BOOKING' | 'ACCOUNTS' | 'OPERATIONS') {
  const user = await prisma.user.create({
    data: { id, email: `${id.toLowerCase()}@example.test`, passwordHash: 'x', name: id, role, isActive: true },
  });
  // Session named by helpers/app.ts cookieFor(role): sid = "S-<ROLE>".
  await prisma.session.create({
    data: { id: `S-${role}`, userId: id, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  return user;
}
