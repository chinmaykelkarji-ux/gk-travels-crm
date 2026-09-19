import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Field, Select, TextInput, Money, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { fmtDate } from '@/shared/utils/date';
import { RateInput, MealPlan, type RateInput as RateInputT } from '@/shared/contracts/masters';
import { ApiError } from '@/lib/api';
import { mastersApi, type HotelRate, type RoomType } from '../api';
import { useMasterMutation } from '../hooks';

type Draft = Record<keyof RateInputT, string>;
const EMPTY: Draft = { mealPlan: 'CP', validFrom: '', validTo: '', costPerNight: '', sellPerNight: '', extraAdult: '', extraChild: '', gstRatePct: '', label: '' };
const toDraft = (r: HotelRate): Draft => ({ mealPlan: r.mealPlan, validFrom: r.validFrom, validTo: r.validTo, costPerNight: String(r.costPerNight ?? ''), sellPerNight: r.sellPerNight === null ? '' : String(r.sellPerNight), extraAdult: r.extraAdult === null ? '' : String(r.extraAdult), extraChild: r.extraChild === null ? '' : String(r.extraChild), gstRatePct: r.gstRatePct === null ? '' : String(r.gstRatePct), label: r.label ?? '' });

/** Season rows for one room type. Cost/sell only reach this component for roles that may see them. */
export function RatesEditor({ roomType, canWrite }: { roomType: RoomType; canWrite: boolean }) {
  const [editing, setEditing] = useState<{ id?: string; draft: Draft } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMasterMutation(({ id, body }: { id?: string; body: RateInputT }) => (id ? mastersApi.updateRate(id, body) : mastersApi.addRate(roomType.id, body)));
  const remove = useMasterMutation((id: string) => mastersApi.deleteRate(id));

  function submit() {
    if (!editing) return;
    const parsed = RateInput.safeParse(editing.draft);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message]))); return; }
    setErrors({});
    save.mutate({ id: editing.id, body: parsed.data }, {
      onSuccess: () => { toast.success('Rate saved'); setEditing(null); },
      onError: e => { const err = e as ApiError; setErrors(err.fields ?? { _: err.message }); },
    });
  }
  async function onDelete(r: HotelRate) {
    if (!(await confirm({ title: 'Remove this season?', description: `${r.mealPlan} ${fmtDate(r.validFrom)} → ${fmtDate(r.validTo)}`, confirmLabel: 'Remove', variant: 'destructive' }))) return;
    remove.mutate(r.id, { onSuccess: () => toast.success('Season removed'), onError: e => toast.error('Could not remove', (e as ApiError).message) });
  }
  const set = (k: keyof Draft, v: string) => setEditing(ed => (ed ? { ...ed, draft: { ...ed.draft, [k]: v } } : ed));

  return (
    <div className="space-y-2">
      {roomType.rates.length === 0 && !editing && <p className="text-xs text-slate-400">No seasons on file.</p>}
      {roomType.rates.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-slate-500"><tr><th className="text-left font-medium py-1">Plan</th><th className="text-left font-medium">Season</th><th className="text-right font-medium">Cost / night</th><th className="text-right font-medium">Sell / night</th><th className="text-right font-medium hidden sm:table-cell">GST %</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {roomType.rates.map(r => (
              <tr key={r.id}>
                <td className="py-1.5"><StatusPill>{r.mealPlan}</StatusPill></td>
                <td>{fmtDate(r.validFrom)} → {fmtDate(r.validTo)}{r.label && <span className="text-xs text-slate-500"> · {r.label}</span>}</td>
                <td className="text-right"><Money value={r.costPerNight} /></td>
                <td className="text-right"><Money value={r.sellPerNight} /></td>
                <td className="text-right hidden sm:table-cell tabular-nums">{r.gstRatePct ?? '—'}</td>
                <td className="text-right whitespace-nowrap">{canWrite && <>
                  <button type="button" aria-label="Edit season" className="p-1 text-slate-500 hover:text-slate-800" onClick={() => { setErrors({}); setEditing({ id: r.id, draft: toDraft(r) }); }}><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" aria-label="Remove season" className="p-1 text-slate-500 hover:text-red-600" onClick={() => void onDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
                </>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <div className="border border-slate-200 rounded-md p-3 bg-slate-50 space-y-3">
          {errors._ && <p className="text-xs text-red-600">{errors._}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Meal plan" htmlFor={`mp-${roomType.id}`}><Select id={`mp-${roomType.id}`} value={editing.draft.mealPlan} onChange={e => set('mealPlan', e.target.value)}>{MealPlan.options.map(m => <option key={m}>{m}</option>)}</Select></Field>
            <Field label="From" htmlFor={`vf-${roomType.id}`} error={errors.validFrom}><TextInput id={`vf-${roomType.id}`} type="date" value={editing.draft.validFrom} onChange={e => set('validFrom', e.target.value)} /></Field>
            <Field label="To" htmlFor={`vt-${roomType.id}`} error={errors.validTo}><TextInput id={`vt-${roomType.id}`} type="date" value={editing.draft.validTo} onChange={e => set('validTo', e.target.value)} /></Field>
            <Field label="Season label" htmlFor={`lb-${roomType.id}`}><TextInput id={`lb-${roomType.id}`} placeholder="Diwali peak" value={editing.draft.label} onChange={e => set('label', e.target.value)} /></Field>
            <Field label="Cost / night ₹" htmlFor={`cp-${roomType.id}`} error={errors.costPerNight}><TextInput id={`cp-${roomType.id}`} inputMode="decimal" value={editing.draft.costPerNight} onChange={e => set('costPerNight', e.target.value)} /></Field>
            <Field label="Sell / night ₹" htmlFor={`sp-${roomType.id}`} error={errors.sellPerNight}><TextInput id={`sp-${roomType.id}`} inputMode="decimal" value={editing.draft.sellPerNight} onChange={e => set('sellPerNight', e.target.value)} /></Field>
            <Field label="Extra adult ₹" htmlFor={`ea-${roomType.id}`}><TextInput id={`ea-${roomType.id}`} inputMode="decimal" value={editing.draft.extraAdult} onChange={e => set('extraAdult', e.target.value)} /></Field>
            <Field label="GST % (verify with CA)" htmlFor={`gst-${roomType.id}`} error={errors.gstRatePct}><TextInput id={`gst-${roomType.id}`} inputMode="decimal" value={editing.draft.gstRatePct} onChange={e => set('gstRatePct', e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={submit} loading={save.isPending}>Save season</Button></div>
        </div>
      )}
      {canWrite && !editing && <button type="button" onClick={() => { setErrors({}); setEditing({ draft: { ...EMPTY, mealPlan: roomType.mealPlans[0] ?? 'CP' } }); }} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"><Plus className="w-3.5 h-3.5" />Add season</button>}
    </div>
  );
}
