import { useState } from 'react';
import { Field, Money, Select, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { VendorSelect } from '@/features/masters/components/VendorSelect';
import { istToday } from '@/shared/calc/istTime';
import { PaymentMode } from '@/shared/contracts/payables';
import { RECEIPT_MODE_LABEL } from '@/shared/contracts/receipts';
import { payablesApi, type VendorBill } from '../api';
import { useBills, usePayableMutation } from '../hooks';

/** Pays a supplier: against one of their open bills, or as an advance. */
export function PayForm({ bill, onDone }: { bill?: VendorBill; onDone: () => void }) {
  const [vendorId, setVendorId] = useState<string | null>(bill?.vendorId ?? null);
  const [billId, setBillId] = useState(bill?.id ?? '');
  const [amount, setAmount] = useState(bill ? String(bill.outstanding) : '');
  const [mode, setMode] = useState('BANK_TRANSFER');
  const [paidAt, setPaidAt] = useState(istToday());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const open = useBills({ vendorId: vendorId ?? undefined, status: 'OPEN', pageSize: 100 }, !!vendorId && !bill);
  const save = usePayableMutation(() => payablesApi.pay({
    vendorId: vendorId!, billId: billId || null, tripId: null, amount: Number(amount), mode: mode as never, paidAt, reference: reference || null, notes: notes || null,
  }));
  const err = save.error as ApiError | null;
  const chosen = bill ?? open.data?.items.find(b => b.id === billId);

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: p => { toast.success('Payment recorded', `${p.id} · ₹${p.amount.toLocaleString('en-IN')}`); onDone(); } }); }}>
      {bill ? (
        <p className="text-sm text-slate-600">Paying <span className="font-medium text-slate-900">{bill.vendor?.name}</span> for bill {bill.billNumber} — <Money value={bill.outstanding} paise /> left</p>
      ) : (
        <>
          <Field label="Supplier" htmlFor="p-vendor" required error={err?.fields?.vendorId}><VendorSelect id="p-vendor" value={vendorId} onChange={v => { setVendorId(v); setBillId(''); }} /></Field>
          <Field label="Against which bill" htmlFor="p-bill" hint="Leave as an advance if the bill has not arrived yet">
            <Select id="p-bill" value={billId} onChange={e => { setBillId(e.target.value); const b = open.data?.items.find(x => x.id === e.target.value); if (b) setAmount(String(b.outstanding)); }} disabled={!vendorId}>
              <option value="">Advance (no bill yet)</option>
              {(open.data?.items ?? []).map(b => <option key={b.id} value={b.id}>{b.billNumber} · ₹{b.outstanding.toLocaleString('en-IN')} left</option>)}
            </Select>
          </Field>
        </>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="p-amt" required error={err?.fields?.amount}><TextInput id="p-amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="How" htmlFor="p-mode" required>
          <Select id="p-mode" value={mode} onChange={e => setMode(e.target.value)}>
            {PaymentMode.options.filter(m => m !== 'OTHER').map(m => <option key={m} value={m}>{RECEIPT_MODE_LABEL[m as keyof typeof RECEIPT_MODE_LABEL]}</option>)}
          </Select>
        </Field>
        <Field label="Date" htmlFor="p-date" required error={err?.fields?.paidAt}><TextInput id="p-date" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} /></Field>
        <Field label={mode === 'CHEQUE' ? 'Cheque number' : 'Reference'} htmlFor="p-ref" required={mode === 'CHEQUE'} error={err?.fields?.reference}><TextInput id="p-ref" value={reference} onChange={e => setReference(e.target.value)} /></Field>
        <Field label="Notes" htmlFor="p-notes" className="sm:col-span-2"><Textarea id="p-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
      {chosen && Number(amount) > chosen.outstanding && <p className="text-sm text-amber-700">That is more than the <Money value={chosen.outstanding} paise /> left on this bill.</p>}
      {err && !err.fields && <p className="text-sm text-red-600">{err.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!vendorId || !(Number(amount) > 0)}>Record payment</Button>
      </div>
    </form>
  );
}
