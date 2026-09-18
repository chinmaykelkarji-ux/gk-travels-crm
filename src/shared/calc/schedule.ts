// Payment schedules for booking contracts. Pure and dependency-free.
//
// Default rule (Indian leisure travel convention): an advance on
// confirmation, the balance 15 days before departure. Short-notice bookings
// collapse to a single instalment due today. Amounts are whole rupees and
// always sum to the contract total (rounding goes to the last instalment).

export interface ScheduleItem { seq: number; label: string; dueDate: string; amount: number }
export type InstalmentStatus = 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE' | 'UPCOMING';
export interface InstalmentState extends ScheduleItem { paidAmount: number; status: InstalmentStatus }

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => isoDay(new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS));

export interface DefaultScheduleOptions { advancePct?: number; balanceDaysBeforeDeparture?: number; minDaysBetween?: number }

/** Builds the default two-instalment schedule for a total on a given departure date. */
export function defaultSchedule(total: number, opts: { today: string; departureDate?: string | null } & DefaultScheduleOptions): ScheduleItem[] {
  const t = Math.max(0, Math.round(total));
  if (t === 0) return [];
  const advancePct = opts.advancePct ?? 50;
  const before = opts.balanceDaysBeforeDeparture ?? 15;
  const minGap = opts.minDaysBetween ?? 3;
  const balanceDue = opts.departureDate ? addDays(opts.departureDate, -before) : null;
  if (!balanceDue || balanceDue <= addDays(opts.today, minGap)) {
    return [{ seq: 1, label: 'Full payment', dueDate: opts.today, amount: t }];
  }
  const advance = Math.round(t * advancePct / 100);
  return [
    { seq: 1, label: 'Advance', dueDate: opts.today, amount: advance },
    { seq: 2, label: 'Balance', dueDate: balanceDue, amount: t - advance },
  ];
}

/** Validates a user-edited schedule against the contract total. */
export function validateSchedule(items: ScheduleItem[], total: number): string[] {
  const errors: string[] = [];
  if (!items.length) errors.push('At least one instalment is required');
  const sum = items.reduce((s, i) => s + Math.round(i.amount), 0);
  if (Math.round(total) !== sum) errors.push(`Instalments total ₹${sum.toLocaleString('en-IN')} but the contract is ₹${Math.round(total).toLocaleString('en-IN')}`);
  items.forEach((i, idx) => {
    if (!(i.amount > 0)) errors.push(`Instalment ${idx + 1} must be more than zero`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)) errors.push(`Instalment ${idx + 1} needs a due date`);
    if (idx > 0 && i.dueDate < items[idx - 1].dueDate) errors.push(`Instalment ${idx + 1} is due before the previous one`);
  });
  return errors;
}

/** Allocates money received to instalments in order and derives each instalment's status. */
export function allocatePayments(items: ScheduleItem[], received: number, today: string): InstalmentState[] {
  let left = Math.max(0, received);
  return [...items].sort((a, b) => a.seq - b.seq).map(i => {
    const paidAmount = Math.min(i.amount, left);
    left -= paidAmount;
    let status: InstalmentStatus;
    if (paidAmount >= i.amount) status = 'PAID';
    else if (paidAmount > 0) status = i.dueDate < today ? 'OVERDUE' : 'PARTIAL';
    else if (i.dueDate < today) status = 'OVERDUE';
    else if (i.dueDate <= addDays(today, 7)) status = 'DUE';
    else status = 'UPCOMING';
    return { ...i, paidAmount, status };
  });
}

export function scheduleSummary(states: InstalmentState[]) {
  const total = states.reduce((s, i) => s + i.amount, 0);
  const paid = states.reduce((s, i) => s + i.paidAmount, 0);
  const overdue = states.filter(i => i.status === 'OVERDUE').reduce((s, i) => s + i.amount - i.paidAmount, 0);
  const next = states.find(i => i.status !== 'PAID') ?? null;
  return { total, paid, balance: total - paid, overdue, next };
}
