// ============================================================
// Itinerary v2 — pure rules shared by the API and the builder.
//
//   planDays / alignDays   days follow the trip dates
//   bookingItems           hotel, vehicle, activity and ticket records →
//                          customer-safe day items (never vendor, cost or
//                          internal notes)
//   syncPlan               what a "sync with bookings" adds, moves, removes
//   toCustomerItinerary    the ONLY way an itinerary leaves the office: an
//                          explicit allowlist, so a new internal field can
//                          never leak by default
//   itineraryAsText        WhatsApp-ready text built from the customer copy
// ============================================================

import { addDays } from './istTime';

export const ITEM_KINDS = ['TRAVEL', 'TRANSFER', 'STAY', 'SIGHTSEEING', 'ACTIVITY', 'MEAL', 'FREE_TIME', 'NOTE'] as const;
export type ItemKind = typeof ITEM_KINDS[number];
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  TRAVEL: 'Travel', TRANSFER: 'Transfer', STAY: 'Hotel', SIGHTSEEING: 'Visit / darshan', ACTIVITY: 'Activity', MEAL: 'Meal', FREE_TIME: 'Free time', NOTE: 'Note',
};
export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = typeof MEALS[number];
export const SOURCE_TYPES = ['HOTEL_IN', 'HOTEL_OUT', 'VEHICLE', 'ACTIVITY', 'SEGMENT'] as const;
export type SourceType = typeof SOURCE_TYPES[number];
export const MAX_DAYS = 60;

// ── Staff document ────────────────────────────────────────────

export interface ItemDoc {
  id?: string; time: string | null; kind: ItemKind; title: string; details: string | null;
  internalNote: string | null; internalCost: number | null; customerVisible: boolean;
  sourceType: SourceType | null; sourceId: string | null;
}
export interface DayDoc {
  id?: string; dayNumber: number; date: string | null; title: string;
  morning: string | null; afternoon: string | null; evening: string | null;
  hotelName: string | null; hotelAddress: string | null; meals: string[]; transfers: string | null;
  notes: string | null; internalNotes: string | null; items: ItemDoc[];
}
export interface ItineraryDoc {
  id: string; tripId: string | null; title: string; destination: string; customerName: string;
  startDate: string | null; endDate: string | null; pax: number; revision: number;
  notes: string | null; internalNotes: string | null; emergencyContact: string | null; days: DayDoc[];
}

// ── Days follow the trip ──────────────────────────────────────

/** Day numbers and dates from departure to return (inclusive). */
export function planDays(start: string | null, end: string | null): { dayNumber: number; date: string }[] {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const out: { dayNumber: number; date: string }[] = [];
  for (let d = start, i = 1; d <= last && i <= MAX_DAYS; d = addDays(d, 1), i++) out.push({ dayNumber: i, date: d });
  return out;
}

export function dayNumberFor(start: string | null, date: string | null): number | null {
  if (!start || !date || date < start) return null;
  let n = 1;
  for (let d = start; d < date; d = addDays(d, 1)) if (++n > MAX_DAYS) return null;
  return n;
}

const blank = (v: string | null | undefined) => !v || !v.trim();

/** A day with nothing written on it and no items. */
export function isEmptyDay(d: Pick<DayDoc, 'morning' | 'afternoon' | 'evening' | 'hotelName' | 'transfers' | 'notes' | 'internalNotes' | 'items'>): boolean {
  return d.items.length === 0 && [d.morning, d.afternoon, d.evening, d.hotelName, d.transfers, d.notes, d.internalNotes].every(blank);
}

export const defaultDayTitle = (n: number) => `Day ${n}`;

/**
 * Re-date days after the trip dates change: dates follow day numbers, missing
 * days are appended, empty days past the end are dropped and non-empty ones
 * kept (reported so a person decides).
 */
export function alignDays<D extends Pick<DayDoc, 'dayNumber' | 'date' | 'morning' | 'afternoon' | 'evening' | 'hotelName' | 'transfers' | 'notes' | 'internalNotes' | 'items'>>(days: D[], start: string | null, end: string | null) {
  const plan = planDays(start, end);
  if (!plan.length) return { keep: days, add: [] as { dayNumber: number; date: string }[], drop: [] as D[], beyond: [] as D[] };
  const byNumber = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const keep: D[] = [], drop: D[] = [], beyond: D[] = [];
  for (const d of byNumber) {
    const date = d.dayNumber <= MAX_DAYS ? addDays(start!, d.dayNumber - 1) : null;
    if (d.dayNumber <= plan.length) keep.push({ ...d, date });
    else if (isEmptyDay(d)) drop.push(d);
    else { beyond.push(d); keep.push({ ...d, date }); }
  }
  const have = new Set(keep.map(d => d.dayNumber));
  return { keep, add: plan.filter(p => !have.has(p.dayNumber)), drop, beyond };
}

