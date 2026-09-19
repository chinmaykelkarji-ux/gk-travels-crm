import { describe, expect, it } from 'vitest';
import {
  effectiveRules, evaluateSalesRules, evaluateTripRules, RULES, sortByUrgency, urgencyBucket, validateRuleParams,
  type TripFacts,
} from '../../src/shared/calc/taskRules';

// 2026-11-01 09:00 IST
const NOW = new Date('2026-11-01T03:30:00.000Z');
const ist = (local: string) => new Date(Date.parse(`${local}:00+05:30`)).toISOString();
const defaults = effectiveRules({});

const trip = (over: Partial<TripFacts> = {}): TripFacts => ({
  id: 'GK-2026-0007', label: 'Kashi Yatra', customer: 'Shri Patil', customerId: 'CUS-1', stage: 'CONFIRMING',
  departure: '2026-11-10', returnDate: '2026-11-15', isInternational: false, balanceDue: 0, pax: 42,
  segments: [], hotels: [], vehicles: [], activities: [], travellers: [], ...over,
});
const codes = (t: TripFacts, now = NOW, rules = defaults) => evaluateTripRules(t, rules, now).map(d => d.ruleCode);

describe('rule settings', () => {
  it('fills defaults and ignores out-of-range stored values', () => {
    const r = effectiveRules({ WEB_CHECKIN: { enabled: false, params: { hoursBefore: 24 } }, TRAIN_CHART: { enabled: true, params: { hoursBefore: 999 } } });
    expect(r.WEB_CHECKIN).toEqual({ enabled: false, params: { hoursBefore: 24 } });
    expect(r.TRAIN_CHART.params.hoursBefore).toBe(8);
    expect(r.HOTEL_CONFIRMATION).toEqual({ enabled: true, params: { daysBefore: 7, atHour: 10 } });
  });
  it('validates edits against each parameter range', () => {
    expect(validateRuleParams('WEB_CHECKIN', { hoursBefore: 24 })).toEqual({});
    expect(validateRuleParams('WEB_CHECKIN', { hoursBefore: 0 })).toEqual({ hoursBefore: 'Whole number from 1 to 168' });
    expect(validateRuleParams('WEB_CHECKIN', { hoursBefore: 2.5, nope: 1 })).toEqual({ hoursBefore: 'Whole number from 1 to 168', nope: 'Unknown setting' });
  });
  it('every rule has a unique code, a description and sane defaults', () => {
    expect(new Set(RULES.map(r => r.code)).size).toBe(RULES.length);
    for (const r of RULES) for (const p of r.params) expect(p.default >= p.min && p.default <= p.max, `${r.code}.${p.key}`).toBe(true);
  });
});

describe('ticket rules', () => {
  const flight = { id: 's1', ticketId: 't1', ticketLabel: 'TKT-1', mode: 'FLIGHT', ticketStatus: 'CONFIRMED', quota: null, travelClass: 'Y', route: 'BLR → VNS', departAt: ist('2026-11-10T06:00'), paxCount: 12, chartPrepared: false };
  it('web check-in opens the configured hours before each flight; group seats for big groups', () => {
    const out = evaluateTripRules(trip({ segments: [flight] }), defaults, NOW);
    expect(out.find(d => d.ruleCode === 'WEB_CHECKIN')!.dueAt).toBe(ist('2026-11-08T06:00'));
    expect(out.find(d => d.ruleCode === 'GROUP_SEATS')!.dueAt).toBe(ist('2026-11-05T10:00'));
    const r24 = effectiveRules({ WEB_CHECKIN: { enabled: true, params: { hoursBefore: 24 } } });
    expect(evaluateTripRules(trip({ segments: [flight] }), r24, NOW).find(d => d.ruleCode === 'WEB_CHECKIN')!.dueAt).toBe(ist('2026-11-09T06:00'));
    expect(codes(trip({ segments: [{ ...flight, paxCount: 4 }] }))).toEqual(['WEB_CHECKIN']);
    expect(codes(trip({ segments: [{ ...flight, ticketStatus: 'REQUESTED' }] }))).toEqual([]);
    expect(codes(trip({ segments: [{ ...flight, ticketStatus: 'CANCELLED' }] }))).toEqual([]);
    expect(codes(trip({ segments: [{ ...flight, departAt: ist('2026-10-30T06:00') }] }))).toEqual([]); // already flown
  });
  const train = { ...flight, id: 's2', mode: 'TRAIN', route: 'UBL → BSB', travelClass: '3A', paxCount: 42, departAt: ist('2026-11-10T22:30') };
  it('Tatkal: reminder before the AC / non-AC window the day before, only while not booked', () => {
    const t = trip({ segments: [{ ...train, quota: 'TATKAL', ticketStatus: 'REQUESTED' }] });
    expect(evaluateTripRules(t, defaults, NOW).find(d => d.ruleCode === 'TATKAL_OPENS')!.dueAt).toBe(ist('2026-11-09T09:45'));
    const sl = trip({ segments: [{ ...train, quota: 'TATKAL', ticketStatus: 'REQUESTED', travelClass: 'SL' }] });
    expect(evaluateTripRules(sl, defaults, NOW).find(d => d.ruleCode === 'TATKAL_OPENS')!.dueAt).toBe(ist('2026-11-09T10:45'));
    expect(codes(trip({ segments: [{ ...train, quota: 'TATKAL', ticketStatus: 'CONFIRMED' }] }))).not.toContain('TATKAL_OPENS');
    expect(codes(trip({ segments: [{ ...train, quota: 'GENERAL', ticketStatus: 'REQUESTED' }] }))).not.toContain('TATKAL_OPENS');
  });
  it('waitlist: one check per day inside the window, until the chart is prepared', () => {
    const wl = trip({ segments: [{ ...train, ticketStatus: 'WAITLISTED' }] });
    expect(codes(wl, new Date(ist('2026-11-02T09:00')))).not.toContain('TRAIN_WL_CHECK'); // 8 days out
    const d1 = evaluateTripRules(wl, defaults, new Date(ist('2026-11-03T08:00'))).find(d => d.ruleCode === 'TRAIN_WL_CHECK')!;
    const d2 = evaluateTripRules(wl, defaults, new Date(ist('2026-11-04T08:00'))).find(d => d.ruleCode === 'TRAIN_WL_CHECK')!;
    expect(d1.key).not.toBe(d2.key);
    expect(d2.dueAt).toBe(ist('2026-11-04T10:00'));
    expect(codes(trip({ segments: [{ ...train, ticketStatus: 'WAITLISTED', chartPrepared: true }] }), new Date(ist('2026-11-09T08:00')))).not.toContain('TRAIN_WL_CHECK');
  });
  it('chart: due the configured hours before departure, gone once recorded', () => {
    const out = evaluateTripRules(trip({ segments: [train] }), defaults, NOW);
    expect(out.find(d => d.ruleCode === 'TRAIN_CHART')!.dueAt).toBe(ist('2026-11-10T14:30'));
    expect(codes(trip({ segments: [{ ...train, chartPrepared: true }] }))).toEqual([]);
  });
});

