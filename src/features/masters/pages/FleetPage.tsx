import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { PageHeader, DataTable, Toolbar, SearchInput, StatusPill, Drawer, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { formatPhone } from '@/shared/calc/phone';
import { fmtDate } from '@/shared/utils/date';
import type { DriverInput, VehicleInput } from '@/shared/contracts/masters';
import { ApiError } from '@/lib/api';
import { mastersApi, type Driver, type Vehicle } from '../api';
import { useCompliance, useDrivers, useMasterMutation, useVehicles } from '../hooks';
import { VehicleForm, DriverForm } from '../components/FleetForms';
import { ComplianceBadge, ComplianceDetail } from '../components/ComplianceBadge';
import { ImportDrawer } from '../components/ImportDrawer';

type Tab = 'vehicles' | 'drivers' | 'compliance';

export default function FleetPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'vehicles';
  const q = useMemo(() => ({ q: params.get('q') || undefined, includeInactive: params.get('inactive') === '1', pageSize: 100 }), [params]);
  const setParam = (k: string, v: string | undefined) => { const n = new URLSearchParams(params); if (!v) n.delete(k); else n.set(k, v); setParams(n, { replace: true }); };
  const vehicles = useVehicles(q, tab === 'vehicles');
  const drivers = useDrivers(q, tab === 'drivers');
  const compliance = useCompliance();
  const [vehicle, setVehicle] = useState<Vehicle | 'new' | null>(null);
  const [driver, setDriver] = useState<Driver | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const saveVehicle = useMasterMutation(({ id, body }: { id?: string; body: VehicleInput }) => (id ? mastersApi.updateVehicle(id, body) : mastersApi.createVehicle(body)));
  const saveDriver = useMasterMutation(({ id, body }: { id?: string; body: DriverInput }) => (id ? mastersApi.updateDriver(id, body) : mastersApi.createDriver(body)));
  const canWrite = can('masters:write');
  const issues = (compliance.data?.vehicles.length ?? 0) + (compliance.data?.drivers.length ?? 0);

  const vehicleCols: Column<Vehicle>[] = [
    { key: 'reg', header: 'Vehicle', render: v => <div><div className="font-medium text-slate-900 font-mono">{v.registrationNo}{!v.isActive && <StatusPill className="ml-2">inactive</StatusPill>}</div><div className="text-xs text-slate-500">{v.type} · {v.seats} seats{v.make ? ` · ${v.make} ${v.model ?? ''}` : ''}</div></div> },
    { key: 'owner', header: 'Owner', render: v => v.ownership === 'OWNED' ? 'Own fleet' : v.vendor?.name ?? '—' },
    { key: 'driver', header: 'Usual driver', hideBelow: 'md', render: v => v.defaultDriver ? `${v.defaultDriver.name}` : <span className="text-slate-400">—</span> },
    { key: 'papers', header: 'Papers', render: v => <ComplianceBadge report={v.compliance} /> },
  ];
  const driverCols: Column<Driver>[] = [
    { key: 'name', header: 'Driver', render: d => <div><div className="font-medium text-slate-900">{d.name}{!d.isActive && <StatusPill className="ml-2">inactive</StatusPill>}</div><div className="text-xs text-slate-500">{d.languages.join(', ')}</div></div> },
    { key: 'phone', header: 'Mobile', render: d => <a href={`tel:${d.phone}`} onClick={e => e.stopPropagation()} className="hover:underline">{formatPhone(d.phone)}</a> },
    { key: 'vendor', header: 'Works for', hideBelow: 'md', render: d => d.vendor?.name ?? 'Own staff' },
    { key: 'licence', header: 'Licence', hideBelow: 'md', render: d => d.licenceExpiry ? `till ${fmtDate(d.licenceExpiry)}` : <span className="text-slate-400">—</span> },
    { key: 'papers', header: 'Papers', render: d => <ComplianceBadge report={d.compliance} /> },
    { key: 'app', header: 'App', hideBelow: 'lg', render: d => d.appAccess ? <StatusPill tone={d.appAccess.isActive ? 'success' : 'neutral'}>login</StatusPill> : <span className="text-slate-400">—</span> },
  ];

  const tabs: { id: Tab; label: string }[] = [{ id: 'vehicles', label: 'Vehicles' }, { id: 'drivers', label: 'Drivers' }, { id: 'compliance', label: `Papers${issues ? ` (${issues})` : ''}` }];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Fleet" subtitle="Vehicles, drivers and their papers"
        actions={canWrite && tab !== 'compliance' && <>
          <Button size="sm" variant="outline" onClick={() => setImporting(true)}><Upload className="w-4 h-4 mr-1.5" />Import</Button>
          <Button size="sm" onClick={() => (tab === 'vehicles' ? setVehicle('new') : setDriver('new'))}><Plus className="w-4 h-4 mr-1.5" />{tab === 'vehicles' ? 'Vehicle' : 'Driver'}</Button>
        </>} />
      <div className="px-5 pt-3 flex gap-1 border-b border-slate-200 bg-white" role="tablist">
        {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setParam('tab', t.id === 'vehicles' ? undefined : t.id)}
          className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t.id ? 'border-indigo-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>)}
      </div>
      {tab !== 'compliance' && (
        <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={q.includeInactive} onChange={e => setParam('inactive', e.target.checked ? '1' : undefined)} />Show inactive</label>}>
          <SearchInput value={q.q ?? ''} onChange={v => setParam('q', v)} placeholder={tab === 'vehicles' ? 'Registration, type, make…' : 'Name, mobile, licence…'} />
        </Toolbar>
      )}
      <div className="px-5 py-3 pb-6">
        {tab === 'vehicles' && <DataTable columns={vehicleCols} rows={vehicles.data?.items ?? []} rowKey={v => v.id} loading={vehicles.isPending} onRowClick={canWrite ? v => setVehicle(v) : undefined} emptyTitle="No vehicles yet" emptyHint="Add own and vendor vehicles with their insurance and permit dates." />}
        {tab === 'drivers' && <DataTable columns={driverCols} rows={drivers.data?.items ?? []} rowKey={d => d.id} loading={drivers.isPending} onRowClick={canWrite ? d => setDriver(d) : undefined} emptyTitle="No drivers yet" />}
        {tab === 'compliance' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white border border-slate-200 rounded-md p-4">
              <h2 className="text-sm font-medium text-slate-800 mb-3">Vehicles needing attention</h2>
              {!compliance.data?.vehicles.length ? <p className="text-sm text-slate-500">All vehicle papers are valid for the next {compliance.data?.warnDays ?? 30} days.</p> :
                <ul className="divide-y divide-slate-100">{compliance.data.vehicles.map(v => <li key={v.id} className="py-2 flex items-start justify-between gap-3"><div><div className="font-mono text-sm">{v.registrationNo}</div><div className="text-xs text-slate-500">{v.type} · {v.vendor?.name ?? 'Own fleet'}</div></div><div className="text-right space-y-1"><ComplianceBadge report={v.compliance} /><ComplianceDetail report={v.compliance} /></div></li>)}</ul>}
            </section>
            <section className="bg-white border border-slate-200 rounded-md p-4">
              <h2 className="text-sm font-medium text-slate-800 mb-3">Drivers needing attention</h2>
              {!compliance.data?.drivers.length ? <p className="text-sm text-slate-500">All driving licences are valid for the next {compliance.data?.warnDays ?? 30} days.</p> :
                <ul className="divide-y divide-slate-100">{compliance.data.drivers.map(d => <li key={d.id} className="py-2 flex items-start justify-between gap-3"><div><div className="text-sm">{d.name}</div><div className="text-xs text-slate-500">{formatPhone(d.phone)}</div></div><div className="text-right space-y-1"><ComplianceBadge report={d.compliance} /><ComplianceDetail report={d.compliance} /></div></li>)}</ul>}
            </section>
          </div>
        )}
      </div>
      <Drawer open={!!vehicle} onOpenChange={o => { if (!o) { setVehicle(null); saveVehicle.reset(); } }} title={vehicle === 'new' ? 'New vehicle' : vehicle ? vehicle.registrationNo : ''}>
        {vehicle && <VehicleForm initial={vehicle === 'new' ? undefined : vehicle} submitting={saveVehicle.isPending} error={saveVehicle.error as ApiError | null} onCancel={() => setVehicle(null)}
          onSubmit={body => saveVehicle.mutate({ id: vehicle === 'new' ? undefined : vehicle.id, body }, { onSuccess: v => { toast.success('Vehicle saved', v.registrationNo); setVehicle(null); } })} />}
      </Drawer>
      <Drawer open={!!driver} onOpenChange={o => { if (!o) { setDriver(null); saveDriver.reset(); } }} title={driver === 'new' ? 'New driver' : driver ? driver.name : ''}>
        {driver && <DriverForm initial={driver === 'new' ? undefined : driver} submitting={saveDriver.isPending} error={saveDriver.error as ApiError | null} onCancel={() => setDriver(null)}
          onSubmit={body => saveDriver.mutate({ id: driver === 'new' ? undefined : driver.id, body }, { onSuccess: d => { toast.success('Driver saved', d.name); setDriver(null); } })} />}
      </Drawer>
      <ImportDrawer kind={tab === 'drivers' ? 'drivers' : 'vehicles'} open={importing} onOpenChange={setImporting} />
    </div>
  );
}
