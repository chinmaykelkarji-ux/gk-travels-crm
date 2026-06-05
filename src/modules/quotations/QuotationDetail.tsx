import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, Copy, Send, CheckCircle,
  XCircle, Printer, FolderPlus, MapPin, Calendar,
  Users, Phone, Mail, IndianRupee, MessageCircle,
} from 'lucide-react';
import { useStore } from '@/store';
import apiClient from '@/lib/apiClient';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import type { QuotationStatus } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { whatsapp, gmail } from '@/shared/utils/email';
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

// ─── Print field helper ───────────────────────────────────────

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{value}</div>
    </div>
  );
}

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
  const gstAmount   = quotation.gstAmount   ?? 0;
  const gstRate     = quotation.gstRate     ?? 0;
  const totalPayable = quotation.totalSelling + gstAmount;

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

  function handleWhatsApp() {
    if (!quotation!.customerPhone) {
      toast.error('No phone number on this quotation');
      return;
    }
    whatsapp.quotation({
      phone:          quotation!.customerPhone,
      customerName:   quotation!.customerName,
      destination:    quotation!.destination,
      quotationNumber: quotation!.quotationNumber,
      totalSelling:   quotation!.totalSelling,
      startDate:      quotation!.startDate,
      endDate:        quotation!.endDate,
      pax:            quotation!.pax,
      validUntil:     quotation!.validUntil,
    });
  }

  function handleEmail() {
    if (!quotation!.customerEmail) {
      toast.error('No email address on this quotation');
      return;
    }
    gmail.quotation({
      email:          quotation!.customerEmail,
      customerName:   quotation!.customerName,
      destination:    quotation!.destination,
      quotationNumber: quotation!.quotationNumber,
      totalSelling:   quotation!.totalSelling,
      startDate:      quotation!.startDate,
      endDate:        quotation!.endDate,
      pax:            quotation!.pax,
    });
  }

  const isDraft    = quotation.status === 'draft';
  const isSent     = quotation.status === 'sent';
  const isAccepted = quotation.status === 'accepted';

  const incLines = (quotation.inclusions ?? '').split('\n').filter(Boolean);
  const excLines = (quotation.exclusions ?? '').split('\n').filter(Boolean);
  const payLines = (quotation.paymentPolicy ?? '').split('\n').filter(Boolean);

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
            {quotation.customerPhone && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={handleWhatsApp}>
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            )}
            {quotation.customerEmail && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-[#EA4335] hover:bg-red-50" onClick={handleEmail}>
                <Mail className="w-3.5 h-3.5" /> Email
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.print()}>
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
        <div className={cn('grid gap-4', gstRate > 0 ? 'grid-cols-4' : 'grid-cols-3')}>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 font-display">{formatCurrency(quotation.totalCost)}</div>
            <div className="text-xs text-gray-500 mt-1">Total Cost</div>
          </div>
          <div className="bg-white rounded-2xl border border-indigo-200 p-4 text-center">
            <div className="text-2xl font-bold text-indigo-700 font-display">{formatCurrency(quotation.totalSelling)}</div>
            <div className="text-xs text-gray-500 mt-1">Selling Price</div>
          </div>
          {gstRate > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 p-4 text-center">
              <div className="text-2xl font-bold text-amber-600 font-display">{formatCurrency(gstAmount)}</div>
              <div className="text-xs text-gray-500 mt-1">GST ({gstRate}%)</div>
            </div>
          )}
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
                <tr className="border-t border-gray-200">
                  <td colSpan={3} />
                  <td className="py-2 text-right text-sm text-gray-500">Subtotal</td>
                  <td className="py-2 text-right text-sm font-semibold text-gray-800">{formatCurrency(quotation.totalSelling)}</td>
                </tr>
                {gstRate > 0 && (
                  <tr>
                    <td colSpan={3} />
                    <td className="py-1.5 text-right text-sm text-amber-600">GST ({gstRate}%)</td>
                    <td className="py-1.5 text-right text-sm font-medium text-amber-600">{formatCurrency(gstAmount)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-indigo-200">
                  <td colSpan={3} />
                  <td className="py-3 text-right text-sm font-bold text-gray-700">Total Payable</td>
                  <td className="py-3 text-right text-lg font-bold text-indigo-700 font-display">
                    {formatCurrency(totalPayable)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Inclusions & Exclusions */}
          {(incLines.length > 0 || excLines.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {incLines.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Inclusions</h3>
                  <ul className="space-y-1.5">
                    {incLines.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                        <span>{line.replace(/^[•\-✓✅]\s*/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {excLines.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Exclusions</h3>
                  <ul className="space-y-1.5">
                    {excLines.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span>
                        <span>{line.replace(/^[•\-✗❌]\s*/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Payment Policy */}
          {payLines.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment Policy</h3>
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <ul className="space-y-1.5">
                  {payLines.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-indigo-800">
                      <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
                      <span>{line.replace(/^[•\-]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

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
      <div className="hidden print:block" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13, color: '#1F2937' }}>

        {/* Company header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '3px solid #4F46E5', paddingBottom: 20, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#1E1B4B', letterSpacing: '-0.5px', lineHeight: 1 }}>GK TRAVELS</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>gktravels8249@gmail.com</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quotation</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#4F46E5', marginTop: 4 }}>{quotation.quotationNumber}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Date: {fmtDate(quotation.createdDate)}</div>
            {quotation.validUntil && (
              <div style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>Valid Until: {fmtDate(quotation.validUntil)}</div>
            )}
          </div>
        </div>

        {/* Customer + Trip info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Prepared For</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{quotation.customerName}</div>
            {quotation.customerPhone && <div style={{ fontSize: 12, color: '#4B5563', marginTop: 4 }}>📞 {quotation.customerPhone}</div>}
            {quotation.customerEmail && <div style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>✉ {quotation.customerEmail}</div>}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Trip Details</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>📍 {quotation.destination}</div>
            {(quotation.startDate || quotation.endDate) && (
              <div style={{ fontSize: 12, color: '#4B5563', marginTop: 4 }}>
                📅 {quotation.startDate ? fmtDate(quotation.startDate) : ''}
                {quotation.endDate ? ` to ${fmtDate(quotation.endDate)}` : ''}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>👥 {quotation.pax} passenger{quotation.pax !== 1 ? 's' : ''}</div>
          </div>
        </div>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#EEF2FF', borderBottom: '2px solid #4F46E5' }}>
              {['#', 'Description', 'Qty', 'Unit Price', 'Amount'].map((h, i) => (
                <th key={h} style={{
                  padding: '9px 10px',
                  textAlign: i === 0 ? 'left' : i === 2 ? 'center' : i >= 3 ? 'right' : 'left',
                  fontSize: 9, fontWeight: 700, color: '#4F46E5',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item, idx) => {
              const cat = catMap[item.category];
              return (
                <tr key={item.id || idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '9px 10px', color: '#9CA3AF', fontSize: 11 }}>{idx + 1}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{cat?.emoji} {item.description}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{cat?.label}{item.vendorName ? ` · ${item.vendorName}` : ''}</div>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: 12 }}>{item.quantity}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 12 }}>₹{item.sellingPrice.toLocaleString('en-IN')}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontSize: 12 }}>₹{item.totalSelling.toLocaleString('en-IN')}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid #E5E7EB' }}>
              <td colSpan={3} />
              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 11, color: '#6B7280' }}>Subtotal</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>₹{quotation.totalSelling.toLocaleString('en-IN')}</td>
            </tr>
            {gstRate > 0 && (
              <tr>
                <td colSpan={3} />
                <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#D97706' }}>GST ({gstRate}%)</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#D97706' }}>₹{gstAmount.toLocaleString('en-IN')}</td>
              </tr>
            )}
            <tr style={{ borderTop: '2px solid #4F46E5', background: '#F5F3FF' }}>
              <td colSpan={3} />
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>Total Payable</td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900, fontSize: 17, color: '#4F46E5' }}>
                ₹{totalPayable.toLocaleString('en-IN')}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Inclusions & Exclusions */}
        {(incLines.length > 0 || excLines.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20 }}>
            {incLines.length > 0 && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>✓ Inclusions</div>
                {incLines.map((line, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, fontSize: 11, color: '#14532D' }}>
                    <span style={{ color: '#16A34A', flexShrink: 0 }}>✓</span>
                    <span>{line.replace(/^[•\-✓✅]\s*/, '')}</span>
                  </div>
                ))}
              </div>
            )}
            {excLines.length > 0 && (
              <div style={{ background: '#FFF5F5', border: '1px solid #FED7D7', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>✗ Exclusions</div>
                {excLines.map((line, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, fontSize: 11, color: '#7F1D1D' }}>
                    <span style={{ color: '#DC2626', flexShrink: 0 }}>✗</span>
                    <span>{line.replace(/^[•\-✗❌]\s*/, '')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Payment Policy */}
        {payLines.length > 0 && (
          <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#3730A3', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Payment Policy</div>
            {payLines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, fontSize: 11, color: '#1E1B4B' }}>
                <span style={{ color: '#4F46E5', flexShrink: 0 }}>•</span>
                <span>{line.replace(/^[•\-]\s*/, '')}</span>
              </div>
            ))}
          </div>
        )}

        {/* Terms & Conditions */}
        {quotation.termsAndConds && (
          <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Terms &amp; Conditions</div>
            <pre style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'pre-wrap', fontFamily: 'sans-serif', lineHeight: 1.7 }}>
              {quotation.termsAndConds}
            </pre>
          </div>
        )}

        {/* Notes */}
        {quotation.notes && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.6 }}>{quotation.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, borderTop: '2px solid #E5E7EB', paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9CA3AF' }}>
          <span>GK Travels · gktravels8249@gmail.com · This is a computer generated document</span>
          <span>{quotation.quotationNumber} · {fmtDate(quotation.createdDate)}</span>
        </div>
      </div>
    </>
  );
}
