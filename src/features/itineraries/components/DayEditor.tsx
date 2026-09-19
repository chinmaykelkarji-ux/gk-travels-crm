import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Field, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { MEALS, shortDate } from '@/shared/calc/itinerary';
import type { ItineraryDayView, ItineraryItemView } from '../api';
import { ItemRow } from './ItemRow';

interface Props {
  day: ItineraryDayView;
  canEdit: boolean;
  canSeeCost: boolean;
  defaultOpen: boolean;
  beyondTrip: boolean;
  onChange: (next: ItineraryDayView) => void;
}

const NEW_ITEM: ItineraryItemView = { time: null, kind: 'SIGHTSEEING', title: '', details: null, internalNote: null, internalCost: null, customerVisible: true, sourceType: null, sourceId: null };

/** One day: what the customer reads (schedule, stay, meals, notes) and the office's own notes. */
export function DayEditor({ day, canEdit, canSeeCost, defaultOpen, beyondTrip, onChange }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const set = <K extends keyof ItineraryDayView>(k: K, v: ItineraryDayView[K]) => onChange({ ...day, [k]: v });
  const text = (k: 'morning' | 'afternoon' | 'evening' | 'transfers' | 'notes' | 'internalNotes' | 'hotelName' | 'hotelAddress') => ({
    value: day[k] ?? '', disabled: !canEdit, onChange: (e: { target: { value: string } }) => set(k, e.target.value || null),
  });
  const setItem = (i: number, next: ItineraryItemView) => set('items', day.items.map((x, k) => (k === i ? next : x)));
  const summary = [day.items.length ? `${day.items.length} item${day.items.length === 1 ? '' : 's'}` : '', day.hotelName ? `stay: ${day.hotelName}` : ''].filter(Boolean).join(' · ');

  return (
    <section className="bg-white border border-slate-200 rounded-md">
      <header className="flex items-center gap-3 px-3 py-2 border-b border-slate-100">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <span className="w-8 h-8 rounded-full bg-[#1B2A4A] text-[#E3C766] text-sm font-semibold flex items-center justify-center flex-shrink-0">{day.dayNumber}</span>
          <span className="text-xs text-slate-500 w-24">{day.date ? shortDate(day.date) : 'no date'}</span>
        </button>
        <TextInput aria-label={`Day ${day.dayNumber} title`} className="flex-1 font-medium" value={day.title} disabled={!canEdit} onChange={e => set('title', e.target.value)} />
        {!open && summary && <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">{summary}</span>}
        {beyondTrip && <span className="text-[11px] text-amber-700 whitespace-nowrap">after the trip ends</span>}
      </header>
      {open && (
        <div className="p-3 space-y-3">
          {(day.items.length > 0 || canEdit) && (
            <div className="space-y-2">
              <ul className="space-y-2">{day.items.map((it, i) => (
                <ItemRow key={it.id ?? `new-${i}`} item={it} canEdit={canEdit} canSeeCost={canSeeCost} onChange={n => setItem(i, n)} onRemove={() => set('items', day.items.filter((_, k) => k !== i))} />
              ))}</ul>
              {canEdit && <Button type="button" size="sm" variant="outline" onClick={() => set('items', [...day.items, { ...NEW_ITEM }])}><Plus className="w-3.5 h-3.5 mr-1" />Add item</Button>}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Morning"><Textarea rows={2} className="min-h-[60px]" {...text('morning')} /></Field>
            <Field label="Afternoon"><Textarea rows={2} className="min-h-[60px]" {...text('afternoon')} /></Field>
            <Field label="Evening"><Textarea rows={2} className="min-h-[60px]" {...text('evening')} /></Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Night's stay" hint="Filled from hotel bookings on sync"><TextInput {...text('hotelName')} /></Field>
            <Field label="Hotel address"><TextInput {...text('hotelAddress')} /></Field>
            <Field label="Meals included">
              <div className="flex gap-3 h-9 items-center">{MEALS.map(m => (
                <label key={m} className="flex items-center gap-1 text-sm text-slate-700 capitalize">
                  <input type="checkbox" disabled={!canEdit} checked={day.meals.includes(m)} onChange={e => set('meals', e.target.checked ? [...day.meals, m] : day.meals.filter(x => x !== m))} />{m}
                </label>
              ))}</div>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Transport (for the customer)"><TextInput placeholder="e.g. AC coach for the whole day" {...text('transfers')} /></Field>
            <Field label="Notes for the customer"><TextInput placeholder="e.g. Wear traditional dress for darshan" {...text('notes')} /></Field>
          </div>
          <Field label="Internal notes — never shown to the customer">
            <Textarea rows={2} className="min-h-[60px] bg-amber-50 border-amber-200" placeholder="Reminders for the team" {...text('internalNotes')} />
          </Field>
        </div>
      )}
    </section>
  );
}
