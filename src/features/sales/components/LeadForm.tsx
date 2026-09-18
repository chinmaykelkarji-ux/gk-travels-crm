import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { LeadCreate, LeadSource, TripType, type LeadCreate as LeadCreateT } from '@/shared/contracts/sales';
import { Field, TextInput, Select, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { ApiError } from '@/lib/api';
import { normalizePhone } from '@/shared/calc/phone';
import { salesApi, type Lead } from '../api';
import { AssigneeSelect } from './common';

type FormValues = LeadCreateT;

function toValues(l?: Partial<Lead>): FormValues {
  return {
    name: l?.name ?? '', phone: l?.phone ?? '', email: l?.email ?? null, source: l?.source ?? 'WhatsApp', destination: l?.destination ?? '', travelDate: l?.travelDate ?? null,
    pax: l?.pax ?? 2, budget: l?.budget ?? null, tripType: l?.tripType ?? '', priority: l?.priority ?? 'medium', notes: l?.notes ?? '', followUpDate: l?.followUpDate ?? null,
    assignedToUserId: l?.assignedToUserId ?? null, force: false,
  };
}

export function LeadForm({ initial, submitting, error, onSubmit, onCancel, submitLabel = 'Save lead' }: { initial?: Partial<Lead>; submitting: boolean; error?: ApiError | null; onSubmit: (v: FormValues) => void; onCancel: () => void; submitLabel?: string }) {
  const defaults = useMemo(() => toValues(initial), [initial]);
  const { register, handleSubmit, control, watch, setValue, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(LeadCreate), defaultValues: defaults });
  const phone = watch('phone');
  const force = watch('force');
  const [dupes, setDupes] = useState<{ leads: { id: string; name: string }[]; customers: { id: string; name: string }[] } | null>(null);

  useEffect(() => {
    const n = normalizePhone(phone);
    if (!n || initial?.id) { setDupes(null); return; }
    const t = setTimeout(() => salesApi.leads.checkDuplicates(n).then(setDupes).catch(() => setDupes(null)), 300);
    return () => clearTimeout(t);
  }, [phone, initial?.id]);
  useEffect(() => { if (error?.fields) for (const [k, m] of Object.entries(error.fields)) if (k in defaults) setError(k as keyof FormValues, { message: m }); }, [error, defaults, setError]);

  const hasDupes = !!dupes && (dupes.leads.length > 0 || dupes.customers.length > 0);
  const isConflict = error?.code === 'CONFLICT';
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && !error.fields && !isConflict && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error.message}</div>}
      {(hasDupes || isConflict) && !initial?.id && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
          <div className="flex items-center gap-2 text-amber-800 font-medium"><AlertTriangle className="w-4 h-4" />This number is already known</div>
          {dupes?.leads.map(l => <div key={l.id}>Open lead <Link className="underline" to={`/leads?open=${l.id}`}>{l.name} · {l.id}</Link></div>)}
          {dupes?.customers.map(c => <div key={c.id}>Customer <Link className="underline" to={`/customers/${c.id}`}>{c.name} · {c.id}</Link> — consider raising an enquiry instead</div>)}
          {isConflict && !hasDupes && <div>{error?.message}</div>}
          <label className="flex items-center gap-2 pt-1"><input type="checkbox" checked={!!force} onChange={e => setValue('force', e.target.checked)} />Create anyway</label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="name" required error={errors.name?.message} className="col-span-2"><TextInput id="name" invalid={!!errors.name} {...register('name')} /></Field>
        <Field label="Phone" htmlFor="phone" required error={errors.phone?.message}><TextInput id="phone" inputMode="tel" invalid={!!errors.phone} {...register('phone')} /></Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}><TextInput id="email" type="email" {...register('email')} /></Field>
        <Field label="Source" htmlFor="source" required error={errors.source?.message}><Select id="source" {...register('source')}>{LeadSource.options.map(s => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Priority" htmlFor="priority"><Select id="priority" {...register('priority')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
        <Field label="Destination" htmlFor="destination" className="col-span-2"><TextInput id="destination" placeholder="Where do they want to go?" {...register('destination')} /></Field>
        <Field label="Travel date" htmlFor="travelDate"><TextInput id="travelDate" type="date" {...register('travelDate')} /></Field>
        <Field label="Pax" htmlFor="pax" error={errors.pax?.message}><TextInput id="pax" type="number" min={1} {...register('pax')} /></Field>
        <Field label="Budget (₹)" htmlFor="budget" error={errors.budget?.message}><TextInput id="budget" type="number" min={0} step={1000} {...register('budget')} /></Field>
        <Field label="Trip type" htmlFor="tripType"><Select id="tripType" {...register('tripType')}><option value="">—</option>{TripType.options.map(t => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Follow up on" htmlFor="followUpDate"><TextInput id="followUpDate" type="date" {...register('followUpDate')} /></Field>
        <Controller name="assignedToUserId" control={control} render={({ field }) => <AssigneeSelect value={field.value} onChange={field.onChange} />} />
        <Field label="Notes" htmlFor="notes" className="col-span-2"><Textarea id="notes" rows={3} {...register('notes')} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" loading={submitting}>{submitLabel}</Button></div>
    </form>
  );
}
