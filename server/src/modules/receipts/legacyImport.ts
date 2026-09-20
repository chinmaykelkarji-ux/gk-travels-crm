// ============================================================
// Classic payments → receipts. The old screens write into `payments`;
// this carries the customer ones into `customer_receipts` with their
// ledger postings, once each (legacyPaymentId). The classic rows are left
// exactly as they are, so the old screens keep working.
//
// Supplier payments are left alone here — they belong with vendor bills.
// A payment method the old screen never recorded lands in "Unsorted
// receipts" (1030) rather than being guessed at.
// ============================================================

import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextFreeDisplayId } from '../../core/numbering.js';
import type { ReceiptMode } from '../../../../src/shared/contracts/receipts.js';
import { RECEIPT_MODE_LABEL } from '../../../../src/shared/contracts/receipts.js';
import { dayDate } from '../masters/common.js';
import { postEntry } from '../ledger/service.js';
import { refreshTripMoney } from './service.js';

const MODE_PATTERNS: [RegExp, ReceiptMode][] = [
  [/cash/i, 'CASH'],
  [/upi|gpay|google ?pay|phonepe|paytm|bhim|qr/i, 'UPI'],
  [/neft|imps|rtgs|bank|transfer|account/i, 'BANK_TRANSFER'],
  [/cheque|check|dd|demand draft/i, 'CHEQUE'],
  [/card|visa|master|amex|swipe|pos/i, 'CARD'],
  [/razorpay|payu|link|online|gateway|net ?banking/i, 'GATEWAY'],
];
/** The method as typed on the classic screen, or OTHER when it says nothing useful. */
export function modeFromMethod(method: string | null | undefined): ReceiptMode {
  const m = (method ?? '').trim();
  if (!m) return 'OTHER';
  for (const [re, mode] of MODE_PATTERNS) if (re.test(m)) return mode;
  return 'OTHER';
}

const MONEY_ACCOUNT: Record<ReceiptMode, string> = { CASH: '1000', UPI: '1010', BANK_TRANSFER: '1010', CHEQUE: '1010', CARD: '1020', GATEWAY: '1020', OTHER: '1030' };
const IMPORTABLE = ['received', 'paid'];

export interface LegacyPaymentImportResult { imported: number; skipped: number; unsorted: number; trips: string[] }

export async function importLegacyPayments(limit = 200): Promise<LegacyPaymentImportResult> {
  const done = await prisma.customerReceipt.findMany({ where: { legacyPaymentId: { not: null } }, select: { legacyPaymentId: true } });
  const seen = new Set(done.map(d => d.legacyPaymentId!));
  const rows = await prisma.payment.findMany({ where: { type: 'customer', status: { in: IMPORTABLE } }, orderBy: { createdAt: 'asc' }, take: limit + seen.size });
  const todo = rows.filter(r => !seen.has(r.id)).slice(0, limit);
  const out: LegacyPaymentImportResult = { imported: 0, skipped: 0, unsorted: 0, trips: [] };

  for (const p of todo) {
    const day = (p.paidDate ?? p.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(Number(p.amount) > 0)) { out.skipped++; continue; }
    const mode = modeFromMethod(p.method);
    const trip = p.tripId ? await prisma.trip.findUnique({ where: { id: p.tripId }, select: { id: true, customerId: true } }) : null;
    const customerId = (p.customerId && (await prisma.customer.findUnique({ where: { id: p.customerId }, select: { id: true } })) ? p.customerId : trip?.customerId) ?? null;
    // Only one party on the trip: the money can safely be tied to that family.
    const contracts = trip ? await prisma.bookingContract.findMany({ where: { tripId: trip.id, status: { not: 'CANCELLED' } }, select: { id: true } }) : [];
    const contractId = contracts.length === 1 ? contracts[0].id : null;

    await prisma.$transaction(async tx => {
      const receiptId = await nextFreeDisplayId(tx, 'RCP');
      const who = customerId ? await tx.customer.findUnique({ where: { id: customerId }, select: { name: true } }) : null;
      const label = `Received from ${who?.name ?? p.customer ?? 'customer'}${trip ? ` (${trip.id})` : ''}`;
      const entry = await postEntry(tx, {
        date: day, narration: `${receiptId}: ${label} · classic payment ${p.id}`, sourceType: 'receipt', sourceId: receiptId,
        tripId: trip?.id ?? null, contractId, customerId,
        lines: [
          { code: MONEY_ACCOUNT[mode], debit: Number(p.amount), description: mode === 'OTHER' ? `Method not recorded (${p.method || 'blank'})` : RECEIPT_MODE_LABEL[mode] },
          { code: '2100', credit: Number(p.amount), description: label },
        ],
      }, null);
      await tx.customerReceipt.create({
        data: {
          id: receiptId, kind: 'RECEIPT', amount: p.amount, mode, receivedAt: dayDate(day)!, reference: p.reference, notes: p.notes,
          contractId, tripId: trip?.id ?? null, customerId, ledgerTransactionId: entry.id, legacyPaymentId: p.id,
        },
      });
      await audit(tx, {
        action: 'receipt_imported', entityType: trip ? 'trip' : 'customer', entityId: trip?.id ?? customerId ?? receiptId, source: 'SYSTEM',
        description: `${receiptId}: classic payment ${p.id} of ₹${Number(p.amount).toLocaleString('en-IN')} on ${day} brought into the books${mode === 'OTHER' ? ' (method not recorded — sitting in Unsorted receipts)' : ''}`,
        after: { receiptId, legacyPaymentId: p.id, mode, amount: Number(p.amount) },
      });
      await refreshTripMoney(tx, trip?.id);
    });
    out.imported++;
    if (mode === 'OTHER') out.unsorted++;
    if (trip && !out.trips.includes(trip.id)) out.trips.push(trip.id);
  }
  return out;
}
