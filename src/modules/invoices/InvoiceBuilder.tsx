import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, AlertCircle, FileWarning } from 'lucide-react';
import { useStore, selectors } from '@/store';
import apiClient from '@/lib/apiClient';
import { today } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import {
  GST_STATE_CODES, getStateCodeFromGstin, determineGstType, splitGst, sumGstSplits,
  SERVICE_TYPE_OPTIONS, type GstSplitType,
} from '@/shared/utils/gst';
import type { Booking, Trip, InvoiceLineItemInput } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/shared/components/ui/select';

const GST_RATES = [0, 5, 12, 18, 28];

const BOOKING_TYPE_LABEL: Record<string, string> = {
  flight: 'Flight Booking', hotel: 'Hotel Booking', train: 'Train Booking',
  bus: 'Bus Booking', cab: 'Cab / Transfer', visa: 'Visa Service',
  insurance: 'Travel Insurance', activity: 'Activity', other: 'Service',
};

interface LineRow extends InvoiceLineItemInput {
  key:     string;
  tripId?: string | null;
}

function makeKey(): string {
  return Math.random().toString(36).slice(2);
}

function emptyRow(): LineRow {
  return {
    key: makeKey(), description: '', hsnSac: '9985', serviceType: 'other',
    bookingId: null, tripId: null, quantity: 1, rate: 0, gstRate: 5,
  };
}

