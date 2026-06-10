import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, IndianRupee, Edit2, Trash2, Plus, CheckCircle,
  Receipt, HelpCircle, Activity, MessageCircle, Mail, Printer,
  Clock, Circle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import {
  FINANCIAL_STATUS_CLASS, FINANCIAL_STATUS_LABEL, getFinancialStatus,
  RECEIVABLE_STATUS_CLASS, RECEIVABLE_STATUS_LABEL, calcReceivableFinance,
} from '@/shared/utils/finance';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, daysUntil } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { RecordNumberBadge } from '@/shared/components/RecordNumberBadge';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '@/shared/components/ui/separator';
import { RecordReceiptForm } from '@/shared/components/RecordReceiptForm';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import { openWhatsApp, openGmail } from '@/shared/utils/email';
import { TYPE_ICON, TYPE_COLOR, STATUS_CONFIG, DETAIL_FIELDS, getBookingPrimaryDate } from './bookingMeta';

// ─── Detail card ───────────────────────────────────────────────

function DetailCard({ detail, type }: { detail: Record<string, unknown>; type: string }) {
  const fields = DETAIL_FIELDS[type as keyof typeof DETAIL_FIELDS] ?? [];
  const populated = fields.filter(f => {
    const v = detail[f.key];
    return v !== null && v !== undefined && String(v).trim() !== '';
  });
  if (populated.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      {populated.map(field => (
        <div key={field.key} className={cn(field.span === 'full' && 'sm:col-span-2')}>
          <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{field.label}</p>
          <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-line font-medium">{String(detail[field.key])}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Share detail builder ──────────────────────────────────────

function buildPrintDetails(detail: Record<string, unknown>, type: string): string {
  const fields = DETAIL_FIELDS[type as keyof typeof DETAIL_FIELDS] ?? [];
  return fields
    .filter(f => {
      const v = detail[f.key];
      return v !== null && v !== undefined && String(v).trim() !== '';
    })
    .map(f => `${f.label}: ${String(detail[f.key])}`)
    .join('\n');
}

function buildShareMsg(detail: Record<string, unknown>, type: string): string {
  const lines = buildPrintDetails(detail, type);
  return lines ? `📋 Details:\n${lines}\n` : '';
}

// ─── Main BookingDetail page ───────────────────────────────────

export default function BookingDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const booking          = useStore(selectors.bookingById(id ?? ''));
  const trips            = useStore(s => s.trips);
  const customers        = useStore(s => s.customers);
  const deleteBooking    = useStore(s => s.deleteBooking);
  const activityLog      = useStore(s => s.activityLog);
  const communications   = useStore(s => s.communications);
  const logCommunication = useStore(s => s.logCommunication);
  const allReceivables   = useStore(s => s.receivables);
  const createReceivable = useStore(s => s.createReceivable);

  const [recEntryOpen, setRecEntryOpen]   = useState(false);
  const [creatingReceivable, setCreatingReceivable] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(true);

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

  // After the guard above, booking is always Booking. Cast once so closures
  // can reference it without TypeScript raising TS18048 on each access.
  const bk = booking as NonNullable<typeof booking>;

  const Icon       = TYPE_ICON[bk.type] ?? HelpCircle;
  const typeClr    = TYPE_COLOR[bk.type] ?? TYPE_COLOR.other;
  const statusCfg  = STATUS_CONFIG[bk.status] ?? STATUS_CONFIG.pending;
  const finStatus  = getFinancialStatus(bk.totalPayable, bk.advance);
  const linkedTrip = bk.refId ? trips.find(t => t.id === bk.refId) : null;
  const customer   = bk.customerId ? customers.find(c => c.id === bk.customerId) : null;
  const receivables = allReceivables.filter(r => r.bookingId === id);
  const detail     = (bk.detail ?? {}) as Record<string, unknown>;
  const primaryDate = getBookingPrimaryDate(bk);
  const daysToGo   = primaryDate ? daysUntil(primaryDate) : null;
  const hasDetails  = Object.values(detail).some(v => v !== null && v !== undefined && String(v).trim() !== '');

  // ── Booking timeline ────────────────────────────────────────
  const bookingActivity = activityLog.filter(a => a.entityType === 'booking' && a.entityId === bk.id);
  const bookingComms    = communications.filter(c => c.entityType === 'booking' && c.entityId === bk.id);
  const CONFIRMED_STATUSES = new Set(['confirmed', 'issued', 'submitted', 'approved', 'checked_in', 'departed', 'completed']);

  const findActDate = (action: string) => bookingActivity.find(a => a.action === action)?.date;

  const voucherSentDate = [...bookingComms]
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .find(c => c.subject?.toLowerCase().includes('voucher'))?.createdAt;

  const firstPaymentDate = receivables
    .flatMap(r => r.entries)
    .sort((a, b) => (a.paymentDate ?? '').localeCompare(b.paymentDate ?? ''))
    .find(e => e.amount > 0)?.paymentDate;

  const timelineSteps = [
    { key: 'created',          label: 'Booking Created',   done: true,                                                    date: bk.createdDate },
    { key: 'confirmed',        label: 'Confirmed',         done: CONFIRMED_STATUSES.has(bk.status),                  date: findActDate('booking_confirmed') },
    { key: 'voucher_sent',     label: 'Voucher Sent',      done: !!voucherSentDate,                                       date: voucherSentDate },
    { key: 'payment_received', label: 'Payment Received',  done: bk.advance > 0 || bk.balanceDue === 0,         date: firstPaymentDate },
    { key: 'completed',        label: 'Completed',         done: bk.status === 'completed',                          date: findActDate('booking_completed') },
  ];

  // ── Actions ────────────────────────────────────────────────

  async function handleDelete() {
    const ok = await confirm({
      title:        `Delete ${bk.id}?`,
      description:  `Permanently delete this ${bk.type} booking for ${bk.customerName}. This cannot be undone.`,
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
    // Open unified receipt form pre-set to the trip linked to this booking
    setRecEntryOpen(true);
  }

  function handleWhatsApp() {
    const phone = customer?.phone ?? '';
    if (!phone) { toast.error('No phone number', 'Add a phone number to this customer first'); return; }
    openWhatsApp({
      phone,
      message:
        `Hello ${bk.customerName},\n\n` +
        `Your *${bk.type.charAt(0).toUpperCase() + bk.type.slice(1)} Booking* is confirmed! 🎉\n\n` +
        buildShareMsg(detail, bk.type) +
        (bk.totalPayable ? `\n💰 Total: ₹${bk.totalPayable.toLocaleString('en-IN')}` : '') +
        (bk.balanceDue > 0 ? `\n⚠️ Balance Due: ₹${bk.balanceDue.toLocaleString('en-IN')}` : '') +
        `\n\n📋 Ref: ${bk.id}\n\nContact us for any changes.\n\nBest regards,\nGK Travels`,
    });
    logCommunication({ type: 'whatsapp', recipient: phone, subject: `${bk.type} booking ${bk.id}`, entityType: 'booking', entityId: bk.id });
    toast.success('WhatsApp opened');
  }

  function handleEmail() {
    const email = customer?.email ?? '';
    if (!email) { toast.error('No email address', 'Add an email to this customer first'); return; }
    openGmail({
      to:      email,
      subject: `${bk.type.charAt(0).toUpperCase() + bk.type.slice(1)} Booking Confirmation — ${bk.id} — GK Travels`,
      body:
        `Dear ${bk.customerName},\n\n` +
        `Your ${bk.type} booking has been confirmed.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 Ref     : ${bk.id}\n` +
        buildPrintDetails(detail, bk.type) +
        (bk.totalPayable ? `\n💰 Total   : ₹${bk.totalPayable.toLocaleString('en-IN')}` : '') +
        `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `For any queries please reply to this email.\n\nBest regards,\nGK Travels Team`,
    });
    logCommunication({ type: 'email', recipient: email, subject: `${bk.type} booking ${bk.id}`, entityType: 'booking', entityId: bk.id });
    toast.success('Gmail opened');
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-show { display: block !important; }
          body { background: white !important; }
          .p-5 { padding: 12px !important; }
        }
        .print-show { display: none; }
      `}</style>

      <div className="p-5 space-y-5 animate-fade-in">

        {/* Print-only confirmation header */}
        <div className="print-show border border-gray-300 rounded-xl p-6 mb-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">GK Travels</h1>
              <p className="text-sm text-gray-500">Booking Confirmation</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">{bk.id}</p>
              <p className="text-sm text-gray-500">{fmtDate(new Date().toISOString().split('T')[0])}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div><p className="font-semibold text-gray-600 text-xs uppercase">Customer</p><p>{bk.customerName}</p></div>
            <div><p className="font-semibold text-gray-600 text-xs uppercase">Type</p><p className="capitalize">{bk.type}</p></div>
            <div><p className="font-semibold text-gray-600 text-xs uppercase">Status</p><p>{statusCfg.label}</p></div>
            {bk.totalPayable !== null && (
              <div><p className="font-semibold text-gray-600 text-xs uppercase">Total Amount</p><p>{formatCurrency(bk.totalPayable)}</p></div>
            )}
          </div>
          {hasDetails && (
            <div className="pt-3 border-t border-gray-200">
              <p className="font-semibold text-gray-600 text-xs uppercase mb-2">{bk.type} Details</p>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{buildPrintDetails(detail, bk.type)}</pre>
            </div>
          )}
          {bk.notes && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="font-semibold text-gray-600 text-xs uppercase">Notes</p>
              <p className="text-sm text-gray-600 mt-1">{bk.notes}</p>
            </div>
          )}
        </div>

        {/* Back + Actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap no-print">
          <button
            onClick={() => navigate('/bookings')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Bookings
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleWhatsApp}>
              <MessageCircle className="w-3.5 h-3.5 text-green-600" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleEmail}>
              <Mail className="w-3.5 h-3.5 text-blue-600" /> Email
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
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

        {/* Departure / check-in alert */}
        {primaryDate && daysToGo !== null && daysToGo >= 0 && daysToGo <= 3 && (
          <div className={cn(
            'rounded-xl px-5 py-3.5 flex items-center gap-3',
            daysToGo === 0 ? 'bg-red-50 border border-red-200' :
            daysToGo === 1 ? 'bg-orange-50 border border-orange-200' :
                             'bg-amber-50 border border-amber-100',
          )}>
            <Clock className={cn('w-4 h-4 flex-shrink-0',
              daysToGo === 0 ? 'text-red-500' : daysToGo === 1 ? 'text-orange-500' : 'text-amber-500',
            )} />
            <p className={cn('text-sm font-medium',
              daysToGo === 0 ? 'text-red-700' : daysToGo === 1 ? 'text-orange-700' : 'text-amber-700',
            )}>
              {bk.type === 'hotel' ? 'Check-in' : 'Departure'}
              {daysToGo === 0 ? ' is today' : ` in ${daysToGo} day${daysToGo !== 1 ? 's' : ''}`} — {fmtDate(primaryDate)}
            </p>
            {bk.balanceDue > 0 && (
              <span className="ml-auto text-xs font-semibold text-red-600 flex-shrink-0">
                Balance due: {formatCurrency(bk.balanceDue)}
              </span>
            )}
          </div>
        )}

        {/* Hero card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-start gap-4">
            <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0', typeClr)}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono text-gray-400 tracking-wider">{bk.id}</span>
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', statusCfg.class)}>
                  {statusCfg.label}
                </span>
                {bk.serviceMarginMode && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                    GST on Fee
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-gray-900 font-display">{bk.customerName}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg font-medium capitalize', typeClr)}>
                  <Icon className="w-3 h-3" />
                  {bk.type}
                </span>
                {linkedTrip && (
                  <button
                    onClick={() => navigate(`/trips/${linkedTrip.id}`)}
                    className="text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Trip: {linkedTrip.id} ({linkedTrip.destination})
                    <RecordNumberBadge label="Trip" n={linkedTrip.tripNumber} className="ml-1.5 text-indigo-300" />
                  </button>
                )}
                {primaryDate && (
                  <span>
                    {bk.type === 'hotel' ? 'Check-in' : 'Departure'}: {fmtDate(primaryDate)}
                    {daysToGo !== null && daysToGo >= 0 && (
                      <span className={cn('ml-1 font-semibold', daysToGo <= 1 ? 'text-red-500' : daysToGo <= 7 ? 'text-orange-500' : 'text-gray-500')}>
                        ({daysToGo === 0 ? 'Today' : `${daysToGo}d`})
                      </span>
                    )}
                  </span>
                )}
                <span className="text-gray-400">Created {fmtDate(bk.createdDate)}</span>
              </div>
            </div>

            {/* Financial pill */}
            <div className="flex-shrink-0 text-right space-y-1">
              {bk.totalPayable === null ? (
                <div className="text-yellow-700 font-semibold text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  ⚠ Price Not Set
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-gray-900 font-display">
                    {formatCurrency(bk.totalPayable)}
                  </div>
                  <div className={cn('text-xs font-medium px-2.5 py-1 rounded-full inline-block', FINANCIAL_STATUS_CLASS[finStatus])}>
                    {FINANCIAL_STATUS_LABEL[finStatus]}
                  </div>
                  {bk.balanceDue > 0 && (
                    <div className="text-xs text-red-600 font-medium">
                      Balance: {formatCurrency(bk.balanceDue)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Booking timeline */}
          <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/40">
            <div className="flex items-start gap-0">
              {timelineSteps.map((step, idx) => {
                const isLast = idx === timelineSteps.length - 1;
                return (
                  <div key={step.key} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors',
                        step.done ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-gray-200',
                      )}>
                        {step.done
                          ? <CheckCircle className="w-3.5 h-3.5 text-white" />
                          : <Circle className="w-3 h-3 text-gray-300" />}
                      </div>
                      <p className={cn('text-[10px] mt-1 text-center font-medium whitespace-nowrap px-1', step.done ? 'text-emerald-600' : 'text-gray-400')}>
                        {step.label}
                      </p>
                      {step.date && (
                        <p className="text-[9px] text-gray-400 mt-0.5">{fmtDate(step.date)}</p>
                      )}
                    </div>
                    {!isLast && (
                      <div className={cn('flex-1 h-0.5 mx-0.5 mb-5', step.done ? 'bg-emerald-300' : 'bg-gray-200')} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Type-specific detail card */}
        {hasDetails && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/60 transition-colors"
              onClick={() => setDetailExpanded(v => !v)}
            >
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 capitalize">
                <Icon className="w-4 h-4 text-gray-500" />
                {bk.type} Details
              </h3>
              {detailExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {detailExpanded && (
              <>
                <Separator />
                <div className="p-5">
                  <DetailCard detail={detail} type={bk.type} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Finance + Payments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Finance Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4">
              <IndianRupee className="w-4 h-4 text-blue-600" /> Payment Summary
            </h3>
            <div className="space-y-3">
              {bk.serviceMarginMode ? (
                <>
                  {[
                    { label: 'Supplier Cost',    val: formatCurrency(bk.supplierCost) },
                    { label: 'Convenience Fee',  val: formatCurrency(bk.convenienceFee) },
                    null as null,
                    { label: 'Taxable Fee',      val: formatCurrency(bk.taxableFee) },
                    { label: `GST on Fee (${bk.gstRate}%)`, val: formatCurrency(bk.gstOnFee) },
                    null as null,
                    { label: 'Invoice Total',    val: formatCurrency(bk.totalPayable ?? 0), bold: true },
                    { label: 'Advance Received', val: formatCurrency(bk.advance), green: true },
                    { label: 'Balance Due',      val: formatCurrency(bk.balanceDue), red: bk.balanceDue > 0 },
                    null as null,
                    { label: 'Actual Earnings',  val: formatCurrency(bk.grossMargin), green: bk.grossMargin > 0 },
                  ].map((row, i) => {
                    if (!row) return <Separator key={i} className="my-1" />;
                    return (
                      <div key={row.label} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{row.label}</span>
                        <span className={cn('font-semibold', row.bold ? 'text-gray-900 text-sm' : row.green ? 'text-emerald-600' : row.red ? 'text-red-600' : 'text-gray-800')}>
                          {row.val}
                        </span>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  {[
                    { label: 'Total Amount',     val: bk.totalPayable !== null ? formatCurrency(bk.totalPayable) : '⚠ Not Set', warn: bk.totalPayable === null },
                    { label: 'Advance Received', val: formatCurrency(bk.advance), green: true },
                    { label: 'Pending Amount',   val: formatCurrency(bk.balanceDue), red: bk.balanceDue > 0 },
                    null as null,
                    { label: 'Selling Price',    val: formatCurrency(bk.sellingPrice ?? 0) },
                    ...(bk.gstAmount > 0 ? [{ label: `GST (${bk.gstRate}%, ${bk.gstMode === 'INCLUDED' ? 'incl.' : 'excl.'})`, val: formatCurrency(bk.gstAmount), green: false, red: false, warn: false, bold: false }] : []),
                    { label: 'Supplier Cost',    val: formatCurrency(bk.supplierCost) },
                    { label: 'Gross Margin',     val: formatCurrency(bk.grossMargin), green: bk.grossMargin > 0 },
                  ].map((row, i) => {
                    if (!row) return <Separator key={i} className="my-1" />;
                    return (
                      <div key={row.label} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{row.label}</span>
                        <span className={cn('font-semibold', row.warn ? 'text-yellow-700' : row.green ? 'text-emerald-600' : row.red ? 'text-red-600' : 'text-gray-800')}>
                          {row.val}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
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
                          onClick={() => setRecEntryOpen(true)}
                          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          <CheckCircle className="w-3 h-3" /> Record Receipt
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {bk.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Notes</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{bk.notes}</p>
          </div>
        )}

        {/* Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 no-print">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-gray-500" /> Activity
          </h3>
          <ActivityTimeline
            activity={bookingActivity}
            communications={bookingComms}
            emptyLabel="No activity recorded for this booking yet"
          />
        </div>

        <RecordReceiptForm
          open={recEntryOpen}
          onClose={() => setRecEntryOpen(false)}
          defaultCustomerId={bk.customerId}
          defaultTripId={bk.refId || undefined}
        />
      </div>
    </>
  );
}
