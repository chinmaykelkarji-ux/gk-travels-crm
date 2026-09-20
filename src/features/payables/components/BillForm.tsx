import { useState } from 'react';
import { Field, Money, Select, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { VendorSelect } from '@/features/masters/components/VendorSelect';
import { istToday, addDays } from '@/shared/calc/istTime';
import { BillCategory, BILL_CATEGORY_LABEL, type BillCategory as Cat } from '@/shared/contracts/payables';
import { payablesApi } from '../api';
import { usePayableMutation } from '../hooks';

/** Records a bill a supplier has sent. */
export function BillForm({ tripId, onDone }: { tripId?: string | null; onDone: () => void }) {
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(istToday());
  const [dueDate, setDueDate] = useState(addDays(istToday(), 15));
  const [category, setCategory] = useState<Cat>('HOTEL');
  const [amount, setAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const save = usePayableMutation(() => payablesApi.createBill({
    vendorId: vendorId!, billNumber, billDate, dueDate: dueDate || null, category, amount: Number(amount), gstAmount: Number(gstAmount || 0),
    tripId: tripId ?? null, contractId: null, description: description || null, notes: notes || null,
  }));
  const err = save.error as ApiError | null;
  const net = Number(amount || 0) - Number(gstAmount || 0);

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: b => { toast.success('Bill recorded', `${b.id} · ${b.vendor?.name}`); onDone(); } }); }}>
      <Field label="Supplier" htmlFor="b-vendor" required error={err?.fields?.vendorId}>
        <VendorSelect id="b-vendor" value={vendorId} onChange={setVendorId} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Their bill number" htmlFor="b-no" required error={err?.fields?.billNumber}><TextInput id="b-no" value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="GV/2026/41" /></Field>
        <Field label="What it is for" htmlFor="b-cat" required>
          <Select id="b-cat" value={category} onChange={e => setCategory(e.target.value as Cat)}>
            {BillCategory.options.map(c => <option key={c} value={c}>{BILL_CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Bill date" htmlFor="b-date" required error={err?.fields?.billDate}><TextInput id="b-date" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} /></Field>
        <Field label="Pay by" htmlFor="b-due" error={err?.fields?.dueDate}><TextInput id="b-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
        <Field label="Bill total (₹)" htmlFor="b-amt" required error={err?.fields?.amount} hint="Including GST"><TextInput id="b-amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="GST in it (₹)" htmlFor="b-gst" error={err?.fields?.gstAmount} hint="Held as input credit — verify with CA"><TextInput id="b-gst" inputMode="decimal" value={gstAmount} onChange={e => setGstAmount(e.target.value)} /></Field>
        <Field label="Description" htmlFor="b-desc" className="sm:col-span-2"><TextInput id="b-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="20 rooms, 3 nights" /></Field>
        <Field label="Notes" htmlFor="b-notes" className="sm:col-span-2"><Textarea id="b-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
      <p className="text-sm text-slate-600">Cost booked: <Money value={net > 0 ? net : 0} paise />{Number(gstAmount) > 0 && <> · GST held separately <Money value={Number(gstAmount)} paise /></>}</p>
      {err && !err.fields && <p className="text-sm text-red-600">{err.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!vendorId || !billNumber || !(Number(amount) > 0)}>Record bill</Button>
      </div>
    </form>
  );
}
