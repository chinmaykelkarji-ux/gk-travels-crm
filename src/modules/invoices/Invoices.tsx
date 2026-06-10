import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Receipt, FileWarning, IndianRupee, Percent } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { InvoiceStatus } from '@/shared/types';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/EmptyState';

export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, 'secondary' | 'success' | 'destructive'> = {
  DRAFT:     'secondary',
  ISSUED:    'success',
  CANCELLED: 'destructive',
};

const STATUS_TABS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all',       label: 'All'       },
  { value: 'ISSUED',    label: 'Issued'    },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function Invoices() {
  const navigate  = useNavigate();
  const invoices  = useStore(s => s.invoices);

  const [search,    setSearch]    = useState('');
  const [statusTab, setStatusTab] = useState<InvoiceStatus | 'all'>('all');

  const kpis = useMemo(() => {
    const issued = invoices.filter(i => i.status === 'ISSUED');
    return {
      total:        invoices.length,
      issued:       issued.length,
      totalInvoiced: issued.reduce((sum, i) => sum + i.totalAmount, 0),
      totalGst:     issued.reduce((sum, i) => sum + i.totalGstAmount, 0),
    };
  }, [invoices]);

  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUS_TABS) {
      counts[s.value] = s.value === 'all'
        ? invoices.length
        : invoices.filter(i => i.status === s.value).length;
    }
    return counts;
  }, [invoices]);

  const filtered = useMemo(() => {
    let list = invoices;
    if (statusTab !== 'all') list = list.filter(i => i.status === statusTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoices, statusTab, search]);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Invoices</h2>
          <Badge variant="secondary">{invoices.length} total</Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => navigate('/invoices/new')}>
          <Plus className="w-3.5 h-3.5" /> New Invoice
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Issued Invoices', value: kpis.issued,                          icon: Receipt,    color: 'text-indigo-600',  fmt: false },
          { label: 'Total Invoiced',  value: formatCurrency(kpis.totalInvoiced),    icon: IndianRupee, color: 'text-emerald-600', fmt: true },
          { label: 'GST Collected',   value: formatCurrency(kpis.totalGst),         icon: Percent,    color: 'text-blue-600',    fmt: true },
          { label: 'Cancelled',       value: pipeline.CANCELLED ?? 0,               icon: FileWarning, color: 'text-red-500',     fmt: false },
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
            onClick={() => setStatusTab(s.value as InvoiceStatus | 'all')}
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
        <input type="text" placeholder="Search invoice #, customer…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-transparent text-xs text-gray-700 outline-none flex-1 placeholder:text-gray-400" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet"
            description="Generate GST-compliant invoices from confirmed bookings and trips"
            action={{ label: '+ New Invoice', onClick: () => navigate('/invoices/new') }} />
        ) : (
          <EmptyState icon={Search} title="No invoices match your filters"
            action={{ label: 'Clear', onClick: () => { setSearch(''); setStatusTab('all'); } }} />
        )
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Invoice #', 'Date', 'Customer', 'Place of Supply', 'Taxable', 'GST', 'Total', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((inv, i) => (
                  <motion.tr key={inv.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 text-sm">{inv.customerName}</div>
                      {inv.customerGstin && <div className="text-[11px] text-gray-400 font-mono">{inv.customerGstin}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{inv.placeOfSupply || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">{formatCurrency(inv.taxableAmount)}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">{formatCurrency(inv.totalGstAmount)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 text-sm whitespace-nowrap">{formatCurrency(inv.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={INVOICE_STATUS_BADGE[inv.status]}>{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="icon-sm" variant="ghost"
                        onClick={e => { e.stopPropagation(); navigate(`/invoices/${inv.id}`); }}>
                        <Receipt className="w-3.5 h-3.5 text-gray-400" />
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
