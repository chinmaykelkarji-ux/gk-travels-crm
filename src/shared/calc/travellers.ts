// Traveller rules shared by the SPA and the API. Pure, dependency-free.
//
// Age bands follow the airline convention used on Indian carriers and most
// international ones: infant < 2, child 2–11, adult 12+ on the date of travel.

export type AgeBand = 'ADULT' | 'CHILD' | 'INFANT';
export type PassportStatus = 'OK' | 'EXPIRING' | 'INSUFFICIENT' | 'EXPIRED' | 'UNKNOWN';

const DAY_MS = 86_400_000;

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole years between dob and `on` (default today). Null if dob is missing/invalid. */
export function ageOn(dob: string | null | undefined, on: string | Date = new Date()): number | null {
  const birth = parseDate(dob);
  const at = typeof on === 'string' ? parseDate(on) : on;
  if (!birth || !at || at < birth) return null;
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = at.getUTCMonth() < birth.getUTCMonth() || (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

export function ageBand(dob: string | null | undefined, travelDate: string | Date = new Date()): AgeBand | null {
  const age = ageOn(dob, travelDate);
  if (age === null) return null;
  if (age < 2) return 'INFANT';
  if (age < 12) return 'CHILD';
  return 'ADULT';
}

/**
 * Passport validity for a trip. Most destinations require six months' validity
 * beyond the travel date ("INSUFFICIENT" when that is not met). "EXPIRING"
 * flags passports that run out within `warnDays` of today even without a trip.
 */
export function passportStatus(
  expiry: string | null | undefined,
  opts: { travelDate?: string | null; today?: Date; requiredMonths?: number; warnDays?: number } = {},
): PassportStatus {
  const exp = parseDate(expiry);
  if (!exp) return 'UNKNOWN';
  const today = opts.today ?? new Date();
  const requiredMonths = opts.requiredMonths ?? 6;
  const warnDays = opts.warnDays ?? 180;
  if (exp.getTime() < today.getTime() - DAY_MS) return 'EXPIRED';
  const travel = parseDate(opts.travelDate);
  if (travel) {
    const required = new Date(Date.UTC(travel.getUTCFullYear(), travel.getUTCMonth() + requiredMonths, travel.getUTCDate()));
    if (exp < required) return 'INSUFFICIENT';
  }
  if ((exp.getTime() - today.getTime()) / DAY_MS <= warnDays) return 'EXPIRING';
  return 'OK';
}

export function daysUntilExpiry(expiry: string | null | undefined, today: Date = new Date()): number | null {
  const exp = parseDate(expiry);
  if (!exp) return null;
  return Math.floor((exp.getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / DAY_MS);
}

export function travellerDisplayName(t: { title?: string | null; firstName: string; lastName?: string | null; displayName?: string | null }): string {
  if (t.displayName) return t.displayName;
  return [t.title, t.firstName, t.lastName].filter(Boolean).join(' ').trim();
}

/** Counts per band for a traveller list on a given travel date. */
export function paxBreakdown(travellers: { dateOfBirth?: string | null; role?: string | null }[], travelDate?: string | null) {
  const out = { adults: 0, children: 0, infants: 0, unknown: 0 };
  for (const t of travellers) {
    const band = (t.role === 'ADULT' || t.role === 'CHILD' || t.role === 'INFANT') ? t.role : ageBand(t.dateOfBirth, travelDate ?? new Date());
    if (band === 'ADULT') out.adults++;
    else if (band === 'CHILD') out.children++;
    else if (band === 'INFANT') out.infants++;
    else out.unknown++;
  }
  return out;
}
