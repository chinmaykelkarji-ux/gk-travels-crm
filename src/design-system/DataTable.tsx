import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key:      string;
  header:   ReactNode;
  render?:  (row: T) => ReactNode;
  width?:   string;
  align?:   'left' | 'right' | 'center';
  /** Hide on narrow screens. */
  hideBelow?: 'sm' | 'md' | 'lg';
}

interface Pagination { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }

interface Props<T> {
  columns:     Column<T>[];
  rows:        T[];
  rowKey:      (row: T) => string;
  loading?:    boolean;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyHint?:  string;
  emptyAction?: ReactNode;
  pagination?: Pagination;
  dense?:      boolean;
}

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell',
};

export function DataTable<T>({ columns, rows, rowKey, loading, onRowClick, emptyTitle = 'Nothing here yet', emptyHint, emptyAction, pagination, dense }: Props<T>) {
  const pad = dense ? 'px-3 py-1.5' : 'px-3 py-2.5';
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map(c => (
                <th key={c.key} scope="col" style={{ width: c.width }}
                  className={cn(pad, 'font-medium text-left whitespace-nowrap', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.hideBelow && HIDE[c.hideBelow])}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && rows.length === 0 && Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {columns.map(c => (
                  <td key={c.key} className={cn(pad, c.hideBelow && HIDE[c.hideBelow])}><div className="h-3.5 bg-slate-100 rounded animate-pulse" /></td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={columns.length} className="p-8">
                <EmptyState title={emptyTitle} description={emptyHint} action={emptyAction} />
              </td></tr>
            )}
            {rows.map(row => (
              <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer hover:bg-slate-50 focus-within:bg-slate-50')}>
                {columns.map(c => (
                  <td key={c.key} className={cn(pad, 'align-top text-slate-800', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.hideBelow && HIDE[c.hideBelow])}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && pagination.total > pagination.pageSize && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 text-xs text-slate-500">
          <span>
            {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" disabled={pagination.page <= 1} onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="p-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-2">Page {pagination.page}</span>
            <button type="button" aria-label="Next page" disabled={pagination.page * pagination.pageSize >= pagination.total} onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="p-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
