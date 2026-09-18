// Field-level redaction — the guarantee behind the bootstrap-leak hotfix.
import { describe, it, expect } from 'vitest';
import {
  canSeeCommercials, canSeeBankDetails,
  redactTrip, redactBooking, redactVendor, redactCompanySettings, redactActivity,
} from '../../server/src/lib/redact';

const trip = {
  id: 'GK-2026-0001', destination: 'Kashmir', totalAmount: 100_000, gstAmount: 5_000, totalPayable: 105_000,
  paidAmount: 30_000, balanceDue: 75_000, supplierCost: 60_000, grossMargin: 40_000, marginPct: 40,
};
const booking = {
  id: 'BK-2026-0001', sellingPrice: 20_000, advance: 5_000, balanceDue: 16_000,
  supplierCost: 15_000, supplierPaid: 10_000, supplierPending: 5_000, grossMargin: 5_000, marginPct: 25,
};
const vendor = { id: 'VEN-2026-0001', name: 'Hotel Ltd', phone: '9', bankDetails: { accountNo: '123', ifsc: 'HDFC0001' } };
const settings = { id: 'default', companyName: 'GK Travels', gstin: '29X', pan: 'ABCDE1234F', bankAccountNumber: '999', bankIfsc: 'X', logoUrl: 'l' };

describe('capability helpers', () => {
  it('commercial figures: ADMIN, BOOKING, ACCOUNTS yes; OPERATIONS no', () => {
    expect(canSeeCommercials('ADMIN')).toBe(true);
    expect(canSeeCommercials('BOOKING')).toBe(true);
    expect(canSeeCommercials('ACCOUNTS')).toBe(true);
    expect(canSeeCommercials('OPERATIONS')).toBe(false);
    expect(canSeeCommercials(undefined)).toBe(false);
  });

  it('bank details: ADMIN and ACCOUNTS only', () => {
    expect(canSeeBankDetails('ADMIN')).toBe(true);
    expect(canSeeBankDetails('ACCOUNTS')).toBe(true);
    expect(canSeeBankDetails('BOOKING')).toBe(false);
    expect(canSeeBankDetails('OPERATIONS')).toBe(false);
  });
});

describe('redactTrip / redactBooking', () => {
  it('zeroes profit and supplier figures for OPERATIONS but keeps customer pricing', () => {
    const r = redactTrip(trip, 'OPERATIONS');
    expect(r).toMatchObject({ supplierCost: 0, grossMargin: 0, marginPct: 0, totalPayable: 105_000, balanceDue: 75_000, paidAmount: 30_000 });
    const b = redactBooking(booking, 'OPERATIONS');
    expect(b).toMatchObject({ supplierCost: 0, supplierPaid: 0, supplierPending: 0, grossMargin: 0, marginPct: 0, sellingPrice: 20_000, advance: 5_000 });
  });

  it('returns the same object untouched for commercial roles', () => {
    expect(redactTrip(trip, 'BOOKING')).toBe(trip);
    expect(redactTrip(trip, 'ACCOUNTS')).toBe(trip);
    expect(redactBooking(booking, 'ADMIN')).toBe(booking);
  });

  it('does not mutate the input', () => {
    redactTrip(trip, 'OPERATIONS');
    expect(trip.supplierCost).toBe(60_000);
  });
});

describe('redactVendor / redactCompanySettings', () => {
  it('blanks vendor bank details for non-finance roles', () => {
    expect(redactVendor(vendor, 'OPERATIONS').bankDetails).toEqual({});
    expect(redactVendor(vendor, 'BOOKING').bankDetails).toEqual({});
    expect(redactVendor(vendor, 'ACCOUNTS')).toBe(vendor);
  });

  it('nulls PAN and bank columns of the company master for non-finance roles, keeping the rest', () => {
    const r = redactCompanySettings(settings, 'BOOKING');
    expect(r).toMatchObject({ pan: null, bankAccountNumber: null, bankIfsc: null, companyName: 'GK Travels', gstin: '29X', logoUrl: 'l' });
    expect(redactCompanySettings(settings, 'ADMIN')).toBe(settings);
  });
});

describe('redactActivity', () => {
  const invoiceRow = { entityType: 'invoice', before: null, after: { totalAmount: 1 }, metadata: { x: 1 } };
  const bookingRow = { entityType: 'booking', before: null, after: { status: 'issued' }, metadata: null };

  it('strips snapshots of financial entities for non-finance roles only', () => {
    expect(redactActivity(invoiceRow, 'OPERATIONS')).toMatchObject({ before: null, after: null, metadata: null });
    expect(redactActivity(invoiceRow, 'BOOKING')).toMatchObject({ before: null, after: null, metadata: null });
    expect(redactActivity(invoiceRow, 'ACCOUNTS')).toBe(invoiceRow);
    expect(redactActivity(bookingRow, 'OPERATIONS')).toBe(bookingRow);
  });
});
