// Indian Standard Time helpers. The agency works in IST (UTC+05:30, no
// daylight saving), forms send wall-clock "YYYY-MM-DDTHH:mm", and the
// database stores instants. Keeping the conversion in one place stops a
// 06:00 pickup from turning into 11:30.

export const IST_OFFSET_MIN = 330;

/** "2026-10-20T06:00" (IST wall clock) → Date. Also accepts full ISO strings with an offset/Z. */
export function parseIst(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - IST_OFFSET_MIN * 60_000;
  const out = new Date(utc);
  return Number.isNaN(out.getTime()) ? null : out;
}

function shifted(d: Date | string): Date {
  const t = typeof d === 'string' ? Date.parse(d) : d.getTime();
  return new Date(t + IST_OFFSET_MIN * 60_000);
}

/** Date → "YYYY-MM-DDTHH:mm" in IST, for datetime-local inputs. */
export function toIstLocal(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return shifted(d).toISOString().slice(0, 16);
}

/** Date → IST calendar day "YYYY-MM-DD". */
export function istDay(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return shifted(d).toISOString().slice(0, 10);
}

/** Date → "HH:mm" in IST. */
export function istClock(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return shifted(d).toISOString().slice(11, 16);
}

/** Today's IST calendar day. */
export function istToday(now: Date = new Date()): string {
  return istDay(now)!;
}

/** Adds whole days to a YYYY-MM-DD. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
