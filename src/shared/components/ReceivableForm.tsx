import { useEffect, useState } from 'react';
import type { Receivable } from '@/shared/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface ReceivableFormProps {
  open:       boolean;
  onClose:    () => void;
  onSave:     (data: Partial<Receivable>) => void;
  receivable?: Receivable | null;   // null = new receivable
  loading?:   boolean;
  // Pre-fill context when launched from Trip/Booking/Customer views
  defaults?: {
    customerId?:   string;
    customerName?: string;
    bookingId?:    string;
    tripId?:       string;
    invoiceAmount?: number;
    description?:  string;
  };
}

export function ReceivableForm({ open, onClose, onSave, receivable, loading, defaults }: ReceivableFormProps) {
  const [customerName,  setCustomerName]  = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [description,   setDescription]   = useState('');
  const [dueDate,       setDueDate]       = useState('');
  const [notes,         setNotes]         = useState('');

  useEffect(() => {
    if (!open) return;
    if (receivable) {
      setCustomerName(receivable.customerName ?? '');
      setInvoiceAmount(String(receivable.invoiceAmount ?? ''));
      setDescription(receivable.description ?? '');
      setDueDate(receivable.dueDate ?? '');
      setNotes(receivable.notes ?? '');
    } else {
      setCustomerName(defaults?.customerName ?? '');
      setInvoiceAmount(defaults?.invoiceAmount ? String(defaults.invoiceAmount) : '');
      setDescription(defaults?.description ?? '');
      setDueDate('');
      setNotes('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    const name = customerName.trim();
    if (!name) { alert('Customer name is required'); return; }

    const amount = parseFloat(invoiceAmount);
    if (!amount || amount <= 0) { alert('Enter a valid invoice amount'); return; }

    onSave({
      customerId:    defaults?.customerId    ?? receivable?.customerId,
      customerName:  name,
      bookingId:     defaults?.bookingId     ?? receivable?.bookingId,
      tripId:        defaults?.tripId        ?? receivable?.tripId,
      invoiceAmount: amount,
      description:   description.trim(),
      dueDate:       dueDate || undefined,
      notes:         notes.trim(),
    });
  }

  const isEdit = !!receivable;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Receivable' : 'Add Receivable'}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="rec-customer" required>Customer Name</Label>
            <Input
              id="rec-customer"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-amount" required>Invoice Amount (₹)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
              <Input
                id="rec-amount"
                type="number"
                min={0}
                step="0.01"
                className="pl-6"
                value={invoiceAmount}
                onChange={e => setInvoiceAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-desc">Description</Label>
            <Input
              id="rec-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What this invoice is for"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-due">Due Date</Label>
            <Input
              id="rec-due"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-notes">Notes</Label>
            <Input
              id="rec-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional note"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Add Receivable'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
