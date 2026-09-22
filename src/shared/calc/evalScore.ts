// ============================================================
// Scoring what a model read against what the document actually says.
//
// Four verdicts per field, because they are not equally bad:
//   correct — the value matches what a person wrote down
//   missed  — the document shows it, the model answered null. Safe: the
//             review screen asks a person, so nothing wrong is saved
//   wrong   — a value was given and it differs. The dangerous one
//   extra   — the document does not show it and the model gave a value
//             anyway: a guess, which hard rule 8 forbids
//
// A field marked "unreadable" in the expectations (value null) is only
// correct when the model also answered null.
// ============================================================

export type Verdict = 'correct' | 'missed' | 'wrong' | 'extra';

export interface FieldScore {
  path: string;
  verdict: Verdict;
  confidence?: string;
  /** True when the document itself shows nothing for this field. */
  expectedEmpty: boolean;
}

export interface ScoreSummary {
  fields: number;
  correct: number;
  missed: number;
  wrong: number;
  extra: number;
  /** Of the fields the document shows, how many were read correctly. */
  recall: number;
  /** Of the values the model gave, how many were right. */
  precision: number;
  /** Values given where the document shows nothing — this must stay zero. */
  guessRate: number;
}

const norm = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v).trim().toLowerCase().replace(/\s+/g, ' ');
};

/** Money and counts compare as numbers so "14500" and 14500 agree. */
function same(expected: unknown, actual: unknown): boolean {
  const a = norm(expected);
  const b = norm(actual);
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  return a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

const isAnswered = (v: unknown): v is { value: unknown; confidence?: string } =>
  !!v && typeof v === 'object' && 'value' in (v as object);

/** Walks the expectation and scores the answer beside it, field by field. */
export function scoreFields(expected: unknown, actual: unknown, path: string[] = []): FieldScore[] {
  const here = path.join('.');

  if (Array.isArray(expected)) {
    const rows = Array.isArray(actual) ? actual : [];
    const out: FieldScore[] = [];
    expected.forEach((row, i) => out.push(...scoreFields(row, rows[i], [...path, String(i + 1)])));
    // Rows the model invented are guesses of their own.
    for (let i = expected.length; i < rows.length; i++) out.push({ path: `${here}.${i + 1}`, verdict: 'extra', expectedEmpty: true });
    return out;
  }

  if (isAnswered(expected) || !(expected && typeof expected === 'object')) {
    const want = isAnswered(expected) ? expected.value : expected;
    const got = isAnswered(actual) ? actual.value : actual;
    const confidence = isAnswered(actual) ? actual.confidence : undefined;
    const wantEmpty = norm(want) === '';
    const gotEmpty = norm(got) === '';
    if (wantEmpty && gotEmpty) return [{ path: here, verdict: 'correct', confidence, expectedEmpty: true }];
    if (wantEmpty) return [{ path: here, verdict: 'extra', confidence, expectedEmpty: true }];
    if (gotEmpty) return [{ path: here, verdict: 'missed', confidence, expectedEmpty: false }];
    return [{ path: here, verdict: same(want, got) ? 'correct' : 'wrong', confidence, expectedEmpty: false }];
  }

  const out: FieldScore[] = [];
  for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
    const next = (actual && typeof actual === 'object' ? (actual as Record<string, unknown>)[key] : undefined);
    out.push(...scoreFields(value, next, [...path, key]));
  }
  return out;
}

export function summarise(scores: FieldScore[]): ScoreSummary {
  const count = (v: Verdict) => scores.filter(s => s.verdict === v).length;
  const correct = count('correct');
  const missed = count('missed');
  const wrong = count('wrong');
  const extra = count('extra');
  // Only fields the document actually shows count towards how much was read;
  // agreeing that a field is blank is right, but it is not a field read.
  const correctWithValue = scores.filter(s => s.verdict === 'correct' && !s.expectedEmpty).length;
  const shown = correctWithValue + missed + wrong;
  const given = correctWithValue + wrong + extra;
  return {
    fields: scores.length,
    correct, missed, wrong, extra,
    recall: shown ? correctWithValue / shown : 1,
    precision: given ? correctWithValue / given : 1,
    guessRate: scores.length ? extra / scores.length : 0,
  };
}

/** Adds up whole runs: the rates are recomputed, never averaged. */
export function scoreAll(scores: FieldScore[][]): ScoreSummary {
  return summarise(scores.flat());
}

export const EMPTY_SUMMARY: ScoreSummary = { fields: 0, correct: 0, missed: 0, wrong: 0, extra: 0, recall: 1, precision: 1, guessRate: 0 };

/** A run is only worth trusting when it guesses nothing and is rarely wrong. */
export function verdictOf(s: ScoreSummary, maxWrong = 0.02): 'good' | 'check' | 'poor' {
  const wrongRate = s.fields ? s.wrong / s.fields : 0;
  if (s.extra > 0 || wrongRate > maxWrong * 2) return 'poor';
  if (wrongRate > maxWrong || s.missed / Math.max(1, s.fields) > 0.25) return 'check';
  return 'good';
}
