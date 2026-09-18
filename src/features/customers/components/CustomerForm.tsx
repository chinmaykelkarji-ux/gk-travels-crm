import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { CustomerCreate, type CustomerCreate as CustomerCreateT } from '@/shared/contracts/customers';
import { Field, TextInput, Select, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { ApiError } from '@/lib/api';
import { customersApi, type DuplicateCandidate, type CustomerRecord } from '../api';
import { normalizePhone } from '@/shared/calc/phone';

const SOURCES = ['Walk-in', 'Phone', 'WhatsApp', 'Instagram', 'Facebook', 'Google', 'Referral', 'Repeat', 'Corporate', 'Other'];

type FormValues = CustomerCreateT;

interface Props {
  initial?:   Partial<CustomerRecord>;
  submitting: boolean;
  error?:     ApiError | null;
  onSubmit:   (values: FormValues) => void;
  onCancel:   () => void;
  submitLabel?: string;
}

function toFormValues(c?: Partial<CustomerRecord>): FormValues {
  return {
    name: c?.name ?? '', phone: c?.phone ?? '', altPhone: c?.altPhone ?? null, email: c?.email ?? null,
    type: c?.type ?? 'INDIVIDUAL', companyName: c?.companyName ?? null, gstNumber: c?.gstNumber ?? null,
    gstRegistered: c?.gstRegistered ?? false, address: c?.address ?? null, billingAddress: c?.billingAddress ?? null,
    city: c?.city ?? null, state: c?.state ?? null, source: c?.source ?? null, referredByCustomerId: c?.referredByCustomerId ?? null,
    passportNo: c?.passportNo ?? null, passportExpiry: c?.passportExpiry ?? null, passportCountry: c?.passportCountry ?? null,
    panNumber: c?.panNumber ?? null, tags: c?.tags ?? [], preferences: c?.preferences ?? {}, notes: c?.notes ?? null, force: false,
  };
}

export function CustomerForm({ initial, submitting, error, onSubmit, onCancel, submitLabel = 'Save customer' }: Props) {
  const defaults = useMemo(() => toFormValues(initial), [initial]);
  const { register, handleSubmit, control, watch, setValue, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(CustomerCreate), defaultValues: defaults,
  });
  const [dupes, setDupes] = useState<DuplicateCandidate[]>([]);
  const type = watch('type');
  const phone = watch('phone');
  const email = watch('email');
  const force = watch('force');

  // Live duplicate hint as the phone/email is typed (informational; the server enforces).
  useEffect(() => {
    const n = normalizePhone(phone);
    const e = email && email.includes('@') ? email : undefined;
    if (!n && !e) { setDupes([]); return; }
    if (initial?.id && n === normalizePhone(initial.phone) && (e ?? null) === (initial.email ?? null)) { setDupes([]); return; }
    const t = setTimeout(() => {
      customersApi.checkDuplicates({ phone: n ?? undefined, email: e, excludeId: initial?.id }).then(setDupes).catch(() => setDupes([]));
    }, 300);
    return () => clearTimeout(t);
  }, [phone, email, initial?.id, initial?.phone, initial?.email]);

  // Server field errors land on the matching inputs.
  useEffect(() => {
    if (!error?.fields) return;
    for (const [k, msg] of Object.entries(error.fields)) {
      if (k in defaults) setError(k as keyof FormValues, { message: msg });
    }
  }, [error, defaults, setError]);

  const isConflict = error?.code === 'CONFLICT';

  return (
    <form id="customer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {error && !error.fields && !isConflict && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error.message}</div>
      )}
      {(dupes.length > 0 || isConflict) && !initial?.id && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
          <div className="flex items-center gap-2 text-amber-800 font-medium"><AlertTriangle className="w-4 h-4" /> Possible duplicate</div>
          {dupes.map(d => <div key={d.id} className="text-amber-900">{d.name} · {d.phone}{d.email ? ` · ${d.email}` : ''} <span className="text-amber-600">(same {d.reason})</span></div>)}
          {isConflict && dupes.length === 0 && <div className="text-amber-900">{error?.message}</div>}
          <label className="flex items-center gap-2 text-amber-900 pt-1">
            <input type="checkbox" checked={!!force} onChange={e => setValue('force', e.target.checked)} />
            Create anyway (e.g. a family member sharing this number)
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
          <TextInput id="name" autoComplete="off" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Phone" htmlFor="phone" required error={errors.phone?.message}>
          <TextInput id="phone" inputMode="tel" placeholder="98765 43210" invalid={!!errors.phone} {...register('phone')} />
        </Field>
        <Field label="Alternate phone" htmlFor="altPhone" error={errors.altPhone?.message}>
          <TextInput id="altPhone" inputMode="tel" {...register('altPhone')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <TextInput id="email" type="email" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Type" htmlFor="type">
          <Select id="type" {...register('type')}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="CORPORATE">Corporate</option>
          </Select>
        </Field>
        {type === 'CORPORATE' && (
          <>
            <Field label="Company name" htmlFor="companyName" error={errors.companyName?.message}>
              <TextInput id="companyName" {...register('companyName')} />
            </Field>
            <Field label="GSTIN" htmlFor="gstNumber" error={errors.gstNumber?.message}>
              <TextInput id="gstNumber" className="uppercase" maxLength={15} {...register('gstNumber')} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" {...register('gstRegistered')} /> GST registered (B2B invoices)
            </label>
          </>
        )}
        <Field label="City" htmlFor="city"><TextInput id="city" {...register('city')} /></Field>
        <Field label="State" htmlFor="state"><TextInput id="state" {...register('state')} /></Field>
        <Field label="Address" htmlFor="address" className="sm:col-span-2"><Textarea id="address" rows={2} {...register('address')} /></Field>
        <Field label="Source" htmlFor="source">
          <Select id="source" {...register('source')}>
            <option value="">—</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Tags" htmlFor="tags" hint="Comma separated: vip, honeymoon, repeat">
          <Controller name="tags" control={control} render={({ field }) => (
            <TextInput id="tags" value={field.value.join(', ')} onChange={e => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
          )} />
        </Field>
      </div>

      <details className="group">
        <summary className="text-xs font-medium text-slate-600 cursor-pointer select-none">Identity documents &amp; preferences</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
          <Field label="Passport number" htmlFor="passportNo"><TextInput id="passportNo" className="uppercase" {...register('passportNo')} /></Field>
          <Field label="Passport expiry" htmlFor="passportExpiry" error={errors.passportExpiry?.message}><TextInput id="passportExpiry" type="date" {...register('passportExpiry')} /></Field>
          <Field label="Passport country" htmlFor="passportCountry"><TextInput id="passportCountry" {...register('passportCountry')} /></Field>
          <Field label="PAN" htmlFor="panNumber"><TextInput id="panNumber" className="uppercase" maxLength={10} {...register('panNumber')} /></Field>
          <Field label="Seat preference" htmlFor="seat"><TextInput id="seat" placeholder="Window / Aisle" {...register('preferences.seatPreference')} /></Field>
          <Field label="Meal preference" htmlFor="meal"><TextInput id="meal" placeholder="Veg / Jain / Non-veg" {...register('preferences.mealPreference')} /></Field>
          <Field label="Hotel preference" htmlFor="hotel" className="sm:col-span-2"><TextInput id="hotel" placeholder="4★, sea view, twin beds…" {...register('preferences.hotelPreference')} /></Field>
        </div>
      </details>

      <Field label="Notes" htmlFor="notes"><Textarea id="notes" rows={3} {...register('notes')} /></Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={submitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
