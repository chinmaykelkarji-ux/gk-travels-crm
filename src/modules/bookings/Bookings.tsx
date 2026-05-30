import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ticket, Search, Plus, Plane, Hotel, Car, Train, Bus,
  Shield, Activity, Package, HelpCircle, IndianRupee,
  AlertTriangle, CheckCircle, Clock, Filter, X,
} from 'lucide-react';
import { useStore } from '@/store';
import type { Booking, BookingType, BookingStatus } from '@/shared/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { formatCurrency, formatCurrencyShort } from '@/shared/utils/format';
import { fmtDate } from '@/shared/utils/date';
import { FINANCIAL_STATUS_CLASS, FINANCIAL_STATUS_LABEL, getFinancialStatus } from '@/shared/utils/finance';
import { cn } from '@/shared/utils/cn';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { toast } from '@/shared/hooks/useToast';

// ─── Type icon map ────────────────────────────────────────────

const TYPE_ICON: Record<BookingType, React.ElementType> = {
  flight:    Plane,
  hotel:     Hotel,
  cab:       Car,
  train:     Train,
  bus:       Bus,
  visa:      Shield,
  insurance: Shield,
  activity:  Activity,
  other:     Package,
};

const TYPE_COLOR: Record<BookingType, string> = {
  flight:    'bg-blue-50 text-blue-600',
  hotel:     'bg-emerald-50 text-emerald-600',
  cab:       'bg-amber-50 text-amber-600',
  train:     'bg-violet-50 text-violet-600',
  bus:       'bg-indigo-50 text-indigo-600',
  visa:      'bg-orange-50 text-orange-600',
  insurance: 'bg-teal-50 text-teal-600',
  activity:  'bg-pink-50 text-pink-600',
  other:     'bg-gray-50 text-gray-500',
};

const BOOKING_TYPES: BookingType[] = [
  'flight', 'hotel', 'cab', 'train', 'bus', 'visa', 'insurance', 'activity', 'other',
];

const STATUS_CONFIG: Record<BookingStatus, { label: string; class: string }> = {
  pending:    { label: 'Pending',    class: 'bg-gray-100 text-gray-600'     },
  confirmed:  { label: 'Confirmed',  class: 'bg-blue-100 text-blue-700'     },
  issued:     { label: 'Issued',     class: 'bg-indigo-100 text-indigo-700' },
  submitted:  { label: 'Submitted',  class: 'bg-amber-100 text-amber-700'   },
  approved:   { label: 'Approved',   class: 'bg-emerald-100 text-emerald-700' },
  rejected:   { label: 'Rejected',   class: 'bg-red-100 text-red-600'       },
  checked_in: { label: 'Checked In', class: 'bg-teal-100 text-teal-700'     },
  departed:   { label: 'Departed',   class: 'bg-violet-100 text-violet-700' },
  completed:  { label: 'Completed',  class: 'bg-emerald-100 text-emerald-800' },
  cancelled:  { label: 'Cancelled',  class: 'bg-red-50 text-red-400'        },
};

// ─── New Booking Form ─────────────────────────────────────────

interface BookingFormData {
  type:          BookingType;
  customerName:  string;
  refId:         string;
  sellingPrice:  string;
  supplierCost:  string;
  advance:       string;
  gstRate:       string;
  status:        BookingStatus;
  notes:         string;
}

const DEFAULT_FORM: BookingFormData = {
  type:         'flight',
  customerName: '',
  refId:        '',
  sellingPrice: '',
  supplierCost: '',
  advance:      '',
  gstRate:      '5',
  status:       'pending',
  notes:        '',
};

interface NewBookingDialogProps {
  open:    boolean;
  onClose: () => void;
}

