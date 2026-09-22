// Reading a document into a proposal: what a person must check, which trip or
// supplier it belongs to, and the record that would be created.
import { describe, expect, it } from 'vitest';
import {
  bestMatch, billAddsUp, billProposal, hotelProposal, istTimestamp, matchTrip, matchVendor,
  nameOverlap, needsCheck, normaliseName, summarise, ticketProposal, valueOf,
} from '../../src/shared/calc/extraction';

const f = <T>(value: T | null, confidence: 'high' | 'medium' | 'low' = 'high') => ({ value, confidence });

describe('what a person must check', () => {
  it('anything not read plainly is flagged, and an empty answer is named', () => {
    expect(needsCheck(f('6E-123'))).toBe(false);
    expect(needsCheck(f('6E-123', 'medium'))).toBe(true);
    expect(needsCheck(f(null))).toBe(true);
    expect(needsCheck(f(''))).toBe(true);
    expect(needsCheck(undefined)).toBe(true);
  });

  it('counts a whole extraction, rows and all, and names what could not be read', () => {
    const s = summarise({
      pnr: f('PNR123'),
      fare: f(null),
      segments: [
        { fromName: f('Belagavi'), toName: f('Varanasi'), departTime: f('22:30', 'low') },
        { fromName: f('Varanasi'), toName: f('Belagavi'), departTime: f(null) },
      ],
    });
    expect(s.total).toBe(8);
    expect(s.read).toBe(5);
    expect(s.toCheck).toBe(3);
    expect(s.unreadable).toEqual(['fare', 'segments 2 departTime']);
  });

  it('a value below confidence is never handed on as if it were read', () => {
    expect(valueOf(f('CNF'))).toBe('CNF');
    expect(valueOf(f(null))).toBeNull();
    expect(valueOf(f(''))).toBeNull();
  });
});

describe('finding the record it belongs to', () => {
  const trips = [
    { id: 'GK-1', label: 'Kashi Yatra', customerName: 'Shri Patil', destination: 'Varanasi', departure: '2026-11-10', returnDate: '2026-11-15', travellerNames: ['Ramesh Patil', 'Sunita Patil'] },
    { id: 'GK-2', label: 'Goa family', customerName: 'Joshi', destination: 'Goa', departure: '2026-12-20', returnDate: '2026-12-24', travellerNames: ['Anil Joshi'] },
  ];

  it('weighs the dates first, then the people, then the place', () => {
    const m = matchTrip({ dates: ['2026-11-10'], names: ['RAMESH PATIL', 'SUNITA PATIL'], places: ['Varanasi'] }, trips);
    expect(m[0].id).toBe('GK-1');
    expect(m[0].score).toBeGreaterThan(0.9);
    expect(m[0].why.join(' ')).toContain('travel dates');
    expect(m.find(x => x.id === 'GK-2')).toBeUndefined();
  });

  it('offers a weak guess as a suggestion instead of choosing it', () => {
    const weak = matchTrip({ dates: ['2026-11-12'], names: [], places: [] }, trips);
    expect(bestMatch(weak).chosen).toBeNull();
    expect(bestMatch(weak).suggestions[0].id).toBe('GK-1');

    const strong = matchTrip({ dates: ['2026-11-11'], names: ['Ramesh Patil'], places: ['Varanasi'] }, trips);
    expect(bestMatch(strong).chosen?.id).toBe('GK-1');
  });

  it('matches a supplier on GSTIN before the name, and reads past punctuation', () => {
    const vendors = [
      { id: 'VEN-1', name: 'Ganga View Hotel', gstin: '09AAACG1234F1Z5' },
      { id: 'VEN-2', name: 'Ganga Darshan Lodge', gstin: null },
    ];
    expect(matchVendor('G.V. Hotels Pvt Ltd', '09aaacg1234f1z5', vendors)[0]).toMatchObject({ id: 'VEN-1', score: 1 });
    const byName = matchVendor('GANGA DARSHAN LODGE,  VARANASI', null, vendors);
    expect(byName[0].id).toBe('VEN-2');
    expect(matchVendor('Nobody at all', null, vendors)).toEqual([]);
  });

  it('compares names on letters alone', () => {
    expect(normaliseName('  Shri  R. Patil ')).toBe('shri r patil');
    expect(nameOverlap('RAMESH PATIL', 'Ramesh  Patil')).toBe(1);
    expect(nameOverlap('Ramesh Patil', 'Patil Ramesh Kumar')).toBe(1);
    expect(nameOverlap('Ramesh Patil', 'Anil Joshi')).toBe(0);
    expect(nameOverlap('', 'Anil')).toBe(0);
  });
});

