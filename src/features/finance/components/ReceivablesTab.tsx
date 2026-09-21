import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState, Money, StatusPill } from '@/design-system';
import type { ApiError } from '@/lib/api';
import { fmtDate } from '@/shared/utils/date';
import { financeApi } from '../api';

const BUCKET_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = { current: 'neutral', '1-30': 'warning', '31-60': 'warning', '61-90': 'danger', '90+': 'danger' };

/** Who owes what, oldest invoice first, and how late it is. */
export function ReceivablesTab() {
  const q = useQuery({ queryKey: ['finance', 'receivables'], queryFn: financeApi.receivables });
  if (q.isPending) return <p className="text-sm text-slate-500">Loading…</p>;
  if (q.isError) return <EmptyState title="Could not load what is owed" description={(q.error as ApiError).message} />;
  const r = q.data;

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-md p-4">
        <div className="flex flex-wrap gap-6">
          <div><div className="text-2xl font-semibold text-slate-900"><Money value={r.total} paise /></div><div className="text-xs text-slate-500">owed in total</div></div>
          <div><div className="text-2xl font-semibold text-red-700"><Money value={r.overdue} paise /></div><div className="text-xs text-slate-500">past its due date</div></div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {r.buckets.map(b => (
            <div key={b.key} className={`rounded-md border p-2 ${b.key !== 'current' && b.amount > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
              <div className="text-sm font-medium"><Money value={b.amount} paise /></div><div className="text-[11px] text-slate-500">{b.label}</div>
            </div>
          ))}
        </div>
      </section>

      {r.customers.length === 0 ? <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="Nobody owes anything" description="Every invoice raised so far has been settled." /></div> : (
        <ul className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
          {r.customers.map(c => (
            <li key={c.key} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900">
                    {c.customerId ? <Link className="text-indigo-700 hover:underline" to={`/customers/${c.customerId}`}>{c.customerName}</Link> : c.customerName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.invoices.length} unpaid invoice{c.invoices.length === 1 ? '' : 's'}
                    {c.unusedAdvance > 0 && <> · <Money value={c.unusedAdvance} paise /> received and not yet billed</>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold"><Money value={c.outstanding} paise /></div>
                  {c.overdue > 0 && <div className="text-xs text-red-600"><Money value={c.overdue} paise /> late</div>}
                </div>
              </div>
              {c.invoices.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {c.invoices.map(i => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-600">
                        {i.number} · {fmtDate(i.date)}{i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ''}
                        {i.daysOverdue > 0 && <StatusPill tone={BUCKET_TONE[i.bucket] ?? 'warning'} className="ml-2">{i.daysOverdue} days late</StatusPill>}
                      </span>
                      <Money value={i.outstanding} paise />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
