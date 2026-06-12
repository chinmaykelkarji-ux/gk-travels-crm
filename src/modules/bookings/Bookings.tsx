import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ticket, Search, Plus, HelpCircle, IndianRupee, Package,
  AlertTriangle, CheckCircle, Clock, Filter, X, Pencil, Trash2, Receipt, Eye, UserPlus,
} from 'lucide-react';
import { CustomerQuickCreate } from '@/shared/components/CustomerQuickCreate';
import { useStore } from '@/store';
import type { Booking, BookingType, BookingStatus, Trip } from '@/shared/types';
import { RecordNumberBadge } from '@/shared/components/RecordNumberBadge';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { formatCurrency, formatCurrencyShort } from '@/shared/utils/format';
import { fmtDate } from '@/shared/utils/date';
import {
  FINANCIAL_STATUS_CLASS, FINANCIAL_STATUS_LABEL, getFinancialStatus, calcBookingFinance,
  RECEIVABLE_STATUS_CLASS, RECEIVABLE_STATUS_LABEL, calcReceivableFinance,
} from '@/shared/utils/finance';
import { ReceivableForm } from '@/shared/components/ReceivableForm';
import { cn } from '@/shared/utils/cn';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Textarea } from '@/shared/components/ui/textarea';
import { useBulkSelection } from '@/shared/hooks/useBulkSelection';
import { BulkActionBar } from '@/shared/components/BulkActionBar';
import { TYPE_ICON, TYPE_COLOR, STATUS_CONFIG, DETAIL_FIELDS } from './bookingMeta';

const BOOKING_TYPES: BookingType[] = [
  'flight', 'hotel', 'cab', 'train', 'bus', 'visa', 'insurance', 'activity', 'other',
];

// ─── New Booking Form ─────────────────────────────────────────

interface BookingFormData {
  type:              BookingType;
  customerId:        string;
  customerName:      string;
  refId:             string;
  sellingPrice:      string;
  supplierCost:      string;
  convenienceFee:    string;
  advance:           string;
  supplierPaid:      string;
  gstRate:           string;
  gstMode:           'INCLUDED' | 'EXCLUDED';
  serviceMarginMode: boolean;
  status:            BookingStatus;
  notes:             string;
  detailStr:         Record<string, string>;
}

const DEFAULT_FORM: BookingFormData = {
  type:              'flight',
  customerId:        '',
  customerName:      '',
  refId:             '',
  sellingPrice:      '',
  supplierCost:      '',
  convenienceFee:    '',
  advance:           '',
  supplierPaid:      '',
  gstRate:           '5',
  gstMode:           'EXCLUDED',
  serviceMarginMode: false,
  status:            'pending',
  notes:             '',
  detailStr:         {},
};

// Service Margin Mode applies to bookings where suppliers/vendors are paid
// pass-through and the agency earns via a service/convenience fee — flights,
// trains, buses, hotels, cabs and vendor-arranged activities. It must never
// affect package or tour booking calculations driven by selling price.
const SERVICE_MARGIN_TYPES: BookingType[] = ['flight', 'train', 'bus', 'hotel', 'cab', 'activity'];
const SERVICE_FEE_GST_RATES = ['18', '5'];

function detailToStr(detail: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (v !== null && v !== undefined && !Array.isArray(v) && typeof v !== 'object') {
      out[k] = String(v);
    }
  }
  return out;
}

function strToDetail(detailStr: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detailStr)) {
    if (v.trim() !== '') out[k] = v.trim();
  }
  return out;
}

function formFromBooking(b: Booking): BookingFormData {
  return {
    type:              b.type,
    customerId:        b.customerId ?? '',
    customerName:      b.customerName,
    refId:             b.refId ?? '',
    sellingPrice:      b.sellingPrice !== null ? String(b.sellingPrice) : '',
    supplierCost:      String(b.supplierCost ?? 0),
    convenienceFee:    String(b.convenienceFee ?? 0),
    advance:           String(b.advance ?? 0),
    supplierPaid:      String(b.supplierPaid ?? 0),
    gstRate:           String(b.gstRate ?? 5),
    gstMode:           b.gstMode ?? 'EXCLUDED',
    serviceMarginMode: b.serviceMarginMode ?? false,
    status:            b.status,
    notes:             b.notes ?? '',
    detailStr:         detailToStr(b.detail as Record<string, unknown>),
  };
}

