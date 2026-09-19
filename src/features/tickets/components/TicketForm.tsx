import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Field, Select, TextInput, Textarea, Money } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fareTotals } from '@/shared/calc/tickets';
import { TicketInput, TrainQuota, type TicketMode } from '@/shared/contracts/tickets';
import { ApiError } from '@/lib/api';
import { travellersApi } from '@/features/travellers/api';
import { CustomerPicker } from '@/features/customers/components/CustomerPicker';
import { VendorSelect } from '@/features/masters/components/VendorSelect';
import { SegmentFields, EMPTY_SEGMENT, type SegmentDraft } from './SegmentFields';

interface Props { tripId?: string | null; submitting: boolean; error?: ApiError | null; onSubmit: (v: TicketInput) => void; onCancel: () => void }

/** New ticket: mode, link (trip or customer), segments, passengers from the trip, fare with live total. */
export function TicketForm({ tripId, submitting, error, onSubmit, onCancel }: Props) {
  const { can } = usePermissions();
  const commercial = can('trips:write') || can('finance:read');
  const [mode, setMode] = useState<TicketMode>('TRAIN');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [head, setHead] = useState({ pnr: '', carrier: '', travelClass: '', quota: '', bookingRef: '', vendorId: null as string | null, internalNotes: '' });
  const [segments, setSegments] = useState<SegmentDraft[]>([{ ...EMPTY_SEGMENT }]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState('');
  const [fare, setFare] = useState({ baseFare: '', taxes: '', otherCharges: '', serviceFee: '', serviceFeeGstPct: '', costAmount: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const trip = useQuery({ queryKey: ['trips', tripId, 'travellers'], queryFn: () => travellersApi.tripTravellers(tripId!), enabled: !!tripId });
  const totals = useMemo(() => fareTotals({ baseFare: +fare.baseFare || 0, taxes: +fare.taxes || 0, otherCharges: +fare.otherCharges || 0, serviceFee: +fare.serviceFee || 0, serviceFeeGstPct: fare.serviceFeeGstPct === '' ? 18 : +fare.serviceFeeGstPct }), [fare]);

  function submit() {
    const names = extraNames.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const body = {
      tripId: tripId ?? null, customerId: tripId ? null : customer?.id ?? null, mode, ...head, quota: mode === 'TRAIN' && head.quota ? head.quota : null,
      segments: segments.map(s => ({ ...s })),
      passengers: [...chosen.map(travellerId => ({ travellerId })), ...names.map(name => ({ name }))],
      ...Object.fromEntries(Object.entries(fare).filter(([, v]) => v !== '')),
    };
    const parsed = TicketInput.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message]))); return; }
    setErrors({});
    onSubmit(parsed.data);
  }
  const segErrors = (i: number) => Object.fromEntries(Object.entries({ ...errors, ...(error?.fields ?? {}) }).filter(([k]) => k.startsWith(`segments.${i}.`)).map(([k, v]) => [k.split('.').pop()!, v]));
  const travellers = trip.data?.travellers ?? [];

  return (
    <div className="space-y-5">
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error.summary}</div>}
      <div className="flex gap-1" role="tablist">{(['TRAIN', 'FLIGHT', 'BUS'] as TicketMode[]).map(m => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`px-3 py-1.5 text-sm rounded-md border ${mode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>{m === 'TRAIN' ? 'Train' : m === 'FLIGHT' ? 'Flight' : 'Bus'}</button>
      ))}</div>

      {!tripId && (
        <Field label="Customer" htmlFor="tk-cust" required error={errors.customerId}>
          {customer ? <div className="flex items-center justify-between text-sm border border-slate-200 rounded-md px-3 py-2"><span>{customer.name}</span><button type="button" className="text-xs text-indigo-600" onClick={() => setCustomer(null)}>Change</button></div>
            : <CustomerPicker onPick={c => setCustomer({ id: c.id, name: c.name })} />}
        </Field>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="PNR" htmlFor="tk-pnr"><TextInput id="tk-pnr" className="uppercase" value={head.pnr} onChange={e => setHead({ ...head, pnr: e.target.value })} /></Field>
        <Field label={mode === 'FLIGHT' ? 'Airline' : mode === 'TRAIN' ? 'Train' : 'Operator'} htmlFor="tk-carrier"><TextInput id="tk-carrier" value={head.carrier} onChange={e => setHead({ ...head, carrier: e.target.value })} /></Field>
        {mode === 'TRAIN' && <Field label="Quota" htmlFor="tk-quota"><Select id="tk-quota" value={head.quota} onChange={e => setHead({ ...head, quota: e.target.value })}><option value="">—</option>{TrainQuota.options.map(q => <option key={q} value={q}>{q.replace('_', ' ').toLowerCase()}</option>)}</Select></Field>}
        <Field label="Booked through" htmlFor="tk-vendor"><VendorSelect id="tk-vendor" kinds={['AIR_CONSOLIDATOR', 'RAIL_BUS_AGENT']} value={head.vendorId} onChange={v => setHead({ ...head, vendorId: v })} placeholder="Direct / own login" /></Field>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Segments</h3>
        {errors.segments && <p className="text-xs text-red-600">{errors.segments}</p>}
        {segments.map((s, i) => (
          <div key={i} className="border border-slate-200 rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Leg {i + 1}</span>{segments.length > 1 && <button type="button" aria-label="Remove leg" className="text-slate-400 hover:text-red-600" onClick={() => setSegments(segments.filter((_, k) => k !== i))}><Trash2 className="w-4 h-4" /></button>}</div>
            <SegmentFields mode={mode} idPrefix={`seg${i}`} value={s} errors={segErrors(i)} onChange={v => setSegments(segments.map((x, k) => (k === i ? v : x)))} />
          </div>
        ))}
        {segments.length < 8 && <button type="button" className="inline-flex items-center gap-1 text-sm text-indigo-600" onClick={() => setSegments([...segments, { ...EMPTY_SEGMENT, fromName: segments[segments.length - 1]?.toName ?? '', fromCode: segments[segments.length - 1]?.toCode ?? '' }])}><Plus className="w-4 h-4" />Add leg</button>}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Passengers</h3>
        {tripId && travellers.length > 0 && (
          <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-60 overflow-y-auto">
            <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 bg-slate-50"><input type="checkbox" checked={chosen.length === travellers.length} onChange={e => setChosen(e.target.checked ? travellers.map(t => t.id) : [])} />All {travellers.length} travellers on the trip</label>
            {travellers.map(t => <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm"><input type="checkbox" checked={chosen.includes(t.id)} onChange={e => setChosen(e.target.checked ? [...chosen, t.id] : chosen.filter(x => x !== t.id))} />{t.displayName ?? `${t.firstName} ${t.lastName}`}<span className="text-xs text-slate-400">{t.role.toLowerCase()}</span></label>)}
          </div>
        )}
        <Field label={tripId ? 'Others (not on the trip list)' : 'Passenger names'} htmlFor="tk-names" hint="One per line" error={errors.passengers}><Textarea id="tk-names" rows={2} value={extraNames} onChange={e => setExtraNames(e.target.value)} /></Field>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Fare (₹, whole ticket)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Base fare" htmlFor="tk-base"><TextInput id="tk-base" inputMode="decimal" value={fare.baseFare} onChange={e => setFare({ ...fare, baseFare: e.target.value })} /></Field>
          <Field label="Taxes" htmlFor="tk-tax"><TextInput id="tk-tax" inputMode="decimal" value={fare.taxes} onChange={e => setFare({ ...fare, taxes: e.target.value })} /></Field>
          <Field label="Other charges" htmlFor="tk-other" hint="Seats, meals, bedroll"><TextInput id="tk-other" inputMode="decimal" value={fare.otherCharges} onChange={e => setFare({ ...fare, otherCharges: e.target.value })} /></Field>
          {commercial && <>
            <Field label="Our service fee" htmlFor="tk-fee"><TextInput id="tk-fee" inputMode="decimal" value={fare.serviceFee} onChange={e => setFare({ ...fare, serviceFee: e.target.value })} /></Field>
            <Field label="GST on fee %" htmlFor="tk-gst" hint="Blank = settings (verify with CA)"><TextInput id="tk-gst" inputMode="decimal" placeholder="18" value={fare.serviceFeeGstPct} onChange={e => setFare({ ...fare, serviceFeeGstPct: e.target.value })} /></Field>
            <Field label="Our cost" htmlFor="tk-cost"><TextInput id="tk-cost" inputMode="decimal" value={fare.costAmount} onChange={e => setFare({ ...fare, costAmount: e.target.value })} /></Field>
          </>}
        </div>
        <p className="text-sm text-slate-700">Customer pays <strong><Money value={totals.total} paise /></strong>{commercial && totals.serviceFeeGst > 0 && <span className="text-xs text-slate-500"> (incl. GST on fee <Money value={totals.serviceFeeGst} paise />)</span>}</p>
      </section>

      <Field label="Internal notes" htmlFor="tk-notes"><Textarea id="tk-notes" rows={2} value={head.internalNotes} onChange={e => setHead({ ...head, internalNotes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" onClick={submit} loading={submitting}>Save ticket</Button></div>
    </div>
  );
}
