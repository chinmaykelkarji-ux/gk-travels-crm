import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCircle, Search, Phone, Mail, MapPin, Shield,
  Star, Users, TrendingUp, X, Plus,
  FileText, ChevronRight, Hash,
} from 'lucide-react';
import { useStore } from '@/store';
import type { Customer } from '@/shared/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { formatCurrency } from '@/shared/utils/format';
import { fmtDate, daysUntil } from '@/shared/utils/date';
import { initials } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { EmptyState } from '@/shared/components/EmptyState';
import { GmailButton } from '@/shared/components/GmailButton';
import { gmail } from '@/shared/utils/email';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogBody,
} from '@/shared/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { toast } from '@/shared/hooks/useToast';

// ─── Segment helpers ──────────────────────────────────────────

type Segment = 'all' | 'repeat' | 'vip' | 'new' | 'passport_expiring';

function getSegment(c: Customer): 'vip' | 'repeat' | 'new' {
  const tripCount = c.tripIds?.length ?? 0;
  if (tripCount >= 5) return 'vip';
  if (tripCount >= 2) return 'repeat';
  return 'new';
}

const SEGMENT_BADGE: Record<string, { label: string; class: string }> = {
  vip:    { label: 'VIP',    class: 'bg-amber-100 text-amber-700 border-amber-200'    },
  repeat: { label: 'Repeat', class: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  new:    { label: 'New',    class: 'bg-gray-100 text-gray-600 border-gray-200'       },
};

const AVATAR_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-pink-500 to-rose-600',
  'from-cyan-500 to-sky-600',
];

