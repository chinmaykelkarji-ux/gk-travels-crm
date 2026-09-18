import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EnquiryCreate, EnquirySource, TripType, type EnquiryCreate as EnquiryCreateT } from '@/shared/contracts/sales';
import { Field, TextInput, Select, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { ApiError } from '@/lib/api';
import { CustomerPicker } from '@/features/customers/components/CustomerPicker';
import type { Enquiry } from '../api';
import { AssigneeSelect } from './common';

type FormValues = EnquiryCreateT;

function toValues(e?: Partial<Enquiry>, customerId?: string | null): FormValues {
  return {
    customerId: e?.customerId ?? customerId ?? null, newCustomer: null, leadId: e?.leadId ?? null,
    source: (e?.source as FormValues['source']) ?? 'DIRECT', destination: e?.destination ?? '', origin: e?.origin ?? null,
    departureDate: e?.departureDate ?? null, returnDate: e?.returnDate ?? null, flexibleDates: e?.flexibleDates ?? false,
    adults: e?.adults ?? 2, children: e?.children ?? 0, infants: e?.infants ?? 0, rooms: e?.rooms ?? null,
    tripType: e?.tripType ?? null, hotelCategory: e?.hotelCategory ?? null, mealPlan: e?.mealPlan ?? null,
    budget: e?.budget ?? null, budgetMax: e?.budgetMax ?? null, requirements: e?.requirements ?? null, preferences: e?.preferences ?? {},
    priority: e?.priority ?? 'medium', assignedToUserId: e?.assignedToUserId ?? null, notes: e?.notes ?? null,
  };
}

interface Props { initial?: Partial<Enquiry>; customer?: { id: string; name: string } | null; submitting: boolean; error?: ApiError | null; onSubmit: (v: FormValues) => void; onCancel: () => void; submitLabel?: string }

export function EnquiryForm({ initial, customer, submitting, error, onSubmit, onCancel, submitLabel = 'Save enquiry' }: Props) {
  const defaults = useMemo(() => toValues(initial, customer?.id), [initial, customer?.id]);
  const { register, handleSubmit, control, watch, setValue, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(EnquiryCreate), defaultValues: defaults });
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(customer ?? (initial?.customer ? { id: initial.customer.id, name: initial.customer.name } : null));
  const [mode, setMode] = useState<'existing' | 'new'>(picked ? 'existing' : 'existing');
  const editing = !!initial?.id;
  const adults = Number(watch('adults') || 0), children = Number(watch('children') || 0), infants = Number(watch('infants') || 0);

  useEffect(() => { if (error?.fields) for (const [k, m] of Object.entries(error.fields)) if (k in defaults) setError(k as keyof FormValues, { message: m }); }, [error, defaults, setError]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && !error.fields && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error.message}</div>}
      {!editing && (
        <fieldset className="border border-slate-200 rounded-md p-3 space-y-3">
          <legend className="text-xs font-medium text-slate-600 px-1">Customer</legend>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={mode === 'existing'} onChange={() => { setMode('existing'); setValue('newCustomer', null); }} />Existing</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={mode === 'new'} onChange={() => { setMode('new'); setPicked(null); setValue('customerId', null); setValue('newCustomer', { name: '', phone: '', email: null }); }} />New customer</label>
          </div>
          {mode === 'existing' && (picked ? (
            <div className="flex items-center justify-between text-sm border border-slate-200 rounded-md px-3 py-2"><span className="font-medium">{picked.name} <span className="text-slate-500">{picked.id}</span></span><button type="button" className="text-slate-500 hover:text-slate-800" onClick={() => { setPicked(null); setValue('customerId', null); }}>Change</button></div>
          ) : (
            <><CustomerPicker onPick={c => { setPicked({ id: c.id, name: c.name }); setValue('customerId', c.id, { shouldValidate: true }); }} />{errors.customerId && <p className="text-xs text-red-600">{errors.customerId.message}</p>}</>
          ))}
          {mode === 'new' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" htmlFor="ncName" required error={errors.newCustomer?.name?.message}><TextInput id="ncName" {...register('newCustomer.name')} /></Field>
              <Field label="Phone" htmlFor="ncPhone" required error={errors.newCustomer?.phone?.message} hint="Matched to an existing customer if the number is known"><TextInput id="ncPhone" inputMode="tel" {...register('newCustomer.phone')} /></Field>
              <Field label="Email" htmlFor="ncEmail" className="col-span-2" error={errors.newCustomer?.email?.message}><TextInput id="ncEmail" type="email" {...register('newCustomer.email')} /></Field>
            </div>
          )}
        </fieldset>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Destination" htmlFor="destination" required error={errors.destination?.message} className="col-span-2 sm:col-span-3"><TextInput id="destination" invalid={!!errors.destination} {...register('destination')} /></Field>
        <Field label="Source" htmlFor="source"><Select id="source" {...register('source')}>{EnquirySource.options.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</Select></Field>
        <Field label="From (origin)" htmlFor="origin" className="col-span-2"><TextInput id="origin" placeholder="Belagavi / Goa / Bengaluru" {...register('origin')} /></Field>
        <Field label="Departure" htmlFor="departureDate" error={errors.departureDate?.message}><TextInput id="departureDate" type="date" {...register('departureDate')} /></Field>
        <Field label="Return" htmlFor="returnDate" error={errors.returnDate?.message}><TextInput id="returnDate" type="date" invalid={!!errors.returnDate} {...register('returnDate')} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2"><input type="checkbox" {...register('flexibleDates')} />Dates are flexible</label>
        <Field label="Adults" htmlFor="adults" required error={errors.adults?.message}><TextInput id="adults" type="number" min={1} {...register('adults')} /></Field>
        <Field label="Children (2–11)" htmlFor="children" error={errors.children?.message}><TextInput id="children" type="number" min={0} {...register('children')} /></Field>
        <Field label="Infants (<2)" htmlFor="infants" error={errors.infants?.message}><TextInput id="infants" type="number" min={0} {...register('infants')} /></Field>
        <Field label="Rooms" htmlFor="rooms" hint={`${adults + children + infants} pax`}><TextInput id="rooms" type="number" min={1} {...register('rooms')} /></Field>
        <Field label="Trip type" htmlFor="tripType"><Select id="tripType" {...register('tripType')}><option value="">—</option>{TripType.options.map(t => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Hotel category" htmlFor="hotelCategory"><Select id="hotelCategory" {...register('hotelCategory')}><option value="">—</option>{['Budget', '3 star', '4 star', '5 star', 'Luxury', 'Homestay'].map(h => <option key={h}>{h}</option>)}</Select></Field>
        <Field label="Meal plan" htmlFor="mealPlan"><Select id="mealPlan" {...register('mealPlan')}><option value="">—</option>{['EP', 'CP', 'MAP', 'AP', 'AI'].map(m => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Priority" htmlFor="priority"><Select id="priority" {...register('priority')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
        <Field label="Budget from (₹)" htmlFor="budget" error={errors.budget?.message}><TextInput id="budget" type="number" min={0} step={1000} {...register('budget')} /></Field>
        <Field label="Budget to (₹)" htmlFor="budgetMax" error={errors.budgetMax?.message}><TextInput id="budgetMax" type="number" min={0} step={1000} invalid={!!errors.budgetMax} {...register('budgetMax')} /></Field>
        <Controller name="assignedToUserId" control={control} render={({ field }) => <div className="col-span-2"><AssigneeSelect value={field.value} onChange={field.onChange} /></div>} />
        <Field label="Requirements" htmlFor="requirements" className="col-span-2 sm:col-span-4" hint="Inclusions wanted, must-see places, special needs"><Textarea id="requirements" rows={3} {...register('requirements')} /></Field>
        <Field label="Internal notes" htmlFor="enotes" className="col-span-2 sm:col-span-4"><Textarea id="enotes" rows={2} {...register('notes')} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" loading={submitting}>{submitLabel}</Button></div>
    </form>
  );
}
