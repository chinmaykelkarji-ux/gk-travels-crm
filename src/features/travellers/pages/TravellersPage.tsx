import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ShieldAlert } from 'lucide-react';
import { PageHeader, DataTable, Toolbar, SearchInput, Drawer, Select, StatusPill, EmptyState, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import { ageOn, travellerDisplayName } from '@/shared/calc/travellers';
import type { TravellerSummary, TravellerListQuery } from '@/shared/contracts/travellers';
import { ApiError } from '@/lib/api';
import { useTravellerList, useCreateTraveller, usePassportAlerts } from '../hooks';
import { TravellerForm } from '../components/TravellerForm';
import { PassportPill } from '../components/PassportPill';

const PAGE_SIZE = 25;

export default function TravellersPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const query: Partial<TravellerListQuery> = useMemo(() => ({
    q: params.get('q') || undefined,
    passport: (params.get('passport') as TravellerListQuery['passport']) || undefined,
    customerId: params.get('customerId') || undefined,
    page: Number(params.get('page') || 1), pageSize: PAGE_SIZE,
  }), [params]);
  const setParam = (key: string, value: string | number | undefined) => {
    const next = new URLSearchParams(params);
    if (value === undefined || value === '' || (key === 'page' && value === 1)) next.delete(key); else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const list = useTravellerList(query);
  const create = useCreateTraveller();
  const alerts = usePassportAlerts(180, alertsOpen);

  const columns: Column<TravellerSummary>[] = [
    { key: 'name', header: 'Traveller', render: t => (
      <div className="min-w-0"><div className="font-medium text-slate-900 truncate">{travellerDisplayName(t)}</div><div className="text-xs text-slate-500">{t.id}{t.dateOfBirth ? ` · ${ageOn(t.dateOfBirth)} yrs` : ''}</div></div>
    ) },
    { key: 'customer', header: 'Customer', hideBelow: 'sm', render: t => t.customerId ? <Link to={`/customers/${t.customerId}`} onClick={e => e.stopPropagation()} className="hover:underline">{t.customerName}</Link> : <span className="text-slate-400">—</span> },
    { key: 'passportNumber', header: 'Passport', hideBelow: 'md', render: t => t.passportNumber ?? <span className="text-slate-400">—</span> },
    { key: 'passportExpiry', header: 'Expiry', render: t => <PassportPill expiry={t.passportExpiry} status={t.passportStatus} /> },
    { key: 'nationality', header: 'Nationality', hideBelow: 'lg', render: t => t.nationality ?? '—' },
    { key: 'trips', header: 'Trips', align: 'right', render: t => <span className="tabular-nums">{t.tripCount}</span> },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Travellers" subtitle={list.data ? `${list.data.total} traveller${list.data.total === 1 ? '' : 's'}` : undefined}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => setAlertsOpen(true)}><ShieldAlert className="w-4 h-4 mr-1.5" />Passport alerts</Button>
          {can('customers:write') && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1.5" />New traveller</Button>}
        </>} />
      <Toolbar>
        <SearchInput value={query.q ?? ''} onChange={v => setParam('q', v)} placeholder="Name, passport number, customer…" autoFocus />
        <Select aria-label="Passport" className="w-auto" value={query.passport ?? ''} onChange={e => setParam('passport', e.target.value)}>
          <option value="">All passports</option><option value="EXPIRING">Expiring within 6 months</option><option value="EXPIRED">Expired</option><option value="MISSING">No passport on file</option>
        </Select>
        {query.customerId && <StatusPill tone="accent"><span className="cursor-pointer" onClick={() => setParam('customerId', undefined)}>customer: {query.customerId} ×</span></StatusPill>}
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={t => t.id} loading={list.isPending} onRowClick={t => navigate(`/travellers/${t.id}`)}
          emptyTitle={query.q || query.passport ? 'No travellers match' : 'No travellers yet'} emptyHint="Travellers are the people who fly; add them here or from a customer's profile."
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined} />
      </div>

      <Drawer open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) create.reset(); }} title="New traveller" width="xl">
        <TravellerForm customerId={query.customerId} submitting={create.isPending} error={create.error as ApiError | null} onCancel={() => setCreateOpen(false)}
          onSubmit={v => create.mutate(v, {
            onSuccess: t => { toast.success('Traveller added', `${t.id} · ${t.firstName} ${t.lastName}`); setCreateOpen(false); },
            onError: e => { if (!(e instanceof ApiError) || (!e.fields && e.code !== 'CONFLICT')) toast.error('Could not add traveller', (e as Error).message); },
          })} submitLabel="Add traveller" />
      </Drawer>

      <Drawer open={alertsOpen} onOpenChange={setAlertsOpen} title="Passport alerts" description="Passports expiring within six months. Travellers on upcoming trips are listed with the trip's six-month rule applied." width="xl">
        {alerts.isPending ? <p className="text-sm text-slate-500">Checking…</p> : !alerts.data?.length ? <EmptyState title="No passport problems" compact /> : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md bg-white">
            {alerts.data.map(a => (
              <li key={a.id} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/travellers/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                  <PassportPill expiry={a.passportExpiry} status={a.status} />
                </div>
                <div className="text-xs text-slate-500">{a.customer ? <Link to={`/customers/${a.customer.id}`} className="hover:underline">{a.customer.name}</Link> : 'No customer'}{a.passportNumber ? ` · ${a.passportNumber}` : ''}</div>
                {a.upcomingTrips.map(t => (
                  <div key={t.id} className="text-xs mt-1 flex items-center gap-2"><Link to={`/trips/${t.id}`} className="hover:underline">{t.id} · {t.destination} · {fmtDate(t.departure)}</Link><PassportPill expiry={a.passportExpiry} status={t.status} showDate={false} /></div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
}
