// Insights read well without a model, and a model's wording is only shown
// when it adds no number of its own.
import { describe, expect, it } from 'vitest';
import {
  departingText, expectedMargin, numbersAddedBy, numbersIn, overdueText, passportText, sortInsights, thinMarginText, waitlistText,
  type Insight,
} from '../../src/shared/calc/insights';

describe('insight sentences', () => {
  it('read as plain sentences, singular and plural', () => {
    expect(departingText(1, 14)).toBe('1 trip leaving in the next 14 days has something not yet confirmed.');
    expect(departingText(3, 14)).toBe('3 trips leaving in the next 14 days have something not yet confirmed.');
    expect(overdueText(2, 12_345_600, 30)).toBe('₹1,23,456 is overdue by more than 30 days, from 2 customers.');
    expect(waitlistText(1)).toBe('1 ticket for upcoming travel is still waitlisted, RAC or only part confirmed.');
    expect(thinMarginText(2, 10)).toBe('2 open trips have a margin below 10% on the costs recorded so far.');
    expect(passportText(1, 90)).toBe('1 traveller on international trips in the next 90 days has a passport that is missing, expired or short of six months.');
  });

  it('most urgent first', () => {
    const i = (code: Insight['code'], severity: Insight['severity']): Insight => ({ code, severity, text: '', count: 1, amount: null, link: '', items: [] });
    expect(sortInsights([i('THIN_MARGIN', 'medium'), i('MONEY_OVERDUE', 'medium'), i('TICKETS_WAITLISTED', 'high'), i('DEPARTING_UNCONFIRMED', 'high'), i('PASSPORTS', 'high')]).map(x => x.code))
      .toEqual(['DEPARTING_UNCONFIRMED', 'PASSPORTS', 'TICKETS_WAITLISTED', 'MONEY_OVERDUE', 'THIN_MARGIN']);
  });
});

describe('the margin a trip is heading for', () => {
  it('counts booked costs before the supplier bill is in the books', () => {
    expect(expectedMargin(10_500_000, 0, 10_000_000)).toEqual({ marginPaise: 500_000, marginPct: 4.8 });
    expect(expectedMargin(10_500_000, 10_200_000, 10_000_000)).toEqual({ marginPaise: 300_000, marginPct: 2.9 });
  });
  it('has nothing to judge without revenue or any cost', () => {
    expect(expectedMargin(10_500_000, 0, 0)).toBeNull();
    expect(expectedMargin(0, 0, 100)).toBeNull();
  });
});

describe('the number guard on a model\'s wording', () => {
  const facts = [overdueText(2, 12_345_600, 30), departingText(3, 14)].join('\n');

  it('reads rupees, grouped digits and plain numbers as the same number', () => {
    expect([...numbersIn('₹1,23,456 and 123456 and 1,23,456.00')]).toEqual(['123456']);
  });

  it('lets a faithful re-wording through', () => {
    expect(numbersAddedBy('Three trips in the next 14 days need confirming. ₹1,23,456 from 2 customers is more than 30 days late.', facts)).toEqual([]);
  });

  it('catches a number the facts do not contain — a total, a rounding, a guess', () => {
    expect(numbersAddedBy('About ₹1,25,000 is overdue.', facts)).toEqual(['125000']);
    expect(numbersAddedBy('5 trips need confirming.', facts)).toEqual(['5']);
  });
});
