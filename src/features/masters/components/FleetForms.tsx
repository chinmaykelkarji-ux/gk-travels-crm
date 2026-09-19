import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Field, TextInput, Select, Textarea, FormShell, useServerFieldErrors } from '@/design-system';
import { VehicleInput, DriverInput, VEHICLE_TYPES, type VehicleInput as VehicleInputT, type DriverInput as DriverInputT } from '@/shared/contracts/masters';
import type { ApiError } from '@/lib/api';
import type { Driver, Vehicle } from '../api';
import { useDrivers } from '../hooks';
import { VendorSelect } from './VendorSelect';

interface VehicleProps { initial?: Vehicle; submitting: boolean; error?: ApiError | null; onSubmit: (v: VehicleInputT) => void; onCancel: () => void }
const VEHICLE_FIELDS = ['registrationNo', 'type', 'seats', 'ownership', 'vendorId', 'defaultDriverId', 'insuranceExpiry', 'permitExpiry', 'fitnessExpiry', 'pucExpiry'] as const;

export function VehicleForm({ initial, submitting, error, onSubmit, onCancel }: VehicleProps) {
  const drivers = useDrivers({ pageSize: 200 });
  const { register, handleSubmit, setError, control, watch, formState: { errors } } = useForm<VehicleInputT>({
    resolver: zodResolver(VehicleInput),
    defaultValues: {
      registrationNo: initial?.registrationNo ?? '', type: initial?.type ?? '', make: initial?.make ?? null, model: initial?.model ?? null, seats: initial?.seats ?? 4,
      ownership: initial?.ownership ?? 'OWNED', vendorId: initial?.vendorId ?? null, defaultDriverId: initial?.defaultDriverId ?? null,
      insuranceExpiry: initial?.insuranceExpiry ?? null, permitExpiry: initial?.permitExpiry ?? null, fitnessExpiry: initial?.fitnessExpiry ?? null, pucExpiry: initial?.pucExpiry ?? null,
      notes: initial?.notes ?? null, isActive: initial?.isActive ?? true,
    },
  });
  useServerFieldErrors(error, setError, VEHICLE_FIELDS);
  const ownership = watch('ownership');
  return (
    <FormShell onSubmit={handleSubmit(onSubmit)} error={error} submitting={submitting} onCancel={onCancel} submitLabel={initial ? 'Save vehicle' : 'Add vehicle'}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Registration no." htmlFor="vh-reg" required error={errors.registrationNo?.message}><TextInput id="vh-reg" className="uppercase" placeholder="KA 22 AB 1234" invalid={!!errors.registrationNo} {...register('registrationNo')} /></Field>
        <Field label="Type" htmlFor="vh-type" required error={errors.type?.message}>
          <TextInput id="vh-type" list="vehicle-types" invalid={!!errors.type} {...register('type')} />
          <datalist id="vehicle-types">{VEHICLE_TYPES.map(t => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Seats" htmlFor="vh-seats" required error={errors.seats?.message}><TextInput id="vh-seats" inputMode="numeric" {...register('seats')} /></Field>
        <Field label="Make / model" htmlFor="vh-make"><div className="flex gap-2"><TextInput id="vh-make" placeholder="Force" {...register('make')} /><TextInput aria-label="Model" placeholder="Traveller" {...register('model')} /></div></Field>
        <Field label="Ownership" htmlFor="vh-own"><Select id="vh-own" {...register('ownership')}><option value="OWNED">Own fleet</option><option value="VENDOR">Vendor / cab owner</option></Select></Field>
        <Field label="Owner vendor" htmlFor="vh-vendor" required={ownership === 'VENDOR'} error={errors.vendorId?.message}>
          <Controller control={control} name="vendorId" render={({ field }) => <VendorSelect id="vh-vendor" kinds={['TRANSPORT']} value={field.value} onChange={field.onChange} invalid={!!errors.vendorId} />} />
        </Field>
        <Field label="Usual driver" htmlFor="vh-driver" className="col-span-2">
          <Select id="vh-driver" {...register('defaultDriverId')}><option value="">—</option>{(drivers.data?.items ?? []).map(d => <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>)}</Select>
        </Field>
        <Field label="Insurance valid till" htmlFor="vh-ins" error={errors.insuranceExpiry?.message}><TextInput id="vh-ins" type="date" {...register('insuranceExpiry')} /></Field>
        <Field label="Permit valid till" htmlFor="vh-permit" error={errors.permitExpiry?.message}><TextInput id="vh-permit" type="date" {...register('permitExpiry')} /></Field>
        <Field label="Fitness (FC) valid till" htmlFor="vh-fc"><TextInput id="vh-fc" type="date" {...register('fitnessExpiry')} /></Field>
        <Field label="PUC valid till" htmlFor="vh-puc"><TextInput id="vh-puc" type="date" {...register('pucExpiry')} /></Field>
        <Field label="Notes" htmlFor="vh-notes" className="col-span-2"><Textarea id="vh-notes" rows={2} {...register('notes')} /></Field>
      </div>
    </FormShell>
  );
}

interface DriverProps { initial?: Driver; submitting: boolean; error?: ApiError | null; onSubmit: (v: DriverInputT) => void; onCancel: () => void }
const DRIVER_FIELDS = ['name', 'phone', 'licenceExpiry', 'vendorId'] as const;

export function DriverForm({ initial, submitting, error, onSubmit, onCancel }: DriverProps) {
  const { register, handleSubmit, setError, control, setValue, watch, formState: { errors } } = useForm<DriverInputT>({
    resolver: zodResolver(DriverInput),
    defaultValues: {
      name: initial?.name ?? '', phone: initial?.phone ?? '', altPhone: initial?.altPhone ?? null, vendorId: initial?.vendorId ?? null, licenceNo: initial?.licenceNo ?? null,
      licenceExpiry: initial?.licenceExpiry ?? null, languages: initial?.languages ?? [], address: initial?.address ?? null, emergencyContact: initial?.emergencyContact ?? null,
      notes: initial?.notes ?? null, isActive: initial?.isActive ?? true, force: false,
    },
  });
  useServerFieldErrors(error, setError, DRIVER_FIELDS);
  const force = watch('force');
  return (
    <FormShell onSubmit={handleSubmit(onSubmit)} error={error} submitting={submitting} onCancel={onCancel} submitLabel={initial ? 'Save driver' : 'Add driver'}
      force={initial ? undefined : { checked: !!force, onChange: v => setValue('force', v) }}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="dr-name" required error={errors.name?.message} className="col-span-2"><TextInput id="dr-name" placeholder="Shri …" invalid={!!errors.name} {...register('name')} /></Field>
        <Field label="Mobile" htmlFor="dr-phone" required error={errors.phone?.message}><TextInput id="dr-phone" inputMode="tel" invalid={!!errors.phone} {...register('phone')} /></Field>
        <Field label="Alternate" htmlFor="dr-alt"><TextInput id="dr-alt" inputMode="tel" {...register('altPhone')} /></Field>
        <Field label="Licence no." htmlFor="dr-lic"><TextInput id="dr-lic" className="uppercase" {...register('licenceNo')} /></Field>
        <Field label="Licence valid till" htmlFor="dr-licexp" error={errors.licenceExpiry?.message}><TextInput id="dr-licexp" type="date" {...register('licenceExpiry')} /></Field>
        <Field label="Works for" htmlFor="dr-vendor" hint="Empty = own staff">
          <Controller control={control} name="vendorId" render={({ field }) => <VendorSelect id="dr-vendor" kinds={['TRANSPORT']} value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Languages" htmlFor="dr-lang" hint="Separate with commas">
          <Controller control={control} name="languages" render={({ field }) => (
            <TextInput id="dr-lang" defaultValue={(field.value ?? []).join(', ')} placeholder="Kannada, Marathi, Hindi" onBlur={e => field.onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
          )} />
        </Field>
        <Field label="Emergency contact" htmlFor="dr-emerg" className="col-span-2"><TextInput id="dr-emerg" {...register('emergencyContact')} /></Field>
        <Field label="Notes" htmlFor="dr-notes" className="col-span-2"><Textarea id="dr-notes" rows={2} {...register('notes')} /></Field>
      </div>
    </FormShell>
  );
}
