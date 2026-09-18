import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TravellerCreate, type TravellerCreate as TravellerCreateT } from '@/shared/contracts/travellers';
import { Field, TextInput, Select, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { ApiError } from '@/lib/api';
import type { TravellerRecord } from '../api';

type FormValues = TravellerCreateT;

interface Props {
  initial?:     Partial<TravellerRecord>;
  customerId?:  string | null;
  submitting:   boolean;
  error?:       ApiError | null;
  onSubmit:     (values: FormValues) => void;
  onCancel:     () => void;
  submitLabel?: string;
}

function toValues(t?: Partial<TravellerRecord>, customerId?: string | null): FormValues {
  return {
    customerId: t?.customerId ?? customerId ?? null, title: (t?.title as FormValues['title']) ?? null, firstName: t?.firstName ?? '', lastName: t?.lastName ?? '',
    displayName: t?.displayName ?? null, dateOfBirth: t?.dateOfBirth ?? null, gender: (t?.gender as FormValues['gender']) ?? null, nationality: t?.nationality ?? 'Indian',
    relationToCustomer: t?.relationToCustomer ?? null, phone: t?.phone ?? null, email: t?.email ?? null,
    passportNumber: t?.passportNumber ?? null, passportIssueDate: t?.passportIssueDate ?? null, passportExpiry: t?.passportExpiry ?? null, placeOfIssue: t?.placeOfIssue ?? null,
    govtIdType: (t?.govtIdType as FormValues['govtIdType']) ?? null, govtIdNumber: t?.govtIdNumber ?? null,
    visaStatus: t?.visaStatus ?? null, visaExpiry: t?.visaExpiry ?? null, visaCountry: t?.visaCountry ?? null, visaType: t?.visaType ?? null,
    frequentFlyerNumber: t?.frequentFlyerNumber ?? null, mealPreference: t?.mealPreference ?? null, seatPreference: t?.seatPreference ?? null,
    emergencyContactName: t?.emergencyContactName ?? null, emergencyContactPhone: t?.emergencyContactPhone ?? null, emergencyRelation: t?.emergencyRelation ?? null,
    notes: t?.notes ?? null, force: false,
  };
}

export function TravellerForm({ initial, customerId, submitting, error, onSubmit, onCancel, submitLabel = 'Save traveller' }: Props) {
  const defaults = useMemo(() => toValues(initial, customerId), [initial, customerId]);
  const { register, handleSubmit, setError, setValue, watch, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(TravellerCreate), defaultValues: defaults });
  const force = watch('force');

  useEffect(() => {
    if (!error?.fields) return;
    for (const [k, msg] of Object.entries(error.fields)) if (k in defaults) setError(k as keyof FormValues, { message: msg });
  }, [error, defaults, setError]);

  const isConflict = error?.code === 'CONFLICT';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {error && !error.fields && !isConflict && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error.message}</div>}
      {isConflict && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
          <div className="text-amber-900">{error?.message}</div>
          {!initial?.id && <label className="flex items-center gap-2 text-amber-900"><input type="checkbox" checked={!!force} onChange={e => setValue('force', e.target.checked)} />Save anyway</label>}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Title" htmlFor="title">
          <Select id="title" {...register('title')}><option value="">—</option>{['Mr', 'Mrs', 'Ms', 'Miss', 'Master', 'Dr'].map(t => <option key={t}>{t}</option>)}</Select>
        </Field>
        <Field label="First name" htmlFor="firstName" required error={errors.firstName?.message} className="col-span-2 sm:col-span-2"><TextInput id="firstName" invalid={!!errors.firstName} {...register('firstName')} /></Field>
        <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}><TextInput id="lastName" {...register('lastName')} /></Field>
        <Field label="Name as on passport" htmlFor="displayName" hint="Optional; used on tickets" className="col-span-2 sm:col-span-4"><TextInput id="displayName" className="uppercase" {...register('displayName')} /></Field>
        <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message} className="col-span-2"><TextInput id="dateOfBirth" type="date" invalid={!!errors.dateOfBirth} {...register('dateOfBirth')} /></Field>
        <Field label="Gender" htmlFor="gender"><Select id="gender" {...register('gender')}><option value="">—</option><option value="M">Male</option><option value="F">Female</option><option value="X">Other</option></Select></Field>
        <Field label="Nationality" htmlFor="nationality"><TextInput id="nationality" {...register('nationality')} /></Field>
        <Field label="Relation to customer" htmlFor="relationToCustomer" className="col-span-2"><TextInput id="relationToCustomer" placeholder="Self, spouse, son, colleague…" {...register('relationToCustomer')} /></Field>
        <Field label="Phone" htmlFor="tphone"><TextInput id="tphone" inputMode="tel" {...register('phone')} /></Field>
        <Field label="Email" htmlFor="temail" error={errors.email?.message}><TextInput id="temail" type="email" {...register('email')} /></Field>
      </div>

      <fieldset className="border border-slate-200 rounded-md p-3">
        <legend className="text-xs font-medium text-slate-600 px-1">Passport</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Number" htmlFor="passportNumber" error={errors.passportNumber?.message}><TextInput id="passportNumber" className="uppercase" {...register('passportNumber')} /></Field>
          <Field label="Issued" htmlFor="passportIssueDate"><TextInput id="passportIssueDate" type="date" {...register('passportIssueDate')} /></Field>
          <Field label="Expires" htmlFor="passportExpiry" error={errors.passportExpiry?.message}><TextInput id="passportExpiry" type="date" invalid={!!errors.passportExpiry} {...register('passportExpiry')} /></Field>
          <Field label="Place of issue" htmlFor="placeOfIssue"><TextInput id="placeOfIssue" {...register('placeOfIssue')} /></Field>
        </div>
      </fieldset>

      <fieldset className="border border-slate-200 rounded-md p-3">
        <legend className="text-xs font-medium text-slate-600 px-1">Domestic ID &amp; visa</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="ID type" htmlFor="govtIdType" hint="Aadhaar is not stored">
            <Select id="govtIdType" {...register('govtIdType')}><option value="">—</option><option value="PAN">PAN</option><option value="VOTER_ID">Voter ID</option><option value="DRIVING_LICENCE">Driving licence</option><option value="PASSPORT">Passport</option><option value="OTHER">Other</option></Select>
          </Field>
          <Field label="ID number" htmlFor="govtIdNumber" error={errors.govtIdNumber?.message}><TextInput id="govtIdNumber" className="uppercase" {...register('govtIdNumber')} /></Field>
          <Field label="Visa status" htmlFor="visaStatus"><Select id="visaStatus" {...register('visaStatus')}><option value="">—</option>{['not_required', 'pending', 'applied', 'approved', 'rejected'].map(v => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}</Select></Field>
          <Field label="Visa expiry" htmlFor="visaExpiry"><TextInput id="visaExpiry" type="date" {...register('visaExpiry')} /></Field>
          <Field label="Visa country" htmlFor="visaCountry" className="col-span-2"><TextInput id="visaCountry" {...register('visaCountry')} /></Field>
          <Field label="Visa type" htmlFor="visaType" className="col-span-2"><TextInput id="visaType" placeholder="Tourist, e-visa, VoA…" {...register('visaType')} /></Field>
        </div>
      </fieldset>

      <details>
        <summary className="text-xs font-medium text-slate-600 cursor-pointer select-none">Preferences &amp; emergency contact</summary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
          <Field label="Seat" htmlFor="seatPreference"><TextInput id="seatPreference" placeholder="Window / Aisle" {...register('seatPreference')} /></Field>
          <Field label="Meal" htmlFor="mealPreference"><TextInput id="mealPreference" placeholder="Veg / Jain / Non-veg" {...register('mealPreference')} /></Field>
          <Field label="Frequent flyer" htmlFor="frequentFlyerNumber" className="col-span-2"><TextInput id="frequentFlyerNumber" {...register('frequentFlyerNumber')} /></Field>
          <Field label="Emergency contact" htmlFor="emergencyContactName" className="col-span-2"><TextInput id="emergencyContactName" {...register('emergencyContactName')} /></Field>
          <Field label="Contact phone" htmlFor="emergencyContactPhone"><TextInput id="emergencyContactPhone" inputMode="tel" {...register('emergencyContactPhone')} /></Field>
          <Field label="Relation" htmlFor="emergencyRelation"><TextInput id="emergencyRelation" {...register('emergencyRelation')} /></Field>
        </div>
      </details>

      <Field label="Notes" htmlFor="tnotes"><Textarea id="tnotes" rows={2} {...register('notes')} /></Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={submitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
