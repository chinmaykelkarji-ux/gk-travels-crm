import { useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { Field, Select, TextInput } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { itinerariesApi } from '../api';
import { useItineraryList, useItineraryMutation } from '../hooks';

/** No itinerary yet: start one from the trip's bookings, optionally copying a previous run of the same tour. */
export function StartItinerary({ tripId, canWrite }: { tripId: string; canWrite: boolean }) {
  const [fromBookings, setFromBookings] = useState(true);
  const [search, setSearch] = useState('');
  const [copyFromId, setCopyFromId] = useState('');
  const list = useItineraryList(search, canWrite);
  const create = useItineraryMutation(tripId, () => itinerariesApi.create({ tripId, fromBookings, copyFromId: copyFromId || null }));
  const others = (list.data ?? []).filter(r => r.tripId !== tripId);

  return (
    <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-3">
        <MapIcon className="w-5 h-5 text-slate-400" />
        <h2 className="text-sm font-medium text-slate-800">No itinerary for this trip yet</h2>
      </div>
      {!canWrite ? <p className="text-sm text-slate-500">Someone with operations access can start it.</p> : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Days follow the trip dates. Hotels, vehicle duties, activities and ticket legs can be brought in as day items; everything else you write day by day.</p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={fromBookings} onChange={e => setFromBookings(e.target.checked)} />
            Bring in the trip's bookings
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Copy days from (optional)" hint="A previous run of the same tour: titles, notes and your own items are copied, bookings are not">
              <TextInput placeholder="Search by title, place or ITN id" value={search} onChange={e => setSearch(e.target.value)} />
            </Field>
            <Field label={' '}>
              <Select aria-label="Itinerary to copy" value={copyFromId} onChange={e => setCopyFromId(e.target.value)}>
                <option value="">Start blank</option>
                {others.map(r => <option key={r.id} value={r.id}>{r.id} · {r.title} ({r.days} days)</option>)}
              </Select>
            </Field>
          </div>
          <Button loading={create.isPending} onClick={() => create.mutate(undefined, {
            onSuccess: () => toast.success('Itinerary started'),
            onError: e => toast.error('Could not start the itinerary', (e as ApiError).message),
          })}>Start itinerary</Button>
        </div>
      )}
    </div>
  );
}
