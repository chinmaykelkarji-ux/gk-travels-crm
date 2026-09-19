import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import { PageHeader, DataTable, Toolbar, SearchInput, Select, Drawer, Money, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { TicketMode, TicketStatus, TICKET_STATUS_LABEL, type TicketInput, type TicketListQuery } from '@/shared/contracts/tickets';
import { ApiError } from '@/lib/api';
import { ticketsApi, type Ticket } from '../api';
import { useTickets, useTicketMutation } from '../hooks';
import { TicketForm } from '../components/TicketForm';
import { TicketStatusPill } from '../components/TicketStatusPill';

export default function TicketsPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const q: Partial<TicketListQuery> = useMemo(() => ({
    q: params.get('q') || undefined, mode: (params.get('mode') as TicketListQuery['mode']) || undefined, status: (params.get('status') as TicketListQuery['status']) || undefined,
    from: params.get('from') || undefined, to: params.get('to') || undefined, page: Number(params.get('page') || 1), pageSize: 25,
  }), [params]);
  const setParam = (k: string, v: string | number | undefined) => { const n = new URLSearchParams(params); if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  const list = useTickets(q);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const create = useTicketMutation((b: TicketInput) => ticketsApi.create(b));

  async function importClassic() {
    setImporting(true);
    try {
      const r = await ticketsApi.importClassic();
      toast.success('Classic bookings imported', `${r.tickets} tickets, ${r.hotels} hotels, ${r.vehicles} vehicle duties, ${r.activities} activities${r.skipped ? ` · ${r.skipped} stay on the classic screen (no trip or date)` : ''}`);
      void list.refetch();
    } catch (e) { toast.error('Import failed', (e as ApiError).message); } finally { setImporting(false); }
  }

  const cols: Column<Ticket>[] = [
    { key: 'no', header: 'Ticket', render: t => <div><div className="font-medium text-slate-900">{t.displayNumber}</div><div className="text-xs text-slate-500">{t.mode.toLowerCase()}{t.pnr ? ` · PNR ${t.pnr}` : ''}</div></div> },
    { key: 'route', header: 'Route', render: t => <div><div>{t.route}</div><div className="text-xs text-slate-500">{t.departLocal?.replace('T', ' ') ?? 'date not set'}{t.carrier ? ` · ${t.carrier}` : ''}</div></div> },
    { key: 'who', header: 'For', hideBelow: 'md', render: t => t.tripId ? <Link to={`/trips/${t.tripId}`} onClick={e => e.stopPropagation()} className="hover:underline">{t.tripId}</Link> : t.customer?.name ?? '—' },
    { key: 'pax', header: 'Pax', align: 'right', render: t => t.paxCount },
    { key: 'status', header: 'Status', render: t => <TicketStatusPill status={t.status} /> },
    { key: 'fare', header: 'Fare', align: 'right', hideBelow: 'lg', render: t => <Money value={t.fare.totalFare} /> },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Tickets" subtitle="Flight, train and bus — one PNR can carry the whole group"
        actions={<>
          <Link to="/bookings" className="text-xs text-slate-500 hover:text-slate-800">Classic bookings</Link>
          {can('trips:write') && <Button size="sm" variant="outline" onClick={() => void importClassic()} loading={importing}><Download className="w-4 h-4 mr-1.5" />Import from classic</Button>}
          {can('operations:write') && <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Ticket</Button>}
        </>} />
      <Toolbar>
        <SearchInput value={q.q ?? ''} onChange={v => setParam('q', v)} placeholder="PNR, passenger, train/flight no., place…" />
        <Select aria-label="Mode" className="w-auto" value={q.mode ?? ''} onChange={e => setParam('mode', e.target.value)}><option value="">All modes</option>{TicketMode.options.map(m => <option key={m} value={m}>{m.toLowerCase()}</option>)}</Select>
        <Select aria-label="Status" className="w-auto" value={q.status ?? ''} onChange={e => setParam('status', e.target.value)}><option value="">Any status</option>{TicketStatus.options.map(s => <option key={s} value={s}>{TICKET_STATUS_LABEL[s]}</option>)}</Select>
        <input type="date" aria-label="Departing from" className="h-9 px-2 text-sm rounded-md border border-slate-300" value={q.from ?? ''} onChange={e => setParam('from', e.target.value)} />
        <input type="date" aria-label="Departing to" className="h-9 px-2 text-sm rounded-md border border-slate-300" value={q.to ?? ''} onChange={e => setParam('to', e.target.value)} />
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={t => t.id} loading={list.isPending} onRowClick={t => navigate(`/tickets/${t.id}`)}
          emptyTitle="No tickets yet" emptyHint="Add a ticket here or from a trip, or import the bookings made on the classic screen."
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined} />
      </div>
      <Drawer open={creating} onOpenChange={o => { setCreating(o); if (!o) create.reset(); }} title="New ticket" width="xl">
        {creating && <TicketForm submitting={create.isPending} error={create.error as ApiError | null} onCancel={() => setCreating(false)}
          onSubmit={b => create.mutate(b, { onSuccess: t => { toast.success('Ticket saved', t.displayNumber ?? ''); setCreating(false); navigate(`/tickets/${t.id}`); } })} />}
      </Drawer>
    </div>
  );
}
