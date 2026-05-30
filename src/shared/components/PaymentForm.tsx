import { useEffect, useState } from 'react';
import type { Payment } from '@/shared/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

const METHODS = ['Cash', 'Bank Transfer / NEFT', 'UPI', 'Cheque', 'Credit Card', 'Debit Card'];

interface PaymentFormProps {
  open:       boolean;
  onClose:    () => void;
  onSave:     (data: Partial<Payment>) => void;
  payment?:   Payment | null;   // null = new payment
  payType:    'customer' | 'supplier';
  loading?:   boolean;
}

export function PaymentForm({ open, onClose, onSave, payment, payType, loading }: PaymentFormProps) {
  const isSupplier = payType === 'supplier';

  const [amount,    setAmount]    = useState('');
  const [method,    setMethod]    = useState('Cash');
  const [date,      setDate]      = useState('');
  const [status,    setStatus]    = useState<string>('received');
  const [reference, setReference] = useState('');
  const [notes,     setNotes]     = useState('');
  const [name,      setName]      = useState('');   // customer/supplier name

  useEffect(() => {
    if (!open) return;
    if (payment) {
      setAmount(String(payment.amount ?? ''));
      setMethod(payment.method ?? 'Cash');
      setDate(payment.date ?? '');
      setStatus(payment.status ?? (isSupplier ? 'paid' : 'received'));
      setReference(payment.reference ?? '');
      setNotes(payment.notes ?? '');
      setName(payment.customer ?? '');
    } else {
      setAmount('');
      setMethod('Cash');
      setDate(new Date().toISOString().split('T')[0]);
      setStatus(isSupplier ? 'paid' : 'received');
      setReference('');
      setNotes('');
      setName('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { alert('Enter a valid amount'); return; }
    onSave({
      amount:    amt,
      method,
      date,
      status:    status as Payment['status'],
      reference: reference || undefined,
      notes:     notes || undefined,
      customer:  name || undefined,
    });
  }

  const isEdit = !!payment;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit' : 'Add'} {isSupplier ? 'Supplier' : 'Customer'} Payment
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {/* Customer / Supplier name */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-name">{isSupplier ? 'Supplier Name' : 'Customer Name'}</Label>
            <Input
              id="pay-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={isSupplier ? 'Supplier name' : 'Customer name'}
            />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" required>Amount (₹)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                className="pl-6"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Method + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Method</Label>
              <select
                id="pay-method"
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-status">Status</Label>
            <select
              id="pay-status"
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {isSupplier
                ? <><option value="paid">Paid</option><option value="pending">Pending</option></>
                : <><option value="received">Received</option><option value="pending">Pending</option></>
              }
            </select>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference / UTR</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="UTR / Cheque No. / UPI Ref"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes</Label>
            <Input
              id="pay-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional note"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Add Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
