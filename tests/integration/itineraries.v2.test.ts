// Itinerary v2: built from the trip's bookings, edited day by day, the
// customer copy that never carries internal notes or costs, revision
// conflicts, booking items that follow their bookings, sharing, the classic
// builder kept away from v2 itineraries, audit and permissions.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const SECRET = 'OFFICE-ONLY-5d2e';
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

type Item = { id?: string; time: string | null; kind: string; title: string; details: string | null; internalNote: string | null; internalCost: number | null; customerVisible: boolean; sourceType: string | null; sourceId: string | null };
type Day = { id: string; dayNumber: number; date: string | null; title: string; hotelName: string | null; internalNotes: string | null; notes: string | null; morning: string | null; items: Item[]; [k: string]: unknown };
type View = { id: string; revision: number; sharedRevision: number | null; title: string; days: Day[]; warnings: Record<string, unknown>; [k: string]: unknown };

/** Editor payload from a staff view (what the builder sends back). */
function payload(v: View, change: (days: Day[]) => void = () => {}) {
  const days = structuredClone(v.days);
  change(days);
  return {
    revision: v.revision, title: v.title, notes: v.notes, internalNotes: v.internalNotes, emergencyContact: v.emergencyContact,
    days: days.map(({ dayNumber: _n, date: _d, ...d }) => ({ ...d, items: d.items.map(({ sourceType: _t, sourceId: _s, ...i }) => i) })),
  };
}

