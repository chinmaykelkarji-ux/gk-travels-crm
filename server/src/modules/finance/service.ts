// ============================================================
// Finance read models: what customers owe (aged), and what a trip made.
//
// Both are derived from the ledger and the records behind it — nothing is
// stored twice, so these numbers and the books can never disagree.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../core/errors.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import { sumPaise, toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { agingSummary } from '../../../../src/shared/calc/ledger.js';
import { ageInvoices, customerPosition, tripProfit, type InvoiceForAging } from '../../../../src/shared/calc/receivables.js';
import { dayDate } from '../masters/common.js';

const RECEIVABLE = '1100';
const ADVANCES = '2100';
const INCOME = ['4000', '4010', '4020'];
const TRIP_COSTS = ['5000', '5010', '5020', '5030', '5040'];

async function netPaise(where: Prisma.LedgerLineWhereInput, debitPositive = true) {
  const s = await prisma.ledgerLine.aggregate({ where, _sum: { debit: true, credit: true } });
  const debit = toPaise(Number(s._sum.debit ?? 0));
  const credit = toPaise(Number(s._sum.credit ?? 0));
  return debitPositive ? debit - credit : credit - debit;
}

/** Every customer who owes money, oldest invoice first, grouped by how late it is. */
export async function receivables(today = istToday()) {
  const invoices = await prisma.invoice.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, totalAmount: true, customerId: true, customerName: true },
    orderBy: { invoiceDate: 'asc' },
  });
  const notes = await prisma.creditNote.groupBy({ by: ['invoiceId'], where: { status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } });
  const creditByInvoice = new Map(notes.map(n => [n.invoiceId, toPaise(Number(n._sum.totalAmount ?? 0))]));

  const byCustomer = new Map<string, InvoiceForAging[]>();
  for (const inv of invoices) {
    const key = inv.customerId ?? `name:${inv.customerName}`;
    const totalPaise = toPaise(Number(inv.totalAmount)) - (creditByInvoice.get(inv.id) ?? 0);
    if (totalPaise <= 0) continue;
    byCustomer.set(key, [...(byCustomer.get(key) ?? []), {
      id: inv.id, number: inv.invoiceNumber, date: inv.invoiceDate.slice(0, 10), dueDate: inv.dueDate?.slice(0, 10) ?? null,
      totalPaise, customerId: inv.customerId, customerName: inv.customerName,
    }]);
  }

  const rows = [];
  for (const [key, list] of byCustomer) {
    const customerId = list[0].customerId;
    const where: Prisma.LedgerLineWhereInput = customerId
      ? { accountCode: RECEIVABLE, OR: [{ customerId }, { transaction: { customerId } }] }
      : { accountCode: RECEIVABLE, description: { contains: list[0].customerName } };
    // Everything credited to the customer's dues: money received and credit notes.
    const creditedPaise = await netPaise({ ...where, credit: { gt: 0 } }, false);
    const aged = ageInvoices(list, creditedPaise, today);
    const advance = customerId ? Math.max(0, await netPaise({ accountCode: ADVANCES, OR: [{ customerId }, { transaction: { customerId } }] }, false)) : 0;
    const position = customerPosition(aged, advance);
    if (position.outstandingPaise <= 0 && advance <= 0) continue;
    rows.push({
      key, customerId, customerName: list[0].customerName,
      outstanding: toRupees(position.outstandingPaise), overdue: toRupees(position.overduePaise),
      unusedAdvance: toRupees(position.unusedAdvancePaise), net: toRupees(position.netPaise),
      received: toRupees(creditedPaise),
      invoices: aged.filter(a => a.outstandingPaise > 0).map(a => ({
        id: a.id, number: a.number, date: a.date, dueDate: a.dueDate, total: toRupees(a.totalPaise),
        outstanding: toRupees(a.outstandingPaise), daysOverdue: a.daysOverdue, bucket: a.bucket,
      })),
    });
  }
  rows.sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);

  const aging = agingSummary(rows.flatMap(r => r.invoices.map(i => ({ daysOverdue: i.daysOverdue, outstandingPaise: toPaise(i.outstanding) }))));
  return {
    today,
    total: toRupees(aging.totalPaise), overdue: toRupees(aging.overduePaise),
    buckets: aging.buckets.map(b => ({ ...b, amount: toRupees(b.amountPaise) })),
    customers: rows,
  };
}

