import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Drawer, Field, Money, Select, TextInput, Textarea, EmptyState } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import { MealPlan } from '@/shared/contracts/masters';
import { HotelBookingInput } from '@/shared/contracts/operations';
import { ApiError } from '@/lib/api';
import { useHotels, useHotel } from '@/features/masters/hooks';
import { VendorSelect } from '@/features/masters/components/VendorSelect';
import { tripsApi, type HotelBookingRow, type TripWorkspace } from '../api';
import { useTripMutation } from '../hooks';
import { OpsPill, StatusActions } from './StatusActions';

type Draft = Record<string, string>;

function HotelForm({ ws, initial, onDone }: { ws: TripWorkspace; initial?: HotelBookingRow; onDone: () => void }) {
  const { can } = usePermissions();
  const commercial = can('trips:write') || can('finance:read');
  const [d, setD] = useState<Draft>({
    hotelId: initial?.hotelId ?? '', hotelName: initial?.hotelName ?? '', city: initial?.city ?? '', roomTypeId: initial?.roomTypeId ?? '', roomTypeName: initial?.roomTypeName ?? '', mealPlan: initial?.mealPlan ?? 'CP',
    checkIn: initial?.checkIn ?? ws.trip.departure ?? '', checkOut: initial?.checkOut ?? '', rooms: String(initial?.rooms ?? 1), adults: String(initial?.adults ?? 2), children: String(initial?.children ?? 0),
    vendorId: initial?.vendorId ?? '', contractId: initial?.contractId ?? '', costAmount: initial?.costAmount != null ? String(initial.costAmount) : '', sellAmount: initial?.sellAmount != null ? String(initial.sellAmount) : '',
    customerNotes: initial?.customerNotes ?? '', internalNotes: initial?.internalNotes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hq, setHq] = useState('');
  const hotels = useHotels({ q: hq || undefined, pageSize: 30 });
  const hotel = useHotel(d.hotelId || undefined);
  const save = useTripMutation((b: HotelBookingInput) => (initial ? tripsApi.updateHotel(initial.id, b) : tripsApi.addHotel(ws.trip.id, b)));
  const set = (k: string, v: string) => setD(x => ({ ...x, [k]: v }));
  const roomTypes = useMemo(() => hotel.data?.roomTypes ?? [], [hotel.data]);

  function submit() {
    const body = { ...d, hotelId: d.hotelId || null, roomTypeId: d.roomTypeId || null, vendorId: d.vendorId || null, contractId: d.contractId || null, mealPlan: d.mealPlan || null, travellerIds: initial?.travellerIds ?? [],
      ...(commercial ? { costAmount: d.costAmount || 0, sellAmount: d.sellAmount || 0 } : { costAmount: 0, sellAmount: 0 }) };
    const parsed = HotelBookingInput.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message]))); return; }
    save.mutate(parsed.data, {
      onSuccess: r => { const gaps = (r as HotelBookingRow).rateGaps; toast.success(initial ? 'Hotel booking saved' : 'Hotel requested', gaps?.length ? `No rate on file for ${gaps.join(', ')} — price those nights by hand` : undefined); onDone(); },
      onError: e => { const er = e as ApiError; setErrors(er.fields ?? {}); toast.error('Not saved', er.message); },
    });
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hotel from masters" htmlFor="hb-h" className="col-span-2" hint="Or type a name below for a hotel not in the masters">
          <div className="flex gap-2"><TextInput aria-label="Search hotels" placeholder="Search…" value={hq} onChange={e => setHq(e.target.value)} className="w-40" />
            <Select id="hb-h" value={d.hotelId} onChange={e => { const h = hotels.data?.items.find(x => x.id === e.target.value); setD(x => ({ ...x, hotelId: e.target.value, roomTypeId: '', hotelName: h?.name ?? x.hotelName, city: h?.city ?? x.city })); }}>
              <option value="">— not in masters —</option>{(hotels.data?.items ?? []).map(h => <option key={h.id} value={h.id}>{h.name}, {h.city}</option>)}
            </Select></div>
        </Field>
        <Field label="Hotel name" htmlFor="hb-n" error={errors.hotelName}><TextInput id="hb-n" value={d.hotelName} onChange={e => set('hotelName', e.target.value)} /></Field>
        <Field label="City" htmlFor="hb-c"><TextInput id="hb-c" value={d.city} onChange={e => set('city', e.target.value)} /></Field>
        <Field label="Room type" htmlFor="hb-rt">{roomTypes.length ? <Select id="hb-rt" value={d.roomTypeId} onChange={e => set('roomTypeId', e.target.value)}><option value="">—</option>{roomTypes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Select> : <TextInput id="hb-rt" value={d.roomTypeName ?? ''} onChange={e => set('roomTypeName', e.target.value)} placeholder="Deluxe double" />}</Field>
        <Field label="Meal plan" htmlFor="hb-mp"><Select id="hb-mp" value={d.mealPlan} onChange={e => set('mealPlan', e.target.value)}>{MealPlan.options.map(m => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Check-in" htmlFor="hb-ci" error={errors.checkIn}><TextInput id="hb-ci" type="date" value={d.checkIn} onChange={e => set('checkIn', e.target.value)} /></Field>
        <Field label="Check-out" htmlFor="hb-co" error={errors.checkOut}><TextInput id="hb-co" type="date" value={d.checkOut} onChange={e => set('checkOut', e.target.value)} /></Field>
        <Field label="Rooms" htmlFor="hb-r" error={errors.rooms}><TextInput id="hb-r" inputMode="numeric" value={d.rooms} onChange={e => set('rooms', e.target.value)} /></Field>
        <Field label="Adults / children" htmlFor="hb-a"><div className="flex gap-2"><TextInput id="hb-a" inputMode="numeric" value={d.adults} onChange={e => set('adults', e.target.value)} /><TextInput aria-label="Children" inputMode="numeric" value={d.children} onChange={e => set('children', e.target.value)} /></div></Field>
        <Field label="Booked through" htmlFor="hb-v"><VendorSelect id="hb-v" kinds={['HOTEL', 'DMC']} value={d.vendorId || null} onChange={v => set('vendorId', v ?? '')} placeholder="Hotel direct" /></Field>
        {ws.parties.length > 1 && <Field label="For party" htmlFor="hb-p"><Select id="hb-p" value={d.contractId} onChange={e => set('contractId', e.target.value)}><option value="">Whole group</option>{ws.parties.map(p => <option key={p.id} value={p.id}>{p.partyName ?? p.contractNumber}</option>)}</Select></Field>}
        {commercial && <>
          <Field label="Cost ₹ (blank = from rate sheet)" htmlFor="hb-cost"><TextInput id="hb-cost" inputMode="decimal" value={d.costAmount} onChange={e => set('costAmount', e.target.value)} /></Field>
          <Field label="Sell ₹" htmlFor="hb-sell"><TextInput id="hb-sell" inputMode="decimal" value={d.sellAmount} onChange={e => set('sellAmount', e.target.value)} /></Field>
        </>}
        <Field label="Note for the customer" htmlFor="hb-cn" className="col-span-2"><TextInput id="hb-cn" value={d.customerNotes} onChange={e => set('customerNotes', e.target.value)} placeholder="Early check-in requested" /></Field>
        <Field label="Internal note" htmlFor="hb-in" className="col-span-2" hint="Never shown to the customer"><Textarea id="hb-in" rows={2} value={d.internalNotes} onChange={e => set('internalNotes', e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={submit} loading={save.isPending}>{initial ? 'Save' : 'Request booking'}</Button></div>
    </div>
  );
}

export function HotelsTab({ ws, canWrite }: { ws: TripWorkspace; canWrite: boolean }) {
  const [editing, setEditing] = useState<HotelBookingRow | 'new' | null>(null);
  const status = useTripMutation(({ id, c }: { id: string; c: { status: string; confirmationNo?: string | null; reason?: string | null } }) => tripsApi.hotelStatus(id, c as Parameters<typeof tripsApi.hotelStatus>[1]));
  return (
    <div className="space-y-3">
      {canWrite && <div className="flex justify-end"><Button size="sm" onClick={() => setEditing('new')}><Plus className="w-4 h-4 mr-1.5" />Hotel</Button></div>}
      {ws.hotels.length === 0 ? <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="No hotels on this trip yet" /></div> : (
        <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{ws.hotels.map(h => (
          <div key={h.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
            <button type="button" className="text-left" disabled={!canWrite} onClick={() => setEditing(h)}>
              <div className="font-medium text-slate-900">{h.hotelName}{h.city ? `, ${h.city}` : ''} <OpsPill status={h.status} /></div>
              <div className="text-sm text-slate-600">{fmtDate(h.checkIn)} → {fmtDate(h.checkOut)} · {h.nights} night(s) · {h.rooms} room(s){h.roomTypeName ? ` ${h.roomTypeName}` : ''}{h.mealPlan ? ` · ${h.mealPlan}` : ''}</div>
              <div className="text-xs text-slate-500">{[h.vendor && `via ${h.vendor.name}`, h.confirmationNo && `conf. ${h.confirmationNo}`, h.internalNotes].filter(Boolean).join(' · ')}</div>
            </button>
            <div className="text-right space-y-1">
              {h.costAmount !== null && <div className="text-xs text-slate-500">cost <Money value={h.costAmount} /> · sell <Money value={h.sellAmount} /></div>}
              <StatusActions kind="ops" status={h.status} confirmationNo={h.confirmationNo} disabled={!canWrite} onChange={c => status.mutateAsync({ id: h.id, c })} />
            </div>
          </div>
        ))}</div>
      )}
      <Drawer open={!!editing} onOpenChange={o => !o && setEditing(null)} title={editing === 'new' ? 'Request a hotel' : 'Hotel booking'} width="xl">{editing && <HotelForm ws={ws} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}</Drawer>
    </div>
  );
}
