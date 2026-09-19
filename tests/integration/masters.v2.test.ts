// Operations masters: vendors (kinds, dedupe, bank details), hotels + room
// types + season rates (overlap, stay quote, commercial redaction), vehicles
// and drivers (uniqueness, compliance), activities, CSV import preview/commit.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedVendor } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!hasTestDb)('operations masters v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('vendors: server ids, kinds, duplicate phone/GSTIN guard, bank details for finance only, classic screen stays in step', async () => {
    await seedVendor('VEN-2026-0007', { name: 'Legacy Cabs', type: 'transport', phone: '9811111111' });
    await prisma.$executeRawUnsafe(`UPDATE vendors SET kind = 'TRANSPORT' WHERE id = 'VEN-2026-0007'`);
    await prisma.numberingSequence.create({ data: { id: 'org_gktravels-VEN-2026', docType: 'VEN', financialYear: String(new Date().getFullYear()), lastNumber: 6 } });

    const created = await as('OPERATIONS').post('/api/v2/vendors', { name: 'Shree Sai Tours', kind: 'TRANSPORT', phone: '+91 98450 12345', gstNumber: '29abcde1234f1z5', city: 'Belagavi', bankDetails: { accountNo: '999', ifsc: 'HDFC0000001' } });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.id).toMatch(/^VEN-\d{4}-\d{4}$/);
    expect(created.body.id).not.toBe('VEN-2026-0007');
    expect(created.body).toMatchObject({ kind: 'TRANSPORT', gstNumber: '29ABCDE1234F1Z5', bankDetails: null });
    const row = await prisma.vendor.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row).toMatchObject({ type: 'transport', phoneNormalized: '9845012345', bankDetails: {} }); // OPERATIONS cannot set bank details

    const dupPhone = await as('OPERATIONS').post('/api/v2/vendors', { name: 'Other', phone: '09845012345' });
    expect(dupPhone.status).toBe(409);
    expect(dupPhone.body.error.fields.existingVendorId).toBe(created.body.id);
    expect((await as('OPERATIONS').post('/api/v2/vendors', { name: 'Other', phone: '09845012345', force: true })).status).toBe(201);

    await as('ADMIN').put(`/api/v2/vendors/${created.body.id}`, { bankDetails: { accountNo: '12345678', ifsc: 'SBIN0001234' } });
    expect((await as('ACCOUNTS').get(`/api/v2/vendors/${created.body.id}`)).body.bankDetails).toMatchObject({ accountNo: '12345678' });
    expect((await as('BOOKING').get(`/api/v2/vendors/${created.body.id}`)).body.bankDetails).toBeNull();
    expect((await as('BOOKING').post('/api/v2/vendors', { name: 'X', phone: '9000000000' })).status).toBe(403);
    expect((await as('ACCOUNTS').get('/api/v2/vendors?kind=TRANSPORT')).body.total).toBe(2);

    // Classic Suppliers screen changes "type"; kind follows.
    await as('OPERATIONS').put('/api/vendors/VEN-2026-0007', { name: 'Legacy Cabs', type: 'hotel', phone: '9811111111' });
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: 'VEN-2026-0007' } })).kind).toBe('HOTEL');
    expect(await prisma.activityLog.count({ where: { action: { in: ['vendor_created', 'vendor_updated'] } } })).toBeGreaterThanOrEqual(3);
  });

  it('hotels: room types, non-overlapping seasons, stay quote, rates hidden from operations and writable only by rate writers', async () => {
    const h = await as('OPERATIONS').post('/api/v2/hotels', { name: 'Hotel Ganga View', city: 'Varanasi', category: '3 star', checkInTime: '12:00', amenities: ['Lift'] });
    expect(h.status, JSON.stringify(h.body)).toBe(201);
    expect((await as('OPERATIONS').post('/api/v2/hotels', { name: 'hotel ganga view', city: 'VARANASI' })).status).toBe(409);
    const withRoom = await as('OPERATIONS').post(`/api/v2/hotels/${h.body.id}/room-types`, { name: 'Deluxe Double', mealPlans: ['CP', 'MAP'] });
    const rt = withRoom.body.roomTypes[0];
    expect(rt).toMatchObject({ name: 'Deluxe Double', mealPlans: ['CP', 'MAP'] });

    expect((await as('OPERATIONS').post(`/api/v2/hotels/room-types/${rt.id}/rates`, { mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-12-19', costPerNight: 2800 })).status).toBe(403);
    const r1 = await as('BOOKING').post(`/api/v2/hotels/room-types/${rt.id}/rates`, { mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-12-19', costPerNight: 2800, sellPerNight: 3400, gstRatePct: 5 });
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    await as('BOOKING').post(`/api/v2/hotels/room-types/${rt.id}/rates`, { mealPlan: 'CP', validFrom: '2026-12-20', validTo: '2027-01-05', costPerNight: 4200, sellPerNight: 5000 });
    const overlap = await as('BOOKING').post(`/api/v2/hotels/room-types/${rt.id}/rates`, { mealPlan: 'CP', validFrom: '2026-12-15', validTo: '2026-12-31', costPerNight: 1 });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.message).toContain('2026-10-01');
    expect((await as('BOOKING').post(`/api/v2/hotels/room-types/${rt.id}/rates`, { mealPlan: 'CP', validFrom: '2027-02-01', validTo: '2027-01-01', costPerNight: 1 })).status).toBe(400);

    const quote = await as('BOOKING').get(`/api/v2/hotels/${h.body.id}/quote?roomTypeId=${rt.id}&mealPlan=CP&checkIn=2026-12-18&checkOut=2026-12-22&rooms=2`);
    expect(quote.body).toMatchObject({ nights: 4, costTotal: 28000, sellTotal: 33600, missingDates: [] });

    const opsView = (await as('OPERATIONS').get(`/api/v2/hotels/${h.body.id}`)).body;
    expect(opsView.canSeeRates).toBe(false);
    expect(opsView.roomTypes[0].rates[0]).toMatchObject({ costPerNight: null, sellPerNight: null, validFrom: '2026-10-01' });
    const bookingView = (await as('BOOKING').get(`/api/v2/hotels/${h.body.id}`)).body;
    expect(bookingView.roomTypes[0].rates.map((r: { costPerNight: number }) => r.costPerNight)).toEqual([2800, 4200]);
    expect((await as('OPERATIONS').get(`/api/v2/hotels/${h.body.id}/quote?roomTypeId=${rt.id}&mealPlan=CP&checkIn=2026-12-18&checkOut=2026-12-22`)).status).toBe(403);

    const upd = await as('BOOKING').put(`/api/v2/hotels/rates/${r1.body.roomTypes[0].rates[0].id}`, { mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-12-19', costPerNight: 2900, sellPerNight: 3500 });
    expect(upd.body.roomTypes[0].rates[0].costPerNight).toBe(2900);
    expect((await as('ACCOUNTS').post('/api/v2/hotels', { name: 'Nope', city: 'Goa' })).status).toBe(403);
    expect(await prisma.activityLog.count({ where: { entityType: 'hotel', entityId: h.body.id } })).toBe(5);
  });

  it('vehicles and drivers: unique registration, vendor ownership, phone dedupe, compliance board', async () => {
    await seedVendor('VEN-2026-0001', { name: 'Shree Sai Tours', type: 'transport' });
    const d = await as('OPERATIONS').post('/api/v2/drivers', { name: 'Shri Mahesh Naik', phone: '9845012345', licenceExpiry: iso(10), languages: ['Kannada', 'Marathi'] });
    expect(d.status).toBe(201);
    expect(d.body.compliance.state).toBe('EXPIRING');
    expect((await as('OPERATIONS').post('/api/v2/drivers', { name: 'Other', phone: '+91 98450-12345' })).status).toBe(409);

    const noVendor = await as('OPERATIONS').post('/api/v2/vehicles', { registrationNo: 'ka-22-ab-1234', type: 'Tempo Traveller', seats: 17, ownership: 'VENDOR' });
    expect(noVendor.status).toBe(400);
    expect(noVendor.body.error.fields.vendorId).toBeDefined();
    const v = await as('OPERATIONS').post('/api/v2/vehicles', { registrationNo: 'ka 22 ab 1234', type: 'Tempo Traveller', seats: 17, ownership: 'VENDOR', vendorId: 'VEN-2026-0001', defaultDriverId: d.body.id, insuranceExpiry: iso(-1), permitExpiry: iso(200), fitnessExpiry: iso(200), pucExpiry: iso(200) });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    expect(v.body).toMatchObject({ registrationNo: 'KA 22 AB 1234', defaultDriver: { name: 'Shri Mahesh Naik' }, compliance: { state: 'EXPIRED' } });
    expect((await as('OPERATIONS').post('/api/v2/vehicles', { registrationNo: 'KA22AB1234'.replace(/(\w{2})(\d{2})(\w{2})(\d{4})/, '$1 $2 $3 $4'), type: 'Sedan', seats: 4 })).status).toBe(409);
    await as('OPERATIONS').post('/api/v2/vehicles', { registrationNo: 'KA 22 CD 9999', type: 'Sedan', seats: 4, insuranceExpiry: iso(300), permitExpiry: iso(300), fitnessExpiry: iso(300), pucExpiry: iso(300) });

    const board = (await as('ACCOUNTS').get('/api/v2/masters/compliance')).body;
    expect(board.vehicles.map((x: { registrationNo: string }) => x.registrationNo)).toEqual(['KA 22 AB 1234']);
    expect(board.drivers.map((x: { name: string }) => x.name)).toEqual(['Shri Mahesh Naik']);
    expect((await as('OPERATIONS').get('/api/v2/vehicles?q=ka 22 ab')).body.total).toBe(1);

    const off = await as('OPERATIONS').put(`/api/v2/vehicles/${v.body.id}`, { isActive: false });
    expect(off.body.isActive).toBe(false);
    expect((await as('OPERATIONS').get('/api/v2/vehicles')).body.total).toBe(1);
    expect((await as('OPERATIONS').get('/api/v2/vehicles?includeInactive=true')).body.total).toBe(2);
  });

  it('activities: prices hidden from operations and never set by them', async () => {
    const a = await as('BOOKING').post('/api/v2/activities', { name: 'Ganga Aarti boat ride', city: 'Varanasi', costAdult: 300, sellAdult: 450, minPax: 2, maxPax: 20 });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ costAdult: 300, sellAdult: 450 });
    expect((await as('OPERATIONS').get(`/api/v2/activities/${a.body.id}`)).body).toMatchObject({ costAdult: null, sellAdult: null, canSeePrices: false });
    await as('OPERATIONS').put(`/api/v2/activities/${a.body.id}`, { costAdult: 1, notes: 'Book by 4 pm' });
    const row = await prisma.activity.findUniqueOrThrow({ where: { id: a.body.id } });
    expect(Number(row.costAdult)).toBe(300);
    expect(row.notes).toBe('Book by 4 pm');
    expect((await as('BOOKING').put(`/api/v2/activities/${a.body.id}`, { minPax: 30 })).status).toBe(400);
  });

  it('import: preview reports row errors without writing; commit refuses errors unless skipped, then writes and audits', async () => {
    await seedVendor('VEN-2026-0001', { name: 'Shree Sai Tours', type: 'transport' });
    await as('OPERATIONS').post('/api/v2/vehicles', { registrationNo: 'KA 22 AB 1234', type: 'Sedan', seats: 4 });
    const csv = [
      'Registration No.,Vehicle Type,Capacity,Ownership,Owner,Insurance Valid Till',
      'KA 22 AB 1234,Tempo Traveller,17,VENDOR,Shree Sai Tours,31/03/2027', // update existing
      'MH 09 XY 0001,Bus 45,45,OWNED,,2027-01-01',                          // create
      'MH 09 XY 0002,Bus 45,abc,OWNED,,2027-01-01',                         // bad seats
      'MH 09 XY 0003,Sedan,4,VENDOR,Unknown Travels,',                      // unknown vendor
      'mh-09-xy-0001,Sedan,4,OWNED,,',                                      // same as line 3
    ].join('\n');
    const pre = await as('OPERATIONS').post('/api/v2/masters/import/vehicles/preview', { csv });
    expect(pre.status, JSON.stringify(pre.body)).toBe(200);
    expect(pre.body.counts).toEqual({ create: 1, update: 1, error: 3, skip: 0 });
    expect(pre.body.rows[2].errors.seats).toBeDefined();
    expect(pre.body.rows[3].errors.vendorName).toMatch(/Unknown Travels/);
    expect(pre.body.rows[4].errors._).toMatch(/line 3/);
    expect(await prisma.vehicle.count()).toBe(1);

    expect((await as('OPERATIONS').post('/api/v2/masters/import/vehicles/commit', { csv })).status).toBe(400);
    const done = await as('OPERATIONS').post('/api/v2/masters/import/vehicles/commit', { csv, skipInvalid: true });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.committed).toBe(2);
    expect(await prisma.vehicle.count()).toBe(2);
    expect((await prisma.vehicle.findFirstOrThrow({ where: { registrationNo: 'KA 22 AB 1234' } })).seats).toBe(17);
    expect(await prisma.activityLog.count({ where: { action: 'masters_imported' } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: { in: ['vehicle_created', 'vehicle_updated'] }, description: { contains: 'import' } } })).toBe(2);

    expect((await as('ACCOUNTS').post('/api/v2/masters/import/vehicles/preview', { csv })).status).toBe(403);
    const missing = await as('OPERATIONS').post('/api/v2/masters/import/drivers/preview', { csv: 'Name\nX' });
    expect(missing.body.fileErrors[0]).toMatch(/Phone/);
  });

  it('import: hotel rate sheets create hotels and room types, refuse overlapping seasons, and need rate rights', async () => {
    const csv = [
      'Hotel,City,Room,Meal,From,To,Net Rate,Sell',
      'Ganga View,Varanasi,Deluxe,cp,01-10-2026,19-12-2026,2800,3400',
      'Ganga View,Varanasi,Deluxe,CP,20-12-2026,05-01-2027,4200,5000',
      'Ganga View,Varanasi,Deluxe,CP,01-01-2027,31-03-2027,3000,3600', // overlaps line 3
      'Ganga View,Varanasi,Suite,MAP,01-10-2026,31-03-2027,6000,7500',
    ].join('\n');
    expect((await as('OPERATIONS').post('/api/v2/masters/import/hotel-rates/preview', { csv })).status).toBe(403);
    const pre = (await as('BOOKING').post('/api/v2/masters/import/hotel-rates/preview', { csv })).body;
    expect(pre.counts).toEqual({ create: 3, update: 0, error: 1, skip: 0 });
    expect(pre.rows[0].label).toContain('(new hotel)');
    expect(pre.rows[3].label).toContain('(new room type)');
    expect(pre.rows[2].errors.validFrom).toMatch(/Overlaps/);
    const done = await as('BOOKING').post('/api/v2/masters/import/hotel-rates/commit', { csv, skipInvalid: true });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const hotel = await prisma.hotel.findFirstOrThrow({ include: { roomTypes: { include: { rates: true } } } });
    expect(hotel.name).toBe('Ganga View');
    expect(hotel.roomTypes.map(r => [r.name, r.rates.length]).sort()).toEqual([['Deluxe', 2], ['Suite', 1]]);
    // Re-importing the same sheet now overlaps everything.
    expect((await as('BOOKING').post('/api/v2/masters/import/hotel-rates/preview', { csv })).body.counts.error).toBe(4);
  });
});
