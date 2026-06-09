/**
 * RecordReceiptForm — unified receipt entry point.
 *
 * Lets staff record a customer payment from one place:
 *   1. Select customer
 *   2. Select trip reference (optional)
 *   3. Enter amount + payment details
 *
 * Allocation logic:
 *   - With trip: finds the oldest unpaid receivable for that trip, creates one if none exists
 *   - Without trip (FIFO): allocates against pending receivables for the customer
 *     ordered by createdDate ascending (oldest first)
 */
import { useState, useMemo } from 'react';
import { X, IndianRupee, AlertCircle } from 'lucide-react';
import { useStore } from '@/store';
import type { PaymentMode } from '@/shared/types';
import { calcReceivableFinance } from '@/shared/utils/finance';
import { formatCurrency } from '@/shared/utils/format';
import { today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { Button } from './ui/button';
import { toast } from '@/shared/hooks/useToast';

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'];

interface Props {
  open:        boolean;
  onClose:     () => void;
  /** Pre-select a customer (e.g. when opened from customer profile) */
  defaultCustomerId?: string;
  /** Pre-select a trip (e.g. when opened from a trip) */
  defaultTripId?:     string;
}

export function RecordReceiptForm({ open, onClose, defaultCustomerId, defaultTripId }: Props) {
  const customers         = useStore(s => s.customers);
  const trips             = useStore(s => s.trips);
  const receivables       = useStore(s => s.receivables);
  const createReceivable  = useStore(s => s.createReceivable);
  const addReceivableEntry = useStore(s => s.addReceivableEntry);

  const [customerId,   setCustomerId]   = useState(defaultCustomerId ?? '');
  const [tripId,       setTripId]       = useState(defaultTripId ?? '');
  const [amount,       setAmount]       = useState('');
  const [payDate,      setPayDate]      = useState(today());
  const [payMode,      setPayMode]      = useState<PaymentMode>('Cash');
  const [reference,    setReference]    = useState('');
  const [notes,        setNotes]        = useState('');
  const [saving,       setSaving]       = useState(false);

  // Customer options
  const customerOptions = useMemo(() =>
    [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  // Trip options filtered by selected customer — only trips with a payable amount
  const tripOptions = useMemo(() => {
    if (!customerId) return [];
    return trips
      .filter(t => (t.customerId === customerId || t.customer === customers.find(c => c.id === customerId)?.name) && (t.totalPayable ?? 0) > 0)
      .sort((a, b) => (b.createdDate ?? '').localeCompare(a.createdDate ?? ''));
  }, [customerId, trips, customers]);

  // Preview: what will the payment be applied against
  const allocationPreview = useMemo(() => {
    const amt = parseFloat(amount);
    if (!customerId || isNaN(amt) || amt <= 0) return null;

    if (tripId) {
      // Find existing receivables for this trip
      const tripReceivables = receivables.filter(r => r.tripId === tripId).sort((a, b) => a.createdDate.localeCompare(b.createdDate));
      const pending = tripReceivables.filter(r => {
        const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries });
        return fin.balanceDue > 0;
      });
      const trip = trips.find(t => t.id === tripId);
      const existingReceived = tripReceivables.reduce((sum, r) => sum + r.totalReceived, 0);
      const totalPayable = trip?.totalPayable ?? 0;
      const currentBalance = Math.max(0, totalPayable - existingReceived);

      if (pending.length === 0 && totalPayable === 0) {
        return { type: 'no-invoice' as const, trip };
      }
      const excess = Math.max(0, amt - currentBalance);
      return {
        type:    'trip' as const,
        trip,
        balance: currentBalance,
        excess,
        willCreate: tripReceivables.length === 0,
      };
    }

    // FIFO — find oldest pending receivables for this customer
    const custReceivables = receivables
      .filter(r => r.customerId === customerId)
      .sort((a, b) => a.createdDate.localeCompare(b.createdDate));
    const pending = custReceivables.filter(r => {
      const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries });
      return fin.balanceDue > 0;
    });

    const totalPending = pending.reduce((sum, r) => {
      const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries });
      return sum + fin.balanceDue;
    }, 0);

    return {
      type:    'fifo' as const,
      count:   pending.length,
      totalPending,
      excess:  Math.max(0, amt - totalPending),
    };
  }, [customerId, tripId, amount, receivables, trips]);

  function reset() {
    setCustomerId(defaultCustomerId ?? '');
    setTripId(defaultTripId ?? '');
    setAmount('');
    setPayDate(today());
    setPayMode('Cash');
    setReference('');
    setNotes('');
  }

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!customerId) { toast.error('Select a customer'); return; }
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }

    setSaving(true);
    try {
      const customer = customers.find(c => c.id === customerId);
      const entryData = {
        amount:      amt,
        paymentDate: payDate,
        paymentMode: payMode,
        reference:   reference || undefined,
        notes:       notes     || undefined,
      };

      if (tripId) {
        // Apply against this specific trip
        const trip = trips.find(t => t.id === tripId);
        let receivable = receivables
          .filter(r => r.tripId === tripId)
          .sort((a, b) => a.createdDate.localeCompare(b.createdDate))
          .find(r => {
            const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries });
            return fin.balanceDue > 0;
          });

        if (!receivable) {
          // Create a receivable for this trip if none exists
          receivable = createReceivable({
            customerId,
            customerName:  customer?.name ?? '',
            tripId,
            invoiceAmount: trip?.totalPayable ?? amt,
            description:   `Trip ${tripId}${trip ? ` — ${trip.destination}` : ''}`,
          });
        }

        if (receivable) {
          addReceivableEntry(receivable.id, entryData);
          toast.success('Receipt recorded', `${formatCurrency(amt)} against trip ${tripId}`);
        }
      } else {
        // FIFO — allocate against oldest pending receivables for this customer
        let remaining = amt;
        const custReceivables = receivables
          .filter(r => r.customerId === customerId)
          .sort((a, b) => a.createdDate.localeCompare(b.createdDate));

        const pending = custReceivables.filter(r => {
          const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries });
          return fin.balanceDue > 0;
        });

        if (pending.length === 0 && remaining > 0) {
          // No pending invoices — create an advance/unallocated receivable
          const created = createReceivable({
            customerId,
            customerName:  customer?.name ?? '',
            invoiceAmount: 0,  // Will be over-received → shows as excess/advance
            description:   'Advance / unallocated payment',
          });
          if (created) addReceivableEntry(created.id, entryData);
        } else {
          for (const rec of pending) {
            if (remaining <= 0) break;
            const fin = calcReceivableFinance({ invoiceAmount: rec.invoiceAmount, entries: rec.entries });
            const apply = Math.min(remaining, fin.balanceDue);
            addReceivableEntry(rec.id, { ...entryData, amount: apply });
            remaining -= apply;
          }
          // Any remainder goes to the last receivable (will show as excess there)
          if (remaining > 0 && pending.length > 0) {
            addReceivableEntry(pending[pending.length - 1].id, { ...entryData, amount: remaining });
          }
        }

        toast.success('Receipt recorded', `${formatCurrency(amt)} allocated (FIFO)`);
      }

      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 animate-fade-in overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-emerald-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center">
              <IndianRupee className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Record Receipt</h2>
              <p className="text-[11px] text-gray-500">Enter customer payment received</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">

          {/* Customer */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">Customer <span className="text-red-500">*</span></label>
            <select
              value={customerId}
              onChange={e => { setCustomerId(e.target.value); setTripId(''); }}
              className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— Select customer —</option>
              {customerOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Trip Reference */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">
              Trip Reference <span className="text-gray-400 font-normal">(optional — leave blank for FIFO allocation)</span>
            </label>
            <select
              value={tripId}
              onChange={e => setTripId(e.target.value)}
              disabled={!customerId}
              className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-40"
            >
              <option value="">— Apply on FIFO basis —</option>
              {tripOptions.map(t => {
                const tripReceivables = receivables.filter(r => r.tripId === t.id);
                const received = tripReceivables.reduce((sum, r) => sum + r.totalReceived, 0);
                const balance = Math.max(0, (t.totalPayable ?? 0) - received);
                return (
                  <option key={t.id} value={t.id}>
                    {t.id} · {t.destination} {balance > 0 ? `(₹${balance.toLocaleString('en-IN')} due)` : '(settled)'}
                  </option>
                );
              })}
            </select>
            {customerId && tripOptions.length === 0 && (
              <p className="text-[11px] text-gray-400">No priced trips found for this customer</p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">Amount Received <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min={0}
                className="w-full h-9 rounded-lg border border-gray-200 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Allocation preview */}
          {allocationPreview && (
            <div className={cn(
              'rounded-xl p-3 text-xs border',
              allocationPreview.type === 'trip' && (allocationPreview as {excess?: number}).excess && (allocationPreview as {excess: number}).excess > 0
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800',
            )}>
              {allocationPreview.type === 'trip' && (
                <>
                  <p className="font-medium">
                    Trip {allocationPreview.trip?.id} — {allocationPreview.trip?.destination}
                  </p>
                  <p className="mt-0.5">
                    Current balance: {formatCurrency((allocationPreview as {balance: number}).balance)}
                    {(allocationPreview as {willCreate?: boolean}).willCreate && <span className="ml-2 text-blue-600">(new invoice will be created)</span>}
                  </p>
                  {(allocationPreview as {excess: number}).excess > 0 && (
                    <p className="mt-1 font-semibold text-amber-700">
                      ⚠ {formatCurrency((allocationPreview as {excess: number}).excess)} will be recorded as advance / credit
                    </p>
                  )}
                </>
              )}
              {allocationPreview.type === 'fifo' && (
                <>
                  <p className="font-medium">FIFO allocation across {(allocationPreview as {count: number}).count} pending invoice{(allocationPreview as {count: number}).count !== 1 ? 's' : ''}</p>
                  <p className="mt-0.5">Total pending: {formatCurrency((allocationPreview as {totalPending: number}).totalPending)}</p>
                  {(allocationPreview as {excess: number}).excess > 0 && (
                    <p className="mt-1 font-semibold text-amber-700">
                      ⚠ {formatCurrency((allocationPreview as {excess: number}).excess)} excess — will be recorded as advance
                    </p>
                  )}
                  {(allocationPreview as {count: number}).count === 0 && (
                    <p className="mt-1 flex items-center gap-1 text-blue-700">
                      <AlertCircle className="w-3.5 h-3.5" /> No pending invoices — will record as advance payment
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Date + Mode row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Payment Date</label>
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Payment Mode</label>
              <select
                value={payMode}
                onChange={e => setPayMode(e.target.value as PaymentMode)}
                className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">UTR / Reference</label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="e.g. UTR123456789 or cheque number"
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={() => { reset(); onClose(); }} className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <Button onClick={handleSave} loading={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <IndianRupee className="w-3.5 h-3.5" /> Record Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
