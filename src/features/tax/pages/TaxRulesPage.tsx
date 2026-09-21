import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, Field, Money, PageHeader, StatusPill, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { istToday } from '@/shared/calc/istTime';
import { fmtDate } from '@/shared/utils/date';
import { taxApi, type TaxRuleRow } from '../api';

function RuleCard({ r, canEdit }: { r: TaxRuleRow; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(String(r.current?.rate ?? r.defaultRate));
  const [threshold, setThreshold] = useState(String(r.current?.threshold ?? r.defaultThreshold ?? 0));
  const [enabled, setEnabled] = useState(r.current?.enabled ?? r.kind === 'GST');
  const [from, setFrom] = useState(istToday());
  const save = useMutation({
    mutationFn: () => taxApi.save(r.code, { rate: Number(rate), threshold: Number(threshold || 0), enabled, effectiveFrom: from, effectiveTo: null, note: null }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tax-rules'] }); toast.success('Saved', `${r.name} · ${enabled ? `${rate}%` : 'off'} from ${from}`); setOpen(false); },
    onError: e => toast.error('Not saved', (e as ApiError).summary),
  });

  return (
    <li className="p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[260px]">
          <div className="font-medium text-slate-900">{r.name} <StatusPill tone={r.kind === 'TCS' ? 'warning' : 'info'}>{r.kind}</StatusPill></div>
          <p className="text-sm text-slate-600 mt-0.5">{r.note}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{r.current && !r.current.enabled ? 'Off' : `${r.effectiveRate}%`}</div>
          <div className="text-xs text-slate-500">
            {r.current ? <>in force since {fmtDate(r.current.effectiveFrom)}</> : <>not set — the {r.defaultRate}% default is used</>}
            {r.kind === 'TCS' && <> · above <Money value={r.current?.threshold ?? r.defaultThreshold ?? 0} paise /> a year</>}
          </div>
        </div>
      </div>

      {canEdit && (open ? (
        <div className="rounded-md border border-slate-200 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Rate (%)" htmlFor={`${r.code}-rate`}><TextInput id={`${r.code}-rate`} inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} /></Field>
            {r.kind === 'TCS' && <Field label="Yearly limit per customer (₹)" htmlFor={`${r.code}-th`}><TextInput id={`${r.code}-th`} inputMode="decimal" value={threshold} onChange={e => setThreshold(e.target.value)} /></Field>}
            <Field label="From which day" htmlFor={`${r.code}-from`} hint="Older bills keep the rate that applied then"><TextInput id={`${r.code}-from`} type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            Charge this tax {r.kind === 'TCS' && <span className="text-amber-700">— check with your CA before switching TCS on</span>}
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save rate</Button>
          </div>
        </div>
      ) : <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Change rate</Button>)}

      {r.history.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">What it has been</summary>
          <ul className="mt-1 space-y-0.5">
            {r.history.map(h => <li key={h.id}>{h.enabled ? `${h.rate}%` : 'off'} from {fmtDate(h.effectiveFrom)}{h.effectiveTo ? ` to ${fmtDate(h.effectiveTo)}` : ''}{h.note ? ` — ${h.note}` : ''}</li>)}
          </ul>
        </details>
      )}
    </li>
  );
}

/** The rates the business charges. Changing one starts a new rate from a day; old bills keep theirs. */
export default function TaxRulesPage() {
  const { can } = usePermissions();
  const q = useQuery({ queryKey: ['tax-rules'], queryFn: () => taxApi.list() });
  const canEdit = can('settings:write');
  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Tax rates" crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Tax rates' }]}
        subtitle={canEdit ? 'These decide what is charged on quotations, tickets and invoices. Every note says what to check with your CA.' : 'Only an admin can change these.'} />
      <div className="px-5 py-4 max-w-4xl">
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not load the rates" description={(q.error as ApiError).message} />}
        {q.data && <ul className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{q.data.map(r => <RuleCard key={`${r.code}:${r.current?.effectiveFrom ?? 'default'}`} r={r} canEdit={canEdit} />)}</ul>}
      </div>
    </div>
  );
}
