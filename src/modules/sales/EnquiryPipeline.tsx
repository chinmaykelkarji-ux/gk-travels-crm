import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus, Search, MessageSquare, X, FileText, MapPin, Users, IndianRupee,
} from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { useStore } from '@/store';
import { cn } from '@/shared/utils/cn';
import { formatCurrency } from '@/shared/utils/format';
import { toast } from '@/shared/hooks/useToast';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/EmptyState';
import type { Enquiry, EnquiryStatus, EnquirySource } from '@/shared/types/salesQuote';

// ── Column / badge config ────────────────────────────────────

const COLUMNS: { status: EnquiryStatus; label: string; dot: string; header: string }[] = [
  { status: 'NEW',         label: 'New',         dot: 'bg-blue-500',   header: 'bg-blue-50 text-blue-700' },
  { status: 'IN_PROGRESS', label: 'In Progress', dot: 'bg-amber-500',  header: 'bg-amber-50 text-amber-700' },
  { status: 'QUOTED',      label: 'Quoted',      dot: 'bg-violet-500', header: 'bg-violet-50 text-violet-700' },
  { status: 'NEGOTIATING', label: 'Negotiating', dot: 'bg-orange-500', header: 'bg-orange-50 text-orange-700' },
  { status: 'WON',         label: 'Won',         dot: 'bg-emerald-500', header: 'bg-emerald-50 text-emerald-700' },
  { status: 'LOST',        label: 'Lost',        dot: 'bg-gray-400',   header: 'bg-gray-50 text-gray-600' },
];

const SOURCE_OPTIONS: EnquirySource[] = ['DIRECT', 'WHATSAPP', 'PHONE', 'EMAIL', 'REFERRAL', 'WEBSITE'];

const SOURCE_LABELS: Record<EnquirySource, string> = {
  DIRECT:   'Direct',
  WHATSAPP: 'WhatsApp',
  PHONE:    'Phone',
  EMAIL:    'Email',
  REFERRAL: 'Referral',
  WEBSITE:  'Website',
};

const NEXT_STATUS: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW:         ['IN_PROGRESS', 'LOST'],
  IN_PROGRESS: ['QUOTED', 'LOST'],
  QUOTED:      ['NEGOTIATING', 'WON', 'LOST'],
  NEGOTIATING: ['QUOTED', 'WON', 'LOST'],
  WON:         [],
  LOST:        [],
};

// ── New enquiry slide-over ───────────────────────────────────

interface NewEnquiryFormProps {
  onClose: () => void;
  onCreated: () => void;
}

