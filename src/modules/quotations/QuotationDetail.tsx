import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, Copy, Send, CheckCircle,
  XCircle, Printer, FolderPlus, MapPin, Calendar,
  Users, Phone, Mail, IndianRupee, MessageCircle, Receipt, Plus, ClipboardList,
  FileClock, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { useStore } from '@/store';
import apiClient from '@/lib/apiClient';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, today } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import type { QuotationStatus, Receivable } from '@/shared/types';
import {
  calcGst, calcReceivableFinance,
  RECEIVABLE_STATUS_CLASS, RECEIVABLE_STATUS_LABEL,
} from '@/shared/utils/finance';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { whatsapp, gmail } from '@/shared/utils/email';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { ReceivableEntryForm } from '@/shared/components/ReceivableEntryForm';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import { useAuth } from '@/backend/auth/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/shared/components/ui/dialog';
import { Textarea } from '@/shared/components/ui/textarea';
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_CLASS } from '@/shared/types';
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
  const submitQuotationForApproval = useStore(s => s.submitQuotationForApproval);
  const approveQuotation    = useStore(s => s.approveQuotation);
  const rejectQuotation     = useStore(s => s.rejectQuotation);
  const logCommunication    = useStore(s => s.logCommunication);
  const { user } = useAuth();

  const activityLog        = useStore(s => s.activityLog);
  const communications     = useStore(s => s.communications);
  const allReceivables     = useStore(s => s.receivables);
  const addReceivableEntry = useStore(s => s.addReceivableEntry);

  const [converting, setConverting] = useState(false);
  const [deletingId,  setDeletingId] = useState(false);
  const [recEntryOpen, setRecEntryOpen] = useState(false);
  const [activeReceivable, setActiveReceivable] = useState<Receivable | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approvalDialog, setApprovalDialog] = useState<'approve' | 'reject' | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

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
  const gstRate      = quotation.gstRate ?? 0;
  const gstMode      = quotation.gstMode ?? 'EXCLUDED';
  const gst          = calcGst(quotation.totalSelling, gstRate, gstMode);
  const gstAmount    = gst.gstAmount;
  const taxableAmount = gst.taxableAmount;
  const totalPayable = gst.totalPayable;

  // Quotations don't carry their own Receivable — once converted, the Trip's
  // receivable (linked via tripId, created in the conversion transaction) is
  // the single source of truth for payments. Surfacing it here avoids a second,
  // disconnected ledger for the same money.
  const linkedReceivables = quotation.convertedTripId
    ? allReceivables.filter(r => r.tripId === quotation.convertedTripId)
    : [];

  function openRecordPayment() {
    const existing = linkedReceivables.find(r => r.balanceDue > 0) ?? linkedReceivables[0];
    if (existing) {
      setActiveReceivable(existing);
      setRecEntryOpen(true);
    }
  }

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

  async function handleSubmitForApproval() {
    const ok = await confirm({
      title:        'Submit for approval?',
      description:  `${quotation!.id} will be sent to an admin for review before it can move forward.`,
      confirmLabel: 'Submit',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const result = await submitQuotationForApproval(quotation!.id);
      if (result.ok) toast.success('Submitted for approval');
      else toast.error('Submission failed', result.reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprovalDecision() {
    if (!approvalDialog) return;
    if (approvalDialog === 'reject' && !approvalComment.trim()) {
      toast.error('A reason is required to reject a quotation');
      return;
    }
    setApprovalSubmitting(true);
    try {
      const result = approvalDialog === 'approve'
        ? await approveQuotation(quotation!.id, approvalComment.trim() || undefined)
        : await rejectQuotation(quotation!.id, approvalComment.trim());
      if (result.ok) {
        toast.success(approvalDialog === 'approve' ? 'Quotation approved' : 'Quotation rejected');
        setApprovalDialog(null);
        setApprovalComment('');
      } else {
        toast.error(approvalDialog === 'approve' ? 'Approval failed' : 'Rejection failed', result.reason);
      }
    } finally {
      setApprovalSubmitting(false);
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
    logCommunication({
      type:       'whatsapp',
      recipient:  quotation!.customerPhone,
      subject:    `Quotation ${quotation!.quotationNumber}`,
      entityType: 'quotation',
      entityId:   quotation!.id,
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
    logCommunication({
      type:       'email',
      recipient:  quotation!.customerEmail,
      subject:    `Quotation ${quotation!.quotationNumber}`,
      entityType: 'quotation',
      entityId:   quotation!.id,
    });
  }

  const isDraft    = quotation.status === 'draft';
  const isSent     = quotation.status === 'sent';
  const isAccepted = quotation.status === 'accepted';

  const canSubmitForApproval  = quotation.approvalStatus === 'DRAFT' || quotation.approvalStatus === 'REJECTED';
  const isPendingApproval     = quotation.approvalStatus === 'PENDING_APPROVAL';
  const isAdmin               = user?.role === 'ADMIN';

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
            {canSubmitForApproval && (
              <Button variant="outline" size="sm" className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                loading={submitting} onClick={handleSubmitForApproval}>
                <FileClock className="w-3.5 h-3.5" /> Submit for Approval
              </Button>
            )}
            {isPendingApproval && isAdmin && (
              <>
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => { setApprovalDialog('approve'); setApprovalComment(''); }}>
                  <ThumbsUp className="w-3.5 h-3.5" /> Approve
                </Button>
                <Button variant="destructive" size="sm" className="gap-1.5"
                  onClick={() => { setApprovalDialog('reject'); setApprovalComment(''); }}>
                  <ThumbsDown className="w-3.5 h-3.5" /> Reject
                </Button>
              </>
            )}
            {isPendingApproval && !isAdmin && (
              <Badge variant="warning" className="gap-1">
                <FileClock className="w-3 h-3" /> Awaiting admin approval
              </Badge>
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
        <div className={cn('grid gap-4',
          gstRate > 0 && gstMode === 'INCLUDED' ? 'grid-cols-5' :
          gstRate > 0                           ? 'grid-cols-4' :
                                                    'grid-cols-3'
        )}>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 font-display">{formatCurrency(quotation.totalCost)}</div>
            <div className="text-xs text-gray-500 mt-1">Total Cost</div>
          </div>
          <div className="bg-white rounded-2xl border border-indigo-200 p-4 text-center">
            <div className="text-2xl font-bold text-indigo-700 font-display">{formatCurrency(quotation.totalSelling)}</div>
            <div className="text-xs text-gray-500 mt-1">Selling Price</div>
          </div>
          {gstRate > 0 && gstMode === 'INCLUDED' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-gray-700 font-display">{formatCurrency(taxableAmount)}</div>
              <div className="text-xs text-gray-500 mt-1">Taxable Amount</div>
            </div>
          )}
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

        {/* Payments */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-600" /> Payments
            </h3>
            {linkedReceivables.length > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={openRecordPayment}>
                <Plus className="w-3 h-3" /> Record Payment
              </Button>
            )}
          </div>

          {!quotation.convertedTripId ? (
            <p className="text-xs text-gray-400 py-6 text-center">
              Payments are tracked once this quotation is converted to a Trip — the Trip's receivable will appear here automatically.
            </p>
          ) : linkedReceivables.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No payments recorded for the linked Trip yet</p>
          ) : (
            <div className="space-y-4">
              {linkedReceivables.map(r => {
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

        {/* Document card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-8">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-gray-900 font-display">QUOTATION</h1>
                <Badge variant={STATUS_BADGE[quotation.status]}>{quotation.status.toUpperCase()}</Badge>
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', APPROVAL_STATUS_CLASS[quotation.approvalStatus])}>
                  {APPROVAL_STATUS_LABEL[quotation.approvalStatus]}
                </span>
              </div>
              {quotation.approvalStatus === 'REJECTED' && quotation.approvalComment && (
                <p className="text-xs text-red-600 mt-1 max-w-md">
                  <span className="font-semibold">Rejection reason:</span> {quotation.approvalComment}
                </p>
              )}
              {quotation.approvalStatus === 'APPROVED' && quotation.approvalComment && (
                <p className="text-xs text-emerald-600 mt-1 max-w-md">
                  <span className="font-semibold">Approval note:</span> {quotation.approvalComment}
                </p>
              )}
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
                {gstRate > 0 && gstMode === 'INCLUDED' && (
                  <tr>
                    <td colSpan={3} />
                    <td className="py-1.5 text-right text-sm text-gray-500">Taxable Amount</td>
                    <td className="py-1.5 text-right text-sm font-medium text-gray-700">{formatCurrency(taxableAmount)}</td>
                  </tr>
                )}
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

        {/* Activity */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <ClipboardList className="w-4 h-4 text-gray-500" /> Activity
          </h3>
          <ActivityTimeline
            activity={activityLog.filter(a => a.entityType === 'quotation' && a.entityId === quotation.id)}
            communications={communications.filter(c => c.entityType === 'quotation' && c.entityId === quotation.id)}
            emptyLabel="No activity recorded for this quotation yet"
          />
        </div>
      </div>

      {/* Approve / Reject Dialog */}
      <Dialog open={approvalDialog !== null} onOpenChange={o => { if (!o) { setApprovalDialog(null); setApprovalComment(''); } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {approvalDialog === 'approve' ? 'Approve quotation?' : 'Reject quotation?'}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <p className="text-sm text-gray-600">
              {approvalDialog === 'approve'
                ? `${quotation.id} will be marked as approved and ready to move forward.`
                : `${quotation.id} will be sent back to the creator. Please provide a reason.`}
            </p>
            <Textarea
              placeholder={approvalDialog === 'approve' ? 'Optional approval note…' : 'Reason for rejection (required)…'}
              value={approvalComment}
              onChange={e => setApprovalComment(e.target.value)}
              rows={3}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setApprovalDialog(null); setApprovalComment(''); }}>Cancel</Button>
            <Button
              variant={approvalDialog === 'reject' ? 'destructive' : 'default'}
              loading={approvalSubmitting}
              onClick={handleApprovalDecision}
            >
              {approvalDialog === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {gstRate > 0 && gstMode === 'INCLUDED' && (
              <tr>
                <td colSpan={3} />
                <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#6B7280' }}>Taxable Amount</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#374151' }}>₹{taxableAmount.toLocaleString('en-IN')}</td>
              </tr>
            )}
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
