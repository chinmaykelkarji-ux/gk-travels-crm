import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

export interface KV { label: ReactNode; value: ReactNode; span?: 1 | 2 }

/** Definition list for detail views — compact, two columns on wide screens. */
export function KeyValue({ items, columns = 2, className }: { items: KV[]; columns?: 1 | 2 | 3; className?: string }) {
  const grid = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2';
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', grid, className)}>
      {items.map((it, i) => (
        <div key={i} className={cn(it.span === 2 && 'sm:col-span-2')}>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">{it.label}</dt>
          <dd className="text-sm text-slate-900 mt-0.5 break-words">{it.value ?? <span className="text-slate-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