function NewEnquiryForm({ onClose, onCreated }: NewEnquiryFormProps) {
  const customers = useStore(s => s.customers);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [source, setSource] = useState<EnquirySource>('DIRECT');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [pax, setPax] = useState(1);
  const [requirements, setRequirements] = useState('');
  const [budget, setBudget] = useState('');
  const [saving, setSaving] = useState(false);

  const matchingCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .slice(0, 8);
  }, [customers, customerSearch]);

  const selectedCustomer = customers.find(c => c.id === customerId);

  async function handleSubmit() {
    if (!customerId)    { toast.error('Select a customer'); return; }
    if (!destination.trim()) { toast.error('Destination is required'); return; }

    setSaving(true);
    try {
      await apiClient.post('/enquiries', {
        customerId,
        source,
        destination: destination.trim(),
        departureDate: departureDate || null,
        returnDate: returnDate || null,
        pax,
        requirements: requirements.trim() || null,
        budget: budget ? Number(budget) : null,
      });
      toast.success('Enquiry created');
      onCreated();
      onClose();
    } catch {
      toast.error('Failed to create enquiry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">New Enquiry</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Customer */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Customer *</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-gray-800">{selectedCustomer.name}</div>
                  <div className="text-xs text-gray-400">{selectedCustomer.phone}</div>
                </div>
                <button className="text-xs text-indigo-600 font-medium" onClick={() => setCustomerId('')}>Change</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-2">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search customer by name or phone…"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="bg-transparent text-xs text-gray-700 outline-none w-full placeholder:text-gray-400"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {matchingCustomers.length === 0 ? (
                    <div className="p-3 text-xs text-gray-400">No customers found</div>
                  ) : matchingCustomers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCustomerId(c.id)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium text-gray-800">{c.name}</div>
                      <div className="text-xs text-gray-400">{c.phone}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Source */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Source</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value as EnquirySource)}
              className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
            >
              {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </select>
          </div>

          {/* Destination */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Destination *</label>
            <input
              type="text"
              value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="e.g. Goa, Bali, Dubai"
              className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Departure</label>
              <input type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)}
                className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Return</label>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
            </div>
          </div>

          {/* Pax + Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Pax</label>
              <input type="number" min={1} value={pax} onChange={e => setPax(Math.max(1, Number(e.target.value)))}
                className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Budget (₹)</label>
              <input type="number" min={0} value={budget} onChange={e => setBudget(e.target.value)}
                placeholder="Optional"
                className="w-full h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30" />
            </div>
          </div>

          {/* Requirements */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Requirements</label>
            <textarea
              value={requirements}
              onChange={e => setRequirements(e.target.value)}
              rows={3}
              placeholder="Any specific requirements…"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none"
            />
          </div>
        </div>

        <div className="border-t border-gray-100 p-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSubmit}>Create Enquiry</Button>
        </div>
      </div>
    </div>
  );
}

// ── Lost reason modal ────────────────────────────────────────

interface LostReasonModalProps {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function LostReasonModal({ onConfirm, onCancel }: LostReasonModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Mark as Lost</h3>
        <p className="text-xs text-gray-500 mb-3">Please provide a reason — this will be saved to the enquiry's notes.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="e.g. Went with a competitor, budget mismatch…"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 resize-none mb-3"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" size="sm" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>Mark Lost</Button>
        </div>
      </div>
    </div>
  );
}

// ── Enquiry card ──────────────────────────────────────────────

interface EnquiryCardProps {
  enquiry: Enquiry;
  onChangeStatus: (enquiry: Enquiry, status: EnquiryStatus) => void;
  onNewQuote: (enquiry: Enquiry) => void;
}

function EnquiryCard({ enquiry, onChangeStatus, onNewQuote }: EnquiryCardProps) {
  const next = NEXT_STATUS[enquiry.status];
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{enquiry.customerName}</div>
          <div className="text-xs text-gray-400 truncate">{enquiry.customerPhone}</div>
        </div>
        <Badge variant="secondary">{SOURCE_LABELS[enquiry.source]}</Badge>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <span className="truncate">{enquiry.destination}</span>
      </div>

      {(enquiry.departureDate || enquiry.returnDate) && (
        <div className="text-xs text-gray-500">
          {enquiry.departureDate ? new Date(enquiry.departureDate).toLocaleDateString('en-IN') : 'TBD'}
          {enquiry.returnDate ? ` → ${new Date(enquiry.returnDate).toLocaleDateString('en-IN')}` : ''}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1"><Users className="w-3 h-3" /> {enquiry.pax} pax</div>
        {enquiry.budget !== null && (
          <div className="flex items-center gap-1"><IndianRupee className="w-3 h-3" /> {formatCurrency(enquiry.budget)}</div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>{formatDistanceToNow(new Date(enquiry.createdAt), { addSuffix: true })}</span>
        {enquiry.quotationCount > 0 && (
          <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {enquiry.quotationCount} quote{enquiry.quotationCount > 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {enquiry.status !== 'WON' && enquiry.status !== 'LOST' && (
          <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => onNewQuote(enquiry)}>
            <FileText className="w-3 h-3" /> New Quote
          </Button>
        )}
        {next.map(s => (
          <button
            key={s}
            onClick={() => onChangeStatus(enquiry, s)}
            className="h-7 px-2 text-[11px] rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
          >
            → {COLUMNS.find(c => c.status === s)?.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function EnquiryPipeline() {
  const navigate = useNavigate();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<EnquirySource | 'all'>('all');
  const [showNewForm, setShowNewForm] = useState(false);
  const [lostTarget, setLostTarget] = useState<Enquiry | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get<Enquiry[]>('/enquiries');
      setEnquiries(res.data);
    } catch {
      toast.error('Failed to load enquiries');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    let list = enquiries;
    if (sourceFilter !== 'all') list = list.filter(e => e.source === sourceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.customerName.toLowerCase().includes(q) ||
        e.destination.toLowerCase().includes(q) ||
        e.customerPhone.includes(q),
      );
    }
    return list;
  }, [enquiries, search, sourceFilter]);

  async function changeStatus(enquiry: Enquiry, status: EnquiryStatus, notes?: string) {
    try {
      const body: Record<string, unknown> = { status };
      if (notes) body.notes = notes;
      await apiClient.put(`/enquiries/${enquiry.id}`, body);
      toast.success('Status updated');
      void load();
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? 'Failed to update status');
    }
  }

  function handleChangeStatus(enquiry: Enquiry, status: EnquiryStatus) {
    if (status === 'LOST') {
      setLostTarget(enquiry);
      return;
    }
    void changeStatus(enquiry, status);
  }

  function handleNewQuote(enquiry: Enquiry) {
    navigate(`/sales-quotes/new?enquiryId=${enquiry.id}`);
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Enquiries</h2>
          <Badge variant="secondary">{enquiries.length} total</Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowNewForm(true)}>
          <Plus className="w-3.5 h-3.5" /> New Enquiry
        </Button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer, destination, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-xs text-gray-700 outline-none w-56 placeholder:text-gray-400"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value as EnquirySource | 'all')}
          className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
        >
          <option value="all">All sources</option>
          {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
        </select>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {COLUMNS.map(c => <div key={c.status} className="h-64 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : enquiries.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No enquiries yet"
          description="Create your first enquiry to start the sales pipeline"
          action={{ label: '+ New Enquiry', onClick: () => setShowNewForm(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-start">
          {COLUMNS.map(col => {
            const items = filtered.filter(e => e.status === col.status);
            return (
              <div key={col.status} className="bg-gray-50/60 rounded-2xl p-2 space-y-2 min-h-[10rem]">
                <div className={cn('flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-bold', col.header)}>
                  <span className="flex items-center gap-1.5"><span className={cn('w-1.5 h-1.5 rounded-full', col.dot)} />{col.label}</span>
                  <span>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map(e => (
                    <EnquiryCard key={e.id} enquiry={e} onChangeStatus={handleChangeStatus} onNewQuote={handleNewQuote} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewForm && (
        <NewEnquiryForm onClose={() => setShowNewForm(false)} onCreated={() => void load()} />
      )}

      {lostTarget && (
        <LostReasonModal
          onCancel={() => setLostTarget(null)}
          onConfirm={(reason) => {
            void changeStatus(lostTarget, 'LOST', reason);
            setLostTarget(null);
          }}
        />
      )}
    </div>
  );
}
