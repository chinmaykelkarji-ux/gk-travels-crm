import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, XCircle, FileMinus, FilePlus, Pencil, Trash2 } from 'lucide-react';
import { useStore, selectors } from '@/store';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { CREDIT_DEBIT_STATUS_BADGE } from './CreditNotes';

export default function CreditDebitNoteDetail({ kind }: { kind: 'credit' | 'debit' }) {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isCredit = kind === 'credit';

  const creditNote = useStore(isCredit ? selectors.creditNoteById(id ?? '') : () => undefined);
  const debitNote  = useStore(!isCredit ? selectors.debitNoteById(id ?? '') : () => undefined);
  const note = isCredit ? creditNote : debitNote;

  const companySettings = useStore(s => s.companySettings);
  const invoice = useStore(selectors.invoiceById(note?.invoiceId ?? ''));
  const cancelCreditNote = useStore(s => s.cancelCreditNote);
  const cancelDebitNote  = useStore(s => s.cancelDebitNote);
  const deleteCreditNote = useStore(s => s.deleteCreditNote);
  const deleteDebitNote  = useStore(s => s.deleteDebitNote);

  const [cancelling, setCancelling] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const Icon       = isCredit ? FileMinus : FilePlus;
  const accent     = isCredit ? 'amber' : 'blue';
  const docLabel   = isCredit ? 'Credit Note' : 'Debit Note';
  const docNumber  = isCredit ? creditNote?.creditNoteNumber : debitNote?.debitNoteNumber;
  const effectLabel = isCredit ? 'Reduces' : 'Increases';

  if (!note) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>{docLabel} not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate(isCredit ? '/credit-notes' : '/debit-notes')} className="mt-3">← Back</Button>
      </div>
    );
  }

  const isCancelled = note.status === 'CANCELLED';
  const isFrozen = !!(companySettings?.gstFrozenUntil && note.date <= companySettings.gstFrozenUntil);

  async function handleCancel() {
    if (!note) return;
    const ok = await confirm({
      title:        `Cancel ${docNumber}?`,
      description:  `This reverses the receivable adjustment made by this ${docLabel.toLowerCase()}. This cannot be undone.`,
      confirmLabel: `Cancel ${docLabel}`,
      variant:      'destructive',
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const res = isCredit
        ? await cancelCreditNote(note.id)
        : await cancelDebitNote(note.id);
      if (res.ok) {
        toast.success(`${docLabel} cancelled`);
      } else {
        toast.error('Cancellation failed', res.reason);
      }
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!note) return;
    const ok = await confirm({
      title:        `Delete ${docNumber}?`,
      description:  `This permanently deletes this ${docLabel.toLowerCase()} and frees its number for reuse. This cannot be undone.`,
      confirmLabel: `Delete ${docLabel}`,
      variant:      'destructive',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = isCredit
        ? await deleteCreditNote(note.id)
        : await deleteDebitNote(note.id);
      if (res.ok) {
        toast.success(`${docLabel} deleted`);
        navigate(isCredit ? '/credit-notes' : '/debit-notes');
      } else {
        toast.error('Delete failed', res.reason);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* ── Screen view ─────────────────────────────────────── */}
      <div className="p-5 space-y-5 animate-fade-in print:hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button onClick={() => navigate(isCredit ? '/credit-notes' : '/debit-notes')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to {isCredit ? 'Credit Notes' : 'Debit Notes'}
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
            {invoice && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/invoices/${invoice.id}`)}>
                View Invoice {invoice.invoiceNumber}
              </Button>
            )}
            {!isCancelled && !isFrozen && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/${isCredit ? 'credit-notes' : 'debit-notes'}/${note.id}/edit`)}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            {!isCancelled && (
              <Button variant="ghost" size="sm" loading={cancelling} className="gap-1.5 text-gray-500 hover:text-red-600" onClick={handleCancel}>
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </Button>
            )}
            <Button variant="destructive" size="sm" loading={deleting} className="gap-1.5" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
        </div>

        {/* Hero card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className={
            'px-6 py-5 border-b border-gray-100 ' +
            (note.status === 'ISSUED'
              ? (accent === 'amber' ? 'bg-gradient-to-r from-amber-50 to-orange-50' : 'bg-gradient-to-r from-blue-50 to-indigo-50')
              : 'bg-gradient-to-r from-red-50 to-rose-50')
          }>
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm text-gray-700 font-bold">{docNumber}</span>
                  <Badge variant={CREDIT_DEBIT_STATUS_BADGE[note.status]}>{note.status}</Badge>
                </div>
                <h1 className="text-xl font-bold text-gray-900 font-display">{note.customerName}</h1>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                  <span>Date: {fmtDate(note.date)}</span>
                  <span>Reason: {note.reason}</span>
                  {invoice && <span>Against: <span className="font-mono">{invoice.invoiceNumber}</span></span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">Total</div>
                <div className="text-2xl font-bold text-gray-900 font-display">{formatCurrency(note.totalAmount)}</div>
                <div className="text-[11px] text-gray-500 mt-1">{effectLabel} receivable</div>
              </div>
            </div>
            {note.reasonDetails && (
              <div className="mt-3 text-xs text-gray-700 bg-white/60 rounded-lg px-3 py-2">
                {note.reasonDetails}
              </div>
            )}
            {isCancelled && (
              <div className="mt-3 text-xs text-red-700 bg-red-100/60 rounded-lg px-3 py-2">
                Cancelled on {fmtDate(note.cancelledAt)}
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="p-5">
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
                  {note.items.map((it, idx) => (
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
                <div className="flex justify-between text-gray-600"><span>Taxable Amount</span><span>{formatCurrency(note.taxableAmount)}</span></div>
                {note.cgstAmount > 0 || note.sgstAmount > 0 ? (
                  <>
                    <div className="flex justify-between text-gray-600"><span>CGST</span><span>{formatCurrency(note.cgstAmount)}</span></div>
                    <div className="flex justify-between text-gray-600"><span>SGST</span><span>{formatCurrency(note.sgstAmount)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between text-gray-600"><span>IGST</span><span>{formatCurrency(note.igstAmount)}</span></div>
                )}
                <div className="flex justify-between text-gray-600"><span>Total GST</span><span>{formatCurrency(note.totalGstAmount)}</span></div>
                <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-1.5">
                  <span>Total</span><span>{formatCurrency(note.totalAmount)}</span>
                </div>
              </div>
            </div>

            {note.notes && (
              <div className="mt-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Print view ──────────────────────────────────────── */}
      <div className="hidden print:block font-sans text-gray-900" style={{ fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: `3px solid ${accent === 'amber' ? '#D97706' : '#2563EB'}`, paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1E1B4B', marginBottom: 2 }}>{companySettings?.companyName || 'GK TRAVELS'}</div>
            {companySettings?.addressLine1 && (
              <div style={{ fontSize: 11, color: '#6B7280', maxWidth: 280 }}>
                {[companySettings.addressLine1, companySettings.addressLine2, companySettings.city, companySettings.state, companySettings.pincode].filter(Boolean).join(', ')}
              </div>
            )}
            {companySettings?.gstin && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>GSTIN: {companySettings.gstin}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: accent === 'amber' ? '#D97706' : '#2563EB', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{docLabel}</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: accent === 'amber' ? '#D97706' : '#2563EB', marginTop: 4 }}>{docNumber}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Date: {fmtDate(note.date)}</div>
            {invoice && <div style={{ fontSize: 11, color: '#6B7280' }}>Against Invoice: {invoice.invoiceNumber}</div>}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>To</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{note.customerName}</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Reason: {note.reason}</div>
          {note.reasonDetails && <div style={{ fontSize: 12, color: '#6B7280' }}>{note.reasonDetails}</div>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: accent === 'amber' ? '#D97706' : '#2563EB', color: 'white' }}>
              {['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Taxable', 'GST%', 'GST Amt', 'Total'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, padding: '8px 10px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {note.items.map((it, idx) => (
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <table style={{ width: 280, fontSize: 12 }}>
            <tbody>
              <tr><td style={{ padding: '3px 0', color: '#6B7280' }}>Taxable Amount</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(note.taxableAmount)}</td></tr>
              {note.cgstAmount > 0 || note.sgstAmount > 0 ? (
                <>
                  <tr><td style={{ padding: '3px 0', color: '#6B7280' }}>CGST</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(note.cgstAmount)}</td></tr>
                  <tr><td style={{ padding: '3px 0', color: '#6B7280' }}>SGST</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(note.sgstAmount)}</td></tr>
                </>
              ) : (
                <tr><td style={{ padding: '3px 0', color: '#6B7280' }}>IGST</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{formatCurrency(note.igstAmount)}</td></tr>
              )}
              <tr style={{ borderTop: '2px solid #1F2937' }}>
                <td style={{ padding: '6px 0', fontWeight: 800, fontSize: 14 }}>Total</td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 800, fontSize: 14 }}>{formatCurrency(note.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 48 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #1F2937', paddingTop: 4, fontSize: 11 }}>
              {companySettings?.authorizedSignatory || 'Authorized Signatory'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
