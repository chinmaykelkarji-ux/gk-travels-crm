// ============================================================
// Task engine rules — pure. Each rule looks at a trip's (or the sales
// pipeline's) real records and says which tasks should exist right now,
// each with a stable key. The server upserts by key: new keys become tasks,
// open tasks whose key is no longer wanted are closed automatically, and a
// task a person completed is never re-created for the same key.
//
// Timings are parameters stored per organisation (task_rules table) and
// edited in Settings; the defaults below say where they come from.
// ============================================================

import { parseIst, addDays, istDay, istClock } from './istTime';
import { passportStatus } from './travellers';
import { AC_CLASSES } from './tickets';

export type RuleCode =
  | 'WEB_CHECKIN' | 'GROUP_SEATS' | 'TATKAL_OPENS' | 'TRAIN_WL_CHECK' | 'TRAIN_CHART'
  | 'PASSPORT_VALIDITY' | 'VISA_CHECK'
  | 'HOTEL_CONFIRMATION' | 'VEHICLE_CONFIRMATION' | 'DRIVER_DETAILS' | 'ACTIVITY_CONFIRMATION'
  | 'BALANCE_DUE' | 'LEAD_FOLLOW_UP' | 'QUOTE_FOLLOW_UP' | 'POST_TRIP_FEEDBACK';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type RuleCategory = 'Tickets' | 'Documents' | 'Suppliers' | 'Money' | 'Sales' | 'After the trip';

export interface RuleParamDef { key: string; label: string; unit: 'hours' | 'days' | 'minutes' | 'months' | 'travellers' | 'hour of day'; min: number; max: number; default: number }
export interface RuleDef { code: RuleCode; name: string; category: RuleCategory; description: string; priority: TaskPriority; scope: 'TRIP' | 'SALES'; params: RuleParamDef[]; note?: string }

const hourOfDay = (def: number, label = 'At (hour of day, IST)'): RuleParamDef => ({ key: 'atHour', label, unit: 'hour of day', min: 0, max: 23, default: def });

