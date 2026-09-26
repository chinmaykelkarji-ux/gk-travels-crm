// ============================================================
// Insights — what needs attention today, counted by plain queries.
//
//   trips leaving soon with something unconfirmed   operations:read
//   passports missing / expired / short of 6 months operations:read
//   tickets still waitlisted, RAC or part confirmed operations:read
//   money overdue by more than 30 days              finance:read
//   open trips with a thin margin                   commercial access
//
// Nothing here asks a model. Each insight carries a sentence that reads well
// on its own (src/shared/calc/insights.ts). `phrase()` may ask a model to turn
// those sentences into a short note, and throws its wording away if it adds a
// number the facts do not contain (architecture H.6).
// Thresholds are the organisation's own (Phase 9.3), defaulting to
// INSIGHT_LIMITS.
// ============================================================

import { prisma } from '../../lib/prisma.js';
import { hasPermission } from '../../lib/permissions.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { notConfigured } from '../../core/errors.js';
import { aiProvider, AiOutputError } from '../../ai/index.js';
import { istToday, addDays } from '../../../../src/shared/calc/istTime.js';
import { formatInr, toPaise, sumPaise } from '../../../../src/shared/calc/money.js';
import { passportStatus, travellerDisplayName } from '../../../../src/shared/calc/travellers.js';
import {
  departingText, expectedMargin, numbersAddedBy, overdueText, passportText, sortInsights, thinMarginText, waitlistText,
  type Insight,
} from '../../../../src/shared/calc/insights.js';
import { readiness } from '../trips/stage.js';
import * as finance from '../finance/service.js';
import { getSettings } from '../organization/service.js';

type Limits = Awaited<ReturnType<typeof getSettings>>['insights'];

const OPEN_STAGES = ['PLANNING', 'CONFIRMING', 'READY', 'ONGOING'] as const;
/** Enough to act on; the link opens the full list. */
const ITEMS = 8;
const fmtDay = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'no date');

async function departingUnconfirmed(today: string, L: Limits): Promise<Insight | null> {
  const days = L.departingWithinDays;
  const trips = await prisma.trip.findMany({
    where: { stage: { in: [...OPEN_STAGES] }, departure: { gte: today, lte: addDays(today, days) } },
    orderBy: { departure: 'asc' }, take: 40, select: { id: true, tourName: true, destination: true, departure: true },
  });
  const flagged = [];
  for (const t of trips) {
    const r = await readiness(prisma, t.id);
    const blocking = r.checks.filter(c => c.severity === 'block');
    if (blocking.length) flagged.push({ t, blocking });
  }
  if (!flagged.length) return null;
  return {
    code: 'DEPARTING_UNCONFIRMED', severity: 'high', text: departingText(flagged.length, days), count: flagged.length, amount: null, link: '/trips',
    items: flagged.slice(0, ITEMS).map(({ t, blocking }) => ({
      label: `${t.tourName ?? t.destination} (${t.id}) · ${fmtDay(t.departure)}`, detail: blocking.map(c => c.message).join('; '), link: `/trips/${t.id}`,
    })),
  };
}

async function passports(today: string, L: Limits): Promise<Insight | null> {
  const days = L.passportWithinDays;
  const rows = await prisma.tripTraveller.findMany({
    where: { trip: { isInternational: true, stage: { in: [...OPEN_STAGES] }, departure: { gte: today, lte: addDays(today, days) } } },
    select: {
      trip: { select: { id: true, tourName: true, destination: true, departure: true } },
      traveller: { select: { id: true, title: true, firstName: true, lastName: true, displayName: true, passportExpiry: true } },
    },
  });
  const now = new Date(`${today}T00:00:00Z`);
  const problems = rows
    .map(r => ({ ...r, status: passportStatus(r.traveller.passportExpiry, { travelDate: r.trip.departure, today: now }) }))
    .filter(r => r.status === 'EXPIRED' || r.status === 'INSUFFICIENT' || r.status === 'UNKNOWN')
    .sort((a, b) => (a.trip.departure ?? '').localeCompare(b.trip.departure ?? ''));
  if (!problems.length) return null;
  const why = { EXPIRED: 'expired', INSUFFICIENT: 'less than six months left at travel', UNKNOWN: 'no passport expiry on file' } as Record<string, string>;
  return {
    code: 'PASSPORTS', severity: 'high', text: passportText(problems.length, days), count: problems.length, amount: null, link: '/travellers',
    items: problems.slice(0, ITEMS).map(p => ({
      label: `${travellerDisplayName(p.traveller)} · ${p.trip.tourName ?? p.trip.destination} (${p.trip.id})`, detail: why[p.status], link: `/trips/${p.trip.id}`,
    })),
  };
}

async function waitlisted(): Promise<Insight | null> {
  const tickets = await prisma.ticket.findMany({
    where: { status: { in: ['WAITLISTED', 'RAC', 'PARTIAL'] }, segments: { some: { departAt: { gte: new Date() } } } },
    select: { id: true, pnr: true, displayNumber: true, mode: true, status: true, tripId: true, segments: { orderBy: { departAt: 'asc' }, take: 1, select: { fromName: true, toName: true, departAt: true } } },
  });
  if (!tickets.length) return null;
  const first = (t: typeof tickets[number]) => t.segments[0]?.departAt?.getTime() ?? 0;
  tickets.sort((a, b) => first(a) - first(b));
  const label = { WAITLISTED: 'waitlisted', RAC: 'RAC', PARTIAL: 'part confirmed' } as Record<string, string>;
  return {
    code: 'TICKETS_WAITLISTED', severity: 'high', text: waitlistText(tickets.length), count: tickets.length, amount: null, link: '/tickets',
    items: tickets.slice(0, ITEMS).map(t => {
      const s = t.segments[0];
      const day = s?.departAt ? s.departAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '';
      return { label: `${t.mode === 'TRAIN' ? 'Train' : t.mode === 'FLIGHT' ? 'Flight' : 'Bus'} ${t.pnr ? `PNR ${t.pnr}` : t.displayNumber ?? ''} · ${s ? `${s.fromName} → ${s.toName}` : ''} · ${day}`, detail: label[t.status], link: `/tickets/${t.id}` };
    }),
  };
}

