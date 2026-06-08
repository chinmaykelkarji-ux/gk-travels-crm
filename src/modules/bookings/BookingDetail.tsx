import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, IndianRupee, Edit2, Trash2, Plus, CheckCircle, Receipt, HelpCircle, Activity,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import {
  FINANCIAL_STATUS_CLASS, FINANCIAL_STATUS_LABEL, getFinancialStatus,
  RECEIVABLE_STATUS_CLASS, RECEIVABLE_STATUS_LABEL, calcReceivableFinance,
} from '@/shared/utils/finance';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import type { Receivable } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Separator } from '@/shared/components/ui/separator';
import { ReceivableEntryForm } from '@/shared/components/ReceivableEntryForm';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import { TYPE_ICON, TYPE_COLOR, STATUS_CONFIG } from './bookingMeta';

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const booking       = useStore(selectors.bookingById(id ?? ''));
  const trips         = useStore(s => s.trips);
  const deleteBooking = useStore(s => s.deleteBooking);

  const activityLog      = useStore(s => s.activityLog);
  const communications   = useStore(s => s.communications);
  const allReceivables   = useStore(s => s.receivables);
  const createReceivable = useStore(s => s.createReceivable);
  const addReceivableEntry = useStore(s => s.addReceivableEntry);
  const receivables = allReceivables.filter(r => r.bookingId === id);

  const [recEntryOpen, setRecEntryOpen] = useState(false);
  const [activeReceivable, setActiveReceivable] = useState<Receivable | null>(null);
  const [creatingReceivable, setCreatingReceivable] = useState(false);

  if (!booking) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Booking not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/bookings')} className="mt-3">
          ← Back to Bookings
        </Button>
      </div>
    );
  }

  const Icon = TYPE_ICON[booking.type] ?? HelpCircle;
  const typeClr = TYPE_COLOR[booking.type] ?? TYPE_COLOR.other;
  const statusCfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending;
  const finStatus = getFinancialStatus(booking.totalPayable, booking.advance);
  const linkedTrip = booking.refId ? trips.find(t => t.id === booking.refId) : null;

  async function handleDelete() {
    const ok = await confirm({
      title:        `Delete ${booking!.id}?`,
      description:  `This will permanently delete this booking for ${booking!.customerName}. This action cannot be undone.`,
      confirmLabel: 'Delete Booking',
      cancelLabel:  'Cancel',
      variant:      'destructive',
    });
    if (ok) {
      deleteBooking(id!);
      navigate('/bookings');
      toast.success('Booking deleted');
    }
  }

  function openRecordPayment() {
    const existing = receivables.find(r => r.balanceDue > 0) ?? receivables[0];
    if (existing) {
      setActiveReceivable(existing);
      setRecEntryOpen(true);
      return;
    }
    if (!booking!.totalPayable || booking!.totalPayable <= 0) {
      toast.error('Set a price first', 'Add a selling price to this booking before recording payments');
      return;
    }
    setCreatingReceivable(true);
    const created = createReceivable({
      customerId:    booking!.customerId,
      customerName:  booking!.customerName,
      bookingId:     booking!.id,
      tripId:        booking!.refId || undefined,
      invoiceAmount: booking!.totalPayable,
      description:   `${booking!.type} booking · ${booking!.id}`,
    });
    setCreatingReceivable(false);
    if (created) {
      setActiveReceivable(created);
      setRecEntryOpen(true);
    }
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Back + Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={() => navigate('/bookings')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bookings
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="success" size="sm" className="gap-1.5" onClick={openRecordPayment} loading={creatingReceivable}>
            <IndianRupee className="w-3.5 h-3.5" /> Record Payment
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/bookings')} className="gap-1.5">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Booking Hero Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400 tracking-wider">{booking.id}</span>
              <Badge variant={
                booking.status === 'completed' || booking.status === 'approved' ? 'success' :
                booking.status === 'cancelled' || booking.status === 'rejected' ? 'destructive' :
                booking.status === 'confirmed' || booking.status === 'issued'   ? 'default'    :
                'secondary'
              }>
                {statusCfg.label}
              </Badge>
            </div>
            <h1 className="text-xl font-bold text-gray-900 font-display">{booking.customerName}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
              <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium capitalize', typeClr)}>
                <Icon className="w-3 h-3" />
                {booking.type}
              </div>
              {linkedTrip && (
                <button
                  onClick={() => navigate(`/trips/${linkedTrip.id}`)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Trip: {linkedTrip.id} ({linkedTrip.destination})
                </button>
              )}
              <span className="text-xs text-gray-400">Created {fmtDate(booking.createdDate)}</span>
            </div>
          </div>

          {/* Financial summary pill */}
          <div className="flex-shrink-0 text-right space-y-1">
            {booking.totalPayable === null ? (
              <div className="text-yellow-700 font-semibold text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                ⚠ Price Not Set
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold text-gray-900 font-display">
                  {formatCurrency(booking.totalPayable)}
                </div>
                <div className={cn('text-xs font-medium px-2.5 py-1 rounded-full inline-block', FINANCIAL_STATUS_CLASS[finStatus])}>
                  {FINANCIAL_STATUS_LABEL[finStatus]}
                </div>
                {booking.balanceDue > 0 && (
                  <div className="text-xs text-red-600 font-medium">
                    Pending: {formatCurrency(booking.balanceDue)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Finance + Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Finance Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <IndianRupee className="w-4 h-4 text-blue-600" /> Payment Summary
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Total Amount',     val: booking.totalPayable !== null ? formatCurrency(booking.totalPayable) : '⚠ Not Set', warn: booking.totalPayable === null },
              { label: 'Advance Received', val: formatCurrency(booking.advance), green: true },
              { label: 'Pending Amount',   val: formatCurrency(booking.balanceDue), red: booking.balanceDue > 0 },
              null,
              { label: 'Selling Price',  val: formatCurrency(booking.sellingPrice) },
              ...(booking.gstAmount > 0 ? [{ label: `GST (${booking.gstRate}%)`, val: formatCurrency(booking.gstAmount) }] : []),
              { label: 'Supplier Cost',  val: formatCurrency(booking.supplierCost) },
              { label: 'Gross Margin',   val: formatCurrency(booking.grossMargin), green: booking.grossMargin > 0 },
            ].map((row, i) => {
              if (!row) return <Separator key={i} className="my-1" />;
              return (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{row.label}</span>
                  <span className={cn(
                    'font-semibold',
                    row.warn  ? 'text-yellow-700' :
                    row.green ? 'text-emerald-600' :
                    row.red   ? 'text-red-600' :
                    'text-gray-800'
                  )}>
                    {row.val}
                  </span>
                </div>
              );
            })}
            <Separator className="my-1" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Payment Status</span>
              <span className={cn('px-2 py-0.5 rounded-full font-medium text-[11px]', FINANCIAL_STATUS_CLASS[finStatus])}>
                {FINANCIAL_STATUS_LABEL[finStatus]}
              </span>
            </div>
          </div>
        </div>

        {/* Payments / Receivable history */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-600" /> Payments
            </h3>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={openRecordPayment} loading={creatingReceivable}>
              <Plus className="w-3 h-3" /> Record Payment
            </Button>
          </div>

          {receivables.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No payments recorded for this booking yet</p>
          ) : (
            <div className="space-y-4">
              {receivables.map(r => {
                const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries, dueDate: r.dueDate });
                return (
                  <div key={r.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs">
                        <span className="text-gray-500">Invoice </span>
                        <span className="font-semibold text-gray-800">{formatCurrency(r.invoiceAmount)}</span>
                        <span className="text-gray-400"> · Received </span>
                        <span className="font-semibold text-emerald-600">{formatCurrency(fin.totalReceived)}</span>
                        <span className="text-gray-400"> · Balance </span>
                        <span className="font-semibold text-red-500">{formatCurrency(fin.balanceDue)}</span>
                      </div>
                      <span className={cn('px-1.5 py-0.5 rounded-full font-medium text-[10px]', RECEIVABLE_STATUS_CLASS[fin.status])}>
                        {RECEIVABLE_STATUS_LABEL[fin.status]}
                      </span>
                    </div>

                    {r.entries.length === 0 ? (
                      <p className="text-[11px] text-gray-400 py-2">No entries recorded yet</p>
                    ) : (
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-400">
                            <th className="text-left font-medium py-1.5">Date</th>
                            <th className="text-left font-medium py-1.5">Amount</th>
                            <th className="text-left font-medium py-1.5">Method</th>
                            <th className="text-left font-medium py-1.5">Reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {[...r.entries].reverse().map(e => (
                            <tr key={e.id}>
                              <td className="py-1.5 text-gray-500">{e.paymentDate ? fmtDate(e.paymentDate) : '—'}</td>
                              <td className="py-1.5 font-semibold text-emerald-600">{formatCurrency(e.amount)}</td>
                              <td className="py-1.5 text-gray-600">{e.paymentMode}</td>
                              <td className="py-1.5 text-gray-400 font-mono">{e.reference || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {fin.balanceDue > 0 && (
                      <button
                        onClick={() => { setActiveReceivable(r); setRecEntryOpen(true); }}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        <CheckCircle className="w-3 h-3" /> Record Payment
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-gray-500" /> Activity
        </h3>
        <ActivityTimeline
          activity={activityLog.filter(a => a.entityType === 'booking' && a.entityId === booking.id)}
          communications={communications.filter(c => c.entityType === 'booking' && c.entityId === booking.id)}
          emptyLabel="No activity recorded for this booking yet"
        />
      </div>

      {/* Record Payment Form */}
      <ReceivableEntryForm
        open={recEntryOpen}
        onClose={() => { setRecEntryOpen(false); setActiveReceivable(null); }}
        onSave={(data) => {
          if (activeReceivable) addReceivableEntry(activeReceivable.id, data);
          toast.success('Payment recorded');
          setRecEntryOpen(false);
          setActiveReceivable(null);
        }}
        receivable={activeReceivable}
      />
    </div>
  );
}
