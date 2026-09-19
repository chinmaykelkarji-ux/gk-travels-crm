import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { PageHeader, KeyValue, StatusPill, Drawer, EmptyState, Field, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDateTime } from '@/shared/utils/date';
import { MealPlan, MEAL_PLAN_LABEL, type HotelInput, type RoomTypeInput } from '@/shared/contracts/masters';
import { ApiError } from '@/lib/api';
import { mastersApi } from '../api';
import { useHotel, useMasterMutation } from '../hooks';
import { HotelForm } from '../components/HotelForm';
import { RatesEditor } from '../components/RatesEditor';

function RoomTypeAdder({ hotelId, onDone }: { hotelId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [maxAdults, setMaxAdults] = useState('2');
  const [plans, setPlans] = useState<string[]>(['CP']);
  const add = useMasterMutation((body: RoomTypeInput) => mastersApi.addRoomType(hotelId, body));
  return (
    <div className="border border-slate-200 rounded-md p-3 bg-white space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Room type" htmlFor="rt-name" className="col-span-2" error={(add.error as ApiError | null)?.message}><TextInput id="rt-name" placeholder="Deluxe Double" value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Max adults" htmlFor="rt-adults"><TextInput id="rt-adults" inputMode="numeric" value={maxAdults} onChange={e => setMaxAdults(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">{MealPlan.options.map(m => (
        <label key={m} className="flex items-center gap-1.5" title={MEAL_PLAN_LABEL[m]}><input type="checkbox" checked={plans.includes(m)} onChange={e => setPlans(p => (e.target.checked ? [...p, m] : p.filter(x => x !== m)))} />{m}</label>
      ))}</div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={!name.trim() || !plans.length} loading={add.isPending}
          onClick={() => add.mutate({ name: name.trim(), maxAdults: Number(maxAdults) || 2, maxChildren: 1, mealPlans: plans as RoomTypeInput['mealPlans'], notes: null, isActive: true }, { onSuccess: () => { toast.success('Room type added'); onDone(); } })}>Add room type</Button>
      </div>
    </div>
  );
}

export default function HotelDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useHotel(id);
  const [editOpen, setEditOpen] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);
  const update = useMasterMutation((body: Partial<HotelInput>) => mastersApi.updateHotel(id, body));

  if (q.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (q.isError) { const e = q.error as ApiError; return <div className="p-6"><EmptyState title={e.status === 404 ? 'Hotel not found' : 'Could not load hotel'} description={e.message} action={<Button variant="outline" size="sm" onClick={() => navigate('/hotels')}>Back</Button>} /></div>; }
  const h = q.data;
  const canWrite = can('masters:write');

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title={h.name} subtitle={`${h.city}${h.state ? `, ${h.state}` : ''}${h.category ? ` · ${h.category}` : ''}`} crumbs={[{ label: 'Hotels', to: '/hotels' }, { label: h.name }]}
        badge={!h.isActive ? <StatusPill>inactive</StatusPill> : undefined}
        actions={canWrite && <>
          <Button size="sm" variant="outline" onClick={() => update.mutate({ isActive: !h.isActive }, { onSuccess: () => toast.success(h.isActive ? 'Hotel deactivated' : 'Hotel reactivated') })}>{h.isActive ? 'Deactivate' : 'Reactivate'}</Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4 mr-1.5" />Edit</Button>
        </>} />
      <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-white border border-slate-200 rounded-md p-4 lg:col-span-1 space-y-4">
          <KeyValue columns={1} items={[
            { label: 'Booked through', value: h.vendor?.name ?? 'Direct' }, { label: 'Reservations', value: [h.phone, h.email].filter(Boolean).join(' · ') || null },
            { label: 'GSTIN', value: h.gstin }, { label: 'Check-in / out', value: h.checkInTime || h.checkOutTime ? `${h.checkInTime ?? '—'} / ${h.checkOutTime ?? '—'}` : null },
            { label: 'Amenities', value: h.amenities.length ? h.amenities.join(', ') : null }, { label: 'Address', value: h.address }, { label: 'Notes', value: h.notes },
          ]} />
          {h.activity && h.activity.length > 0 && (
            <div><h3 className="text-xs font-medium text-slate-600 mb-2">History</h3>
              <ul className="space-y-1.5">{h.activity.slice(0, 10).map(a => <li key={a.id} className="text-xs text-slate-600"><span className="text-slate-400">{fmtDateTime(a.timestamp)}</span> · {a.description}</li>)}</ul>
            </div>
          )}
        </section>
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-800">Room types &amp; seasons</h2>
            {canWrite && !addingRoom && <Button size="sm" variant="outline" onClick={() => setAddingRoom(true)}><Plus className="w-4 h-4 mr-1.5" />Room type</Button>}
          </div>
          {!h.canSeeRates && <p className="text-xs text-slate-500">Rates are visible to the booking and accounts teams.</p>}
          {addingRoom && <RoomTypeAdder hotelId={h.id} onDone={() => setAddingRoom(false)} />}
          {h.roomTypes.length === 0 && !addingRoom && <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="No room types yet" description="Add the room categories you book here, then their seasons." /></div>}
          {h.roomTypes.map(rt => (
            <div key={rt.id} className="bg-white border border-slate-200 rounded-md p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-slate-900">{rt.name}</h3>
                <span className="text-xs text-slate-500">up to {rt.maxAdults} adults · {rt.mealPlans.join(', ')}</span>
                {!rt.isActive && <StatusPill>inactive</StatusPill>}
              </div>
              {h.canSeeRates && <RatesEditor roomType={rt} canWrite={can('rates:write')} />}
            </div>
          ))}
        </section>
      </div>
      <Drawer open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) update.reset(); }} title={`Edit ${h.name}`}>
        <HotelForm initial={h} submitting={update.isPending} error={update.error as ApiError | null} onCancel={() => setEditOpen(false)}
          onSubmit={body => update.mutate(body, { onSuccess: () => { toast.success('Hotel saved'); setEditOpen(false); } })} />
      </Drawer>
    </div>
  );
}
