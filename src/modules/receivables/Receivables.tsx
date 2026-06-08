import { useMemo, useState } from 'react';
import {
  Plus, Search, Receipt, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronRight, Trash2, IndianRupee,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { Receivable, ReceivableStatus } from '@/shared/types';
import { fmtDate, today } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import {
  calcReceivableFinance, RECEIVABLE_STATUS_CLASS, RECEIVABLE_STATUS_LABEL,
} from '@/shared/utils/finance';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/EmptyState';
import { ReceivableForm } from '@/shared/components/ReceivableForm';
import { ReceivableEntryForm } from '@/shared/components/ReceivableEntryForm';
import { confirm } from '@/shared/hooks/useConfirm';
import { toast } from '@/shared/hooks/useToast';

const STATUS_TABS: { value: ReceivableStatus | 'all'; label: string }[] = [
  { value: 'all',     label: 'All'      },
  { value: 'pending', label: 'Pending'  },
  { value: 'partial', label: 'Partial'  },
  { value: 'paid',    label: 'Paid'     },
  { value: 'overdue', label: 'Overdue'  },
];

export default function Receivables() {
  const receivables          = useStore(s => s.receivables);
  const createReceivable     = useStore(s => s.createReceivable);
  const updateReceivable     = useStore(s => s.updateReceivable);
  const deleteReceivable     = useStore(s => s.deleteReceivable);
  const addReceivableEntry   = useStore(s => s.addReceivableEntry);
  const deleteReceivableEntry = useStore(s => s.deleteReceivableEntry);

  const [search,    setSearch]    = useState('');
  const [statusTab, setStatusTab] = useState<ReceivableStatus | 'all'>('all');
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  const [formOpen,  setFormOpen]  = useState(false);
  const [editing,   setEditing]   = useState<Receivable | null>(null);
  const [entryFor,  setEntryFor]  = useState<Receivable | null>(null);

  // Live status for every receivable — never persisted, always derived.
  const withStatus = useMemo(() => receivables.map(r => ({
    receivable: r,
    status: calcReceivableFinance({ invoiceAmount: r.invoiceAmount, entries: r.entries, dueDate: r.dueDate }).status,
  })), [receivables]);

  const kpis = useMemo(() => {
    const totalReceivables = withStatus.reduce((s, x) => s + x.receivable.balanceDue, 0);
    const overdueAmount    = withStatus.filter(x => x.status === 'overdue').reduce((s, x) => s + x.receivable.balanceDue, 0);
    const monthPrefix      = today().slice(0, 7);
    const collectedThisMonth = withStatus.reduce((sum, x) =>
      sum + x.receivable.entries.filter(e => e.paymentDate.startsWith(monthPrefix)).reduce((s, e) => s + e.amount, 0), 0);
    const pendingCount = withStatus.filter(x => x.status !== 'paid').length;
    return { totalReceivables, overdueAmount, collectedThisMonth, pendingCount };
  }, [withStatus]);

  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUS_TABS) {
      counts[s.value] = s.value === 'all' ? withStatus.length : withStatus.filter(x => x.status === s.value).length;
    }
    return counts;
  }, [withStatus]);

  const filtered = useMemo(() => {
    let list = withStatus;
    if (statusTab !== 'all') list = list.filter(x => x.status === statusTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(x =>
        x.receivable.customerName.toLowerCase().includes(q) ||
        x.receivable.id.toLowerCase().includes(q) ||
        (x.receivable.bookingId || '').toLowerCase().includes(q) ||
        (x.receivable.tripId || '').toLowerCase().includes(q) ||
        (x.receivable.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [withStatus, statusTab, search]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openCreate() { setEditing(null); setFormOpen(true); }
  function openEdit(r: Receivable) { setEditing(r); setFormOpen(true); }

  function handleSaveReceivable(data: Partial<Receivable>) {
    if (editing) updateReceivable(editing.id, data);
    else createReceivable(data);
    setFormOpen(false);
    setEditing(null);
  }

  function handleSaveEntry(data: Partial<import('@/shared/types').ReceivableEntry>) {
    if (!entryFor) return;
    addReceivableEntry(entryFor.id, data);
    toast.success('Payment recorded', `₹${data.amount} recorded for ${entryFor.customerName}`);
    setEntryFor(null);
  }

  async function handleDelete(r: Receivable) {
    const ok = await confirm({
      title:        `Delete receivable ${r.id}?`,
      description:  `This will permanently delete this receivable for ${r.customerName} and its payment history. This action cannot be undone.`,
      confirmLabel: 'Delete Receivable',
      cancelLabel:  'Cancel',
      variant:      'destructive',
    });
    if (!ok) return;
    deleteReceivable(r.id);
    toast.success('Receivable deleted', `${r.id} removed`);
  }

  async function handleDeleteEntry(r: Receivable, entryId: string) {
    const ok = await confirm({
      title:        'Delete this payment entry?',
      description:  'This will remove the recorded payment and recalculate the balance. This action cannot be undone.',
      confirmLabel: 'Delete Entry',
      cancelLabel:  'Cancel',
      variant:      'destructive',
    });
    if (!ok) return;
    deleteReceivableEntry(r.id, entryId);
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Receivables</h2>
          <Badge variant="secondary">{receivables.length} total</Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> Add Receivable
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Receivables',   value: formatCurrency(kpis.totalReceivables),   icon: IndianRupee,   color: 'text-gray-900'    },
          { label: 'Overdue Amount',      value: formatCurrency(kpis.overdueAmount),      icon: AlertTriangle, color: 'text-red-600'     },
          { label: 'Collected (this mo.)',value: formatCurrency(kpis.collectedThisMonth), icon: CheckCircle,   color: 'text-emerald-600' },
          { label: 'Pending Collections', value: kpis.pendingCount,                       icon: Clock,         color: 'text-amber-600'   },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center mb-2">
              <Icon className={cn('w-4 h-4', color)} />
            </div>
            <div className={cn('text-xl font-bold font-display', color)}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STATUS_TABS.map(s => (
          <button key={s.value}
            onClick={() => setStatusTab(s.value)}
            className={cn('flex-shrink-0 text-xs px-3.5 py-1.5 rounded-full font-medium transition-all',
              statusTab === s.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
          >
            {s.label} <span className="ml-1.5 opacity-70">{pipeline[s.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2 w-80">
        <Search className="w-3.5 h-3.5 text-gray-400" />
        <input type="text" placeholder="Search customer, receivable #, booking, trip…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-transparent text-xs text-gray-700 outline-none flex-1 placeholder:text-gray-400" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        receivables.length === 0 ? (
          <EmptyState icon={Receipt} title="No receivables yet"
            description="Track pending customer dues, partial payments, and collection status here"
            action={{ label: '+ Add Receivable', onClick: openCreate }} />
        ) : (
          <EmptyState icon={Search} title="No receivables match your filters"
            action={{ label: 'Clear', onClick: () => { setSearch(''); setStatusTab('all'); } }} />
        )
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['', 'Receivable #', 'Customer', 'Linked', 'Invoice', 'Received', 'Balance', 'Due Date', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(({ receivable: r, status }, i) => {
                  const isOpen = expanded.has(r.id);
                  return (
                    <motion.tr key={r.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                      className="contents">
                      <RowGroup
                        r={r} status={status} isOpen={isOpen}
                        onToggle={() => toggleExpand(r.id)}
                        onEdit={() => openEdit(r)}
                        onDelete={() => handleDelete(r)}
                        onRecordPayment={() => setEntryFor(r)}
                        onDeleteEntry={(entryId) => handleDeleteEntry(r, entryId)}
                      />
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ReceivableForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSave={handleSaveReceivable}
        receivable={editing}
      />
      <ReceivableEntryForm
        open={!!entryFor}
        onClose={() => setEntryFor(null)}
        onSave={handleSaveEntry}
        receivable={entryFor}
      />
    </div>
  );
}

// ─── Row + expandable entry history ───────────────────────────

interface RowGroupProps {
  r:                Receivable;
  status:           ReceivableStatus;
  isOpen:           boolean;
  onToggle:         () => void;
  onEdit:           () => void;
  onDelete:         () => void;
  onRecordPayment:  () => void;
  onDeleteEntry:    (entryId: string) => void;
}

function RowGroup({ r, status, isOpen, onToggle, onEdit, onDelete, onRecordPayment, onDeleteEntry }: RowGroupProps) {
  const linked = r.bookingId ? `Booking ${r.bookingId}` : r.tripId ? `Trip ${r.tripId}` : '—';
  return (
    <>
      <tr className="hover:bg-gray-50/70 transition-colors">
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">{r.id}</td>
        <td className="px-4 py-3">
          <div className="font-semibold text-gray-900 text-sm">{r.customerName}</div>
          {r.description && <div className="text-[11px] text-gray-400">{r.description}</div>}
        </td>
        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{linked}</td>
        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatCurrency(r.invoiceAmount)}</td>
        <td className="px-4 py-3 text-emerald-600 font-medium whitespace-nowrap">{formatCurrency(r.totalReceived)}</td>
        <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{formatCurrency(r.balanceDue)}</td>
        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
        <td className="px-4 py-3">
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium', RECEIVABLE_STATUS_CLASS[status])}>
            {RECEIVABLE_STATUS_LABEL[status]}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {r.balanceDue > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRecordPayment}>Record Payment</Button>
            )}
            <Button size="icon-sm" variant="ghost" onClick={onEdit}>
              <Receipt className="w-3.5 h-3.5 text-gray-400" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </Button>
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={10} className="px-4 pb-4 bg-gray-50/50">
            {r.entries.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 px-2">No payments recorded against this receivable yet.</p>
            ) : (
              <table className="w-full text-xs mt-1">
                <thead>
                  <tr className="text-[10px] text-gray-400 uppercase">
                    <th className="text-left font-semibold py-2 px-2">Date</th>
                    <th className="text-left font-semibold py-2 px-2">Amount</th>
                    <th className="text-left font-semibold py-2 px-2">Mode</th>
                    <th className="text-left font-semibold py-2 px-2">Reference</th>
                    <th className="text-left font-semibold py-2 px-2">Notes</th>
                    <th className="text-left font-semibold py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.entries.map(e => (
                    <tr key={e.id}>
                      <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{fmtDate(e.paymentDate)}</td>
                      <td className="py-2 px-2 font-semibold text-emerald-600 whitespace-nowrap">{formatCurrency(e.amount)}</td>
                      <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{e.paymentMode}</td>
                      <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{e.reference || '—'}</td>
                      <td className="py-2 px-2 text-gray-500">{e.notes || '—'}</td>
                      <td className="py-2 px-2">
                        <Button size="icon-sm" variant="ghost" onClick={() => onDeleteEntry(e.id)}>
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