describe('the record that would be created', () => {
  it('builds a ticket with its legs in IST, dropping anything that could not be read', () => {
    const p = ticketProposal({
      mode: f('TRAIN'), pnr: f('2345678901'), airlineOrOperator: f('Indian Railways'),
      travelClass: f('3A'), quota: f('TATKAL'), fare: f(14_500),
      segments: [
        { fromName: f('Belagavi'), fromCode: f('BGM'), toName: f('Varanasi'), toCode: f('BSB'), departDate: f('2026-11-10'), departTime: f('22:30'), arriveDate: f('2026-11-12'), arriveTime: f('05:10'), serviceNumber: f('12779 Goa Express'), travelClass: f(null) },
        { fromName: f(null), fromCode: f(null), toName: f('Belagavi'), toCode: f('BGM'), departDate: f('2026-11-15'), departTime: f(null), arriveDate: f(null), arriveTime: f(null), serviceNumber: f(null), travelClass: f(null) },
      ],
      passengers: [
        { name: f('Ramesh Patil'), age: f(62), gender: f('M'), seat: f('B2 14'), status: f('CNF') },
        { name: f(null), age: f(null), gender: f(null), seat: f(null), status: f('WL 3') },
      ],
    });
    expect(p.mode).toBe('TRAIN');
    expect(p.segments).toHaveLength(1);                      // the leg with no start is not invented
    expect(p.segments[0].departAt).toBe('2026-11-10T22:30:00+05:30');
    expect(p.segments[0].arriveAt).toBe('2026-11-12T05:10:00+05:30');
    expect(p.passengers.map(x => x.name)).toEqual(['Ramesh Patil']);   // a nameless row is not saved
    expect(p.fare).toBe(14_500);
  });

  it('builds a stay, and a bill only when its own numbers add up', () => {
    const stay = hotelProposal({
      hotelName: f('Ganga View'), city: f('Varanasi'), confirmationNo: f('GV-889'),
      checkIn: f('2026-11-11'), checkOut: f('2026-11-13'), rooms: f(12), roomType: f('Deluxe'), mealPlan: f('CP'),
      totalAmount: f(96_000), guestNames: [f('Ramesh Patil'), f(null)],
    });
    expect(stay).toMatchObject({ hotelName: 'Ganga View', rooms: 12, guests: ['Ramesh Patil'] });

    const bill = billProposal({ supplierName: f('Ganga View Hotel'), supplierGstin: f('09AAACG1234F1Z5'), billNumber: f('GV/41'), billDate: f('2026-11-13'), dueDate: f(null), description: f('12 rooms, 2 nights'), taxableAmount: f(80_000), gstAmount: f(16_000), totalAmount: f(96_000) });
    expect(billAddsUp(bill)).toBe(true);
    expect(billAddsUp({ ...bill, gstAmount: 4_000 })).toBe(false);
    expect(billAddsUp({ ...bill, totalAmount: null })).toBe(false);
    expect(billAddsUp({ ...bill, taxableAmount: null, gstAmount: null })).toBe(true);   // a bill with no tax breakdown is fine
  });

  it('a date with no time is still that day in IST, never yesterday', () => {
    expect(istTimestamp('2026-11-10', null)).toBe('2026-11-10T00:00:00+05:30');
    expect(istTimestamp('2026-11-10', 'garbage')).toBe('2026-11-10T00:00:00+05:30');
    expect(istTimestamp(null, '22:30')).toBeNull();
  });
});
