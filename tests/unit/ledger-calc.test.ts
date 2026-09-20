import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS, ACCOUNT_BY_CODE, ACCOUNT_TYPES, agingBucket, agingSummary, checkLines, EXPENSE_ACCOUNT, MONEY_ACCOUNT,
  naturalBalance, profitAndLoss, reverseLines, trialBalance, withRunningBalance,
} from '../../src/shared/calc/ledger';

describe('chart of accounts', () => {
  it('has unique codes, known types and a description for every account', () => {
    expect(new Set(ACCOUNTS.map(a => a.code)).size).toBe(ACCOUNTS.length);
    for (const a of ACCOUNTS) {
      expect(ACCOUNT_TYPES, a.code).toContain(a.type);
      expect(a.name.length, a.code).toBeGreaterThan(2);
      expect(a.description.length, a.code).toBeGreaterThan(10);
    }
    expect(ACCOUNT_BY_CODE.get('1010')!.name).toBe('Bank account');
    // Tax accounts say what the owner must check with their CA.
    expect(ACCOUNTS.filter(a => a.group === 'Tax').every(a => /verify with CA/i.test(a.description))).toBe(true);
  });
});

describe('checkLines', () => {
  const known = new Set(['1000', '1010', '4000']);
  it('accepts a balanced entry', () => {
    const r = checkLines([{ code: '1000', debit: 1500.5 }, { code: '4000', credit: 1500.5 }], known);
    expect(r).toMatchObject({ ok: true, errors: [], debitPaise: 150050, creditPaise: 150050 });
  });
  it('refuses rounding that does not balance to the paisa', () => {
    const r = checkLines([{ code: '1000', debit: 100.005 }, { code: '4000', credit: 100 }], known);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Debits \(100\.01\) and credits \(100\.00\) must be equal/);
  });
  it('refuses one-sided, empty, negative, both-sided and unknown lines', () => {
    expect(checkLines([{ code: '1000', debit: 100 }], known).errors).toContain('A journal entry needs at least two lines');
    expect(checkLines([{ code: '1000', debit: 100 }, { code: '4000' }], known).errors).toContain('Line 2: enter an amount');
    expect(checkLines([{ code: '1000', debit: -5 }, { code: '4000', credit: -5 }], known).errors).toContain('Line 1: amounts cannot be negative');
    expect(checkLines([{ code: '1000', debit: 5, credit: 5 }, { code: '4000', credit: 5 }], known).errors).toContain('Line 1: put the amount in debit or in credit, not both');
    expect(checkLines([{ code: '9999', debit: 5 }, { code: '4000', credit: 5 }], known).errors).toContain('Line 1: unknown account 9999');
  });
});

describe('reverseLines', () => {
  it('swaps debit and credit and keeps everything else', () => {
    expect(reverseLines([{ code: '1000', debit: 500, credit: 0, description: 'Cash' }, { code: '4000', debit: 0, credit: 500, description: null }]))
      .toEqual([{ code: '1000', debit: 0, credit: 500, description: 'Cash' }, { code: '4000', debit: 500, credit: 0, description: null }]);
  });
});

describe('balances', () => {
  it('counts debits as positive for assets and expenses, credits for the rest', () => {
    expect(naturalBalance('ASSET', 10_000, 2_500)).toBe(7_500);
    expect(naturalBalance('EXPENSE', 10_000, 0)).toBe(10_000);
    expect(naturalBalance('INCOME', 0, 10_000)).toBe(10_000);
    expect(naturalBalance('LIABILITY', 2_000, 10_000)).toBe(8_000);
    expect(naturalBalance('EQUITY', 0, 10_000)).toBe(10_000);
  });

  const rows = [
    { code: '1010', debitPaise: 15_000_00, creditPaise: 5_000_00 }, // bank
    { code: '2100', debitPaise: 0, creditPaise: 6_000_00 },          // customer advances
    { code: '4000', debitPaise: 0, creditPaise: 9_000_00 },          // sales
    { code: '5000', debitPaise: 5_000_00, creditPaise: 0 },          // hotel cost
  ];
  it('trial balance totals both sides, sorts by code and reports the difference', () => {
    const tb = trialBalance(rows);
    expect(tb.accounts.map(a => a.code)).toEqual(['1010', '2100', '4000', '5000']);
    expect(tb.accounts[0]).toMatchObject({ name: 'Bank account', type: 'ASSET', balancePaise: 10_000_00 });
    expect(tb.totalDebitPaise).toBe(20_000_00);
    expect(tb.totalCreditPaise).toBe(20_000_00);
    expect(tb.differencePaise).toBe(0);
    expect(tb.byType).toMatchObject({ ASSET: 10_000_00, LIABILITY: 6_000_00, INCOME: 9_000_00, EXPENSE: 5_000_00, EQUITY: 0 });
  });
  it('profit and loss is income minus expenses from the same rows', () => {
    const pl = profitAndLoss(rows);
    expect(pl).toMatchObject({ incomePaise: 9_000_00, expensePaise: 5_000_00, profitPaise: 4_000_00 });
    expect(pl.lines.map(l => l.code)).toEqual(['4000', '5000']);
  });
  it('running balance carries the opening balance down the statement', () => {
    const out = withRunningBalance('ASSET', 1_000_00, [
      { debitPaise: 500_00, creditPaise: 0 },
      { debitPaise: 0, creditPaise: 200_00 },
      { debitPaise: 50_00, creditPaise: 0 },
    ]);
    expect(out.map(r => r.balancePaise)).toEqual([1_500_00, 1_300_00, 1_350_00]);
  });
});

describe('supplier money', () => {
  it('every bill category and payment method points at an account that exists', () => {
    for (const [category, code] of Object.entries(EXPENSE_ACCOUNT)) {
      expect(ACCOUNT_BY_CODE.get(code), category).toBeDefined();
      expect(ACCOUNT_BY_CODE.get(code)!.type, category).toBe('EXPENSE');
    }
    for (const [mode, code] of Object.entries(MONEY_ACCOUNT)) {
      expect(ACCOUNT_BY_CODE.get(code), mode).toBeDefined();
      expect(ACCOUNT_BY_CODE.get(code)!.type, mode).toBe('ASSET');
    }
  });
  it('buckets money by how late it is', () => {
    expect(agingBucket(0)).toBe('current');
    expect(agingBucket(-5)).toBe('current');
    expect(agingBucket(1)).toBe('1-30');
    expect(agingBucket(30)).toBe('1-30');
    expect(agingBucket(31)).toBe('31-60');
    expect(agingBucket(75)).toBe('61-90');
    expect(agingBucket(400)).toBe('90+');
  });
  it('totals each bucket and says how much is late', () => {
    const s = agingSummary([
      { daysOverdue: 0, outstandingPaise: 5_000_00 },
      { daysOverdue: 12, outstandingPaise: 2_000_00 },
      { daysOverdue: 45, outstandingPaise: 20_000_00 },
      { daysOverdue: 120, outstandingPaise: 10_000_00 },
    ]);
    expect(s.buckets.map(b => [b.key, b.amountPaise])).toEqual([['current', 5_000_00], ['1-30', 2_000_00], ['31-60', 20_000_00], ['61-90', 0], ['90+', 10_000_00]]);
    expect(s.totalPaise).toBe(37_000_00);
    expect(s.overduePaise).toBe(32_000_00);
  });
});