/** Items in a day: timed ones by time, then untimed in the order given. */
export function sortItems<T extends { time?: string | null }>(items: T[]): T[] {
  return items.map((it, i) => ({ it, i })).sort((a, b) => {
    const ta = a.it.time ?? '~', tb = b.it.time ?? '~';
    return ta < tb ? -1 : ta > tb ? 1 : a.i - b.i;
  }).map(x => x.it);
}

// ── Bookings → proposed items ─────────────────────────────────

export interface BookingSources {
  hotels: { id: string; hotelName: string; city: string | null; address: string | null; roomTypeName: string | null; mealPlan: string | null; checkIn: string; checkOut: string; rooms: number; status: string; confirmationNo: string | null; customerNotes: string | null }[];
  vehicles: { id: string; startLocal: string; endLocal: string; pickupPoint: string | null; dropPoint: string | null; route: string | null; vehicleType: string | null; vehicleRegNo: string | null; driverName: string | null; driverPhone: string | null; status: string; customerNotes: string | null }[];
  activities: { id: string; name: string; city: string | null; date: string; time: string | null; status: string; confirmationNo: string | null; customerNotes: string | null }[];
  segments: { id: string; mode: string; carrier: string | null; carrierName: string | null; carrierNumber: string | null; fromName: string; toName: string; departLocal: string | null; arriveLocal: string | null; pnr: string | null; travelClass: string | null; boardingPoint: string | null; ticketStatus: string }[];
}

export interface ProposedItem { sourceType: SourceType; sourceId: string; date: string; time: string | null; kind: ItemKind; title: string; details: string | null }
export interface ProposedStay { date: string; hotelName: string; hotelAddress: string | null }

const MEAL_PLAN_TEXT: Record<string, string> = { EP: 'Room only', CP: 'With breakfast', MAP: 'Breakfast and one main meal', AP: 'All meals' };
const MODE_TEXT: Record<string, string> = { FLIGHT: 'Flight', TRAIN: 'Train', BUS: 'Bus' };
const TICKET_STATUS_TEXT: Record<string, string> = { WAITLISTED: 'Waitlisted', RAC: 'RAC', PARTIAL: 'Partly confirmed', REQUESTED: 'Booking in progress', ON_HOLD: 'Booking in progress' };
const join = (parts: (string | null | undefined | false)[], sep = ' · ') => parts.filter(Boolean).join(sep) || null;
const clock = (local: string | null) => (local && local.length >= 16 ? local.slice(11, 16) : null);
const dayOf = (local: string | null) => (local ? local.slice(0, 10) : null);

