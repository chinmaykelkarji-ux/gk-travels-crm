// ============================================================
// TCS on overseas tour packages.
//
// It is charged only when the owner has switched the rule on (it ships off,
// with a note telling them to check with their CA), only on invoices whose
// trips are international, and only on the part of the year's billing to
// that customer that goes past the limit in the rule.
// ============================================================

import type { DbClient } from '../../lib/prisma.js';
import { toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { financialYear, financialYearRange, tcsOn } from '../../../../src/shared/calc/tax.js';
import { ruleFor } from '../tax/service.js';

export interface TcsResult { isOverseas: boolean; rate: number | null; amount: number }

export async function tcsForInvoice(
  db: DbClient,
  input: { customerId: string | null; tripIds: string[]; invoiceDate: string; amount: number },
): Promise<TcsResult> {
  const day = input.invoiceDate.slice(0, 10);
  const overseas = input.tripIds.length
    ? (await db.trip.count({ where: { id: { in: input.tripIds }, isInternational: true } })) > 0
    : false;
  if (!overseas) return { isOverseas: false, rate: null, amount: 0 };

  const rule = await ruleFor('TCS_OVERSEAS_PACKAGE', day, db);
  if (!rule.enabled || rule.rate <= 0) return { isOverseas: true, rate: null, amount: 0 };

  // What this customer has already been billed for overseas packages this financial year.
  const { from, to } = financialYearRange(financialYear(day));
  const billed = input.customerId
    ? await db.invoice.aggregate({
        where: { customerId: input.customerId, isOverseas: true, status: { not: 'CANCELLED' }, invoiceDate: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      })
    : null;

  const { tcsPaise } = tcsOn(toPaise(input.amount), toPaise(Number(billed?._sum.totalAmount ?? 0)), rule.rate, toPaise(rule.threshold));
  return { isOverseas: true, rate: rule.rate, amount: toRupees(tcsPaise) };
}