/** What a trip has earned and spent: billed, received, costs actually recorded against what was planned. */
export async function profitForTrip(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true, tourName: true, destination: true, stage: true, totalPayable: true,
      contracts: { where: { status: { not: 'CANCELLED' } }, select: { totalAmount: true } },
      hotelBookings: { where: { status: { not: 'CANCELLED' } }, select: { costAmount: true } },
      vehicleAssignments: { where: { status: { not: 'CANCELLED' } }, select: { costAmount: true } },
      activityBookings: { where: { status: { not: 'CANCELLED' } }, select: { costAmount: true } },
      tickets: { where: { status: { not: 'CANCELLED' } }, select: { costAmount: true } },
    },
  });
  if (!trip) throw notFound('Trip');

  const tripLine = (codes: string[]): Prisma.LedgerLineWhereInput => ({ accountCode: { in: codes }, OR: [{ tripId }, { transaction: { tripId } }] });
  const [invoiced, received, costRows] = await Promise.all([
    netPaise(tripLine(INCOME), false),
    netPaise({ accountCode: { in: [RECEIVABLE, ADVANCES] }, OR: [{ tripId }, { transaction: { tripId } }], credit: { gt: 0 }, transaction: { sourceType: { in: ['receipt', 'refund'] } } }, false),
    prisma.ledgerLine.groupBy({ by: ['accountCode'], where: tripLine(TRIP_COSTS), _sum: { debit: true, credit: true } }),
  ]);

  const actualCostPaise = costRows.map(r => ({
    code: r.accountCode, label: r.accountCode,
    amountPaise: toPaise(Number(r._sum.debit ?? 0)) - toPaise(Number(r._sum.credit ?? 0)),
  })).filter(c => c.amountPaise !== 0);

  const planned = [
    { label: 'Hotels', amountPaise: sumPaise(trip.hotelBookings.map(h => toPaise(Number(h.costAmount ?? 0)))) },
    { label: 'Transport', amountPaise: sumPaise(trip.vehicleAssignments.map(v => toPaise(Number(v.costAmount ?? 0)))) },
    { label: 'Activities', amountPaise: sumPaise(trip.activityBookings.map(a => toPaise(Number(a.costAmount ?? 0)))) },
    { label: 'Tickets', amountPaise: sumPaise(trip.tickets.map(t => toPaise(Number(t.costAmount ?? 0)))) },
  ].filter(p => p.amountPaise > 0);

  const contracted = sumPaise(trip.contracts.map(c => toPaise(Number(c.totalAmount ?? 0)))) || toPaise(Number(trip.totalPayable ?? 0));
  const p = tripProfit({ invoicedPaise: invoiced, contractedPaise: contracted, receivedPaise: received, actualCostPaise, plannedCostPaise: planned });

  return {
    trip: { id: trip.id, label: trip.tourName ?? trip.destination, stage: trip.stage },
    revenue: toRupees(p.revenuePaise), revenueBasis: p.revenueBasis,
    actualCost: toRupees(p.actualCostPaise), plannedCost: toRupees(p.plannedCostPaise),
    margin: toRupees(p.marginPaise), marginPct: p.marginPct,
    received: toRupees(p.receivedPaise), balance: toRupees(p.balancePaise),
    costLines: p.costLines.map(l => ({ label: l.label, actual: toRupees(l.actualPaise), planned: toRupees(l.plannedPaise) })),
  };
}

// ── The money summary ─────────────────────────────────────────

const CASH = ['1000', '1010', '1020', '1030'];
const EXPENSES = ['5000', '5010', '5020', '5030', '5040', '6000', '6010', '6020', '6030', '6040'];
const PAYABLE = '2000';
const OUTPUT_GST = '2200';
const INPUT_GST = '1300';
const TCS_PAYABLE = '2210';
const STAFF_OWED = '2400';

