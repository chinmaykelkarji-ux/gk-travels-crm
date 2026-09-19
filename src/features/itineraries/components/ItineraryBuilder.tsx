import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Copy, Printer, RefreshCw, Send } from 'lucide-react';
import { Field, StatusPill, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { fmtDateTime } from '@/shared/utils/date';
import { ApiError } from '@/lib/api';
import { defaultDayTitle, isEmptyDay, itineraryAsText } from '@/shared/calc/itinerary';
import type { ItinerarySave } from '@/shared/contracts/itineraries';
import { itinerariesApi, type ItineraryDayView, type ItineraryView, type SyncResult } from '../api';
import { useItineraryMutation } from '../hooks';
import { DayEditor } from './DayEditor';

type Draft = Pick<ItineraryView, 'title' | 'notes' | 'internalNotes' | 'emergencyContact' | 'days'>;
const toDraft = (v: ItineraryView): Draft => ({ title: v.title, notes: v.notes, internalNotes: v.internalNotes, emergencyContact: v.emergencyContact, days: v.days });

function toPayload(revision: number, d: Draft): ItinerarySave {
  return {
    revision, title: d.title, notes: d.notes, internalNotes: d.internalNotes, emergencyContact: d.emergencyContact,
    days: d.days.map(x => ({
      id: x.id ?? null, title: x.title, morning: x.morning, afternoon: x.afternoon, evening: x.evening, hotelName: x.hotelName, hotelAddress: x.hotelAddress,
      meals: x.meals as ItinerarySave['days'][number]['meals'], transfers: x.transfers, notes: x.notes, internalNotes: x.internalNotes,
      items: x.items.map(i => ({ id: i.id ?? null, time: i.time, kind: i.kind, title: i.title, details: i.details, internalNote: i.internalNote, internalCost: i.internalCost, customerVisible: i.customerVisible })),
    })),
  };
}

function describeSync(r: SyncResult): string {
  const parts = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`, r.daysAdded && `${r.daysAdded} day(s) added`, r.daysRemoved && `${r.daysRemoved} empty day(s) removed`, r.staysSet && `${r.staysSet} night(s) of hotel filled`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Already up to date';
}

/** The day-by-day builder. Edits stay local until Save; the server refuses a save made on an old version. */
export function ItineraryBuilder({ view, tripId, canWrite, onReload }: { view: ItineraryView; tripId: string; canWrite: boolean; onReload: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(view));
  const pristine = useMemo(() => JSON.stringify(toDraft(view)), [view]);
  const dirty = JSON.stringify(draft) !== pristine;
  const [conflict, setConflict] = useState(false);
  // Adopt a newer server version when the editor holds no local edits (relative to the version it showed).
  const shown = useRef(pristine);
  useEffect(() => {
    if (JSON.stringify(draft) === shown.current) setDraft(toDraft(view));
    shown.current = pristine;
  }, [pristine]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useItineraryMutation(tripId, (d: Draft) => itinerariesApi.save(view.id, toPayload(view.revision, d)));
  const sync = useItineraryMutation(tripId, () => itinerariesApi.sync(view.id));
  const share = useItineraryMutation(tripId, () => itinerariesApi.share(view.id));
  const remove = useItineraryMutation(tripId, () => itinerariesApi.remove(view.id));
  const busy = save.isPending || sync.isPending || share.isPending;

  const setDay = (i: number, next: ItineraryDayView) => setDraft(d => ({ ...d, days: d.days.map((x, k) => (k === i ? next : x)) }));
  const addDay = () => setDraft(d => ({ ...d, days: [...d.days, { dayNumber: d.days.length + 1, date: null, title: defaultDayTitle(d.days.length + 1), morning: null, afternoon: null, evening: null, hotelName: null, hotelAddress: null, meals: [], transfers: null, notes: null, internalNotes: null, items: [] }] }));
  const last = draft.days[draft.days.length - 1];
  const canDropLast = !!last && !last.items.some(i => i.sourceType);
  const dropLast = () => { if (last && (isEmptyDay(last) || window.confirm(`Remove day ${last.dayNumber} and everything written on it?`))) setDraft(d => ({ ...d, days: d.days.slice(0, -1) })); };

  function doSave() {
    save.mutate(draft, {
      onSuccess: v => { setDraft(toDraft(v)); setConflict(false); toast.success(`Saved — version ${v.revision}`); },
      onError: e => { const err = e as ApiError; if (err.status === 409) setConflict(true); toast.error('Not saved', err.message); },
    });
  }
  async function copyText() {
    try {
      await navigator.clipboard.writeText(itineraryAsText(await itinerariesApi.customer(view.id)));
      toast.success('Copied', 'Paste it into WhatsApp. Mark the itinerary as shared once it is sent.');
    } catch (e) { toast.error('Could not copy', (e as Error).message); }
  }
  const w = view.warnings;
  const editable = canWrite;

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-md p-3 flex flex-wrap items-center gap-2">
        <div className="text-sm text-slate-700 mr-auto">
          <span className="font-medium">{view.id}</span> · version {view.revision}
          {view.sharedRevision !== null ? <StatusPill tone={w.changedSinceShared ? 'warning' : 'success'} className="ml-2">customer has v{view.sharedRevision}</StatusPill> : <StatusPill tone="neutral" className="ml-2">not shared yet</StatusPill>}
          {view.sharedAt && <span className="ml-2 text-xs text-slate-500">shared {fmtDateTime(view.sharedAt)}</span>}
        </div>
        {editable && <Button size="sm" variant="outline" disabled={dirty || busy} loading={sync.isPending} title={dirty ? 'Save first' : 'Bring hotels, transport, activities and tickets in line'}
          onClick={() => sync.mutate(undefined, { onSuccess: r => toast.success('Synced with bookings', describeSync(r.result) + (r.result.unplaced.length ? `. Outside the itinerary dates: ${r.result.unplaced.map(u => u.title).join('; ')}` : '')), onError: e => toast.error('Sync failed', (e as ApiError).message) })}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />Sync with bookings</Button>}
        <Button size="sm" variant="outline" disabled={dirty} title={dirty ? 'Save first' : undefined} onClick={() => window.open(`/print/trip-itinerary/${view.id}`, '_blank', 'noopener')}><Printer className="w-3.5 h-3.5 mr-1" />Customer copy</Button>
        <Button size="sm" variant="outline" disabled={dirty} title={dirty ? 'Save first' : undefined} onClick={() => void copyText()}><Copy className="w-3.5 h-3.5 mr-1" />Copy WhatsApp text</Button>
        {editable && <Button size="sm" variant="outline" disabled={dirty || busy || (view.sharedRevision === view.revision)} loading={share.isPending}
          onClick={() => share.mutate(undefined, { onSuccess: v => toast.success(`Version ${v.revision} marked as shared`), onError: e => toast.error('Not marked', (e as ApiError).message) })}>
          <Send className="w-3.5 h-3.5 mr-1" />Mark as shared</Button>}
        {editable && <Button size="sm" disabled={!dirty || busy} loading={save.isPending} onClick={doSave}>Save</Button>}
      </div>

      {(conflict || w.datesOutOfStep || w.daysBeyondTrip.length > 0 || w.changedSinceShared) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
          {conflict && <p className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Someone else saved this itinerary. <button type="button" className="underline" onClick={() => { setConflict(false); onReload(); setDraft(toDraft(view)); }}>Discard my changes and reload</button></p>}
          {w.datesOutOfStep && <p>The trip dates have changed. Use “Sync with bookings” to re-date the days.</p>}
          {w.daysBeyondTrip.length > 0 && <p>Day {w.daysBeyondTrip.join(', ')} fall after the trip ends — clear or remove them.</p>}
          {w.changedSinceShared && <p>Changed since the customer got version {view.sharedRevision}. Send the new copy and mark it as shared.</p>}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-md p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Title"><TextInput value={draft.title} disabled={!editable} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} /></Field>
        <Field label="Emergency contact (for the customer)"><TextInput value={draft.emergencyContact ?? ''} disabled={!editable} placeholder="e.g. Tour manager Shri Kulkarni, 98xxxxxxxx" onChange={e => setDraft(d => ({ ...d, emergencyContact: e.target.value || null }))} /></Field>
        <Field label="Notes for the customer"><Textarea rows={3} value={draft.notes ?? ''} disabled={!editable} placeholder="What to carry, dress code, timings" onChange={e => setDraft(d => ({ ...d, notes: e.target.value || null }))} /></Field>
        <Field label="Internal notes — never shown to the customer"><Textarea rows={3} className="bg-amber-50 border-amber-200" value={draft.internalNotes ?? ''} disabled={!editable} onChange={e => setDraft(d => ({ ...d, internalNotes: e.target.value || null }))} /></Field>
      </div>

      <div className="space-y-2">
        {draft.days.map((d, i) => (
          <DayEditor key={d.id ?? `new-${i}`} day={d} canEdit={editable} canSeeCost={view.canSeeCost} defaultOpen={draft.days.length <= 4 || i === 0}
            beyondTrip={!!view.trip?.days && d.dayNumber > view.trip.days} onChange={n => setDay(i, n)} />
        ))}
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={addDay}>Add day</Button>
          {draft.days.length > 0 && <Button size="sm" variant="ghost" disabled={!canDropLast} title={canDropLast ? undefined : 'The last day has booking items'} onClick={dropLast}>Remove last day</Button>}
          <button type="button" className="ml-auto text-xs text-red-600 hover:underline" onClick={() => { if (window.confirm(`Delete itinerary ${view.id}? This cannot be undone.`)) remove.mutate(undefined, { onSuccess: () => toast.success('Itinerary deleted'), onError: e => toast.error('Not deleted', (e as ApiError).message) }); }}>Delete itinerary</button>
        </div>
      )}
      {dirty && editable && <div className="sticky bottom-0 bg-white/95 border-t border-slate-200 py-2 flex justify-end gap-2"><span className="text-xs text-slate-500 self-center">Unsaved changes</span><Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(view))}>Discard</Button><Button size="sm" loading={save.isPending} onClick={doSave}>Save</Button></div>}
    </div>
  );
}
