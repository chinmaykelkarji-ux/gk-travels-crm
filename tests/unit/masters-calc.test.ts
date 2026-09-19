import { describe, it, expect } from 'vitest';
import { toPaise, toRupees, sumPaise, mulPaise, pctOf, allocatePaise, formatInr } from '../../src/shared/calc/money';
import { findRateOverlap, quoteStay, stayNights } from '../../src/shared/calc/hotelRates';
import { complianceReport, documentState, lapsesDuring } from '../../src/shared/calc/compliance';
import { mapHeaders, mapRow, normalizeDate, templateHeaders, IMPORT_KINDS } from '../../src/shared/calc/importMapping';
import { parseCsv, toCsv } from '../../src/shared/calc/csv';
import { kindFromLegacyType, legacyTypeFromKind, VehicleInput, RateInput, VendorInput } from '../../src/shared/contracts/masters';

describe('money in paise', () => {
  it('converts without float drift', () => {
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise('2800.50')).toBe(280050);
    expect(toPaise(-10.235)).toBe(-1024);
    expect(toPaise(null)).toBe(0);
    expect(toPaise('abc')).toBe(0);
    expect(toRupees(sumPaise([toPaise(0.1), toPaise(0.2)]))).toBe(0.3);
    expect(mulPaise(toPaise(2799.99), 3)).toBe(839997);
    expect(pctOf(toPaise(1000), 5)).toBe(5000);
    expect(formatInr(12345650)).toBe('₹1,23,456.50');
    expect(formatInr(280000)).toBe('₹2,800');
  });
  it('allocates without losing a paisa, including negatives and zero weights', () => {
    expect(allocatePaise(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocatePaise(1000, [1, 1, 1]).reduce((a, b) => a + b)).toBe(1000);
    expect(allocatePaise(-1000, [1, 2])).toEqual([-333, -667]);
    expect(allocatePaise(500, [0, 0])).toEqual([500, 0]);
    expect(allocatePaise(1, [3, 1])).toEqual([1, 0]);
    expect(allocatePaise(0, [])).toEqual([]);
  });
});