/** Month by month income and spending, from the ledger. */
async function monthlySeries(from: string, to: string) {
  const rows = await prisma.$queryRaw<{ month: string; code: string; debit: number; credit: number }[]>`
    SELECT to_char(t."date", 'YYYY-MM') AS month, l."accountCode" AS code,
           COALESCE(SUM(l."debit"), 0)::float8 AS debit, COALESCE(SUM(l."credit"), 0)::float8 AS credit
    FROM "ledger_lines" l
    JOIN "ledger_transactions" t ON t."id" = l."transactionId"
    WHERE t."date" BETWEEN ${dayDate(from)!}::date AND ${dayDate(to)!}::date
      AND l."accountCode" = ANY(${[...INCOME, ...EXPENSES]})
    GROUP BY 1, 2
    ORDER BY 1`;
  const months = new Map<string, { month: string; incomePaise: number; expensePaise: number }>();
  for (const r of rows) {
    const m = months.get(r.month) ?? { month: r.month, incomePaise: 0, expensePaise: 0 };
    if (INCOME.includes(r.code)) m.incomePaise += toPaise(r.credit) - toPaise(r.debit);
    else m.expensePaise += toPaise(r.debit) - toPaise(r.credit);
    months.set(r.month, m);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * One page of numbers for the owner: what came in and went out over a
 * period, what is in hand, what is owed both ways, and where the tax stands.
 * Every figure is read from the ledger, so it agrees with the books.
 */
export async function moneySummary(from: string, to: string) {
  const period: Prisma.LedgerLineWhereInput = { transaction: { date: { gte: dayDate(from)!, lte: dayDate(to)! } } };
  const [income, expense, cash, dues, advances, payable, outputGst, inputGst, tcs, staffOwed, months] = await Promise.all([
    netPaise({ ...period, accountCode: { in: INCOME } }, false),
    netPaise({ ...period, accountCode: { in: EXPENSES } }),
    netPaise({ accountCode: { in: CASH } }),
    netPaise({ accountCode: RECEIVABLE }),
    netPaise({ accountCode: ADVANCES }, false),
    netPaise({ accountCode: PAYABLE }, false),
    netPaise({ accountCode: OUTPUT_GST }, false),
    netPaise({ accountCode: INPUT_GST }),
    netPaise({ accountCode: TCS_PAYABLE }, false),
    netPaise({ accountCode: STAFF_OWED }, false),
    monthlySeries(from, to),
  ]);

  // The trips that made the most in the period, by what was billed less what it cost.
  const tripRows = await prisma.ledgerLine.groupBy({
    by: ['tripId'],
    where: { ...period, tripId: { not: null }, accountCode: { in: [...INCOME, ...TRIP_COSTS] } },
    _sum: { debit: true, credit: true },
  });
  const tripIds = tripRows.map(r => r.tripId!).filter(Boolean);
  const trips = tripIds.length ? await prisma.trip.findMany({ where: { id: { in: tripIds } }, select: { id: true, tourName: true, destination: true } }) : [];
  const tripName = new Map(trips.map(t => [t.id, t.tourName ?? t.destination]));
  const byTrip = await Promise.all(tripIds.map(async id => {
    const [billed, cost] = await Promise.all([
      netPaise({ ...period, accountCode: { in: INCOME }, OR: [{ tripId: id }, { transaction: { tripId: id } }] }, false),
      netPaise({ ...period, accountCode: { in: TRIP_COSTS }, OR: [{ tripId: id }, { transaction: { tripId: id } }] }),
    ]);
    return { tripId: id, label: tripName.get(id) ?? id, billed: toRupees(billed), cost: toRupees(cost), margin: toRupees(billed - cost) };
  }));

  return {
    from, to,
    income: toRupees(income), expense: toRupees(expense), profit: toRupees(income - expense),
    cashInHand: toRupees(cash),
    owedToUs: toRupees(Math.max(0, dues)), receivedNotBilled: toRupees(Math.max(0, advances)),
    owedBySupplier: toRupees(Math.max(0, payable)), owedToStaff: toRupees(Math.max(0, staffOwed)),
    tax: { outputGst: toRupees(outputGst), inputGst: toRupees(inputGst), netGst: toRupees(outputGst - inputGst), tcsPayable: toRupees(tcs) },
    months: months.map(m => ({ month: m.month, income: toRupees(m.incomePaise), expense: toRupees(m.expensePaise), profit: toRupees(m.incomePaise - m.expensePaise) })),
    topTrips: byTrip.sort((a, b) => b.margin - a.margin).slice(0, 8),
  };
}
