import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus, Trash2, UserPlus } from 'lucide-react';
import { Drawer, Field, SearchInput, Select, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { PickupPointInput } from '@/shared/contracts/trips';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { travellersApi } from '@/features/travellers/api';
import { PassportPill } from '@/features/travellers/components/PassportPill';
import { tripsApi, type TripWorkspace } from '../api';
import { useTripMutation } from '../hooks';

type PointDraft = { id?: string; name: string; address: string; landmark: string; pickupAt: string; contactName: string; contactPhone: string };

function PickupEditor({ ws, onDone }: { ws: TripWorkspace; onDone: () => void }) {
  const [points, setPoints] = useState<PointDraft[]>(ws.pickupPoints.map(p => ({ id: p.id, name: p.name, address: p.address ?? '', landmark: p.landmark ?? '', pickupAt: p.pickupLocal ?? '', contactName: p.contactName ?? '', contactPhone: p.contactPhone ?? '' })));
  const save = useTripMutation((b: { points: PointDraft[] }) => tripsApi.pickupPoints(ws.trip.id, { points: b.points.map(p => PickupPointInput.parse(p)) }));
  const move = (i: number, d: -1 | 1) => { const n = [...points]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setPoints(n); };
  function submit() {
    const bad = points.find(p => !PickupPointInput.safeParse(p).success);
    if (bad) { toast.error('Check the pickup points', `${bad.name || 'A point'} needs a name (and a valid time)`); return; }
    save.mutate({ points }, { onSuccess: () => { toast.success('Pickup points saved'); onDone(); }, onError: e => toast.error('Not saved', (e as ApiError).summary) });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">In route order. Removing a point un-assigns its passengers.</p>
      {points.map((p, i) => (
        <div key={p.id ?? `new-${i}`} className="border border-slate-200 rounded-md p-3 grid grid-cols-2 gap-2">
          <Field label={`${i + 1}. Place`} htmlFor={`pp-n${i}`}><TextInput id={`pp-n${i}`} value={p.name} onChange={e => setPoints(points.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="Karad" /></Field>
          <Field label="Pickup time (IST)" htmlFor={`pp-t${i}`}><TextInput id={`pp-t${i}`} type="datetime-local" value={p.pickupAt} onChange={e => setPoints(points.map((x, k) => (k === i ? { ...x, pickupAt: e.target.value } : x)))} /></Field>
          <Field label="Exact spot" htmlFor={`pp-a${i}`} className="col-span-2"><TextInput id={`pp-a${i}`} value={p.address} onChange={e => setPoints(points.map((x, k) => (k === i ? { ...x, address: e.target.value } : x)))} placeholder="Bus stand gate 2" /></Field>
          <Field label="Local contact" htmlFor={`pp-c${i}`}><TextInput id={`pp-c${i}`} value={p.contactName} onChange={e => setPoints(points.map((x, k) => (k === i ? { ...x, contactName: e.target.value } : x)))} /></Field>
          <Field label="Contact phone" htmlFor={`pp-p${i}`}><TextInput id={`pp-p${i}`} inputMode="tel" value={p.contactPhone} onChange={e => setPoints(points.map((x, k) => (k === i ? { ...x, contactPhone: e.target.value } : x)))} /></Field>
          <div className="col-span-2 flex justify-end gap-2 text-xs">
            {i > 0 && <button type="button" className="text-slate-600" onClick={() => move(i, -1)}>Move up</button>}
            {i < points.length - 1 && <button type="button" className="text-slate-600" onClick={() => move(i, 1)}>Move down</button>}
            <button type="button" className="text-red-600 inline-flex items-center gap-1" onClick={() => setPoints(points.filter((_, k) => k !== i))}><Trash2 className="w-3.5 h-3.5" />Remove</button>
          </div>
        </div>
      ))}
      <button type="button" className="inline-flex items-center gap-1 text-sm text-indigo-600" onClick={() => setPoints([...points, { name: '', address: '', landmark: '', pickupAt: '', contactName: '', contactPhone: '' }])}><Plus className="w-4 h-4" />Add pickup point</button>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={submit} loading={save.isPending}>Save pickup points</Button></div>
    </div>
  );
}

function AddTravellers({ ws, onDone }: { ws: TripWorkspace; onDone: () => void }) {
  const [q, setQ] = useState('');
  const results = useQuery({ queryKey: ['travellers', 'pick', q], queryFn: () => travellersApi.list({ q: q || undefined, pageSize: 20 }), enabled: q.length >= 2 });
  const onTrip = new Set(ws.travellers.map(t => t.travellerId));
  const save = useTripMutation((ids: string[]) => travellersApi.setTripTravellers(ws.trip.id, { travellers: [...ws.travellers.map(t => ({ travellerId: t.travellerId, role: t.role as 'ADULT' })), ...ids.map(travellerId => ({ travellerId, role: 'ADULT' as const }))], syncPax: true }));
  return (
    <div className="space-y-3">
      <SearchInput value={q} onChange={setQ} placeholder="Search travellers by name, passport or customer" autoFocus />
      <ul className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {q.length < 2 && <li className="px-3 py-2 text-sm text-slate-500">Type at least two letters. New people are added on the <Link className="text-indigo-600" to="/travellers">Travellers</Link> page.</li>}
        {(results.data?.items ?? []).map(t => (
          <li key={t.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
            <span>{t.displayName ?? `${t.firstName} ${t.lastName}`} <span className="text-xs text-slate-500">{t.id}{t.customerName ? ` · ${t.customerName}` : ''}</span></span>
            {onTrip.has(t.id) ? <span className="text-xs text-slate-400">on trip</span> : <Button size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate([t.id], { onSuccess: () => toast.success('Added to the trip'), onError: e => toast.error('Not added', (e as ApiError).message) })}>Add</Button>}
          </li>
        ))}
      </ul>
      <div className="flex justify-end"><Button variant="outline" onClick={onDone}>Done</Button></div>
    </div>
  );
}

/** Who travels, in which party, boarding where. */
export function TravellersTab({ ws, canWrite }: { ws: TripWorkspace; canWrite: boolean }) {
  const [pickupOpen, setPickupOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const assign = useTripMutation((b: { travellerId: string; contractId?: string | null; pickupPointId?: string | null }) => tripsApi.assign(ws.trip.id, { rows: [b] }));
  const set = (b: { travellerId: string; contractId?: string | null; pickupPointId?: string | null }) => assign.mutate(b, { onError: e => toast.error('Not saved', (e as ApiError).message) });
  const parties = ws.parties.filter(p => p.status !== 'CANCELLED');
  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-md p-4">
        <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-medium text-slate-800">Pickup points</h2>{canWrite && <Button size="sm" variant="outline" onClick={() => setPickupOpen(true)}><MapPin className="w-4 h-4 mr-1.5" />Edit</Button>}</div>
        {ws.pickupPoints.length === 0 ? <p className="text-sm text-slate-500">No pickup points. Add them for group tours that collect passengers on the way.</p> :
          <ol className="flex flex-wrap gap-2 text-sm">{ws.pickupPoints.map(p => <li key={p.id} className="border border-slate-200 rounded px-2 py-1"><span className="font-medium">{p.seq}. {p.name}</span>{p.pickupLocal && <span className="text-slate-500"> · {p.pickupLocal.slice(11)}</span>}<span className="text-xs text-slate-500"> · {p.travellers} pax</span></li>)}</ol>}
      </section>
      <section className="bg-white border border-slate-200 rounded-md">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100"><h2 className="text-sm font-medium text-slate-800">{ws.travellers.length} traveller(s)</h2>{canWrite && <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><UserPlus className="w-4 h-4 mr-1.5" />Add travellers</Button>}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-slate-500"><tr><th className="text-left font-medium px-4 py-1.5">Name</th><th className="text-left font-medium">Party</th><th className="text-left font-medium">Boards at</th><th className="text-left font-medium hidden md:table-cell">Passport</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{ws.travellers.map(t => (
            <tr key={t.linkId}>
              <td className="px-4 py-1.5"><Link to={`/travellers/${t.travellerId}`} className="hover:underline">{t.name}</Link> <span className="text-xs text-slate-400">{t.role.toLowerCase()}</span></td>
              <td>{canWrite && parties.length > 0 ? <Select aria-label="Party" className="h-8 w-auto" value={t.contractId ?? ''} onChange={e => set({ travellerId: t.travellerId, contractId: e.target.value || null })}><option value="">—</option>{parties.map(p => <option key={p.id} value={p.id}>{p.partyName ?? p.contractNumber}</option>)}</Select> : (t.partyName ?? '—')}</td>
              <td>{canWrite && ws.pickupPoints.length > 0 ? <Select aria-label="Pickup point" className="h-8 w-auto" value={t.pickupPointId ?? ''} onChange={e => set({ travellerId: t.travellerId, pickupPointId: e.target.value || null })}><option value="">—</option>{ws.pickupPoints.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select> : (ws.pickupPoints.find(p => p.id === t.pickupPointId)?.name ?? '—')}</td>
              <td className="hidden md:table-cell">{ws.trip.isInternational ? <PassportPill expiry={null} status={t.passportStatus} showDate={false} /> : <span className="text-xs text-slate-400">domestic</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      <Drawer open={pickupOpen} onOpenChange={setPickupOpen} title="Pickup points" width="lg">{pickupOpen && <PickupEditor ws={ws} onDone={() => setPickupOpen(false)} />}</Drawer>
      <Drawer open={addOpen} onOpenChange={setAddOpen} title="Add travellers to the trip" width="lg">{addOpen && <AddTravellers ws={ws} onDone={() => setAddOpen(false)} />}</Drawer>
    </div>
  );
}
