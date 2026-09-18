import { cn } from '@/shared/utils/cn';

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const fmtPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹ amounts, Indian grouping, tabular digits; negative in red, null as a dash. */
export function Money({ value, paise, className, muted }: { value: number | null | undefined; paise?: boolean; className?: string; muted?: boolean }) {
  if (value === null || value === undefined) return <span className={cn('text-slate-400', className)}>—</span>;
  const negative = value < 0;
  return (
    <span className={cn('tabular-nums', negative && 'text-red-600', muted && 'text-slate-500', className)}>
      {(paise ? fmtPaise : fmt).format(value)}
    </span>
  );
}

export function formatINR(value: number, paise = false): string {
  return (paise ? fmtPaise : fmt).format(value);
}