async function overdue(today: string, L: Limits): Promise<Insight | null> {
  const days = L.overdueDays;
  const r = await finance.receivables(today);
  const late = r.customers
    .map(c => ({ c, invoices: c.invoices.filter(i => i.daysOverdue > days) }))
    .filter(x => x.invoices.length);
  if (!late.length) return null;
  const perCustomer = late.map(x => ({ ...x, paise: sumPaise(x.invoices.map(i => toPaise(i.outstanding))) })).sort((a, b) => b.paise - a.paise);
  const total = sumPaise(perCustomer.map(x => x.paise));
  return {
    code: 'MONEY_OVERDUE', severity: 'medium', text: overdueText(late.length, total, days), count: late.length, amount: total / 100, link: '/receivables',
    items: perCustomer.slice(0, ITEMS).map(x => ({
      label: x.c.customerName, detail: `${formatInr(x.paise)} · oldest ${Math.max(...x.invoices.map(i => i.daysOverdue))} days late`,
      link: x.c.customerId ? `/customers/${x.c.customerId}` : '/receivables',
    })),
  };
}

async function thinMargins(today: string, L: Limits): Promise<Insight | null> {
  const pct = L.thinMarginPct;
  const trips = await prisma.trip.findMany({
    where: { stage: { in: [...OPEN_STAGES] }, OR: [{ departure: null }, { departure: { gte: addDays(today, -30) } }] },
    orderBy: { departure: 'asc' }, take: 40, select: { id: true },
  });
  const thin = [];
  for (const t of trips) {
    const p = await finance.profitForTrip(t.id);
    const m = expectedMargin(toPaise(p.revenue), toPaise(p.actualCost), toPaise(p.plannedCost));
    if (m && m.marginPct < pct) thin.push({ p, m });
  }
  if (!thin.length) return null;
  thin.sort((a, b) => a.m.marginPct - b.m.marginPct);
  return {
    code: 'THIN_MARGIN', severity: 'medium', text: thinMarginText(thin.length, pct), count: thin.length, amount: null, link: '/money',
    items: thin.slice(0, ITEMS).map(({ p, m }) => ({
      label: `${p.trip.label} (${p.trip.id})`, detail: `margin ${m.marginPct}% (${formatInr(m.marginPaise)}) on ${formatInr(toPaise(p.revenue))}`, link: `/trips/${p.trip.id}`,
    })),
  };
}

/** What this person should look at today. Only insights they could open themselves are counted at all. */
export async function insightsFor(role: string, today = istToday()) {
  const can = (p: string) => hasPermission(role as never, p);
  // The organisation's own numbers (Settings → Organisation), defaulting to INSIGHT_LIMITS.
  const L = (await getSettings()).insights;
  const jobs: Promise<Insight | null>[] = [];
  if (can('operations:read')) jobs.push(departingUnconfirmed(today, L), passports(today, L), waitlisted());
  if (can('finance:read')) jobs.push(overdue(today, L));
  if (canSeeCommercials(role)) jobs.push(thinMargins(today, L));
  const items = sortInsights((await Promise.all(jobs)).filter((x): x is Insight => x !== null));
  return { today, items };
}

export const PHRASE_INSTRUCTIONS = [
  'You write a short morning note for the owner of GK Travels, a travel agency in Belagavi.',
  'Rewrite the facts you are given as 2 to 4 plain sentences, most urgent first.',
  'Use ONLY these facts. Do not add, change, total or round any number. Do not add advice, dates or names that are not in the facts.',
  'No greeting, no headings, no lists.',
].join('\n');

/**
 * A model's wording of today's insights — shown only if it adds no number of
 * its own. Otherwise the plain sentences stand, and the reason is given.
 */
export async function phrase(role: string, today = istToday()) {
  const provider = aiProvider('prose');
  if (!provider.isConfigured() || !provider.supports('prose')) throw notConfigured('Wording (AI)');
  const { items } = await insightsFor(role, today);
  const facts = items.map(i => `- ${i.text}`).join('\n');
  if (!items.length) return { text: null, facts, reason: 'Nothing needs attention, so there is nothing to phrase.', model: null };
  try {
    const res = await provider.writeProse({ task: 'insights', instructions: PHRASE_INSTRUCTIONS, question: facts, maxTokens: 400 });
    const text = res.text.trim();
    const added = numbersAddedBy(text, facts);
    if (!text || added.length) {
      return { text: null, facts, reason: added.length ? `The wording added numbers that are not in the facts (${added.join(', ')}), so it is not shown.` : 'The model gave no wording.', model: res.model };
    }
    return { text, facts, reason: null, model: res.model };
  } catch (err) {
    const why = err instanceof AiOutputError ? err.message : 'The AI service did not answer';
    return { text: null, facts, reason: `${why}. The plain list below is complete.`, model: null };
  }
}
