import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Field, TextInput, Textarea, FormShell, useServerFieldErrors } from '@/design-system';
import { HotelInput, type HotelInput as HotelInputT } from '@/shared/contracts/masters';
import type { ApiError } from '@/lib/api';
import type { Hotel } from '../api';
import { VendorSelect } from './VendorSelect';

interface Props { initial?: Hotel; submitting: boolean; error?: ApiError | null; onSubmit: (v: HotelInputT) => void; onCancel: () => void }
const FIELDS = ['name', 'city', 'email', 'gstin', 'checkInTime', 'checkOutTime', 'vendorId'] as const;

export function HotelForm({ initial, submitting, error, onSubmit, onCancel }: Props) {
  const { register, handleSubmit, setError, control, formState: { errors } } = useForm<HotelInputT & { amenitiesText?: string }>({
    resolver: zodResolver(HotelInput),
    defaultValues: {
      name: initial?.name ?? '', city: initial?.city ?? '', state: initial?.state ?? null, category: initial?.category ?? null, vendorId: initial?.vendorId ?? null,
      address: initial?.address ?? null, phone: initial?.phone ?? null, email: initial?.email ?? null, gstin: initial?.gstin ?? null,
      checkInTime: initial?.checkInTime ?? null, checkOutTime: initial?.checkOutTime ?? null, amenities: initial?.amenities ?? [], notes: initial?.notes ?? null, isActive: initial?.isActive ?? true,
    },
  });
  useServerFieldErrors(error, setError, FIELDS);

  return (
    <FormShell onSubmit={handleSubmit(onSubmit)} error={error} submitting={submitting} onCancel={onCancel} submitLabel={initial ? 'Save hotel' : 'Add hotel'}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Hotel name" htmlFor="h-name" required error={errors.name?.message} className="col-span-2"><TextInput id="h-name" invalid={!!errors.name} {...register('name')} /></Field>
        <Field label="City" htmlFor="h-city" required error={errors.city?.message}><TextInput id="h-city" invalid={!!errors.city} {...register('city')} /></Field>
        <Field label="State" htmlFor="h-state"><TextInput id="h-state" {...register('state')} /></Field>
        <Field label="Category" htmlFor="h-cat" hint="3 star, Deluxe, Dharamshala…"><TextInput id="h-cat" {...register('category')} /></Field>
        <Field label="Booked through" htmlFor="h-vendor" hint="Hotel's own account or a DMC" error={errors.vendorId?.message}>
          <Controller control={control} name="vendorId" render={({ field }) => <VendorSelect id="h-vendor" kinds={['HOTEL', 'DMC']} value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Reservation phone" htmlFor="h-phone"><TextInput id="h-phone" inputMode="tel" {...register('phone')} /></Field>
        <Field label="Reservation email" htmlFor="h-email" error={errors.email?.message}><TextInput id="h-email" type="email" {...register('email')} /></Field>
        <Field label="GSTIN" htmlFor="h-gst" error={errors.gstin?.message}><TextInput id="h-gst" className="uppercase" maxLength={15} {...register('gstin')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Check-in" htmlFor="h-in" error={errors.checkInTime?.message}><TextInput id="h-in" placeholder="12:00" {...register('checkInTime')} /></Field>
          <Field label="Check-out" htmlFor="h-out" error={errors.checkOutTime?.message}><TextInput id="h-out" placeholder="10:00" {...register('checkOutTime')} /></Field>
        </div>
        <Field label="Amenities" htmlFor="h-amen" hint="Separate with commas" className="col-span-2">
          <Controller control={control} name="amenities" render={({ field }) => (
            <TextInput id="h-amen" defaultValue={(field.value ?? []).join(', ')} onBlur={e => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
          )} />
        </Field>
        <Field label="Address" htmlFor="h-addr" className="col-span-2"><Textarea id="h-addr" rows={2} {...register('address')} /></Field>
        <Field label="Notes" htmlFor="h-notes" className="col-span-2" hint="Internal only — lift, veg kitchen, parking for buses…"><Textarea id="h-notes" rows={2} {...register('notes')} /></Field>
      </div>
    </FormShell>
  );
}
