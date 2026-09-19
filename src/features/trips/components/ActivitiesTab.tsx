import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Drawer, Field, Money, Select, TextInput, Textarea, EmptyState } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import { ActivityBookingInput } from '@/shared/contracts/operations';
import { ApiError } from '@/lib/api';
import { useActivities } from '@/features/masters/hooks';
import { VendorSelect } from '@/features/masters/components/VendorSelect';
import { tripsApi, type ActivityBookingRow, type TripWorkspace } from '../api';
import { useTripMutation } from '../hooks';
import { OpsPill, StatusActions } from './StatusActions';

function ActivityForm({ ws, initial, onDone }: { ws: TripWorkspace; initial?: ActivityBookingRow; onDone: () => void }) {
  const { can } = usePermissions();
  const commercial = can('trips:write') || can('finance:read');
  const [d, setD] = useState<Record<string, string>>({
    activityId: initial?.activityId ?? '', name: initial?.name ?? '', city: initial?.city ?? '', date: initial?.date ?? ws.trip.departure ?? '', time: initial?.time ?? '',
    adults: String(initial?.adults ?? ws.travellers.length ?? 1), children: String(initial?.children ?? 0), vendorId: initial?.vendorId ?? '', contractId: initial?.contractId ?? '',
    costAmount: initial?.costAmount != null ? String(initial.costAmount) : '', sellAmount: initial?.sellAmount != null ? String(initial.sellAmount) : '', customerNotes: initial?.customerNotes ?? '', internalNotes: initial?.internalNotes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const masters = useActivities({ pageSize: 200 });
  const save = useTripMutation((b: ActivityBookingInput) => (initial ? tripsApi.updateActivity(initial.id, b) : tripsApi.addActivity(ws.trip.id, b)));
  const set = (k: string, v: string) => setD(x => ({ ...x, [k]: v }));
  function submit() {
    const body = { ...d, activityId: d.activityId || null, vendorId: d.vendorId || null, contractId: d.contractId || null, ...(commercial ? { costAmount: d.costAmount || 0, sellAmount: d.sellAmount || 0 } : { costAmount: 0, sellAmount: 0 }) };
    const parsed = ActivityBookingInput.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message]))); return; }
    save.mutate(parsed.data, { onSuccess: () => { toast.success(initial ? 'Activity saved' : 'Activity requested'); onDone(); }, onError: e => { const er = e as ApiError; setErrors(er.fields ?? {}); toast.error('Not saved', er.message); } });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From masters" htmlFor="ab-a" className="col-span-2"><Select id="ab-a" value={d.activityId} onChange={e => { const a = masters.data?.items.find(x => x.id === e.target.value); setD(x => ({ ...x, activityId: e.target.value, name: a?.name ?? x.name, city: a?.city ?? x.city })); }}>
          <option value="">— not in masters —</option>{(masters.data?.items ?? []).map(a => <option key={a.id} value={a.id}>{a.name}, {a.city}</option>)}
        </Select></Field>
        <Field label="Activity" htmlFor="ab-n" error={errors.name}><TextInput id="ab-n" value={d.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="City" htmlFor="ab-c"><TextInput id="ab-c" value={d.city} onChange={e => set('city', e.target.value)} /></Field>
        <Field label="Date" htmlFor="ab-d" error={errors.date}><TextInput id="ab-d" type="date" value={d.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Time" htmlFor="ab-t" error={errors.time}><TextInput id="ab-t" type="time" value={d.time} onChange={e => set('time', e.target.value)} /></Field>
        <Field label="Adults / children" htmlFor="ab-ad"><div className="flex gap-2"><TextInput id="ab-ad" inputMode="numeric" value={d.adults} onChange={e => set('adults', e.target.value)} /><TextInput aria-label="Children" inputMode="numeric" value={d.children} onChange={e => set('children', e.target.value)} /></div></Field>
        <Field label="Provider" htmlFor="ab-v"><VendorSelect id="ab-v" kinds={['ACTIVITY', 'DMC', 'GUIDE']} value={d.vendorId || null} onChange={v => set('vendorId', v ?? '')} /></Field>
        {commercial && <>
          <Field label="Cost ₹ (blank = from masters)" htmlFor="ab-cost"><TextInput id="ab-cost" inputMode="decimal" value={d.costAmount} onChange={e => set('costAmount', e.target.value)} /></Field>
          <Field label="Sell ₹" htmlFor="ab-sell"><TextInput id="ab-sell" inputMode="decimal" value={d.sellAmount} onChange={e => set('sellAmount', e.target.value)} /></Field>
        </>}
        <Field label="Note for the customer" htmlFor="ab-cn" className="col-span-2"><TextInput id="ab-cn" value={d.customerNotes} onChange={e => set('customerNotes', e.target.value)} /></Field>
        <Field label="Internal note" htmlFor="ab-in" className="col-span-2"><Textarea id="ab-in" rows={2} value={d.internalNotes} onChange={e => set('internalNotes', e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={submit} loading={save.isPending}>{initial ? 'Save' : 'Request'}</Button></div>
    </div>
  );
}

export function ActivitiesTab({ ws, canWrite }: { ws: TripWorkspace; canWrite: boolean }) {
  const [editing, setEditing] = useState<ActivityBookingRow | 'new' | null>(null);
  const status = useTripMutation(({ id, c }: { id: string; c: { status: string; confirmationNo?: string | null; reason?: string | null } }) => tripsApi.activityStatus(id, c as Parameters<typeof tripsApi.activityStatus>[1]));
  return (
    <div className="space-y-3">
      {canWrite && <div className="flex justify-end"><Button size="sm" onClick={() => setEditing('new')}><Plus className="w-4 h-4 mr-1.5" />Activity</Button></div>}
      {ws.activities.length === 0 ? <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="No activities on this trip yet" /></div> : (
        <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{ws.activities.map(a => (
          <div key={a.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
            <button type="button" className="text-left" disabled={!canWrite} onClick={() => setEditing(a)}>
              <div className="font-medium text-slate-900">{a.name}{a.city ? `, ${a.city}` : ''} <OpsPill status={a.status} /></div>
              <div className="text-sm text-slate-600">{fmtDate(a.date)}{a.time ? ` ${a.time}` : ''} · {a.adults + a.children} pax{a.confirmationNo ? ` · conf. ${a.confirmationNo}` : ''}{a.vendor ? ` · ${a.vendor.name}` : ''}</div>
            </button>
            <div className="text-right space-y-1">
              {a.costAmount !== null && <div className="text-xs text-slate-500">cost <Money value={a.costAmount} /> · sell <Money value={a.sellAmount} /></div>}
              <StatusActions kind="ops" status={a.status} confirmationNo={a.confirmationNo} disabled={!canWrite} onChange={c => status.mutateAsync({ id: a.id, c })} />
            </div>
          </div>
        ))}</div>
      )}
      <Drawer open={!!editing} onOpenChange={o => !o && setEditing(null)} title={editing === 'new' ? 'Request an activity' : 'Activity booking'} width="lg">{editing && <ActivityForm ws={ws} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}</Drawer>
    </div>
  );
}
