import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { aiApi } from '@/features/ai/api';
import type { ApiError } from '@/lib/api';
import type { Insight } from '@/shared/calc/insights';
import { useInsights, usePhraseInsights } from '../hooks';

function Row({ i }: { i: Insight }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-800">{i.text}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-800">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}Show {i.items.length < i.count ? `first ${i.items.length}` : i.items.length === 1 ? 'it' : `all ${i.items.length}`}
            </button>
            <Link to={i.link} className="text-sky-700 hover:underline">Open the list</Link>
          </div>
          {open && (
            <ul className="mt-1 space-y-1">
              {i.items.map((x, k) => (
                <li key={k} className="text-xs leading-snug">
                  {x.link ? <Link to={x.link} className="text-slate-800 hover:underline break-words">{x.label}</Link> : <span className="text-slate-800">{x.label}</span>}
                  <span className="block text-slate-500 break-words">{x.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * What needs attention today. Counted by plain queries; a model may only
 * re-word it, and never adds a number of its own.
 */
export function InsightsPanel() {
  const { can } = usePermissions();
  const q = useInsights();
  const phrase = usePhraseInsights();
  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: aiApi.status, enabled: can('documents:read') });
  if (!can('insights:read')) return null;
  const items = q.data?.items ?? [];

  return (
    <section className="bg-white border border-slate-200 rounded-md px-4 py-3" aria-labelledby="insights-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="insights-h" className="text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-600" />Needs attention
        </h2>
        {status.data?.prose.configured && items.length > 0 && (
          <button type="button" onClick={() => phrase.mutate()} disabled={phrase.isPending}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50">
            {phrase.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}Say it in a few lines
          </button>
        )}
      </div>

      {phrase.data?.text && <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-sm text-slate-800">{phrase.data.text}</p>}
      {phrase.data && !phrase.data.text && phrase.data.reason && <p className="mt-2 text-xs text-slate-500">{phrase.data.reason}</p>}
      {phrase.isError && <p className="mt-2 text-xs text-red-700">{(phrase.error as ApiError).message}</p>}

      {q.isPending && <p className="mt-2 text-sm text-slate-500">Checking…</p>}
      {q.isError && <p className="mt-2 text-sm text-red-700">Could not check: {(q.error as ApiError).message}</p>}
      {q.data && items.length === 0 && <p className="mt-2 text-sm text-slate-600">Nothing needs attention right now.</p>}
      {items.length > 0 && <ul className="mt-1 divide-y divide-slate-100">{items.map(i => <Row key={i.code} i={i} />)}</ul>}
    </section>
  );
}
