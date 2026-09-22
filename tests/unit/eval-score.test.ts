// Scoring a model's reading against what a person wrote down. The verdicts are
// not equally bad: a guess is the worst, a blank is safe.
import { describe, expect, it } from 'vitest';
import { scoreAll, scoreFields, summarise, verdictOf } from '../../src/shared/calc/evalScore';

const f = <T>(value: T | null, confidence: 'high' | 'medium' | 'low' = 'high') => ({ value, confidence });

describe('field by field', () => {
  it('tells right, blank, wrong and guessed apart', () => {
    const scores = scoreFields(
      { pnr: '2345678901', quota: 'TATKAL', fare: 14500, ticketNumber: null },
      { pnr: f('2345678901'), quota: f(null), fare: f(9999), ticketNumber: f('TKT-1') },
    );
    expect(scores.map(s => `${s.path}:${s.verdict}`)).toEqual([
      'pnr:correct',        // read exactly
      'quota:missed',       // the document shows it; the model said nothing — safe
      'fare:wrong',         // a value, and it differs — the dangerous one
      'ticketNumber:extra', // the document does not show it; the model gave one anyway
    ]);
  });

  it('is forgiving about spacing, case and number formatting, and nothing else', () => {
    const s = summarise(scoreFields(
      { name: 'Ramesh  Patil', fare: 14500, seat: 'B2 14' },
      { name: f('ramesh patil'), fare: f('14500'), seat: f('B2-14') },
    ));
    expect(s.correct).toBe(2);
    expect(s.wrong).toBe(1);
  });

  it('scores rows, and counts a row the model invented as a guess', () => {
    const scores = scoreFields(
      { passengers: [{ name: 'Ramesh Patil', seat: 'B2 14' }] },
      { passengers: [{ name: f('Ramesh Patil'), seat: f('B2 14') }, { name: f('Nobody'), seat: f(null) }] },
    );
    expect(scores.map(s => `${s.path}:${s.verdict}`)).toEqual([
      'passengers.1.name:correct', 'passengers.1.seat:correct', 'passengers.2:extra',
    ]);
  });

  it('a blank agreed on is right, but it does not count as a field read', () => {
    const s = summarise(scoreFields({ a: 'x', b: null, c: null }, { a: f('x'), b: f(null), c: f(null) }));
    expect(s).toMatchObject({ fields: 3, correct: 3, missed: 0, wrong: 0, extra: 0 });
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
  });

  it('measures how much was read and how much of it was right, separately', () => {
    // Four fields shown by the document: two read right, one wrong, one blank.
    const s = summarise(scoreFields(
      { a: '1', b: '2', c: '3', d: '4' },
      { a: f('1'), b: f('2'), c: f('9'), d: f(null) },
    ));
    expect(s.recall).toBeCloseTo(0.5);      // 2 of the 4 the document shows
    expect(s.precision).toBeCloseTo(2 / 3); // 2 of the 3 values it gave
    expect(s.guessRate).toBe(0);
  });
});

describe('the verdict on a whole run', () => {
  const run = (over: Partial<{ fields: number; correct: number; missed: number; wrong: number; extra: number }>) =>
    summarise([
      ...Array.from({ length: over.correct ?? 0 }, (_, i) => ({ path: `c${i}`, verdict: 'correct' as const, expectedEmpty: false })),
      ...Array.from({ length: over.missed ?? 0 }, (_, i) => ({ path: `m${i}`, verdict: 'missed' as const, expectedEmpty: false })),
      ...Array.from({ length: over.wrong ?? 0 }, (_, i) => ({ path: `w${i}`, verdict: 'wrong' as const, expectedEmpty: false })),
      ...Array.from({ length: over.extra ?? 0 }, (_, i) => ({ path: `e${i}`, verdict: 'extra' as const, expectedEmpty: true })),
    ]);

  it('a single guess makes a run untrustworthy, however good the rest is', () => {
    expect(verdictOf(run({ correct: 199, extra: 1 }))).toBe('poor');
  });

  it('a clean run is good; a few wrong values, or many blanks, need a look', () => {
    expect(verdictOf(run({ correct: 100 }))).toBe('good');
    expect(verdictOf(run({ correct: 97, wrong: 3 }))).toBe('check');
    expect(verdictOf(run({ correct: 90, wrong: 10 }))).toBe('poor');
    expect(verdictOf(run({ correct: 70, missed: 30 }))).toBe('check');
  });

  it('adds runs up by their fields, never by averaging their rates', () => {
    const a = scoreFields({ x: '1' }, { x: f('1') });
    const b = scoreFields({ x: '1', y: '2' }, { x: f('9'), y: f(null) });
    const total = scoreAll([a, b]);
    expect(total).toMatchObject({ fields: 3, correct: 1, wrong: 1, missed: 1 });
    expect(total.recall).toBeCloseTo(1 / 3);
  });
});
