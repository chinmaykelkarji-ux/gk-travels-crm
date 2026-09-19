// Trip lifecycle: PLANNING → CONFIRMING → READY → ONGOING → COMPLETED, or
// CANCELLED. Moving forward is gated by checks computed from the trip's real
// records (a trip cannot be READY with an unconfirmed hotel). Pure: the
// server builds the snapshot, the SPA shows the same checks.

export type TripStage = 'PLANNING' | 'CONFIRMING' | 'READY' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';

export const TRIP_STAGES: TripStage[] = ['PLANNING', 'CONFIRMING', 'READY', 'ONGOING', 'COMPLETED', 'CANCELLED'];

export const STAGE_TRANSITIONS: Record<TripStage, TripStage[]> = {
  PLANNING:   ['CONFIRMING', 'CANCELLED'],
  CONFIRMING: ['PLANNING', 'READY', 'CANCELLED'],
  READY:      ['CONFIRMING', 'ONGOING', 'CANCELLED'],
  ONGOING:    ['COMPLETED'],
  COMPLETED:  [],
  CANCELLED:  ['PLANNING'],
};

export const STAGE_LABEL: Record<TripStage, string> = {
  PLANNING: 'Planning', CONFIRMING: 'Confirming', READY: 'Ready', ONGOING: 'On tour', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

export interface TripSnapshot {
  stage: TripStage;
  departure: string | null;   // YYYY-MM-DD
  returnDate: string | null;
  isInternational: boolean;
  travellers: number;
  hotels:     { status: string; label: string }[];
  vehicles:   { status: string; label: string; hasVehicle: boolean; hasDriver: boolean }[];
  activities: { status: string; label: string }[];
  tickets:    { status: string; label: string }[];
  passportProblems: string[];  // traveller names with expired / < 6 months passports
  /** Itinerary state; absent in callers that do not track it. */
  itinerary?: { exists: boolean; shared: boolean; changedSinceShared: boolean };
}

export type CheckSeverity = 'block' | 'warn';
export interface Check { code: string; severity: CheckSeverity; message: string; items?: string[] }

const open = (s: string) => s !== 'CANCELLED';

/** What stands between the trip and READY (blocks) plus things worth a look (warnings). */
export function readinessChecks(t: TripSnapshot): Check[] {
  const out: Check[] = [];
  if (!t.departure) out.push({ code: 'NO_DATES', severity: 'block', message: 'Set the departure date' });
  if (t.travellers === 0) out.push({ code: 'NO_TRAVELLERS', severity: 'block', message: 'Add the travellers' });
  const pending = (rows: { status: string; label: string }[], ok: string[]) => rows.filter(r => open(r.status) && !ok.includes(r.status)).map(r => r.label);
  const h = pending(t.hotels, ['CONFIRMED']);
  if (h.length) out.push({ code: 'HOTEL_UNCONFIRMED', severity: 'block', message: `${h.length} hotel booking(s) not confirmed`, items: h });
  const v = pending(t.vehicles, ['CONFIRMED', 'COMPLETED']);
  if (v.length) out.push({ code: 'VEHICLE_UNCONFIRMED', severity: 'block', message: `${v.length} vehicle duty(ies) not confirmed`, items: v });
  const noDriver = t.vehicles.filter(x => (x.status === 'CONFIRMED') && !x.hasDriver).map(x => x.label);
  if (noDriver.length) out.push({ code: 'VEHICLE_NO_DRIVER', severity: 'block', message: `${noDriver.length} confirmed duty(ies) without a driver`, items: noDriver });
  const a = pending(t.activities, ['CONFIRMED']);
  if (a.length) out.push({ code: 'ACTIVITY_UNCONFIRMED', severity: 'block', message: `${a.length} activity booking(s) not confirmed`, items: a });
  const unbooked = t.tickets.filter(x => x.status === 'REQUESTED' || x.status === 'ON_HOLD').map(x => x.label);
  if (unbooked.length) out.push({ code: 'TICKET_NOT_BOOKED', severity: 'block', message: `${unbooked.length} ticket(s) not booked yet`, items: unbooked });
  const wl = t.tickets.filter(x => x.status === 'WAITLISTED' || x.status === 'RAC' || x.status === 'PARTIAL').map(x => x.label);
  if (wl.length) out.push({ code: 'TICKET_WAITLISTED', severity: 'warn', message: `${wl.length} ticket(s) still waitlisted or RAC`, items: wl });
  if (t.isInternational && t.passportProblems.length) out.push({ code: 'PASSPORT', severity: 'block', message: `${t.passportProblems.length} passport(s) expired or short of six months`, items: t.passportProblems });
  if (t.itinerary && !t.itinerary.exists) out.push({ code: 'ITINERARY_MISSING', severity: 'warn', message: 'No itinerary yet' });
  else if (t.itinerary && !t.itinerary.shared) out.push({ code: 'ITINERARY_NOT_SHARED', severity: 'warn', message: 'Itinerary not yet shared with the customer' });
  else if (t.itinerary?.changedSinceShared) out.push({ code: 'ITINERARY_CHANGED', severity: 'warn', message: 'Itinerary changed since the customer last got it' });
  const anything = [...t.hotels, ...t.vehicles, ...t.activities, ...t.tickets].some(r => open(r.status));
  if (!anything) out.push({ code: 'NOTHING_BOOKED', severity: 'warn', message: 'No hotel, transport, activity or ticket on this trip' });
  return out;
}

export interface TransitionResult { allowed: boolean; blockers: Check[]; warnings: Check[] }

/** Whether `from → to` may happen today, and why not. */
export function evaluateTransition(t: TripSnapshot, to: TripStage, today: string): TransitionResult {
  const blockers: Check[] = [];
  const warnings: Check[] = [];
  if (!(STAGE_TRANSITIONS[t.stage] ?? []).includes(to)) {
    return { allowed: false, blockers: [{ code: 'NOT_ALLOWED', severity: 'block', message: `A trip cannot go from ${STAGE_LABEL[t.stage].toLowerCase()} to ${STAGE_LABEL[to].toLowerCase()}` }], warnings };
  }
  const checks = readinessChecks(t);
  switch (to) {
    case 'CONFIRMING':
      blockers.push(...checks.filter(c => c.code === 'NO_DATES'));
      warnings.push(...checks.filter(c => c.code === 'NO_TRAVELLERS'));
      break;
    case 'READY':
      blockers.push(...checks.filter(c => c.severity === 'block'));
      warnings.push(...checks.filter(c => c.severity === 'warn'));
      break;
    case 'ONGOING':
      if (t.departure && today < t.departure) blockers.push({ code: 'NOT_STARTED', severity: 'block', message: `The trip starts on ${t.departure}` });
      break;
    case 'COMPLETED': {
      const end = t.returnDate ?? t.departure;
      if (end && today < end) blockers.push({ code: 'NOT_FINISHED', severity: 'block', message: `The trip ends on ${end}` });
      break;
    }
    default:
      break;
  }
  return { allowed: blockers.length === 0, blockers, warnings };
}

/** The classic screens still read trips.status; keep it in step with the stage. */
export function legacyStatusFor(stage: TripStage, hasContract: boolean): string {
  switch (stage) {
    case 'PLANNING':   return hasContract ? 'confirmed' : 'draft';
    case 'CONFIRMING':
    case 'READY':      return 'confirmed';
    case 'ONGOING':    return 'in_progress';
    case 'COMPLETED':  return 'completed';
    case 'CANCELLED':  return 'cancelled';
  }
}

/** A classic-screen status edit mapped onto the stage (null = leave the stage alone). */
export function stageForLegacyStatus(status: string, current: TripStage): TripStage | null {
  switch (status) {
    case 'draft':
    case 'quotation':   return current === 'PLANNING' ? null : 'PLANNING';
    case 'confirmed':   return current === 'CONFIRMING' || current === 'READY' ? null : 'CONFIRMING';
    case 'in_progress': return current === 'ONGOING' ? null : 'ONGOING';
    case 'completed':   return current === 'COMPLETED' ? null : 'COMPLETED';
    case 'cancelled':   return current === 'CANCELLED' ? null : 'CANCELLED';
    default:            return null;
  }
}
