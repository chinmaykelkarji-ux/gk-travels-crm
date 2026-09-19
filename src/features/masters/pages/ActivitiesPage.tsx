import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { PageHeader, DataTable, Toolbar, SearchInput, StatusPill, Drawer, Money, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import type { ActivityInput } from '@/shared/contracts/masters';
import { ApiError } from '@/lib/api';
import { mastersApi, type ActivityMaster } from '../api';
import { useActivities, useMasterMutation } from '../hooks';
import { ActivityForm } from '../components/ActivityForm';
import { ImportDrawer } from '../components/ImportDrawer';

export default function ActivitiesPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const q = useMemo(() => ({ q: params.get('q') || undefined, includeInactive: params.get('inactive') === '1', page: Number(params.get('page') || 1), pageSize: 50 }), [params]);
  const setParam = (k: string, v: string | number | undefined) => { const n = new URLSearchParams(params); if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  const list = useActivities(q);
  const [editing, setEditing] = useState<ActivityMaster | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const save = useMasterMutation(({ id, body }: { id?: string; body: ActivityInput }) => (id ? mastersApi.updateActivity(id, body) : mastersApi.createActivity(body)));
  const canWrite = can('masters:write');
  const showPrices = list.data?.items[0]?.canSeePrices ?? can('rates:write');

  const cols: Column<ActivityMaster>[] = [
    { key: 'name', header: 'Activity', render: a => <div><div className="font-medium text-slate-900">{a.name}{!a.isActive && <StatusPill className="ml-2">inactive</StatusPill>}</div><div className="text-xs text-slate-500">{[a.category, a.durationMinutes ? `${a.durationMinutes} min` : null].filter(Boolean).join(' · ')}</div></div> },
    { key: 'city', header: 'City' },
    { key: 'vendor', header: 'Provider', hideBelow: 'md', render: a => a.vendor?.name ?? <span className="text-slate-400">—</span> },
    ...(showPrices ? [
      { key: 'cost', header: 'Cost / adult', align: 'right', hideBelow: 'md', render: a => <Money value={a.costAdult} /> } as Column<ActivityMaster>,
      { key: 'sell', header: 'Sell / adult', align: 'right', render: a => <Money value={a.sellAdult} /> } as Column<ActivityMaster>,
    ] : []),
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Activities" subtitle="Sightseeing, darshan, boat rides and other bookable experiences"
        actions={canWrite && <>
          <Button size="sm" variant="outline" onClick={() => setImporting(true)}><Upload className="w-4 h-4 mr-1.5" />Import</Button>
          <Button size="sm" onClick={() => setEditing('new')}><Plus className="w-4 h-4 mr-1.5" />Activity</Button>
        </>} />
      <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={q.includeInactive} onChange={e => setParam('inactive', e.target.checked ? '1' : undefined)} />Show inactive</label>}>
        <SearchInput value={q.q ?? ''} onChange={v => setParam('q', v)} placeholder="Activity, city, category…" />
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={a => a.id} loading={list.isPending} onRowClick={canWrite ? a => setEditing(a) : undefined} emptyTitle="No activities yet"
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined} />
      </div>
      <Drawer open={!!editing} onOpenChange={o => { if (!o) { setEditing(null); save.reset(); } }} title={editing === 'new' ? 'New activity' : editing ? editing.name : ''}>
        {editing && <ActivityForm initial={editing === 'new' ? undefined : editing} canSetPrices={can('rates:write')} submitting={save.isPending} error={save.error as ApiError | null} onCancel={() => setEditing(null)}
          onSubmit={body => save.mutate({ id: editing === 'new' ? undefined : editing.id, body }, { onSuccess: a => { toast.success('Activity saved', a.name); setEditing(null); } })} />}
      </Drawer>
      <ImportDrawer kind="activities" open={importing} onOpenChange={setImporting} />
    </div>
  );
}