export const RULES: RuleDef[] = [
  { code: 'WEB_CHECKIN', name: 'Flight web check-in', category: 'Tickets', scope: 'TRIP', priority: 'high',
    description: 'For each flight leg, a task when web check-in opens.',
    params: [{ key: 'hoursBefore', label: 'Opens before departure', unit: 'hours', min: 1, max: 168, default: 48 }],
    note: 'Most Indian carriers open web check-in 48 hours before departure; some airlines use 24 hours. Set to your usual airline.' },
  { code: 'GROUP_SEATS', name: 'Group seat selection', category: 'Tickets', scope: 'TRIP', priority: 'medium',
    description: 'For flight legs with a large group, a task to select seats together.',
    params: [{ key: 'minPax', label: 'Group size from', unit: 'travellers', min: 2, max: 500, default: 10 }, { key: 'daysBefore', label: 'Days before departure', unit: 'days', min: 1, max: 60, default: 5 }] },
  { code: 'TATKAL_OPENS', name: 'Tatkal booking window', category: 'Tickets', scope: 'TRIP', priority: 'urgent',
    description: 'For Tatkal train tickets not yet booked, a task just before the Tatkal window opens (the day before the journey).',
    params: [{ key: 'acHour', label: 'AC classes open at', unit: 'hour of day', min: 0, max: 23, default: 10 }, { key: 'nonAcHour', label: 'Non-AC classes open at', unit: 'hour of day', min: 0, max: 23, default: 11 }, { key: 'minutesBefore', label: 'Remind before opening', unit: 'minutes', min: 0, max: 240, default: 15 }],
    note: 'IRCTC Tatkal opens the day before the journey: 10:00 for AC classes and 11:00 for non-AC. Verify on IRCTC if they change it.' },
  { code: 'TRAIN_WL_CHECK', name: 'Waitlist / RAC check', category: 'Tickets', scope: 'TRIP', priority: 'high',
    description: 'For train tickets still waitlisted, RAC or partly confirmed, a check every day in the days before departure.',
    params: [{ key: 'daysBefore', label: 'Start checking before departure', unit: 'days', min: 1, max: 60, default: 7 }, hourOfDay(10)] },
  { code: 'TRAIN_CHART', name: 'Train chart prepared', category: 'Tickets', scope: 'TRIP', priority: 'urgent',
    description: 'For each train leg, a task to record coach and berth (or final status) once the chart is prepared.',
    params: [{ key: 'hoursBefore', label: 'Chart prepared before departure', unit: 'hours', min: 1, max: 24, default: 8 }],
    note: 'IRCTC prepares the first chart some hours before departure (8 hours at the time of writing; it has changed before). Verify on IRCTC.' },
  { code: 'PASSPORT_VALIDITY', name: 'Passport validity', category: 'Documents', scope: 'TRIP', priority: 'high',
    description: 'For trips departing soon, travellers whose passport is expired or short of the required validity; on international trips also travellers with no passport on file.',
    params: [{ key: 'requiredMonths', label: 'Validity required beyond travel', unit: 'months', min: 0, max: 24, default: 6 }, { key: 'windowDays', label: 'Look at trips departing within', unit: 'days', min: 7, max: 365, default: 90 }],
    note: 'Six months beyond travel is the common rule; some countries differ. Check the destination.' },
  { code: 'VISA_CHECK', name: 'Visa deadline', category: 'Documents', scope: 'TRIP', priority: 'high',
    description: 'For international trips, a task to confirm every traveller has the visa they need.',
    params: [{ key: 'daysBefore', label: 'Days before departure', unit: 'days', min: 1, max: 180, default: 30 }],
    note: 'Processing times differ by country and season; set this to the longest you usually need.' },
  { code: 'HOTEL_CONFIRMATION', name: 'Hotel confirmation pending', category: 'Suppliers', scope: 'TRIP', priority: 'high',
    description: 'Hotel bookings still requested or on hold close to check-in.',
    params: [{ key: 'daysBefore', label: 'Days before check-in', unit: 'days', min: 0, max: 60, default: 7 }, hourOfDay(10)] },
  { code: 'VEHICLE_CONFIRMATION', name: 'Vehicle confirmation pending', category: 'Suppliers', scope: 'TRIP', priority: 'high',
    description: 'Vehicle duties still requested close to the pickup.',
    params: [{ key: 'daysBefore', label: 'Days before pickup', unit: 'days', min: 0, max: 60, default: 3 }, hourOfDay(10)] },
  { code: 'DRIVER_DETAILS', name: 'Driver details missing', category: 'Suppliers', scope: 'TRIP', priority: 'urgent',
    description: 'Confirmed vehicle duties with no driver name close to the pickup (cab owners often send these the day before).',
    params: [{ key: 'hoursBefore', label: 'Hours before pickup', unit: 'hours', min: 1, max: 96, default: 24 }] },
  { code: 'ACTIVITY_CONFIRMATION', name: 'Activity confirmation pending', category: 'Suppliers', scope: 'TRIP', priority: 'medium',
    description: 'Activity bookings (darshan slots, boat rides, sightseeing) still requested close to the date.',
    params: [{ key: 'daysBefore', label: 'Days before the activity', unit: 'days', min: 0, max: 60, default: 3 }, hourOfDay(10)] },
  { code: 'BALANCE_DUE', name: 'Balance to collect', category: 'Money', scope: 'TRIP', priority: 'high',
    description: 'Trips with an unpaid balance close to departure.',
    params: [{ key: 'daysBefore', label: 'Days before departure', unit: 'days', min: 0, max: 90, default: 7 }, hourOfDay(10)] },
  { code: 'LEAD_FOLLOW_UP', name: 'Lead follow-up', category: 'Sales', scope: 'SALES', priority: 'medium',
    description: 'Open leads on their follow-up date.',
    params: [hourOfDay(10)] },
  { code: 'QUOTE_FOLLOW_UP', name: 'Quotation follow-up', category: 'Sales', scope: 'SALES', priority: 'medium',
    description: 'Quotations sent (or viewed) with no answer after a few days.',
    params: [{ key: 'daysAfter', label: 'Days after sending', unit: 'days', min: 1, max: 30, default: 2 }, hourOfDay(11)] },
  { code: 'POST_TRIP_FEEDBACK', name: 'Feedback after the trip', category: 'After the trip', scope: 'TRIP', priority: 'low',
    description: 'A call to the customer after a completed trip.',
    params: [{ key: 'daysAfter', label: 'Days after return', unit: 'days', min: 0, max: 30, default: 1 }, hourOfDay(11)] },
];
export const RULE_BY_CODE = new Map(RULES.map(r => [r.code, r]));
export const TRIP_RULES = RULES.filter(r => r.scope === 'TRIP').map(r => r.code);
export const SALES_RULES = RULES.filter(r => r.scope === 'SALES').map(r => r.code);

