import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, AlertCircle, FileMinus, FilePlus, Search } from 'lucide-react';
import { useStore, selectors } from '@/store';
import { today } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { splitGst, sumGstSplits } from '@/shared/utils/gst';
import type { CreditDebitLineItemInput } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/shared/components/ui/select';

const GST_RATES = [0, 5, 12, 18, 28];

const CREDIT_REASONS = [
  'Booking Cancellation',
  'Refund',
  'Invoice Correction',
  'Other',
];

const DEBIT_REASONS = [
  'Additional Charges',
  'Fare Difference',
  'Hotel Upgrade',
  'Price Correction',
  'Other',
];

interface LineRow extends CreditDebitLineItemInput {
  key: string;
}

function makeKey(): string {
  return Math.random().toString(36).slice(2);
}

function emptyRow(): LineRow {
  return { key: makeKey(), description: '', hsnSac: '9985', quantity: 1, rate: 0, gstRate: 5 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function CreditDebitNoteForm({ kind }: { kind: 'credit' | 'debit' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invoiceId = params.get('invoiceId') ?? '';

  const invoice         = useStore(selectors.invoiceById(invoiceId));
  const invoices        = useStore(s => s.invoices);
  const companySettings = useStore(s => s.companySettings);
  const createCreditNote = useStore(s => s.createCreditNote);
  const createDebitNote  = useStore(s => s.createDebitNote);

  const isCredit = kind === 'credit';
  const REASONS  = isCredit ? CREDIT_REASONS : DEBIT_REASONS;
  const Icon     = isCredit ? FileMinus : FilePlus;
  const title    = isCredit ? 'New Credit Note' : 'New Debit Note';
  const accent   = isCredit ? 'amber' : 'blue';

  const [date, setDate] = useState(today());
  const [reason, setReason] = useState(REASONS[0]);
  const [reasonDetails, setReasonDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const eligibleInvoices = useMemo(
    () => invoices.filter(i => i.status === 'ISSUED'),
    [invoices],
  );

  function addRow() { setItems(prev => [...prev, emptyRow()]); }
  function removeRow(key: string) { setItems(prev => prev.length > 1 ? prev.filter(i => i.key !== key) : prev); }
  function updateRow<K extends keyof LineRow>(key: string, field: K, value: LineRow[K]) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));
  }

  function loadFromInvoice() {
    if (!invoice) return;
    setItems(invoice.items.map(it => ({
      key: makeKey(),
      description: it.description,
      hsnSac: it.hsnSac ?? '',
      quantity: it.quantity,
      rate: it.rate,
      gstRate: it.gstRate,
    })));
  }

  const gstType = invoice?.gstType ?? 'INTRA';

  const totals = useMemo(() => {
    const splits = items
      .filter(i => i.description.trim() && i.rate > 0)
      .map(i => splitGst((i.quantity ?? 1) * i.rate, i.gstRate, gstType));
    return sumGstSplits(splits);
  }, [items, gstType]);

  const isFrozen = !!(invoice && companySettings?.gstFrozenUntil && invoice.invoiceDate <= companySettings.gstFrozenUntil);
  const isCancelled = invoice?.status === 'CANCELLED';

  async function handleSave() {
    if (!invoice) { setError('Select an invoice to issue this against'); return; }
    if (!reason.trim()) { setError('Please select a reason'); return; }
    const validItems = items.filter(i => i.description.trim() && i.rate > 0);
    if (validItems.length === 0) { setError('Add at least one line item with a description and amount'); return; }

    setError('');
    setSaving(true);
    try {
      const cleanItems = validItems.map(({ key: _key, ...rest }) => rest);
      if (isCredit) {
        const res = await createCreditNote({
          invoiceId: invoice.id, date, reason,
          reasonDetails: reasonDetails || null, notes: notes || null,
          items: cleanItems,
        });
        if (res.ok && res.creditNote) {
          toast.success('Credit Note issued', res.creditNote.creditNoteNumber);
          navigate(`/credit-notes/${res.creditNote.id}`);
        } else {
          setError(res.reason ?? 'Failed to create credit note');
        }
      } else {
        const res = await createDebitNote({
          invoiceId: invoice.id, date, reason,
          reasonDetails: reasonDetails || null, notes: notes || null,
          items: cleanItems,
        });
        if (res.ok && res.debitNote) {
          toast.success('Debit Note issued', res.debitNote.debitNoteNumber);
          navigate(`/debit-notes/${res.debitNote.id}`);
        } else {
          setError(res.reason ?? 'Failed to create debit note');
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!invoiceId) {
    return (
      <div className="p-5 space-y-5 animate-fade-in max-w-3xl">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h2 className="text-base font-bold text-gray-900 font-display">{title}</h2>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm text-gray-600 mb-3">Select the invoice this {isCredit ? 'credit note' : 'debit note'} should be issued against.</p>
          {eligibleInvoices.length === 0 ? (
            <EmptyState icon={Search} title="No issued invoices available" />
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {eligibleInvoices.map(inv => (
                <div key={inv.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/${isCredit ? 'credit-notes' : 'debit-notes'}/new?invoiceId=${inv.id}`)}>
                  <div>
                    <div className="font-mono text-xs text-indigo-600 font-semibold">{inv.invoiceNumber}</div>
                    <div className="text-sm font-semibold text-gray-900">{inv.customerName}</div>
                  </div>
                  <div className="text-sm font-semibold text-gray-700">{formatCurrency(inv.totalAmount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Invoice not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mt-3">← Back</Button>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="p-6 text-center text-gray-500">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
        <p>This invoice is cancelled and cannot have {isCredit ? 'credit' : 'debit'} notes issued against it.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${invoice.id}`)} className="mt-3">← Back to Invoice</Button>
      </div>
    );
  }

  if (isFrozen) {
    return (
      <div className="p-6 text-center text-gray-500">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-purple-400" />
        <p>This invoice's period is GST-frozen and cannot be adjusted.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${invoice.id}`)} className="mt-3">← Back to Invoice</Button>
      </div>
    );
  }

  return (
    <div className="p-5 pb-28 space-y-5 animate-fade-in max-w-4xl">
      <button onClick={() => navigate(`/invoices/${invoice.id}`)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Invoice {invoice.invoiceNumber}
      </button>

      <div className="flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center',
          accent === 'amber' ? 'bg-amber-50' : 'bg-blue-50')}>
          <Icon className={cn('w-4.5 h-4.5', accent === 'amber' ? 'text-amber-600' : 'text-blue-600')} />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900 font-display">{title}</h2>
          <p className="text-xs text-gray-500">Against invoice <span className="font-mono">{invoice.invoiceNumber}</span> — {invoice.customerName}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Details card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cdn-date" required>Date</Label>
            <Input id="cdn-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label required>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cdn-reason-details">Reason Details (optional)</Label>
          <Textarea id="cdn-reason-details" rows={2} value={reasonDetails} onChange={e => setReasonDetails(e.target.value)}
            placeholder="Additional context for the audit trail" />
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Line Items</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadFromInvoice}>Copy from Invoice</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
              <Plus className="w-3.5 h-3.5" /> Add Row
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Description', 'HSN/SAC', 'Qty', 'Rate', 'GST%', 'Amount', ''].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-2 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(row => {
                const lineTotal = round2((row.quantity ?? 1) * row.rate);
                return (
                  <tr key={row.key}>
                    <td className="px-2 py-2 min-w-[200px]">
                      <Input value={row.description} onChange={e => updateRow(row.key, 'description', e.target.value)} placeholder="Description" />
                    </td>
                    <td className="px-2 py-2 w-28">
                      <Input value={row.hsnSac ?? ''} onChange={e => updateRow(row.key, 'hsnSac', e.target.value)} placeholder="HSN/SAC" />
                    </td>
                    <td className="px-2 py-2 w-20">
                      <Input type="number" min={1} value={row.quantity ?? 1}
                        onChange={e => updateRow(row.key, 'quantity', Math.max(1, Number(e.target.value) || 1))} />
                    </td>
                    <td className="px-2 py-2 w-28">
                      <Input type="number" min={0} value={row.rate}
                        onChange={e => updateRow(row.key, 'rate', Math.max(0, Number(e.target.value) || 0))} />
                    </td>
                    <td className="px-2 py-2 w-24">
                      <Select value={String(row.gstRate)} onValueChange={v => updateRow(row.key, 'gstRate', Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2 text-sm font-semibold text-gray-800 whitespace-nowrap">{formatCurrency(lineTotal)}</td>
                    <td className="px-2 py-2">
                      <Button variant="ghost" size="icon-sm" onClick={() => removeRow(row.key)} disabled={items.length === 1}>
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

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-1.5">
        <Label htmlFor="cdn-notes">Notes (optional)</Label>
        <Textarea id="cdn-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {/* Totals */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex justify-end">
          <div className="w-full sm:w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600"><span>Taxable Amount</span><span>{formatCurrency(totals.taxableAmount)}</span></div>
            {gstType === 'INTRA' ? (
              <>
                <div className="flex justify-between text-gray-600"><span>CGST</span><span>{formatCurrency(totals.cgstAmount)}</span></div>
                <div className="flex justify-between text-gray-600"><span>SGST</span><span>{formatCurrency(totals.sgstAmount)}</span></div>
              </>
            ) : (
              <div className="flex justify-between text-gray-600"><span>IGST</span><span>{formatCurrency(totals.igstAmount)}</span></div>
            )}
            <div className="flex justify-between text-gray-600"><span>Total GST</span><span>{formatCurrency(totals.totalGstAmount)}</span></div>
            <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-1.5">
              <span>Total</span><span>{formatCurrency(totals.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom save bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 px-5 py-3 flex items-center justify-between gap-3 z-20">
        <div className="text-sm text-gray-600">
          {isCredit ? 'Reduces' : 'Increases'} customer receivable by{' '}
          <span className="font-bold text-gray-900">{formatCurrency(totals.totalAmount)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${invoice.id}`)}>Cancel</Button>
          <Button size="sm" loading={saving} className="gap-1.5" onClick={handleSave}>
            <Icon className="w-3.5 h-3.5" /> {isCredit ? 'Issue Credit Note' : 'Issue Debit Note'}
          </Button>
        </div>
      </div>
    </div>
  );
}