/** Customer-safe items from the trip's records. Cancelled records propose nothing. */
export function bookingItems(src: BookingSources): { items: ProposedItem[]; stays: ProposedStay[] } {
  const items: ProposedItem[] = [];
  const stays: ProposedStay[] = [];
  for (const h of src.hotels.filter(x => x.status !== 'CANCELLED')) {
    const where = join([h.hotelName, h.city], ', ')!;
    items.push({ sourceType: 'HOTEL_IN', sourceId: h.id, date: h.checkIn, time: null, kind: 'STAY', title: `Check-in: ${where}`,
      details: join([h.roomTypeName && `${h.rooms > 1 ? `${h.rooms} × ` : ''}${h.roomTypeName}`, h.mealPlan && MEAL_PLAN_TEXT[h.mealPlan], h.confirmationNo && `Confirmation ${h.confirmationNo}`, h.customerNotes]) });
    if (h.checkOut > h.checkIn) items.push({ sourceType: 'HOTEL_OUT', sourceId: h.id, date: h.checkOut, time: null, kind: 'STAY', title: `Check-out: ${h.hotelName}`, details: null });
    for (let d = h.checkIn; d < h.checkOut; d = addDays(d, 1)) stays.push({ date: d, hotelName: h.hotelName, hotelAddress: h.address ?? h.city });
  }
  for (const v of src.vehicles.filter(x => x.status !== 'CANCELLED')) {
    const leg = v.pickupPoint || v.dropPoint ? join([v.pickupPoint, v.dropPoint], ' → ') : v.route;
    const endDay = dayOf(v.endLocal);
    items.push({ sourceType: 'VEHICLE', sourceId: v.id, date: dayOf(v.startLocal)!, time: clock(v.startLocal), kind: 'TRANSFER',
      title: leg ? `Pickup: ${leg}` : `${v.vehicleType ?? 'Vehicle'} at your service`,
      details: join([join([v.vehicleType, v.vehicleRegNo], ' '), v.driverName && `Driver ${v.driverName}${v.driverPhone ? ` (${v.driverPhone})` : ''}`, endDay && endDay > dayOf(v.startLocal)! && `With you until ${endDay}`, v.customerNotes]) });
  }
  for (const a of src.activities.filter(x => x.status !== 'CANCELLED')) {
    items.push({ sourceType: 'ACTIVITY', sourceId: a.id, date: a.date, time: a.time, kind: 'ACTIVITY', title: join([a.name, a.city], ', ')!,
      details: join([a.confirmationNo && `Ref ${a.confirmationNo}`, a.customerNotes]) });
  }
  for (const s of src.segments.filter(x => x.ticketStatus !== 'CANCELLED' && x.departLocal)) {
    const service = join([MODE_TEXT[s.mode] ?? s.mode, s.carrierName ?? s.carrier, s.carrierNumber], ' ');
    const arrive = s.arriveLocal ? `arrives ${dayOf(s.arriveLocal) === dayOf(s.departLocal) ? clock(s.arriveLocal) : `${dayOf(s.arriveLocal)} ${clock(s.arriveLocal)}`}` : null;
    items.push({ sourceType: 'SEGMENT', sourceId: s.id, date: dayOf(s.departLocal)!, time: clock(s.departLocal), kind: 'TRAVEL', title: `${service}: ${s.fromName} → ${s.toName}`,
      details: join([arrive && `Departs ${clock(s.departLocal)}, ${arrive}`, s.pnr && `PNR ${s.pnr}`, s.travelClass && `Class ${s.travelClass}`, s.boardingPoint && `Boarding at ${s.boardingPoint}`, TICKET_STATUS_TEXT[s.ticketStatus] && `Status: ${TICKET_STATUS_TEXT[s.ticketStatus]}`]) });
  }
  return { items, stays };
}

export interface ExistingLinked { id: string; sourceType: string; sourceId: string; dayNumber: number; time: string | null; kind: string; title: string; details: string | null }
export interface SyncPlan {
  add: (ProposedItem & { dayNumber: number })[];
  update: { id: string; dayNumber: number; time: string | null; kind: ItemKind; title: string; details: string | null }[];
  remove: string[];
  unplaced: ProposedItem[];
  stays: (ProposedStay & { dayNumber: number })[];
}

/**
 * Booking-linked items follow their booking: new ones are added, moved or
 * changed ones updated (their customer text is generated, never typed),
 * and ones whose booking is cancelled or gone are removed. Manual items
 * are never touched. Records outside the itinerary's days are reported.
 */
export function syncPlan(existing: ExistingLinked[], proposed: ProposedItem[], stays: ProposedStay[], start: string | null, dayCount: number): SyncPlan {
  const key = (t: string, id: string) => `${t}:${id}`;
  const have = new Map(existing.map(e => [key(e.sourceType, e.sourceId), e]));
  const plan: SyncPlan = { add: [], update: [], remove: [], unplaced: [], stays: [] };
  const seen = new Set<string>();
  for (const p of proposed) {
    const n = dayNumberFor(start, p.date);
    const k = key(p.sourceType, p.sourceId);
    seen.add(k);
    const e = have.get(k);
    if (n === null || n > dayCount) { plan.unplaced.push(p); if (e) plan.remove.push(e.id); continue; }
    if (!e) { plan.add.push({ ...p, dayNumber: n }); continue; }
    if (e.dayNumber !== n || e.time !== p.time || e.kind !== p.kind || e.title !== p.title || e.details !== p.details) {
      plan.update.push({ id: e.id, dayNumber: n, time: p.time, kind: p.kind, title: p.title, details: p.details });
    }
  }
  for (const e of existing) if (!seen.has(key(e.sourceType, e.sourceId))) plan.remove.push(e.id);
  for (const s of stays) {
    const n = dayNumberFor(start, s.date);
    if (n !== null && n <= dayCount) plan.stays.push({ ...s, dayNumber: n });
  }
  return plan;
}

// ── Customer copy ─────────────────────────────────────────────

