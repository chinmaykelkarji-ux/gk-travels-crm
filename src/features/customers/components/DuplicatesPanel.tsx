import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { fmtDate } from '@/shared/utils/date';
import { useDuplicateGroups, useMergeCustomers } from '../hooks';
import type { DuplicateGroup } from '../api';

export function DuplicatesPanel({ enabled }: { enabled: boolean }) {
  const groups = useDuplicateGroups(enabled);
  if (groups.isPending) return <p className="text-sm text-slate-500">Scanning…</p>;
  if (groups.isError) return <p className="text-sm text-red-600">Could not load duplicates.</p>;
  if (!groups.data?.length) return <EmptyState title="No duplicates found" description="No two live customers share a phone number." compact />;
  return (
    <div className="space-y-4">
      {groups.data.map(g => <Group key={g.phoneNormalized} group={g} />)}
    </div>
  );
}

function Group({ group }: { group: DuplicateGroup }) {
  const merge = useMergeCustomers();
  const [keepId, setKeepId] = useState(group.customers[0].id);

  async function run() {
    const keep = group.customers.find(c => c.id === keepId)!;
    const others = group.customers.filter(c => c.id !== keepId);
    const ok = await confirm({
      title: `Merge ${others.length} customer${others.length > 1 ? 's' : ''} into ${keep.name}?`,
      description: `${others.map(o => `${o.name} (${o.id})`).join(', ')} will be archived and every trip, invoice, payment and document moved to ${keep.id}. This cannot be undone.`,
      confirmLabel: 'Merge', variant: 'destructive',
    });
    if (!ok) return;
    for (const o of others) {
      try {
        const r = await merge.mutateAsync({ targetId: keepId, sourceId: o.id });
        const moved = Object.entries(r.moved).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
        toast.success(`Merged ${o.name} into ${keep.name}`, moved || 'Nothing else to move');
      } catch (e) {
        toast.error(`Could not merge ${o.name}`, (e as Error).message);
        return;
      }
    }
  }

  return (
    <div className="border border-slate-200 rounded-md bg-white">
      <div className="px-3 py-2 border-b border-slate-100 text-xs text-slate-500 flex items-center justify-between">
        <span>Phone <span className="tabular-nums text-slate-800">{group.phoneNormalized}</span> · {group.customers.length} records</span>
        <Button size="sm" onClick={run} loading={merge.isPending}>Merge into selected</Button>
      </div>
      <ul className="divide-y divide-slate-100">
        {group.customers.map(c => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <input type="radio" name={`keep-${group.phoneNormalized}`} checked={keepId === c.id} onChange={() => setKeepId(c.id)} aria-label={`Keep ${c.name}`} />
            <div className="flex-1 min-w-0">
              <Link to={`/customers/${c.id}`} className="font-medium text-slate-900 hover:underline">{c.name}</Link>
              <div className="text-xs text-slate-500">{c.id} · {c.phone}{c.email ? ` · ${c.email}` : ''} · added {fmtDate(c.createdAt)}</div>
            </div>
            {keepId === c.id && <StatusPill tone="success">keep</StatusPill>}
          </li>
        ))}
      </ul>
    </div>
  );
}
