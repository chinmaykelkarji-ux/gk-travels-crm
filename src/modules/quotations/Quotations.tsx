import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, FileText, TrendingUp,
  CheckCircle, Clock, XCircle, Send,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { QuotationStatus } from '@/shared/types';
import { formatCurrency, formatCurrencyShort } from '@/shared/utils/format';
import { fmtDate } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/EmptyState';

// ─── Constants ───────────────────────────────────────────────

const STATUS_META: Record<QuotationStatus, { label: string; variant: 'secondary' | 'default' | 'success' | 'destructive' | 'warning' | 'orange' }> = {
  draft:    { label: 'Draft',    variant: 'secondary'   },
  sent:     { label: 'Sent',     variant: 'default'     },
  accepted: { label: 'Accepted', variant: 'success'     },
  rejected: { label: 'Rejected', variant: 'destructive' },
  expired:  { label: 'Expired',  variant: 'warning'     },
};

const STATUS_TABS: { value: QuotationStatus | 'all'; label: string }[] = [
  { value: 'all',      label: 'All'      },
  { value: 'draft',    label: 'Draft'    },
  { value: 'sent',     label: 'Sent'     },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired',  label: 'Expired'  },
];

// ─── Component ───────────────────────────────────────────────

export default function Quotations() {
  const navigate    = useNavigate();
  const quotations  = useStore(s => s.quotations);

  const [search,     setSearch]     = useState('');
  const [statusTab,  setStatusTab]  = useState<QuotationStatus | 'all'>('all');
  const [startFrom,  setStartFrom]  = useState('');
  const [startTo,    setStartTo]    = useState('');

  // ── KPIs ─────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const total     = quotations.length;
    const sent      = quotations.filter(q => ['sent', 'accepted', 'rejected'].includes(q.status)).length;
    const accepted  = quotations.filter(q => q.status === 'accepted').length;
    const pipeline  = quotations
      .filter(q => ['draft', 'sent'].includes(q.status))
      .reduce((s, q) => s + (q.totalSelling ?? 0), 0);
    const profit    = quotations
      .filter(q => ['draft', 'sent'].includes(q.status))
      .reduce((s, q) => s + (q.grossProfit  ?? 0), 0);
    const rate = sent > 0 ? Math.round((accepted / sent) * 100) : 0;
    return { total, sent, accepted, rate, pipeline, profit };
  }, [quotations]);

  // ── Filters ───────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = quotations;
    if (statusTab !== 'all') list = list.filter(q => q.status === statusTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.customerName.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q)  ||
        r.id.toLowerCase().includes(q)
      );
    }
    if (startFrom) list = list.filter(q => q.createdDate >= startFrom);
    if (startTo)   list = list.filter(q => q.createdDate <= startTo);
    return list;
  }, [quotations, statusTab, search, startFrom, startTo]);

  // ── Pipeline by status ────────────────────────────────────

  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUS_TABS) {
      counts[s.value] = s.value === 'all'
        ? quotations.length
        : quotations.filter(q => q.status === s.value).length;
    }
    return counts;
  }, [quotations]);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Quotations</h2>
          <Badge variant="secondary">{quotations.length} total</Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => navigate('/quotations/new')}>
          <Plus className="w-3.5 h-3.5" /> New Quotation
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',           value: String(kpis.total),                     icon: FileText,   color: 'text-gray-900' },
          { label: 'Sent',            value: String(kpis.sent),                      icon: Send,       color: 'text-indigo-600' },
          { label: 'Acceptance Rate', value: `${kpis.rate}%`,                        icon: CheckCircle, color: 'text-emerald-600' },
          { label: 'Revenue Pipeline',value: formatCurrencyShort(kpis.pipeline),     icon: TrendingUp,  color: 'text-blue-600' },
          { label: 'Potential Profit',value: formatCurrencyShort(kpis.profit),       icon: TrendingUp,  color: 'text-violet-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center">
                <Icon className={cn('w-4 h-4', color)} />
              </div>
            </div>
            <div className={cn('text-xl font-bold font-display', color)}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STATUS_TABS.map(s => (
          <button
            key={s.value}
            onClick={() => setStatusTab(s.value as QuotationStatus | 'all')}
            className={cn(
              'flex-shrink-0 text-xs px-3.5 py-1.5 rounded-full font-medium transition-all',
              statusTab === s.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {s.label}
            <span className="ml-1.5 opacity-70">{pipeline[s.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Search + date range */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer, destination, Q#…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-gray-700 outline-none w-48 placeholder:text-gray-400"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>From</span>
          <input type="date" value={startFrom} onChange={e => setStartFrom(e.target.value)}
            className="h-8 rounded-xl border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
          <span>To</span>
          <input type="date" value={startTo} onChange={e => setStartTo(e.target.value)}
            className="h-8 rounded-xl border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
          {(startFrom || startTo) && (
            <button onClick={() => { setStartFrom(''); setStartTo(''); }}
              className="text-indigo-600 hover:text-indigo-700 font-medium">Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        quotations.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No quotations yet"
            description="Create your first quotation to start the sales pipeline"
            action={{ label: '+ New Quotation', onClick: () => navigate('/quotations/new') }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No quotations match your filters"
            action={{ label: 'Clear filters', onClick: () => { setSearch(''); setStatusTab('all'); setStartFrom(''); setStartTo(''); } }}
          />
        )
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Q#', 'Customer', 'Destination', 'Dates', 'Pax', 'Items', 'Cost', 'Selling', 'Profit', 'Margin', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((q, i) => {
                  const meta = STATUS_META[q.status];
                  return (
                    <motion.tr
                      key={q.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/quotations/${q.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">{q.quotationNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 text-sm">{q.customerName}</div>
                        {q.customerPhone && <div className="text-[11px] text-gray-400">{q.customerPhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{q.destination}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {q.startDate ? fmtDate(q.startDate) : '—'}
                        {q.endDate ? ` → ${fmtDate(q.endDate)}` : ''}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{q.pax}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="secondary">{q.items.length}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">{formatCurrency(q.totalCost)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap text-xs">{formatCurrency(q.totalSelling)}</td>
                      <td className={cn('px-4 py-3 font-semibold whitespace-nowrap text-xs', q.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {formatCurrency(q.grossProfit)}
                      </td>
                      <td className={cn('px-4 py-3 whitespace-nowrap text-xs', q.marginPct >= 0 ? 'text-blue-600' : 'text-red-500')}>
                        {q.marginPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Open quotation"
                          onClick={e => { e.stopPropagation(); navigate(`/quotations/${q.id}`); }}
                        >
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
