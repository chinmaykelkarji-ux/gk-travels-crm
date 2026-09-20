// ============================================================
// Classic payables → supplier bills. The old "Suppliers & payables" screen
// keeps one row per supplier commitment (total cost, advance paid, paid
// flag). Each row becomes a bill, and the advance — plus the remainder when
// the row was marked paid — becomes payments against it. Once each
// (legacyPayableId); the classic rows are left untouched.
//
// Classic *supplier payments* in the payments table carry no supplier id,
// so they are not guessed at here; they stay where they are and are
// reported as skipped.
// ============================================================

import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId } from '../../core/numbering.js';
import { toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { EXPENSE_ACCOUNT, MONEY_ACCOUNT } from '../../../../src/shared/calc/ledger.js';
import { BILL_CATEGORY_LABEL, type BillCategory } from '../../../../src/shared/contracts/payables.js';
import { dayDate } from '../masters/common.js';
import { postEntry } from '../ledger/service.js';

const CATEGORY_PATTERNS: [RegExp, BillCategory][] = [
  [/hotel|resort|lodge|stay|room/i, 'HOTEL'],
  [/bus|cab|taxi|car|tempo|traveller|transport|driver|vehicle/i, 'TRANSPORT'],
  [/flight|air|train|rail|irctc|ticket|pnr/i, 'TICKET'],
  [/darshan|activity|guide|entry|boat|sightsee|pass/i, 'ACTIVITY'],
];
/** What the old description says it was for; anything unclear is "other trip cost". */
export function categoryFromText(text: string | null | undefined): BillCategory {
  const t = (text ?? '').trim();
  for (const [re, cat] of CATEGORY_PATTERNS) if (re.test(t)) return cat;
  return 'OTHER_TRIP';
}

const PAYABLE = '2000';
const isDay = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export interface PayablesImportResult { bills: number; payments: number; skipped: number; supplierPaymentsLeft: number }

export async function importLegacyPayables(limit = 200): Promise<PayablesImportResult> {
  const done = await prisma.vendorBill.findMany({ where: { legacyPayableId: { not: null } }, select: { legacyPayableId: true } });
  const seen = new Set(done.map(d => d.legacyPayableId!));
  const rows = await prisma.vendorPayment.findMany({ orderBy: { createdAt: 'asc' }, take: limit + seen.size });
  const todo = rows.filter(r => !seen.has(r.id)).slice(0, limit);
  const out: PayablesImportResult = { bills: 0, payments: 0, skipped: 0, supplierPaymentsLeft: 0 };

  for (const r of todo) {
    const billDate = [r.createdDate, r.paidDate, r.dueDate].find(isDay);
    const total = Number(r.totalCost ?? 0);
    if (!billDate || !(total > 0)) { out.skipped++; continue; }
    const vendor = await prisma.vendor.findUnique({ where: { id: r.vendorId }, select: { id: true, name: true } });
    if (!vendor) { out.skipped++; continue; }
    const trip = r.tripId ? await prisma.trip.findUnique({ where: { id: r.tripId }, select: { id: true } }) : null;
    const category = categoryFromText(`${r.description ?? ''} ${r.tripName ?? ''}`);
    const what = r.description || r.tripName || BILL_CATEGORY_LABEL[category];

    await prisma.$transaction(async tx => {
      const billId = await nextDisplayId(tx, 'BILL', { displayPrefix: 'BILL' });
      const billEntry = await postEntry(tx, {
        date: billDate, narration: `${billId}: ${vendor.name} — ${what} (classic payable ${r.id})`, sourceType: 'vendor_bill', sourceId: billId,
        vendorId: vendor.id, tripId: trip?.id ?? null,
        lines: [{ code: EXPENSE_ACCOUNT[category], debit: total, description: what }, { code: PAYABLE, credit: total, description: vendor.name }],
      }, null);
      await tx.vendorBill.create({
        data: {
          id: billId, vendorId: vendor.id, billNumber: `CLASSIC-${r.id}`, billDate: dayDate(billDate)!, dueDate: dayDate(isDay(r.dueDate) ? r.dueDate : null),
          category, amount: total, gstAmount: 0, tripId: trip?.id ?? null, description: what, notes: r.notes,
          ledgerTransactionId: billEntry.id, legacyPayableId: r.id,
        },
      });
      out.bills++;

      // What the classic screen says has been paid: the advance, and the rest when it was marked paid.
      const advance = Number(r.advancePaid ?? 0);
      const parts: { amount: number; note: string }[] = [];
      if (advance > 0) parts.push({ amount: Math.min(advance, total), note: 'Advance recorded on the classic screen' });
      const rest = toRupees(toPaise(total) - toPaise(Math.min(advance, total)));
      if (r.isPaid && rest > 0) parts.push({ amount: rest, note: 'Marked paid on the classic screen' });

      for (const part of parts) {
        const payId = await nextDisplayId(tx, 'VP', { displayPrefix: 'VP' });
        const payDate = isDay(r.paidDate) ? r.paidDate : billDate;
        const entry = await postEntry(tx, {
          date: payDate, narration: `${payId}: paid ${vendor.name} for bill ${billId} — ${part.note}`, sourceType: 'vendor_payment', sourceId: payId,
          vendorId: vendor.id, tripId: trip?.id ?? null,
          lines: [{ code: PAYABLE, debit: part.amount, description: `Bill ${billId}` }, { code: MONEY_ACCOUNT.OTHER, credit: part.amount, description: 'Method not recorded on the classic screen' }],
        }, null);
        await tx.vendorPaymentV2.create({
          data: { id: payId, vendorId: vendor.id, billId, tripId: trip?.id ?? null, amount: part.amount, mode: 'OTHER', paidAt: dayDate(payDate)!, notes: part.note, ledgerTransactionId: entry.id, legacyPaymentId: `${r.id}:${parts.indexOf(part)}` },
        });
        out.payments++;
      }
      await audit(tx, {
        action: 'vendor_bill_imported', entityType: 'vendor', entityId: vendor.id, source: 'SYSTEM',
        description: `${billId}: classic payable ${r.id} for ${vendor.name} (₹${total.toLocaleString('en-IN')}${parts.length ? `, ${parts.length} payment(s)` : ''}) brought into the books`,
        after: { billId, legacyPayableId: r.id, amount: total, category },
      });
    });
  }

  out.supplierPaymentsLeft = await prisma.payment.count({ where: { type: 'supplier' } });
  return out;
}