export interface CustomerItem { time: string | null; kind: ItemKind; kindLabel: string; title: string; details: string | null }
export interface CustomerDay {
  dayNumber: number; date: string | null; title: string; morning: string | null; afternoon: string | null; evening: string | null;
  hotelName: string | null; hotelAddress: string | null; meals: Meal[]; transfers: string | null; notes: string | null; items: CustomerItem[];
}
export interface CustomerPickup { name: string; landmark: string | null; address: string | null; time: string | null; contactName: string | null; contactPhone: string | null; mapUrl: string | null }
export interface CustomerCompany { name: string; phone: string | null; email: string | null; website: string | null; address: string | null; logoUrl: string | null }
export interface CustomerItinerary {
  id: string; tripRef: string | null; version: number; title: string; destination: string; travellerName: string;
  startDate: string | null; endDate: string | null; pax: number; notes: string | null; emergencyContact: string | null;
  pickupPoints: CustomerPickup[]; days: CustomerDay[]; company: CustomerCompany;
}

const text = (v: string | null | undefined) => (blank(v) ? null : v!.trim());

/** Builds the customer copy field by field. Internal notes, costs, sources and hidden items are never read. */
export function toCustomerItinerary(doc: ItineraryDoc, ctx: { pickupPoints: CustomerPickup[]; company: CustomerCompany }): CustomerItinerary {
  return {
    id: doc.id, tripRef: doc.tripId, version: doc.revision, title: doc.title, destination: doc.destination, travellerName: doc.customerName,
    startDate: doc.startDate, endDate: doc.endDate, pax: doc.pax, notes: text(doc.notes), emergencyContact: text(doc.emergencyContact),
    pickupPoints: ctx.pickupPoints.map(p => ({ name: p.name, landmark: text(p.landmark), address: text(p.address), time: p.time, contactName: text(p.contactName), contactPhone: text(p.contactPhone), mapUrl: text(p.mapUrl) })),
    days: [...doc.days].sort((a, b) => a.dayNumber - b.dayNumber).map(d => ({
      dayNumber: d.dayNumber, date: d.date, title: d.title, morning: text(d.morning), afternoon: text(d.afternoon), evening: text(d.evening),
      hotelName: text(d.hotelName), hotelAddress: text(d.hotelAddress), meals: MEALS.filter(m => d.meals.includes(m)), transfers: text(d.transfers), notes: text(d.notes),
      items: sortItems(d.items.filter(i => i.customerVisible)).map(i => ({ time: i.time, kind: i.kind, kindLabel: ITEM_KIND_LABEL[i.kind] ?? 'Note', title: i.title, details: text(i.details) })),
    })),
    company: { name: ctx.company.name, phone: text(ctx.company.phone), email: text(ctx.company.email), website: text(ctx.company.website), address: text(ctx.company.address), logoUrl: text(ctx.company.logoUrl) },
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Sat 19 Sep" from YYYY-MM-DD (calendar maths only, no time zone involved). */
export function shortDate(day: string | null): string {
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** Plain text for WhatsApp / SMS, built only from the customer copy. */
export function itineraryAsText(c: CustomerItinerary): string {
  const lines: string[] = [`Namaste ${c.travellerName} Ji,`, '', `Here is your itinerary for *${c.title}*.`];
  if (c.startDate) lines.push(`${shortDate(c.startDate)}${c.endDate && c.endDate !== c.startDate ? ` to ${shortDate(c.endDate)}` : ''} · ${c.pax} traveller${c.pax === 1 ? '' : 's'}`);
  if (c.pickupPoints.length) {
    lines.push('', '*Pickup points*');
    for (const p of c.pickupPoints) lines.push(`• ${p.name}${p.time ? ` — ${shortDate(p.time.slice(0, 10))}, ${p.time.slice(11, 16)}` : ''}${p.landmark ? ` (${p.landmark})` : ''}`);
  }
  for (const d of c.days) {
    lines.push('', `*Day ${d.dayNumber}${d.date ? ` — ${shortDate(d.date)}` : ''}: ${d.title}*`);
    for (const i of d.items) lines.push(`${i.time ? `${i.time} ` : '• '}${i.title}${i.details ? ` (${i.details})` : ''}`);
    for (const [label, v] of [['Morning', d.morning], ['Afternoon', d.afternoon], ['Evening', d.evening]] as const) if (v) lines.push(`${label}: ${v}`);
    if (d.hotelName) lines.push(`Stay: ${d.hotelName}`);
    if (d.meals.length) lines.push(`Meals: ${d.meals.map(m => m[0].toUpperCase() + m.slice(1)).join(', ')}`);
    if (d.notes) lines.push(d.notes);
  }
  if (c.notes) lines.push('', c.notes);
  lines.push('', `For any help, please call us${c.company.phone ? ` on ${c.company.phone}` : ''}.`, `Warm regards,`, c.company.name);
  return lines.join('\n');
}
