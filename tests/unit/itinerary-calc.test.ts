import { describe, expect, it } from 'vitest';
import {
  alignDays, bookingItems, dayNumberFor, itineraryAsText, planDays, shortDate, sortItems, syncPlan, toCustomerItinerary,
  type BookingSources, type DayDoc, type ItineraryDoc,
} from '../../src/shared/calc/itinerary';
import { readinessChecks, type TripSnapshot } from '../../src/shared/calc/tripStage';

const SECRET = 'INTERNAL-ONLY-7c1f';
const day = (n: number, over: Partial<DayDoc> = {}): DayDoc => ({
  id: `d${n}`, dayNumber: n, date: null, title: `Day ${n}`, morning: null, afternoon: null, evening: null, hotelName: null, hotelAddress: null,
  meals: [], transfers: null, notes: null, internalNotes: null, items: [], ...over,
});

describe('planDays / dayNumberFor', () => {
  it('covers departure to return inclusive', () => {
    expect(planDays('2026-10-01', '2026-10-03')).toEqual([{ dayNumber: 1, date: '2026-10-01' }, { dayNumber: 2, date: '2026-10-02' }, { dayNumber: 3, date: '2026-10-03' }]);
    expect(planDays('2026-10-01', null)).toHaveLength(1);
    expect(planDays('2026-10-05', '2026-10-01')).toHaveLength(1);
    expect(planDays(null, '2026-10-01')).toEqual([]);
    expect(planDays('2026-02-27', '2026-03-01').map(d => d.date)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
  it('maps a date to its day number', () => {
    expect(dayNumberFor('2026-10-01', '2026-10-01')).toBe(1);
    expect(dayNumberFor('2026-10-01', '2026-10-04')).toBe(4);
    expect(dayNumberFor('2026-10-01', '2026-09-30')).toBeNull();
    expect(dayNumberFor(null, '2026-10-01')).toBeNull();
  });
});

describe('alignDays', () => {
  it('re-dates days, drops empty days past a shortened trip and keeps written ones', () => {
    const days = [day(1), day(2), day(3, { morning: 'Kashi Vishwanath darshan' }), day(4)];
    const r = alignDays(days, '2026-11-10', '2026-11-11');
    expect(r.keep.map(d => [d.dayNumber, d.date])).toEqual([[1, '2026-11-10'], [2, '2026-11-11'], [3, '2026-11-12']]);
    expect(r.drop.map(d => d.dayNumber)).toEqual([4]);
    expect(r.beyond.map(d => d.dayNumber)).toEqual([3]);
    expect(r.add).toEqual([]);
  });
  it('adds days when the trip gets longer', () => {
    const r = alignDays([day(1)], '2026-11-10', '2026-11-12');
    expect(r.add).toEqual([{ dayNumber: 2, date: '2026-11-11' }, { dayNumber: 3, date: '2026-11-12' }]);
  });
  it('changes nothing when the trip has no dates', () => {
    const r = alignDays([day(1), day(2)], null, null);
    expect(r.keep).toHaveLength(2);
    expect(r.add).toEqual([]);
  });
});

describe('sortItems', () => {
  it('puts timed items in time order and keeps untimed ones after, in their order', () => {
    const items = [{ time: null, t: 'a' }, { time: '09:00', t: 'b' }, { time: '06:10', t: 'c' }, { time: null, t: 'd' }, { time: '09:00', t: 'e' }];
    expect(sortItems(items).map(i => i.t)).toEqual(['c', 'b', 'e', 'a', 'd']);
  });
});

const sources = (over: Partial<BookingSources> = {}): BookingSources => ({
  hotels: [{ id: 'h1', hotelName: 'Hotel Ganga View', city: 'Varanasi', address: 'Dashashwamedh Road', roomTypeName: 'Deluxe', mealPlan: 'CP', checkIn: '2026-11-11', checkOut: '2026-11-13', rooms: 12, status: 'CONFIRMED', confirmationNo: 'GV-99', customerNotes: 'Early check-in requested' }],
  vehicles: [{ id: 'v1', startLocal: '2026-11-10T05:30', endLocal: '2026-11-10T09:00', pickupPoint: 'Karad bus stand', dropPoint: 'Belagavi station', route: null, vehicleType: 'Tempo Traveller', vehicleRegNo: 'KA-22-AB-1234', driverName: 'Ramesh', driverPhone: '9876543210', status: 'CONFIRMED', customerNotes: null }],
  activities: [{ id: 'a1', name: 'Ganga aarti boat', city: 'Varanasi', date: '2026-11-11', time: '18:30', status: 'REQUESTED', confirmationNo: null, customerNotes: null }],
  segments: [{ id: 's1', mode: 'TRAIN', carrier: 'IRCTC', carrierName: 'Karnataka Exp', carrierNumber: '12627', fromName: 'Belagavi', toName: 'Varanasi', departLocal: '2026-11-10T10:15', arriveLocal: '2026-11-11T08:40', pnr: '4521789630', travelClass: '3A', boardingPoint: 'Belagavi', ticketStatus: 'WAITLISTED' }],
  ...over,
});

describe('bookingItems', () => {
  it('turns bookings into customer-safe items and nightly stays', () => {
    const { items, stays } = bookingItems(sources());
    const by = (t: string) => items.filter(i => i.sourceType === t);
    expect(by('HOTEL_IN')[0]).toMatchObject({ date: '2026-11-11', kind: 'STAY', title: 'Check-in: Hotel Ganga View, Varanasi' });
    expect(by('HOTEL_IN')[0].details).toBe('12 × Deluxe · With breakfast · Confirmation GV-99 · Early check-in requested');
    expect(by('HOTEL_OUT')[0]).toMatchObject({ date: '2026-11-13', title: 'Check-out: Hotel Ganga View' });
    expect(stays.map(s => s.date)).toEqual(['2026-11-11', '2026-11-12']);
    expect(by('VEHICLE')[0]).toMatchObject({ date: '2026-11-10', time: '05:30', kind: 'TRANSFER', title: 'Pickup: Karad bus stand → Belagavi station' });
    expect(by('VEHICLE')[0].details).toContain('Driver Ramesh (9876543210)');
    expect(by('ACTIVITY')[0]).toMatchObject({ date: '2026-11-11', time: '18:30', title: 'Ganga aarti boat, Varanasi' });
    const seg = by('SEGMENT')[0];
    expect(seg).toMatchObject({ date: '2026-11-10', time: '10:15', kind: 'TRAVEL', title: 'Train Karnataka Exp 12627: Belagavi → Varanasi' });
    expect(seg.details).toBe('Departs 10:15, arrives 2026-11-11 08:40 · PNR 4521789630 · Class 3A · Boarding at Belagavi · Status: Waitlisted');
  });
  it('proposes nothing for cancelled records or legs without a departure time', () => {
    const src = sources();
    src.hotels[0].status = 'CANCELLED';
    src.vehicles[0].status = 'CANCELLED';
    src.activities[0].status = 'CANCELLED';
    src.segments.push({ ...src.segments[0], id: 's2', departLocal: null });
    src.segments[0].ticketStatus = 'CANCELLED';
    const { items, stays } = bookingItems(src);
    expect(items).toEqual([]);
    expect(stays).toEqual([]);
  });
});

describe('syncPlan', () => {
  const proposed = bookingItems(sources());
  it('adds new booking items on the right day and reports ones outside the itinerary', () => {
    const plan = syncPlan([], proposed.items, proposed.stays, '2026-11-10', 3);
    expect(plan.add.map(a => [a.sourceType, a.dayNumber])).toEqual([['HOTEL_IN', 2], ['VEHICLE', 1], ['ACTIVITY', 2], ['SEGMENT', 1]]);
    expect(plan.unplaced.map(u => u.sourceType)).toEqual(['HOTEL_OUT']); // 13 Nov is day 4 of a 3-day itinerary
    expect(plan.stays.map(s => s.dayNumber)).toEqual([2, 3]);
  });
  it('updates moved or changed items, removes gone ones and leaves unchanged ones alone', () => {
    const veh = proposed.items.find(i => i.sourceType === 'VEHICLE')!;
    const act = proposed.items.find(i => i.sourceType === 'ACTIVITY')!;
    const existing = [
      { id: 'i1', sourceType: 'VEHICLE', sourceId: 'v1', dayNumber: 1, time: veh.time, kind: veh.kind, title: veh.title, details: veh.details },
      { id: 'i2', sourceType: 'ACTIVITY', sourceId: 'a1', dayNumber: 3, time: '17:00', kind: act.kind, title: act.title, details: act.details },
      { id: 'i3', sourceType: 'ACTIVITY', sourceId: 'gone', dayNumber: 2, time: null, kind: 'ACTIVITY', title: 'Old', details: null },
    ];
    const plan = syncPlan(existing, proposed.items, [], '2026-11-10', 4);
    expect(plan.update).toEqual([{ id: 'i2', dayNumber: 2, time: '18:30', kind: 'ACTIVITY', title: act.title, details: act.details }]);
    expect(plan.remove).toEqual(['i3']);
    expect(plan.add.map(a => a.sourceType).sort()).toEqual(['HOTEL_IN', 'HOTEL_OUT', 'SEGMENT']);
  });
  it('places nothing when the trip has no dates', () => {
    const plan = syncPlan([], proposed.items, proposed.stays, null, 3);
    expect(plan.add).toEqual([]);
    expect(plan.unplaced).toHaveLength(proposed.items.length);
  });
});

describe('customer copy', () => {
  const doc: ItineraryDoc = {
    id: 'ITN-2026-0001', tripId: 'GK-2026-0007', title: 'Kashi Yatra', destination: 'Varanasi', customerName: 'Shri Patil', startDate: '2026-11-10', endDate: '2026-11-11', pax: 42, revision: 3,
    notes: 'Carry warm clothes.', internalNotes: `${SECRET} margin is thin`, emergencyContact: 'Office 0831-2400000',
    days: [
      day(2, { date: '2026-11-11', title: 'Kashi darshan', internalNotes: `${SECRET} guide owes us`, meals: ['dinner', 'breakfast'], items: [
        { id: 'x1', time: null, kind: 'NOTE', title: 'Free evening', details: null, internalNote: null, internalCost: null, customerVisible: true, sourceType: null, sourceId: null },
        { id: 'x2', time: '05:00', kind: 'SIGHTSEEING', title: 'Mangala aarti', details: 'Queue from 4 am', internalNote: `${SECRET} pay the priest`, internalCost: 98765.43, customerVisible: true, sourceType: null, sourceId: null },
        { id: 'x3', time: '12:00', kind: 'NOTE', title: `${SECRET} call vendor for refund`, details: null, internalNote: null, internalCost: 11111, customerVisible: false, sourceType: null, sourceId: null },
      ] }),
      day(1, { date: '2026-11-10', title: 'Departure', morning: 'Board the train at Belagavi', hotelName: '  ' }),
    ],
  };
  const ctx = {
    pickupPoints: [{ name: 'Karad', landmark: 'Bus stand', address: null, time: '2026-11-10T05:30', contactName: 'Suresh', contactPhone: '9800000000', mapUrl: null }],
    company: { name: 'GK Travels', phone: '0831-2400000', email: null, website: null, address: 'Belagavi', logoUrl: null },
  };
  const c = toCustomerItinerary(doc, ctx);

  it('never carries internal notes, internal costs or hidden items', () => {
    const json = JSON.stringify(c);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain('98765');
    expect(json).not.toContain('11111');
    expect(json).not.toMatch(/internal|cost|source/i);
    expect(itineraryAsText(c)).not.toContain(SECRET);
  });
  it('exposes exactly the allowlisted fields', () => {
    expect(Object.keys(c).sort()).toEqual(['company', 'days', 'destination', 'emergencyContact', 'endDate', 'id', 'notes', 'pax', 'pickupPoints', 'startDate', 'title', 'travellerName', 'tripRef', 'version'].sort());
    expect(Object.keys(c.days[0]).sort()).toEqual(['afternoon', 'date', 'dayNumber', 'evening', 'hotelAddress', 'hotelName', 'items', 'meals', 'morning', 'notes', 'title', 'transfers'].sort());
    expect(Object.keys(c.days[1].items[0]).sort()).toEqual(['details', 'kind', 'kindLabel', 'time', 'title']);
  });
  it('orders days and items and tidies blanks', () => {
    expect(c.days.map(d => d.dayNumber)).toEqual([1, 2]);
    expect(c.days[0].hotelName).toBeNull();
    expect(c.days[1].items.map(i => i.title)).toEqual(['Mangala aarti', 'Free evening']);
    expect(c.days[1].meals).toEqual(['breakfast', 'dinner']);
  });
  it('writes a polite WhatsApp text', () => {
    const t = itineraryAsText(c);
    expect(t.startsWith('Namaste Shri Patil Ji,')).toBe(true);
    expect(t).toContain('*Day 1 — Tue 10 Nov: Departure*');
    expect(t).toContain('05:00 Mangala aarti (Queue from 4 am)');
    expect(t).toContain('• Karad — Tue 10 Nov, 05:30 (Bus stand)');
    expect(t).toContain('please call us on 0831-2400000');
    expect(shortDate('2026-11-10')).toBe('Tue 10 Nov');
  });
});

describe('readiness: itinerary warnings', () => {
  const snap: TripSnapshot = { stage: 'CONFIRMING', departure: '2026-11-10', returnDate: '2026-11-12', isInternational: false, travellers: 2, hotels: [], vehicles: [], activities: [], tickets: [], passportProblems: [] };
  const codes = (s: TripSnapshot) => readinessChecks(s).map(c => c.code);
  it('warns (never blocks) about a missing, unshared or changed itinerary', () => {
    expect(codes(snap)).not.toContain('ITINERARY_MISSING');
    expect(codes({ ...snap, itinerary: { exists: false, shared: false, changedSinceShared: false } })).toContain('ITINERARY_MISSING');
    expect(codes({ ...snap, itinerary: { exists: true, shared: false, changedSinceShared: false } })).toContain('ITINERARY_NOT_SHARED');
    expect(codes({ ...snap, itinerary: { exists: true, shared: true, changedSinceShared: true } })).toContain('ITINERARY_CHANGED');
    const all = readinessChecks({ ...snap, itinerary: { exists: false, shared: false, changedSinceShared: false } });
    expect(all.filter(c => c.code.startsWith('ITINERARY')).every(c => c.severity === 'warn')).toBe(true);
  });
});
