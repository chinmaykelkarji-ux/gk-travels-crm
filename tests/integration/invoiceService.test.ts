// GST invoicing engine — numbering, place-of-supply split, receivable and
// ledger linkage, cancel/delete guards, GST period freeze, credit notes.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedCompany, seedCustomer, seedTrip, seedBooking } from './helpers/db';

const svc = hasTestDb ? await import('../../server/src/services/invoiceService.js') : null;

const packageLine = { description: 'Kashmir package', rate: 10_000, quantity: 1, gstRate: 5, serviceType: 'package', hsnSac: '9985' };

async function makeInvoice(extra: Record<string, unknown> = {}) {
  return svc!.createInvoice({
    invoiceDate:  '2026-09-18',
    customerId:   'CUS-2026-0001',
    customerName: 'Test Customer',
    customerGstin: '29BBBBB0000B1Z5',
    items:        [packageLine],
    createdBy:    'U-ACCOUNTS',
    ...extra,
  } as never);
}

describe.skipIf(!hasTestDb)('invoiceService', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    await seedCustomer();
    await seedTrip();
    await seedBooking();
  });

  it('issues sequential numbers per financial year and never reuses them', async () => {
    const a = await makeInvoice();
    const b = await makeInvoice();
    expect(a.invoiceNumber).toBe('GK/2026-27/01');
    expect(b.invoiceNumber).toBe('GK/2026-27/02');
    expect(a.financialYear).toBe('2026-27');
    expect(a.sequenceNumber).toBe(1);

    const c = await makeInvoice({ invoiceDate: '2027-04-01' });
    expect(c.invoiceNumber).toBe('GK/2027-28/01');

    // Deleting the latest invoice must NOT release its number.
    await svc!.deleteInvoice(b.id, 'U-ACCOUNTS');
    const d = await makeInvoice();
    expect(d.invoiceNumber).toBe('GK/2026-27/03');
  });

  it('splits GST as CGST+SGST for the same state and IGST across states', async () => {
    const intra = await makeInvoice();
    expect(intra.gstType).toBe('INTRA');
    expect(intra).toMatchObject({ taxableAmount: 10_000, cgstAmount: 250, sgstAmount: 250, igstAmount: 0, totalGstAmount: 500, totalAmount: 10_500 });
    expect(intra.companyStateCode).toBe('29');
    expect(intra.customerStateCode).toBe('29');

    const inter = await makeInvoice({ customerGstin: '27CCCCC0000C1Z5' });
    expect(inter.gstType).toBe('INTER');
    expect(inter).toMatchObject({ cgstAmount: 0, sgstAmount: 0, igstAmount: 500, totalAmount: 10_500 });
    expect(inter.customerStateCode).toBe('27');

    // An explicit place of supply wins over the customer GSTIN.
    const explicit = await makeInvoice({ placeOfSupplyStateCode: '30', placeOfSupply: 'Goa' });
    expect(explicit.gstType).toBe('INTER');
    expect(explicit.customerStateCode).toBe('30');
  });

  it('snapshots the company master and sums multi-line items with paise rounding', async () => {
    const inv = await makeInvoice({
      items: [
        packageLine,
        { description: 'Airport transfer', rate: 1_234.57, quantity: 1, gstRate: 5 },
        { description: 'Insurance', rate: 250.5, quantity: 2, gstRate: 18 },
      ],
    });
    expect(inv.companyName).toBe('GK Travels');
    expect(inv.companyGstin).toBe('29AAAAA0000A1Z5');
    expect(inv.items).toHaveLength(3);
    expect(inv.items[2].amount).toBe(501);
    expect(inv.taxableAmount).toBe(11_735.57);
    expect(inv.totalGstAmount).toBe(651.91);        // 500 + 61.73 + 90.18
    expect(inv.cgstAmount + inv.sgstAmount).toBeCloseTo(inv.totalGstAmount, 2);
    expect(inv.totalAmount).toBe(12_387.48);
  });

  it('raises a receivable, a ledger entry and an activity row, all linked to the invoice', async () => {
    const inv = await makeInvoice();
    expect(inv.receivableId).toBeTruthy();

    const rcv = await prisma.receivable.findUniqueOrThrow({ where: { id: inv.receivableId! } });
    expect(rcv).toMatchObject({ invoiceId: inv.id, invoiceAmount: 10_500, balanceDue: 10_500, totalReceived: 0, customerId: 'CUS-2026-0001' });

    const ledger = await prisma.financialTransaction.findMany({ where: { sourceType: 'invoice', sourceId: inv.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'RECEIVABLE', amount: 10_500, gstAmount: 500, taxableAmount: 10_000 });

    const activity = await prisma.activityLog.findMany({ where: { entityType: 'invoice', entityId: inv.id } });
    expect(activity.map(a => a.action)).toContain('invoice_created');
    expect(activity[0].userId).toBe('U-ACCOUNTS');
  });

  it('locks bookings and trips to the invoice and refuses to invoice them twice', async () => {
    const inv = await makeInvoice({ bookingIds: ['BK-2026-0001'], tripIds: ['GK-2026-0001'] });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: 'BK-2026-0001' } });
    const trip    = await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } });
    expect(booking.invoiceId).toBe(inv.id);
    expect(trip.invoiceId).toBe(inv.id);

    await expect(makeInvoice({ bookingIds: ['BK-2026-0001'] })).rejects.toThrow(/already invoiced/);
    await expect(makeInvoice({ tripIds: ['GK-2026-0001'] })).rejects.toThrow(/already invoiced/);
  });

  it('refuses an invoice without line items', async () => {
    await expect(makeInvoice({ items: [] })).rejects.toThrow(/at least one line item/);
  });

  it('update recomputes totals and the linked receivable balance after payments', async () => {
    const inv = await makeInvoice();
    await prisma.receivableEntry.create({
      data: { id: 'RCE-001', receivableId: inv.receivableId!, amount: 4_000, paymentDate: '2026-09-18', paymentMode: 'UPI' },
    });

    const updated = await svc!.updateInvoice(inv.id, {
      items: [{ description: 'Kashmir package', rate: 20_000, quantity: 1, gstRate: 5 }],
      updatedBy: 'U-ACCOUNTS',
    });
    expect(updated.totalAmount).toBe(21_000);
    expect(updated.invoiceNumber).toBe(inv.invoiceNumber); // number never changes on edit

    const rcv = await prisma.receivable.findUniqueOrThrow({ where: { id: inv.receivableId! } });
    expect(rcv.invoiceAmount).toBe(21_000);
    expect(rcv.balanceDue).toBe(17_000);
  });

  it('cancel keeps the row, releases the booking/trip locks and zeroes the receivable', async () => {
    const inv = await makeInvoice({ bookingIds: ['BK-2026-0001'], tripIds: ['GK-2026-0001'] });
    const cancelled = await svc!.cancelInvoice(inv.id, 'Customer withdrew', 'U-ACCOUNTS');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelReason).toBe('Customer withdrew');

    expect((await prisma.booking.findUniqueOrThrow({ where: { id: 'BK-2026-0001' } })).invoiceId).toBeNull();
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } })).invoiceId).toBeNull();
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: inv.receivableId! } })).invoiceAmount).toBe(0);

    await expect(svc!.cancelInvoice(inv.id, 'again', 'U-ACCOUNTS')).rejects.toThrow(/already cancelled/);
    await expect(svc!.updateInvoice(inv.id, { notes: 'x' })).rejects.toThrow(/cancelled/);
  });

  it('delete refuses when money has been recorded against the invoice', async () => {
    const inv = await makeInvoice();
    await prisma.receivableEntry.create({
      data: { id: 'RCE-002', receivableId: inv.receivableId!, amount: 500, paymentDate: '2026-09-18', paymentMode: 'Cash' },
    });
    await expect(svc!.deleteInvoice(inv.id, 'U-ACCOUNTS')).rejects.toThrow(/payment\(s\) have been recorded/);
    expect(await prisma.invoice.count()).toBe(1);
  });

  it('delete removes an unpaid invoice with its receivable and unlocks sources', async () => {
    const inv = await makeInvoice({ bookingIds: ['BK-2026-0001'] });
    await svc!.deleteInvoice(inv.id, 'U-ACCOUNTS');
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.receivable.count()).toBe(0);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: 'BK-2026-0001' } })).invoiceId).toBeNull();
    const activity = await prisma.activityLog.findMany({ where: { entityType: 'invoice', entityId: inv.id } });
    expect(activity.map(a => a.action)).toContain('invoice_deleted');
  });

  it('GST freeze blocks create, edit, cancel and delete inside the filed period', async () => {
    const before = await makeInvoice({ invoiceDate: '2026-08-15' });
    await seedCompany({ gstFrozenUntil: '2026-08-31' });

    await expect(makeInvoice({ invoiceDate: '2026-08-20' })).rejects.toThrow(/GST-frozen/);
    await expect(svc!.updateInvoice(before.id, { notes: 'late edit' })).rejects.toThrow(/GST-frozen/);
    await expect(svc!.cancelInvoice(before.id, 'x', 'U-ACCOUNTS')).rejects.toThrow(/GST-frozen/);
    await expect(svc!.deleteInvoice(before.id, 'U-ACCOUNTS')).rejects.toThrow(/GST-frozen/);

    const after = await makeInvoice({ invoiceDate: '2026-09-01' });
    expect(after.status).toBe('ISSUED');
  });

  it('credit notes number separately, inherit the invoice GST type and block invoice deletion', async () => {
    const inv = await makeInvoice({ customerGstin: '27CCCCC0000C1Z5' });
    const cn = await svc!.createCreditNote({
      invoiceId: inv.id, date: '2026-09-18', reason: 'Service not provided',
      items: [{ description: 'Transfer refund', rate: 1_000, quantity: 1, gstRate: 5 }],
      createdBy: 'U-ACCOUNTS',
    });
    expect(cn.creditNoteNumber).toBe('CN/2026-27/0001');
    expect(cn).toMatchObject({ igstAmount: 50, cgstAmount: 0, totalAmount: 1_050, customerName: 'Test Customer' });

    await expect(svc!.deleteInvoice(inv.id, 'U-ACCOUNTS')).rejects.toThrow(/Credit\/Debit Notes/);

    const cancelled = await svc!.cancelInvoice(inv.id, 'x', 'U-ACCOUNTS');
    expect(cancelled.status).toBe('CANCELLED');
    await expect(svc!.createCreditNote({
      invoiceId: inv.id, date: '2026-09-18', reason: 'x', items: [{ description: 'y', rate: 1, quantity: 1, gstRate: 0 }],
    })).rejects.toThrow(/cancelled invoice/);
  });
});
