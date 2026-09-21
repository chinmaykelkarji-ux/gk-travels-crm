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
