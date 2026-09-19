import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv } from '../../src/shared/calc/csv';

describe('parseCsv', () => {
  it('reads headers, quoted fields, escaped quotes, CRLF and blank lines', () => {
    const text = '﻿Name,City,Category,Phone\r\n"Sea View, Resort",Goa,"4 star","+91 98765 43210"\r\n\r\nHill Top,Munnar,3 star,\r\n"Say ""Hi"" Inn",Ooty,Budget,x';
    const r = parseCsv(text);
    expect(r.headers).toEqual(['name', 'city', 'category', 'phone']);
    expect(r.rows).toEqual([
      { name: 'Sea View, Resort', city: 'Goa', category: '4 star', phone: '+91 98765 43210' },
      { name: 'Hill Top', city: 'Munnar', category: '3 star', phone: '' },
      { name: 'Say "Hi" Inn', city: 'Ooty', category: 'Budget', phone: 'x' },
    ]);
    expect(r.errors).toEqual([]);
  });
  it('normalises odd headers and flags rows with too many values', () => {
    const r = parseCsv('Registration No.,Seats\nKA01AB1234,7,extra');
    expect(r.headers).toEqual(['registration_no', 'seats']);
    expect(r.errors[0]).toMatch(/Line 2: 3 values for 2 columns/);
  });
  it('round-trips through toCsv', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'he said "no"'], [1, null]]);
    expect(csv).toBe('a,b\r\n"x,y","he said ""no"""\r\n1,');
    expect(parseCsv(csv).rows).toEqual([{ a: 'x,y', b: 'he said "no"' }, { a: '1', b: '' }]);
  });
  it('reports an empty file', () => {
    expect(parseCsv('').errors).toEqual(['The file is empty']);
  });
});
