// Phase 2.8: the legacy quotation → unified engine data migration. Seeds a
// legacy quotation with items (as the old builder wrote them), applies the
// migration SQL, and checks the result is a real v2 quotation. Re-applying
// must be a no-op.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany, TEST_DB_URL } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const SQL = path.resolve('prisma/migrations/20260918190000_migrate_legacy_quotations/migration.sql');
function applyMigration() {
  execSync(`npx prisma db execute --file "${SQL}" --url "${TEST_DB_URL}"`, { stdio: 'pipe' });
}

describe.skipIf(!hasTestDb)('legacy quotation migration', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING'] as const) await seedUser(USER_IDS[role], role);
  });

  it('turns a legacy quotation into an enquiry + v2 quotation with items, matching the customer by phone, idempotently', async () => {
    const cust = (await as('BOOKING').post('/api/v2/customers', { name: 'Asha Rao', phone: '98765 43210', email: 'asha@example.com' })).body;
    await prisma.vendor.create({ data: { id: 'VEN-1', name: 'Sea View Resort', type: 'hotel', phone: '1', createdDate: '2026-01-01' } });
    await prisma.quotation.create({
      data: {
        id: 'Q-2026-0001', quotationNumber: 'Q-2026-0001', customerId: null, customerName: 'Asha Rao', customerPhone: '+91 98765 43210', destination: 'Goa',
        startDate: '2026-11-10', endDate: '2026-11-14', pax: 3, status: 'sent', totalCost: 30000, totalSelling: 40000, grossProfit: 10000, marginPct: 25,
        gstMode: 'EXCLUDED', gstRate: 5, gstAmount: 2000, taxableAmount: 40000, inclusions: 'Breakfast', exclusions: 'Flights', termsAndConds: 'Standard', paymentPolicy: '50% advance',
        validUntil: '2026-10-01', sentAt: '2026-09-15T10:00:00.000Z', createdDate: '2026-09-15', approvalStatus: 'APPROVED', approvedBy: 'owner', approvedAt: '2026-09-15T09:00:00.000Z',
        items: { create: [
          { id: 'QI-1', category: 'hotel', description: 'Sea view room × 4 nights', quantity: 2, costPrice: 12000, sellingPrice: 16000, vendorId: 'VEN-1', vendorName: 'Sea View Resort', totalCost: 24000, totalSelling: 32000, grossProfit: 8000, marginPct: 25, sortOrder: 0 },
          { id: 'QI-2', category: 'transfer', description: 'Airport pickup & drop', quantity: 1, costPrice: 6000, sellingPrice: 8000, vendorId: 'VEN-GONE', vendorName: 'Old cab co', totalCost: 6000, totalSelling: 8000, grossProfit: 2000, marginPct: 25, sortOrder: 1 },
        ] },
      },
    });
    // A second legacy quotation with an unknown phone gets a customer created for it.
    await prisma.quotation.create({ data: { id: 'Q-2026-0002', quotationNumber: 'Q-2026-0002', customerName: 'Walk-in Guest', customerPhone: '9000011111', destination: 'Coorg', pax: 2, status: 'accepted', totalCost: 5000, totalSelling: 8000, gstMode: 'INCLUDED', gstRate: 5, gstAmount: 381, taxableAmount: 7619, createdDate: '2026-09-01', acceptedAt: '2026-09-05T12:00:00.000Z' } });

    applyMigration();
    applyMigration(); // idempotent

    expect(await prisma.customer.count()).toBe(2);
    expect(await prisma.enquiry.count()).toBe(2);
    expect(await prisma.salesQuote.count()).toBe(2);
    expect(await prisma.salesQuoteItem.count()).toBe(2);

    const list = await as('BOOKING').get('/api/v2/quotations?currentOnly=false');
    expect(list.body.total).toBe(2);
    const q1 = (await as('BOOKING').get('/api/v2/quotations/sq_legacy_Q-2026-0001')).body;
    expect(q1).toMatchObject({ quoteNumber: 'Q-2026-0001', status: 'SENT', approvalStatus: 'APPROVED', adults: 3, gstMode: 'EXCLUDED', gstRate: 5, inclusions: 'Breakfast', customerId: cust.id, title: 'Goa' });
    expect(q1.enquiry).toMatchObject({ enquiryNumber: 'ENQ-LEGACY-Q-2026-0001', destination: 'Goa', departureDate: '2026-11-10', status: 'QUOTED' });
    expect(q1.items.map((i: { serviceType: string; supplierId: string | null; quantity: number; sellPrice: number }) => [i.serviceType, i.supplierId, i.quantity, i.sellPrice])).toEqual([['HOTEL', 'VEN-1', 2, 16000], ['TRANSFER', null, 1, 8000]]);
    expect(q1.totals).toMatchObject({ subtotal: 40000, tax: 2000, total: 42000, cost: 30000 });
    expect(q1.sentAt).not.toBeNull();

    const q2 = (await as('BOOKING').get('/api/v2/quotations/sq_legacy_Q-2026-0002')).body;
    expect(q2).toMatchObject({ status: 'ACCEPTED', customerId: 'cus_legacy_Q-2026-0002' });
    expect(q2.enquiry.status).toBe('WON');
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: 'cus_legacy_Q-2026-0002' } })).phoneNormalized).toBe('9000011111');
    const view = await as('BOOKING').get('/api/v2/quotations/sq_legacy_Q-2026-0001/customer-view');
    expect(view.status).toBe(200);
    expect(view.body.totals.total).toBe(42000);
  });
});
