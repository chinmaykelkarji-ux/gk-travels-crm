// ============================================================
// Ledger — pure rules for double-entry bookkeeping.
//
// Every posting is a transaction with lines that must balance to the paisa.
// Nothing posted is ever edited or deleted: a mistake is corrected by a
// reversal that mirrors the original. Balances are derived from the lines,
// never stored on the transaction.
//
// The chart of accounts below is the starting set for a travel agency; the
// owner can add their own accounts later. Codes are stable and are what the
// posting services refer to.
// ============================================================

import { sumPaise, toPaise } from './money';

export type AccountType = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY';
export const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'];
/** Debit increases an asset or an expense; credit increases everything else. */
export const DEBIT_POSITIVE: AccountType[] = ['ASSET', 'EXPENSE'];

export interface AccountDef { code: string; name: string; type: AccountType; group: string; description: string }

export const ACCOUNTS: AccountDef[] = [
  // Assets
  { code: '1000', name: 'Cash in hand', type: 'ASSET', group: 'Money', description: 'Notes and coins in the office cash box.' },
  { code: '1010', name: 'Bank account', type: 'ASSET', group: 'Money', description: 'The current account money is received into and paid from.' },
  { code: '1020', name: 'Payment gateway holding', type: 'ASSET', group: 'Money', description: 'Card / UPI collections the gateway has not settled into the bank yet.' },
  { code: '1100', name: 'Customer dues (receivable)', type: 'ASSET', group: 'Customers', description: 'What customers still owe on invoices and booking schedules.' },
  { code: '1200', name: 'Advances to suppliers', type: 'ASSET', group: 'Suppliers', description: 'Money paid to a hotel, transporter or consolidator before their bill arrives.' },
  { code: '1300', name: 'Input GST', type: 'ASSET', group: 'Tax', description: 'GST charged by suppliers that may be claimed as input credit — verify with CA.' },
  // Liabilities
  { code: '2000', name: 'Supplier dues (payable)', type: 'LIABILITY', group: 'Suppliers', description: 'Supplier bills received and not yet paid.' },
  { code: '2100', name: 'Customer advances', type: 'LIABILITY', group: 'Customers', description: 'Money received before the tour is delivered; it becomes income when the trip is invoiced.' },
  { code: '2200', name: 'Output GST payable', type: 'LIABILITY', group: 'Tax', description: 'GST charged to customers and owed to the government — verify with CA.' },
  { code: '2210', name: 'TCS payable', type: 'LIABILITY', group: 'Tax', description: 'Tax collected at source on overseas tour packages — verify with CA.' },
  { code: '2300', name: 'Salaries payable', type: 'LIABILITY', group: 'Office', description: 'Salaries earned by staff and not yet paid.' },
  // Income
  { code: '4000', name: 'Tour package sales', type: 'INCOME', group: 'Income', description: 'Package and group tour billing, excluding GST.' },
  { code: '4010', name: 'Ticketing service fee', type: 'INCOME', group: 'Income', description: 'The agency fee on air, rail and bus ticketing.' },
  { code: '4020', name: 'Other income', type: 'INCOME', group: 'Income', description: 'Commission, cancellation retention and anything else earned.' },
  // Direct costs
  { code: '5000', name: 'Hotel cost', type: 'EXPENSE', group: 'Trip costs', description: 'What hotels and DMCs charge for stays.' },
  { code: '5010', name: 'Transport cost', type: 'EXPENSE', group: 'Trip costs', description: 'Buses, tempo travellers, cabs and drivers.' },
  { code: '5020', name: 'Ticket cost', type: 'EXPENSE', group: 'Trip costs', description: 'Air, rail and bus fares bought for customers.' },
  { code: '5030', name: 'Activity cost', type: 'EXPENSE', group: 'Trip costs', description: 'Darshan passes, boat rides, guides and entry fees.' },
  { code: '5040', name: 'Other trip cost', type: 'EXPENSE', group: 'Trip costs', description: 'Food, tips, permits and anything else spent on a trip.' },
  // Office costs
  { code: '6000', name: 'Salaries and wages', type: 'EXPENSE', group: 'Office', description: 'Staff salaries, including the family drawing a salary.' },
  { code: '6010', name: 'Rent', type: 'EXPENSE', group: 'Office', description: 'Office rent and maintenance.' },
  { code: '6020', name: 'Office and admin', type: 'EXPENSE', group: 'Office', description: 'Phone, internet, stationery, software and travel.' },
  { code: '6030', name: 'Bank and gateway charges', type: 'EXPENSE', group: 'Office', description: 'Bank charges and the percentage the payment gateway keeps.' },
  { code: '6040', name: 'Marketing', type: 'EXPENSE', group: 'Office', description: 'Advertising, printing and sponsorships.' },
  // Equity
  { code: '3000', name: "Owner's capital", type: 'EQUITY', group: 'Owner', description: 'Money the owner has put into the business.' },
  { code: '3010', name: 'Drawings', type: 'EQUITY', group: 'Owner', description: 'Money the owner has taken out for personal use.' },
];
export const ACCOUNT_BY_CODE = new Map(ACCOUNTS.map(a => [a.code, a]));
export const accountName = (code: string) => ACCOUNT_BY_CODE.get(code)?.name ?? code;

