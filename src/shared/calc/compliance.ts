// Vehicle and driver document compliance: insurance, permit, fitness, PUC,
// driving licence. A vehicle whose insurance has lapsed must not be sent on a
// trip; one that lapses within the warning window gets a task.

export type ComplianceState = 'OK' | 'EXPIRING' | 'EXPIRED' | 'MISSING';

const RANK: Record<ComplianceState, number> = { OK: 0, MISSING: 1, EXPIRING: 2, EXPIRED: 3 };

export function documentState(expiry: string | null | undefined, onDate: string, warnDays: number): ComplianceState {
  if (!expiry) return 'MISSING';
  if (expiry < onDate) return 'EXPIRED';
  const warnUntil = new Date(Date.parse(`${onDate}T00:00:00Z`) + warnDays * 86_400_000).toISOString().slice(0, 10);
  return expiry <= warnUntil ? 'EXPIRING' : 'OK';
}

export interface ComplianceItem { document: string; expiry: string | null; state: ComplianceState }

export interface ComplianceReport { state: ComplianceState; items: ComplianceItem[] }

/**
 * Worst state across the documents. MISSING ranks below EXPIRING: a vendor
 * vehicle often has no permit on file yet, which needs follow-up but is not
 * a proven lapse.
 */
export function complianceReport(docs: Record<string, string | null | undefined>, onDate: string, warnDays = 30): ComplianceReport {
  const items = Object.entries(docs).map(([document, expiry]) => ({ document, expiry: expiry ?? null, state: documentState(expiry, onDate, warnDays) }));
  const state = items.reduce<ComplianceState>((worst, i) => (RANK[i.state] > RANK[worst] ? i.state : worst), 'OK');
  return { state, items };
}

/**
 * Documents expired on at least one day of [fromDate, toDate] (the vehicle
 * cannot legally run the whole duty). A document valid "until X" is valid on X.
 */
export function lapsesDuring(docs: Record<string, string | null | undefined>, toDate: string): string[] {
  return Object.entries(docs).filter(([, exp]) => !!exp && exp < toDate).map(([d]) => d);
}