function avatarColor(id: string) {
  const i = id.charCodeAt(id.length - 1) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

// ─── New Customer Dialog ──────────────────────────────────────

interface CustomerFormData {
  name:           string;
  phone:          string;
  altPhone:       string;
  email:          string;
  city:           string;
  address:        string;
  passportNo:     string;
  passportExpiry: string;
  panNumber:      string;
  notes:          string;
}

const DEFAULT_CUSTOMER: CustomerFormData = {
  name:           '',
  phone:          '',
  altPhone:       '',
  email:          '',
  city:           '',
  address:        '',
  passportNo:     '',
  passportExpiry: '',
  panNumber:      '',
  notes:          '',
};

interface NewCustomerDialogProps {
  open:    boolean;
  onClose: () => void;
}

function NewCustomerDialog({ open, onClose }: NewCustomerDialogProps) {
  const createCustomer = useStore(s => s.createCustomer);
  const [form, setForm] = useState<CustomerFormData>(DEFAULT_CUSTOMER);
  const [saving, setSaving] = useState(false);

  function field<K extends keyof CustomerFormData>(key: K, val: CustomerFormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleClose() { setForm(DEFAULT_CUSTOMER); onClose(); }

  function handleSave() {
    if (!form.name.trim())  { toast.error('Name is required');  return; }
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    setSaving(true);
    try {
      createCustomer({
        name:           form.name.trim(),
        phone:          form.phone.trim(),
        altPhone:       form.altPhone  || undefined,
        email:          form.email     || undefined,
        city:           form.city      || undefined,
        address:        form.address   || undefined,
        passportNo:     form.passportNo     || undefined,
        passportExpiry: form.passportExpiry || undefined,
        panNumber:      form.panNumber || undefined,
        notes:          form.notes     || undefined,
        preferences:    {},
        tripIds:        [],
        documents:      [],
      });
      toast.success('Customer added', form.name);
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cu-name" required>Full Name</Label>
              <Input
                id="cu-name"
                value={form.name}
                onChange={e => field('name', e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-phone" required>Phone</Label>
              <Input
                id="cu-phone"
                type="tel"
                value={form.phone}
                onChange={e => field('phone', e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-altphone">Alternate Phone</Label>
              <Input
                id="cu-altphone"
                type="tel"
                value={form.altPhone}
                onChange={e => field('altPhone', e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cu-email">Email</Label>
              <Input
                id="cu-email"
                type="email"
                value={form.email}
                onChange={e => field('email', e.target.value)}
                placeholder="customer@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-city">City</Label>
              <Input
                id="cu-city"
                value={form.city}
                onChange={e => field('city', e.target.value)}
                placeholder="e.g. Mumbai"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-address">Address</Label>
              <Input
                id="cu-address"
                value={form.address}
                onChange={e => field('address', e.target.value)}
                placeholder="Street, Area"
              />
            </div>
          </div>

          {/* Documents section */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Documents (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cu-passport">Passport Number</Label>
                <Input
                  id="cu-passport"
                  value={form.passportNo}
                  onChange={e => field('passportNo', e.target.value)}
                  placeholder="e.g. N1234567"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-passport-exp">Passport Expiry</Label>
                <Input
                  id="cu-passport-exp"
                  type="date"
                  value={form.passportExpiry}
                  onChange={e => field('passportExpiry', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-pan">PAN Number</Label>
                <Input
                  id="cu-pan"
                  value={form.panNumber}
                  onChange={e => field('panNumber', e.target.value)}
                  placeholder="e.g. ABCDE1234F"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="cu-notes">Notes</Label>
            <Input
              id="cu-notes"
              value={form.notes}
              onChange={e => field('notes', e.target.value)}
              placeholder="Seat preference, dietary needs, VIP notes…"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>Add Customer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Customer Detail Drawer ───────────────────────────────────

interface DrawerProps {
  customer: Customer;
  onClose:  () => void;
}

function CustomerDrawer({ customer, onClose }: DrawerProps) {
  const trips    = useStore(s => s.trips);
  const payments = useStore(s => s.payments);

  const customerTrips = useMemo(
    () => trips.filter(t => t.customerId === customer.id || (customer.tripIds ?? []).includes(t.id)),
    [trips, customer]
  );

  const totalRevenue = useMemo(
    () => payments.customerPayments
      .filter(p => p.customerId === customer.id && p.status === 'received')
      .reduce((s, p) => s + p.amount, 0),
    [payments, customer]
  );

  const passportDays = customer.passportExpiry ? daysUntil(customer.passportExpiry) : null;

  const prefs = typeof customer.preferences === 'string'
    ? (() => { try { return JSON.parse(customer.preferences as string); } catch { return {}; } })()
    : customer.preferences;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="w-full max-w-md bg-white shadow-2xl flex flex-col animate-slide-left overflow-hidden"
        style={{ borderLeft: '1px solid #E2E8F0' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-4"
          style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #F0FDF4 100%)' }}>
          <div className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0 bg-gradient-to-br',
            avatarColor(customer.id)
          )}>
            {initials(customer.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-base font-display truncate">{customer.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(() => {
                const seg = getSegment(customer);
                const cfg = SEGMENT_BADGE[seg];
                return <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg.class)}>{cfg.label}</span>;
              })()}
              <span className="text-[11px] text-gray-400 font-mono">{customer.id}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Trips',   value: customerTrips.length,       color: 'text-indigo-600' },
              { label: 'Revenue', value: formatCurrency(totalRevenue), color: 'text-emerald-600' },
              { label: 'Since',   value: fmtDate(customer.createdDate), color: 'text-gray-600' },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <div className={cn('text-sm font-bold font-display', s.color)}>{s.value}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact</h4>
            <div className="space-y-2">
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-3 text-sm text-gray-700 hover:text-indigo-600 transition-colors">
                  <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  {customer.phone}
                  {customer.altPhone && <span className="text-gray-400">/ {customer.altPhone}</span>}
                </a>
              )}
              {customer.email && (
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mail className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  <span className="text-sm text-gray-700 truncate flex-1">{customer.email}</span>
                  <GmailButton
                    email={customer.email}
                    onClick={() => gmail.toCustomer(customer.email!, customer.name)}
                    label="Email"
                  />
                </div>
              )}
              {(customer.address || customer.city) && (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  {[customer.address, customer.city].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* Documents */}
          {(customer.passportNo || customer.panNumber) && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Documents</h4>
              <div className="space-y-2">
                {customer.passportNo && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <Shield className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-gray-800">Passport · {customer.passportNo}</div>
                      {customer.passportExpiry && (
                        <div className={cn(
                          'text-[11px] mt-0.5',
                          passportDays !== null && passportDays < 90 ? 'text-red-500 font-semibold' : 'text-gray-400'
                        )}>
                          Expires {fmtDate(customer.passportExpiry)}
                          {passportDays !== null && passportDays < 90 && ` · ⚠ ${passportDays}d remaining`}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {customer.panNumber && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <Hash className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="text-xs font-medium text-gray-800">PAN · {customer.panNumber}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preferences */}
          {prefs && Object.values(prefs).some(Boolean) && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Preferences</h4>
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                {prefs.seatPreference && (
                  <div className="text-xs text-gray-600">Seat: <strong>{prefs.seatPreference}</strong></div>
                )}
                {prefs.mealPreference && (
                  <div className="text-xs text-gray-600">Meal: <strong>{prefs.mealPreference}</strong></div>
                )}
                {prefs.hotelPreference && (
                  <div className="text-xs text-gray-600">Hotel: <strong>{prefs.hotelPreference}</strong></div>
                )}
                {prefs.notes && <div className="text-xs text-gray-500 italic">{prefs.notes}</div>}
              </div>
            </div>
          )}

          {/* Linked trips */}
          {customerTrips.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Trip History ({customerTrips.length})
              </h4>
              <div className="space-y-2">
                {customerTrips.slice(0, 8).map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer group">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{t.destination}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {t.id} · {t.departure ? fmtDate(t.departure) : 'No date'} · {t.pax} pax
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] font-semibold text-gray-700">{t.totalPayable ? formatCurrency(t.totalPayable) : '—'}</div>
                      <div className={cn(
                        'text-[9px] font-medium capitalize mt-0.5',
                        t.status === 'completed' ? 'text-emerald-600' :
                        t.status === 'cancelled' ? 'text-red-500' :
                        t.status === 'confirmed' ? 'text-blue-600' : 'text-gray-400'
                      )}>
                        {t.status.replace('_', ' ')}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {customer.notes && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h4>
              <p className="text-xs text-gray-600 bg-yellow-50 border border-yellow-100 rounded-xl p-3 leading-relaxed">
                {customer.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Module ──────────────────────────────────────────────

export default function Customers() {
  const customers = useStore(s => s.customers);
  const trips     = useStore(s => s.trips);
  const payments  = useStore(s => s.payments);

  const [search,      setSearch]      = useState('');
  const [segment,     setSegment]     = useState<Segment>('all');
  const [selected,    setSelected]    = useState<Customer | null>(null);
  const [newOpen,     setNewOpen]     = useState(false);

  // ── Stats ─────────────────────────────────────────────────

  const stats = useMemo(() => {
    const vip    = customers.filter(c => getSegment(c) === 'vip').length;
    const repeat = customers.filter(c => getSegment(c) === 'repeat').length;
    const expiring = customers.filter(c => {
      const d = daysUntil(c.passportExpiry);
      return d !== null && d >= 0 && d <= 90;
    }).length;
    return { vip, repeat, expiring };
  }, [customers]);

  // ── Filter ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = customers;
    if (segment === 'vip')              list = list.filter(c => getSegment(c) === 'vip');
    else if (segment === 'repeat')      list = list.filter(c => getSegment(c) === 'repeat');
    else if (segment === 'new')         list = list.filter(c => getSegment(c) === 'new');
    else if (segment === 'passport_expiring') {
      list = list.filter(c => {
        const d = daysUntil(c.passportExpiry);
        return d !== null && d >= 0 && d <= 90;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q)         ||
        (c.phone || '').includes(q)              ||
        (c.email || '').toLowerCase().includes(q)||
        (c.city  || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [customers, search, segment]);

  // ── Revenue map ───────────────────────────────────────────

  const revenueByCustomer = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of payments.customerPayments) {
      if (p.customerId && p.status === 'received') {
        m[p.customerId] = (m[p.customerId] ?? 0) + p.amount;
      }
    }
    return m;
  }, [payments]);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Customers</h2>
          <Badge variant="secondary">{customers.length} total</Badge>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Customer
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Customers', value: customers.length, icon: Users,       color: 'text-indigo-600 bg-indigo-50' },
          { label: 'VIP (5+ trips)',  value: stats.vip,        icon: Star,        color: 'text-amber-600 bg-amber-50'   },
          { label: 'Repeat Guests',   value: stats.repeat,     icon: TrendingUp,  color: 'text-emerald-600 bg-emerald-50'},
          {
            label: 'Passport Expiring',
            value: stats.expiring,
            icon:  Shield,
            color: stats.expiring > 0 ? 'text-red-600 bg-red-50' : 'text-gray-400 bg-gray-50',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', card.color)}>
              <card.icon className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-gray-900 font-display">{card.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by name, phone, email, city…"
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
        <Select value={segment} onValueChange={v => setSegment(v as Segment)}>
          <SelectTrigger className="h-9 w-44 text-xs">
            <SelectValue placeholder="All segments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="vip">VIP (5+ trips)</SelectItem>
            <SelectItem value="repeat">Repeat (2–4 trips)</SelectItem>
            <SelectItem value="new">New (1 trip)</SelectItem>
            <SelectItem value="passport_expiring">Passport Expiring (&lt;90d)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Customer grid */}
      {filtered.length === 0 ? (
        customers.length === 0 ? (
          <EmptyState
            icon={UserCircle}
            title="No customers yet"
            description="Customers are created automatically when trips are created or leads are converted"
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No customers match your search"
            action={{ label: 'Clear filters', onClick: () => { setSearch(''); setSegment('all'); } }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(c => {
            const tripCount  = c.tripIds?.length ?? 0;
            const revenue    = revenueByCustomer[c.id] ?? 0;
            const seg        = getSegment(c);
            const segCfg     = SEGMENT_BADGE[seg];
            const passportExpDays = c.passportExpiry ? daysUntil(c.passportExpiry) : null;

            return (
              <div
                key={c.id}
                onClick={() => setSelected(c)}
                className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
              >
                {/* Avatar + segment */}
                <div className="flex items-start justify-between mb-3">
                  <div className={cn(
                    'w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold text-white bg-gradient-to-br flex-shrink-0',
                    avatarColor(c.id)
                  )}>
                    {initials(c.name)}
                  </div>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', segCfg.class)}>
                    {segCfg.label}
                  </span>
                </div>

                {/* Name */}
                <h3 className="font-bold text-gray-900 text-sm truncate group-hover:text-indigo-700 transition-colors">
                  {c.name}
                </h3>
                <p className="text-[10px] text-gray-400 font-mono mb-3">{c.id}</p>

                {/* Contact */}
                <div className="space-y-1.5 mb-3">
                  {c.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      {c.phone}
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 truncate"
                      onClick={e => e.stopPropagation()}>
                      <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="truncate flex-1">{c.email}</span>
                      <GmailButton
                        email={c.email}
                        onClick={() => gmail.toCustomer(c.email!, c.name)}
                        label=""
                      />
                    </div>
                  )}
                  {c.city && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      {c.city}
                    </div>
                  )}
                </div>

                {/* Passport expiry warning */}
                {passportExpDays !== null && passportExpDays >= 0 && passportExpDays <= 90 && (
                  <div className="mb-2 flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 text-[10px] text-red-600 font-medium">
                    <Shield className="w-3 h-3 flex-shrink-0" />
                    Passport expires in {passportExpDays}d
                  </div>
                )}

                {/* Footer stats */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <FileText className="w-3 h-3 text-gray-400" />
                    <strong>{tripCount}</strong> trip{tripCount !== 1 ? 's' : ''}
                  </div>
                  {revenue > 0 && (
                    <div className="text-xs font-semibold text-emerald-600">
                      {formatCurrency(revenue)}
                    </div>
                  )}
                  {revenue === 0 && (
                    <div className="text-[10px] text-gray-400">
                      Since {fmtDate(c.createdDate)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Customer detail drawer */}
      {selected && (
        <CustomerDrawer customer={selected} onClose={() => setSelected(null)} />
      )}

      <NewCustomerDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
