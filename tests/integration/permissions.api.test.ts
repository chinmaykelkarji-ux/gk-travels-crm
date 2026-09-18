// Role × route matrix through the real Express app. Extends the probe that
// verified the hotfix into a permanent regression suite.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedCompany, seedCustomer, seedTrip, seedBooking, seedVendor, seedUser } from './helpers/db';
import { as, anonymous, USER_IDS } from './helpers/app';

async function seedAll() {
  await resetDb();
  await seedCompany();
  await seedCustomer();
  await seedTrip();
  await seedBooking();
  await seedVendor();
  for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  await prisma.invoice.create({
    data: {
      id: 'INV-T1', invoiceNumber: 'GK/2026-27/01', financialYear: '2026-27', sequenceNumber: 1, status: 'ISSUED',
      invoiceDate: '2026-09-18', customerId: 'CUS-2026-0001', customerName: 'Test Customer', companyName: 'GK Travels',
      taxableAmount: 10_000, cgstAmount: 250, sgstAmount: 250, totalGstAmount: 500, totalAmount: 10_500, createdDate: '2026-09-18',
    },
  });
  await prisma.activityLog.create({
    data: { action: 'invoice_created', title: 'Invoice Created', description: 'x', entityType: 'invoice', entityId: 'INV-T1', timestamp: new Date().toISOString(), date: '2026-09-18', after: { totalAmount: 10_500 } },
  });
  await prisma.activityLog.create({
    data: { action: 'booking_created', title: 'Booking Created', description: 'x', entityType: 'booking', entityId: 'BK-2026-0001', timestamp: new Date().toISOString(), date: '2026-09-18', after: { status: 'issued' } },
  });
}

