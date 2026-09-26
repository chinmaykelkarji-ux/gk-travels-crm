// ============================================================
// Reports — read models over the records TravelOS already keeps.
//
// Each section is computed by plain queries for a period and returned as
// counts, rupee sums (added in paise), rates and medians. Nothing is
// sampled, estimated or asked of a model. The route shows a section only to
// a role that could open the screens behind it.
// ============================================================

import { prisma } from '../../lib/prisma.js';
import { istToday, addDays } from '../../../../src/shared/calc/istTime.js';
import { toPaise, toRupees, sumPaise } from '../../../../src/shared/calc/money.js';
import { countByMonth, lastMonths, median, rate, topBy } from '../../../../src/shared/calc/analytics.js';
import * as finance from '../finance/service.js';
import * as payables from '../payables/service.js';

export interface Period { from: string; to: string }
const range = (p: Period) => ({ gte: new Date(`${p.from}T00:00:00+05:30`), lte: new Date(`${p.to}T23:59:59.999+05:30`) });

export function defaultPeriod(today = istToday()): Period {
  return { from: addDays(today, -364), to: today };
}

export async function sales(p: Period) {
  const [enquiries, quotes] = await Promise.all([
    prisma.enquiry.findMany({ where: { deletedAt: null, createdAt: range(p) }, select: { status: true, source: true, destination: true, createdAt: true } }),
    prisma.salesQuote.findMany({ where: { createdAt: range(p) }, select: { status: true, totalAmount: true, sentAt: true, createdAt: true } }),
  ]);
  const byStatus = Object.fromEntries(['NEW', 'IN_PROGRESS', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST'].map(s => [s, enquiries.filter(e => e.status === s).length]));
  const bySource = Object.entries(enquiries.reduce<Record<string, number>>((a, e) => ({ ...a, [e.source]: (a[e.source] ?? 0) + 1 }), {}))
    .map(([source, count]) => ({ source, count, won: enquiries.filter(e => e.source === source && e.status === 'WON').length })).sort((a, b) => b.count - a.count);
  const sent = quotes.filter(q => q.sentAt || ['SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(q.status));
  const accepted = quotes.filter(q => q.status === 'ACCEPTED');
  const months = lastMonths(12, p.to);
  return {
    enquiries: enquiries.length, byStatus,
    // Of the enquiries that reached a decision, how many were won.
    winRate: rate(byStatus.WON, byStatus.WON + byStatus.LOST),
    bySource,
    quotes: { made: quotes.length, sent: sent.length, accepted: accepted.length, acceptedValue: toRupees(sumPaise(accepted.map(q => toPaise(Number(q.totalAmount))))), acceptRate: rate(accepted.length, sent.length) },
    monthly: countByMonth(enquiries.map(e => e.createdAt), months),
    topDestinations: topBy(Object.entries(enquiries.reduce<Record<string, number>>((a, e) => ({ ...a, [e.destination]: (a[e.destination] ?? 0) + 1 }), {})).map(([name, count]) => ({ name, count })), r => r.count, 8),
  };
}

export async function operations(today = istToday()) {
  const soon = addDays(today, 30);
  const [stages, departing, tickets, hotelConf, openTasks] = await Promise.all([
    prisma.trip.groupBy({ by: ['stage'], _count: { _all: true } }),
    prisma.trip.count({ where: { stage: { in: ['PLANNING', 'CONFIRMING', 'READY'] }, departure: { gte: today, lte: soon } } }),
    prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.hotelBooking.findMany({ where: { confirmedAt: { not: null }, requestedAt: { not: null }, createdAt: { gte: new Date(Date.now() - 365 * 86_400_000) } }, select: { requestedAt: true, confirmedAt: true } }),
    prisma.task.groupBy({ by: ['priority'], where: { status: { in: ['pending', 'in_progress'] }, dueAt: { lt: new Date() } }, _count: { _all: true } }),
  ]);
  const hours = hotelConf.map(h => (h.confirmedAt!.getTime() - h.requestedAt!.getTime()) / 3_600_000).filter(x => x >= 0);
  const ticketCount = (s: string[]) => tickets.filter(t => s.includes(t.status)).reduce((a, t) => a + t._count._all, 0);
  const live = ticketCount(['CONFIRMED', 'PARTIAL', 'WAITLISTED', 'RAC']);
  return {
    tripsByStage: Object.fromEntries(stages.map(s => [s.stage, s._count._all])),
    departingIn30Days: departing,
    tickets: { confirmed: ticketCount(['CONFIRMED']), waitlistedOrRac: ticketCount(['WAITLISTED', 'RAC', 'PARTIAL']), waitlistShare: rate(ticketCount(['WAITLISTED', 'RAC', 'PARTIAL']), live) },
    hotelConfirmation: { confirmed: hours.length, medianHours: median(hours) === null ? null : Math.round(median(hours)! * 10) / 10 },
    overdueTasks: Object.fromEntries(openTasks.map(t => [t.priority, t._count._all])),
  };
}

export async function money(p: Period) {
  const [summary, receivables] = await Promise.all([finance.moneySummary(p.from, p.to), finance.receivables()]);
  return {
    period: p,
    income: summary.income, expense: summary.expense, profit: summary.profit,
    monthly: summary.months,
    owedToUs: receivables.total, overdue: receivables.overdue,
    aging: receivables.buckets.map(b => ({ label: b.label, amount: b.amount })),
    topCustomersOwing: receivables.customers.slice(0, 8).map(c => ({ name: c.customerName, outstanding: c.outstanding, overdue: c.overdue })),
    note: 'From the books. Tax figures are for information; verify with the CA before filing.',
  };
}

export async function customers(p: Period) {
  const months = lastMonths(12, p.to);
  const [created, trips] = await Promise.all([
    prisma.customer.findMany({ where: { createdAt: range(p) }, select: { createdAt: true } }),
    prisma.trip.findMany({ where: { stage: { not: 'CANCELLED' }, customerId: { not: null } }, select: { customerId: true, destination: true, customer: true } }),
  ]);
  const perCustomer = trips.reduce<Record<string, { name: string; trips: number }>>((a, t) => {
    const k = t.customerId!; a[k] = { name: t.customer ?? k, trips: (a[k]?.trips ?? 0) + 1 }; return a;
  }, {});
  const withTrips = Object.values(perCustomer);
  const repeat = withTrips.filter(c => c.trips >= 2).length;
  return {
    newCustomers: created.length,
    monthlyNew: countByMonth(created.map(c => c.createdAt), months),
    customersWithTrips: withTrips.length, repeatCustomers: repeat, repeatRate: rate(repeat, withTrips.length),
    topCustomers: topBy(withTrips, c => c.trips, 8),
    topDestinations: topBy(Object.entries(trips.reduce<Record<string, number>>((a, t) => ({ ...a, [t.destination]: (a[t.destination] ?? 0) + 1 }), {})).map(([name, count]) => ({ name, count })), r => r.count, 8),
  };
}

/**
 * Supplier scorecards — the groundwork for a supplier network: how each
 * supplier bills and is paid, and how fast hotels confirm, from this
 * organisation's own records only.
 */
export async function suppliers(p: Period) {
  const [aging, bills, hotels] = await Promise.all([
    payables.payablesAging(),
    prisma.vendorBill.findMany({ where: { billDate: { gte: new Date(`${p.from}T00:00:00Z`), lte: new Date(`${p.to}T00:00:00Z`) }, status: { not: 'CANCELLED' } }, select: { vendorId: true, amount: true, vendor: { select: { name: true } } } }),
    prisma.hotelBooking.findMany({ where: { createdAt: range(p) }, select: { hotelName: true, status: true, requestedAt: true, confirmedAt: true } }),
  ]);
  const billed = new Map<string, { name: string; bills: number; billedPaise: number }>();
  for (const b of bills) {
    const r = billed.get(b.vendorId) ?? { name: b.vendor.name, bills: 0, billedPaise: 0 };
    // A bill's amount already includes its GST.
    r.bills++; r.billedPaise += toPaise(Number(b.amount)); billed.set(b.vendorId, r);
  }
  const owing = new Map(aging.vendors.map(v => [v.vendorId, v]));
  const vendors = topBy([...new Set([...billed.keys(), ...owing.keys()])].map(id => {
    const b = billed.get(id); const o = owing.get(id);
    return { name: b?.name ?? o?.vendor ?? id, bills: b?.bills ?? 0, billed: toRupees(b?.billedPaise ?? 0), outstanding: o?.outstanding ?? 0, overdue: o?.overdue ?? 0 };
  }), r => r.billed, 15);
  const byHotel = new Map<string, { total: number; confirmed: number; cancelled: number; hours: number[] }>();
  for (const h of hotels) {
    const r = byHotel.get(h.hotelName) ?? { total: 0, confirmed: 0, cancelled: 0, hours: [] };
    r.total++;
    if (h.status === 'CONFIRMED') r.confirmed++;
    if (h.status === 'CANCELLED') r.cancelled++;
    if (h.requestedAt && h.confirmedAt) r.hours.push((h.confirmedAt.getTime() - h.requestedAt.getTime()) / 3_600_000);
    byHotel.set(h.hotelName, r);
  }
  const hotelRows = topBy([...byHotel.entries()].map(([name, r]) => ({
    name, bookings: r.total, confirmedRate: rate(r.confirmed, r.total - r.cancelled), medianHoursToConfirm: median(r.hours) === null ? null : Math.round(median(r.hours)! * 10) / 10,
  })), r => r.bookings, 15);
  return { vendors, hotels: hotelRows };
}