async function tourWithBookings() {
  const trip = (await as('BOOKING').post('/api/v2/trips', { tourName: 'Kashi Yatra Nov', destination: 'Varanasi', departure: day(20), returnDate: day(23), customerId: 'CUS-2026-0001' })).body.trip;
  const pax = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Yatri', lastName: 'Patil' })).body.id;
  await as('BOOKING').put(`/api/v2/trips/${trip.id}/travellers`, { travellers: [{ travellerId: pax }] });
  await as('OPERATIONS').put(`/api/v2/trips/${trip.id}/pickup-points`, { points: [{ name: 'Karad', pickupAt: `${day(20)}T04:30`, contactPhone: '9800000001' }, { name: 'Belagavi' }] });
  const hotel = (await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/hotel-bookings`, { hotelName: 'Ganga View', city: 'Varanasi', checkIn: day(21), checkOut: day(23), rooms: 20, costAmount: 88888, sellAmount: 99999, customerNotes: 'River-facing rooms', internalNotes: `${SECRET} vendor gives 10% back` })).body;
  const duty = (await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/vehicle-assignments`, { vehicleType: 'Tempo Traveller', vehicleRegNo: 'KA-22-AB-1234', driverName: 'Ramesh', driverPhone: '9876500000', startAt: `${day(20)}T04:00`, endAt: `${day(20)}T09:00`, pickupPoint: 'Karad', dropPoint: 'Belagavi station', costAmount: 7777, internalNotes: `${SECRET} owner owes a trip` })).body;
  const act = (await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/activity-bookings`, { name: 'Ganga aarti boat', date: day(21), time: '18:30', costAmount: 6666, internalNotes: `${SECRET} cash only` })).body;
  const tk = (await as('BOOKING').post('/api/v2/tickets', { tripId: trip.id, mode: 'TRAIN', pnr: '4521789630', costAmount: 5555, segments: [{ carrierName: 'Karnataka Exp', carrierNumber: '12627', fromName: 'Belagavi', toName: 'Varanasi', departAt: `${day(20)}T10:15`, arriveAt: `${day(21)}T08:40` }], passengers: [{ name: 'Yatri Patil' }] })).body;
  return { trip, hotel, duty, act, tk };
}

describe.skipIf(!hasTestDb)('itinerary v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
    await seedCompany({ phone: '0831-2400000' });
  });

  it('starts from the trip bookings, and the customer copy never carries internal notes, costs or hidden items', async () => {
    const { trip } = await tourWithBookings();
    const created = await as('OPERATIONS').post('/api/v2/itineraries', { tripId: trip.id });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const v: View = created.body;
    expect(v.id).toMatch(/^ITN-\d{4}-0001$/);
    expect(v.days.map(d => d.date)).toEqual([day(20), day(21), day(22), day(23)]);
    const titles = v.days.map(d => d.items.map(i => i.title));
    expect(titles[0]).toEqual(['Pickup: Karad → Belagavi station', 'Train Karnataka Exp 12627: Belagavi → Varanasi']);
    expect(titles[1]).toEqual(expect.arrayContaining(['Check-in: Ganga View, Varanasi', 'Ganga aarti boat']));
    expect(titles[3]).toEqual(['Check-out: Ganga View']);
    expect(v.days.map(d => d.hotelName)).toEqual([null, 'Ganga View', 'Ganga View', null]);
    expect(v.warnings).toMatchObject({ notShared: true, datesOutOfStep: false });

    // Office-only content: day and itinerary notes, item notes and costs, a hidden item.
    const saved = await as('BOOKING').put(`/api/v2/itineraries/${v.id}`, payload(v, days => {
      days[0].internalNotes = `${SECRET} count heads at Karad`;
      days[1].items.push({ time: '05:00', kind: 'SIGHTSEEING', title: 'Mangala aarti', details: 'Queue from 4 am', internalNote: `${SECRET} tip the pandit`, internalCost: 4321.5, customerVisible: true, sourceType: null, sourceId: null });
      days[2].items.push({ time: null, kind: 'NOTE', title: `${SECRET} chase the refund`, details: null, internalNote: null, internalCost: 31337, customerVisible: false, sourceType: null, sourceId: null });
      days[2].morning = 'Sarnath visit';
    }));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    await prisma.itinerary.update({ where: { id: v.id }, data: { internalNotes: `${SECRET} margin` } });

    const cust = await as('ACCOUNTS').get(`/api/v2/itineraries/${v.id}/customer`);
    expect(cust.status).toBe(200);
    const json = JSON.stringify(cust.body);
    for (const leak of [SECRET, '4321', '31337', '88888', '99999', '7777', '6666', '5555', 'internal', 'cost', 'vendor', '000111222', 'AAAAA0000A']) expect(json, leak).not.toContain(leak);
    // Timed items by time, untimed after them.
    expect(cust.body.days[1].items.map((i: { title: string }) => i.title)).toEqual(['Mangala aarti', 'Ganga aarti boat', 'Check-in: Ganga View, Varanasi']);
    expect(cust.body.days[1].items[2].details).toBe('River-facing rooms');
    expect(cust.body.days[0].items[1].details).toContain('Status: Booking in progress');
    expect(json).toContain('PNR 4521789630');
    expect(cust.body.pickupPoints.map((p: { name: string }) => p.name)).toEqual(['Karad', 'Belagavi']);
    expect(cust.body.company).toEqual({ name: 'GK Travels', phone: '0831-2400000', email: null, website: null, address: 'Belagavi, Karnataka', logoUrl: null });

    // Staff: OPERATIONS sees notes but not costs; saving as OPERATIONS keeps the costs.
    const ops: View = (await as('OPERATIONS').get(`/api/v2/itineraries/${v.id}`)).body;
    const aarti = ops.days[1].items.find(i => i.title === 'Mangala aarti')!;
    expect(aarti).toMatchObject({ internalNote: `${SECRET} tip the pandit`, internalCost: null });
    expect((await as('OPERATIONS').put(`/api/v2/itineraries/${v.id}`, payload(ops, days => { days[1].title = 'Kashi darshan'; }))).status).toBe(200);
    const bk: View = (await as('BOOKING').get(`/api/v2/itineraries/${v.id}`)).body;
    expect(bk.days[1].title).toBe('Kashi darshan');
    expect(bk.days[1].items.find(i => i.title === 'Mangala aarti')!.internalCost).toBe(4321.5);
    expect(bk.days[2].items.find(i => !i.customerVisible)!.internalCost).toBe(31337);
  });

  it('guards against lost updates and keeps booking items in step with their bookings', async () => {
    const { trip, act, hotel } = await tourWithBookings();
    const v: View = (await as('OPERATIONS').post('/api/v2/itineraries', { tripId: trip.id })).body;
    expect((await as('OPERATIONS').put(`/api/v2/itineraries/${v.id}`, payload(v))).status).toBe(200);
    const stale = await as('OPERATIONS').put(`/api/v2/itineraries/${v.id}`, payload(v));
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toMatch(/saved by someone else/);

    // Booking text cannot be typed over, nor the item deleted; it can be hidden and annotated.
    const cur: View = (await as('OPERATIONS').get(`/api/v2/itineraries/${v.id}`)).body;
    const aartiIdx = cur.days[1].items.findIndex(i => i.sourceType === 'ACTIVITY');
    const res = await as('OPERATIONS').put(`/api/v2/itineraries/${v.id}`, payload(cur, days => {
      days[1].items[aartiIdx] = { ...days[1].items[aartiIdx], title: 'Typed over', customerVisible: false, internalNote: 'Seats for 40 only' };
      days[3].items = []; // tries to drop the check-out item
    }));
    expect(res.status).toBe(200);
    const after: View = res.body;
    expect(after.days[1].items.find(i => i.sourceType === 'ACTIVITY')).toMatchObject({ title: 'Ganga aarti boat', customerVisible: false, internalNote: 'Seats for 40 only' });
    expect(after.days[3].items.map(i => i.title)).toEqual(['Check-out: Ganga View']);
    const dropDay = await as('OPERATIONS').put(`/api/v2/itineraries/${after.id}`, { ...payload(after), days: payload(after).days.slice(0, 3) });
    expect(dropDay.status).toBe(400);

    // The activity moves a day and the hotel is cancelled: sync follows.
    await as('OPERATIONS').put(`/api/v2/ops/activity-bookings/${act.id}`, { date: day(22), time: '19:00' });
    await as('OPERATIONS').post(`/api/v2/ops/hotel-bookings/${hotel.id}/status`, { status: 'CANCELLED', reason: 'Group moved' });
    const sync = await as('OPERATIONS').post(`/api/v2/itineraries/${v.id}/sync`, {});
    expect(sync.status, JSON.stringify(sync.body)).toBe(200);
    expect(sync.body.result).toMatchObject({ added: 0, updated: 1, removed: 2 });
    const s: View = sync.body.itinerary;
    expect(s.days[2].items.find(i => i.sourceType === 'ACTIVITY')).toMatchObject({ time: '19:00', internalNote: 'Seats for 40 only', customerVisible: false });
    expect(s.days.flatMap(d => d.items).some(i => i.sourceType?.startsWith('HOTEL'))).toBe(false);

    // The trip gets a day longer: a day is added on sync.
    await as('OPERATIONS').put(`/api/v2/trips/${trip.id}`, { returnDate: day(24) });
    expect(((await as('OPERATIONS').get(`/api/v2/itineraries/${v.id}`)).body as View).warnings.datesOutOfStep).toBe(true);
    const longer = (await as('OPERATIONS').post(`/api/v2/itineraries/${v.id}/sync`, {})).body;
    expect(longer.result.daysAdded).toBe(1);
    expect(longer.itinerary.days.map((d: Day) => d.date)).toEqual([day(20), day(21), day(22), day(23), day(24)]);

    const actions = (await prisma.activityLog.findMany({ where: { entityId: trip.id, action: { startsWith: 'itinerary_' } }, orderBy: { createdAt: 'asc' } })).map(a => a.action);
    expect(actions).toEqual(['itinerary_created', 'itinerary_saved', 'itinerary_saved', 'itinerary_synced', 'itinerary_synced']);
    const savedRow = await prisma.activityLog.findFirstOrThrow({ where: { entityId: trip.id, action: 'itinerary_saved' }, orderBy: { createdAt: 'desc' } });
    expect(savedRow.description).toMatch(/day 2, 4|day 2/);
    expect(savedRow.before).toBeTruthy();
    expect(savedRow.after).toBeTruthy();
  });

  it('sharing records the version the customer has; readiness warns until then and after later changes', async () => {
    const { trip } = await tourWithBookings();
    const codes = async () => ((await as('OPERATIONS').get(`/api/v2/trips/${trip.id}`)).body.readiness.checks as { code: string }[]).map(c => c.code);
    expect(await codes()).toContain('ITINERARY_MISSING');
    const v: View = (await as('OPERATIONS').post('/api/v2/itineraries', { tripId: trip.id })).body;
    expect(await codes()).toContain('ITINERARY_NOT_SHARED');
    const shared: View = (await as('OPERATIONS').post(`/api/v2/itineraries/${v.id}/share`, {})).body;
    expect(shared).toMatchObject({ sharedRevision: v.revision, status: 'finalized', warnings: { notShared: false, changedSinceShared: false } });
    expect((await codes()).filter(c => c.startsWith('ITINERARY'))).toEqual([]);
    const edited: View = (await as('OPERATIONS').put(`/api/v2/itineraries/${v.id}`, payload(shared, d => { d[0].notes = 'Carry a shawl'; }))).body;
    expect(edited).toMatchObject({ status: 'draft', warnings: { changedSinceShared: true } });
    expect(await codes()).toContain('ITINERARY_CHANGED');

    // One itinerary per trip.
    const dup = await as('OPERATIONS').post('/api/v2/itineraries', { tripId: trip.id });
    expect(dup.status).toBe(409);
    expect(dup.body.error.fields).toEqual({ itineraryId: v.id });
    expect((await as('OPERATIONS').get(`/api/v2/itineraries/by-trip/${trip.id}`)).body.itinerary.id).toBe(v.id);

    // The classic builder may not overwrite or delete a v2 itinerary.
    const classicPut = await as('BOOKING').put(`/api/itineraries/${v.id}`, { title: 'x', days: [] });
    expect(classicPut.status).toBe(409);
    expect((await as('ADMIN').delete(`/api/itineraries/${v.id}`)).status).toBe(409);
    expect(await prisma.itineraryItem.count({ where: { itineraryId: v.id } })).toBeGreaterThan(0);
  });

  it('copies a previous run of the tour (manual content only) and upgrades a classic itinerary without losing its activity lines', async () => {
    const first = await tourWithBookings();
    const a: View = (await as('OPERATIONS').post('/api/v2/itineraries', { tripId: first.trip.id })).body;
    await as('BOOKING').put(`/api/v2/itineraries/${a.id}`, payload(a, d => {
      d[1].title = 'Kashi darshan'; d[1].internalNotes = 'Book the guide';
      d[1].items.push({ time: '05:00', kind: 'SIGHTSEEING', title: 'Mangala aarti', details: null, internalNote: null, internalCost: 500, customerVisible: true, sourceType: null, sourceId: null });
    }));
    const next = (await as('BOOKING').post('/api/v2/trips', { tourName: 'Kashi Yatra Dec', destination: 'Varanasi', departure: day(50), returnDate: day(53) })).body.trip;
    const b: View = (await as('OPERATIONS').post('/api/v2/itineraries', { tripId: next.id, copyFromId: a.id })).body;
    expect(b.days[1]).toMatchObject({ date: day(51), title: 'Kashi darshan', internalNotes: 'Book the guide' });
    expect(b.days.flatMap(d => d.items).map(i => i.title)).toEqual(['Mangala aarti']);
    expect(b.days[1].items[0].internalCost).toBeNull(); // OPERATIONS created it: costs are not copied

    // Classic itinerary on a third trip: its activity lines become items on the first v2 save.
    const third = (await as('BOOKING').post('/api/v2/trips', { destination: 'Pandharpur', departure: day(60), returnDate: day(61) })).body.trip;
    await prisma.itinerary.create({ data: { id: 'ITN-2025-0009', tripId: third.id, title: 'Pandharpur wari', destination: 'Pandharpur', customerName: 'Test Customer', pax: 2, createdDate: '2025-06-01', days: { create: [{ dayNumber: 1, title: 'Arrival', morning: 'Chandrabhaga snan', activities: ['Vitthal darshan', ' '], meals: ['lunch'] }] } } });
    const classic: View = (await as('OPERATIONS').get(`/api/v2/itineraries/by-trip/${third.id}`)).body.itinerary;
    expect(classic.format).toBe('CLASSIC');
    expect(classic.days[0].items.map(i => i.title)).toEqual(['Vitthal darshan']);
    const up: View = (await as('OPERATIONS').put(`/api/v2/itineraries/${classic.id}`, payload(classic))).body;
    expect(up).toMatchObject({ format: 'V2', revision: 1 });
    expect(up.days[0]).toMatchObject({ morning: 'Chandrabhaga snan', date: day(60) });
    expect(up.days[0].items.map(i => i.title)).toEqual(['Vitthal darshan']);
    const raw = await prisma.itineraryDay.findFirstOrThrow({ where: { itineraryId: classic.id } });
    expect(raw.activities).toEqual([]);
  });

  it('permissions: reading with trips:read, building with operations:write; closed trips are fixed', async () => {
    const { trip } = await tourWithBookings();
    expect((await as('ACCOUNTS').post('/api/v2/itineraries', { tripId: trip.id })).status).toBe(403);
    const v: View = (await as('OPERATIONS').post('/api/v2/itineraries', { tripId: trip.id })).body;
    expect((await as('ACCOUNTS').get(`/api/v2/itineraries/${v.id}`)).status).toBe(200);
    expect((await as('ACCOUNTS').put(`/api/v2/itineraries/${v.id}`, payload(v))).status).toBe(403);
    expect((await as('ACCOUNTS').post(`/api/v2/itineraries/${v.id}/share`, {})).status).toBe(403);
    expect((await as('ACCOUNTS').delete(`/api/v2/itineraries/${v.id}`)).status).toBe(403);
    expect((await as('OPERATIONS').put(`/api/v2/itineraries/${v.id}`, { ...payload(v), days: [{ title: 'x', items: [{ title: 'y', time: '25:00' }] }] })).status).toBe(400);

    await as('OPERATIONS').post(`/api/v2/trips/${trip.id}/stage`, { stage: 'CANCELLED', reason: 'Group dropped' });
    expect((await as('OPERATIONS').put(`/api/v2/itineraries/${v.id}`, payload(v))).status).toBe(409);
    expect((await as('OPERATIONS').post(`/api/v2/itineraries/${v.id}/sync`, {})).status).toBe(409);
    expect((await as('OPERATIONS').get(`/api/v2/itineraries/${v.id}/customer`)).status).toBe(200);
  });
});
