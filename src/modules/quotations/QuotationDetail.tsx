import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, Copy, Send, CheckCircle,
  XCircle, Printer, FolderPlus, MapPin, Calendar,
  Users, Phone, Mail, IndianRupee,
} from 'lucide-react';
import { useStore } from '@/store';
import apiClient from '@/lib/apiClient';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import type { QuotationStatus } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { QUOTE_CATEGORIES } from './QuotationBuilder';

// ─── Status helpers ───────────────────────────────────────────

const STATUS_BADGE: Record<QuotationStatus, 'secondary' | 'default' | 'success' | 'destructive' | 'warning'> = {
  draft:    'secondary',
  sent:     'default',
  accepted: 'success',
  rejected: 'destructive',
  expired:  'warning',
};

// ─── Component ───────────────────────────────────────────────

export default function QuotationDetail() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();

  const quotation           = useStore(s => s.quotations.find(q => q.id === id));
  const deleteQuotation     = useStore(s => s.deleteQuotation);
  const setQuotationStatus  = useStore(s => s.setQuotationStatus);
  const duplicateQuotation  = useStore(s => s.duplicateQuotation);
  const convertQuotationToTrip = useStore(s => s.convertQuotationToTrip);

  const [converting, setConverting] = useState(false);
  const [deletingId,  setDeletingId] = useState(false);

  if (!quotation) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Quotation not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/quotations')} className="mt-3">
          ← Back to Quotations
        </Button>
      </div>
    );
  }

  const catMap = Object.fromEntries(QUOTE_CATEGORIES.map(c => [c.value, c]));

  async function handleDelete() {
    const ok = await confirm({
      title:        `Delete ${quotation!.quotationNumber}?`,
      description:  'This will permanently delete this quotation and all its line items.',
      confirmLabel: 'Delete Quotation',
      variant:      'destructive',
    });
    if (!ok) return;
    setDeletingId(true);
    try {
      await apiClient.delete(`/quotations/${quotation!.id}`);
      deleteQuotation(quotation!.id);
      toast.success('Quotation deleted');
      navigate('/quotations');
    } catch {
      toast.error('Failed to delete quotation');
    } finally {
      setDeletingId(false);
    }
  }

  function handleStatusChange(status: QuotationStatus) {
    setQuotationStatus(quotation!.id, status);
    toast.success(`Status updated → ${status}`);
  }

  async function handleDuplicate() {
    const ok = await confirm({
      title:        'Duplicate quotation?',
      description:  'A copy will be created as a new Draft.',
      confirmLabel: 'Duplicate',
    });
    if (!ok) return;
    const copy = duplicateQuotation(quotation!.id);
    if (copy) {
      toast.success('Quotation duplicated', copy.id);
      navigate(`/quotations/${copy.id}`);
    }
  }

  async function handleConvertToTrip() {
    const ok = await confirm({
      title:        'Convert to Trip?',
      description:  `This will create a confirmed Trip for ${quotation!.customerName} → ${quotation!.destination}.`,
      confirmLabel: 'Convert to Trip',
    });
    if (!ok) return;
    setConverting(true);
    try {
      const result = await convertQuotationToTrip(quotation!.id);
      if (result.ok && result.trip) {
        toast.success('Trip created!', result.trip.id);
        navigate(`/trips/${result.trip.id}`);
      } else {
        toast.error('Conversion failed', result.reason);
      }
    } finally {
      setConverting(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const isDraft    = quotation.status === 'draft';
  const isSent     = quotation.status === 'sent';
  const isAccepted = quotation.status === 'accepted';

  return (
    <>
      {/* ── Screen view ─────────────────────────────────────── */}
      <div className="p-5 space-y-5 animate-fade-in print:hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => navigate('/quotations')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Quotations
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleDuplicate}>
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </Button>
            {(isDraft || isSent) && (
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => navigate(`/quotations/${quotation.id}/edit`)}>
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            {isDraft && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleStatusChange('sent')}>
                <Send className="w-3.5 h-3.5" /> Mark Sent
              </Button>
            )}
            {isSent && (
              <>
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => handleStatusChange('accepted')}>
                  <CheckCircle className="w-3.5 h-3.5" /> Accept
                </Button>
                <Button variant="destructive" size="sm" className="gap-1.5"
                  onClick={() => handleStatusChange('rejected')}>
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </Button>
              </>
            )}
            {isAccepted && !quotation.convertedTripId && (
              <Button size="sm" className="gap-1.5" loading={converting} onClick={handleConvertToTrip}>
                <FolderPlus className="w-3.5 h-3.5" /> Convert to Trip
              </Button>
            )}
            {isAccepted && (
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => navigate(`/itineraries/new?quotationId=${quotation.id}`)}>
                <MapPin className="w-3.5 h-3.5" /> Create Itinerary
              </Button>
            )}
            {quotation.convertedTripId && (
              <Button variant="outline" size="sm" className="gap-1.5 text-emerald-600"
                onClick={() => navigate(`/trips/${quotation.convertedTripId}`)}>
                <FolderPlus className="w-3.5 h-3.5" /> View Trip →
              </Button>
            )}
            <Button variant="destructive" size="sm" className="gap-1.5"
              loading={deletingId}
              onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
        </div>

        {/* Status Banner */}
        {quotation.convertedTripId && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Converted to Trip <span className="font-mono font-semibold">{quotation.convertedTripId}</span>
            <button onClick={() => navigate(`/trips/${quotation.convertedTripId}`)}
              className="ml-auto text-xs underline hover:no-underline">Open Trip →</button>
          </div>
        )}

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 font-display">{formatCurrency(quotation.totalCost)}</div>
            <div className="text-xs text-gray-500 mt-1">Total Cost</div>
          </div>
          <div className="bg-white rounded-2xl border border-indigo-200 p-4 text-center">
            <div className="text-2xl font-bold text-indigo-700 font-display">{formatCurrency(quotation.totalSelling)}</div>
            <div className="text-xs text-gray-500 mt-1">Selling Price</div>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-200 p-4 text-center">
            <div className={cn('text-2xl font-bold font-display', quotation.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              {formatCurrency(quotation.grossProfit)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Profit · {quotation.marginPct.toFixed(1)}% margin</div>
          </div>
        </div>

        {/* Document card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-8">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-gray-900 font-display">QUOTATION</h1>
                <Badge variant={STATUS_BADGE[quotation.status]}>{quotation.status.toUpperCase()}</Badge>
              </div>
              <p className="text-sm text-indigo-600 font-mono font-semibold">{quotation.quotationNumber}</p>
              <p className="text-xs text-gray-400 mt-1">Created: {fmtDate(quotation.createdDate)}</p>
              {quotation.validUntil && (
                <p className="text-xs text-amber-600 mt-0.5">Valid until: {fmtDate(quotation.validUntil)}</p>
              )}
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900 font-display">GK Travels</div>
              <div className="text-xs text-gray-500">Operations CRM</div>
              <div className="text-xs text-gray-500">gktravels8249@gmail.com</div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Bill To</h3>
              <p className="font-bold text-gray-900 text-base">{quotation.customerName}</p>
              {quotation.customerPhone && (
                <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-1">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />{quotation.customerPhone}
                </p>
              )}
              {quotation.customerEmail && (
                <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />{quotation.customerEmail}
                </p>
              )}
            </div>
            <div>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Trip Details</h3>
              <div className="space-y-1.5">
                <p className="text-sm text-gray-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-semibold">{quotation.destination}</span>
                </p>
                {(quotation.startDate || quotation.endDate) && (
                  <p className="text-sm text-gray-600 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {quotation.startDate ? fmtDate(quotation.startDate) : '—'}
                    {quotation.endDate ? ` → ${fmtDate(quotation.endDate)}` : ''}
                  </p>
                )}
                <p className="text-sm text-gray-600 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-gray-400" /> {quotation.pax} pax
                </p>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Package Details</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                  <th className="text-left py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="text-center py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-16">Qty</th>
                  <th className="text-right py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-32">Unit Price</th>
                  <th className="text-right py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-32">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotation.items.map((item, idx) => {
                  const cat = catMap[item.category];
                  return (
                    <tr key={item.id || idx}>
                      <td className="py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{cat?.emoji}</span>
                          <div>
                            <p className="font-medium text-gray-800">{item.description}</p>
                            <p className="text-xs text-gray-400">{cat?.label}{item.vendorName ? ` · ${item.vendorName}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-center text-gray-700">{item.quantity}</td>
                      <td className="py-3 text-right text-gray-700">{formatCurrency(item.sellingPrice)}</td>
                      <td className="py-3 text-right font-semibold text-gray-900">{formatCurrency(item.totalSelling)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={3} />
                  <td className="py-3 text-right text-sm font-semibold text-gray-600">Total</td>
                  <td className="py-3 text-right text-lg font-bold text-gray-900 font-display">
                    {formatCurrency(quotation.totalSelling)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {quotation.notes && (
            <div>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{quotation.notes}</p>
            </div>
          )}

          {/* Terms */}
          {quotation.termsAndConds && (
            <div>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Terms &amp; Conditions</h3>
              <div className="bg-gray-50 rounded-xl p-4">
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
                  {quotation.termsAndConds}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Print / PDF view ──────────────────────────────────── */}
      <div className="hidden print:block p-8 text-sm font-sans text-gray-900">
        {/* Company header */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-indigo-600">
          <div>
            <h1 className="text-2xl font-bold text-indigo-700">GK Travels</h1>
            <p className="text-xs text-gray-500">gktravels8249@gmail.com</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-widest">Quotation</h2>
            <p className="text-sm font-mono text-indigo-600 font-semibold">{quotation.quotationNumber}</p>
            <p className="text-xs text-gray-500">Date: {fmtDate(quotation.createdDate)}</p>
            {quotation.validUntil && (
              <p className="text-xs text-amber-600">Valid Until: {fmtDate(quotation.validUntil)}</p>
            )}
          </div>
        </div>

        {/* Customer + Trip info */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Bill To</p>
            <p className="font-bold text-base">{quotation.customerName}</p>
            {quotation.customerPhone && <p className="text-xs text-gray-600">{quotation.customerPhone}</p>}
            {quotation.customerEmail && <p className="text-xs text-gray-600">{quotation.customerEmail}</p>}
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Trip Details</p>
            <p className="font-semibold">{quotation.destination}</p>
            {(quotation.startDate || quotation.endDate) && (
              <p className="text-xs text-gray-600">
                {quotation.startDate ? fmtDate(quotation.startDate) : ''}
                {quotation.endDate ? ` to ${fmtDate(quotation.endDate)}` : ''}
              </p>
            )}
            <p className="text-xs text-gray-600">{quotation.pax} passenger{quotation.pax !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full mb-8" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #4F46E5', background: '#EEF2FF' }}>
              <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>#</th>
              <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</th>
              <th style={{ padding: '8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Qty</th>
              <th style={{ padding: '8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unit Price</th>
              <th style={{ padding: '8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item, idx) => {
              const cat = catMap[item.category];
              return (
                <tr key={item.id || idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '8px', color: '#9CA3AF', fontSize: 11 }}>{idx + 1}</td>
                  <td style={{ padding: '8px' }}>
                    <p style={{ fontWeight: 600, fontSize: 12 }}>{cat?.emoji} {item.description}</p>
                    <p style={{ fontSize: 10, color: '#9CA3AF' }}>{cat?.label}{item.vendorName ? ` · ${item.vendorName}` : ''}</p>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', fontSize: 12 }}>{item.quantity}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontSize: 12 }}>₹{item.sellingPrice.toLocaleString('en-IN')}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, fontSize: 12 }}>₹{item.totalSelling.toLocaleString('en-IN')}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #4F46E5' }}>
              <td colSpan={3} />
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>Total Amount</td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#4F46E5' }}>
                ₹{quotation.totalSelling.toLocaleString('en-IN')}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Notes */}
        {quotation.notes && (
          <div className="mb-6">
            <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Notes</p>
            <p style={{ fontSize: 12, color: '#4B5563', lineHeight: '1.6' }}>{quotation.notes}</p>
          </div>
        )}

        {/* Terms & Conditions */}
        {quotation.termsAndConds && (
          <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16, marginTop: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Terms &amp; Conditions</p>
            <pre style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'pre-wrap', fontFamily: 'sans-serif', lineHeight: '1.7' }}>
              {quotation.termsAndConds}
            </pre>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, borderTop: '2px solid #E5E7EB', paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9CA3AF' }}>
          <span>GK Travels · gktravels8249@gmail.com</span>
          <span>{quotation.quotationNumber} · {fmtDate(quotation.createdDate)}</span>
        </div>
      </div>
    </>
  );
}
