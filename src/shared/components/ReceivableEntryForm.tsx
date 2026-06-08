import { useEffect, useState } from 'react';
import type { PaymentMode, Receivable, ReceivableEntry } from '@/shared/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { formatCurrency } from '@/shared/utils/format';

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'];

interface ReceivableEntryFormProps {
  open:        boolean;
  onClose:     () => void;
  onSave:      (data: Partial<ReceivableEntry>) => void;
  receivable:  Receivable | null;
  loading?:    boolean;
}

export function ReceivableEntryForm({ open, onClose, onSave, receivable, loading }: ReceivableEntryFormProps) {
  const [amount,      setAmount]      = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [reference,   setReference]   = useState('');
  const [notes,       setNotes]       = useState('');

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMode('Cash');
    setReference('');
    setNotes('');
  }, [open]);

  if (!receivable) return null;
  const balanceDue = receivable.balanceDue;

  function handleSave() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { alert('Enter a valid amount'); return; }
    if (amt > balanceDue) {
      const proceed = confirm(
        `This amount (${formatCurrency(amt)}) exceeds the pending balance (${formatCurrency(balanceDue)}). Record anyway?`
      );
      if (!proceed) return;
    }
    onSave({
      amount:      amt,
      paymentDate,
      paymentMode,
      reference:   reference.trim() || undefined,
      notes:       notes.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Record Payment — {receivable.customerName}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between text-xs">
            <span className="text-gray-500">Pending Balance</span>
            <span className="font-bold text-gray-900">{formatCurrency(balanceDue)}</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rce-amount" required>Amount Received (₹)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
              <Input
                id="rce-amount"
                type="number"
                min={0}
                step="0.01"
                className="pl-6"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Enter less than the full balance to record a partial payment.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rce-mode">Payment Mode</Label>
              <select
                id="rce-mode"
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rce-date">Payment Date</Label>
              <Input
                id="rce-date"
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rce-ref">Reference / UTR</Label>
            <Input
              id="rce-ref"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="UTR / Cheque No. / UPI Ref"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rce-notes">Notes</Label>
            <Input
              id="rce-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional note"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={handleSave}>
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
