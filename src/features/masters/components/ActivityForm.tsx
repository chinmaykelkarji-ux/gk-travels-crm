import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Field, TextInput, Textarea, FormShell, useServerFieldErrors } from '@/design-system';
import { ActivityInput, type ActivityInput as ActivityInputT } from '@/shared/contracts/masters';
import type { ApiError } from '@/lib/api';
import type { ActivityMaster } from '../api';
import { VendorSelect } from './VendorSelect';

interface Props { initial?: ActivityMaster; canSetPrices: boolean; submitting: boolean; error?: ApiError | null; onSubmit: (v: ActivityInputT) => void; onCancel: () => void }
const FIELDS = ['name', 'city', 'durationMinutes', 'costAdult', 'costChild', 'sellAdult', 'sellChild', 'minPax', 'maxPax', 'vendorId'] as const;

export function ActivityForm({ initial, canSetPrices, submitting, error, onSubmit, onCancel }: Props) {
  const { register, handleSubmit, setError, control, formState: { errors } } = useForm<ActivityInputT>({
    resolver: zodResolver(ActivityInput),
    defaultValues: {
      name: initial?.name ?? '', city: initial?.city ?? '', category: initial?.category ?? null, vendorId: initial?.vendorId ?? null, durationMinutes: initial?.durationMinutes ?? null,
      description: initial?.description ?? null, inclusions: initial?.inclusions ?? null, costAdult: initial?.costAdult ?? null, costChild: initial?.costChild ?? null,
      sellAdult: initial?.sellAdult ?? null, sellChild: initial?.sellChild ?? null, minPax: initial?.minPax ?? null, maxPax: initial?.maxPax ?? null, notes: initial?.notes ?? null, isActive: initial?.isActive ?? true,
    },
  });
  useServerFieldErrors(error, setError, FIELDS);
  return (
    <FormShell onSubmit={handleSubmit(onSubmit)} error={error} submitting={submitting} onCancel={onCancel} submitLabel={initial ? 'Save activity' : 'Add activity'}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Activity" htmlFor="a-name" required error={errors.name?.message} className="col-span-2"><TextInput id="a-name" invalid={!!errors.name} {...register('name')} /></Field>
        <Field label="City" htmlFor="a-city" required error={errors.city?.message}><TextInput id="a-city" invalid={!!errors.city} {...register('city')} /></Field>
        <Field label="Category" htmlFor="a-cat" hint="Darshan, sightseeing, boat ride…"><TextInput id="a-cat" {...register('category')} /></Field>
        <Field label="Provider" htmlFor="a-vendor">
          <Controller control={control} name="vendorId" render={({ field }) => <VendorSelect id="a-vendor" kinds={['ACTIVITY', 'DMC', 'GUIDE']} value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Duration (minutes)" htmlFor="a-dur" error={errors.durationMinutes?.message}><TextInput id="a-dur" inputMode="numeric" {...register('durationMinutes')} /></Field>
        <Field label="Min pax" htmlFor="a-min" error={errors.minPax?.message}><TextInput id="a-min" inputMode="numeric" {...register('minPax')} /></Field>
        <Field label="Max pax" htmlFor="a-max" error={errors.maxPax?.message}><TextInput id="a-max" inputMode="numeric" {...register('maxPax')} /></Field>
        {canSetPrices && <>
          <Field label="Cost / adult (₹)" htmlFor="a-ca" error={errors.costAdult?.message}><TextInput id="a-ca" inputMode="decimal" {...register('costAdult')} /></Field>
          <Field label="Cost / child (₹)" htmlFor="a-cc" error={errors.costChild?.message}><TextInput id="a-cc" inputMode="decimal" {...register('costChild')} /></Field>
          <Field label="Sell / adult (₹)" htmlFor="a-sa" error={errors.sellAdult?.message}><TextInput id="a-sa" inputMode="decimal" {...register('sellAdult')} /></Field>
          <Field label="Sell / child (₹)" htmlFor="a-sc" error={errors.sellChild?.message}><TextInput id="a-sc" inputMode="decimal" {...register('sellChild')} /></Field>
        </>}
        <Field label="Description (customer-facing)" htmlFor="a-desc" className="col-span-2"><Textarea id="a-desc" rows={2} {...register('description')} /></Field>
        <Field label="Inclusions" htmlFor="a-inc" className="col-span-2"><TextInput id="a-inc" {...register('inclusions')} /></Field>
        <Field label="Internal notes" htmlFor="a-notes" className="col-span-2"><Textarea id="a-notes" rows={2} {...register('notes')} /></Field>
      </div>
    </FormShell>
  );
}
