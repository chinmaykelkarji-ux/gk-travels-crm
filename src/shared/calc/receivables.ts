// ============================================================
// What customers still owe, and what a trip actually made.
//
// Money received is put against the oldest invoice first — the convention
// every customer understands — so an invoice-by-invoice age can be shown
// without asking anyone to allocate payments by hand.
// ============================================================

import { sumPaise } from './money';
import { agingSummary, type AgingKey } from './ledger';

export interface InvoiceForAging { id: string; number: string; date: string; dueDate: string | null; totalPaise: number; customerId: string | null; customerName: string }
export interface AgedInvoice extends InvoiceForAging { paidPaise: number; outstandingPaise: number; daysOverdue: number; bucket: AgingKey }

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Applies what has been received to invoices, oldest first, and ages what is left. */
export function ageInvoices(invoices: InvoiceForAging[], receivedPaise: number, today: string): AgedInvoice[] {
  let left = Math.max(0, receivedPaise);
  return [...invoices]
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
    .map(inv => {
      const paid = Math.min(inv.totalPaise, left);
      left -= paid;
      const outstanding = inv.totalPaise - paid;
      const due = inv.dueDate ?? inv.date;
      const daysOverdue = outstanding > 0 && due < today ? daysBetween(due, today) : 0;
      const { buckets } = agingSummary([{ daysOverdue, outstandingPaise: outstanding }]);
      const bucket = (buckets.find(b => b.amountPaise > 0)?.key ?? 'current') as AgingKey;
      return { ...inv, paidPaise: paid, outstandingPaise: outstanding, daysOverdue, bucket };
    });
}

/** One customer's position: what is owed, how late, and any money not yet used. */
export function customerPosition(aged: AgedInvoice[], unusedAdvancePaise: number) {
  const outstanding = sumPaise(aged.map(a => a.outstandingPaise));
  const overdue = sumPaise(aged.filter(a => a.daysOverdue > 0).map(a => a.outstandingPaise));
  return { outstandingPaise: outstanding, overduePaise: overdue, unusedAdvancePaise, netPaise: outstanding - unusedAdvancePaise };
}

// ── Trip profitability ────────────────────────────────────────

export interface TripMoney {
  /** What the customer has been billed (invoices less credit notes), and what the bookings say the tour is worth. */
  invoicedPaise: number;
  contractedPaise: number;
  receivedPaise: number;
  /** Costs actually recorded: supplier bills and money spent. */
  actualCostPaise: { code: string; label: string; amountPaise: number }[];
  /** What the operations records expected to spend. */
  plannedCostPaise: { label: string; amountPaise: number }[];
}

export interface TripProfit {
  revenuePaise: number;
  revenueBasis: 'invoiced' | 'contracted';
  actualCostPaise: number;
  plannedCostPaise: number;
  marginPaise: number;
  marginPct: number;
  costLines: { label: string; actualPaise: number; plannedPaise: number }[];
  receivedPaise: number;
  balancePaise: number;
}

const COST_LABELS: Record<string, string> = {
  '5000': 'Hotels', '5010': 'Transport', '5020': 'Tickets', '5030': 'Activities', '5040': 'Other trip costs',
};

/**
 * What the trip made. Revenue is what has been invoiced; before any invoice
 * exists the bookings' value is used, and the answer says which it is, so a
 * half-billed tour never looks like a loss.
 */
export function tripProfit(m: TripMoney): TripProfit {
  const revenueBasis = m.invoicedPaise > 0 ? 'invoiced' : 'contracted';
  const revenue = revenueBasis === 'invoiced' ? m.invoicedPaise : m.contractedPaise;
  const actual = sumPaise(m.actualCostPaise.map(c => c.amountPaise));
  const planned = sumPaise(m.plannedCostPaise.map(c => c.amountPaise));
  const byLabel = new Map<string, { actualPaise: number; plannedPaise: number }>();
  for (const c of m.actualCostPaise) {
    const label = COST_LABELS[c.code] ?? c.label;
    const row = byLabel.get(label) ?? { actualPaise: 0, plannedPaise: 0 };
    row.actualPaise += c.amountPaise;
    byLabel.set(label, row);
  }
  for (const c of m.plannedCostPaise) {
    const row = byLabel.get(c.label) ?? { actualPaise: 0, plannedPaise: 0 };
    row.plannedPaise += c.amountPaise;
    byLabel.set(c.label, row);
  }
  const margin = revenue - actual;
  return {
    revenuePaise: revenue,
    revenueBasis,
    actualCostPaise: actual,
    plannedCostPaise: planned,
    marginPaise: margin,
    marginPct: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0,
    costLines: [...byLabel.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.actualPaise - a.actualPaise || b.plannedPaise - a.plannedPaise),
    receivedPaise: m.receivedPaise,
    balancePaise: revenue - m.receivedPaise,
  };
}
