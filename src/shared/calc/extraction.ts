// ============================================================
// Turning what a document said into a proposal a person can check.
//
// Pure maths, no database: given the fields a model read and the records
// TravelOS already holds, work out
//   - which fields a person must look at (anything not read plainly)
//   - which trip, supplier or traveller this document most likely belongs to,
//     with the reason for the guess in words
//   - the record that would be created if the person approves
//
// Nothing here writes anything. A match below the confident threshold is
// offered as a suggestion, never applied on its own (hard rule 8).
// ============================================================

export type Confidence = 'high' | 'medium' | 'low';
export interface ExtractedField<T> { value: T | null; confidence: Confidence }

export const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
/** Below this, a person is asked; at or above it the value is shown as read. */
export const CONFIDENT: Confidence = 'high';

export const isField = (v: unknown): v is ExtractedField<unknown> =>
  !!v && typeof v === 'object' && 'value' in (v as object) && 'confidence' in (v as object);

/** A field that was not read plainly is one a person has to look at. */
export function needsCheck(f: ExtractedField<unknown> | undefined | null): boolean {
  if (!f) return true;
  return f.value === null || f.value === '' || CONFIDENCE_ORDER[f.confidence] < CONFIDENCE_ORDER[CONFIDENT];
}

export interface FieldSummary { total: number; read: number; toCheck: number; unreadable: string[] }

/** Walks a whole extraction (including arrays of rows) and counts what needs a person. */
export function summarise(extraction: unknown, path: string[] = []): FieldSummary {
  const out: FieldSummary = { total: 0, read: 0, toCheck: 0, unreadable: [] };
  const add = (s: FieldSummary) => { out.total += s.total; out.read += s.read; out.toCheck += s.toCheck; out.unreadable.push(...s.unreadable); };
  if (Array.isArray(extraction)) {
    extraction.forEach((row, i) => add(summarise(row, [...path, String(i + 1)])));
    return out;
  }
  if (isField(extraction)) {
    out.total = 1;
    if (needsCheck(extraction)) {
      out.toCheck = 1;
      if (extraction.value === null || extraction.value === '') out.unreadable.push(path.join(' '));
    } else out.read = 1;
    return out;
  }
  if (extraction && typeof extraction === 'object') {
    for (const [key, value] of Object.entries(extraction)) add(summarise(value, [...path, key]));
  }
  return out;
}

/** The value, or null when it should not be trusted without a person. */
export const valueOf = <T>(f: ExtractedField<T> | undefined | null): T | null => (f && f.value !== '' ? f.value : null);

// ── Matching ─────────────────────────────────────────────────

export interface MatchCandidate { id: string; label: string; score: number; why: string[] }

/** Names compare on letters only: "Shri  R. Patil" and "r patil" are the same person. */
export function normaliseName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 0–1: how much of the shorter name appears, word for word, in the longer one. */
export function nameOverlap(a: string | null | undefined, b: string | null | undefined): number {
  const wa = normaliseName(a).split(' ').filter(w => w.length > 1);
  const wb = normaliseName(b).split(' ').filter(w => w.length > 1);
  if (!wa.length || !wb.length) return 0;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const hits = short.filter(w => long.includes(w)).length;
  return hits / short.length;
}

export interface TripCandidate {
  id: string;
  label: string;
  customerName: string | null;
  destination: string | null;
  departure: string | null;
  returnDate: string | null;
  travellerNames: string[];
}

export interface TripMatchInput {
  /** Dates the document talks about — travel, check-in, bill date. */
  dates: (string | null)[];
  /** Names on the document: passengers, guests. */
  names: string[];
  /** Places on the document: cities, stations, hotel city. */
  places: (string | null)[];
}

const within = (day: string, from: string | null, to: string | null, slack = 2): boolean => {
  if (!from) return false;
  const d = Date.parse(day);
  const a = Date.parse(from) - slack * 86_400_000;
  const b = Date.parse(to ?? from) + slack * 86_400_000;
  return Number.isFinite(d) && d >= a && d <= b;
};

/**
 * Which trip this document most likely belongs to. Dates carry the most
 * weight, then the people named on it, then the place — the same way a
 * person in the office would work it out.
 */
