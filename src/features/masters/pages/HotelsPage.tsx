import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { PageHeader, DataTable, Toolbar, SearchInput, StatusPill, Drawer, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import type { HotelInput } from '@/shared/contracts/masters';
import type { ImportKind } from '@/shared/calc/importMapping';
import { ApiError } from '@/lib/api';
import { mastersApi, type HotelSummary } from '../api';
import { useHotels, useMasterMutation } from '../hooks';
import { HotelForm } from '../components/HotelForm';
import { ImportDrawer } from '../components/ImportDrawer';

export default function HotelsPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const q = useMemo(() => ({ q: params.get('q') || undefined, includeInactive: params.get('inactive') === '1', page: Number(params.get('page') || 1), pageSize: 50 }), [params]);
  const setParam = (k: string, v: string | number | undefined) => { const n = new URLSearchParams(params); if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  const list = useHotels(q);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState<ImportKind | null>(null);
  const create = useMasterMutation((body: HotelInput) => mastersApi.createHotel(body));

  const cols: Column<HotelSummary>[] = [
    { key: 'name', header: 'Hotel', render: h => <div><div className="font-medium text-slate-900">{h.name}{!h.isActive && <StatusPill className="ml-2">inactive</StatusPill>}</div><div className="text-xs text-slate-500">{h.category ?? ''}</div></div> },
    { key: 'city', header: 'City', render: h => `${h.city}${h.state ? `, ${h.state}` : ''}` },
    { key: 'vendor', header: 'Booked through', hideBelow: 'md', render: h => h.vendor?.name ?? <span className="text-slate-400">direct</span> },
    { key: 'rooms', header: 'Room types', align: 'right', render: h => h.roomTypeCount },
    { key: 'phone', header: 'Phone', hideBelow: 'lg', render: h => h.phone ?? <span className="text-slate-400">—</span> },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Hotels" subtitle={list.data ? `${list.data.total} hotel${list.data.total === 1 ? '' : 's'}` : undefined}
        actions={<>
          {can('rates:write') && <Button size="sm" variant="outline" onClick={() => setImporting('hotel-rates')}><Upload className="w-4 h-4 mr-1.5" />Import rate sheet</Button>}
          {can('masters:write') && <Button size="sm" variant="outline" onClick={() => setImporting('hotels')}><Upload className="w-4 h-4 mr-1.5" />Import hotels</Button>}
          {can('masters:write') && <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Hotel</Button>}
        </>} />
      <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={q.includeInactive} onChange={e => setParam('inactive', e.target.checked ? '1' : undefined)} />Show inactive</label>}>
        <SearchInput value={q.q ?? ''} onChange={v => setParam('q', v)} placeholder="Hotel, city, category…" />
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={h => h.id} loading={list.isPending} onRowClick={h => navigate(`/hotels/${h.id}`)}
          emptyTitle="No hotels yet" emptyHint="Add the hotels and dharamshalas you use, or import a DMC rate sheet."
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined} />
      </div>
      <Drawer open={creating} onOpenChange={o => { setCreating(o); if (!o) create.reset(); }} title="New hotel">
        <HotelForm submitting={create.isPending} error={create.error as ApiError | null} onCancel={() => setCreating(false)}
          onSubmit={body => create.mutate(body, { onSuccess: h => { toast.success('Hotel added', h.name); setCreating(false); navigate(`/hotels/${h.id}`); } })} />
      </Drawer>
      {importing && <ImportDrawer kind={importing} open onOpenChange={o => !o && setImporting(null)} />}
    </div>
  );
}