export type RuleSettings = Partial<Record<RuleCode, { enabled: boolean; params: Record<string, number> }>>;

/** Stored settings merged over the defaults; unknown or out-of-range values fall back to the default. */
export function effectiveRules(stored: RuleSettings): Record<RuleCode, { enabled: boolean; params: Record<string, number> }> {
  const out = {} as Record<RuleCode, { enabled: boolean; params: Record<string, number> }>;
  for (const r of RULES) {
    const s = stored[r.code];
    const params: Record<string, number> = {};
    for (const p of r.params) {
      const v = s?.params?.[p.key];
      params[p.key] = typeof v === 'number' && Number.isFinite(v) && v >= p.min && v <= p.max ? v : p.default;
    }
    out[r.code] = { enabled: s?.enabled ?? true, params };
  }
  return out;
}

/** Validates an edit to one rule's parameters; returns field errors keyed by parameter. */
export function validateRuleParams(code: RuleCode, params: Record<string, unknown>): Record<string, string> {
  const def = RULE_BY_CODE.get(code);
  if (!def) return { code: 'Unknown rule' };
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const p = def.params.find(x => x.key === k);
    if (!p) { errors[k] = 'Unknown setting'; continue; }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < p.min || v > p.max) errors[k] = `Whole number from ${p.min} to ${p.max}`;
  }
  return errors;
}

// ── Facts ─────────────────────────────────────────────────────

export interface TripFacts {
  id: string; label: string; customer: string; customerId: string | null; stage: string;
  departure: string | null; returnDate: string | null; isInternational: boolean; balanceDue: number; pax: number;
  /** The trip's operations owner; rule tasks go to them. */
  ownerUserId?: string | null;
  segments: { id: string; ticketId: string; ticketLabel: string; mode: string; ticketStatus: string; quota: string | null; travelClass: string | null; route: string; departAt: string | null; paxCount: number; chartPrepared: boolean }[];
  hotels: { id: string; hotelName: string; checkIn: string; status: string }[];
  vehicles: { id: string; label: string; startAt: string; status: string; hasDriver: boolean }[];
  activities: { id: string; name: string; date: string; time: string | null; status: string }[];
  travellers: { id: string; name: string; passportExpiry: string | null; hasPassport: boolean }[];
}

export interface SalesFacts {
  leads: { id: string; name: string; status: string; followUpDate: string | null; assignedToUserId: string | null }[];
  quotes: { id: string; number: string; customer: string; customerId: string; status: string; sentAt: string | null; assignedToUserId: string | null }[];
}

export interface DesiredTask {
  ruleCode: RuleCode; key: string; title: string; description: string; dueAt: string; priority: TaskPriority;
  tripId: string | null; customerId: string | null; entityType: string; entityId: string; assignedToUserId?: string | null;
  /** Due "from when it was found": the first due time is kept on later recalculations. */
  keepDue?: boolean;
}

