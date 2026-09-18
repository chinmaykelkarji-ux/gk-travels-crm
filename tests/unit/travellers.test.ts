import { describe, it, expect } from 'vitest';
import { ageOn, ageBand, passportStatus, daysUntilExpiry, paxBreakdown, travellerDisplayName } from '../../src/shared/calc/travellers';

describe('age bands', () => {
  it('computes whole years on the travel date', () => {
    expect(ageOn('2000-06-15', '2026-06-14')).toBe(25);
    expect(ageOn('2000-06-15', '2026-06-15')).toBe(26);
    expect(ageOn(null)).toBeNull();
    expect(ageOn('not-a-date')).toBeNull();
    expect(ageOn('2030-01-01', '2026-01-01')).toBeNull();
  });
  it('maps to airline bands: infant < 2, child 2–11, adult 12+', () => {
    expect(ageBand('2025-01-01', '2026-06-01')).toBe('INFANT');
    expect(ageBand('2024-05-31', '2026-06-01')).toBe('CHILD');
    expect(ageBand('2015-01-01', '2026-06-01')).toBe('CHILD');
    expect(ageBand('2014-06-01', '2026-06-01')).toBe('ADULT');
    expect(ageBand(undefined)).toBeNull();
  });
});

describe('passport status', () => {
  const today = new Date('2026-09-18T00:00:00Z');
  it('flags expired, insufficient (< 6 months past travel), expiring, ok, unknown', () => {
    expect(passportStatus('2026-09-01', { today })).toBe('EXPIRED');
    expect(passportStatus('2027-02-01', { today, travelDate: '2026-12-01' })).toBe('INSUFFICIENT');
    expect(passportStatus('2027-06-01', { today, travelDate: '2026-12-01' })).toBe('OK');
    expect(passportStatus('2027-01-15', { today })).toBe('EXPIRING');
    expect(passportStatus('2030-01-01', { today })).toBe('OK');
    expect(passportStatus(null, { today })).toBe('UNKNOWN');
  });
  it('honours a custom validity requirement', () => {
    expect(passportStatus('2027-02-01', { today, travelDate: '2026-12-01', requiredMonths: 1, warnDays: 30 })).toBe('OK');
    expect(passportStatus('2027-02-01', { today, travelDate: '2026-12-01', requiredMonths: 1 })).toBe('EXPIRING');
  });
  it('counts days to expiry', () => {
    expect(daysUntilExpiry('2026-09-28', today)).toBe(10);
    expect(daysUntilExpiry('2026-09-08', today)).toBe(-10);
    expect(daysUntilExpiry(null, today)).toBeNull();
  });
});

describe('pax helpers', () => {
  it('breaks a list down by explicit role or date of birth', () => {
    const list = [
      { role: 'ADULT' }, { dateOfBirth: '2020-01-01' }, { dateOfBirth: '2025-06-01' }, { dateOfBirth: null },
    ];
    expect(paxBreakdown(list, '2026-06-01')).toEqual({ adults: 1, children: 1, infants: 1, unknown: 1 });
  });
  it('builds a display name from title/first/last unless one is stored', () => {
    expect(travellerDisplayName({ title: 'Mrs', firstName: 'Asha', lastName: 'Rao' })).toBe('Mrs Asha Rao');
    expect(travellerDisplayName({ firstName: 'Asha', lastName: null })).toBe('Asha');
    expect(travellerDisplayName({ firstName: 'Asha', displayName: 'ASHA RAO' })).toBe('ASHA RAO');
  });
});
