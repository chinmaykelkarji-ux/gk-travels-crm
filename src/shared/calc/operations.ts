// Operational records of a trip (hotel bookings, vehicle assignments,
// activity bookings): status transitions, what forces a re-confirmation,
// and vehicle/driver double-booking detection. Pure and dependency-free.

export type OpsStatus = 'REQUESTED' | 'ON_HOLD' | 'CONFIRMED' | 'CANCELLED';
export type AssignmentStatus = 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type DriverDutyStatus = 'ASSIGNED' | 'ACKNOWLEDGED' | 'STARTED' | 'ARRIVED' | 'ON_BOARD' | 'COMPLETED' | 'ISSUE';

export const OPS_TRANSITIONS: Record<OpsStatus, OpsStatus[]> = {
  REQUESTED: ['ON_HOLD', 'CONFIRMED', 'CANCELLED'],
  ON_HOLD:   ['REQUESTED', 'CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['REQUESTED', 'CANCELLED'],
  CANCELLED: ['REQUESTED'],
};

export const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  REQUESTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['REQUESTED', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['CONFIRMED'],
  CANCELLED: ['REQUESTED'],
};

/** Driver-app progression; ISSUE can be raised from any active step and cleared back to it. */
export const DRIVER_STEPS: DriverDutyStatus[] = ['ASSIGNED', 'ACKNOWLEDGED', 'STARTED', 'ARRIVED', 'ON_BOARD', 'COMPLETED'];

export function canMoveDriverStatus(from: DriverDutyStatus, to: DriverDutyStatus): boolean {
  if (from === to) return false;
  if (from === 'COMPLETED') return false;
  if (to === 'ISSUE') return true;
  if (from === 'ISSUE') return to !== 'ASSIGNED';
  return DRIVER_STEPS.indexOf(to) === DRIVER_STEPS.indexOf(from) + 1;
}

export function canTransition<S extends string>(map: Record<S, S[]>, from: S, to: S): boolean {
  return from !== to && (map[from] ?? []).includes(to);
}

/** Fields whose change on a confirmed record means the supplier must confirm again. */
export const RECONFIRM_FIELDS = {
  hotel:    ['hotelId', 'hotelName', 'roomTypeId', 'roomTypeName', 'mealPlan', 'checkIn', 'checkOut', 'rooms', 'adults', 'children'],
  vehicle:  ['vehicleId', 'vehicleType', 'startAt', 'endAt', 'pickupPoint', 'dropPoint', 'seatsRequired'],
  activity: ['activityId', 'name', 'date', 'time', 'adults', 'children'],
} as const;

export function needsReconfirmation(before: Record<string, unknown>, patch: Record<string, unknown>, fields: readonly string[]): string[] {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v === undefined ? undefined : JSON.stringify(v ?? null));
  return fields.filter(f => patch[f] !== undefined && norm(patch[f]) !== norm(before[f]));
}

// ── Scheduling conflicts ──────────────────────────────────────

export interface Slot { id?: string; vehicleId?: string | null; driverId?: string | null; startAt: string; endAt: string; label?: string }
export interface Conflict { with: Slot; resource: 'vehicle' | 'driver' }

/** Half-open intervals: a duty ending at 18:00 and one starting at 18:00 do not clash. */
export function overlaps(a: { startAt: string; endAt: string }, b: { startAt: string; endAt: string }): boolean {
  return Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(b.startAt) < Date.parse(a.endAt);
}

export function findScheduleConflicts(candidate: Slot, existing: Slot[]): Conflict[] {
  const out: Conflict[] = [];
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (!overlaps(candidate, e)) continue;
    if (candidate.vehicleId && e.vehicleId === candidate.vehicleId) out.push({ with: e, resource: 'vehicle' });
    if (candidate.driverId && e.driverId === candidate.driverId) out.push({ with: e, resource: 'driver' });
  }
  return out;
}

/** Nights between two YYYY-MM-DD dates (check-out exclusive). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const n = Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(n) ? n : 0;
}