const OPEN_STAGES = new Set(['PLANNING', 'CONFIRMING', 'READY', 'ONGOING']);
const at = (day: string, hour: number) => parseIst(`${day}T${String(hour).padStart(2, '0')}:00`)!.toISOString();
const minus = (iso: string, ms: number) => new Date(Date.parse(iso) - ms).toISOString();
const H = 3_600_000;
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Tasks the trip's records call for at `now`. */
export function evaluateTripRules(t: TripFacts, rules: ReturnType<typeof effectiveRules>, now: Date): DesiredTask[] {
  const out: DesiredTask[] = [];
  const nowIso = now.toISOString();
  const today = istDay(now)!;
  const on = (c: RuleCode) => rules[c].enabled;
  const p = (c: RuleCode, k: string) => rules[c].params[k];
  const base = { tripId: t.id, customerId: t.customerId, assignedToUserId: t.ownerUserId ?? null };
  const tag = `${t.label} (${t.id})`;
  const open = OPEN_STAGES.has(t.stage);
  const upcoming = (iso: string | null) => !!iso && iso > nowIso;

  if (open) {
    for (const s of t.segments) {
      if (s.ticketStatus === 'CANCELLED' || !s.departAt || !upcoming(s.departAt)) continue;
      const when = `${istDay(s.departAt)} ${istClock(s.departAt)}`;
      if (s.mode === 'FLIGHT' && on('WEB_CHECKIN') && s.ticketStatus !== 'REQUESTED' && s.ticketStatus !== 'ON_HOLD') {
        out.push({ ...base, ruleCode: 'WEB_CHECKIN', key: `WEB_CHECKIN:${s.id}:${s.departAt}`, priority: 'high', entityType: 'ticket', entityId: s.ticketId,
          title: `Web check-in: ${s.route} (${s.ticketLabel})`, description: `Web check-in opens for ${s.paxCount} passenger(s) on ${s.route}, departing ${when}. ${tag}.`,
          dueAt: minus(s.departAt, p('WEB_CHECKIN', 'hoursBefore') * H) });
      }
      if (s.mode === 'FLIGHT' && on('GROUP_SEATS') && s.paxCount >= p('GROUP_SEATS', 'minPax') && s.ticketStatus !== 'REQUESTED' && s.ticketStatus !== 'ON_HOLD') {
        out.push({ ...base, ruleCode: 'GROUP_SEATS', key: `GROUP_SEATS:${s.id}`, priority: 'medium', entityType: 'ticket', entityId: s.ticketId,
          title: `Select seats together: ${s.route} (${s.paxCount} pax)`, description: `Group of ${s.paxCount} on ${s.route}, departing ${when}. Seat them together (families, elders on aisles). ${tag}.`,
          dueAt: at(addDays(istDay(s.departAt)!, -p('GROUP_SEATS', 'daysBefore')), 10) });
      }
      if (s.mode === 'TRAIN') {
        const journeyDay = istDay(s.departAt)!;
        if (on('TATKAL_OPENS') && (s.quota === 'TATKAL' || s.quota === 'PREMIUM_TATKAL') && (s.ticketStatus === 'REQUESTED' || s.ticketStatus === 'ON_HOLD')) {
          const ac = !!s.travelClass && AC_CLASSES.has(s.travelClass.toUpperCase());
          const opens = at(addDays(journeyDay, -1), ac ? p('TATKAL_OPENS', 'acHour') : p('TATKAL_OPENS', 'nonAcHour'));
          out.push({ ...base, ruleCode: 'TATKAL_OPENS', key: `TATKAL_OPENS:${s.id}:${journeyDay}`, priority: 'urgent', entityType: 'ticket', entityId: s.ticketId,
            title: `Tatkal opens ${istClock(opens)}: ${s.route}${s.travelClass ? ` (${s.travelClass})` : ''}`, description: `Book ${s.paxCount} Tatkal berth(s) on ${s.route}, journey ${journeyDay}. Keep passenger details and payment ready. ${tag}.`,
            dueAt: minus(opens, p('TATKAL_OPENS', 'minutesBefore') * 60_000) });
        }
        if (on('TRAIN_WL_CHECK') && ['WAITLISTED', 'RAC', 'PARTIAL'].includes(s.ticketStatus) && !s.chartPrepared && today >= addDays(journeyDay, -p('TRAIN_WL_CHECK', 'daysBefore')) && today <= journeyDay) {
          out.push({ ...base, ruleCode: 'TRAIN_WL_CHECK', key: `TRAIN_WL_CHECK:${s.id}:${today}`, priority: 'high', entityType: 'ticket', entityId: s.ticketId,
            title: `Check waitlist: ${s.route} (${s.ticketLabel})`, description: `Ticket is ${s.ticketStatus.toLowerCase()}; journey ${journeyDay}. Update the passenger statuses and tell the travellers. ${tag}.`,
            dueAt: at(today, p('TRAIN_WL_CHECK', 'atHour')) });
        }
        if (on('TRAIN_CHART') && !s.chartPrepared && s.ticketStatus !== 'REQUESTED' && s.ticketStatus !== 'ON_HOLD') {
          out.push({ ...base, ruleCode: 'TRAIN_CHART', key: `TRAIN_CHART:${s.id}:${s.departAt}`, priority: 'urgent', entityType: 'ticket', entityId: s.ticketId,
            title: `Chart prepared — update berths: ${s.route}`, description: `Record coach/berth or final status for ${s.paxCount} passenger(s), departing ${when}, and send them to the group. ${tag}.`,
            dueAt: minus(s.departAt, p('TRAIN_CHART', 'hoursBefore') * H) });
        }
      }
    }

    if (on('PASSPORT_VALIDITY') && t.departure && t.departure >= today && t.departure <= addDays(today, p('PASSPORT_VALIDITY', 'windowDays'))) {
      for (const x of t.travellers) {
        const status = x.passportExpiry ? passportStatus(x.passportExpiry, { travelDate: t.returnDate ?? t.departure, today: now, requiredMonths: p('PASSPORT_VALIDITY', 'requiredMonths') }) : null;
        const missing = t.isInternational && !x.hasPassport;
        if (!missing && status !== 'EXPIRED' && status !== 'INSUFFICIENT') continue;
        out.push({ ...base, ruleCode: 'PASSPORT_VALIDITY', key: `PASSPORT_VALIDITY:${t.id}:${x.id}:${x.passportExpiry ?? 'none'}`, priority: 'high', entityType: 'traveller', entityId: x.id,
          title: missing ? `Passport details missing: ${x.name} — ${tag}` : `Passport ${status === 'EXPIRED' ? 'expired' : 'validity short'}: ${x.name} — ${tag}`,
          description: missing ? `No passport on file for ${x.name}; the trip is international and departs ${t.departure}.` : `${x.name}'s passport expires ${x.passportExpiry}; the trip runs ${t.departure} to ${t.returnDate ?? t.departure}. Arrange renewal or confirm the destination's rule.`,
          dueAt: at(today, 10), keepDue: true });
      }
    }
    if (on('VISA_CHECK') && t.isInternational && t.departure && t.departure >= today) {
      out.push({ ...base, ruleCode: 'VISA_CHECK', key: `VISA_CHECK:${t.id}:${t.departure}`, priority: 'high', entityType: 'trip', entityId: t.id,
        title: `Confirm visas: ${tag}`, description: `International trip departing ${t.departure} with ${t.travellers.length || t.pax} traveller(s). Confirm each has the visa (or visa on arrival) they need.`,
        dueAt: at(addDays(t.departure, -p('VISA_CHECK', 'daysBefore')), 10) });
    }
    for (const h of t.hotels) {
      if (!on('HOTEL_CONFIRMATION') || (h.status !== 'REQUESTED' && h.status !== 'ON_HOLD') || h.checkIn < today) continue;
      out.push({ ...base, ruleCode: 'HOTEL_CONFIRMATION', key: `HOTEL_CONFIRMATION:${h.id}`, priority: 'high', entityType: 'hotel_booking', entityId: h.id,
        title: `Get hotel confirmation: ${h.hotelName} (check-in ${h.checkIn})`, description: `Booking is ${h.status === 'ON_HOLD' ? 'on hold' : 'requested'}; get the confirmation number from the hotel or supplier. ${tag}.`,
        dueAt: at(addDays(h.checkIn, -p('HOTEL_CONFIRMATION', 'daysBefore')), p('HOTEL_CONFIRMATION', 'atHour')) });
    }
    for (const v of t.vehicles) {
      if (!upcoming(v.startAt)) continue;
      if (on('VEHICLE_CONFIRMATION') && v.status === 'REQUESTED') {
        out.push({ ...base, ruleCode: 'VEHICLE_CONFIRMATION', key: `VEHICLE_CONFIRMATION:${v.id}`, priority: 'high', entityType: 'vehicle_assignment', entityId: v.id,
          title: `Confirm vehicle: ${v.label}`, description: `Vehicle duty is still requested. Confirm with the cab owner or fleet. ${tag}.`,
          dueAt: at(addDays(istDay(v.startAt)!, -p('VEHICLE_CONFIRMATION', 'daysBefore')), p('VEHICLE_CONFIRMATION', 'atHour')) });
      }
      if (on('DRIVER_DETAILS') && v.status === 'CONFIRMED' && !v.hasDriver) {
        out.push({ ...base, ruleCode: 'DRIVER_DETAILS', key: `DRIVER_DETAILS:${v.id}`, priority: 'urgent', entityType: 'vehicle_assignment', entityId: v.id,
          title: `Get driver name and number: ${v.label}`, description: `The duty is confirmed but no driver is recorded. Get the driver's name and phone and share them with the group. ${tag}.`,
          dueAt: minus(v.startAt, p('DRIVER_DETAILS', 'hoursBefore') * H) });
      }
    }
    for (const a of t.activities) {
      if (!on('ACTIVITY_CONFIRMATION') || (a.status !== 'REQUESTED' && a.status !== 'ON_HOLD') || a.date < today) continue;
      out.push({ ...base, ruleCode: 'ACTIVITY_CONFIRMATION', key: `ACTIVITY_CONFIRMATION:${a.id}`, priority: 'medium', entityType: 'activity_booking', entityId: a.id,
        title: `Confirm activity: ${a.name} (${a.date}${a.time ? ` ${a.time}` : ''})`, description: `Activity booking is still ${a.status === 'ON_HOLD' ? 'on hold' : 'requested'}. ${tag}.`,
        dueAt: at(addDays(a.date, -p('ACTIVITY_CONFIRMATION', 'daysBefore')), p('ACTIVITY_CONFIRMATION', 'atHour')) });
    }
    if (on('BALANCE_DUE') && t.balanceDue > 0 && t.departure && t.departure >= today) {
      out.push({ ...base, ruleCode: 'BALANCE_DUE', key: `BALANCE_DUE:${t.id}:${t.departure}`, priority: 'high', entityType: 'trip', entityId: t.id,
        title: `Collect balance ${inr(t.balanceDue)}: ${t.customer} — ${tag}`, description: `Balance of ${inr(t.balanceDue)} is due before departure on ${t.departure}.`,
        dueAt: at(addDays(t.departure, -p('BALANCE_DUE', 'daysBefore')), p('BALANCE_DUE', 'atHour')) });
    }
  }
  if (t.stage === 'COMPLETED' && on('POST_TRIP_FEEDBACK')) {
    const end = t.returnDate ?? t.departure;
    if (end && today <= addDays(end, 30)) {
      out.push({ ...base, ruleCode: 'POST_TRIP_FEEDBACK', key: `POST_TRIP_FEEDBACK:${t.id}`, priority: 'low', entityType: 'trip', entityId: t.id,
        title: `Feedback call: ${t.customer} — ${tag}`, description: `The trip ended on ${end}. Call to thank them, ask how it went and note any complaint or referral.`,
        dueAt: at(addDays(end, p('POST_TRIP_FEEDBACK', 'daysAfter')), p('POST_TRIP_FEEDBACK', 'atHour')) });
    }
  }
  return out;
}

