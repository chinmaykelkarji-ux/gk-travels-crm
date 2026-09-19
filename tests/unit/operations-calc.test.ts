import { describe, it, expect } from 'vitest';
import {
  ASSIGNMENT_TRANSITIONS, OPS_TRANSITIONS, canMoveDriverStatus, canTransition, findScheduleConflicts, needsReconfirmation, nightsBetween, overlaps, RECONFIRM_FIELDS,
} from '../../src/shared/calc/operations';
import { addDays, istClock, istDay, istToday, parseIst, toIstLocal } from '../../src/shared/calc/istTime';
import { VehicleAssignmentInput, HotelBookingInput } from '../../src/shared/contracts/operations';

describe('IST time', () => {
  it('reads wall-clock IST and writes it back unchanged', () => {
    const d = parseIst('2026-10-20T06:00')!;
    expect(d.toISOString()).toBe('2026-10-20T00:30:00.000Z');
    expect(toIstLocal(d)).toBe('2026-10-20T06:00');
    expect(istClock(d)).toBe('06:00');
    expect(istDay('2026-10-19T19:00:00Z')).toBe('2026-10-20'); // 00:30 IST next day
    expect(parseIst('2026-10-20T06:00:00Z')!.toISOString()).toBe('2026-10-20T06:00:00.000Z');
    expect(parseIst('2026-10-20')!.toISOString()).toBe('2026-10-19T18:30:00.000Z');
    expect(parseIst('tomorrow')).toBeNull();
    expect(istToday(new Date('2026-09-18T20:00:00Z'))).toBe('2026-09-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('operational status transitions', () => {
  it('hotel/activity bookings', () => {
    expect(canTransition(OPS_TRANSITIONS, 'REQUESTED', 'CONFIRMED')).toBe(true);
    expect(canTransition(OPS_TRANSITIONS, 'CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition(OPS_TRANSITIONS, 'CANCELLED', 'REQUESTED')).toBe(true);
    expect(canTransition(OPS_TRANSITIONS, 'CONFIRMED', 'CONFIRMED')).toBe(false);
    expect(canTransition(OPS_TRANSITIONS, 'CONFIRMED', 'ON_HOLD')).toBe(false);
  });
  it('vehicle duties and the driver app', () => {
    expect(canTransition(ASSIGNMENT_TRANSITIONS, 'REQUESTED', 'COMPLETED')).toBe(false);
    expect(canTransition(ASSIGNMENT_TRANSITIONS, 'CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canMoveDriverStatus('ASSIGNED', 'ACKNOWLEDGED')).toBe(true);
    expect(canMoveDriverStatus('ASSIGNED', 'ARRIVED')).toBe(false);
    expect(canMoveDriverStatus('STARTED', 'ISSUE')).toBe(true);
    expect(canMoveDriverStatus('ISSUE', 'ARRIVED')).toBe(true);
    expect(canMoveDriverStatus('ISSUE', 'ASSIGNED')).toBe(false);
    expect(canMoveDriverStatus('COMPLETED', 'ISSUE')).toBe(false);
  });
  it('flags changes that need the supplier to confirm again', () => {
    const before = { checkIn: '2026-10-20', checkOut: '2026-10-22', rooms: 10, internalNotes: 'x' };
    expect(needsReconfirmation(before, { rooms: 12, internalNotes: 'y' }, RECONFIRM_FIELDS.hotel)).toEqual(['rooms']);
    expect(needsReconfirmation(before, { rooms: 10, checkIn: '2026-10-20' }, RECONFIRM_FIELDS.hotel)).toEqual([]);
    expect(nightsBetween('2026-10-20', '2026-10-23')).toBe(3);
  });
});

describe('vehicle and driver double-booking', () => {
  const existing = [
    { id: 'a', vehicleId: 'bus1', driverId: 'd1', startAt: '2026-10-20T00:30:00Z', endAt: '2026-10-20T12:30:00Z', label: 'GK-1' },
    { id: 'b', vehicleId: 'bus2', driverId: 'd2', startAt: '2026-10-21T00:30:00Z', endAt: '2026-10-23T12:30:00Z', label: 'GK-2' },
  ];
  it('uses half-open intervals', () => {
    expect(overlaps({ startAt: '2026-10-20T12:30:00Z', endAt: '2026-10-20T15:00:00Z' }, existing[0])).toBe(false);
    expect(overlaps({ startAt: '2026-10-20T12:29:00Z', endAt: '2026-10-20T15:00:00Z' }, existing[0])).toBe(true);
  });
  it('reports the vehicle and the driver separately and ignores the record itself', () => {
    const c = findScheduleConflicts({ vehicleId: 'bus1', driverId: 'd2', startAt: '2026-10-20T10:00:00Z', endAt: '2026-10-22T10:00:00Z' }, existing);
    expect(c.map(x => [x.resource, x.with.id])).toEqual([['vehicle', 'a'], ['driver', 'b']]);
    expect(findScheduleConflicts({ id: 'a', vehicleId: 'bus1', driverId: 'd1', startAt: '2026-10-20T00:30:00Z', endAt: '2026-10-20T13:00:00Z' }, existing)).toEqual([]);
    expect(findScheduleConflicts({ vehicleId: null, driverId: null, startAt: '2026-10-20T00:00:00Z', endAt: '2026-10-25T00:00:00Z' }, existing)).toEqual([]);
  });
});

describe('operations contracts', () => {
  it('normalises IST pickup times and rejects inverted duties', () => {
    const v = VehicleAssignmentInput.parse({ vehicleType: 'Bus 45', startAt: '2026-10-20T05:30', endAt: '2026-10-22T21:00', pax: 42 });
    expect(v.startAt).toBe('2026-10-20T00:00:00.000Z');
    expect(VehicleAssignmentInput.safeParse({ vehicleType: 'Bus', startAt: '2026-10-22T05:30', endAt: '2026-10-20T21:00' }).success).toBe(false);
    expect(VehicleAssignmentInput.safeParse({ startAt: '2026-10-20T05:30', endAt: '2026-10-22T21:00' }).success).toBe(false);
    expect(HotelBookingInput.safeParse({ hotelName: 'Ganga View', checkIn: '2026-10-22', checkOut: '2026-10-22' }).success).toBe(false);
    expect(HotelBookingInput.safeParse({ checkIn: '2026-10-20', checkOut: '2026-10-22' }).success).toBe(false);
  });
});
