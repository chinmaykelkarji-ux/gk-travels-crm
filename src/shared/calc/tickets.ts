// Flight / train / bus tickets: fare totals, ticket status from passenger
// rows, Indian Railways status strings, Tatkal windows and chart timing.
// Pure; the timings used by the task engine are parameters, not constants,
// because IRCTC changes them (defaults are labelled "verify" in settings).

import { pctOf, sumPaise, toPaise, toRupees } from './money';
import { addDays, parseIst } from './istTime';

export type TicketMode = 'FLIGHT' | 'TRAIN' | 'BUS';
export type TicketStatus = 'REQUESTED' | 'ON_HOLD' | 'CONFIRMED' | 'PARTIAL' | 'WAITLISTED' | 'RAC' | 'CANCELLED';
export type PassengerStatus = 'PENDING' | 'CONFIRMED' | 'WAITLISTED' | 'RAC' | 'CANCELLED';

// ── Fare ──────────────────────────────────────────────────────

export interface FareInput { baseFare?: number | null; taxes?: number | null; otherCharges?: number | null; serviceFee?: number | null; serviceFeeGstPct?: number | null }
export interface FareTotals { serviceFeeGst: number; total: number; fareOnly: number }

/** Customer total = base + taxes + other charges + our service fee + GST on that fee. */
export function fareTotals(f: FareInput): FareTotals {
  const fee = toPaise(f.serviceFee);
  const feeGst = pctOf(fee, Number(f.serviceFeeGstPct ?? 0));
  const fareOnly = sumPaise([toPaise(f.baseFare), toPaise(f.taxes), toPaise(f.otherCharges)]);
  return { serviceFeeGst: toRupees(feeGst), total: toRupees(fareOnly + fee + feeGst), fareOnly: toRupees(fareOnly) };
}

// ── Status ────────────────────────────────────────────────────

/**
 * Ticket status from its passenger rows (all segments). Before anything is
 * booked the ticket keeps its manual REQUESTED / ON_HOLD status.
 */
export function deriveTicketStatus(rows: PassengerStatus[], current: TicketStatus = 'REQUESTED'): TicketStatus {
  if (!rows.length) return current === 'CANCELLED' ? 'CANCELLED' : current === 'ON_HOLD' ? 'ON_HOLD' : 'REQUESTED';
  const active = rows.filter(r => r !== 'CANCELLED');
  if (!active.length) return 'CANCELLED';
  if (active.some(r => r === 'PENDING')) return current === 'ON_HOLD' ? 'ON_HOLD' : 'REQUESTED';
  const cnf = active.filter(r => r === 'CONFIRMED').length;
  if (cnf === active.length) return 'CONFIRMED';
  if (cnf > 0) return 'PARTIAL';
  return active.some(r => r === 'WAITLISTED') ? 'WAITLISTED' : 'RAC';
}

export interface RailStatus { status: PassengerStatus; position: number | null; coach: string | null; berth: string | null; berthType: string | null }

const WL = /^(?:GN|RL|PQ|TQ|RS|RQ|CK|NO)?WL\s*\/?\s*(\d+)/;

/**
 * Reads what IRCTC shows: "WL 12", "GNWL 45", "TQWL 3", "RAC 17", "RAC/S5/33",
 * "CNF/B2/34/LB", "CNF B2 34", "B2 34", "CAN". Unknown text returns null so
 * the caller can ask a person rather than guess.
 */
export function parseRailStatus(raw: string): RailStatus | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (/^(CAN|CANCELLED|CNL)\b/.test(s)) return { status: 'CANCELLED', position: null, coach: null, berth: null, berthType: null };
  const wl = s.replace(/\s/g, '').match(WL);
  if (wl) return { status: 'WAITLISTED', position: Number(wl[1]), coach: null, berth: null, berthType: null };
  const rac = s.match(/^RAC[ /]*(\d+)$/) ?? s.match(/^RAC[ /]+([A-Z]{1,2}\d{1,2})[ /]+(\d{1,3})/);
  if (rac) return rac.length === 2 ? { status: 'RAC', position: Number(rac[1]), coach: null, berth: null, berthType: null } : { status: 'RAC', position: null, coach: rac[1], berth: rac[2], berthType: null };
  const cnf = s.match(/^(?:CNF|CONFIRMED)?[ /]*([A-Z]{1,2}\d{1,2}|GN|D\d{1,2})[ /]+(\d{1,3})(?:[ /]+([A-Z]{2}))?$/);
  if (cnf) return { status: 'CONFIRMED', position: null, coach: cnf[1], berth: cnf[2], berthType: cnf[3] ?? null };
  if (/^(CNF|CONFIRMED)$/.test(s)) return { status: 'CONFIRMED', position: null, coach: null, berth: null, berthType: null };
  return null;
}

// ── Train timings (parameters come from task-rule settings) ───

export const AC_CLASSES = new Set(['1A', '2A', '3A', '3E', 'CC', 'EC', 'EA']);

/**
 * Tatkal opens the day before the journey from the originating station:
 * AC classes at acHour, non-AC at nonAcHour (IST). Returns an ISO instant.
 */
export function tatkalOpensAt(journeyDay: string, travelClass: string | null | undefined, acHour = 10, nonAcHour = 11): string {
  const hour = travelClass && AC_CLASSES.has(travelClass.toUpperCase()) ? acHour : nonAcHour;
  return parseIst(`${addDays(journeyDay, -1)}T${String(hour).padStart(2, '0')}:00`)!.toISOString();
}

/** First reservation chart, `hoursBefore` departure (IRCTC has changed this; keep it a setting). */
export function chartPreparedAt(departAtIso: string, hoursBefore = 8): string {
  return new Date(Date.parse(departAtIso) - hoursBefore * 3_600_000).toISOString();
}

/** Airline web check-in opens `hoursBefore` departure (48 h is common for Indian carriers; per-rule setting). */
export function webCheckInOpensAt(departAtIso: string, hoursBefore = 48): string {
  return new Date(Date.parse(departAtIso) - hoursBefore * 3_600_000).toISOString();
}
