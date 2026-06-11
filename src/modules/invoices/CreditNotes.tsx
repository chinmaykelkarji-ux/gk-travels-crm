import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileMinus, IndianRupee, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { CreditDebitStatus } from '@/shared/types';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/EmptyState';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { useBulkSelection } from '@/shared/hooks/useBulkSelection';
import { BulkActionBar } from '@/shared/components/BulkActionBar';

export const CREDIT_DEBIT_STATUS_BADGE: Record<CreditDebitStatus, 'success' | 'destructive'> = {
  ISSUED:    'success',
  CANCELLED: 'destructive',
};

const STATUS_TABS: { value: CreditDebitStatus | 'all'; label: string }[] = [
  { value: 'all',       label: 'All'       },
  { value: 'ISSUED',    label: 'Issued'    },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function CreditNotes() {
  const navigate    = useNavigate();
  const creditNotes = useStore(s => s.creditNotes);
  const deleteCreditNote = useStore(s => s.deleteCreditNote);

  const [search,    setSearch]    = useState('');
  const [statusTab, setStatusTab] = useState<CreditDebitStatus | 'all'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent, cn: { id: string; creditNoteNumber: string }) {
    e.stopPropagation();
    const ok = await confirm({
      title:        `Delete ${cn.creditNoteNumber}?`,
      description:  'This permanently deletes the credit note and frees its number for reuse. This cannot be undone.',
      confirmLabel: 'Delete Credit Note',
      variant:      'destructive',
    });
    if (!ok) return;
    setDeletingId(cn.id);
    try {
      const res = await deleteCreditNote(cn.id);
      if (res.ok) {
        toast.success('Credit note deleted');
      } else {
        toast.error('Delete failed', res.reason);
      }
    } finally {
      setDeletingId(null);
    }
  }

  const kpis = useMemo(() => {
    const issued = creditNotes.filter(c => c.status === 'ISSUED');
    return {
      issued: issued.length,
      total:  issued.reduce((sum, c) => sum + c.totalAmount, 0),
    };
  }, [creditNotes]);

  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUS_TABS) {
      counts[s.value] = s.value === 'all'
        ? creditNotes.length
        : creditNotes.filter(c => c.status === s.value).length;
    }
    return counts;
  }, [creditNotes]);

  const filtered = useMemo(() => {
    let list = creditNotes;
    if (statusTab !== 'all') list = list.filter(c => c.status === statusTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.creditNoteNumber.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [creditNotes, statusTab, search]);

  // ── Bulk selection ───────────────────────────────────────────

  const filteredIds = useMemo(() => filtered.map(c => c.id), [filtered]);
  const bulkSel = useBulkSelection(filteredIds);

  async function handleBulkDelete() {
    const ids = Array.from(bulkSel.selected);
    if (ids.length === 0) return;
    const ok = await confirm({
      title:        `Delete ${ids.length} credit note${ids.length > 1 ? 's' : ''}?`,
      description:  `This permanently deletes the selected credit note${ids.length > 1 ? 's' : ''} and frees their numbers for reuse. This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel:  'Cancel',
      variant:      'destructive',
    });
    if (!ok) return;
    setBulkDeleting(true);
    try {
      let okCount = 0, failCount = 0;
      for (const id of ids) {
        const res = await deleteCreditNote(id);
        if (res.ok) okCount++; else failCount++;
      }
      if (okCount > 0) toast.success(`${okCount} credit note${okCount > 1 ? 's' : ''} deleted`);
      if (failCount > 0) toast.error(`${failCount} credit note${failCount > 1 ? 's' : ''} could not be deleted`);
      bulkSel.clear();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-gray-900 font-display">Credit Notes</h2>
        <Badge variant="secondary">{creditNotes.length} total</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Issued Credit Notes', value: kpis.issued,                 icon: FileMinus,   color: 'text-amber-600' },
          { label: 'Total Credited',      value: formatCurrency(kpis.total),  icon: IndianRupee, color: 'text-emerald-600' },
          { label: 'Cancelled',           value: pipeline.CANCELLED ?? 0,     icon: FileMinus,   color: 'text-red-500' },
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
            onClick={() => setStatusTab(s.value as CreditDebitStatus | 'all')}
            className={cn('flex-shrink-0 text-xs px-3.5 py-1.5 rounded-full font-medium transition-all',
              statusTab === s.value ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
          >
            {s.label} <span className="ml-1.5 opacity-70">{pipeline[s.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2 w-80">
        <Search className="w-3.5 h-3.5 text-gray-400" />
        <input type="text" placeholder="Search credit note #, customer…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-transparent text-xs text-gray-700 outline-none flex-1 placeholder:text-gray-400" />
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        count={bulkSel.count}
        itemLabel="credit note"
        onClear={bulkSel.clear}
        onDelete={handleBulkDelete}
        deleting={bulkDeleting}
      />

      {/* List */}
      {filtered.length === 0 ? (
        creditNotes.length === 0 ? (
          <EmptyState icon={FileMinus} title="No credit notes yet"
            description="Credit notes are issued from an invoice's detail page for cancellations, refunds or corrections" />
        ) : (
          <EmptyState icon={Search} title="No credit notes match your filters"
            action={{ label: 'Clear', onClick: () => { setSearch(''); setStatusTab('all'); } }} />
        )
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={bulkSel.allSelected}
                      onChange={bulkSel.toggleAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label="Select all credit notes"
                    />
                  </th>
                  {['Credit Note #', 'Date', 'Customer', 'Reason', 'Taxable', 'GST', 'Total', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((cn_, i) => (
                  <motion.tr key={cn_.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/credit-notes/${cn_.id}`)}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={bulkSel.selected.has(cn_.id)}
                        onChange={() => bulkSel.toggle(cn_.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Select credit note ${cn_.creditNoteNumber}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-600 font-semibold whitespace-nowrap">{cn_.creditNoteNumber}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(cn_.date)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 text-sm">{cn_.customerName}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{cn_.reason}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">{formatCurrency(cn_.taxableAmount)}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">{formatCurrency(cn_.totalGstAmount)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 text-sm whitespace-nowrap">{formatCurrency(cn_.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={CREDIT_DEBIT_STATUS_BADGE[cn_.status]}>{cn_.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="icon-sm" variant="ghost" loading={deletingId === cn_.id}
                        onClick={e => handleDelete(e, cn_)}>
                        <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-600" />
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
