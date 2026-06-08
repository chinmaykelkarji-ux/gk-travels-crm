import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FolderOpen, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { TripFormSchema } from '@/shared/schemas/trip';
import type { TripStatus } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { getApiErrorMessage } from '@/shared/utils/error';
import { TripCard } from './TripCard';
import { TripForm } from './TripForm';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { Badge } from '@/shared/components/ui/badge';
import { EmptyState } from '@/shared/components/EmptyState';

const STATUS_FILTERS: { value: 'all' | TripStatus; label: string }[] = [
  { value: 'all',         label: 'All' },
  { value: 'draft',       label: 'Draft' },
  { value: 'quotation',   label: 'Quotation' },
  { value: 'confirmed',   label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
];

export default function Trips() {
  const navigate  = useNavigate();
  const trips     = useStore(s => s.trips);
  const createTrip = useStore(s => s.createTrip);

  const [formOpen, setFormOpen]  = useState(false);
  const [search, setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TripStatus>('all');
  const [creating, setCreating]  = useState(false);

  const filtered = useMemo(() => {
    let list = trips;
    if (statusFilter !== 'all') {
      list = list.filter(t => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.customer.toLowerCase().includes(q)    ||
        t.destination.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)          ||
        (t.phone || '').includes(q)             ||
        (t.flightPNR || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [trips, search, statusFilter]);

  async function handleCreate(data: TripFormSchema) {
    setCreating(true);
    try {
      const trip = createTrip({
        customer:    data.customer,
        phone:       data.phone,
        destination: data.destination,
        pax:         data.pax,
        departure:   data.departure || null,
        returnDate:  data.returnDate || null,
        type:        data.type,
        totalAmount: data.totalAmount ?? null,
        gstRate:     data.gstRate ?? 5,
        notes:       data.notes ?? '',
        status:      'draft',
      });
      toast.success('Trip created', `${trip.id} — ${data.destination}`);
      setFormOpen(false);
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      toast.error('Failed to create trip', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      setCreating(false);
    }
  }

  const counts = useMemo(() => ({
    all:         trips.length,
    confirmed:   trips.filter(t => t.status === 'confirmed').length,
    in_progress: trips.filter(t => t.status === 'in_progress').length,
    draft:       trips.filter(t => t.status === 'draft').length,
  }), [trips]);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Trip Files</h2>
          <Badge variant="secondary">{trips.length} total</Badge>
          {counts.confirmed > 0 && (
            <Badge variant="success">{counts.confirmed} confirmed</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search trips, customers, PNR…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-xs text-gray-700 outline-none w-36 placeholder:text-gray-400"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-36 h-9">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(f => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Trip
          </Button>
        </div>
      </div>

      {/* Status tabs strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(f => {
          const cnt = f.value === 'all' ? trips.length : trips.filter(t => t.status === f.value).length;
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                statusFilter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label} <span className="ml-1 opacity-70">{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        trips.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No trip files yet"
            description="Create your first trip file to get started"
            action={{ label: '+ New Trip', onClick: () => setFormOpen(true) }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No trips match your filters"
            description="Try changing the search query or status filter"
            action={{ label: 'Clear filters', onClick: () => { setSearch(''); setStatusFilter('all'); } }}
          />
        )
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          initial="hidden"
          animate="visible"
          variants={{
            hidden:  {},
            visible: { transition: { staggerChildren: 0.03 } },
          }}
        >
          {filtered.map(trip => (
            <motion.div
              key={trip.id}
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            >
              <TripCard trip={trip} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* New Trip Form */}
      <TripForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
        loading={creating}
      />
    </div>
  );
}
