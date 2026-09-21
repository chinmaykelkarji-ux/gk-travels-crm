import { useState } from 'react';
import { Field, Select, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/backend/auth/AuthContext';
import { AssigneeSelect } from '@/features/sales/components/common';
import { VendorSelect } from '@/features/masters/components/VendorSelect';
import { istToday } from '@/shared/calc/istTime';
import { ExpenseCategory, EXPENSE_CATEGORY_LABEL, PaidBy, PAID_BY_LABEL, type ExpenseCategory as Cat, type PaidBy as Payer } from '@/shared/contracts/expenses';
import { expensesApi } from '../api';
import { useExpenseMutation } from '../hooks';

/** Records money spent: fuel, tolls, food on the road, tips, office costs. */
export function ExpenseForm({ tripId, onDone }: { tripId?: string | null; onDone: () => void }) {
  const { user } = useAuth();
  const [date, setDate] = useState(istToday());
  const [category, setCategory] = useState<Cat>(tripId ? 'TRIP_TRANSPORT' : 'OFFICE');
  const [amount, setAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('');
  const [paidBy, setPaidBy] = useState<Payer>('CASH');
  const [paidByUserId, setPaidByUserId] = useState<string | null>(user?.id ?? null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const save = useExpenseMutation(() => expensesApi.create({
    date, category, amount: Number(amount), gstAmount: Number(gstAmount || 0), paidBy,
    paidByUserId: paidBy === 'STAFF' ? paidByUserId : null, tripId: tripId ?? null, contractId: null, vendorId,
    description, notes: notes || null, documentId: null,
  }));
  const err = save.error as ApiError | null;

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: x => { toast.success('Expense recorded', `${x.id} · ₹${x.amount.toLocaleString('en-IN')}`); onDone(); } }); }}>
      <Field label="What was it for" htmlFor="e-desc" required error={err?.fields?.description}>
        <TextInput id="e-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Diesel and tolls to Varanasi" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Kind of spending" htmlFor="e-cat" required>
          <Select id="e-cat" value={category} onChange={e => setCategory(e.target.value as Cat)}>
            {ExpenseCategory.options.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Date" htmlFor="e-date" required error={err?.fields?.date}><TextInput id="e-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Amount (₹)" htmlFor="e-amt" required error={err?.fields?.amount}><TextInput id="e-amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="GST in it (₹)" htmlFor="e-gst" error={err?.fields?.gstAmount} hint="Only if the bill shows GST"><TextInput id="e-gst" inputMode="decimal" value={gstAmount} onChange={e => setGstAmount(e.target.value)} /></Field>
        <Field label="Paid with" htmlFor="e-paid" required>
          <Select id="e-paid" value={paidBy} onChange={e => setPaidBy(e.target.value as Payer)}>
            {PaidBy.options.map(m => <option key={m} value={m}>{PAID_BY_LABEL[m]}</option>)}
          </Select>
        </Field>
        {paidBy === 'STAFF'
          ? <AssigneeSelect id="e-payer" label="Who paid" value={paidByUserId} onChange={setPaidByUserId} />
          : <Field label="Supplier (optional)" htmlFor="e-vendor"><VendorSelect id="e-vendor" value={vendorId} onChange={setVendorId} /></Field>}
        <Field label="Notes" htmlFor="e-notes" className="sm:col-span-2"><Textarea id="e-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
      {paidBy === 'STAFF' && <p className="text-xs text-amber-700">This will be owed back to them until it is settled from Supplier money → staff reimbursements.</p>}
      {err && !err.fields && <p className="text-sm text-red-600">{err.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!(Number(amount) > 0) || description.trim().length < 2}>Record expense</Button>
      </div>
    </form>
  );
}
