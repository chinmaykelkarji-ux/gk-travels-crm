import { useState } from 'react';
import { PageHeader, EmptyState, StatusPill, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { tasksApi, type RuleView } from '../api';
import { useTaskMutation, useTaskRules } from '../hooks';

function RuleCard({ r, canEdit }: { r: RuleView; canEdit: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, String(v)])));
  const save = useTaskMutation((b: { enabled?: boolean; params?: Record<string, number> }) => tasksApi.updateRule(r.code, b));
  const err = save.error as ApiError | null;
  const dirty = r.params.some(p => values[p.key] !== String(r.values[p.key]));
  const done = (res: Awaited<ReturnType<typeof tasksApi.updateRule>>) => toast.success('Rule saved', `Tasks recalculated: ${res.recalculated.created} new, ${res.recalculated.updated} moved, ${res.recalculated.closed} closed`);
  const fail = (e: unknown) => toast.error('Not saved', (e as ApiError).summary);
  return (
    <li className="p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-slate-900">{r.name} <span className="text-xs font-normal text-slate-400">{r.category}</span></div>
          <p className="text-sm text-slate-600">{r.description}</p>
          {r.note && <p className="text-xs text-amber-700 mt-0.5">{r.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{r.openTasks} open</span>
          {canEdit ? (
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={r.enabled} disabled={save.isPending} onChange={e => save.mutate({ enabled: e.target.checked }, { onSuccess: done, onError: fail })} />{r.enabled ? 'On' : 'Off'}
            </label>
          ) : <StatusPill tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'on' : 'off'}</StatusPill>}
        </div>
      </div>
      {r.params.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          {r.params.map(p => (
            <label key={p.key} className="text-xs text-slate-600 space-y-1">
              <span className="block">{p.label} ({p.unit})</span>
              <TextInput type="number" min={p.min} max={p.max} step={1} className="w-28" disabled={!canEdit} invalid={!!err?.fields?.[p.key]} value={values[p.key] ?? ''} onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))} />
              {err?.fields?.[p.key] && <span className="block text-red-600">{err.fields[p.key]}</span>}
            </label>
          ))}
          {canEdit && dirty && <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ params: Object.fromEntries(r.params.map(p => [p.key, Number(values[p.key])])) }, { onSuccess: done, onError: fail })}>Save</Button>}
        </div>
      )}
    </li>
  );
}

/** Task rules: which tasks the system raises and when. Changing them is for the owner (admin). */
export default function TaskRulesPage() {
  const { can } = usePermissions();
  const q = useTaskRules();
  const canEdit = can('settings:write');
  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Task rules" crumbs={[{ label: 'Today', to: '/today' }, { label: 'Task rules' }]}
        subtitle={canEdit ? 'Timings are in India time. Saving recalculates open tasks at once.' : 'Only an admin can change these.'} />
      <div className="px-5 py-4 max-w-4xl">
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not load rules" description={(q.error as ApiError).message} />}
        {q.data && <ul className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{q.data.map(r => <RuleCard key={`${r.code}:${r.updatedAt}`} r={r} canEdit={canEdit} />)}</ul>}
      </div>
    </div>
  );
}