export default function InvoiceBuilder() {
  const navigate        = useNavigate();
  const { id: routeId } = useParams<{ id?: string }>();
  const isEdit          = !!routeId;
  const existing        = useStore(selectors.invoiceById(routeId ?? ''));

  const customers          = useStore(s => s.customers);
  const companySettings    = useStore(s => s.companySettings);
  const createInvoice      = useStore(s => s.createInvoice);
  const updateInvoice      = useStore(s => s.updateInvoice);

  const [customerId,   setCustomerId]   = useState(existing?.customerId ?? '');
  const [customerName, setCustomerName] = useState(existing?.customerName ?? '');
  const [customerAddress, setCustomerAddress] = useState(existing?.customerAddress ?? '');
  const [customerGstin, setCustomerGstin] = useState(existing?.customerGstin ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(existing?.placeOfSupply ?? '');
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] =
    useState(existing?.customerStateCode ?? '');
  const [invoiceDate, setInvoiceDate] = useState(existing?.invoiceDate ?? today());
  const [dueDate,     setDueDate]     = useState(existing?.dueDate ?? '');
  const [notes,       setNotes]       = useState(existing?.notes ?? '');
  const [termsAndConds, setTermsAndConds] = useState(
    existing?.termsAndConds ?? companySettings?.invoiceTerms ?? '',
  );

  const [items, setItems] = useState<LineRow[]>(() =>
    existing?.items.length
      ? existing.items.map(it => ({
          key: it.id, description: it.description, hsnSac: it.hsnSac ?? '',
          serviceType: it.serviceType ?? 'other', bookingId: it.bookingId ?? null,
          tripId: null, quantity: it.quantity, rate: it.rate, gstRate: it.gstRate,
        }))
      : [emptyRow()],
  );

  const [eligible, setEligible] = useState<{ bookings: Booking[]; trips: Trip[] }>({ bookings: [], trips: [] });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Selected booking/trip ids derived from items that reference them
  const selectedBookingIds = useMemo(
    () => new Set(items.map(i => i.bookingId).filter((v): v is string => !!v)),
    [items],
  );
  const selectedTripIds = useMemo(
    () => new Set(items.map(i => i.tripId).filter((v): v is string => !!v)),
    [items],
  );

  // Fetch eligible bookings/trips when customer changes (new invoices only)
  useEffect(() => {
    if (isEdit || !customerId) { setEligible({ bookings: [], trips: [] }); return; }
    let cancelled = false;
    apiClient.get(`/invoices/eligible/${customerId}`)
      .then(res => { if (!cancelled) setEligible(res.data as { bookings: Booking[]; trips: Trip[] }); })
      .catch(() => { if (!cancelled) setEligible({ bookings: [], trips: [] }); });
    return () => { cancelled = true; };
  }, [customerId, isEdit]);

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    const c = customers.find(c => c.id === id);
    if (c) {
      setCustomerName(c.name);
      setCustomerGstin(c.gstNumber ?? '');
      setCustomerAddress(c.billingAddress || c.address || '');
      const stateCode = GST_STATE_CODES.find(s => s.name === c.state)?.code ?? '';
      setPlaceOfSupplyStateCode(stateCode);
      setPlaceOfSupply(c.state ?? '');
    }
    // Reset auto-added line items from a previously selected customer
    setItems(prev => {
      const manual = prev.filter(i => !i.bookingId && !i.tripId);
      return manual.length ? manual : [emptyRow()];
    });
  }

  function toggleBooking(b: Booking) {
    if (selectedBookingIds.has(b.id)) {
      setItems(prev => prev.filter(i => i.bookingId !== b.id));
      return;
    }
    const taxable = b.taxableAmount || b.totalPayable || b.sellingPrice || 0;
    setItems(prev => {
      const base = prev.length === 1 && !prev[0].description && !prev[0].bookingId && !prev[0].tripId
        ? [] : prev;
      return [...base, {
        key: makeKey(),
        description: `${BOOKING_TYPE_LABEL[b.type] ?? 'Service'} — ${b.customerName}${b.refId ? ` (Trip ${b.refId})` : ''}`,
        hsnSac: SERVICE_TYPE_OPTIONS.find(s => s.value === b.type)?.sac ?? '9985',
        serviceType: b.type,
        bookingId: b.id,
        tripId: null,
        quantity: 1,
        rate: round2(taxable),
        gstRate: b.gstRate ?? 5,
      }];
    });
  }

  function toggleTrip(t: Trip) {
    if (selectedTripIds.has(t.id)) {
      setItems(prev => prev.filter(i => i.tripId !== t.id));
      return;
    }
    const taxable = t.taxableAmount || t.totalPayable || t.totalAmount || 0;
    setItems(prev => {
      const base = prev.length === 1 && !prev[0].description && !prev[0].bookingId && !prev[0].tripId
        ? [] : prev;
      return [...base, {
        key: makeKey(),
        description: `${t.type || 'Tour Package'} — ${t.destination}`,
        hsnSac: SERVICE_TYPE_OPTIONS.find(s => s.value === 'package')?.sac ?? '9985',
        serviceType: 'package',
        bookingId: null,
        tripId: t.id,
        quantity: 1,
        rate: round2(taxable),
        gstRate: t.gstRate ?? 5,
      }];
    });
  }

  function addRow() {
    setItems(prev => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function updateRow<K extends keyof LineRow>(key: string, field: K, value: LineRow[K]) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));
  }

  // ── Live GST preview ──────────────────────────────────────
  const companyStateCode = companySettings?.stateCode ?? getStateCodeFromGstin(companySettings?.gstin);
  const gstType: GstSplitType = determineGstType(companyStateCode, placeOfSupplyStateCode || null);

  const totals = useMemo(() => {
    const splits = items
      .filter(i => i.description.trim() && i.rate > 0)
      .map(i => splitGst((i.quantity ?? 1) * i.rate, i.gstRate, gstType));
    return sumGstSplits(splits);
  }, [items, gstType]);

  const isFrozen = !!(existing && companySettings?.gstFrozenUntil && existing.invoiceDate <= companySettings.gstFrozenUntil);
  const isCancelled = existing?.status === 'CANCELLED';

  async function handleSave() {
    if (!customerName.trim()) { setError('Customer name is required'); return; }
    const validItems = items.filter(i => i.description.trim() && i.rate > 0);
    if (validItems.length === 0) { setError('Add at least one line item with a description and amount'); return; }

    setError('');
    setSaving(true);
    try {
      const cleanItems = validItems.map(({ key: _key, tripId: _tripId, ...rest }) => rest);
      if (isEdit && existing) {
        const res = await updateInvoice(existing.id, {
          invoiceDate, dueDate: dueDate || null,
          customerName, customerAddress: customerAddress || null, customerGstin: customerGstin || null,
          placeOfSupply: placeOfSupply || null, placeOfSupplyStateCode: placeOfSupplyStateCode || null,
          notes: notes || null, termsAndConds: termsAndConds || null,
          items: cleanItems,
        });
        if (res.ok && res.invoice) {
          toast.success('Invoice updated', res.invoice.invoiceNumber);
          navigate(`/invoices/${res.invoice.id}`);
        } else {
          setError(res.reason ?? 'Failed to update invoice');
        }
      } else {
        const res = await createInvoice({
          invoiceDate, dueDate: dueDate || null,
          customerId: customerId || null, customerName,
          customerAddress: customerAddress || null, customerGstin: customerGstin || null,
          placeOfSupply: placeOfSupply || null, placeOfSupplyStateCode: placeOfSupplyStateCode || null,
          notes: notes || null, termsAndConds: termsAndConds || null,
          bookingIds: [...selectedBookingIds],
          tripIds:    [...selectedTripIds],
          items: cleanItems,
        });
        if (res.ok && res.invoice) {
          toast.success('Invoice created', res.invoice.invoiceNumber);
          navigate(`/invoices/${res.invoice.id}`);
        } else {
          setError(res.reason ?? 'Failed to create invoice');
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && !existing) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Invoice not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')} className="mt-3">← Back to Invoices</Button>
      </div>
    );
  }

  if (isCancelled || isFrozen) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>{isCancelled ? 'This invoice has been cancelled and cannot be edited.' : 'This invoice falls in a GST-frozen period and cannot be edited.'}</p>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${existing!.id}`)} className="mt-3">← Back to Invoice</Button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button onClick={() => navigate(isEdit ? `/invoices/${existing!.id}` : '/invoices')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {isEdit ? 'Back to Invoice' : 'Back to Invoices'}
        </button>
        <h2 className="text-base font-bold text-gray-900 font-display">
          {isEdit ? `Edit Invoice ${existing?.invoiceNumber}` : 'New GST Invoice'}
        </h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Customer & Invoice Info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Customer & Invoice Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!isEdit && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Select Customer</Label>
              <Select value={customerId} onValueChange={handleCustomerChange}>
                <SelectTrigger><SelectValue placeholder="Choose an existing customer (optional)" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.companyName ? ` — ${c.companyName}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="inv-customer-name" required>Customer / Bill To Name</Label>
            <Input id="inv-customer-name" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-customer-gstin">Customer GSTIN</Label>
            <Input id="inv-customer-gstin" className="uppercase" value={customerGstin ?? ''} onChange={e => setCustomerGstin(e.target.value)} placeholder="27ABCDE1234F1Z5" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inv-customer-address">Customer Address</Label>
            <Textarea id="inv-customer-address" rows={2} value={customerAddress ?? ''} onChange={e => setCustomerAddress(e.target.value)} placeholder="Billing address" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-pos">Place of Supply (State)</Label>
            <Select value={placeOfSupplyStateCode || ''} onValueChange={code => {
              setPlaceOfSupplyStateCode(code);
              setPlaceOfSupply(GST_STATE_CODES.find(s => s.code === code)?.name ?? '');
            }}>
              <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent>
                {GST_STATE_CODES.map(s => (
                  <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-date" required>Invoice Date</Label>
            <Input id="inv-date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-due">Due Date</Label>
            <Input id="inv-due" type="date" value={dueDate ?? ''} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>GST Type</Label>
            <div className="h-9 flex items-center px-3 rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
              {gstType === 'INTRA' ? 'Intra-state — CGST + SGST' : 'Inter-state — IGST'}
            </div>
          </div>
        </div>
      </div>

      {/* Eligible bookings/trips */}
      {!isEdit && customerId && (eligible.bookings.length > 0 || eligible.trips.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Add From Confirmed Bookings / Trips</h3>
          <p className="text-xs text-gray-400">Select items to auto-fill line items below. Each can only be invoiced once.</p>
          <div className="space-y-1.5">
            {eligible.bookings.map(b => (
              <label key={b.id} className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors',
                selectedBookingIds.has(b.id) ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50',
              )}>
                <input type="checkbox" checked={selectedBookingIds.has(b.id)} onChange={() => toggleBooking(b)} className="accent-indigo-600" />
                <span className="text-xs flex-1">
                  <span className="font-semibold text-gray-800">{BOOKING_TYPE_LABEL[b.type] ?? b.type}</span>
                  {b.refId && <span className="text-gray-400 ml-1 font-mono">Trip {b.refId}</span>}
                </span>
                <span className="text-xs font-semibold text-gray-700">{formatCurrency(b.totalPayable)}</span>
              </label>
            ))}
            {eligible.trips.map(t => (
              <label key={t.id} className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors',
                selectedTripIds.has(t.id) ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50',
              )}>
                <input type="checkbox" checked={selectedTripIds.has(t.id)} onChange={() => toggleTrip(t)} className="accent-indigo-600" />
                <span className="text-xs flex-1">
                  <span className="font-semibold text-gray-800">{t.type || 'Tour Package'}</span>
                  <span className="text-gray-400 ml-1">— {t.destination}</span>
                </span>
                <span className="text-xs font-semibold text-gray-700">{formatCurrency(t.totalPayable)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Line Items</h3>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
            <Plus className="w-3.5 h-3.5" /> Add Line Item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['Description', 'HSN/SAC', 'Qty', 'Rate', 'GST %', 'Amount', ''].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-2 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => {
                const split = splitGst((item.quantity ?? 1) * item.rate, item.gstRate, gstType);
                return (
                  <tr key={item.key}>
                    <td className="px-2 py-2 min-w-[220px]">
                      <Input value={item.description} onChange={e => updateRow(item.key, 'description', e.target.value)} placeholder="Description" />
                    </td>
                    <td className="px-2 py-2 w-28">
                      <Input value={item.hsnSac ?? ''} onChange={e => updateRow(item.key, 'hsnSac', e.target.value)} placeholder="9985" />
                    </td>
                    <td className="px-2 py-2 w-20">
                      <Input type="number" min={1} value={item.quantity ?? 1} onChange={e => updateRow(item.key, 'quantity', Number(e.target.value) || 1)} />
                    </td>
                    <td className="px-2 py-2 w-32">
                      <Input type="number" min={0} value={item.rate} onChange={e => updateRow(item.key, 'rate', Number(e.target.value) || 0)} />
                    </td>
                    <td className="px-2 py-2 w-24">
                      <Select value={String(item.gstRate)} onValueChange={v => updateRow(item.key, 'gstRate', Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{formatCurrency(split.totalAmount)}</td>
                    <td className="px-2 py-2">
                      <Button size="icon-sm" variant="ghost" onClick={() => removeRow(item.key)} disabled={items.length === 1}>
                        <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes & terms */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-notes">Notes</Label>
          <Textarea id="inv-notes" rows={3} value={notes ?? ''} onChange={e => setNotes(e.target.value)} placeholder="Internal notes (not printed)" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-terms">Terms &amp; Conditions</Label>
          <Textarea id="inv-terms" rows={3} value={termsAndConds ?? ''} onChange={e => setTermsAndConds(e.target.value)} placeholder="Payment terms, etc." />
        </div>
      </div>

      {/* Totals summary */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">GST Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 uppercase font-semibold">Taxable</div>
            <div className="text-sm font-bold text-gray-900">{formatCurrency(totals.taxableAmount)}</div>
          </div>
          {gstType === 'INTRA' ? (
            <>
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">CGST</div>
                <div className="text-sm font-bold text-gray-900">{formatCurrency(totals.cgstAmount)}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">SGST</div>
                <div className="text-sm font-bold text-gray-900">{formatCurrency(totals.sgstAmount)}</div>
              </div>
            </>
          ) : (
            <div className="p-3 bg-gray-50 rounded-xl sm:col-span-2">
              <div className="text-[10px] text-gray-400 uppercase font-semibold">IGST</div>
              <div className="text-sm font-bold text-gray-900">{formatCurrency(totals.igstAmount)}</div>
            </div>
          )}
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 uppercase font-semibold">Total GST</div>
            <div className="text-sm font-bold text-gray-900">{formatCurrency(totals.totalGstAmount)}</div>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl">
            <div className="text-[10px] text-indigo-400 uppercase font-semibold">Grand Total</div>
            <div className="text-sm font-bold text-indigo-700">{formatCurrency(totals.totalAmount)}</div>
          </div>
        </div>
        {!companySettings?.gstin && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <FileWarning className="w-3.5 h-3.5 flex-shrink-0" />
            Company GSTIN is not set. Configure it under Settings → Company Master for accurate GST type detection.
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 bg-white border-t border-gray-200 px-5 py-3 flex items-center justify-end gap-3 z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate(isEdit ? `/invoices/${existing!.id}` : '/invoices')}>Cancel</Button>
        <Button size="sm" className="gap-1.5" loading={saving} onClick={handleSave}>
          <Save className="w-3.5 h-3.5" /> {isEdit ? 'Save Changes' : 'Generate Invoice'}
        </Button>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