const OPEN_LEAD = new Set(['new', 'contacted', 'qualified']);
const AWAITING_QUOTE = new Set(['SENT', 'VIEWED']);

/** Sales follow-ups at `now`. */
export function evaluateSalesRules(s: SalesFacts, rules: ReturnType<typeof effectiveRules>, now: Date): DesiredTask[] {
  const out: DesiredTask[] = [];
  const today = istDay(now)!;
  if (rules.LEAD_FOLLOW_UP.enabled) {
    for (const l of s.leads) {
      if (!OPEN_LEAD.has(l.status) || !l.followUpDate || !/^\d{4}-\d{2}-\d{2}/.test(l.followUpDate)) continue;
      const day = l.followUpDate.slice(0, 10);
      if (day < addDays(today, -30)) continue;
      out.push({ ruleCode: 'LEAD_FOLLOW_UP', key: `LEAD_FOLLOW_UP:${l.id}:${day}`, priority: 'medium', tripId: null, customerId: null, entityType: 'lead', entityId: l.id, assignedToUserId: l.assignedToUserId,
        title: `Follow up lead: ${l.name}`, description: `Follow-up date ${day}. Lead ${l.id} is ${l.status}.`, dueAt: at(day, rules.LEAD_FOLLOW_UP.params.atHour) });
    }
  }
  if (rules.QUOTE_FOLLOW_UP.enabled) {
    for (const q of s.quotes) {
      if (!AWAITING_QUOTE.has(q.status) || !q.sentAt) continue;
      const due = at(addDays(istDay(q.sentAt)!, rules.QUOTE_FOLLOW_UP.params.daysAfter), rules.QUOTE_FOLLOW_UP.params.atHour);
      out.push({ ruleCode: 'QUOTE_FOLLOW_UP', key: `QUOTE_FOLLOW_UP:${q.id}:${q.sentAt}`, priority: 'medium', tripId: null, customerId: q.customerId, entityType: 'sales_quote', entityId: q.id, assignedToUserId: q.assignedToUserId,
        title: `Follow up quotation ${q.number}: ${q.customer}`, description: `Sent ${istDay(q.sentAt)}; no answer yet. Call to answer questions and agree the next step.`, dueAt: due });
    }
  }
  return out;
}

