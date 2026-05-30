import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Building2, Phone, MapPin,
  IndianRupee, AlertCircle, TrendingUp,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore, selectors } from '@/store';
import type { VendorType } from '@/shared/types';
import { formatCurrency, formatCurrencyShort } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { toast } from '@/shared/hooks/useToast';
import { VendorForm } from './VendorForm';
import { VENDOR_TYPES } from './VendorForm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { EmptyState } from '@/shared/components/EmptyState';

export default function Vendors() {
  const navigate         = useNavigate();
  const vendors          = useStore(s => s.vendors);
  const vendorPayments   = useStore(s => s.vendorPayments);
  const totalOutstanding = useStore(selectors.totalVendorOutstanding);
  const createVendor     = useStore(s => s.createVendor);

  const [formOpen,     setFormOpen]     = useState(false);
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState<VendorType | 'all'>('all');
  const [destFilter,   setDestFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');

  // Unique destinations from all vendors
  const allDestinations = useMemo(() =>
    [...new Set(vendors.flatMap(v => v.destinations))].sort(),
    [vendors]
  );

  const filtered = useMemo(() => {
    let list = vendors;
    if (statusFilter !== 'all')     list = list.filter(v => v.isActive === (statusFilter === 'active'));
    if (typeFilter !== 'all')       list = list.filter(v => v.type === typeFilter);
    if (destFilter)                 list = list.filter(v => v.destinations.includes(destFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.name.toLowerCase().includes(q) ||
        (v.companyName  || '').toLowerCase().includes(q) ||
        (v.contactPerson|| '').toLowerCase().includes(q) ||
        v.phone.includes(q) ||
        v.destinations.some(d => d.toLowerCase().includes(q))
      );
    }
    return list;
  }, [vendors, search, typeFilter, destFilter, statusFilter]);

  // Per-vendor outstanding map
  const vendorOutstanding = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of vendorPayments) {
      if (!p.isPaid) map[p.vendorId] = (map[p.vendorId] ?? 0) + p.outstanding;
    }
    return map;
  }, [vendorPayments]);

  // Top vendors by outstanding (for dashboard)
  const topOwed = useMemo(() =>
    Object.entries(vendorOutstanding)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([vendorId, amount]) => ({
        vendor: vendors.find(v => v.id === vendorId),
        amount,
      }))
      .filter(x => x.vendor),
    [vendorOutstanding, vendors]
  );

  // Most used vendors (by payment count)
  const mostUsed = useMemo(() => {
    const countMap: Record<string, number> = {};
    for (const p of vendorPayments) countMap[p.vendorId] = (countMap[p.vendorId] ?? 0) + 1;
    return Object.entries(countMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([vendorId, count]) => ({ vendor: vendors.find(v => v.id === vendorId), count }))
      .filter(x => x.vendor);
  }, [vendorPayments, vendors]);

  // Destination analysis
  const destAnalysis = useMemo(() => {
    const map: Record<string, { vendorCount: number; outstanding: number }> = {};
    for (const v of vendors) {
      for (const dest of v.destinations) {
        if (!map[dest]) map[dest] = { vendorCount: 0, outstanding: 0 };
        map[dest].vendorCount++;
        map[dest].outstanding += vendorOutstanding[v.id] ?? 0;
      }
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b.outstanding - a.outstanding)
      .slice(0, 8);
  }, [vendors, vendorOutstanding]);

  function handleCreate(data: Parameters<typeof createVendor>[0]) {
    createVendor(data);
    toast.success('Vendor created');
    setFormOpen(false);
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Vendors</h2>
          <Badge variant="secondary">{vendors.length} total</Badge>
          {totalOutstanding > 0 && (
            <Badge variant="warning">{formatCurrencyShort(totalOutstanding)} outstanding</Badge>
          )}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Vendor
        </Button>
      </div>

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900 font-display">{vendors.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Vendors</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-emerald-600 font-display">{vendors.filter(v => v.isActive).length}</div>
          <div className="text-xs text-gray-500 mt-1">Active</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className={cn('text-2xl font-bold font-display', totalOutstanding > 0 ? 'text-amber-600' : 'text-gray-400')}>
            {formatCurrencyShort(totalOutstanding)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Total Payable</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-indigo-600 font-display">{vendorPayments.length}</div>
          <div className="text-xs text-gray-500 mt-1">Engagements</div>
        </div>
      </div>

      {/* Outstanding + Most Used */}
      {(topOwed.length > 0 || mostUsed.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Vendor-wise Outstanding */}
          {topOwed.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-gray-800">Vendor-wise Outstanding</span>
              </div>
              <div className="space-y-2">
                {topOwed.map(({ vendor: v, amount }) => v && (
                  <div key={v.id} className="flex items-center justify-between">
                    <button className="text-sm text-gray-700 hover:text-indigo-600 truncate max-w-[60%] text-left"
                      onClick={() => navigate(`/vendors/${v.id}`)}>
                      {v.name}
                    </button>
                    <span className="text-sm font-semibold text-amber-600">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Most Used Vendors */}
          {mostUsed.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-semibold text-gray-800">Most Used Vendors</span>
              </div>
              <div className="space-y-2">
                {mostUsed.map(({ vendor: v, count }) => v && (
                  <div key={v.id} className="flex items-center justify-between">
                    <button className="text-sm text-gray-700 hover:text-indigo-600 truncate max-w-[60%] text-left"
                      onClick={() => navigate(`/vendors/${v.id}`)}>
                      {v.name}
                    </button>
                    <Badge variant="secondary">{count} {count === 1 ? 'job' : 'jobs'}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Destination analysis */}
      {destAnalysis.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-gray-800">Destination-wise Analysis</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {destAnalysis.map(([dest, info]) => (
              <button key={dest}
                onClick={() => setDestFilter(destFilter === dest ? '' : dest)}
                className={cn(
                  'text-left p-3 rounded-xl border transition-all',
                  destFilter === dest ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                )}>
                <p className="text-sm font-semibold text-gray-800 truncate">{dest}</p>
                <p className="text-xs text-gray-500 mt-0.5">{info.vendorCount} vendor{info.vendorCount !== 1 ? 's' : ''}</p>
                {info.outstanding > 0 && (
                  <p className="text-xs text-amber-600 font-medium mt-0.5">{formatCurrencyShort(info.outstanding)} owed</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input type="text" placeholder="Search vendors…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-gray-700 outline-none w-36 placeholder:text-gray-400" />
        </div>

        {/* Type filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <button onClick={() => setTypeFilter('all')}
            className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-all flex-shrink-0',
              typeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            All Types
          </button>
          {VENDOR_TYPES.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(typeFilter === t.value ? 'all' : t.value)}
              className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-all flex-shrink-0 gap-1 flex items-center',
                typeFilter === t.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              <span>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center gap-1 ml-auto">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-all capitalize',
                statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {s}
            </button>
          ))}
        </div>

        {/* Destination filter */}
        {allDestinations.length > 0 && (
          <select value={destFilter} onChange={e => setDestFilter(e.target.value)}
            className="text-xs h-8 rounded-xl border border-gray-200 bg-white px-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
            <option value="">All Destinations</option>
            {allDestinations.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {/* Vendor Grid */}
      {filtered.length === 0 ? (
        vendors.length === 0
          ? <EmptyState icon={Building2} title="No vendors yet"
              description="Add your first vendor to start tracking costs and payments"
              action={{ label: '+ Add Vendor', onClick: () => setFormOpen(true) }} />
          : <EmptyState icon={Search} title="No vendors match your filters"
              action={{ label: 'Clear filters', onClick: () => { setSearch(''); setTypeFilter('all'); setDestFilter(''); setStatusFilter('active'); } }} />
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
          initial="hidden" animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
        >
          {filtered.map(v => {
            const owed     = vendorOutstanding[v.id] ?? 0;
            const typeInfo = VENDOR_TYPES.find(t => t.value === v.type);
            return (
              <motion.div key={v.id}
                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <div
                  onClick={() => navigate(`/vendors/${v.id}`)}
                  className={cn(
                    'bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer',
                    !v.isActive && 'opacity-60',
                    owed > 0 ? 'border-amber-200' : 'border-gray-200'
                  )}
                >
                  {/* Card header */}
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-gray-50 border border-gray-100">
                        {typeInfo?.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900 text-sm truncate">{v.name}</p>
                          {!v.isActive && <Badge variant="destructive" className="text-[9px] py-0">Inactive</Badge>}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">{typeInfo?.label}</p>
                      </div>
                      {owed > 0 && (
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-amber-500 font-medium">Owed</div>
                          <div className="text-sm font-bold text-amber-600">{formatCurrency(owed)}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-4 space-y-1.5">
                    {v.phone && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span>{v.phone}</span>
                        {v.contactPerson && <span className="text-gray-400">· {v.contactPerson}</span>}
                      </div>
                    )}
                    {v.destinations.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{v.destinations.slice(0, 3).join(', ')}{v.destinations.length > 3 ? ` +${v.destinations.length - 3}` : ''}</span>
                      </div>
                    )}
                    {v.paymentTerms && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <IndianRupee className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{v.paymentTerms}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <VendorForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
