import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PageHeader, DataTable, Toolbar, SearchInput, Select, StatusPill, Drawer, Field, TextInput, Textarea, FormShell, useServerFieldErrors, type Column, type Tone } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import { STAGE_LABEL, TRIP_STAGES, type TripStage } from '@/shared/calc/tripStage';
import { TripCreate, type TripListQuery } from '@/shared/contracts/trips';
import { ApiError } from '@/lib/api';
import { tripsApi, type TripListItem } from '../api';
import { useTrips, useTripMutation } from '../hooks';

export const STAGE_TONE: Record<TripStage, Tone> = { PLANNING: 'neutral', CONFIRMING: 'info', READY: 'success', ONGOING: 'accent', COMPLETED: 'neutral', CANCELLED: 'danger' };
export function StagePill({ stage }: { stage: TripStage }) { return <StatusPill tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</StatusPill>; }

function NewTripForm({ onDone }: { onDone: (id: string) => void }) {
  const create = useTripMutation((b: TripCreate) => tripsApi.create(b));
  const { register, handleSubmit, setError, formState: { errors } } = useForm<TripCreate>({ resolver: zodResolver(TripCreate), defaultValues: { tourName: null, destination: '', departure: null, returnDate: null, isInternational: false, customerId: null, assignedOpsUserId: null } });
  useServerFieldErrors(create.error as ApiError | null, setError, ['destination', 'returnDate', 'customerId']);
  return (
    <FormShell onSubmit={handleSubmit(b => create.mutate(b, { onSuccess: w => { toast.success('Trip created', w.trip.id); onDone(w.trip.id); } }))} error={create.error as ApiError | null} submitting={create.isPending} onCancel={() => onDone('')} submitLabel="Create trip">
      <p className="text-sm text-slate-500">Trips are created automatically when a quotation is accepted. Use this for tours planned outside a quotation (for example a pilgrimage group).</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tour name" htmlFor="nt-name" className="col-span-2"><TextInput id="nt-name" placeholder="Kashi Yatra — October" {...register('tourName')} /></Field>
        <Field label="Destination" htmlFor="nt-dest" required error={errors.destination?.message} className="col-span-2"><TextInput id="nt-dest" invalid={!!errors.destination} {...register('destination')} /></Field>
        <Field label="Departure" htmlFor="nt-dep"><TextInput id="nt-dep" type="date" {...register('departure')} /></Field>
        <Field label="Return" htmlFor="nt-ret" error={errors.returnDate?.message}><TextInput id="nt-ret" type="date" {...register('returnDate')} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" {...register('isInternational')} />International (passports checked before the trip can be ready)</label>
        <Field label="Notes" htmlFor="nt-notes" className="col-span-2"><Textarea id="nt-notes" rows={2} {...register('notes')} /></Field>
      </div>
    </FormShell>
  );
}

export default function TripsPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const q: Partial<TripListQuery> = useMemo(() => ({ q: params.get('q') || undefined, stage: (params.get('stage') as TripStage) || undefined, includeClosed: params.get('closed') === '1', page: Number(params.get('page') || 1), pageSize: 25 }), [params]);
  const setParam = (k: string, v: string | number | undefined) => { const n = new URLSearchParams(params); if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  const list = useTrips(q);
  const [creating, setCreating] = useState(false);

  const cols: Column<TripListItem>[] = [
    { key: 'trip', header: 'Trip', render: t => <div><div className="font-medium text-slate-900">{t.tourName ?? t.destination}</div><div className="text-xs text-slate-500">{t.id}{t.tourName ? ` · ${t.destination}` : ''}</div></div> },
    { key: 'dates', header: 'Dates', render: t => t.departure ? `${fmtDate(t.departure)}${t.returnDate ? ` → ${fmtDate(t.returnDate)}` : ''}` : <span className="text-slate-400">not set</span> },
    { key: 'customer', header: 'Customer', hideBelow: 'md', render: t => t.customer },
    { key: 'pax', header: 'Pax', align: 'right', render: t => <span>{t.travellers || t.pax}{t.parties > 1 ? <span className="text-xs text-slate-500"> · {t.parties} parties</span> : null}</span> },
    { key: 'stage', header: 'Stage', render: t => <StagePill stage={t.stage} /> },
    { key: 'pending', header: 'To confirm', hideBelow: 'lg', render: t => { const p = t.pending; const parts = [p.hotels && `${p.hotels} hotel`, p.vehicles && `${p.vehicles} vehicle`, p.activities && `${p.activities} activity`, p.tickets && `${p.tickets} ticket`].filter(Boolean); return parts.length ? <span className="text-xs text-amber-700">{parts.join(' · ')}</span> : <span className="text-xs text-slate-400">—</span>; } },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Trips" subtitle={list.data ? `${list.data.total} trip${list.data.total === 1 ? '' : 's'}` : undefined}
        actions={<><Link to="/legacy/trips" className="text-xs text-slate-500 hover:text-slate-800">Classic trips</Link>{can('trips:write') && <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1.5" />Trip</Button>}</>} />
      <Toolbar right={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={!!q.includeClosed} onChange={e => setParam('closed', e.target.checked ? '1' : undefined)} />Show completed & cancelled</label>}>
        <SearchInput value={q.q ?? ''} onChange={v => setParam('q', v)} placeholder="Trip, tour name, destination, customer…" />
        <Select aria-label="Stage" className="w-auto" value={q.stage ?? ''} onChange={e => setParam('stage', e.target.value)}><option value="">Open stages</option>{TRIP_STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</Select>
      </Toolbar>
      <div className="px-5 pb-6">
        {list.isError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{(list.error as ApiError).message}</div>}
        <DataTable columns={cols} rows={list.data?.items ?? []} rowKey={t => t.id} loading={list.isPending} onRowClick={t => navigate(`/trips/${t.id}`)} emptyTitle="No trips" emptyHint="Accept a quotation or create a tour."
          pagination={list.data ? { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: p => setParam('page', p) } : undefined} />
      </div>
      <Drawer open={creating} onOpenChange={setCreating} title="New trip">{creating && <NewTripForm onDone={id => { setCreating(false); if (id) navigate(`/trips/${id}`); }} />}</Drawer>
    </div>
  );
}
