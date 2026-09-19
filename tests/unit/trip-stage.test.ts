import { describe, it, expect } from 'vitest';
import { evaluateTransition, legacyStatusFor, readinessChecks, stageForLegacyStatus, type TripSnapshot } from '../../src/shared/calc/tripStage';

const base: TripSnapshot = {
  stage: 'CONFIRMING', departure: '2026-10-20', returnDate: '2026-10-27', isInternational: false, travellers: 42,
  hotels: [{ status: 'CONFIRMED', label: 'Ganga View' }], vehicles: [{ status: 'CONFIRMED', label: 'Bus', hasVehicle: true, hasDriver: true }],
  activities: [], tickets: [{ status: 'CONFIRMED', label: 'train 4521336789' }], passportProblems: [],
};

describe('readiness checks', () => {
  it('a fully confirmed trip has no blockers', () => {
    expect(readinessChecks(base).filter(c => c.severity === 'block')).toEqual([]);
  });
  it('blocks on unconfirmed hotels, duties, activities and unbooked tickets; cancelled ones do not count', () => {
    const t: TripSnapshot = { ...base,
      hotels: [{ status: 'REQUESTED', label: 'A' }, { status: 'CANCELLED', label: 'B' }, { status: 'ON_HOLD', label: 'C' }],
      vehicles: [{ status: 'REQUESTED', label: 'Bus', hasVehicle: true, hasDriver: true }, { status: 'CONFIRMED', label: 'Car', hasVehicle: true, hasDriver: false }],
      activities: [{ status: 'REQUESTED', label: 'Boat' }], tickets: [{ status: 'REQUESTED', label: 't1' }, { status: 'WAITLISTED', label: 't2' }],
    };
    const codes = readinessChecks(t).map(c => [c.code, c.severity]);
    expect(codes).toEqual([['HOTEL_UNCONFIRMED', 'block'], ['VEHICLE_UNCONFIRMED', 'block'], ['VEHICLE_NO_DRIVER', 'block'], ['ACTIVITY_UNCONFIRMED', 'block'], ['TICKET_NOT_BOOKED', 'block'], ['TICKET_WAITLISTED', 'warn']]);
    expect(readinessChecks(t)[0].items).toEqual(['A', 'C']);
  });
  it('passports matter only abroad; empty trips are warned about', () => {
    expect(readinessChecks({ ...base, passportProblems: ['Shri X'] }).some(c => c.code === 'PASSPORT')).toBe(false);
    expect(readinessChecks({ ...base, isInternational: true, passportProblems: ['Shri X'] }).find(c => c.code === 'PASSPORT')?.severity).toBe('block');
    expect(readinessChecks({ ...base, hotels: [], vehicles: [], tickets: [], departure: null, travellers: 0 }).map(c => c.code)).toEqual(['NO_DATES', 'NO_TRAVELLERS', 'NOTHING_BOOKED']);
  });
});

describe('stage transitions', () => {
  it('only allowed moves, and READY needs everything confirmed', () => {
    expect(evaluateTransition({ ...base, stage: 'PLANNING' }, 'READY', '2026-10-01').blockers[0].code).toBe('NOT_ALLOWED');
    expect(evaluateTransition(base, 'READY', '2026-10-01').allowed).toBe(true);
    const r = evaluateTransition({ ...base, hotels: [{ status: 'REQUESTED', label: 'A' }], tickets: [{ status: 'RAC', label: 't' }] }, 'READY', '2026-10-01');
    expect(r.allowed).toBe(false);
    expect(r.blockers.map(b => b.code)).toEqual(['HOTEL_UNCONFIRMED']);
    expect(r.warnings.map(b => b.code)).toEqual(['TICKET_WAITLISTED']);
    expect(evaluateTransition({ ...base, stage: 'PLANNING', departure: null }, 'CONFIRMING', '2026-10-01').allowed).toBe(false);
    expect(evaluateTransition({ ...base, stage: 'PLANNING', travellers: 0 }, 'CONFIRMING', '2026-10-01')).toMatchObject({ allowed: true, warnings: [{ code: 'NO_TRAVELLERS' }] });
  });
  it('the tour starts on its departure day and completes on its return day', () => {
    expect(evaluateTransition({ ...base, stage: 'READY' }, 'ONGOING', '2026-10-19').blockers[0].code).toBe('NOT_STARTED');
    expect(evaluateTransition({ ...base, stage: 'READY' }, 'ONGOING', '2026-10-20').allowed).toBe(true);
    expect(evaluateTransition({ ...base, stage: 'ONGOING' }, 'COMPLETED', '2026-10-26').allowed).toBe(false);
    expect(evaluateTransition({ ...base, stage: 'ONGOING' }, 'COMPLETED', '2026-10-27').allowed).toBe(true);
    expect(evaluateTransition({ ...base, stage: 'ONGOING' }, 'CANCELLED', '2026-10-21').allowed).toBe(false);
    expect(evaluateTransition({ ...base, stage: 'CANCELLED' }, 'PLANNING', '2026-10-21').allowed).toBe(true);
  });
  it('keeps the classic status in step both ways', () => {
    expect(legacyStatusFor('PLANNING', false)).toBe('draft');
    expect(legacyStatusFor('PLANNING', true)).toBe('confirmed');
    expect(legacyStatusFor('READY', true)).toBe('confirmed');
    expect(legacyStatusFor('ONGOING', true)).toBe('in_progress');
    expect(stageForLegacyStatus('confirmed', 'READY')).toBeNull();
    expect(stageForLegacyStatus('confirmed', 'PLANNING')).toBe('CONFIRMING');
    expect(stageForLegacyStatus('in_progress', 'READY')).toBe('ONGOING');
    expect(stageForLegacyStatus('weird', 'READY')).toBeNull();
  });
});
