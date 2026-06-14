import { format, formatDistanceToNow, differenceInCalendarDays, parseISO, isValid } from 'date-fns';

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return '—';
    return format(d, 'dd/MM/yyyy');
  } catch {
    return '—';
  }
}

export function fmtDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return '—';
    return format(d, 'EEEE, dd MMMM yyyy');
  } catch {
    return '—';
  }
}

export function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (!isValid(d)) return '—';
    return format(d, 'dd/MM/yyyy, h:mm a');
  } catch {
    return '—';
  }
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return null;
    return differenceInCalendarDays(d, new Date());
  } catch {
    return null;
  }
}

export function daysAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (!isValid(d)) return '—';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

export function daysUntilLabel(dateStr: string | null | undefined): string {
  const days = daysUntil(dateStr);
  if (days === null) return '—';
  if (days < 0)      return 'Departed';
  if (days === 0)    return 'Today';
  if (days === 1)    return 'Tomorrow';
  return `${days}d away`;
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function isThisMonth(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return dateStr.startsWith(monthKey());
}

export function isLastMonth(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const last = new Date();
  last.setMonth(last.getMonth() - 1);
  return dateStr.startsWith(monthKey(last));
}

export function startOfMonthStr(monthsBack = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

export function endOfMonthStr(monthsBack = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack + 1);
  d.setDate(0);
  return d.toISOString().split('T')[0];
}
