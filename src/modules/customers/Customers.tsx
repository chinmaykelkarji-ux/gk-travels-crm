import { useState, useMemo } from 'react';
import { Contact, Search, Phone } from 'lucide-react';
import { useStore } from '@/store';
import { Badge } from '@/shared/components/ui/badge';
import { fmtDate } from '@/shared/utils/date';
import { initials } from '@/shared/utils/format';
import { EmptyState } from '@/shared/components/EmptyState';

export default function Customers() {
  const customers = useStore(s => s.customers);
  const trips     = useStore(s => s.trips);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Customers</h2>
          <Badge variant="secondary">{customers.length} total</Badge>
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search customers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-gray-700 outline-none w-36 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3.5">
        <p className="text-sm text-blue-700 font-medium">Full Customer Module — Phase 2</p>
        <p className="text-xs text-blue-600 mt-1">
          Duplicate detection, merge, passport/visa storage, preferences, and customer timeline coming in Phase 2.
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Contact}
          title={customers.length === 0 ? 'No customers yet' : 'No customers match your search'}
          description={customers.length === 0 ? 'Customers are created automatically when trips are created or leads are converted' : ''}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const tripCount = (c.tripIds || []).length;
            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                    {initials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-400 font-mono">{c.id}</p>
                  </div>
                </div>
                {c.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />{c.phone}
                  </div>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <Badge variant="secondary">{tripCount} trip{tripCount !== 1 ? 's' : ''}</Badge>
                  <span className="text-[11px] text-gray-400">Since {fmtDate(c.createdDate)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