// Parses a numeric form field; returns null on blank (only meaningful for sellingPrice)
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return parseFloat(trimmed);
}

interface BookingFormDialogProps {
  open:     boolean;
  onClose:  () => void;
  booking?: Booking | null;
}

export function BookingFormDialog({ open, onClose, booking }: BookingFormDialogProps) {
  const trips         = useStore(s => s.trips);
  const customers     = useStore(s => s.customers);
  const createBooking = useStore(s => s.createBooking);
  const updateBooking = useStore(s => s.updateBooking);
  const allReceivables   = useStore(s => s.receivables);
  const createReceivable = useStore(s => s.createReceivable);
  const isEdit        = !!booking;
  const [form, setForm] = useState<BookingFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [recFormOpen, setRecFormOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers]
  );

  const bookingReceivables = booking ? allReceivables.filter(r => r.bookingId === booking.id) : [];

  useEffect(() => {
    if (open) setForm(booking ? formFromBooking(booking) : DEFAULT_FORM);
  }, [open, booking]);

  function set<K extends keyof BookingFormData>(key: K, val: BookingFormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleClose() {
    setForm(DEFAULT_FORM);
    onClose();
  }

  const isServiceMarginType = SERVICE_MARGIN_TYPES.includes(form.type);
  const serviceMarginActive = isServiceMarginType && form.serviceMarginMode;

  function handleSave() {
    const name = form.customerName.trim();
    if (!name || !form.customerId) { toast.error('Please select a customer from the list'); return; }

    const selling = parseAmount(form.sellingPrice);
    const cost    = parseAmount(form.supplierCost)   ?? 0;
    const fee     = parseAmount(form.convenienceFee) ?? 0;
    const adv     = parseAmount(form.advance)        ?? 0;
    const paid    = parseAmount(form.supplierPaid)   ?? 0;
    const gst     = parseAmount(form.gstRate)        ?? 0;

    if (!serviceMarginActive && selling !== null && (isNaN(selling) || selling < 0)) {
      toast.error('Invalid selling price', 'Enter a valid non-negative amount'); return;
    }
    if (isNaN(cost) || cost < 0) {
      toast.error('Invalid supplier cost', 'Enter a valid non-negative amount'); return;
    }
    if (serviceMarginActive && (isNaN(fee) || fee < 0)) {
      toast.error('Invalid convenience fee', 'Enter a valid non-negative amount'); return;
    }
    if (isNaN(adv) || adv < 0) {
      toast.error('Invalid advance amount', 'Enter a valid non-negative amount'); return;
    }
    if (isNaN(paid) || paid < 0) {
      toast.error('Invalid supplier paid amount', 'Enter a valid non-negative amount'); return;
    }
    if (isNaN(gst) || gst < 0 || gst > 100) {
      toast.error('Invalid GST rate', 'GST rate must be between 0% and 100%'); return;
    }

    setSaving(true);
    try {
      const refId = form.refId && form.refId !== '__none__' ? form.refId : undefined;
      // Service Margin Mode only ever applies to eligible booking types — never
      // carries over to package/tour bookings even if toggled previously.
      const serviceMarginMode = SERVICE_MARGIN_TYPES.includes(form.type) && form.serviceMarginMode;
      // Service Margin Mode hides standard selling-price logic entirely — the
      // invoice total is derived from Supplier Cost + Convenience Fee instead.
      const sellingForSave    = serviceMarginMode ? null : selling;
      const feeForSave        = serviceMarginMode ? fee  : 0;

      const detail = strToDetail(form.detailStr);

      if (booking) {
        updateBooking(booking.id, {
          type:           form.type,
          customerId:     form.customerId || undefined,
          customerName:   name,
          refId,
          sellingPrice:   sellingForSave,
          supplierCost:   cost,
          convenienceFee: feeForSave,
          advance:        adv,
          supplierPaid:   paid,
          gstRate:        gst,
          gstMode:        form.gstMode,
          serviceMarginMode,
          status:         form.status,
          notes:          form.notes,
          detail,
        });
        toast.success('Booking updated', `${form.type} booking for ${name}`);
      } else {
        createBooking({
          type:           form.type,
          customerId:     form.customerId || undefined,
          customerName:   name,
          refId,
          sellingPrice:   sellingForSave,
          supplierCost:   cost,
          convenienceFee: feeForSave,
          advance:        adv,
          supplierPaid:   paid,
          gstRate:        gst,
          gstMode:        form.gstMode,
          serviceMarginMode,
          status:         form.status,
          notes:          form.notes,
          detail,
        });
        toast.success('Booking created', `${form.type} booking for ${name}`);
      }
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  // Live financial preview — mirrors calcBookingFinance so the form shows
  // exactly what will be persisted (create/edit/print/refresh stay in sync).
  // Service Margin Mode is driven by Supplier Cost + Convenience Fee (manual);
  // standard mode is driven by Selling Price — the two never mix.
  const preview = useMemo(() => {
    const cost = parseAmount(form.supplierCost) ?? 0;
    const gst  = parseAmount(form.gstRate)      ?? 0;
    const adv  = parseAmount(form.advance)      ?? 0;
    const paid = parseAmount(form.supplierPaid) ?? 0;

    if (serviceMarginActive) {
      const fee = parseAmount(form.convenienceFee) ?? 0;
      if (cost === 0 && fee === 0) return null;
      return calcBookingFinance({
        sellingPrice:      null,
        gstRate:           gst,
        gstMode:           form.gstMode,
        advance:           adv,
        supplierCost:      cost,
        supplierPaid:      paid,
        serviceMarginMode: true,
        convenienceFee:    fee,
      });
    }

    const selling = parseAmount(form.sellingPrice);
    if (selling === null) return null;
    return calcBookingFinance({
      sellingPrice:      selling,
      gstRate:           gst,
      gstMode:           form.gstMode,
      advance:           adv,
      supplierCost:      cost,
      supplierPaid:      paid,
      serviceMarginMode: false,
    });
  }, [form.sellingPrice, form.convenienceFee, form.gstRate, form.gstMode, form.advance, form.supplierCost, form.supplierPaid, serviceMarginActive]);

  return (
    <>
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Booking — ${booking!.id}` : 'New Booking'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* Type selector */}
          <div className="space-y-1.5">
            <Label>Booking Type</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {BOOKING_TYPES.map(t => {
                const Icon = TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t, detailStr: {} }))}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all capitalize',
                      form.type === t
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Service Margin Mode — flights, trains, buses, hotels, cabs and
              vendor-arranged activities. Operationally and financially
              distinct from package/tour bookings: the Convenience Fee is
              entered manually and GST is charged ONLY on that fee, never on
              the full supplier/vendor amount. Standard selling-price logic
              is hidden while this mode is active. */}
          {isServiceMarginType && (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-indigo-900">Service Margin Mode</p>
                <p className="text-[11px] text-indigo-600/80 mt-0.5 max-w-md">
                  When enabled, enter the Supplier Cost and a manual Convenience Fee — GST
                  applies only on the fee, never on the full supplier/vendor amount. Invoice
                  Total = Supplier Cost + Convenience Fee. Matches how agencies pass through
                  supplier costs and earn via service margins on tickets, hotels, cabs and
                  other vendor-arranged services.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.serviceMarginMode}
                onClick={() => set('serviceMarginMode', !form.serviceMarginMode)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-0.5',
                  form.serviceMarginMode ? 'bg-indigo-600' : 'bg-gray-300'
                )}
              >
                <span className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                  form.serviceMarginMode ? 'translate-x-[18px]' : 'translate-x-1'
                )} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label required>Customer Name</Label>
              <div className="flex gap-2">
                <Select
                  value={form.customerId}
                  onValueChange={id => {
                    const cust = customers.find(c => c.id === id);
                    if (!cust) return;
                    setForm(f => ({ ...f, customerId: cust.id, customerName: cust.name }));
                  }}
                >
                  <SelectTrigger className="flex-1 min-w-0">
                    <SelectValue placeholder="Select customer…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCustomers.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400">No customers yet</div>
                    )}
                    {sortedCustomers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="Create new customer"
                  onClick={() => setQuickCreateOpen(true)}
                  className="px-2 flex-shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-trip">Linked Trip (optional)</Label>
              <Select value={form.refId || '__none__'} onValueChange={v => set('refId', v === '__none__' ? '' : v)}>
                <SelectTrigger id="bk-trip">
                  <SelectValue placeholder="Select trip…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {trips.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.id} — {t.customer} ({t.destination})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Standard selling-price logic is hidden entirely in Service
                Margin Mode — the invoice is built from Supplier Cost +
                Convenience Fee instead (Section 2/5 of the spec). */}
            {!serviceMarginActive && (
              <div className="space-y-1.5">
                <Label htmlFor="bk-selling">Selling Price (₹)</Label>
                <Input
                  id="bk-selling"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sellingPrice}
                  onChange={e => set('sellingPrice', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bk-cost">Supplier Cost (₹)</Label>
              <Input
                id="bk-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.supplierCost}
                onChange={e => set('supplierCost', e.target.value)}
                placeholder="0.00"
              />
            </div>
            {serviceMarginActive && (
              <div className="space-y-1.5">
                <Label htmlFor="bk-convenience-fee">Convenience Fee (₹)</Label>
                <Input
                  id="bk-convenience-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.convenienceFee}
                  onChange={e => set('convenienceFee', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bk-advance">Advance Paid by Customer (₹)</Label>
              <Input
                id="bk-advance"
                type="number"
                min="0"
                step="0.01"
                value={form.advance}
                onChange={e => set('advance', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-supplier-paid">Amount Paid to Supplier (₹)</Label>
              <Input
                id="bk-supplier-paid"
                type="number"
                min="0"
                step="0.01"
                value={form.supplierPaid}
                onChange={e => set('supplierPaid', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-gst">GST Rate (%)</Label>
              <Select value={form.gstRate} onValueChange={v => set('gstRate', v)}>
                <SelectTrigger id="bk-gst">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(serviceMarginActive ? SERVICE_FEE_GST_RATES : ['0', '5', '12', '18', '28']).map(r => (
                    <SelectItem key={r} value={r}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-gst-mode">GST Mode</Label>
              <Select value={form.gstMode} onValueChange={v => set('gstMode', v as 'INCLUDED' | 'EXCLUDED')}>
                <SelectTrigger id="bk-gst-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXCLUDED">Excluded — add GST on top</SelectItem>
                  <SelectItem value="INCLUDED">Included — price includes GST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bk-status">Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v as BookingStatus)}>
                <SelectTrigger id="bk-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bk-notes">Notes</Label>
              <Input
                id="bk-notes"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Additional instructions, remarks…"
              />
            </div>
          </div>

          {/* ── Type-specific detail fields ─────────────────── */}
          {(DETAIL_FIELDS[form.type]?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 capitalize">
                  {form.type} Details
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {DETAIL_FIELDS[form.type]!.map(field => (
                  <div key={field.key} className={cn('space-y-1.5', field.span === 'full' && 'sm:col-span-2')}>
                    <Label htmlFor={`detail-${field.key}`}>{field.label}</Label>
                    {field.type === 'textarea' ? (
                      <Textarea
                        id={`detail-${field.key}`}
                        value={form.detailStr[field.key] ?? ''}
                        onChange={e => set('detailStr', { ...form.detailStr, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        rows={3}
                        className="text-sm"
                      />
                    ) : (
                      <Input
                        id={`detail-${field.key}`}
                        type={field.type}
                        value={form.detailStr[field.key] ?? ''}
                        onChange={e => set('detailStr', { ...form.detailStr, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial summary preview — driven by calcBookingFinance(), the
              single source of truth. Switches layout for Service Margin Mode
              (GST only on convenience fee) vs standard bookings. */}
          {preview && (
            <div className="bg-gray-50 rounded-xl p-3.5 space-y-2 text-xs">
              {serviceMarginActive ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Supplier Cost</span>
                    <span className="font-semibold text-gray-700">{formatCurrency(parseAmount(form.supplierCost) ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Convenience Fee</span>
                    <span className="font-semibold text-gray-700">{formatCurrency(preview.convenienceFee)}</span>
                  </div>
                  <div className="h-px bg-gray-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Taxable Fee</span>
                    <span className="font-semibold text-gray-700">{formatCurrency(preview.taxableFee)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">GST on Fee ({form.gstRate || 0}%, {form.gstMode === 'INCLUDED' ? 'included' : 'excluded'})</span>
                    <span className="font-semibold text-gray-700">{formatCurrency(preview.gstOnFee)}</span>
                  </div>
                  <div className="h-px bg-gray-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Final Invoice Total</span>
                    <span className="font-bold text-gray-900">{formatCurrency(preview.totalPayable ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Actual Earnings</span>
                    <span className={cn('font-bold', preview.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {formatCurrency(preview.grossMargin)}
                      {' '}({preview.marginPct.toFixed(1)}%)
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Taxable Amount</span>
                    <span className="font-semibold text-gray-700">{formatCurrency(preview.taxableAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">GST Amount ({form.gstRate || 0}%)</span>
                    <span className="font-semibold text-gray-700">{formatCurrency(preview.gstAmount)}</span>
                  </div>
                  <div className="h-px bg-gray-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Total Payable</span>
                    <span className="font-bold text-gray-900">{formatCurrency(preview.totalPayable ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Estimated Margin</span>
                    <span className={cn('font-bold', preview.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {formatCurrency(preview.grossMargin)}
                      {' '}({preview.marginPct.toFixed(1)}%)
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Receivables linked to this booking — edit mode only */}
          {isEdit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-indigo-600" /> Receivables
                </Label>
                <Button
                  size="sm" variant="outline" type="button"
                  className="gap-1.5 text-xs"
                  onClick={() => setRecFormOpen(true)}
                >
                  <Plus className="w-3 h-3" /> Add Receivable
                </Button>
              </div>

              {bookingReceivables.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center bg-gray-50 rounded-lg">No receivables linked to this booking</p>
              ) : (
                <div className="space-y-1.5">
                  {bookingReceivables.map(r => {
                    const fin = calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries, dueDate: r.dueDate });
                    return (
                      <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-gray-700">{formatCurrency(r.invoiceAmount)}</span>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-500">Balance {formatCurrency(fin.balanceDue)}</span>
                        </div>
                        <span className={cn('px-1.5 py-0.5 rounded-full font-medium text-[10px] flex-shrink-0', RECEIVABLE_STATUS_CLASS[fin.status])}>
                          {RECEIVABLE_STATUS_LABEL[fin.status]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>{isEdit ? 'Save Changes' : 'Create Booking'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {isEdit && booking && (
      <ReceivableForm
        open={recFormOpen}
        onClose={() => setRecFormOpen(false)}
        onSave={(data) => {
          createReceivable({
            ...data,
            customerId:    data.customerId    ?? booking.customerId,
            customerName:  data.customerName  ?? booking.customerName,
            bookingId:     booking.id,
            tripId:        data.tripId        ?? booking.refId,
            invoiceAmount: data.invoiceAmount ?? (booking.totalPayable ?? 0),
          });
          toast.success('Receivable added');
          setRecFormOpen(false);
        }}
        defaults={{
          customerId:    booking.customerId,
          customerName:  booking.customerName,
          bookingId:     booking.id,
          tripId:        booking.refId,
          invoiceAmount: booking.totalPayable ?? undefined,
          description:   `${booking.type} booking — ${booking.id}`,
        }}
      />
    )}

    <CustomerQuickCreate
      open={quickCreateOpen}
      onClose={() => setQuickCreateOpen(false)}
      onCreated={cust => {
        setForm(f => ({ ...f, customerId: cust.id, customerName: cust.name }));
      }}
    />
    </>
  );
}

// ─── Main Module ──────────────────────────────────────────────

export default function Bookings() {
  const navigate      = useNavigate();
  const bookings      = useStore(s => s.bookings);
  const trips         = useStore(s => s.trips);
  const deleteBooking = useStore(s => s.deleteBooking);

  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState<BookingType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [formOpen,    setFormOpen]    = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function closeForm() {
    setFormOpen(false);
    setEditBooking(null);
  }

  async function handleDeleteBooking(b: Booking) {
    const ok = await confirm({
      title:        `Delete booking ${b.id}?`,
      description:  `This will permanently delete the ${b.type} booking for ${b.customerName}. This action cannot be undone.`,
      confirmLabel: 'Delete Booking',
      cancelLabel:  'Cancel',
      variant:      'destructive',
    });
    if (!ok) return;
    setDeletingId(b.id);
    try {
      deleteBooking(b.id);
      toast.success('Booking deleted', `${b.type} booking for ${b.customerName} removed`);
    } finally {
      setDeletingId(null);
    }
  }

  // ── Stats ────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalValue     = bookings.reduce((s, b) => s + (b.totalPayable ?? 0), 0);
    const totalCost      = bookings.reduce((s, b) => s + (b.supplierCost ?? 0), 0);
    const totalBalance   = bookings.reduce((s, b) => s + (b.balanceDue ?? 0), 0);
    const totalMargin    = bookings.reduce((s, b) => s + (b.grossMargin ?? 0), 0);
    const byType: Record<string, number> = {};
    for (const b of bookings) byType[b.type] = (byType[b.type] ?? 0) + 1;
    return { totalValue, totalCost, totalBalance, totalMargin, byType };
  }, [bookings]);

  // ── Filter ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = bookings;
    if (typeFilter !== 'all') list = list.filter(b => b.type === typeFilter);
    if (statusFilter !== 'all') list = list.filter(b => b.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.customerName.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)           ||
        (b.refId || '').toLowerCase().includes(q) ||
        b.type.includes(q)
      );
    }
    return list;
  }, [bookings, typeFilter, statusFilter, search]);

  // ── Trip lookup ──────────────────────────────────────────────

  const tripMap = useMemo(() => {
    const m: Record<string, Trip> = {};
    for (const t of trips) m[t.id] = t;
    return m;
  }, [trips]);

  const hasFilters = typeFilter !== 'all' || statusFilter !== 'all' || search.trim();

  // ── Bulk selection ───────────────────────────────────────────

  const filteredIds = useMemo(() => filtered.map(b => b.id), [filtered]);
  const bulkSel = useBulkSelection(filteredIds);

  async function handleBulkDelete() {
    const ids = Array.from(bulkSel.selected);
    if (ids.length === 0) return;
    const ok = await confirm({
      title:        `Delete ${ids.length} booking${ids.length > 1 ? 's' : ''}?`,
      description:  `This will permanently delete the selected booking${ids.length > 1 ? 's' : ''}. This action cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel:  'Cancel',
      variant:      'destructive',
    });
    if (!ok) return;
    setBulkDeleting(true);
    try {
      for (const id of ids) deleteBooking(id);
      toast.success(`${ids.length} booking${ids.length > 1 ? 's' : ''} deleted`);
      bulkSel.clear();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Bookings</h2>
          <Badge variant="secondary">{bookings.length} total</Badge>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Booking
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Value',
            value: formatCurrencyShort(stats.totalValue),
            icon: IndianRupee,
            color: 'text-indigo-600 bg-indigo-50',
          },
          {
            label: 'Supplier Cost',
            value: formatCurrencyShort(stats.totalCost),
            icon: Package,
            color: 'text-gray-600 bg-gray-100',
          },
          {
            label: 'Balance Due',
            value: formatCurrencyShort(stats.totalBalance),
            icon: Clock,
            color: stats.totalBalance > 0 ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50',
          },
          {
            label: 'Gross Margin',
            value: formatCurrencyShort(stats.totalMargin),
            icon: stats.totalMargin >= 0 ? CheckCircle : AlertTriangle,
            color: stats.totalMargin >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', card.color)}>
              <card.icon className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-gray-900 font-display">{card.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            'flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all',
            typeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          All ({bookings.length})
        </button>
        {BOOKING_TYPES.filter(t => (stats.byType[t] ?? 0) > 0).map(t => {
          const Icon = TYPE_ICON[t];
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all capitalize',
                typeFilter === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <Icon className="w-3 h-3" />
              {t} ({stats.byType[t]})
            </button>
          );
        })}
      </div>

      {/* Search + status filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by customer, ID, or trip…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-gray-700 outline-none flex-1 placeholder:text-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <button
            onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setSearch(''); }}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        count={bulkSel.count}
        itemLabel="booking"
        onClear={bulkSel.clear}
        onDelete={handleBulkDelete}
        deleting={bulkDeleting}
      />

      {/* Bookings table */}
      {filtered.length === 0 ? (
        bookings.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No bookings yet"
            description="Create your first booking — flight, hotel, visa, or any other travel service"
            action={{ label: '+ New Booking', onClick: () => setFormOpen(true) }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No bookings match your filters"
            action={{ label: 'Clear filters', onClick: () => { setTypeFilter('all'); setStatusFilter('all'); setSearch(''); } }}
          />
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <span className="text-xs text-gray-500">{filtered.length} booking{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={bulkSel.allSelected}
                      onChange={bulkSel.toggleAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label="Select all bookings"
                    />
                  </th>
                  {['Type', 'Customer', 'Linked Trip', 'Selling Price', 'Cost', 'Balance', 'Margin', 'Status', 'Date'].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-400 px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="text-right text-[11px] font-semibold text-gray-400 px-4 py-3 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(b => {
                  const Icon       = TYPE_ICON[b.type] ?? HelpCircle;
                  const finStatus  = getFinancialStatus(b.totalPayable, b.advance);
                  const statusCfg  = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
                  const typeClr    = TYPE_COLOR[b.type]   ?? TYPE_COLOR.other;
                  const linkedTrip = b.refId ? tripMap[b.refId] : null;
                  const linkedDest = linkedTrip?.destination;

                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-gray-50/70 transition-colors cursor-pointer"
                      onClick={() => navigate(`/bookings/${b.id}`)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={bulkSel.selected.has(b.id)}
                          onChange={() => bulkSel.toggle(b.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Select booking ${b.id}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium capitalize', typeClr)}>
                            <Icon className="w-3 h-3" />
                            {b.type}
                          </div>
                          {b.serviceMarginMode && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100"
                              title="GST charged only on convenience fee">
                              GST on Fee
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 text-sm">{b.customerName}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{b.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {b.refId ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/trips/${b.refId}`); }}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            {b.refId}
                            <RecordNumberBadge label="Trip" n={linkedTrip?.tripNumber} className="ml-1" />
                            {linkedDest && <span className="text-gray-400 ml-1">({linkedDest})</span>}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        {b.totalPayable !== null ? formatCurrency(b.totalPayable) : (
                          <span className="text-amber-600 text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Not set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {b.supplierCost > 0 ? formatCurrency(b.supplierCost) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={cn('px-4 py-3 font-medium text-sm', b.balanceDue > 0 ? 'text-red-600' : 'text-gray-400')}>
                        {formatCurrency(b.balanceDue)}
                      </td>
                      <td className={cn('px-4 py-3 text-sm font-semibold', b.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {formatCurrency(b.grossMargin)}
                        {b.totalPayable && b.totalPayable > 0 && (
                          <div className="text-[10px] font-normal text-gray-400">
                            {b.marginPct.toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full', statusCfg.class)}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {fmtDate(b.createdDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/bookings/${b.id}`); }}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors"
                            title="View booking & payments"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditBooking(b); }}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                            title="Edit booking"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteBooking(b); }}
                            disabled={deletingId === b.id}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Delete booking"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-6 text-xs text-gray-500">
              <span>
                Value: <strong className="text-gray-800">{formatCurrency(filtered.reduce((s, b) => s + (b.totalPayable ?? 0), 0))}</strong>
              </span>
              <span>
                Cost: <strong className="text-gray-800">{formatCurrency(filtered.reduce((s, b) => s + b.supplierCost, 0))}</strong>
              </span>
              <span>
                Balance: <strong className="text-red-600">{formatCurrency(filtered.reduce((s, b) => s + b.balanceDue, 0))}</strong>
              </span>
              <span>
                Margin: <strong className="text-emerald-600">{formatCurrency(filtered.reduce((s, b) => s + b.grossMargin, 0))}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      <BookingFormDialog
        open={formOpen || !!editBooking}
        booking={editBooking}
        onClose={closeForm}
      />
    </div>
  );
}
