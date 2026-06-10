import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Map, FileText, CheckCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { ItineraryStatus, ItineraryTemplate } from '@/shared/types';
import { fmtDate } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { RecordNumberBadge } from '@/shared/components/RecordNumberBadge';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/EmptyState';

// ─── Template metadata ────────────────────────────────────────

export const TEMPLATES: { value: ItineraryTemplate; label: string; emoji: string; desc: string; days: number }[] = [
  { value: 'domestic',      label: 'Domestic',      emoji: '🇮🇳', desc: 'India destinations',       days: 4 },
  { value: 'international', label: 'International',  emoji: '✈️', desc: 'International packages',    days: 6 },
  { value: 'luxury',        label: 'Luxury',         emoji: '👑', desc: 'Premium experiences',       days: 5 },
  { value: 'honeymoon',     label: 'Honeymoon',      emoji: '🥂', desc: 'Romantic couple packages',  days: 6 },
  { value: 'family',        label: 'Family',         emoji: '👨‍👩‍👧', desc: 'Family-friendly plans',   days: 7 },
];

const STATUS_TABS: { value: ItineraryStatus | 'all'; label: string }[] = [
  { value: 'all',       label: 'All'       },
  { value: 'draft',     label: 'Draft'     },
  { value: 'finalized', label: 'Finalized' },
];

export default function Itineraries() {
  const navigate     = useNavigate();
  const itineraries  = useStore(s => s.itineraries);
  const trips        = useStore(s => s.trips);
  const quotations   = useStore(s => s.quotations);

  const [search,    setSearch]    = useState('');
  const [statusTab, setStatusTab] = useState<ItineraryStatus | 'all'>('all');

  const kpis = useMemo(() => ({
    total:     itineraries.length,
    active:    itineraries.filter(i => i.status === 'draft').length,
    finalized: itineraries.filter(i => i.status === 'finalized').length,
  }), [itineraries]);

  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUS_TABS) {
      counts[s.value] = s.value === 'all'
        ? itineraries.length
        : itineraries.filter(i => i.status === s.value).length;
    }
    return counts;
  }, [itineraries]);

  const filtered = useMemo(() => {
    let list = itineraries;
    if (statusTab !== 'all') list = list.filter(i => i.status === statusTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.customerName.toLowerCase().includes(q) ||
        i.destination.toLowerCase().includes(q)  ||
        i.title.toLowerCase().includes(q)        ||
        i.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [itineraries, statusTab, search]);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Itineraries</h2>
          <Badge variant="secondary">{itineraries.length} total</Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => navigate('/itineraries/new')}>
          <Plus className="w-3.5 h-3.5" /> New Itinerary
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',     value: kpis.total,     icon: Map,         color: 'text-gray-900' },
          { label: 'Active',    value: kpis.active,    icon: Clock,       color: 'text-amber-600' },
          { label: 'Finalized', value: kpis.finalized, icon: CheckCircle, color: 'text-emerald-600' },
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

      {/* Templates — quick create */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Create from Template</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map(t => (
            <button
              key={t.value}
              onClick={() => navigate(`/itineraries/new?template=${t.value}`)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-sm font-medium text-gray-700 hover:text-indigo-700"
            >
              <span className="text-base">{t.emoji}</span>
              <div className="text-left">
                <div className="text-xs font-semibold">{t.label}</div>
                <div className="text-[10px] text-gray-400">{t.desc} · {t.days}d</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STATUS_TABS.map(s => (
          <button
            key={s.value}
            onClick={() => setStatusTab(s.value as ItineraryStatus | 'all')}
            className={cn(
              'flex-shrink-0 text-xs px-3.5 py-1.5 rounded-full font-medium transition-all',
              statusTab === s.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {s.label} <span className="ml-1.5 opacity-70">{pipeline[s.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2 w-80">
        <Search className="w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Search itineraries, customers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-transparent text-xs text-gray-700 outline-none flex-1 placeholder:text-gray-400"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        itineraries.length === 0 ? (
          <EmptyState
            icon={Map}
            title="No itineraries yet"
            description="Create your first day-wise travel itinerary"
            action={{ label: '+ New Itinerary', onClick: () => navigate('/itineraries/new') }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No itineraries match your filters"
            action={{ label: 'Clear', onClick: () => { setSearch(''); setStatusTab('all'); } }}
          />
        )
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
          initial="hidden" animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
        >
          {filtered.map(it => {
            const tmpl       = TEMPLATES.find(t => t.value === it.template);
            const linkedTrip = it.tripId      ? trips.find(t => t.id === it.tripId)              : undefined;
            const linkedQuot = it.quotationId ? quotations.find(q => q.id === it.quotationId)    : undefined;
            return (
              <motion.div key={it.id} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <div
                  onClick={() => navigate(`/itineraries/${it.id}`)}
                  className={cn(
                    'bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden',
                    it.status === 'finalized' ? 'border-emerald-200' : 'border-gray-200'
                  )}
                >
                  {/* Card gradient header */}
                  <div className={cn(
                    'px-5 pt-5 pb-4',
                    it.status === 'finalized'
                      ? 'bg-gradient-to-br from-emerald-50 to-teal-50'
                      : 'bg-gradient-to-br from-slate-50 to-gray-50'
                  )}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-mono text-[10px] text-gray-400">{it.id}</p>
                        <h3 className="font-bold text-gray-900 text-sm mt-0.5 leading-tight">{it.title}</h3>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {tmpl && <span className="text-xl" title={tmpl.label}>{tmpl.emoji}</span>}
                        <Badge variant={it.status === 'finalized' ? 'success' : 'secondary'}>
                          {it.status}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 font-medium">{it.customerName}</p>
                    <p className="text-xs text-indigo-600">{it.destination}</p>
                  </div>

                  {/* Card body */}
                  <div className="px-5 py-3 space-y-1.5 border-t border-gray-100">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{it.days.length} day{it.days.length !== 1 ? 's' : ''}</span>
                      {(it.startDate || it.endDate) && (
                        <span>{it.startDate ? fmtDate(it.startDate) : ''}{it.endDate ? ` → ${fmtDate(it.endDate)}` : ''}</span>
                      )}
                    </div>
                    {(linkedTrip || linkedQuot) && (
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                        {linkedTrip && (
                          <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-mono">
                            <FileText className="w-2.5 h-2.5" />{linkedTrip.id}
                            <RecordNumberBadge label="Trip" n={linkedTrip.tripNumber} className="text-blue-400" />
                          </span>
                        )}
                        {linkedQuot && (
                          <span className="inline-flex items-center gap-0.5 bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded-full font-mono">
                            <FileText className="w-2.5 h-2.5" />{linkedQuot.quotationNumber}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