// ── Urgency ───────────────────────────────────────────────────

export type UrgencyBucket = 'OVERDUE' | 'NOW' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'LATER' | 'NO_DATE';
export const BUCKET_LABEL: Record<UrgencyBucket, string> = { OVERDUE: 'Overdue', NOW: 'Due within 2 hours', TODAY: 'Later today', TOMORROW: 'Tomorrow', THIS_WEEK: 'Next 7 days', LATER: 'Later', NO_DATE: 'No date' };
const BUCKET_ORDER: UrgencyBucket[] = ['OVERDUE', 'NOW', 'TODAY', 'TOMORROW', 'THIS_WEEK', 'LATER', 'NO_DATE'];
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export interface UrgencyInput { dueAt: string | null; dueDate: string | null; snoozedUntil: string | null; priority: string }

/** When a task is really due: its time, or the end of its day, pushed out by a snooze. */
export function effectiveDue(t: UrgencyInput): string | null {
  const due = t.dueAt ?? (t.dueDate && /^\d{4}-\d{2}-\d{2}/.test(t.dueDate) ? parseIst(`${t.dueDate.slice(0, 10)}T23:59`)!.toISOString() : null);
  if (t.snoozedUntil && (!due || t.snoozedUntil > due)) return t.snoozedUntil;
  return due;
}

export function urgencyBucket(t: UrgencyInput, now: Date): UrgencyBucket {
  const due = effectiveDue(t);
  if (!due) return 'NO_DATE';
  const ms = Date.parse(due) - now.getTime();
  if (ms < 0) return 'OVERDUE';
  if (ms <= 2 * H) return 'NOW';
  const day = istDay(due)!, today = istDay(now)!;
  if (day === today) return 'TODAY';
  if (day === addDays(today, 1)) return 'TOMORROW';
  if (day <= addDays(today, 7)) return 'THIS_WEEK';
  return 'LATER';
}

/** Most urgent first: bucket, then priority, then due time (most overdue first). */
export function sortByUrgency<T extends UrgencyInput>(tasks: T[], now: Date): (T & { bucket: UrgencyBucket; effectiveDue: string | null })[] {
  return tasks
    .map(t => ({ ...t, bucket: urgencyBucket(t, now), effectiveDue: effectiveDue(t) }))
    .sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket)
      || (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
      || (a.effectiveDue ?? '~').localeCompare(b.effectiveDue ?? '~'));
}
