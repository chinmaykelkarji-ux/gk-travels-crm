import { useEffect, useState } from 'react';
import type { VendorPayment } from '@/shared/types';
import { useStore } from '@/store';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { formatCurrency } from '@/shared/utils/format';
import { calcOutstandingAmount } from '@/shared/utils/finance';

interface VendorPaymentFormProps {
  open:          boolean;
  onClose:       () => void;
  onSubmit:      (data: Partial<VendorPayment>) => void;
  vendorId:      string;
  vendorName:    string;
  defaultValues?: Partial<VendorPayment> | null;
  loading?:      boolean;
}

export function VendorPaymentForm({
  open, onClose, onSubmit, vendorId, vendorName, defaultValues, loading,
}: VendorPaymentFormProps) {
  const trips = useStore(s => s.trips);

  const [tripId,      setTripId]      = useState('');
  const [description, setDescription] = useState('');
  const [totalCost,   setTotalCost]   = useState('');
  const [advancePaid, setAdvancePaid] = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [notes,       setNotes]       = useState('');
  const [error,       setError]       = useState('');

  const outstanding = calcOutstandingAmount(parseFloat(totalCost) || 0, parseFloat(advancePaid) || 0);

  useEffect(() => {
    if (!open) return;
    const d = defaultValues;
    setTripId(d?.tripId      ?? '');
    setDescription(d?.description ?? '');
    setTotalCost(String(d?.totalCost   ?? ''));
    setAdvancePaid(String(d?.advancePaid ?? ''));
    setDueDate(d?.dueDate ?? '');
    setNotes(d?.notes   ?? '');
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit() {
    const total   = parseFloat(totalCost);
    const advance = parseFloat(advancePaid) || 0;
    if (!total || total <= 0) { setError('Total cost must be greater than 0'); return; }

    const selectedTrip = trips.find(t => t.id === tripId);
    const due = calcOutstandingAmount(total, advance);
    onSubmit({
      vendorId,
      vendorName,
      tripId:      tripId || undefined,
      tripName:    selectedTrip ? `${selectedTrip.customer} → ${selectedTrip.destination}` : undefined,
      description: description || undefined,
      totalCost:   total,
      advancePaid: advance,
      outstanding: due,
      isPaid:      due === 0,
      dueDate:     dueDate || undefined,
      notes:       notes   || undefined,
    });
  }

  const isEdit = !!defaultValues?.id;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Payment' : 'Record Vendor Cost'}
            <span className="ml-2 text-sm font-normal text-gray-500">— {vendorName}</span>
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          {/* Link to trip */}
          <div className="space-y-1.5">
            <Label htmlFor="vp-trip">Link to Trip</Label>
            <select
              id="vp-trip"
              value={tripId}
              onChange={e => setTripId(e.target.value)}
              className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
            >
              <option value="">— Standalone (no trip) —</option>
              {trips.filter(t => !['cancelled', 'completed'].includes(t.status)).map(t => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.customer} → {t.destination}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="vp-desc">Description</Label>
            <Input id="vp-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 3 nights Deluxe Room, Airport transfer x4" />
          </div>

          {/* Costs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vp-total" required>Total Cost (₹)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <Input id="vp-total" type="number" min={0} className="pl-6" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vp-advance">Advance Paid (₹)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <Input id="vp-advance" type="number" min={0} className="pl-6" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>

          {/* Outstanding preview */}
          {(parseFloat(totalCost) || 0) > 0 && (
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold ${
              outstanding > 0 ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            }`}>
              <span>Outstanding Balance</span>
              <span>{outstanding > 0 ? formatCurrency(outstanding) : 'Fully Paid ✓'}</span>
            </div>
          )}

          {/* Due date + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vp-due">Payment Due Date</Label>
              <Input id="vp-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vp-notes">Notes</Label>
              <Input id="vp-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Record Cost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
