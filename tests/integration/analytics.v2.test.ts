// Reports: counted from the records, each section only for roles that can open it.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

describe.skipIf(!hasTestDb)('reports', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS', 'DRIVER'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany();
    await seedCustomer('CUS-A', { name: 'Anand' });
    await seedCustomer('CUS-B', { name: 'Bhavna', phone: '9999900002' });
    const enq = (customerId: string, destination: string, status: string, source: string) =>
      prisma.enquiry.create({ data: { customerId, destination, status: status as never, source: source as never, adults: 2 } });
    await enq('CUS-A', 'Kashi', 'WON', 'WHATSAPP');
    await enq('CUS-A', 'Kashi', 'LOST', 'WHATSAPP');
    await enq('CUS-B', 'Goa', 'WON', 'REFERRAL');
    await enq('CUS-B', 'Goa', 'NEW', 'PHONE');
    await seedTrip('GK-1', { customerId: 'CUS-A', customer: 'Anand', destination: 'Kashi', stage: 'COMPLETED' });
    await seedTrip('GK-2', { customerId: 'CUS-A', customer: 'Anand', destination: 'Kashi', stage: 'READY' });
    await seedTrip('GK-3', { customerId: 'CUS-B', customer: 'Bhavna', destination: 'Goa', stage: 'CANCELLED' });
    const now = new Date();
    for (const [name, hours, status] of [['Ganga View', 4, 'CONFIRMED'], ['Ganga View', 10, 'CONFIRMED'], ['Ganga View', null, 'REQUESTED'], ['Sea Breeze', 30, 'CONFIRMED']] as const) {
      await prisma.hotelBooking.create({ data: {
        tripId: 'GK-2', hotelName: name, checkIn: new Date(), checkOut: new Date(), status: status as never,
        requestedAt: now, confirmedAt: hours === null ? null : new Date(now.getTime() + hours * 3_600_000),
      } });
    }
  });

  it('sales: enquiries, sources and the win rate of those decided', async () => {
    const r = await as('BOOKING').get('/api/v2/analytics/sales');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ enquiries: 4, winRate: 66.7, byStatus: { WON: 2, LOST: 1, NEW: 1 } });
    expect(r.body.bySource[0]).toEqual({ source: 'WHATSAPP', count: 2, won: 1 });
    expect(r.body.topDestinations).toEqual([{ name: 'Goa', count: 2 }, { name: 'Kashi', count: 2 }]);
    expect(r.body.monthly.reduce((s: number, m: { count: number }) => s + m.count, 0)).toBe(4);
  });

  it('customers: repeat customers are those with two or more trips, cancelled trips not counted', async () => {
    const r = (await as('ACCOUNTS').get('/api/v2/analytics/customers')).body;
    expect(r).toMatchObject({ customersWithTrips: 1, repeatCustomers: 1, repeatRate: 100, topCustomers: [{ name: 'Anand', trips: 2 }] });
  });

  it('operations and suppliers: hotels confirm in a median of hours measured, not guessed', async () => {
    const ops = (await as('OPERATIONS').get('/api/v2/analytics/operations')).body;
    expect(ops.hotelConfirmation).toEqual({ confirmed: 3, medianHours: 10 });
    expect(ops.tripsByStage).toMatchObject({ COMPLETED: 1, READY: 1, CANCELLED: 1 });
    const sup = (await as('ACCOUNTS').get('/api/v2/analytics/suppliers')).body;
    expect(sup.hotels).toEqual([
      { name: 'Ganga View', bookings: 3, confirmedRate: 66.7, medianHoursToConfirm: 7 },
      { name: 'Sea Breeze', bookings: 1, confirmedRate: 100, medianHoursToConfirm: 30 },
    ]);
  });

  it('each section only for roles that can open it', async () => {
    expect((await as('OPERATIONS').get('/api/v2/analytics/money')).status).toBe(403);
    expect((await as('BOOKING').get('/api/v2/analytics/suppliers')).status).toBe(403);
    expect((await as('ACCOUNTS').get('/api/v2/analytics/sales')).status).toBe(403);
    expect((await as('ACCOUNTS').get('/api/v2/analytics/money')).status).toBe(200);
    expect((await as('DRIVER').get('/api/v2/analytics/customers')).status).toBe(403);
    expect((await as('ADMIN').get('/api/v2/analytics/sales?from=2026-05-01&to=2026-01-01')).status).toBe(400);
  });
});
