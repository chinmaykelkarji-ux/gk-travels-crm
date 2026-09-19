import { Eye, EyeOff, Link2, Trash2 } from 'lucide-react';
import { Select, TextInput } from '@/design-system';
import { ITEM_KINDS, ITEM_KIND_LABEL, type ItemKind } from '@/shared/calc/itinerary';
import type { ItineraryItemView } from '../api';

interface Props {
  item: ItineraryItemView;
  canEdit: boolean;
  canSeeCost: boolean;
  onChange: (next: ItineraryItemView) => void;
  onRemove: () => void;
}

/** One timed entry on a day. Booking items show their generated text read-only. */
export function ItemRow({ item, canEdit, canSeeCost, onChange, onRemove }: Props) {
  const linked = !!item.sourceType;
  const set = <K extends keyof ItineraryItemView>(k: K, v: ItineraryItemView[K]) => onChange({ ...item, [k]: v });
  return (
    <li className={`rounded-md border p-2 space-y-1.5 ${item.customerVisible ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
      <div className="flex flex-wrap items-start gap-2">
        {linked ? (
          <div className="flex-1 min-w-[200px] text-sm">
            <div className="flex items-center gap-1.5 font-medium text-slate-900">
              {item.time && <span className="tabular-nums text-slate-600">{item.time}</span>}{item.title}
              <span title="From a booking: change the booking, then sync" className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide text-indigo-600"><Link2 className="w-3 h-3" />booking</span>
            </div>
            {item.details && <div className="text-xs text-slate-600">{item.details}</div>}
          </div>
        ) : (
          <>
            <TextInput type="time" aria-label="Time" className="w-[110px]" value={item.time ?? ''} disabled={!canEdit} onChange={e => set('time', e.target.value || null)} />
            <Select aria-label="Kind" className="w-[140px]" value={item.kind} disabled={!canEdit} onChange={e => set('kind', e.target.value as ItemKind)}>
              {ITEM_KINDS.map(k => <option key={k} value={k}>{ITEM_KIND_LABEL[k]}</option>)}
            </Select>
            <TextInput aria-label="Title" className="flex-1 min-w-[180px]" placeholder="What happens (e.g. Kashi Vishwanath darshan)" value={item.title} disabled={!canEdit} onChange={e => set('title', e.target.value)} />
          </>
        )}
        {canEdit && (
          <div className="flex items-center gap-1 ml-auto">
            <button type="button" onClick={() => set('customerVisible', !item.customerVisible)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" title={item.customerVisible ? 'Shown to the customer — click to hide' : 'Hidden from the customer — click to show'} aria-label={item.customerVisible ? 'Hide from customer' : 'Show to customer'}>
              {item.customerVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            {!linked && <button type="button" onClick={onRemove} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>}
          </div>
        )}
      </div>
      {!linked && <TextInput aria-label="Details for the customer" placeholder="Details for the customer (optional)" value={item.details ?? ''} disabled={!canEdit} onChange={e => set('details', e.target.value || null)} />}
      <div className="flex flex-wrap gap-2">
        <TextInput aria-label="Internal note" placeholder="Internal note — never shown to the customer" className="flex-1 min-w-[200px] bg-amber-50 border-amber-200" value={item.internalNote ?? ''} disabled={!canEdit} onChange={e => set('internalNote', e.target.value || null)} />
        {canSeeCost && (
          <TextInput aria-label="Internal cost" type="number" min={0} step="0.01" placeholder="Cost ₹" className="w-[120px] bg-amber-50 border-amber-200" value={item.internalCost ?? ''} disabled={!canEdit}
            onChange={e => set('internalCost', e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>
    </li>
  );
}