describe('documents, suppliers, money, after the trip', () => {
  it('passports: expired or short validity on trips within the window; missing ones on international trips', () => {
    const travellers = [
      { id: 'p1', name: 'A', passportExpiry: '2027-01-01', hasPassport: true },  // < 6 months after return
      { id: 'p2', name: 'B', passportExpiry: '2030-01-01', hasPassport: true },
      { id: 'p3', name: 'C', passportExpiry: null, hasPassport: false },
    ];
    const dom = evaluateTripRules(trip({ travellers }), defaults, NOW).filter(d => d.ruleCode === 'PASSPORT_VALIDITY');
    expect(dom.map(d => d.entityId)).toEqual(['p1']);
    const intl = evaluateTripRules(trip({ travellers, isInternational: true }), defaults, NOW).filter(d => d.ruleCode === 'PASSPORT_VALIDITY');
    expect(intl.map(d => d.entityId)).toEqual(['p1', 'p3']);
    expect(intl[1].title).toMatch(/Passport details missing/);
    expect(intl.every(d => d.keepDue)).toBe(true);
    expect(codes(trip({ travellers, departure: '2027-06-01', returnDate: '2027-06-05' }))).toEqual([]); // outside 90 days
    const three = effectiveRules({ PASSPORT_VALIDITY: { enabled: true, params: { requiredMonths: 1, windowDays: 90 } } });
    expect(evaluateTripRules(trip({ travellers }), three, NOW).filter(d => d.ruleCode === 'PASSPORT_VALIDITY')).toEqual([]);
  });
  it('visa check only for international trips', () => {
    expect(codes(trip())).not.toContain('VISA_CHECK');
    const v = evaluateTripRules(trip({ isInternational: true }), defaults, NOW).find(d => d.ruleCode === 'VISA_CHECK')!;
    expect(v.dueAt).toBe(ist('2026-10-11T10:00'));
  });
  it('supplier confirmations and driver details', () => {
    const t = trip({
      hotels: [{ id: 'h1', hotelName: 'Ganga View', checkIn: '2026-11-11', status: 'REQUESTED' }, { id: 'h2', hotelName: 'Done', checkIn: '2026-11-12', status: 'CONFIRMED' }],
      vehicles: [{ id: 'v1', label: 'Tempo Traveller 10 Nov 05:00', startAt: ist('2026-11-10T05:00'), status: 'REQUESTED', hasDriver: false }, { id: 'v2', label: 'Bus', startAt: ist('2026-11-11T07:00'), status: 'CONFIRMED', hasDriver: false }],
      activities: [{ id: 'a1', name: 'Boat', date: '2026-11-11', time: '18:30', status: 'ON_HOLD' }],
    });
    const out = evaluateTripRules(t, defaults, NOW);
    expect(out.map(d => `${d.ruleCode}:${d.entityId}`)).toEqual(['HOTEL_CONFIRMATION:h1', 'VEHICLE_CONFIRMATION:v1', 'DRIVER_DETAILS:v2', 'ACTIVITY_CONFIRMATION:a1']);
    expect(out.find(d => d.ruleCode === 'HOTEL_CONFIRMATION')!.dueAt).toBe(ist('2026-11-04T10:00'));
    expect(out.find(d => d.ruleCode === 'DRIVER_DETAILS')!.dueAt).toBe(ist('2026-11-10T07:00'));
  });
  it('balance due before departure; feedback after a completed trip; nothing on cancelled trips', () => {
    const b = evaluateTripRules(trip({ balanceDue: 45500.5 }), defaults, NOW).find(d => d.ruleCode === 'BALANCE_DUE')!;
    expect(b.title).toContain('₹45,500.5');
    expect(b.dueAt).toBe(ist('2026-11-03T10:00'));
    const done = trip({ stage: 'COMPLETED', departure: '2026-10-20', returnDate: '2026-10-25', balanceDue: 100 });
    expect(codes(done)).toEqual(['POST_TRIP_FEEDBACK']);
    expect(evaluateTripRules(done, defaults, NOW)[0].dueAt).toBe(ist('2026-10-26T11:00'));
    expect(codes(trip({ stage: 'CANCELLED', balanceDue: 100, isInternational: true }))).toEqual([]);
    expect(codes(trip({ balanceDue: 100 }), NOW, effectiveRules({ BALANCE_DUE: { enabled: false, params: {} } }))).toEqual([]);
  });
});