describe.skipIf(!hasTestDb)('API authorization matrix', () => {
  beforeAll(async () => { await seedAll(); });

  it('rejects unauthenticated requests', async () => {
    expect((await anonymous().get('/api/data/all')).status).toBe(401);
    expect((await anonymous().get('/api/trips')).status).toBe(401);
  });

  describe('bootstrap endpoint redaction', () => {
    it('ADMIN and ACCOUNTS see finance; BOOKING and OPERATIONS do not', async () => {
      for (const role of ['ADMIN', 'ACCOUNTS'] as const) {
        const r = await as(role).get('/api/data/all');
        expect(r.status).toBe(200);
        expect(r.body.invoices).toHaveLength(1);
        expect(typeof r.body.companySettings.bankAccountNumber).toBe('string');
        expect(r.body.vendors[0].bankDetails.accountNo).toBe('123456');
      }
      for (const role of ['BOOKING', 'OPERATIONS'] as const) {
        const r = await as(role).get('/api/data/all');
        expect(r.status).toBe(200);
        expect(r.body.invoices).toHaveLength(0);
        expect(r.body.receivables).toHaveLength(0);
        expect(r.body.vendorPayments).toHaveLength(0);
        expect(r.body.companySettings.bankAccountNumber).toBeNull();
        expect(r.body.companySettings.pan).toBeNull();
        expect(r.body.vendors[0].bankDetails).toEqual({});
      }
    });

    it('OPERATIONS gets trips and bookings without profit figures and without finance activity snapshots', async () => {
      const r = await as('OPERATIONS').get('/api/data/all');
      expect(r.body.trips[0]).toMatchObject({ supplierCost: 0, grossMargin: 0, marginPct: 0, totalPayable: 105_000, balanceDue: 105_000 });
      expect(r.body.bookings[0]).toMatchObject({ supplierCost: 0, supplierPaid: 0, grossMargin: 0, sellingPrice: 20_000 });
      const inv = r.body.activityLog.find((a: { entityType: string }) => a.entityType === 'invoice');
      const bk  = r.body.activityLog.find((a: { entityType: string }) => a.entityType === 'booking');
      expect(inv.after).toBeNull();
      expect(bk.after).toEqual({ status: 'issued' });
      expect(r.body.quotations).toHaveLength(0);
      expect(r.body.leads).toHaveLength(0);
    });

    it('BOOKING keeps commercial figures but not finance tables', async () => {
      const r = await as('BOOKING').get('/api/data/all');
      expect(r.body.trips[0].grossMargin).toBe(40_000);
      expect(r.body.payments.customerPayments).toHaveLength(0);
    });
  });

  describe('route guards', () => {
    const cases: Array<[string, string, Record<string, number>]> = [
      ['GET',    '/api/invoices',              { ADMIN: 200, ACCOUNTS: 200, BOOKING: 403, OPERATIONS: 403 }],
      ['GET',    '/api/receivables',           { ADMIN: 200, ACCOUNTS: 200, BOOKING: 403, OPERATIONS: 403 }],
      ['GET',    '/api/payments',              { ADMIN: 200, ACCOUNTS: 200, BOOKING: 403, OPERATIONS: 403 }],
      ['GET',    '/api/vendors/payments/all',  { ADMIN: 200, ACCOUNTS: 200, BOOKING: 403, OPERATIONS: 403 }],
      ['GET',    '/api/quotations',            { ADMIN: 200, ACCOUNTS: 403, BOOKING: 200, OPERATIONS: 403 }],
      ['GET',    '/api/leads',                 { ADMIN: 200, ACCOUNTS: 403, BOOKING: 200, OPERATIONS: 403 }],
      ['GET',    '/api/enquiries',             { ADMIN: 200, ACCOUNTS: 403, BOOKING: 200, OPERATIONS: 403 }],
      ['GET',    '/api/analytics/overview',    { ADMIN: 200, ACCOUNTS: 200, BOOKING: 403, OPERATIONS: 403 }],
      ['GET',    '/api/users',                 { ADMIN: 200, ACCOUNTS: 403, BOOKING: 403, OPERATIONS: 403 }],
      ['GET',    '/api/trips',                 { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['GET',    '/api/bookings',              { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['GET',    '/api/vendors',               { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['GET',    '/api/vouchers',              { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['GET',    '/api/itineraries',           { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['GET',    '/api/tasks',                 { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['GET',    '/api/passengers',            { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['GET',    '/api/communications',        { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['GET',    '/api/activity',              { ADMIN: 200, ACCOUNTS: 200, BOOKING: 200, OPERATIONS: 200 }],
      ['PUT',    '/api/trips/GK-2026-0001',    { ADMIN: 200, ACCOUNTS: 403, BOOKING: 200, OPERATIONS: 403 }],
      ['PUT',    '/api/bookings/BK-2026-0001', { ADMIN: 200, ACCOUNTS: 403, BOOKING: 200, OPERATIONS: 403 }],
      ['PUT',    '/api/vendors/VEN-2026-0001', { ADMIN: 200, ACCOUNTS: 403, BOOKING: 403, OPERATIONS: 200 }],
      ['PUT',    '/api/company-settings',      { ADMIN: 200, ACCOUNTS: 403, BOOKING: 403, OPERATIONS: 403 }],
      ['POST',   '/api/activity',              { ADMIN: 404, ACCOUNTS: 404, BOOKING: 404, OPERATIONS: 404 }],
      ['POST',   '/api/activity/reminders/bulk', { ADMIN: 404, ACCOUNTS: 404, BOOKING: 404, OPERATIONS: 404 }],
    ];

    for (const [method, path, expected] of cases) {
      it(`${method} ${path}`, async () => {
        for (const [role, status] of Object.entries(expected)) {
          const client = as(role as 'ADMIN');
          const body = method === 'PUT' ? { notes: `probe ${role}` } : method === 'POST' ? {} : undefined;
          const res = method === 'GET' ? await client.get(path)
                    : method === 'PUT' ? await client.put(path, body)
                    : await client.post(path, body);
          expect(res.status, `${role} ${method} ${path}`).toBe(status);
        }
      });
    }
  });

  describe('GET /api/v2/me', () => {
    it('returns the session, organisation and effective permissions', async () => {
      const admin = await as('ADMIN').get('/api/v2/me');
      expect(admin.status).toBe(200);
      expect(admin.body.user).toMatchObject({ id: USER_IDS.ADMIN, role: 'ADMIN', organizationId: 'org_gktravels' });
      expect(admin.body.organization).toMatchObject({ id: 'org_gktravels', name: 'GK Travels', currency: 'INR' });
      expect(admin.body.permissions).toEqual(['*']);
      expect(admin.body.user.passwordHash).toBeUndefined();

      const ops = await as('OPERATIONS').get('/api/v2/me');
      expect(ops.body.permissions).toContain('trips:read');
      expect(ops.body.permissions).not.toContain('finance:read');
      expect(typeof ops.headers['x-request-id']).toBe('string');
    });

    it('rejects a valid token whose user no longer exists', async () => {
      await prisma.user.delete({ where: { id: USER_IDS.BOOKING } });
      const r = await as('BOOKING').get('/api/v2/me');
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHENTICATED');
      await seedAll();
    });
  });

  describe('write-side protections', () => {
    beforeEach(async () => { await seedAll(); });

    it('OPERATIONS cannot change or wipe vendor bank details; ADMIN can', async () => {
      const ops = await as('OPERATIONS').put('/api/vendors/VEN-2026-0001', { phone: '1111', bankDetails: {} });
      expect(ops.status).toBe(200);
      expect(ops.body.bankDetails).toEqual({});                       // redacted in the response …
      const stored = await prisma.vendor.findUniqueOrThrow({ where: { id: 'VEN-2026-0001' } });
      expect((stored.bankDetails as { accountNo: string }).accountNo).toBe('123456'); // … but untouched in the database
      expect(stored.phone).toBe('1111');

      const admin = await as('ADMIN').put('/api/vendors/VEN-2026-0001', { bankDetails: { accountNo: '999' } });
      expect(admin.status).toBe(200);
      expect((await prisma.vendor.findUniqueOrThrow({ where: { id: 'VEN-2026-0001' } })).bankDetails).toEqual({ accountNo: '999' });
    });

    it('vendor delete is admin-only and refuses while payables reference the vendor', async () => {
      expect((await as('OPERATIONS').delete('/api/vendors/VEN-2026-0001')).status).toBe(403);
      await prisma.vendorPayment.create({ data: { id: 'VP-T1', vendorId: 'VEN-2026-0001', vendorName: 'V', totalCost: 100, createdDate: '2026-09-18' } });
      const blocked = await as('ADMIN').delete('/api/vendors/VEN-2026-0001');
      expect(blocked.status).toBe(409);
      await prisma.vendorPayment.delete({ where: { id: 'VP-T1' } });
      expect((await as('ADMIN').delete('/api/vendors/VEN-2026-0001')).status).toBe(200);
      expect(await prisma.vendor.count()).toBe(0);
    });

    it('booking delete refuses while invoiced or paid; invoiceId cannot be set by the client', async () => {
      const locked = await as('BOOKING').put('/api/bookings/BK-2026-0001', { invoiceId: 'INV-T1', notes: 'x' });
      expect(locked.status).toBe(200);
      expect(locked.body.invoiceId).toBeNull();

      await prisma.booking.update({ where: { id: 'BK-2026-0001' }, data: { invoiceId: 'INV-T1' } });
      expect((await as('BOOKING').delete('/api/bookings/BK-2026-0001')).status).toBe(409);
      await prisma.booking.update({ where: { id: 'BK-2026-0001' }, data: { invoiceId: null } });
      await prisma.payment.create({ data: { id: 'PAY-T1', type: 'customer', bookingId: 'BK-2026-0001', amount: 1, method: 'Cash', date: '2026-09-18', status: 'received' } });
      expect((await as('BOOKING').delete('/api/bookings/BK-2026-0001')).status).toBe(409);
      await prisma.payment.delete({ where: { id: 'PAY-T1' } });
      expect((await as('BOOKING').delete('/api/bookings/BK-2026-0001')).status).toBe(200);
    });

    it('trip PUT ignores the invoice lock and the display number from the client', async () => {
      const r = await as('BOOKING').put('/api/trips/GK-2026-0001', { invoiceId: 'INV-T1', tripNumber: 999, notes: 'kept' });
      expect(r.status).toBe(200);
      expect(r.body.invoiceId).toBeNull();
      expect(r.body.notes).toBe('kept');
      expect(r.body.tripNumber).not.toBe(999);
    });
  });
});
