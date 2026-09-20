import { useState } from 'react';
import { Field, Select, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { istToday } from '@/shared/calc/istTime';
import { ReceiptMode, RECEIPT_MODE_LABEL, type ReceiptKind } from '@/shared/contracts/receipts';
import { receiptsApi } from '../api';
import { useReceiptMutation } from '../hooks';

interface Props {
  /** Whose money this is: a family's booking, or the tour as a whole. */
  contractId?: string | null;
  tripId?: string | null;
  customerId?: string | null;
  who?: string;
  onDone: () => void;
}

/** Records money received from (or refunded to) a customer. */
export function ReceiptForm({ contractId, tripId, customerId, who, onDone }: Props) {
  const [kind, setKind] = useState<ReceiptKind>('RECEIPT');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<string>('UPI');
  const [receivedAt, setReceivedAt] = useState(istToday());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const save = useReceiptMutation(() => receiptsApi.create({
    kind, contractId: contractId ?? null, tripId: tripId ?? null, customerId: customerId ?? null,
    amount: Number(amount), mode: mode as never, receivedAt, reference: reference || null, notes: notes || null,
  }));
  const err = save.error as ApiError | null;

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: r => { toast.success(kind === 'REFUND' ? 'Refund recorded' : 'Receipt recorded', `${r.id} · ₹${r.amount.toLocaleString('en-IN')}`); onDone(); } }); }}>
      {who && <p className="text-sm text-slate-600">{kind === 'REFUND' ? 'Refund to' : 'Money from'} <span className="font-medium text-slate-900">{who}</span></p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="This is" htmlFor="rc-kind">
          <Select id="rc-kind" value={kind} onChange={e => setKind(e.target.value as ReceiptKind)}>
            <option value="RECEIPT">Money received</option>
            <option value="REFUND">Refund paid back</option>
          </Select>
        </Field>
        <Field label="Amount (₹)" htmlFor="rc-amount" required error={err?.fields?.amount}>
          <TextInput id="rc-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="25000" />
        </Field>
        <Field label="How" htmlFor="rc-mode" required>
          <Select id="rc-mode" value={mode} onChange={e => setMode(e.target.value)}>
            {ReceiptMode.options.filter(m => m !== 'OTHER').map(m => <option key={m} value={m}>{RECEIPT_MODE_LABEL[m]}</option>)}
          </Select>
        </Field>
        <Field label="Date" htmlFor="rc-date" required error={err?.fields?.receivedAt}>
          <TextInput id="rc-date" type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} />
        </Field>
        <Field label={mode === 'CHEQUE' ? 'Cheque number' : 'Reference'} htmlFor="rc-ref" required={mode === 'CHEQUE'} error={err?.fields?.reference} className="sm:col-span-2"
          hint={mode === 'CHEQUE' ? undefined : 'UPI reference, NEFT number or anything that helps find it later'}>
          <TextInput id="rc-ref" value={reference} onChange={e => setReference(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="rc-notes" className="sm:col-span-2"><Textarea id="rc-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
      {err && !err.fields && <p className="text-sm text-red-600">{err.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!(Number(amount) > 0)}>{kind === 'REFUND' ? 'Record refund' : 'Record receipt'}</Button>
      </div>
    </form>
  );
}