describe('sales rules', () => {
  it('lead follow-ups on their date; quote follow-ups some days after sending, only while awaiting an answer', () => {
    const out = evaluateSalesRules({
      leads: [{ id: 'L1', name: 'Kulkarni family', status: 'contacted', followUpDate: '2026-11-02', assignedToUserId: 'u1' }, { id: 'L2', name: 'Lost', status: 'lost', followUpDate: '2026-11-02', assignedToUserId: null }],
      quotes: [{ id: 'q1', number: 'Q-2026-0003', customer: 'Shri Joshi', customerId: 'C1', status: 'SENT', sentAt: ist('2026-10-30T16:00'), assignedToUserId: null }, { id: 'q2', number: 'Q-2026-0004', customer: 'X', customerId: 'C2', status: 'ACCEPTED', sentAt: ist('2026-10-30T16:00'), assignedToUserId: null }],
    }, defaults, NOW);
    expect(out.map(d => d.key)).toEqual(['LEAD_FOLLOW_UP:L1:2026-11-02', `QUOTE_FOLLOW_UP:q1:${ist('2026-10-30T16:00')}`]);
    expect(out[0]).toMatchObject({ dueAt: ist('2026-11-02T10:00'), assignedToUserId: 'u1' });
    expect(out[1].dueAt).toBe(ist('2026-11-01T11:00'));
  });
});

describe('urgency', () => {
  const t = (dueAt: string | null, priority = 'medium', extra: Partial<{ dueDate: string | null; snoozedUntil: string | null }> = {}) => ({ dueAt, dueDate: null, snoozedUntil: null, priority, ...extra });
  it('buckets by effective due time in IST', () => {
    expect(urgencyBucket(t(ist('2026-11-01T08:00')), NOW)).toBe('OVERDUE');
    expect(urgencyBucket(t(ist('2026-11-01T10:30')), NOW)).toBe('NOW');
    expect(urgencyBucket(t(ist('2026-11-01T18:00')), NOW)).toBe('TODAY');
    expect(urgencyBucket(t(ist('2026-11-02T01:00')), NOW)).toBe('TOMORROW');
    expect(urgencyBucket(t(ist('2026-11-06T10:00')), NOW)).toBe('THIS_WEEK');
    expect(urgencyBucket(t(ist('2026-12-06T10:00')), NOW)).toBe('LATER');
    expect(urgencyBucket(t(null), NOW)).toBe('NO_DATE');
    expect(urgencyBucket(t(null, 'medium', { dueDate: '2026-11-01' }), NOW)).toBe('TODAY'); // date-only: due by the end of the day
    expect(urgencyBucket(t(null, 'medium', { dueDate: '2026-10-31' }), NOW)).toBe('OVERDUE');
    expect(urgencyBucket(t(ist('2026-11-01T08:00'), 'medium', { snoozedUntil: ist('2026-11-02T09:00') }), NOW)).toBe('TOMORROW');
  });
  it('sorts overdue first, then by priority, then by time', () => {
    const list = [
      { id: 'later', ...t(ist('2026-11-05T10:00'), 'urgent') },
      { id: 'overdue-low', ...t(ist('2026-10-30T10:00'), 'low') },
      { id: 'overdue-urgent', ...t(ist('2026-11-01T08:00'), 'urgent') },
      { id: 'today-high', ...t(ist('2026-11-01T17:00'), 'high') },
      { id: 'today-urgent', ...t(ist('2026-11-01T20:00'), 'urgent') },
    ];
    expect(sortByUrgency(list, NOW).map(x => x.id)).toEqual(['overdue-urgent', 'overdue-low', 'today-urgent', 'today-high', 'later']);
  });
});