function NewBookingDialog({ open, onClose }: NewBookingDialogProps) {
  const trips         = useStore(s => s.trips);
  const createBooking = useStore(s => s.createBooking);
  const [form, setForm] = useState<BookingFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof BookingFormData>(key: K, val: BookingFormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleClose() {
    setForm(DEFAULT_FORM);
    onClose();
  }

  function handleSave() {
    if (!form.customerName.trim()) { toast.error('Customer name is required'); return; }
    setSaving(true);
    try {
      const selling = form.sellingPrice ? parseFloat(form.sellingPrice) : null;
      const cost    = parseFloat(form.supplierCost  || '0');
      const adv     = parseFloat(form.advance       || '0');
      const gst     = parseFloat(form.gstRate       || '5');

      createBooking({
        type:         form.type,
        customerName: form.customerName.trim(),
        refId:        form.refId || undefined,
        sellingPrice: selling,
        supplierCost: cost,
        advance:      adv,
        supplierPaid: 0,
        gstRate:      gst,
        status:       form.status,
        notes:        form.notes,
        detail:       {},
      });
      toast.success('Booking created', `${form.type} booking for ${form.customerName}`);
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* Type selector */}
          <div className="space-y-1.5">
            <Label>Booking Type</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {BOOKING_TYPES.map(t => {
                const Icon = TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('type', t)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all capitalize',
                      form.type === t
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bk-customer" required>Customer Name</Label>
              <Input
                id="bk-customer"
                value={form.customerName}
                onChange={e => set('customerName', e.target.value)}
                placeholder="e.g. Rajesh Kumar"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-trip">Linked Trip (optional)</Label>
              <Select value={form.refId} onValueChange={v => set('refId', v)}>
                <SelectTrigger id="bk-trip">
                  <SelectValue placeholder="Select trip…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {trips.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.id} — {t.customer} ({t.destination})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-selling">Selling Price (₹)</Label>
              <Input
                id="bk-selling"
                type="number"
                min="0"
                step="0.01"
                value={form.sellingPrice}
                onChange={e => set('sellingPrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-cost">Supplier Cost (₹)</Label>
              <Input
                id="bk-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.supplierCost}
                onChange={e => set('supplierCost', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-advance">Advance Paid by Customer (₹)</Label>
              <Input
                id="bk-advance"
                type="number"
                min="0"
                step="0.01"
                value={form.advance}
                onChange={e => set('advance', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-gst">GST Rate (%)</Label>
              <Select value={form.gstRate} onValueChange={v => set('gstRate', v)}>
                <SelectTrigger id="bk-gst">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['0', '5', '12', '18', '28'].map(r => (
                    <SelectItem key={r} value={r}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bk-status">Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v as BookingStatus)}>
                <SelectTrigger id="bk-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bk-notes">Notes</Label>
              <Input
                id="bk-notes"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="PNR, confirmation number, special instructions…"
              />
            </div>
          </div>

          {/* Quick margin preview */}
          {form.sellingPrice && form.supplierCost && (
            <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between text-xs">
              <span className="text-gray-500">Estimated margin:</span>
              <span className={cn(
                'font-bold',
                parseFloat(form.sellingPrice) - parseFloat(form.supplierCost) >= 0
                  ? 'text-emerald-600' : 'text-red-600'
              )}>
                {formatCurrency(parseFloat(form.sellingPrice) - parseFloat(form.supplierCost))}
                {' '}
                ({parseFloat(form.sellingPrice) > 0
                  ? `${(((parseFloat(form.sellingPrice) - parseFloat(form.supplierCost)) / parseFloat(form.sellingPrice)) * 100).toFixed(1)}%`
                  : '—'})
              </span>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>Create Booking</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Module ──────────────────────────────────────────────

export default function Bookings() {
  const navigate = useNavigate();
  const bookings = useStore(s => s.bookings);
  const trips    = useStore(s => s.trips);

  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState<BookingType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [formOpen,    setFormOpen]    = useState(false);

  // ── Stats ────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalValue     = bookings.reduce((s, b) => s + (b.totalPayable ?? 0), 0);
    const totalCost      = bookings.reduce((s, b) => s + (b.supplierCost ?? 0), 0);
    const totalBalance   = bookings.reduce((s, b) => s + (b.balanceDue ?? 0), 0);
    const totalMargin    = bookings.reduce((s, b) => s + (b.grossMargin ?? 0), 0);
    const byType: Record<string, number> = {};
    for (const b of bookings) byType[b.type] = (byType[b.type] ?? 0) + 1;
    return { totalValue, totalCost, totalBalance, totalMargin, byType };
  }, [bookings]);

  // ── Filter ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = bookings;
    if (typeFilter !== 'all') list = list.filter(b => b.type === typeFilter);
    if (statusFilter !== 'all') list = list.filter(b => b.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.customerName.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)           ||
        (b.refId || '').toLowerCase().includes(q) ||
        b.type.includes(q)
      );
    }
    return list;
  }, [bookings, typeFilter, statusFilter, search]);

  // ── Trip lookup ──────────────────────────────────────────────

  const tripMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of trips) m[t.id] = t.destination;
    return m;
  }, [trips]);

  const hasFilters = typeFilter !== 'all' || statusFilter !== 'all' || search.trim();

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Bookings</h2>
          <Badge variant="secondary">{bookings.length} total</Badge>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Booking
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Value',
            value: formatCurrencyShort(stats.totalValue),
            icon: IndianRupee,
            color: 'text-indigo-600 bg-indigo-50',
          },
          {
            label: 'Supplier Cost',
            value: formatCurrencyShort(stats.totalCost),
            icon: Package,
            color: 'text-gray-600 bg-gray-100',
          },
          {
            label: 'Balance Due',
            value: formatCurrencyShort(stats.totalBalance),
            icon: Clock,
            color: stats.totalBalance > 0 ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50',
          },
          {
            label: 'Gross Margin',
            value: formatCurrencyShort(stats.totalMargin),
            icon: stats.totalMargin >= 0 ? CheckCircle : AlertTriangle,
            color: stats.totalMargin >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', card.color)}>
              <card.icon className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-gray-900 font-display">{card.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            'flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all',
            typeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          All ({bookings.length})
        </button>
        {BOOKING_TYPES.filter(t => (stats.byType[t] ?? 0) > 0).map(t => {
          const Icon = TYPE_ICON[t];
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all capitalize',
                typeFilter === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <Icon className="w-3 h-3" />
              {t} ({stats.byType[t]})
            </button>
          );
        })}
      </div>

      {/* Search + status filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by customer, ID, or trip…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-gray-700 outline-none flex-1 placeholder:text-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <button
            onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setSearch(''); }}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bookings table */}
      {filtered.length === 0 ? (
        bookings.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No bookings yet"
            description="Create your first booking — flight, hotel, visa, or any other travel service"
            action={{ label: '+ New Booking', onClick: () => setFormOpen(true) }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No bookings match your filters"
            action={{ label: 'Clear filters', onClick: () => { setTypeFilter('all'); setStatusFilter('all'); setSearch(''); } }}
          />
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <span className="text-xs text-gray-500">{filtered.length} booking{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Type', 'Customer', 'Linked Trip', 'Selling Price', 'Cost', 'Balance', 'Margin', 'Status', 'Date'].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-400 px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(b => {
                  const Icon       = TYPE_ICON[b.type] ?? HelpCircle;
                  const finStatus  = getFinancialStatus(b.totalPayable, b.advance);
                  const statusCfg  = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
                  const typeClr    = TYPE_COLOR[b.type]   ?? TYPE_COLOR.other;
                  const linkedDest = b.refId ? tripMap[b.refId] : null;

                  return (
                    <tr key={b.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium capitalize', typeClr)}>
                          <Icon className="w-3 h-3" />
                          {b.type}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 text-sm">{b.customerName}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{b.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {b.refId ? (
                          <button
                            onClick={() => navigate(`/trips/${b.refId}`)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            {b.refId}
                            {linkedDest && <span className="text-gray-400 ml-1">({linkedDest})</span>}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        {b.totalPayable !== null ? formatCurrency(b.totalPayable) : (
                          <span className="text-amber-600 text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Not set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {b.supplierCost > 0 ? formatCurrency(b.supplierCost) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={cn('px-4 py-3 font-medium text-sm', b.balanceDue > 0 ? 'text-red-600' : 'text-gray-400')}>
                        {formatCurrency(b.balanceDue)}
                      </td>
                      <td className={cn('px-4 py-3 text-sm font-semibold', b.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {formatCurrency(b.grossMargin)}
                        {b.totalPayable && b.totalPayable > 0 && (
                          <div className="text-[10px] font-normal text-gray-400">
                            {b.marginPct.toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full', statusCfg.class)}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {fmtDate(b.createdDate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-6 text-xs text-gray-500">
              <span>
                Value: <strong className="text-gray-800">{formatCurrency(filtered.reduce((s, b) => s + (b.totalPayable ?? 0), 0))}</strong>
              </span>
              <span>
                Cost: <strong className="text-gray-800">{formatCurrency(filtered.reduce((s, b) => s + b.supplierCost, 0))}</strong>
              </span>
              <span>
                Balance: <strong className="text-red-600">{formatCurrency(filtered.reduce((s, b) => s + b.balanceDue, 0))}</strong>
              </span>
              <span>
                Margin: <strong className="text-emerald-600">{formatCurrency(filtered.reduce((s, b) => s + b.grossMargin, 0))}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      <NewBookingDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
