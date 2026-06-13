import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Plane, Hotel, Train, Users, FolderOpen, FileText, FileCheck, Hash } from 'lucide-react';
import { useStore } from '@/store';
import { cn } from '@/shared/utils/cn';

interface SearchResult {
  id:       string;
  type:     'trip' | 'customer' | 'booking' | 'voucher';
  title:    string;
  subtitle: string;
  meta?:    string;
  url:      string;
  icon:     React.ElementType;
}

function scoreMatch(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function bookingIcon(type?: string): React.ElementType {
  if (type === 'flight') return Plane;
  if (type === 'hotel')  return Hotel;
  if (type === 'train')  return Train;
  return FileText;
}

interface Props {
  open:    boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: Props) {
  const navigate  = useNavigate();
  const inputRef  = useRef<HTMLInputElement>(null);

  const trips      = useStore(s => s.trips);
  const customers  = useStore(s => s.customers);
  const bookings   = useStore(s => s.bookings);
  const vouchers   = useStore(s => s.vouchers);

  const [query,     setQuery]     = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo((): SearchResult[] => {
    const q = query.trim();
    if (q.length < 2) return [];
    const out: SearchResult[] = [];

    // Trips — by ID, trip number, customer name, destination, phone
    trips.forEach(t => {
      if (
        scoreMatch(t.id, q) ||
        scoreMatch(t.tripNumber !== undefined ? String(t.tripNumber) : '', q) ||
        scoreMatch(t.customer, q) ||
        scoreMatch(t.destination, q) ||
        scoreMatch(t.phone ?? '', q)
      ) {
        out.push({
          id:       t.id,
          type:     'trip',
          title:    `${t.customer} — ${t.destination}`,
          subtitle: t.tripNumber !== undefined ? `${t.id} · Trip #${t.tripNumber}` : t.id,
          meta:     t.status,
          url:      `/trips/${t.id}`,
          icon:     FolderOpen,
        });
      }
    });

    // Customers — by name, customer number, phone, email
    customers.forEach(c => {
      if (
        scoreMatch(c.name, q) ||
        scoreMatch(c.customerNumber !== undefined ? String(c.customerNumber) : '', q) ||
        scoreMatch(c.phone ?? '', q) ||
        scoreMatch(c.email ?? '', q)
      ) {
        out.push({
          id:       c.id,
          type:     'customer',
          title:    c.name,
          subtitle: c.customerNumber !== undefined
            ? `${c.phone ?? c.email ?? c.id} · Customer #${c.customerNumber}`
            : (c.phone ?? c.email ?? c.id),
          url:      `/customers`,
          icon:     Users,
        });
      }
    });

    // Bookings — by PNR, ticket number, confirmation number, flight number, booking ID
    bookings.forEach(b => {
      const d = (b.detail ?? {}) as Record<string, string | undefined>;
      if (
        scoreMatch(b.id, q) ||
        scoreMatch(d.pnr                ?? '', q) ||
        scoreMatch(d.ticketNumber       ?? '', q) ||
        scoreMatch(d.confirmationNumber ?? '', q) ||
        scoreMatch(d.flightNumber       ?? '', q) ||
        scoreMatch(d.airline            ?? '', q) ||
        scoreMatch(d.hotelName          ?? '', q)
      ) {
        const label =
          d.flightNumber  ? `${d.airline ?? ''} ${d.flightNumber}`.trim() :
          d.hotelName     ? d.hotelName :
          d.pnr           ? `PNR: ${d.pnr}` :
          b.id;
        out.push({
          id:       b.id,
          type:     'booking',
          title:    label,
          subtitle: b.id,
          meta:     b.type,
          url:      `/bookings/${b.id}`,
          icon:     bookingIcon(b.type),
        });
      }
    });

    // Vouchers — by voucher number, type
    vouchers.forEach(v => {
      if (
        scoreMatch(v.voucherNumber ?? '', q) ||
        scoreMatch(v.id, q) ||
        scoreMatch(v.type ?? '', q)
      ) {
        out.push({
          id:       v.id,
          type:     'voucher',
          title:    v.voucherNumber ?? v.id,
          subtitle: v.type ?? 'Voucher',
          url:      `/vouchers/${v.id}`,
          icon:     FileCheck,
        });
      }
    });

    return out.slice(0, 12);
  }, [query, trips, customers, bookings, vouchers]);

  useEffect(() => { setActiveIdx(0); }, [results]);

  const handleSelect = useCallback((r: SearchResult) => {
    navigate(r.url);
    onClose();
  }, [navigate, onClose]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) handleSelect(results[activeIdx]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  const TYPE_LABELS: Record<string, string> = {
    trip:      'Trip',
    customer:  'Customer',
    booking:   'Booking',
    voucher:   'Voucher',
  };

  const TYPE_COLORS: Record<string, string> = {
    trip:      'bg-indigo-50 text-indigo-600',
    customer:  'bg-blue-50 text-blue-600',
    booking:   'bg-emerald-50 text-emerald-600',
    voucher:   'bg-amber-50 text-amber-600',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 animate-fade-in">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search customers, trips, PNR, passport, booking ID..."
            className="flex-1 text-base text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-[11px] text-gray-500 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {query.length >= 2 && (
          <div className="max-h-[60vh] overflow-y-auto">
            {results.length === 0 ? (
              <div className="py-12 text-center">
                <Hash className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No results for <span className="font-medium text-gray-600">"{query}"</span></p>
                <p className="text-xs text-gray-300 mt-1">Try customer name, PNR, passport number, or booking ID</p>
              </div>
            ) : (
              <ul className="py-2">
                {results.map((r, idx) => {
                  const Icon = r.icon;
                  return (
                    <li key={r.id + r.type}>
                      <button
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          idx === activeIdx ? 'bg-indigo-50' : 'hover:bg-gray-50',
                        )}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => handleSelect(r)}
                      >
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', TYPE_COLORS[r.type] ?? 'bg-gray-100 text-gray-500')}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                          <p className="text-xs text-gray-400 truncate">{r.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {r.meta && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium capitalize">
                              {r.meta}
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize border border-current/20" style={{ color: 'inherit' }}>
                            <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', TYPE_COLORS[r.type])}>
                              {TYPE_LABELS[r.type]}
                            </span>
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Footer hint */}
        {query.length < 2 && (
          <div className="px-4 py-4 text-center">
            <p className="text-xs text-gray-400">
              Search across customers, trips, PNR, passport numbers, booking IDs, vouchers
            </p>
            <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-gray-300">
              <span><kbd className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">↵</kbd> open</span>
              <span><kbd className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">ESC</kbd> close</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
