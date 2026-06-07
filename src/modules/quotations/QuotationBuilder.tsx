import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Save, Copy, Send,
  CheckCircle, XCircle, IndianRupee, AlertCircle,
} from 'lucide-react';
import { useStore } from '@/store';
import type { QuotationCategory, QuotationItem, QuotationStatus } from '@/shared/types';
import { formatCurrency } from '@/shared/utils/format';
import { calcGst } from '@/shared/utils/finance';
import type { GstMode } from '@/shared/types';
import { today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { uid } from '@/shared/utils/id';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';

// ─── Category metadata ────────────────────────────────────────

export const QUOTE_CATEGORIES: { value: QuotationCategory; label: string; emoji: string }[] = [
  { value: 'hotel',     label: 'Hotel',     emoji: '🏨' },
  { value: 'flight',    label: 'Flight',    emoji: '✈️' },
  { value: 'transfer',  label: 'Transfer',  emoji: '🚗' },
  { value: 'activity',  label: 'Activity',  emoji: '🎯' },
  { value: 'visa',      label: 'Visa',      emoji: '📋' },
  { value: 'insurance', label: 'Insurance', emoji: '🛡️' },
  { value: 'misc',      label: 'Misc',      emoji: '📦' },
];

// ─── Types for local builder state ───────────────────────────

interface BuilderItem extends Partial<QuotationItem> {
  _tempId: string;
  category: QuotationCategory;
  description: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
}

function makeEmptyItem(): BuilderItem {
  return {
    _tempId:      uid(),
    category:     'hotel',
    description:  '',
    quantity:     1,
    costPrice:    0,
    sellingPrice: 0,
    vendorId:     undefined,
    vendorName:   undefined,
    sortOrder:    0,
  };
}

function calcItemTotals(item: BuilderItem) {
  const qty     = item.quantity     || 0;
  const cost    = item.costPrice    || 0;
  const selling = item.sellingPrice || 0;
  const totalCost    = cost    * qty;
  const totalSelling = selling * qty;
  const grossProfit  = totalSelling - totalCost;
  const marginPct    = totalSelling > 0 ? (grossProfit / totalSelling) * 100 : 0;
  const markup       = cost       > 0 ? ((selling - cost) / cost) * 100 : 0;
  return { totalCost, totalSelling, grossProfit, marginPct, markup };
}

// ─── Component ───────────────────────────────────────────────

export default function QuotationBuilder() {
  const navigate             = useNavigate();
  const { id }               = useParams<{ id: string }>();
  const isEdit               = !!id && id !== 'new';

  const quotations           = useStore(s => s.quotations);
  const vendors              = useStore(s => s.vendors);
  const customers            = useStore(s => s.customers);
  const createQuotation      = useStore(s => s.createQuotation);
  const updateQuotation      = useStore(s => s.updateQuotation);
  const setQuotationStatus   = useStore(s => s.setQuotationStatus);
  const duplicateQuotation   = useStore(s => s.duplicateQuotation);

  const existing = isEdit ? quotations.find(q => q.id === id) : null;

  // ── Header state ──────────────────────────────────────────

  const [customerName,  setCustomerName]  = useState(existing?.customerName  ?? '');
  const [customerPhone, setCustomerPhone] = useState(existing?.customerPhone ?? '');
  const [customerEmail, setCustomerEmail] = useState(existing?.customerEmail ?? '');
  const [destination,   setDestination]   = useState(existing?.destination   ?? '');
  const [startDate,     setStartDate]     = useState(existing?.startDate     ?? '');
  const [endDate,       setEndDate]       = useState(existing?.endDate       ?? '');
  const [pax,           setPax]           = useState(existing?.pax           ?? 1);
  const [notes,         setNotes]         = useState(existing?.notes         ?? '');
  const [validUntil,    setValidUntil]    = useState(existing?.validUntil    ?? '');
  const [termsAndConds, setTermsAndConds] = useState(
    existing?.termsAndConds ??
    '• Prices are subject to availability at the time of confirmation.\n• 50% advance required to confirm the booking.\n• Balance to be paid 7 days before departure.\n• Cancellation charges apply as per supplier policy.'
  );
  const [inclusions, setInclusions] = useState(
    existing?.inclusions ??
    '• Accommodation as per itinerary (twin/double sharing)\n• All airport and hotel transfers\n• Daily breakfast\n• Guided sightseeing as per programme\n• All toll taxes, parking fees and driver allowances'
  );
  const [exclusions, setExclusions] = useState(
    existing?.exclusions ??
    '• International / domestic airfare\n• Visa fees and travel insurance\n• Personal expenses (laundry, telephone, tips)\n• Meals not mentioned in the itinerary\n• Any activities not mentioned in the package'
  );
  const [paymentPolicy, setPaymentPolicy] = useState(
    existing?.paymentPolicy ??
    '• 50% advance required at the time of booking confirmation\n• Balance payment due 7 days prior to departure\n• Payments accepted via NEFT/RTGS, UPI, or credit card\n• Receipts will be provided for all payments'
  );
  const [gstRate, setGstRate] = useState<number>(existing?.gstRate ?? 0);
  const [gstMode, setGstMode] = useState<GstMode>(existing?.gstMode ?? 'EXCLUDED');

  // ── Link to customer ──────────────────────────────────────
  const [customerId, setCustomerId] = useState(existing?.customerId ?? '');

  // ── Items state ───────────────────────────────────────────

  const [items, setItems] = useState<BuilderItem[]>(() => {
    if (existing?.items.length) {
      return existing.items.map(it => ({ ...it, _tempId: it.id || uid() } as BuilderItem));
    }
    return [makeEmptyItem()];
  });

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Reset when existing changes (edit mode re-load)
  useEffect(() => {
    if (existing) {
      setCustomerName(existing.customerName  ?? '');
      setCustomerPhone(existing.customerPhone ?? '');
      setCustomerEmail(existing.customerEmail ?? '');
      setDestination(existing.destination    ?? '');
      setStartDate(existing.startDate        ?? '');
      setEndDate(existing.endDate            ?? '');
      setPax(existing.pax                    ?? 1);
      setNotes(existing.notes                ?? '');
      setValidUntil(existing.validUntil      ?? '');
      setTermsAndConds(existing.termsAndConds ?? '');
      setInclusions(existing.inclusions      ?? '');
      setExclusions(existing.exclusions      ?? '');
      setPaymentPolicy(existing.paymentPolicy ?? '');
      setGstRate(existing.gstRate            ?? 0);
      setGstMode(existing.gstMode            ?? 'EXCLUDED');
      setCustomerId(existing.customerId      ?? '');
      if (existing.items.length) {
        setItems(existing.items.map(it => ({ ...it, _tempId: it.id || uid() } as BuilderItem)));
      }
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live financial summary ────────────────────────────────

  const summary = useMemo(() => {
    const calcs = items.map(calcItemTotals);
    const totalCost    = calcs.reduce((s, c) => s + c.totalCost,    0);
    const totalSelling = calcs.reduce((s, c) => s + c.totalSelling, 0);
    const gst          = calcGst(totalSelling, gstRate, gstMode);
    const grossProfit  = totalSelling - totalCost;
    const marginPct    = totalSelling > 0 ? (grossProfit / totalSelling) * 100 : 0;
    return {
      totalCost, totalSelling, grossProfit, marginPct,
      taxableAmount: gst.taxableAmount,
      gstAmount:     gst.gstAmount,
      totalPayable:  gst.totalPayable,
    };
  }, [items, gstRate, gstMode]);

  // Per-category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { cost: number; selling: number }> = {};
    for (const it of items) {
      if (!map[it.category]) map[it.category] = { cost: 0, selling: 0 };
      const c = calcItemTotals(it);
      map[it.category].cost    += c.totalCost;
      map[it.category].selling += c.totalSelling;
    }
    return map;
  }, [items]);

  // ── Item CRUD ─────────────────────────────────────────────

  const addItem = useCallback(() => {
    setItems(prev => [...prev, { ...makeEmptyItem(), sortOrder: prev.length }]);
  }, []);

  const updateItem = useCallback((tempId: string, field: keyof BuilderItem, value: unknown) => {
    setItems(prev => prev.map(it =>
      it._tempId === tempId ? { ...it, [field]: value } : it
    ));
  }, []);

  const removeItem = useCallback((tempId: string) => {
    setItems(prev => prev.filter(it => it._tempId !== tempId));
  }, []);

  const moveItem = useCallback((tempId: string, dir: -1 | 1) => {
    setItems(prev => {
      const idx = prev.findIndex(it => it._tempId === tempId);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((it, i) => ({ ...it, sortOrder: i }));
    });
  }, []);

  // ── Validate + Save ───────────────────────────────────────

  function buildPayload(status: QuotationStatus = 'draft') {
    return {
      customerId:    customerId || undefined,
      customerName, customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
      destination,  startDate: startDate || undefined,
      endDate:       endDate    || undefined,
      pax,          notes:     notes || undefined,
      validUntil:   validUntil || undefined,
      termsAndConds: termsAndConds || undefined,
      inclusions:   inclusions || undefined,
      exclusions:   exclusions || undefined,
      paymentPolicy: paymentPolicy || undefined,
      gstRate,
      gstMode,
      gstAmount:     summary.gstAmount,
      taxableAmount: summary.taxableAmount,
      status,
      createdDate:  existing?.createdDate ?? today(),
      items: items.map((it, idx) => ({
        id:          it.id,
        category:    it.category,
        description: it.description,
        quantity:    it.quantity,
        costPrice:   it.costPrice,
        sellingPrice: it.sellingPrice,
        vendorId:    it.vendorId    || undefined,
        vendorName:  it.vendorName  || undefined,
        sortOrder:   idx,
      })) as import('@/shared/types').QuotationItem[],
    };
  }

  async function handleSave(status: QuotationStatus = existing?.status ?? 'draft') {
    setError('');
    if (!customerName.trim()) { setError('Customer name is required'); return; }
    if (!destination.trim())  { setError('Destination is required');   return; }
    if (items.every(it => !it.description.trim())) {
      setError('Add at least one line item with a description'); return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(status);
      if (isEdit && existing) {
        updateQuotation(existing.id, payload);
        toast.success('Quotation updated');
        navigate(`/quotations/${existing.id}`);
      } else {
        const q = createQuotation(payload);
        toast.success('Quotation created', q.id);
        navigate(`/quotations/${q.id}`);
      }
    } catch {
      toast.error('Failed to save quotation');
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!isEdit || !existing) return;
    const ok = await confirm({
      title:        'Duplicate quotation?',
      description:  'A copy will be created as a new Draft.',
      confirmLabel: 'Duplicate',
    });
    if (!ok) return;
    const copy = duplicateQuotation(existing.id);
    if (copy) {
      toast.success('Quotation duplicated', copy.id);
      navigate(`/quotations/${copy.id}`);
    }
  }

  async function handleStatusChange(status: QuotationStatus) {
    if (!isEdit || !existing) return;
    setQuotationStatus(existing.id, status);
    toast.success(`Status → ${status}`);
    navigate(`/quotations/${existing.id}`);
  }

  const canSend     = isEdit && existing?.status === 'draft';
  const canAccept   = isEdit && existing?.status === 'sent';
  const canReject   = isEdit && existing?.status === 'sent';

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button onClick={() => navigate(isEdit ? `/quotations/${id}` : '/quotations')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {isEdit ? 'Back to Quotation' : 'Back to Quotations'}
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {isEdit && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleDuplicate}>
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </Button>
          )}
          {canSend && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleStatusChange('sent')}>
              <Send className="w-3.5 h-3.5" /> Mark Sent
            </Button>
          )}
          {canAccept && (
            <Button size="sm" variant="success" className="gap-1.5" onClick={() => handleStatusChange('accepted')}>
              <CheckCircle className="w-3.5 h-3.5" /> Accept
            </Button>
          )}
          {canReject && (
            <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => handleStatusChange('rejected')}>
              <XCircle className="w-3.5 h-3.5" /> Reject
            </Button>
          )}
          <Button size="sm" loading={saving} className="gap-1.5" onClick={() => handleSave()}>
            <Save className="w-3.5 h-3.5" /> Save{isEdit ? ' Changes' : ' Draft'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Left column — header + items */}
        <div className="xl:col-span-2 space-y-4">

          {/* Customer + Trip Info */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Customer & Trip Details</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qb-cname" required>Customer Name</Label>
                <div className="relative">
                  <Input
                    id="qb-cname"
                    list="customer-suggestions"
                    value={customerName}
                    onChange={e => {
                      setCustomerName(e.target.value);
                      const found = customers.find(c => c.name === e.target.value);
                      if (found) {
                        setCustomerId(found.id);
                        if (!customerPhone && found.phone) setCustomerPhone(found.phone);
                        if (!customerEmail && found.email) setCustomerEmail(found.email ?? '');
                      }
                    }}
                    placeholder="Full name"
                  />
                  <datalist id="customer-suggestions">
                    {customers.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qb-phone">Phone</Label>
                <Input id="qb-phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qb-email">Email</Label>
                <Input id="qb-email" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@email.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qb-dest" required>Destination</Label>
                <Input id="qb-dest" value={destination} onChange={e => setDestination(e.target.value)} placeholder="Dubai, Bali, Maldives…" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qb-start">Start Date</Label>
                <Input id="qb-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qb-end">End Date</Label>
                <Input id="qb-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qb-pax">Pax</Label>
                <Input id="qb-pax" type="number" min={1} value={pax} onChange={e => setPax(Number(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qb-valid">Valid Until</Label>
                <Input id="qb-valid" type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Line Items</h3>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={addItem}>
                <Plus className="w-3.5 h-3.5" /> Add Item
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Cat', 'Description', 'Vendor', 'Qty', 'Cost ₹', 'Sell ₹', 'Markup', 'Profit', ''].map(h => (
                      <th key={h} className="text-left text-[10px] font-semibold text-gray-500 px-3 py-2.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item, idx) => {
                    const c = calcItemTotals(item);
                    const catMeta = QUOTE_CATEGORIES.find(cat => cat.value === item.category);
                    return (
                      <tr key={item._tempId} className="hover:bg-gray-50/70 transition-colors">
                        {/* Category */}
                        <td className="px-2 py-2">
                          <select
                            value={item.category}
                            onChange={e => updateItem(item._tempId, 'category', e.target.value as QuotationCategory)}
                            className="h-8 rounded-lg border border-gray-200 bg-white px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30 w-28"
                          >
                            {QUOTE_CATEGORIES.map(cat => (
                              <option key={cat.value} value={cat.value}>{cat.emoji} {cat.label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Description */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateItem(item._tempId, 'description', e.target.value)}
                            placeholder="Service description…"
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30 w-52"
                          />
                        </td>

                        {/* Vendor */}
                        <td className="px-2 py-2">
                          <select
                            value={item.vendorId ?? ''}
                            onChange={e => {
                              const v = vendors.find(vv => vv.id === e.target.value);
                              updateItem(item._tempId, 'vendorId',   v?.id   ?? undefined);
                              updateItem(item._tempId, 'vendorName', v?.name ?? undefined);
                            }}
                            className="h-8 rounded-lg border border-gray-200 bg-white px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30 w-32"
                          >
                            <option value="">— No vendor —</option>
                            {vendors.filter(v => v.isActive).map(v => (
                              <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                          </select>
                        </td>

                        {/* Qty */}
                        <td className="px-2 py-2">
                          <input
                            type="number" min={1} value={item.quantity}
                            onChange={e => updateItem(item._tempId, 'quantity', Number(e.target.value))}
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-center focus:outline-none focus:ring-2 focus:ring-indigo-400/30 w-14"
                          />
                        </td>

                        {/* Cost */}
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0} value={item.costPrice || ''}
                            onChange={e => updateItem(item._tempId, 'costPrice', Number(e.target.value))}
                            placeholder="0"
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-400/30 w-24"
                          />
                        </td>

                        {/* Selling */}
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0} value={item.sellingPrice || ''}
                            onChange={e => updateItem(item._tempId, 'sellingPrice', Number(e.target.value))}
                            placeholder="0"
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-400/30 w-24"
                          />
                        </td>

                        {/* Markup (read-only) */}
                        <td className="px-2 py-2">
                          <span className={cn('text-xs font-medium', c.markup >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {c.markup.toFixed(1)}%
                          </span>
                        </td>

                        {/* Profit (read-only) */}
                        <td className="px-2 py-2">
                          <span className={cn('text-xs font-medium', c.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatCurrency(c.grossProfit)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => moveItem(item._tempId, -1)} disabled={idx === 0}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30 text-xs">↑</button>
                            <button onClick={() => moveItem(item._tempId, 1)} disabled={idx === items.length - 1}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30 text-xs">↓</button>
                            <button onClick={() => removeItem(item._tempId)}
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Footer totals */}
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-gray-600">Totals</td>
                    <td className="px-3 py-2 text-xs font-bold text-gray-700 text-right">{formatCurrency(summary.totalCost)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-gray-900 text-right">{formatCurrency(summary.totalSelling)}</td>
                    <td className="px-3 py-2 text-xs font-medium text-blue-600">
                      {summary.marginPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-xs font-bold text-emerald-600">{formatCurrency(summary.grossProfit)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-gray-100">
              <button onClick={addItem}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add another item
              </button>
            </div>
          </div>

          {/* Inclusions & Exclusions */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Inclusions & Exclusions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="qb-inc" className="text-emerald-700">✅ Inclusions</Label>
                <textarea
                  id="qb-inc" rows={5} value={inclusions} onChange={e => setInclusions(e.target.value)}
                  placeholder="What's included in the package…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qb-exc" className="text-red-600">❌ Exclusions</Label>
                <textarea
                  id="qb-exc" rows={5} value={exclusions} onChange={e => setExclusions(e.target.value)}
                  placeholder="What's NOT included in the package…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400/30 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Payment Policy */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Payment Policy</h3>
            <div className="space-y-1.5">
              <textarea
                id="qb-pay" rows={4} value={paymentPolicy} onChange={e => setPaymentPolicy(e.target.value)}
                placeholder="Payment terms and schedule…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none"
              />
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Notes & Terms</h3>
            <div className="space-y-1.5">
              <Label htmlFor="qb-notes">Internal Notes</Label>
              <textarea
                id="qb-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notes for internal reference…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-terms">Terms & Conditions</Label>
              <textarea
                id="qb-terms" rows={5} value={termsAndConds} onChange={e => setTermsAndConds(e.target.value)}
                placeholder="Enter terms and conditions…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* Right column — Financial Summary */}
        <div className="space-y-4">

          {/* Summary Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 sticky top-5">
            <div className="flex items-center gap-2 mb-2">
              <IndianRupee className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-gray-800">Financial Summary</h3>
            </div>

            {/* Main metrics */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Total Cost</span>
                <span className="font-semibold text-gray-800">{formatCurrency(summary.totalCost)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Selling Price</span>
                <span className="font-bold text-gray-900 text-base">{formatCurrency(summary.totalSelling)}</span>
              </div>
              {/* GST selectors */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">GST Mode</span>
                <select
                  value={gstMode}
                  onChange={e => setGstMode(e.target.value as GstMode)}
                  className="h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                >
                  <option value="EXCLUDED">GST Excluded (add on top)</option>
                  <option value="INCLUDED">GST Included (in price)</option>
                </select>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">GST Rate</span>
                <select
                  value={gstRate}
                  onChange={e => setGstRate(Number(e.target.value))}
                  className="h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                >
                  {[0, 5, 12, 18].map(r => (
                    <option key={r} value={r}>{r === 0 ? 'No GST' : `GST ${r}%`}</option>
                  ))}
                </select>
              </div>
              {gstRate > 0 && gstMode === 'INCLUDED' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Taxable Amount</span>
                  <span className="font-medium text-gray-700">{formatCurrency(summary.taxableAmount)}</span>
                </div>
              )}
              {gstRate > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">GST Amount</span>
                  <span className="font-medium text-amber-600">{formatCurrency(summary.gstAmount)}</span>
                </div>
              )}
              {gstRate > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-medium">Total Payable</span>
                  <span className="font-bold text-indigo-700 text-base">{formatCurrency(summary.totalPayable)}</span>
                </div>
              )}
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Gross Profit</span>
                <span className={cn('font-bold', summary.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {formatCurrency(summary.grossProfit)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Margin %</span>
                <span className={cn('font-bold', summary.marginPct >= 0 ? 'text-blue-600' : 'text-red-500')}>
                  {summary.marginPct.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Profit bar */}
            {summary.totalSelling > 0 && (
              <div className="mt-3">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, summary.marginPct))}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1 text-right">{summary.marginPct.toFixed(1)}% margin</p>
              </div>
            )}

            {/* Category breakdown */}
            {Object.keys(categoryBreakdown).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">By Category</p>
                {Object.entries(categoryBreakdown).map(([cat, vals]) => {
                  const meta = QUOTE_CATEGORIES.find(c => c.value === cat);
                  return (
                    <div key={cat} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 flex items-center gap-1.5">
                        <span>{meta?.emoji}</span>{meta?.label ?? cat}
                      </span>
                      <span className="font-medium text-gray-800">{formatCurrency(vals.selling)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Save button */}
            <Button className="w-full mt-4 gap-1.5" loading={saving} onClick={() => handleSave()}>
              <Save className="w-3.5 h-3.5" />
              {isEdit ? 'Save Changes' : 'Save Draft'}
            </Button>
          </div>

          {/* Quotation info (edit mode) */}
          {isEdit && existing && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Quotation Info</p>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Number</span>
                  <span className="font-mono font-semibold text-indigo-600">{existing.quotationNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status</span>
                  <Badge variant={existing.status === 'accepted' ? 'success' : existing.status === 'rejected' ? 'destructive' : 'secondary'}>
                    {existing.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Created</span>
                  <span>{existing.createdDate}</span>
                </div>
                {existing.sentAt     && <div className="flex justify-between"><span>Sent</span><span>{existing.sentAt}</span></div>}
                {existing.acceptedAt && <div className="flex justify-between"><span>Accepted</span><span>{existing.acceptedAt}</span></div>}
                {existing.rejectedAt && <div className="flex justify-between"><span>Rejected</span><span>{existing.rejectedAt}</span></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
