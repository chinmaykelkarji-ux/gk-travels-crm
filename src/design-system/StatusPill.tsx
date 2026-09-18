import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info:    'bg-sky-50 text-sky-700 border-sky-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  accent:  'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export function StatusPill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium uppercase tracking-wide whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  );
}