// ── Posting ───────────────────────────────────────────────────

export interface PostingLine { code: string; debit?: number | null; credit?: number | null; description?: string | null }
export interface LineCheck { ok: boolean; errors: string[]; debitPaise: number; creditPaise: number }

/** A posting must have at least two lines, only positive amounts, one side per line, and equal totals. */
export function checkLines(lines: PostingLine[], knownCodes?: Set<string>): LineCheck {
  const errors: string[] = [];
  if (lines.length < 2) errors.push('A journal entry needs at least two lines');
  const debits: number[] = [], credits: number[] = [];
  lines.forEach((l, i) => {
    const d = toPaise(l.debit ?? 0), c = toPaise(l.credit ?? 0);
    const where = `Line ${i + 1}`;
    if (knownCodes && !knownCodes.has(l.code)) errors.push(`${where}: unknown account ${l.code}`);
    if (d < 0 || c < 0) errors.push(`${where}: amounts cannot be negative`);
    if (d > 0 && c > 0) errors.push(`${where}: put the amount in debit or in credit, not both`);
    if (d === 0 && c === 0) errors.push(`${where}: enter an amount`);
    debits.push(d); credits.push(c);
  });
  const debitPaise = sumPaise(debits), creditPaise = sumPaise(credits);
  if (debitPaise !== creditPaise) errors.push(`Debits (${(debitPaise / 100).toFixed(2)}) and credits (${(creditPaise / 100).toFixed(2)}) must be equal`);
  return { ok: errors.length === 0, errors, debitPaise, creditPaise };
}

/** The mirror of a posting: every debit becomes a credit and the other way round. */
export function reverseLines<T extends PostingLine>(lines: T[]): T[] {
  return lines.map(l => ({ ...l, debit: l.credit ?? 0, credit: l.debit ?? 0 }));
}

// ── Balances ──────────────────────────────────────────────────

/** An account's balance in its natural direction: assets and expenses count debits as positive. */
export function naturalBalance(type: AccountType, debitPaise: number, creditPaise: number): number {
  return DEBIT_POSITIVE.includes(type) ? debitPaise - creditPaise : creditPaise - debitPaise;
}

export interface AccountTotals { code: string; name: string; type: AccountType; group: string; debitPaise: number; creditPaise: number; balancePaise: number }

/** Totals per account plus the trial-balance sums; `difference` must be zero in a healthy ledger. */
export function trialBalance(rows: { code: string; debitPaise: number; creditPaise: number }[]) {
  const accounts: AccountTotals[] = rows.map(r => {
    const def = ACCOUNT_BY_CODE.get(r.code);
    const type = def?.type ?? 'ASSET';
    return { code: r.code, name: def?.name ?? r.code, type, group: def?.group ?? 'Other', debitPaise: r.debitPaise, creditPaise: r.creditPaise, balancePaise: naturalBalance(type, r.debitPaise, r.creditPaise) };
  }).sort((a, b) => a.code.localeCompare(b.code));
  const totalDebit = sumPaise(accounts.map(a => a.debitPaise));
  const totalCredit = sumPaise(accounts.map(a => a.creditPaise));
  const byType = Object.fromEntries(ACCOUNT_TYPES.map(t => [t, sumPaise(accounts.filter(a => a.type === t).map(a => a.balancePaise))])) as Record<AccountType, number>;
  return { accounts, totalDebitPaise: totalDebit, totalCreditPaise: totalCredit, differencePaise: totalDebit - totalCredit, byType };
}

/** Income − expenses for a period, from the same rows a trial balance uses. */
export function profitAndLoss(rows: { code: string; debitPaise: number; creditPaise: number }[]) {
  const tb = trialBalance(rows);
  const income = tb.byType.INCOME;
  const expense = tb.byType.EXPENSE;
  const lines = tb.accounts.filter(a => a.type === 'INCOME' || a.type === 'EXPENSE');
  return { incomePaise: income, expensePaise: expense, profitPaise: income - expense, lines };
}

/** Running balance down a statement, newest last. */
export function withRunningBalance<T extends { debitPaise: number; creditPaise: number }>(type: AccountType, openingPaise: number, rows: T[]): (T & { balancePaise: number })[] {
  let running = openingPaise;
  return rows.map(r => {
    running += naturalBalance(type, r.debitPaise, r.creditPaise);
    return { ...r, balancePaise: running };
  });
}
