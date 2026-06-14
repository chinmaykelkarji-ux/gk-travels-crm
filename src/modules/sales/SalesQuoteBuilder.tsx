import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Send, Save, Copy,
  CheckCircle2, Printer, X, Plane, Building2, Car, Camera, ArrowRightLeft,
  MessageCircle, Loader2,
} from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { useStore } from '@/store';
import { cn } from '@/shared/utils/cn';
import { formatCurrency, formatPct } from '@/shared/utils/format';
import { toast } from '@/shared/hooks/useToast';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import type {
  EnquiryDetail, SalesQuote, SalesQuoteLineItem,
  SalesQuoteServiceType, SalesQuoteStatus,
} from '@/shared/types/salesQuote';

// ── Constants ─────────────────────────────────────────────────

const SERVICE_TYPES: SalesQuoteServiceType[] = ['FLIGHT', 'HOTEL', 'VEHICLE', 'ACTIVITY', 'TRANSFER'];

const SERVICE_ICONS: Record<SalesQuoteServiceType, React.ElementType> = {
  FLIGHT:   Plane,
  HOTEL:    Building2,
  VEHICLE:  Car,
  ACTIVITY: Camera,
  TRANSFER: ArrowRightLeft,
};

const STATUS_META: Record<SalesQuoteStatus, { label: string; variant: 'secondary' | 'default' | 'success' | 'destructive' | 'warning' | 'purple' | 'orange' }> = {
  DRAFT:       { label: 'Draft',       variant: 'secondary' },
  SENT:        { label: 'Sent',        variant: 'default' },
  VIEWED:      { label: 'Viewed',      variant: 'purple' },
  NEGOTIATING: { label: 'Negotiating', variant: 'orange' },
  ACCEPTED:    { label: 'Accepted',    variant: 'success' },
  REJECTED:    { label: 'Rejected',    variant: 'destructive' },
  EXPIRED:     { label: 'Expired',     variant: 'warning' },
};

const ALL_STATUSES: SalesQuoteStatus[] = ['DRAFT', 'SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED'];

// Working representation of a line item before it has an id (new items).
interface WorkingItem {
  id: string; // local key; real id once saved
  serviceType: SalesQuoteServiceType;
  description: string;
  supplierId: string | null;
  costPrice: number;
  markup: number;
  quantity: number;
  unit: string;
  details: Record<string, unknown>;
}

let localKeyCounter = 0;
function nextLocalKey(): string {
  localKeyCounter += 1;
  return `local-${Date.now()}-${localKeyCounter}`;
}

function emptyItem(): WorkingItem {
  return {
    id: nextLocalKey(),
    serviceType: 'HOTEL',
    description: '',
    supplierId: null,
    costPrice: 0,
    markup: 0,
    quantity: 1,
    unit: 'per person',
    details: {},
  };
}

function fromLineItem(item: SalesQuoteLineItem): WorkingItem {
  return {
    id: item.id,
    serviceType: item.serviceType,
    description: item.description,
    supplierId: item.supplierId,
    costPrice: item.costPrice,
    markup: item.markup,
    quantity: item.quantity,
    unit: item.unit,
    details: item.details ?? {},
  };
}

function sellPrice(item: WorkingItem): number {
  return Math.round((item.costPrice + item.markup) * 100) / 100;
}

function lineTotal(item: WorkingItem): number {
  return Math.round(sellPrice(item) * item.quantity * 100) / 100;
}

function markupPct(item: WorkingItem): number {
  return item.costPrice > 0 ? (item.markup / item.costPrice) * 100 : 0;
}

function buildWaLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

// ── WhatsApp share modal ─────────────────────────────────────

interface WhatsAppModalProps {
  quote: SalesQuote;
  onClose: () => void;
}

