import { describe, it, expect } from 'vitest';
import { chartPreparedAt, deriveTicketStatus, fareTotals, parseRailStatus, tatkalOpensAt, webCheckInOpensAt } from '../../src/shared/calc/tickets';
import { TicketInput } from '../../src/shared/contracts/tickets';

describe('ticket fare', () => {
  it('adds fare, charges, our fee and GST on the fee only, in paise', () => {
    expect(fareTotals({ baseFare: 4000, taxes: 612.5, otherCharges: 150, serviceFee: 400, serviceFeeGstPct: 18 })).toEqual({ serviceFeeGst: 72, total: 5234.5, fareOnly: 4762.5 });
    expect(fareTotals({ baseFare: 0.1, taxes: 0.2 }).total).toBe(0.3);
    expect(fareTotals({ serviceFee: 333, serviceFeeGstPct: 18 }).serviceFeeGst).toBe(59.94);
  });
});

describe('ticket status from passenger rows', () => {
  it('keeps the manual status until something is booked, then follows the rows', () => {
    expect(deriveTicketStatus([], 'ON_HOLD')).toBe('ON_HOLD');
    expect(deriveTicketStatus(['PENDING', 'PENDING'])).toBe('REQUESTED');
    expect(deriveTicketStatus(['PENDING', 'CONFIRMED'], 'ON_HOLD')).toBe('ON_HOLD');
    expect(deriveTicketStatus(['CONFIRMED', 'CONFIRMED', 'CANCELLED'])).toBe('CONFIRMED');
    expect(deriveTicketStatus(['CONFIRMED', 'WAITLISTED'])).toBe('PARTIAL');
    expect(deriveTicketStatus(['WAITLISTED', 'RAC'])).toBe('WAITLISTED');
    expect(deriveTicketStatus(['RAC', 'RAC'])).toBe('RAC');
    expect(deriveTicketStatus(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
    expect(deriveTicketStatus([], 'CANCELLED')).toBe('CANCELLED');
  });
});

describe('IRCTC status strings', () => {
  it.each([
    ['WL 12', { status: 'WAITLISTED', position: 12 }],
    ['GNWL 45', { status: 'WAITLISTED', position: 45 }],
    ['tqwl/3', { status: 'WAITLISTED', position: 3 }],
    ['RAC 17', { status: 'RAC', position: 17 }],
    ['RAC/S5/33', { status: 'RAC', coach: 'S5', berth: '33' }],
    ['CNF/B2/34/LB', { status: 'CONFIRMED', coach: 'B2', berth: '34', berthType: 'LB' }],
    ['CNF B2 34', { status: 'CONFIRMED', coach: 'B2', berth: '34' }],
    ['S5 12', { status: 'CONFIRMED', coach: 'S5', berth: '12' }],
    ['CNF', { status: 'CONFIRMED', coach: null }],
    ['CAN', { status: 'CANCELLED' }],
  ])('%s', (raw, expected) => {
    expect(parseRailStatus(raw)).toMatchObject(expected);
  });
  it('refuses to guess', () => {
    expect(parseRailStatus('pending with agent')).toBeNull();
    expect(parseRailStatus('')).toBeNull();
  });
});

describe('train and flight timings', () => {
  it('Tatkal opens the previous day at 10:00 (AC) or 11:00 (non-AC) IST', () => {
    expect(tatkalOpensAt('2026-10-20', '3A')).toBe('2026-10-19T04:30:00.000Z');
    expect(tatkalOpensAt('2026-10-20', 'SL')).toBe('2026-10-19T05:30:00.000Z');
    expect(tatkalOpensAt('2026-10-20', null, 9, 12)).toBe('2026-10-19T06:30:00.000Z');
  });
  it('chart and web check-in are hours before departure', () => {
    expect(chartPreparedAt('2026-10-20T10:00:00.000Z', 8)).toBe('2026-10-20T02:00:00.000Z');
    expect(webCheckInOpensAt('2026-10-20T10:00:00.000Z')).toBe('2026-10-18T10:00:00.000Z');
  });
});

describe('ticket contract', () => {
  it('needs a trip or a customer, at least one segment, and names or travellers', () => {
    const seg = { fromName: 'Belagavi', toName: 'Varanasi', departAt: '2026-10-20T05:30' };
    expect(TicketInput.safeParse({ mode: 'TRAIN', segments: [seg] }).success).toBe(false);
    expect(TicketInput.safeParse({ mode: 'TRAIN', customerId: 'c', segments: [] }).success).toBe(false);
    expect(TicketInput.safeParse({ mode: 'TRAIN', customerId: 'c', segments: [seg], passengers: [{}] }).success).toBe(false);
    const ok = TicketInput.parse({ mode: 'TRAIN', customerId: 'c', segments: [seg], passengers: [{ name: 'Shri Anil' }] });
    expect(ok.segments[0].departAt).toBe('2026-10-20T00:00:00.000Z');
    expect(TicketInput.safeParse({ mode: 'FLIGHT', customerId: 'c', segments: [{ ...seg, arriveAt: '2026-10-20T05:00' }] }).success).toBe(false);
  });
});
