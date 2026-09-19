import { EmptyState } from '@/design-system';
import type { ApiError } from '@/lib/api';
import { useTripItinerary } from '../hooks';
import { ItineraryBuilder } from './ItineraryBuilder';
import { StartItinerary } from './StartItinerary';

/** Trip workspace tab: start the itinerary, or build it day by day. */
export function ItineraryTab({ tripId, canWrite }: { tripId: string; canWrite: boolean }) {
  const q = useTripItinerary(tripId);
  if (q.isPending) return <div className="text-sm text-slate-500">Loading…</div>;
  if (q.isError) return <div className="bg-white border border-slate-200 rounded-md"><EmptyState compact title="Could not load the itinerary" description={(q.error as ApiError).message} /></div>;
  const view = q.data.itinerary;
  if (!view) return <StartItinerary tripId={tripId} canWrite={canWrite} />;
  return <ItineraryBuilder key={view.id} view={view} tripId={tripId} canWrite={canWrite} onReload={() => void q.refetch()} />;
}
