import { useEffect, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { Drawer, Field, Money, Select, TextInput, Textarea, EmptyState, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import { VehicleAssignmentInput, DRIVER_STATUS_LABEL } from '@/shared/contracts/operations';
import { ApiError } from '@/lib/api';
import { useDrivers, useVehicles } from '@/features/masters/hooks';
import { VendorSelect } from '@/features/masters/components/VendorSelect';
import { tripsApi, type TripWorkspace, type VehicleDutyRow } from '../api';
import { useTripMutation } from '../hooks';
import { OpsPill, StatusActions } from './StatusActions';

type Draft = Record<string, string>;

function DutyForm({ ws, initial, onDone }: { ws: TripWorkspace; initial?: VehicleDutyRow; onDone: () => void }) {
  const { can } = usePermissions();
  const commercial = can('trips:write') || can('finance:read');
  const firstPickup = ws.pickupPoints[0];
  const [d, setD] = useState<Draft>({
    vehicleId: initial?.vehicleId ?? '', driverId: initial?.driverId ?? '', vendorId: initial?.vendorId ?? '', vehicleType: initial?.vehicleType ?? '', seatsRequired: initial?.seatsRequired != null ? String(initial.seatsRequired) : '',
    vehicleRegNo: initial?.vehicleRegNo ?? '', driverName: initial?.driverName ?? '', driverPhone: initial?.driverPhone ?? '',
    startAt: initial?.startLocal ?? firstPickup?.pickupLocal ?? (ws.trip.departure ? `${ws.trip.departure}T06:00` : ''), endAt: initial?.endLocal ?? (ws.trip.returnDate ? `${ws.trip.returnDate}T20:00` : ''),
    pickupPoint: initial?.pickupPoint ?? (firstPickup ? `${firstPickup.name}${firstPickup.address ? `, ${firstPickup.address}` : ''}` : ''), dropPoint: initial?.dropPoint ?? '', route: initial?.route ?? '',
    pax: String(initial?.pax ?? ws.travellers.length ?? 0), confirmationNo: initial?.confirmationNo ?? '', contractId: initial?.contractId ?? '',
    costAmount: initial?.costAmount != null ? String(initial.costAmount) : '', sellAmount: initial?.sellAmount != null ? String(initial.sellAmount) : '', customerNotes: initial?.customerNotes ?? '', internalNotes: initial?.internalNotes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clash, setClash] = useState<string[]>([]);
  const vehicles = useVehicles({ pageSize: 200 });
  const drivers = useDrivers({ pageSize: 200 });
  const save = useTripMutation((b: VehicleAssignmentInput) => (initial ? tripsApi.updateDuty(initial.id, b) : tripsApi.addDuty(ws.trip.id, b)));
  const set = (k: string, v: string) => setD(x => ({ ...x, [k]: v }));

  // Live double-booking check as the vehicle, driver or times change.
  useEffect(() => {
    if ((!d.vehicleId && !d.driverId) || !d.startAt || !d.endAt || d.endAt <= d.startAt) { setClash([]); return; }
    const t = setTimeout(() => {
      tripsApi.conflicts({ vehicleId: d.vehicleId || undefined, driverId: d.driverId || undefined, startAt: d.startAt, endAt: d.endAt, excludeId: initial?.id })
        .then(r => setClash(r.map(c => `${c.resource === 'vehicle' ? 'Vehicle' : 'Driver'} busy with ${c.trip} (${c.startLocal?.replace('T', ' ')} → ${c.endLocal?.replace('T', ' ')})`)))
        .catch(() => setClash([]));
    }, 300);
    return () => clearTimeout(t);
  }, [d.vehicleId, d.driverId, d.startAt, d.endAt, initial?.id]);

  function submit() {
    const body = { ...d, vehicleId: d.vehicleId || null, driverId: d.driverId || null, vendorId: d.vendorId || null, contractId: d.contractId || null, seatsRequired: d.seatsRequired || null,
      ...(commercial ? { costAmount: d.costAmount || 0, sellAmount: d.sellAmount || 0 } : { costAmount: 0, sellAmount: 0 }) };
    const parsed = VehicleAssignmentInput.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message]))); return; }
    save.mutate(parsed.data, {
      onSuccess: r => { const w = (r as VehicleDutyRow).warnings ?? []; toast.success(initial ? 'Duty saved' : 'Vehicle duty added', w.join(' · ') || undefined); onDone(); },
      onError: e => { const er = e as ApiError; setErrors(er.fields ?? {}); toast.error('Not saved', er.message); },
    });
  }
  const selectedVehicle = vehicles.data?.items.find(v => v.id === d.vehicleId);
  return (
    <div className="space-y-4">
      {clash.length > 0 && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{clash.map(c => <div key={c}>{c}</div>)}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vehicle (masters)" htmlFor="vd-v" error={errors.vehicleId}><Select id="vd-v" value={d.vehicleId} onChange={e => { const v = vehicles.data?.items.find(x => x.id === e.target.value); setD(x => ({ ...x, vehicleId: e.target.value, vehicleType: v?.type ?? x.vehicleType, driverId: x.driverId || v?.defaultDriverId || '' })); }}>
          <option value="">— not chosen yet —</option>{(vehicles.data?.items ?? []).map(v => <option key={v.id} value={v.id}>{v.registrationNo} · {v.type} · {v.seats} seats{v.compliance.state === 'EXPIRED' ? ' · papers expired' : ''}</option>)}
        </Select></Field>
        <Field label="Driver (masters)" htmlFor="vd-d" error={errors.driverId}><Select id="vd-d" value={d.driverId} onChange={e => set('driverId', e.target.value)}><option value="">—</option>{(drivers.data?.items ?? []).map(x => <option key={x.id} value={x.id}>{x.name} · {x.phone}</option>)}</Select></Field>
        {!d.vehicleId && <>
          <Field label="Vehicle type needed" htmlFor="vd-t" error={errors.vehicleType}><TextInput id="vd-t" value={d.vehicleType} onChange={e => set('vehicleType', e.target.value)} placeholder="Bus 45 / Tempo Traveller 17" /></Field>
          <Field label="Vehicle no. (from cab owner)" htmlFor="vd-r"><TextInput id="vd-r" className="uppercase" value={d.vehicleRegNo} onChange={e => set('vehicleRegNo', e.target.value)} /></Field>
        </>}
        {!d.driverId && <>
          <Field label="Driver name (from cab owner)" htmlFor="vd-dn"><TextInput id="vd-dn" value={d.driverName} onChange={e => set('driverName', e.target.value)} /></Field>
          <Field label="Driver phone" htmlFor="vd-dp"><TextInput id="vd-dp" inputMode="tel" value={d.driverPhone} onChange={e => set('driverPhone', e.target.value)} /></Field>
        </>}
        <Field label="Starts (IST)" htmlFor="vd-s" error={errors.startAt}><TextInput id="vd-s" type="datetime-local" value={d.startAt} onChange={e => set('startAt', e.target.value)} /></Field>
        <Field label="Ends (IST)" htmlFor="vd-e" error={errors.endAt}><TextInput id="vd-e" type="datetime-local" value={d.endAt} onChange={e => set('endAt', e.target.value)} /></Field>
        <Field label="Pickup" htmlFor="vd-pu" className="col-span-2"><TextInput id="vd-pu" value={d.pickupPoint} onChange={e => set('pickupPoint', e.target.value)} /></Field>
        <Field label="Drop" htmlFor="vd-dr" className="col-span-2"><TextInput id="vd-dr" value={d.dropPoint} onChange={e => set('dropPoint', e.target.value)} /></Field>
        <Field label="Passengers" htmlFor="vd-px" hint={selectedVehicle ? `${selectedVehicle.seats} seats` : undefined}><TextInput id="vd-px" inputMode="numeric" value={d.pax} onChange={e => set('pax', e.target.value)} /></Field>
        <Field label="Cab owner / vendor" htmlFor="vd-vn"><VendorSelect id="vd-vn" kinds={['TRANSPORT']} value={d.vendorId || null} onChange={v => set('vendorId', v ?? '')} placeholder="Own fleet" /></Field>
        {commercial && <>
          <Field label="Cost ₹" htmlFor="vd-c"><TextInput id="vd-c" inputMode="decimal" value={d.costAmount} onChange={e => set('costAmount', e.target.value)} /></Field>
          <Field label="Sell ₹" htmlFor="vd-sl"><TextInput id="vd-sl" inputMode="decimal" value={d.sellAmount} onChange={e => set('sellAmount', e.target.value)} /></Field>
        </>}
        <Field label="Route / day plan" htmlFor="vd-rt" className="col-span-2"><Textarea id="vd-rt" rows={2} value={d.route} onChange={e => set('route', e.target.value)} /></Field>
        <Field label="Internal note" htmlFor="vd-in" className="col-span-2" hint="Never shown to the customer or the driver"><Textarea id="vd-in" rows={2} value={d.internalNotes} onChange={e => set('internalNotes', e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={submit} loading={save.isPending} disabled={clash.length > 0}>{initial ? 'Save' : 'Add duty'}</Button></div>
    </div>
  );
}

export function TransportTab({ ws, canWrite }: { ws: TripWorkspace; canWrite: boolean }) {
  const [editing, setEditing] = useState<VehicleDutyRow | 'new' | null>(null);
  const status = useTripMutation(({ id, c }: { id: string; c: { status: string; confirmationNo?: string | null; reason?: string | null } }) => tripsApi.dutyStatus(id, c as Parameters<typeof tripsApi.dutyStatus>[1]));
  return (
    <div className="space-y-3">
      {canWrite && <div className="flex justify-end"><Button size="sm" onClick={() => setEditing('new')}><Plus className="w-4 h-4 mr-1.5" />Vehicle duty</Button></div>}
      {ws.vehicles.length === 0 ? <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="No vehicles on this trip yet" /></div> : (
        <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{ws.vehicles.map(v => (
          <div key={v.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
            <button type="button" className="text-left" disabled={!canWrite} onClick={() => setEditing(v)}>
              <div className="font-medium text-slate-900">{v.vehicleLabel ?? 'Vehicle to be arranged'} <OpsPill status={v.status} /></div>
              <div className="text-sm text-slate-600">{fmtDate(v.day)} {v.pickupTime} → {v.endLocal.replace('T', ' ')}{v.pickupPoint ? ` · from ${v.pickupPoint}` : ''} · {v.pax} pax</div>
              <div className="text-xs text-slate-500">{v.driverLabel ? `Driver ${v.driverLabel}` : <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" />no driver yet</span>}{v.vendor ? ` · ${v.vendor.name}` : ''}</div>
              {v.status === 'CONFIRMED' && <StatusPill tone={v.driverStatus === 'ISSUE' ? 'danger' : 'neutral'} className="mt-1">{DRIVER_STATUS_LABEL[v.driverStatus]}{v.driverNote ? `: ${v.driverNote}` : ''}</StatusPill>}
            </button>
            <div className="text-right space-y-1">
              {v.costAmount !== null && <div className="text-xs text-slate-500">cost <Money value={v.costAmount} /> · sell <Money value={v.sellAmount} /></div>}
              <StatusActions kind="duty" status={v.status} disabled={!canWrite} onChange={c => status.mutateAsync({ id: v.id, c })} />
            </div>
          </div>
        ))}</div>
      )}
      <Drawer open={!!editing} onOpenChange={o => !o && setEditing(null)} title={editing === 'new' ? 'Vehicle duty' : 'Edit vehicle duty'} width="xl">{editing && <DutyForm ws={ws} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}</Drawer>
    </div>
  );
}