export function matchTrip(input: TripMatchInput, trips: TripCandidate[]): MatchCandidate[] {
  const dates = input.dates.filter((d): d is string => !!d);
  const names = input.names.filter(Boolean);
  const places = input.places.filter((p): p is string => !!p);

  return trips.map(t => {
    const why: string[] = [];
    let score = 0;
    const inWindow = dates.filter(d => within(d, t.departure, t.returnDate)).length;
    if (inWindow) { score += 0.5 * (inWindow / dates.length); why.push(`travel dates fall inside ${t.label}`); }

    const nameHits = names.filter(n => t.travellerNames.some(tn => nameOverlap(n, tn) >= 0.5)).length;
    if (nameHits) { score += 0.3 * (nameHits / names.length); why.push(`${nameHits} of ${names.length} names travel on it`); }
    else if (names.length && t.customerName && names.some(n => nameOverlap(n, t.customerName) >= 0.5)) {
      score += 0.2; why.push('the booking is in that name');
    }

    if (places.some(p => nameOverlap(p, t.destination) >= 0.5)) { score += 0.2; why.push(`the place matches ${t.destination}`); }
    return { id: t.id, label: t.label, score: Math.min(1, score), why };
  }).filter(m => m.score > 0).sort((a, b) => b.score - a.score);
}

export interface VendorCandidate { id: string; name: string; gstin?: string | null }

/** A supplier is matched on GSTIN first — it is exact — then on the name. */
export function matchVendor(supplierName: string | null, gstin: string | null, vendors: VendorCandidate[]): MatchCandidate[] {
  return vendors.map(v => {
    const why: string[] = [];
    let score = 0;
    if (gstin && v.gstin && gstin.trim().toUpperCase() === v.gstin.trim().toUpperCase()) { score = 1; why.push('GSTIN is the same'); }
    else {
      const overlap = nameOverlap(supplierName, v.name);
      if (overlap >= 0.5) { score = 0.4 + 0.5 * overlap; why.push(`the name reads like ${v.name}`); }
    }
    return { id: v.id, name: v.name, score, why };
  }).filter(m => m.score > 0).map(m => ({ id: m.id, label: m.name, score: Math.min(1, m.score), why: m.why }))
    .sort((a, b) => b.score - a.score);
}

/** Only a match this strong is offered as already chosen; the rest are suggestions. */
export const STRONG_MATCH = 0.7;

export function bestMatch(matches: MatchCandidate[]): { chosen: MatchCandidate | null; suggestions: MatchCandidate[] } {
  const [first, ...rest] = matches;
  if (!first) return { chosen: null, suggestions: [] };
  const clear = first.score >= STRONG_MATCH && (!rest[0] || first.score - rest[0].score >= 0.15);
  return { chosen: clear ? first : null, suggestions: matches.slice(0, 5) };
}

// ── Proposals ────────────────────────────────────────────────

/** An ISO timestamp from a date and a time the document showed, in IST. */
export function istTimestamp(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const t = /^\d{2}:\d{2}$/.test(time ?? '') ? time : '00:00';
  return `${date}T${t}:00+05:30`;
}

export interface TicketProposal {
  mode: 'FLIGHT' | 'TRAIN' | 'BUS';
  pnr: string | null;
  airline: string | null;
  travelClass: string | null;
  quota: string | null;
  segments: { fromName: string; toName: string; fromCode: string | null; toCode: string | null; departAt: string | null; arriveAt: string | null; serviceNumber: string | null; travelClass: string | null }[];
  passengers: { name: string; age: number | null; gender: string | null; seat: string | null; status: string | null }[];
  fare: number | null;
}