describe('hotel rate sheets', () => {
  const rates = [
    { id: 'a', mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-12-19', costPerNight: 2800, sellPerNight: 3400 },
    { id: 'b', mealPlan: 'CP', validFrom: '2026-12-20', validTo: '2027-01-05', costPerNight: 4200, sellPerNight: 5000 },
    { id: 'c', mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2027-03-31', costPerNight: 3500, sellPerNight: null },
  ];
  it('detects overlapping seasons per meal plan, ignoring itself', () => {
    expect(findRateOverlap({ mealPlan: 'CP', validFrom: '2026-12-19', validTo: '2026-12-25', costPerNight: 1 }, rates)?.id).toBe('a');
    expect(findRateOverlap({ mealPlan: 'CP', validFrom: '2027-01-06', validTo: '2027-03-31', costPerNight: 1 }, rates)).toBeNull();
    expect(findRateOverlap({ id: 'a', mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-12-19', costPerNight: 1 }, rates)).toBeNull();
    expect(findRateOverlap({ mealPlan: 'AP', validFrom: '2026-10-01', validTo: '2026-10-02', costPerNight: 1 }, rates)).toBeNull();
  });
  it('prices a stay night by night across seasons and flags gaps', () => {
    expect(stayNights('2026-12-18', '2026-12-22')).toEqual(['2026-12-18', '2026-12-19', '2026-12-20', '2026-12-21']);
    expect(stayNights('2026-12-22', '2026-12-22')).toEqual([]);
    const q = quoteStay(rates, 'CP', '2026-12-18', '2026-12-22', 2);
    expect(q.nights).toBe(4);
    expect(q.costPerRoom).toBe(2800 * 2 + 4200 * 2);
    expect(q.costTotal).toBe((2800 * 2 + 4200 * 2) * 2);
    expect(q.sellPerRoom).toBe(3400 * 2 + 5000 * 2);
    expect(q.missingDates).toEqual([]);
    const gap = quoteStay(rates, 'CP', '2027-01-04', '2027-01-08');
    expect(gap.missingDates).toEqual(['2027-01-06', '2027-01-07']);
    expect(quoteStay(rates, 'MAP', '2026-11-01', '2026-11-03').sellTotal).toBeNull();
  });
});

describe('document compliance', () => {
  it('classifies each document and takes the worst', () => {
    expect(documentState(null, '2026-09-18', 30)).toBe('MISSING');
    expect(documentState('2026-09-17', '2026-09-18', 30)).toBe('EXPIRED');
    expect(documentState('2026-09-18', '2026-09-18', 30)).toBe('EXPIRING');
    expect(documentState('2026-10-18', '2026-09-18', 30)).toBe('EXPIRING');
    expect(documentState('2026-10-19', '2026-09-18', 30)).toBe('OK');
    const r = complianceReport({ insurance: '2027-01-01', permit: null, puc: '2026-09-30' }, '2026-09-18');
    expect(r.state).toBe('EXPIRING');
    expect(r.items.find(i => i.document === 'permit')?.state).toBe('MISSING');
    expect(complianceReport({ insurance: '2027-01-01' }, '2026-09-18').state).toBe('OK');
    expect(complianceReport({ a: '2026-01-01', b: null }, '2026-09-18').state).toBe('EXPIRED');
  });
  it('knows which documents lapse before a duty ends', () => {
    expect(lapsesDuring({ insurance: '2026-10-05', permit: '2027-01-01', puc: null }, '2026-10-07')).toEqual(['insurance']);
    expect(lapsesDuring({ insurance: '2026-10-07' }, '2026-10-07')).toEqual([]);
  });
});

describe('master import mapping', () => {
  it('maps aliased headers, flags missing required columns and unknown ones', () => {
    const { headers, rows } = parseCsv('Registration No.,Vehicle Type,Capacity,Owner,Insurance Valid Till,Colour\nKA 22 ab-1234,Tempo Traveller,17,Shree Sai Tours,31/03/2027,White');
    const m = mapHeaders('vehicles', headers);
    expect(m.missingRequired).toEqual([]);
    expect(m.unknownHeaders).toEqual(['colour']);
    const data = mapRow('vehicles', rows[0], m);
    expect(data).toEqual({ registrationNo: 'KA 22 ab-1234', type: 'Tempo Traveller', seats: '17', vendorName: 'Shree Sai Tours', insuranceExpiry: '2027-03-31' });
    const parsed = VehicleInput.safeParse({ ...data, vendorName: undefined, ownership: 'vendor', vendorId: 'v1' });
    expect(parsed.success && parsed.data).toMatchObject({ registrationNo: 'KA 22 AB 1234', seats: 17, ownership: 'VENDOR' });
    expect(mapHeaders('drivers', ['name']).missingRequired).toEqual(['Phone']);
  });
  it('round-trips every template: its own headers map fully', () => {
    for (const kind of IMPORT_KINDS) {
      const csv = toCsv(templateHeaders(kind), []);
      const m = mapHeaders(kind, parseCsv(csv).headers);
      expect(m.unknownHeaders, kind).toEqual([]);
      expect(m.missingRequired, kind).toEqual([]);
    }
  });
  it('normalises Indian date formats and money cells', () => {
    expect(normalizeDate('5/1/2027')).toBe('2027-01-05');
    expect(normalizeDate('05-01-2027')).toBe('2027-01-05');
    expect(normalizeDate('2027/1/5')).toBe('2027-01-05');
    expect(normalizeDate('Jan 5')).toBe('Jan 5');
    const { headers, rows } = parseCsv('Hotel,City,Room,Meal,From,To,Net Rate,Sell\nGanga View,Varanasi,Deluxe,cp,01-10-2026,31-03-2027,"₹2,800",3400');
    const data = mapRow('hotel-rates', rows[0], mapHeaders('hotel-rates', headers));
    expect(data).toMatchObject({ costPerNight: '2800', validFrom: '2026-10-01' });
    expect(RateInput.safeParse({ ...data, mealPlan: 'CP' }).success).toBe(true);
    expect(RateInput.safeParse({ ...data, mealPlan: 'CP', validTo: '2026-09-01' }).success).toBe(false);
  });
});

describe('vendor kinds', () => {
  it('maps classic types to kinds and back', () => {
    expect(kindFromLegacyType('Hotel')).toBe('HOTEL');
    expect(kindFromLegacyType('miscellaneous')).toBe('OTHER');
    expect(kindFromLegacyType('air consolidator')).toBe('AIR_CONSOLIDATOR');
    expect(kindFromLegacyType(null)).toBe('OTHER');
    expect(legacyTypeFromKind('TRANSPORT')).toBe('transport');
    expect(legacyTypeFromKind('DMC')).toBe('miscellaneous');
    expect(VendorInput.parse({ name: 'Sai Tours', phone: '9876543210', kind: 'cab' }).kind).toBe('TRANSPORT');
    expect(VendorInput.safeParse({ name: 'X Co', phone: '9876543210', gstNumber: '29ABCDE1234F1Z' }).success).toBe(false);
  });
});
