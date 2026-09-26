import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, PageHeader, StatusPill, type Tone } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { api, type ApiError } from '@/lib/api';
import type { AutomationRuleView, AutomationRunView, AutomationUpdate } from '@/shared/contracts/automation';

const KEY = ['automations'] as const;
const TONE: Record<string, Tone> = { DONE: 'success', SKIPPED: 'neutral', FAILED: 'danger', RUNNING: 'warning' };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function Runs({ ruleKey }: { ruleKey: string }) {
  const q = useQuery({ queryKey: [...KEY, 'runs', ruleKey], queryFn: () => api.get<{ items: AutomationRunView[] }>(`/v2/automations/${ruleKey}/runs`) });
  if (q.isPending) return <p className="text-xs text-slate-500">Loading…</p>;
  if (!q.data?.items.length) return <p className="text-xs text-slate-500">It has not acted on anything yet.</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {q.data.items.map(r => (
        <li key={r.id} className="py-1.5">
          <div className="flex flex-wrap items-center gap-2"><StatusPill tone={TONE[r.status] ?? 'neutral'}>{r.status === 'DONE' ? 'Done' : r.status === 'SKIPPED' ? 'Skipped' : r.status === 'FAILED' ? 'Failed' : 'Running'}</StatusPill><span className="text-slate-800 break-words">{r.summary}</span></div>
          <p className="text-xs text-slate-500 mt-0.5 break-words">{when(r.at)} · {r.outcomes.map(o => o.detail).join(' · ')}</p>
        </li>
      ))}
    </ul>
  );
}

function RuleCard({ r, canEdit }: { r: AutomationRuleView; canEdit: boolean }) {
  const qc = useQueryClient();
  const [showRuns, setShowRuns] = useState(false);
  const [values, setValues] = useState(() => Object.fromEntries(r.paramDefs.map(p => [p.key, Array.isArray(r.params[p.key]) ? (r.params[p.key] as number[]).join(', ') : String(r.params[p.key] ?? '')])));
  const save = useMutation({
    mutationFn: (b: AutomationUpdate) => api.patch<AutomationRuleView>(`/v2/automations/${r.key}`, b),
    onSuccess: v => { void qc.invalidateQueries({ queryKey: KEY }); toast.success(v.enabled ? 'Switched on' : 'Saved', v.name); },
    onError: e => toast.error('Not saved', (e as ApiError).summary),
  });
  const params = () => Object.fromEntries(r.paramDefs.map(p => [p.key, p.list ? values[p.key].split(/[,\s]+/).filter(Boolean).map(Number) : Number(values[p.key])]));
  const send = r.actions.find(a => a.type === 'send');

  return (
    <li className="p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900 flex flex-wrap items-center gap-2">{r.name}
            <StatusPill tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'On' : 'Off'}</StatusPill>
            {r.customerFacing && <StatusPill tone="warning">Messages customers</StatusPill>}
          </p>
          <p className="text-sm text-slate-600 mt-0.5">{r.description}</p>
          <p className="text-xs text-slate-500 mt-0.5">{r.actions.map(a => a.label).join(' · ')}{r.replaces ? ` · ${r.replaces}` : ''}</p>
          <p className="text-xs text-slate-500">Last 30 days: {r.last30.DONE ?? 0} done · {r.last30.FAILED ?? 0} failed · {r.last30.SKIPPED ?? 0} skipped{r.enabled && r.enabledAt ? ` · on since ${when(r.enabledAt)}` : ''}</p>
        </div>
        {canEdit && <Button size="sm" variant={r.enabled ? 'outline' : 'default'} disabled={save.isPending} onClick={() => save.mutate({ enabled: !r.enabled })}>{r.enabled ? 'Switch off' : 'Switch on'}</Button>}
      </div>
      {canEdit && (r.paramDefs.length > 0 || send) && (
        <div className="flex flex-wrap items-end gap-3">
          {r.paramDefs.map(p => (
            <label key={p.key} className="text-xs text-slate-600">{p.label}{p.list ? ' (comma separated)' : ''}
              <input value={values[p.key]} onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))} className="mt-0.5 block w-40 rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </label>
          ))}
          {send && (
            <label className="text-xs text-slate-600">Send by
              <select defaultValue={send.type === 'send' ? send.channel : 'WHATSAPP'} onChange={e => save.mutate({ channel: e.target.value as 'WHATSAPP' | 'EMAIL' })} className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1 text-sm bg-white">
                <option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option>
              </select>
            </label>
          )}
          {r.paramDefs.length > 0 && <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ params: params() })}>Save numbers</Button>}
        </div>
      )}
      <button type="button" className="text-xs text-sky-700 hover:underline" onClick={() => setShowRuns(s => !s)} aria-expanded={showRuns}>{showRuns ? 'Hide' : 'Show'} what it did</button>
      {showRuns && <Runs ruleKey={r.key} />}
    </li>
  );
}

/** What TravelOS does by itself, switched on by the owner, with a record of every time it acted. */
export default function AutomationsPage() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<{ items: AutomationRuleView[] }>('/v2/automations') });
  const run = useMutation({
    mutationFn: () => api.post<{ events: number; done: number; failed: number; skipped: number }>('/v2/automations/run', {}),
    onSuccess: s => { void qc.invalidateQueries({ queryKey: KEY }); toast.success('Checked', `${s.events} new event${s.events === 1 ? '' : 's'}: ${s.done} done, ${s.failed} failed, ${s.skipped} skipped`); },
  });
  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Automations" subtitle="What TravelOS does by itself. Rules that message customers stay off until you switch them on."
        actions={can('settings:write') ? <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>Check now</Button> : undefined} />
      <div className="px-5 py-4 space-y-3 max-w-4xl">
        <p className="text-xs text-slate-500">Rules check every 15 minutes. Messages use your <Link to="/settings/templates" className="text-sky-700 hover:underline">templates</Link> and go out only through a channel that is <Link to="/settings/messaging" className="text-sky-700 hover:underline">configured</Link>.</p>
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not load the rules" description={(q.error as ApiError).message} />}
        {q.data && <ul className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{q.data.items.map(r => <RuleCard key={r.id} r={r} canEdit={can('settings:write')} />)}</ul>}
      </div>
    </div>
  );
}