/** The ticket that would be created — the same shape the ticket form fills in. */
export function ticketProposal(x: Record<string, unknown>): TicketProposal {
  const f = x as {
    mode?: ExtractedField<'FLIGHT' | 'TRAIN' | 'BUS'>; pnr?: ExtractedField<string>; airlineOrOperator?: ExtractedField<string>;
    travelClass?: ExtractedField<string>; quota?: ExtractedField<string>; fare?: ExtractedField<number>;
    segments?: Record<string, ExtractedField<string>>[]; passengers?: Record<string, ExtractedField<string | number>>[];
  };
  return {
    mode: valueOf(f.mode) ?? 'FLIGHT',
    pnr: valueOf(f.pnr),
    airline: valueOf(f.airlineOrOperator),
    travelClass: valueOf(f.travelClass),
    quota: valueOf(f.quota),
    fare: valueOf(f.fare),
    segments: (f.segments ?? []).map(s => ({
      fromName: (valueOf(s.fromName) as string) ?? (valueOf(s.fromCode) as string) ?? '',
      toName: (valueOf(s.toName) as string) ?? (valueOf(s.toCode) as string) ?? '',
      fromCode: valueOf(s.fromCode) as string | null,
      toCode: valueOf(s.toCode) as string | null,
      departAt: istTimestamp(valueOf(s.departDate) as string | null, valueOf(s.departTime) as string | null),
      arriveAt: istTimestamp(valueOf(s.arriveDate) as string | null, valueOf(s.arriveTime) as string | null),
      serviceNumber: valueOf(s.serviceNumber) as string | null,
      travelClass: valueOf(s.travelClass) as string | null,
    })).filter(s => s.fromName && s.toName),
    passengers: (f.passengers ?? []).map(p => ({
      name: (valueOf(p.name) as string) ?? '',
      age: valueOf(p.age) as number | null,
      gender: valueOf(p.gender) as string | null,
      seat: valueOf(p.seat) as string | null,
      status: valueOf(p.status) as string | null,
    })).filter(p => p.name),
  };
}

export interface HotelProposal {
  hotelName: string; city: string | null; confirmationNo: string | null;
  checkIn: string | null; checkOut: string | null; rooms: number; roomType: string | null; mealPlan: string | null;
  guests: string[]; totalAmount: number | null;
}

export function hotelProposal(x: Record<string, unknown>): HotelProposal {
  const f = x as {
    hotelName?: ExtractedField<string>; city?: ExtractedField<string>; confirmationNo?: ExtractedField<string>;
    checkIn?: ExtractedField<string>; checkOut?: ExtractedField<string>; rooms?: ExtractedField<number>;
    roomType?: ExtractedField<string>; mealPlan?: ExtractedField<string>; totalAmount?: ExtractedField<number>;
    guestNames?: ExtractedField<string>[];
  };
  return {
    hotelName: valueOf(f.hotelName) ?? '',
    city: valueOf(f.city),
    confirmationNo: valueOf(f.confirmationNo),
    checkIn: valueOf(f.checkIn),
    checkOut: valueOf(f.checkOut),
    rooms: valueOf(f.rooms) ?? 1,
    roomType: valueOf(f.roomType),
    mealPlan: valueOf(f.mealPlan),
    guests: (f.guestNames ?? []).map(g => valueOf(g)).filter((g): g is string => !!g),
    totalAmount: valueOf(f.totalAmount),
  };
}

export interface BillProposal {
  supplierName: string | null; gstin: string | null; billNumber: string | null;
  billDate: string | null; dueDate: string | null; description: string | null;
  taxableAmount: number | null; gstAmount: number | null; totalAmount: number | null;
}

export function billProposal(x: Record<string, unknown>): BillProposal {
  const f = x as Record<string, ExtractedField<string | number> | undefined>;
  const num = (k: string) => valueOf(f[k]) as number | null;
  const str = (k: string) => valueOf(f[k]) as string | null;
  return {
    supplierName: str('supplierName'), gstin: str('supplierGstin'), billNumber: str('billNumber'),
    billDate: str('billDate'), dueDate: str('dueDate'), description: str('description'),
    taxableAmount: num('taxableAmount'), gstAmount: num('gstAmount'), totalAmount: num('totalAmount'),
  };
}

/**
 * A bill's own numbers must add up before it can be saved: the model may have
 * read one figure wrongly, and money is never adjusted quietly.
 */
export function billAddsUp(p: BillProposal, tolerance = 1): boolean {
  if (p.totalAmount === null) return false;
  if (p.taxableAmount === null && p.gstAmount === null) return true;
  const parts = (p.taxableAmount ?? 0) + (p.gstAmount ?? 0);
  return Math.abs(parts - p.totalAmount) <= tolerance;
}
