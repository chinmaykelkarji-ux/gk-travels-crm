import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Field, TextInput, Select, Textarea, FormShell, useServerFieldErrors } from '@/design-system';
import { VendorInput, VendorKind, VENDOR_KIND_LABEL, type VendorInput as VendorInputT } from '@/shared/contracts/masters';
import type { ApiError } from '@/lib/api';
import type { Vendor } from '../api';

interface Props { initial?: Vendor; canEditBank: boolean; submitting: boolean; error?: ApiError | null; onSubmit: (v: VendorInputT) => void; onCancel: () => void }

const FIELDS = ['name', 'kind', 'phone', 'email', 'gstNumber', 'pan', 'city', 'state', 'creditDays', 'bankDetails.ifsc'] as const;

export function VendorForm({ initial, canEditBank, submitting, error, onSubmit, onCancel }: Props) {
  const { register, handleSubmit, setError, setValue, watch, formState: { errors } } = useForm<VendorInputT>({
    resolver: zodResolver(VendorInput),
    defaultValues: {
      name: initial?.name ?? '', kind: initial?.kind ?? 'OTHER', companyName: initial?.companyName ?? null, contactPerson: initial?.contactPerson ?? null,
      phone: initial?.phone ?? '', whatsapp: initial?.whatsapp ?? null, email: initial?.email ?? null, city: initial?.city ?? null, state: initial?.state ?? null,
      address: initial?.address ?? null, gstNumber: initial?.gstNumber ?? null, pan: initial?.pan ?? null, destinations: initial?.destinations ?? [],
      paymentTerms: initial?.paymentTerms ?? null, creditDays: initial?.creditDays ?? null, notes: initial?.notes ?? null, isActive: initial?.isActive ?? true, force: false,
      bankDetails: canEditBank ? (initial?.bankDetails ?? {}) : undefined,
    },
  });
  useServerFieldErrors(error, setError, FIELDS);
  const force = watch('force');

  return (
    <FormShell onSubmit={handleSubmit(onSubmit)} error={error} submitting={submitting} onCancel={onCancel} submitLabel={initial ? 'Save vendor' : 'Add vendor'}
      force={initial ? undefined : { checked: !!force, onChange: v => setValue('force', v) }}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="v-name" required error={errors.name?.message} className="col-span-2"><TextInput id="v-name" invalid={!!errors.name} {...register('name')} /></Field>
        <Field label="Kind" htmlFor="v-kind" error={errors.kind?.message}>
          <Select id="v-kind" {...register('kind')}>{VendorKind.options.map(k => <option key={k} value={k}>{VENDOR_KIND_LABEL[k]}</option>)}</Select>
        </Field>
        <Field label="Contact person" htmlFor="v-contact"><TextInput id="v-contact" placeholder="Shri …" {...register('contactPerson')} /></Field>
        <Field label="Phone" htmlFor="v-phone" required error={errors.phone?.message}><TextInput id="v-phone" inputMode="tel" invalid={!!errors.phone} {...register('phone')} /></Field>
        <Field label="WhatsApp" htmlFor="v-wa"><TextInput id="v-wa" inputMode="tel" {...register('whatsapp')} /></Field>
        <Field label="Email" htmlFor="v-email" error={errors.email?.message}><TextInput id="v-email" type="email" {...register('email')} /></Field>
        <Field label="Company / legal name" htmlFor="v-company"><TextInput id="v-company" {...register('companyName')} /></Field>
        <Field label="City" htmlFor="v-city"><TextInput id="v-city" {...register('city')} /></Field>
        <Field label="State" htmlFor="v-state"><TextInput id="v-state" {...register('state')} /></Field>
        <Field label="GSTIN" htmlFor="v-gst" error={errors.gstNumber?.message}><TextInput id="v-gst" className="uppercase" maxLength={15} {...register('gstNumber')} /></Field>
        <Field label="Credit days" htmlFor="v-credit" error={errors.creditDays?.message}><TextInput id="v-credit" inputMode="numeric" {...register('creditDays')} /></Field>
        <Field label="Payment terms" htmlFor="v-terms" className="col-span-2"><TextInput id="v-terms" placeholder="e.g. 50% advance, balance before check-in" {...register('paymentTerms')} /></Field>
        <Field label="Address" htmlFor="v-address" className="col-span-2"><Textarea id="v-address" rows={2} {...register('address')} /></Field>
      </div>
      {canEditBank && (
        <fieldset className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          <legend className="text-xs font-medium text-slate-600 mb-2">Bank details (visible to accounts only)</legend>
          <Field label="PAN" htmlFor="v-pan" error={errors.pan?.message}><TextInput id="v-pan" className="uppercase" maxLength={10} {...register('pan')} /></Field>
          <Field label="Account holder" htmlFor="v-holder"><TextInput id="v-holder" {...register('bankDetails.accountHolder')} /></Field>
          <Field label="Account number" htmlFor="v-acct"><TextInput id="v-acct" inputMode="numeric" {...register('bankDetails.accountNo')} /></Field>
          <Field label="IFSC" htmlFor="v-ifsc" error={errors.bankDetails?.ifsc?.message}><TextInput id="v-ifsc" className="uppercase" maxLength={11} {...register('bankDetails.ifsc')} /></Field>
          <Field label="Bank" htmlFor="v-bank"><TextInput id="v-bank" {...register('bankDetails.bankName')} /></Field>
          <Field label="UPI ID" htmlFor="v-upi"><TextInput id="v-upi" {...register('bankDetails.upiId')} /></Field>
        </fieldset>
      )}
      <Field label="Notes" htmlFor="v-notes"><Textarea id="v-notes" rows={2} {...register('notes')} /></Field>
    </FormShell>
  );
}