function WhatsAppModal({ quote, onClose }: WhatsAppModalProps) {
  const message =
    `Hi ${quote.customerName}, here's your travel quotation ${quote.quoteNumber} for ${quote.destination}.\n` +
    `Total: ${formatCurrency(quote.totalAmount)}\n` +
    `Valid until: ${new Date(quote.validUntil).toLocaleDateString('en-IN')}\n\n` +
    `Please let us know if you'd like to proceed or have any questions. Thank you!`;

  const link = buildWaLink(quote.customerPhone, message);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-emerald-500" /> Share via WhatsApp</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <textarea
          readOnly
          value={message}
          rows={6}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 resize-none mb-3"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => { void navigator.clipboard.writeText(message); toast.success('Message copied'); }}
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </Button>
          <Button asChild size="sm" className="flex-1">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="w-3.5 h-3.5" /> Open WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function SalesQuoteBuilder() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const enquiryId = searchParams.get('enquiryId');
  const vendors = useStore(s => s.vendors);

  const [quote, setQuote] = useState<SalesQuote | null>(null);
  const [enquiry, setEnquiry] = useState<EnquiryDetail | null>(null);
  const [items, setItems] = useState<WorkingItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [termsConditions, setTermsConditions] = useState('');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const isEdit = Boolean(id);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        if (id) {
          const res = await apiClient.get<SalesQuote>(`/sales-quotes/${id}`);
          if (!active) return;
          setQuote(res.data);
          setItems(res.data.lineItems.map(fromLineItem));
          setDiscountAmount(res.data.discountAmount);
          setNotes(res.data.notes ?? '');
          setTermsConditions(res.data.termsConditions ?? '');
          setValidUntil(res.data.validUntil.slice(0, 10));
        } else if (enquiryId) {
          const res = await apiClient.get<EnquiryDetail>(`/enquiries/${enquiryId}`);
          if (!active) return;
          setEnquiry(res.data);
          setItems([emptyItem()]);
        } else {
          toast.error('Missing enquiry reference');
          navigate('/enquiries');
        }
      } catch {
        toast.error('Failed to load quote');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [id, enquiryId, navigate]);

  const totals = useMemo(() => {
    const subtotal = Math.round(items.reduce((s, it) => s + lineTotal(it), 0) * 100) / 100;
    const taxAmount = 0;
    const totalAmount = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;
    const totalCost = Math.round(items.reduce((s, it) => s + it.costPrice * it.quantity, 0) * 100) / 100;
    const grossMargin = Math.round((totalAmount - totalCost) * 100) / 100;
    const marginPct = totalAmount > 0 ? Math.round((grossMargin / totalAmount) * 1000) / 10 : 0;
    return { subtotal, taxAmount, totalAmount, totalCost, grossMargin, marginPct };
  }, [items, discountAmount]);

  const customerName = quote?.customerName ?? enquiry?.customerName ?? '';
  const customerPhone = quote?.customerPhone ?? enquiry?.customerPhone ?? '';
  const destination = quote?.destination ?? enquiry?.destination ?? '';
  const pax = enquiry?.pax;
  const budget = enquiry?.budget ?? null;
  const departureDate = enquiry?.departureDate;
  const returnDate = enquiry?.returnDate;

  const locked = quote ? !['DRAFT', 'NEGOTIATING'].includes(quote.status) : false;

  // ── Line item handlers ───────────────────────────────────

  function updateItem(localId: string, patch: Partial<WorkingItem>) {
    setItems(prev => prev.map(it => it.id === localId ? { ...it, ...patch } : it));
  }

  function removeItem(localId: string) {
    setItems(prev => prev.filter(it => it.id !== localId));
  }

  function moveItem(localId: string, dir: -1 | 1) {
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === localId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  }

  // ── Save ──────────────────────────────────────────────────

  function buildPayload() {
    return {
      validUntil,
      lineItems: items.map((it, idx) => ({
        serviceType: it.serviceType,
        description: it.description,
        supplierId: it.supplierId,
        costPrice: it.costPrice,
        markup: it.markup,
        quantity: it.quantity,
        unit: it.unit,
        details: it.details,
        sortOrder: idx,
      })),
      discountAmount,
      notes: notes.trim() || null,
      ...(termsConditions.trim() ? { termsConditions: termsConditions.trim() } : {}),
    };
  }

  async function saveDraft(): Promise<SalesQuote | null> {
    if (items.length === 0) { toast.error('Add at least one line item'); return null; }
    if (items.some(it => !it.description.trim())) { toast.error('Every line item needs a description'); return null; }

    setSaving(true);
    try {
      if (quote) {
        const res = await apiClient.put<SalesQuote>(`/sales-quotes/${quote.id}`, buildPayload());
        setQuote(res.data);
        setItems(res.data.lineItems.map(fromLineItem));
        toast.success('Quote saved');
        return res.data;
      } else {
        const res = await apiClient.post<SalesQuote>('/sales-quotes', { enquiryId, ...buildPayload() });
        toast.success(`Quote ${res.data.quoteNumber} created`);
        navigate(`/sales-quotes/${res.data.id}`, { replace: true });
        return res.data;
      }
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? 'Failed to save quote');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndSend() {
    const saved = await saveDraft();
    if (!saved) return;
    try {
      const res = await apiClient.put<SalesQuote>(`/sales-quotes/${saved.id}`, { status: 'SENT' });
      setQuote(res.data);
      setShowWhatsApp(true);
    } catch {
      toast.error('Failed to mark quote as sent');
    }
  }

  async function changeStatus(status: SalesQuoteStatus) {
    if (!quote) return;
    try {
      const res = await apiClient.put<SalesQuote>(`/sales-quotes/${quote.id}`, { status });
      setQuote(res.data);
      toast.success(`Status changed to ${STATUS_META[status].label}`);
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function duplicate() {
    if (!quote) return;
    try {
      const res = await apiClient.post<SalesQuote>(`/sales-quotes/${quote.id}/duplicate`);
      toast.success(`Duplicated as ${res.data.quoteNumber}`);
      navigate(`/sales-quotes/${res.data.id}`);
    } catch {
      toast.error('Failed to duplicate quote');
    }
  }

  async function convertToBooking() {
    if (!quote) return;
    setSaving(true);
    try {
      const res = await apiClient.post<{ tripId: string }>(`/sales-quotes/${quote.id}/convert`);
      toast.success('Booking created');
      navigate(`/trips/${res.data.tripId}`);
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? 'Failed to convert quote');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="p-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/sales-quotes')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-base font-bold text-gray-900 font-display">
              {quote ? quote.quoteNumber : 'New Sales Quote'}
            </h2>
            <p className="text-xs text-gray-500">{customerName} · {destination}</p>
          </div>
        </div>
        {quote && <Badge variant={STATUS_META[quote.status].variant}>{STATUS_META[quote.status].label}</Badge>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        {/* Left column */}
        <div className="space-y-4">
          {/* Enquiry summary */}
          <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-2">Customer &amp; Trip</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><p className="text-gray-400">Customer</p><p className="font-medium text-gray-800">{customerName}</p></div>
              <div><p className="text-gray-400">Phone</p><p className="font-medium text-gray-800">{customerPhone}</p></div>
              <div><p className="text-gray-400">Destination</p><p className="font-medium text-gray-800">{destination}</p></div>
              {pax !== undefined && <div><p className="text-gray-400">Pax</p><p className="font-medium text-gray-800">{pax}</p></div>}
              {departureDate && <div><p className="text-gray-400">Departure</p><p className="font-medium text-gray-800">{new Date(departureDate).toLocaleDateString('en-IN')}</p></div>}
              {returnDate && <div><p className="text-gray-400">Return</p><p className="font-medium text-gray-800">{new Date(returnDate).toLocaleDateString('en-IN')}</p></div>}
              {budget !== null && <div><p className="text-gray-400">Budget</p><p className="font-medium text-gray-800">{formatCurrency(budget)}</p></div>}
            </div>
          </div>

          {/* Line items */}
          <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">Line Items</h3>
              {!locked && (
                <Button size="sm" variant="outline" onClick={() => setItems(prev => [...prev, emptyItem()])}>
                  <Plus className="w-3.5 h-3.5" /> Add Service
                </Button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No line items yet</p>
            ) : (
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const Icon = SERVICE_ICONS[item.serviceType];
                  return (
                    <div key={item.id} className="rounded-xl border border-gray-100 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-indigo-600" />
                        </div>
                        <select
                          value={item.serviceType}
                          disabled={locked}
                          onChange={e => updateItem(item.id, { serviceType: e.target.value as SalesQuoteServiceType })}
                          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                        >
                          {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input
                          type="text"
                          placeholder="Description (e.g. Mumbai → Goa flight)"
                          value={item.description}
                          disabled={locked}
                          onChange={e => updateItem(item.id, { description: e.target.value })}
                          className="flex-1 h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                        />
                        {!locked && (
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button disabled={idx === 0} onClick={() => moveItem(item.id, -1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5 text-gray-400" /></button>
                            <button disabled={idx === items.length - 1} onClick={() => moveItem(item.id, 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5 text-gray-400" /></button>
                            <button onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                        <div>
                          <label className="text-[11px] text-gray-400 block mb-0.5">Supplier</label>
                          <select
                            value={item.supplierId ?? ''}
                            disabled={locked}
                            onChange={e => updateItem(item.id, { supplierId: e.target.value || null })}
                            className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                          >
                            <option value="">— None —</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-400 block mb-0.5">Qty</label>
                          <input type="number" min={1} value={item.quantity} disabled={locked}
                            onChange={e => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                            className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-400 block mb-0.5">Unit</label>
                          <input type="text" value={item.unit} disabled={locked}
                            onChange={e => updateItem(item.id, { unit: e.target.value })}
                            className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-400 block mb-0.5">Cost Price</label>
                          <input type="number" min={0} value={item.costPrice} disabled={locked}
                            onChange={e => updateItem(item.id, { costPrice: Number(e.target.value) })}
                            className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-400 block mb-0.5">Markup (₹)</label>
                          <input type="number" min={0} value={item.markup} disabled={locked}
                            onChange={e => updateItem(item.id, { markup: Number(e.target.value) })}
                            className="w-full h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-400 block mb-0.5">Sell Price</label>
                          <div className="h-8 rounded-lg bg-gray-50 px-2 flex items-center text-xs font-semibold text-gray-700">
                            {formatCurrency(sellPrice(item))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span>Markup: {formatPct(markupPct(item))}</span>
                        <span className="font-semibold text-gray-800">Line total: {formatCurrency(lineTotal(item))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes & T&C */}
          <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
              <textarea
                value={notes}
                disabled={locked}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Terms &amp; Conditions</label>
              <textarea
                value={termsConditions}
                disabled={locked}
                onChange={e => setTermsConditions(e.target.value)}
                rows={3}
                placeholder="Leave blank to use the default terms"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Right column — sticky summary */}
        <div className="space-y-4 lg:sticky lg:top-4 self-start">
          <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">Summary</h3>

            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Valid Until</label>
              <input type="date" value={validUntil} disabled={locked}
                onChange={e => setValidUntil(e.target.value)}
                className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
              <div className="flex justify-between items-center text-gray-600">
                <span>Discount</span>
                <input type="number" min={0} value={discountAmount} disabled={locked}
                  onChange={e => setDiscountAmount(Math.max(0, Number(e.target.value)))}
                  className="w-24 h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
              </div>
              <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatCurrency(totals.taxAmount)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2"><span>Total</span><span>{formatCurrency(totals.totalAmount)}</span></div>
            </div>

            <div className="rounded-xl bg-gray-50 p-3 space-y-1 text-xs">
              <div className="flex justify-between text-gray-500"><span>Total cost</span><span>{formatCurrency(totals.totalCost)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Gross margin</span><span className={cn(totals.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-500', 'font-semibold')}>{formatCurrency(totals.grossMargin)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Margin %</span><span className="font-semibold">{totals.marginPct.toFixed(1)}%</span></div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl ring-1 ring-gray-100 p-4 space-y-2">
            {!locked && (
              <Button className="w-full" loading={saving} onClick={() => void saveDraft()}>
                <Save className="w-3.5 h-3.5" /> Save Draft
              </Button>
            )}
            {!locked && (
              <Button variant="success" className="w-full" loading={saving} onClick={() => void saveAndSend()}>
                <Send className="w-3.5 h-3.5" /> Save &amp; Send
              </Button>
            )}
            {quote && (
              <Button variant="outline" className="w-full" onClick={() => window.open(`/print/quotation/${quote.id}`, '_blank')}>
                <Printer className="w-3.5 h-3.5" /> Print / PDF
              </Button>
            )}
            {quote && (quote.status === 'DRAFT' || quote.status === 'SENT') && (
              <Button variant="success" className="w-full" loading={saving} onClick={() => void changeStatus('ACCEPTED')}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Accept Quote
              </Button>
            )}
            {quote && (
              <Button variant="outline" className="w-full" onClick={() => void duplicate()}>
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </Button>
            )}

            {quote && quote.status === 'ACCEPTED' && !quote.convertedTripId && (
              <Button className="w-full" variant="success" loading={saving} onClick={() => void convertToBooking()}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Convert to Booking
              </Button>
            )}
            {quote?.convertedTripId && (
              <Button variant="outline" className="w-full" onClick={() => navigate(`/trips/${quote.convertedTripId}`)}>
                View Booking
              </Button>
            )}

            {quote && (
              <div className="pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Change Status</label>
                <select
                  value={quote.status}
                  onChange={e => void changeStatus(e.target.value as SalesQuoteStatus)}
                  className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {showWhatsApp && quote && <WhatsAppModal quote={quote} onClose={() => setShowWhatsApp(false)} />}
    </div>
  );
}
