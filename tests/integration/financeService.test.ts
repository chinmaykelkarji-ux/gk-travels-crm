// Central finance engine — receivables, customer payments, payables, vendor
// payments, refunds/adjustments, and the ledger rows they must always write.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedCompany, seedCustomer, seedTrip, seedBooking, seedVendor } from './helpers/db';

const fin = hasTestDb ? await import('../../server/src/services/financeService.js') : null;

describe.skipIf(!hasTestDb)('financeService', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    await seedCustomer();
    await seedTrip();
    await seedBooking();
    await seedVendor();
  });

  it('createReceivable skips zero amounts and otherwise writes receivable + ledger + activity', async () => {
    expect(await fin!.createReceivable({ sourceType: 'trip', sourceId: 'GK-2026-0001', customerName: 'T', amount: 0 })).toBeNull();

    const r = await fin!.createReceivable({
      sourceType: 'trip', sourceId: 'GK-2026-0001', tripId: 'GK-2026-0001', customerId: 'CUS-2026-0001',
      customerName: 'Test Customer', amount: 105_000, gstAmount: 5_000, taxableAmount: 100_000, dueDate: '2026-10-10', createdBy: 'U-ADMIN',
    });
    expect(r).toMatchObject({ invoiceAmount: 105_000, balanceDue: 105_000, totalReceived: 0, tripId: 'GK-2026-0001' });
    const ledger = await prisma.financialTransaction.findFirstOrThrow({ where: { type: 'RECEIVABLE' } });
    expect(ledger).toMatchObject({ amount: 105_000, gstAmount: 5_000, taxableAmount: 100_000, customerId: 'CUS-2026-0001' });
    expect(await prisma.activityLog.count({ where: { action: 'receivable_created' } })).toBe(1);
  });

  it('recordPayment atomically updates payment, receivable, trip, booking, ledger and activity', async () => {
    const rcv = (await fin!.createReceivable({
      sourceType: 'trip', sourceId: 'GK-2026-0001', tripId: 'GK-2026-0001', customerId: 'CUS-2026-0001',
      customerName: 'Test Customer', amount: 105_000,
    }))!;

    const result = await fin!.recordPayment({
      receivableId: rcv.id, tripId: 'GK-2026-0001', bookingId: 'BK-2026-0001', customerId: 'CUS-2026-0001',
      customerName: 'Test Customer', amount: 30_000, paymentMode: 'UPI', reference: 'UTR1', date: '2026-09-18', createdBy: 'U-ACCOUNTS',
    });

    expect(result.payment).toMatchObject({ type: 'customer', amount: 30_000, method: 'UPI', reference: 'UTR1', status: 'completed' });
    expect(result.receivable).toMatchObject({ totalReceived: 30_000, balanceDue: 75_000 });
    expect(result.trip).toMatchObject({ paidAmount: 30_000, balanceDue: 75_000 });
    expect(result.booking).toMatchObject({ advance: 30_000, balanceDue: 0, financialStatus: 'paid' }); // booking payable is 21,000

    expect(await prisma.receivableEntry.count({ where: { receivableId: rcv.id } })).toBe(1);
    const ledger = await prisma.financialTransaction.findFirstOrThrow({ where: { type: 'PAYMENT_RECEIVED' } });
    expect(ledger).toMatchObject({ amount: 30_000, sourceType: 'receivable', sourceId: rcv.id, paymentMode: 'UPI', reference: 'UTR1' });
    expect(await prisma.activityLog.count({ where: { action: 'payment_received' } })).toBe(1);
  });

  it('recordPayment rolls back everything if one write fails', async () => {
    await expect(fin!.recordPayment({
      receivableId: 'does-not-exist', tripId: 'GK-2026-0001', amount: 100, paymentMode: 'Cash',
    })).rejects.toThrow();
    expect(await prisma.payment.count()).toBe(0);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } })).paidAmount).toBe(0);
    expect(await prisma.financialTransaction.count()).toBe(0);
  });

  it('a second payment accumulates and never drives the balance negative', async () => {
    await fin!.recordPayment({ tripId: 'GK-2026-0001', amount: 100_000, paymentMode: 'Bank' });
    const second = await fin!.recordPayment({ tripId: 'GK-2026-0001', amount: 10_000, paymentMode: 'Bank' });
    expect(second.trip).toMatchObject({ paidAmount: 110_000, balanceDue: 0 });
  });

  it('payables: outstanding and isPaid derive from cost vs advance, with ledger rows', async () => {
    const vp = await fin!.createPayable({
      id: 'VP-2026-0001', vendorId: 'VEN-2026-0001', vendorName: 'Test Hotel Supplier', tripId: 'GK-2026-0001',
      totalCost: 50_000, advancePaid: 10_000, dueDate: '2026-10-01', createdBy: 'U-ACCOUNTS',
    });
    expect(vp).toMatchObject({ totalCost: 50_000, advancePaid: 10_000, outstanding: 40_000, isPaid: false });
    expect(await prisma.financialTransaction.count({ where: { type: 'PAYABLE', amount: 50_000 } })).toBe(1);

    const after = await fin!.recordVendorPayment({ vendorPaymentId: 'VP-2026-0001', amount: 40_000, paymentMode: 'NEFT', date: '2026-09-20' });
    expect(after).toMatchObject({ advancePaid: 50_000, outstanding: 0, isPaid: true, paidDate: '2026-09-20' });
    expect(await prisma.financialTransaction.count({ where: { type: 'PAYMENT_SENT', amount: 40_000 } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: 'vendor_payment_sent' } })).toBe(1);
  });

  it('a payable fully covered by its advance is paid immediately; zero cost is never "paid"', async () => {
    const full = await fin!.createPayable({ vendorId: 'VEN-2026-0001', vendorName: 'V', totalCost: 5_000, advancePaid: 5_000 });
    expect(full).toMatchObject({ outstanding: 0, isPaid: true });
    const zero = await fin!.createPayable({ vendorId: 'VEN-2026-0001', vendorName: 'V', totalCost: 0, advancePaid: 0 });
    expect(zero.isPaid).toBe(false);
  });

  it('refunds and adjustments post ledger rows with activity', async () => {
    const refund = await fin!.recordRefund({ sourceType: 'trip', sourceId: 'GK-2026-0001', customerId: 'CUS-2026-0001', amount: 2_500, paymentMode: 'UPI' });
    expect(refund).toMatchObject({ type: 'REFUND', amount: 2_500 });
    const adj = await fin!.recordAdjustment({ sourceType: 'trip', sourceId: 'GK-2026-0001', amount: -100, description: 'Rounding' });
    expect(adj).toMatchObject({ type: 'ADJUSTMENT', amount: -100, description: 'Rounding' });
    expect(await prisma.activityLog.count({ where: { action: { in: ['refund_issued', 'adjustment_recorded'] } } })).toBe(2);
  });
});
