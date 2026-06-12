import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, TrendingUp, CheckCircle, Percent } from 'lucide-react';
import { motion } from 'framer-motion';
import apiClient from '@/lib/apiClient';
import { cn } from '@/shared/utils/cn';
import { formatCurrency, formatCurrencyShort } from '@/shared/utils/format';
import { toast } from '@/shared/hooks/useToast';
import { Badge } from '@/shared/components/ui/badge';
import { EmptyState } from '@/shared/components/EmptyState';
import type { Enquiry, SalesQuote, SalesQuoteStatus } from '@/shared/types/salesQuote';

const STATUS_META: Record<SalesQuoteStatus, { label: string; variant: 'secondary' | 'default' | 'success' | 'destructive' | 'warning' | 'purple' | 'orange' }> = {
  DRAFT:       { label: 'Draft',       variant: 'secondary' },
  SENT:        { label: 'Sent',        variant: 'default' },
  VIEWED:      { label: 'Viewed',      variant: 'purple' },
  NEGOTIATING: { label: 'Negotiating', variant: 'orange' },
  ACCEPTED:    { label: 'Accepted',    variant: 'success' },
  REJECTED:    { label: 'Rejected',    variant: 'destructive' },
  EXPIRED:     { label: 'Expired',     variant: 'warning' },
};

const ALL_STATUSES: SalesQuoteStatus[] = ['DRAFT', 'SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED'];

export default function SalesQuoteList() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<SalesQuote[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<SalesQuoteStatus[]>([]);
  const [startFrom, setStartFrom] = useState('');
  const [startTo, setStartTo] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [quotesRes, enquiriesRes] = await Promise.all([
          apiClient.get<SalesQuote[]>('/sales-quotes'),
          apiClient.get<Enquiry[]>('/enquiries'),
        ]);
        setQuotes(quotesRes.data);
        setEnquiries(enquiriesRes.data);
      } catch {
        toast.error('Failed to load sales quotes');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function toggleStatus(status: SalesQuoteStatus) {
    setStatusFilters(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  }

  const filtered = useMemo(() => {
    let list = quotes;
    if (statusFilters.length > 0) list = list.filter(q => statusFilters.includes(q.status));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.customerName.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q) ||
        r.quoteNumber.toLowerCase().includes(q),
      );
    }
    if (startFrom) list = list.filter(r => r.createdAt.slice(0, 10) >= startFrom);
    if (startTo)   list = list.filter(r => r.createdAt.slice(0, 10) <= startTo);
    return list;
  }, [quotes, statusFilters, search, startFrom, startTo]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const thisMonthQuotes = quotes.filter(q => q.createdAt.slice(0, 10) >= monthStart);
    const acceptedThisMonthValue = thisMonthQuotes
      .filter(q => q.status === 'ACCEPTED')
      .reduce((s, q) => s + q.totalAmount, 0);

    const won = enquiries.filter(e => e.status === 'WON').length;
    const conversionRate = enquiries.length > 0 ? Math.round((won / enquiries.length) * 1000) / 10 : 0;

    return {
      quotesThisMonth: thisMonthQuotes.length,
      acceptedValueThisMonth: acceptedThisMonthValue,
      conversionRate,
    };
  }, [quotes, enquiries]);

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-gray-900 font-display">Sales Quotes</h2>
        <Badge variant="secondary">{quotes.length} total</Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Quotes this month', value: String(stats.quotesThisMonth), icon: FileText, color: 'text-gray-900' },
          { label: 'Accepted value (this month)', value: formatCurrencyShort(stats.acceptedValueThisMonth), icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Enquiry → Won conversion', value: `${stats.conversionRate}%`, icon: Percent, color: 'text-indigo-600' },
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

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            className={cn(
              'flex-shrink-0 text-xs px-3.5 py-1.5 rounded-full font-medium transition-all',
              statusFilters.includes(s)
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {STATUS_META[s].label}
            <span className="ml-1.5 opacity-70">{quotes.filter(q => q.status === s).length}</span>
          </button>
        ))}
        {statusFilters.length > 0 && (
          <button onClick={() => setStatusFilters([])} className="text-xs text-indigo-600 font-medium px-2">Clear</button>
        )}
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
            <button onClick={() => { setStartFrom(''); setStartTo(''); }} className="text-indigo-600 hover:text-indigo-700 font-medium">Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        quotes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No sales quotes yet"
            description="Create a quote from an enquiry to get started"
            action={{ label: 'Go to Enquiries', onClick: () => navigate('/enquiries') }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No quotes match your filters"
            action={{ label: 'Clear filters', onClick: () => { setSearch(''); setStatusFilters([]); setStartFrom(''); setStartTo(''); } }}
          />
        )
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Quote #', 'Customer', 'Destination', 'Total', 'Status', 'Valid Until', 'Created', ''].map(h => (
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
                      onClick={() => navigate(`/sales-quotes/${q.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">{q.quoteNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 text-sm">{q.customerName}</div>
                        {q.customerPhone && <div className="text-[11px] text-gray-400">{q.customerPhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{q.destination}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap text-xs">{formatCurrency(q.totalAmount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(q.validUntil).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(q.createdAt).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3">
                        {q.status === 'ACCEPTED' && (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        )}
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
