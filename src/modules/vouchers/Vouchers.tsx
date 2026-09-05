import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, FileCheck, Clock, CheckCircle, Send, IndianRupee,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { VoucherStatus, VoucherType } from '@/shared/types';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency, formatCurrencyShort } from '@/shared/utils/format';
import { calcVoucherPricing } from '@/shared/utils/finance';
import { cn } from '@/shared/utils/cn';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/EmptyState';

// ─── Constants ────────────────────────────────────────────────

export const VOUCHER_TYPES: { value: VoucherType; label: string; emoji: string }[] = [
  { value: 'hotel',    label: 'Hotel',    emoji: '🏨' },
  { value: 'transfer', label: 'Transfer', emoji: '🚗' },
  { value: 'activity', label: 'Activity', emoji: '🎯' },
  { value: 'flight',   label: 'Flight',   emoji: '✈️' },
  { value: 'bus',      label: 'Bus',      emoji: '🚌' },
  { value: 'visa',     label: 'Visa',     emoji: '📋' },
  { value: 'general',  label: 'General',  emoji: '📄' },
];

export const VOUCHER_STATUS_BADGE: Record<VoucherStatus, 'secondary' | 'default' | 'success' | 'destructive'> = {
  draft:     'secondary',
  issued:    'default',
  completed: 'success',
  cancelled: 'destructive',
};

const STATUS_TABS: { value: VoucherStatus | 'all'; label: string }[] = [
  { value: 'all',       label: 'All'       },
  { value: 'draft',     label: 'Draft'     },
  { value: 'issued',    label: 'Issued'    },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function Vouchers() {
  const navigate  = useNavigate();
  const vouchers  = useStore(s => s.vouchers);

  const [search,    setSearch]    = useState('');
  const [statusTab, setStatusTab] = useState<VoucherStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<VoucherType | 'all'>('all');

  const kpis = useMemo(() => ({
    total:     vouchers.length,
    draft:     vouchers.filter(v => v.status === 'draft').length,
    issued:    vouchers.filter(v => v.status === 'issued').length,
    completed: vouchers.filter(v => v.status === 'completed').length,
    // Cancelled vouchers are excluded — they represent no billable value.
    value:     vouchers
      .filter(v => v.status !== 'cancelled')
      .reduce((sum, v) => sum + (calcVoucherPricing(v).totalPayable ?? 0), 0),
  }), [vouchers]);

  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUS_TABS) {
      counts[s.value] = s.value === 'all'
        ? vouchers.length
        : vouchers.filter(v => v.status === s.value).length;
    }
    return counts;
  }, [vouchers]);

  const filtered = useMemo(() => {
    let list = vouchers;
    if (statusTab !== 'all')  list = list.filter(v => v.status === statusTab);
    if (typeFilter !== 'all') list = list.filter(v => v.type   === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.customerName.toLowerCase().includes(q) ||
        (v.destination || '').toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q) ||
        (v.vendorName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [vouchers, statusTab, typeFilter, search]);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Vouchers</h2>
          <Badge variant="secondary">{vouchers.length} total</Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => navigate('/vouchers/new')}>
          <Plus className="w-3.5 h-3.5" /> New Voucher
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total',       value: kpis.total,                      icon: FileCheck,   color: 'text-gray-900'    },
          { label: 'Draft',       value: kpis.draft,                      icon: Clock,       color: 'text-amber-600'   },
          { label: 'Issued',      value: kpis.issued,                     icon: Send,        color: 'text-indigo-600'  },
          { label: 'Completed',   value: kpis.completed,                  icon: CheckCircle, color: 'text-emerald-600' },
          { label: 'Total Value', value: formatCurrencyShort(kpis.value), icon: IndianRupee, color: 'text-teal-600'    },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center mb-2">
              <Icon className={cn('w-4 h-4', color)} />
            </div>
            <div className={cn('text-2xl font-bold font-display', color)}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-all',
            typeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
        >
          All Types
        </button>
        {VOUCHER_TYPES.map(t => (
          <button key={t.value}
            onClick={() => setTypeFilter(typeFilter === t.value ? 'all' : t.value)}
            className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-all flex items-center gap-1',
              typeFilter === t.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
          >
            <span>{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STATUS_TABS.map(s => (
          <button key={s.value}
            onClick={() => setStatusTab(s.value as VoucherStatus | 'all')}
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
        <input type="text" placeholder="Search customer, destination, voucher#…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-transparent text-xs text-gray-700 outline-none flex-1 placeholder:text-gray-400" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        vouchers.length === 0 ? (
          <EmptyState icon={FileCheck} title="No vouchers yet"
            description="Generate professional vouchers directly from trips"
            action={{ label: '+ New Voucher', onClick: () => navigate('/vouchers/new') }} />
        ) : (
          <EmptyState icon={Search} title="No vouchers match your filters"
            action={{ label: 'Clear', onClick: () => { setSearch(''); setStatusTab('all'); setTypeFilter('all'); } }} />
        )
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Voucher #', 'Type', 'Customer', 'Destination', 'Vendor', 'Issue Date', 'Amount', 'Status', ''].map(h => (
                    <th key={h} className={cn('text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap',
                      h === 'Amount' ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((v, i) => {
                  const typeMeta = VOUCHER_TYPES.find(t => t.value === v.type);
                  const total    = calcVoucherPricing(v).totalPayable;
                  return (
                    <motion.tr key={v.id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/vouchers/${v.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">{v.voucherNumber}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="flex items-center gap-1.5 text-xs">
                          <span>{typeMeta?.emoji}</span>{typeMeta?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 text-sm">{v.customerName}</div>
                        {v.customerPhone && <div className="text-[11px] text-gray-400">{v.customerPhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{v.destination || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{v.vendorName || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {v.issueDate ? fmtDate(v.issueDate) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {total === null
                          ? <span className="text-xs text-gray-400">Unpriced</span>
                          : <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={VOUCHER_STATUS_BADGE[v.status]}>{v.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button size="icon-sm" variant="ghost"
                          onClick={e => { e.stopPropagation(); navigate(`/vouchers/${v.id}`); }}>
                          <FileCheck className="w-3.5 h-3.5 text-gray-400" />
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
