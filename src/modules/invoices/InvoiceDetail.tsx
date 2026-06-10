import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Trash2, Printer, XCircle, FileMinus, FilePlus, Receipt,
} from 'lucide-react';
import { useStore, selectors } from '@/store';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { getStateNameByCode } from '@/shared/utils/gst';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import { INVOICE_STATUS_BADGE } from './Invoices';

export default function InvoiceDetail() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const invoice         = useStore(selectors.invoiceById(id ?? ''));
  const companySettings = useStore(s => s.companySettings);
  const creditNotes     = useStore(s => s.creditNotes.filter(c => c.invoiceId === id));
  const debitNotes      = useStore(s => s.debitNotes.filter(d => d.invoiceId === id));
  const cancelInvoice   = useStore(s => s.cancelInvoice);
  const deleteInvoice   = useStore(s => s.deleteInvoice);

  const [cancelOpen,   setCancelOpen]   = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling,   setCancelling]   = useState(false);
  const [deleting,     setDeleting]     = useState(false);

  if (!invoice) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Invoice not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')} className="mt-3">← Back to Invoices</Button>
      </div>
    );
  }

  const isFrozen = !!(companySettings?.gstFrozenUntil && invoice.invoiceDate <= companySettings.gstFrozenUntil);
  const isCancelled = invoice.status === 'CANCELLED';
  const hasCnDn = creditNotes.length > 0 || debitNotes.length > 0;

  async function handleCancel() {
    if (!cancelReason.trim()) { toast.error('Please provide a cancellation reason'); return; }
    setCancelling(true);
    try {
      const res = await cancelInvoice(invoice!.id, cancelReason.trim());
      if (res.ok) {
        toast.success('Invoice cancelled');
        setCancelOpen(false);
        setCancelReason('');
      } else {
        toast.error('Cancellation failed', res.reason);
      }
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title:        `Delete ${invoice!.invoiceNumber}?`,
      description:  'This permanently deletes the invoice and frees its number for reuse. This cannot be undone.',
      confirmLabel: 'Delete Invoice',
      variant:      'destructive',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await deleteInvoice(invoice!.id);
      if (res.ok) {
        toast.success('Invoice deleted');
        navigate('/invoices');
      } else {
        toast.error('Delete failed', res.reason);
      }
    } finally {
      setDeleting(false);
    }
  }

  const placeOfSupplyState = invoice.placeOfSupply
    || getStateNameByCode(invoice.customerStateCode)
    || '—';

  return (
    <>
      {/* ── Screen view ─────────────────────────────────────── */}
      <div className="p-5 space-y-5 animate-fade-in print:hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => navigate('/invoices')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Invoices
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
            {!isCancelled && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5"
                  onClick={() => navigate(`/credit-notes/new?invoiceId=${invoice.id}`)}>
                  <FileMinus className="w-3.5 h-3.5" /> Credit Note
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5"
                  onClick={() => navigate(`/debit-notes/new?invoiceId=${invoice.id}`)}>
                  <FilePlus className="w-3.5 h-3.5" /> Debit Note
                </Button>
              </>
            )}
            {!isCancelled && !isFrozen && (
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            {!isCancelled && !isFrozen && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-gray-500 hover:text-red-600"
                onClick={() => setCancelOpen(true)}>
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </Button>
            )}
            {!hasCnDn && !isFrozen && (
              <Button variant="destructive" size="sm" loading={deleting} className="gap-1.5" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>

        {/* Hero card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className={
            'px-6 py-5 border-b border-gray-100 ' +
            (invoice.status === 'ISSUED' ? 'bg-gradient-to-r from-emerald-50 to-teal-50'
              : invoice.status === 'CANCELLED' ? 'bg-gradient-to-r from-red-50 to-rose-50'
              : 'bg-gradient-to-r from-slate-50 to-gray-50')
          }>
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm text-gray-700 font-bold">{invoice.invoiceNumber}</span>
                  <Badge variant={INVOICE_STATUS_BADGE[invoice.status]}>{invoice.status}</Badge>
                  {isFrozen && <Badge variant="purple">GST Frozen</Badge>}
                </div>
                <h1 className="text-xl font-bold text-gray-900 font-display">{invoice.customerName}</h1>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                  <span>Invoice Date: {fmtDate(invoice.invoiceDate)}</span>
                  {invoice.dueDate && <span>Due: {fmtDate(invoice.dueDate)}</span>}
                  <span>Place of Supply: {invoice.placeOfSupply || placeOfSupplyState}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">Grand Total</div>
                <div className="text-2xl font-bold text-gray-900 font-display">{formatCurrency(invoice.totalAmount)}</div>
              </div>
            </div>
            {isCancelled && invoice.cancelReason && (
              <div className="mt-3 text-xs text-red-700 bg-red-100/60 rounded-lg px-3 py-2">
                Cancelled on {fmtDate(invoice.cancelledAt)}: {invoice.cancelReason}
              </div>
            )}
          </div>

          {/* Customer / company details */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Bill To</p>
              <p className="text-sm font-bold text-gray-900">{invoice.customerName}</p>
              {invoice.customerAddress && <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.customerAddress}</p>}
              {invoice.customerGstin && <p className="text-sm text-gray-600 mt-1">GSTIN: <span className="font-mono">{invoice.customerGstin}</span></p>}
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2">From</p>
              <p className="text-sm font-bold text-gray-900">{invoice.companyName}</p>
              {invoice.companyAddress && <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.companyAddress}</p>}
              {invoice.companyGstin && <p className="text-sm text-gray-600 mt-1">GSTIN: <span className="font-mono">{invoice.companyGstin}</span></p>}
            </div>
          </div>

          {/* Line items */}
          <div className="px-5 pb-5">
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Taxable', 'GST', 'Total'].map(h => (
                      <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-3 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoice.items.map((it, idx) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-3 py-2 text-gray-800">{it.description}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{it.hsnSac || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{it.quantity}</td>
                      <td className="px-3 py-2 text-gray-600">{formatCurrency(it.rate)}</td>
                      <td className="px-3 py-2 text-gray-600">{formatCurrency(it.amount)}</td>
                      <td className="px-3 py-2 text-gray-600">{it.gstRate}% — {formatCurrency(it.gstAmount)}</td>
                      <td className="px-3 py-2 font-semibold text-gray-900">{formatCurrency(it.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-4">
              <div className="w-full sm:w-72 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Taxable Amount</span><span>{formatCurrency(invoice.taxableAmount)}</span></div>
                {invoice.gstType === 'INTRA' ? (
                  <>
                    <div className="flex justify-between text-gray-600"><span>CGST</span><span>{formatCurrency(invoice.cgstAmount)}</span></div>
                    <div className="flex justify-between text-gray-600"><span>SGST</span><span>{formatCurrency(invoice.sgstAmount)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between text-gray-600"><span>IGST</span><span>{formatCurrency(invoice.igstAmount)}</span></div>
                )}
                <div className="flex justify-between text-gray-600"><span>Total GST</span><span>{formatCurrency(invoice.totalGstAmount)}</span></div>
                <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-1.5">
                  <span>Grand Total</span><span>{formatCurrency(invoice.totalAmount)}</span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <div className="mt-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
            {invoice.termsAndConds && (
              <div className="mt-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Terms &amp; Conditions</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.termsAndConds}</p>
              </div>
            )}
          </div>
        </div>

        {/* Linked Credit/Debit Notes */}
        {(creditNotes.length > 0 || debitNotes.length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-600" /> Linked Credit / Debit Notes
            </h3>
            <div className="space-y-2">
              {creditNotes.map(cn => (
                <div key={cn.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/credit-notes/${cn.id}`)}>
                  <div className="flex items-center gap-2 text-sm">
                    <FileMinus className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-mono text-xs text-gray-700">{cn.creditNoteNumber}</span>
                    <span className="text-gray-400 text-xs">{fmtDate(cn.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{formatCurrency(cn.totalAmount)}</span>
                    <Badge variant={cn.status === 'CANCELLED' ? 'destructive' : 'success'}>{cn.status}</Badge>
                  </div>
                </div>
              ))}
              {debitNotes.map(dn => (
                <div key={dn.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/debit-notes/${dn.id}`)}>
                  <div className="flex items-center gap-2 text-sm">
                    <FilePlus className="w-3.5 h-3.5 text-blue-500" />
                    <span className="font-mono text-xs text-gray-700">{dn.debitNoteNumber}</span>
                    <span className="text-gray-400 text-xs">{fmtDate(dn.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{formatCurrency(dn.totalAmount)}</span>
                    <Badge variant={dn.status === 'CANCELLED' ? 'destructive' : 'success'}>{dn.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Print view ──────────────────────────────────────── */}
      <div className="hidden print:block font-sans text-gray-900" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '3px solid #4F46E5', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1E1B4B', marginBottom: 2 }}>{invoice.companyName || 'GK TRAVELS'}</div>
            {invoice.companyAddress && <div style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'pre-wrap', maxWidth: 280 }}>{invoice.companyAddress}</div>}
            {invoice.companyGstin && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>GSTIN: {invoice.companyGstin}</div>}
            {companySettings?.phone && <div style={{ fontSize: 11, color: '#6B7280' }}>Phone: {companySettings.phone}</div>}
            {companySettings?.email && <div style={{ fontSize: 11, color: '#6B7280' }}>{companySettings.email}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tax Invoice</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#4F46E5', marginTop: 4 }}>{invoice.invoiceNumber}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Date: {fmtDate(invoice.invoiceDate)}</div>
            {invoice.dueDate && <div style={{ fontSize: 11, color: '#6B7280' }}>Due: {fmtDate(invoice.dueDate)}</div>}
            <div style={{ fontSize: 11, color: '#6B7280' }}>Place of Supply: {invoice.placeOfSupply || '—'}</div>
          </div>
        </div>

        {/* Bill to */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Bill To</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{invoice.customerName}</div>
          {invoice.customerAddress && <div style={{ fontSize: 12, color: '#374151', marginTop: 2, whiteSpace: 'pre-wrap' }}>{invoice.customerAddress}</div>}
          {invoice.customerGstin && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>GSTIN: {invoice.customerGstin}</div>}
        </div>

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#4F46E5', color: 'white' }}>
              {['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Taxable', 'GST%', 'GST Amt', 'Total'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, padding: '8px 10px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, idx) => (
              <tr key={it.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ fontSize: 11, padding: '8px 10px', color: '#9CA3AF' }}>{idx + 1}</td>
                <td style={{ fontSize: 12, padding: '8px 10px' }}>{it.description}</td>
                <td style={{ fontSize: 11, padding: '8px 10px', fontFamily: 'monospace' }}>{it.hsnSac || '—'}</td>
                <td style={{ fontSize: 12, padding: '8px 10px' }}>{it.quantity}</td>
                <td style={{ fontSize: 12, padding: '8px 10px' }}>{formatCurrency(it.rate)}</td>
                <td style={{ fontSize: 12, padding: '8px 10px' }}>{formatCurrency(it.amount)}</td>
                <td style={{ fontSize: 12, padding: '8px 10px' }}>{it.gstRate}%</td>
                <td style={{ fontSize: 12, padding: '8px 10px' }}>{formatCurrency(it.gstAmount)}</td>
                <td style={{ fontSize: 12, padding: '8px 10px', fontWeight: 700 }}>{formatCurrency(it.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <table style={{ width: 280, fontSize: 12 }}>
            <tbody>
              <tr><td style={{ padding: '3px 0', color: '#6B7280' }}>Taxable Amount</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.taxableAmount)}</td></tr>
              {invoice.gstType === 'INTRA' ? (
                <>
                  <tr><td style={{ padding: '3px 0', color: '#6B7280' }}>CGST</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.cgstAmount)}</td></tr>
                  <tr><td style={{ padding: '3px 0', color: '#6B7280' }}>SGST</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.sgstAmount)}</td></tr>
                </>
              ) : (
                <tr><td style={{ padding: '3px 0', color: '#6B7280' }}>IGST</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(invoice.igstAmount)}</td></tr>
              )}
              <tr style={{ borderTop: '2px solid #1F2937' }}>
                <td style={{ padding: '6px 0', fontWeight: 800, fontSize: 14 }}>Grand Total</td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 800, fontSize: 14 }}>{formatCurrency(invoice.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bank details */}
        {(companySettings?.bankName || companySettings?.bankAccountNumber) && (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: '#374151' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Bank Details</div>
            {companySettings.bankName && <div>Bank: {companySettings.bankName}</div>}
            {companySettings.bankAccountName && <div>Account Name: {companySettings.bankAccountName}</div>}
            {companySettings.bankAccountNumber && <div>Account No: {companySettings.bankAccountNumber}</div>}
            {companySettings.bankIfsc && <div>IFSC: {companySettings.bankIfsc}</div>}
            {companySettings.bankBranch && <div>Branch: {companySettings.bankBranch}</div>}
          </div>
        )}

        {/* Terms */}
        {invoice.termsAndConds && (
          <div style={{ marginBottom: 24, fontSize: 11, color: '#374151' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Terms &amp; Conditions</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{invoice.termsAndConds}</div>
          </div>
        )}

        {/* Signature */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 48 }}>
          <div style={{ textAlign: 'center' }}>
            {companySettings?.signatureUrl && (
              <img src={companySettings.signatureUrl} alt="Signature" style={{ height: 50, marginBottom: 4 }} />
            )}
            <div style={{ borderTop: '1px solid #1F2937', paddingTop: 4, fontSize: 11 }}>
              {companySettings?.authorizedSignatory || 'Authorized Signatory'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, borderTop: '1px solid #E5E7EB', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9CA3AF' }}>
          <span>{invoice.companyName} {companySettings?.email ? `· ${companySettings.email}` : ''}</span>
          <span>{invoice.invoiceNumber}</span>
        </div>
      </div>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={o => { if (!o) setCancelOpen(false); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cancel Invoice {invoice.invoiceNumber}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-xs text-gray-500">
              Cancelling reverses the receivable raised by this invoice. The invoice number cannot be reused.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason" required>Cancellation Reason</Label>
              <Textarea id="cancel-reason" rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Booking cancelled by customer" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)}>Back</Button>
            <Button variant="destructive" size="sm" loading={cancelling} onClick={handleCancel}>Cancel Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
