import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Users, ArrowRight, Phone,
  MapPin, RefreshCw, Edit2, Trash2,
} from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import type { LeadFormSchema } from '@/shared/schemas/lead';
import type { Lead, LeadStatus } from '@/shared/types';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { fmtDate } from '@/shared/utils/date';
import { formatCurrency } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { LeadForm } from './LeadForm';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { EmptyState } from '@/shared/components/EmptyState';
import { GmailIcon } from '@/shared/components/GmailButton';
import { gmail } from '@/shared/utils/email';

const STATUSES: { value: LeadStatus | 'all'; label: string; color: string }[] = [
  { value: 'all',            label: 'All',          color: 'bg-gray-400'    },
  { value: 'new',            label: 'New',          color: 'bg-gray-400'    },
  { value: 'contacted',      label: 'Contacted',    color: 'bg-blue-400'    },
  { value: 'follow_up',      label: 'Follow-up',    color: 'bg-yellow-400'  },
  { value: 'quotation_sent', label: 'Quotation',    color: 'bg-orange-400'  },
  { value: 'confirmed',      label: 'Confirmed',    color: 'bg-emerald-400' },
  { value: 'converted',      label: 'Converted',    color: 'bg-blue-600'    },
  { value: 'cancelled',      label: 'Cancelled',    color: 'bg-red-400'     },
];

const STATUS_BADGE_VARIANT: Record<LeadStatus, 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'orange'> = {
  new:            'secondary',
  contacted:      'default',
  follow_up:      'warning',
  quotation_sent: 'orange',
  confirmed:      'success',
  converted:      'default',
  cancelled:      'destructive',
};

const PRIORITY_COLOR: Record<string, string> = {
  high:   'text-red-600',
  medium: 'text-yellow-600',
  low:    'text-gray-400',
};

export default function Leads() {
  const navigate   = useNavigate();
  const leads      = useStore(s => s.leads);
  const createLead = useStore(s => s.createLead);
  const updateLead = useStore(s => s.updateLead);
  const deleteLead = useStore(s => s.deleteLead);
  const convertLead = useStore(s => s.convertLead);
  const setLeadStatus = useStore(s => s.setLeadStatus);

  const logActivity = useStore(s => s.logActivity);

  const [formOpen, setFormOpen]       = useState(false);
  const [editLead, setEditLead]       = useState<Lead | null>(null);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [creating, setCreating]       = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUSES) {
      counts[s.value] = s.value === 'all'
        ? leads.length
        : leads.filter(l => l.status === s.value).length;
    }
    return counts;
  }, [leads]);

  const filtered = useMemo(() => {
    let list = leads;
    if (statusFilter !== 'all') {
      list = list.filter(l => l.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(q)          ||
        (l.phone || '').includes(q)               ||
        (l.destination || '').toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [leads, search, statusFilter]);

  async function handleCreate(data: LeadFormSchema) {
    setCreating(true);
    try {
      createLead({
        name:         data.name,
        phone:        data.phone,
        email:        data.email || '',
        source:       data.source,
        destination:  data.destination || '',
        travelDate:   data.travelDate,
        pax:          data.pax ?? 1,
        budget:       data.budget ?? null,
        tripType:     data.tripType || '',
        priority:     data.priority ?? 'medium',
        notes:        data.notes ?? '',
        assignedTo:   data.assignedTo,
        followUpDate: data.followUpDate,
        status:       'new',
      });
      toast.success('Lead added', `${data.name} — ${data.source}`);
      setFormOpen(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleEdit(data: LeadFormSchema) {
    if (!editLead) return;
    updateLead(editLead.id, {
      name:         data.name,
      phone:        data.phone,
      email:        data.email,
      source:       data.source,
      destination:  data.destination,
      travelDate:   data.travelDate,
      pax:          data.pax,
      budget:       data.budget,
      tripType:     data.tripType,
      priority:     data.priority,
      notes:        data.notes,
      assignedTo:   data.assignedTo,
      followUpDate: data.followUpDate,
    });
    toast.success('Lead updated');
    setEditLead(null);
  }

  async function handleConvert(leadId: string, customerName: string) {
    const ok = await confirm({
      title:        `Convert "${customerName}" to trip?`,
      description:  'This will create a new trip file linked to this lead. The lead status will change to Converted.',
      confirmLabel: 'Convert to Trip',
    });
    if (!ok) return;

    const result = convertLead(leadId);
    if (result.ok && result.trip) {
      toast.success('Lead converted!', `Trip ${result.trip.id} created`);
      navigate(`/trips/${result.trip.id}`);
    } else {
      toast.error('Conversion failed', result.reason);
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title:        `Delete "${name}"?`,
      description:  'This will permanently remove this lead from the database. This cannot be undone.',
      confirmLabel: 'Delete Lead',
      variant:      'destructive',
    });
    if (!ok) return;

    setDeletingId(id);
    try {
      await apiClient.delete(`/leads/${id}`);
      // State update only after DB confirms the delete
      deleteLead(id);
      logActivity('lead_deleted', `Lead deleted: ${name}`, 'lead', id);
      toast.success('Lead deleted', `"${name}" has been removed.`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error ?? 'Failed to delete lead. Please try again.';
      toast.error('Delete failed', message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Lead Pipeline</h2>
          <Badge variant="secondary">{leads.length} total</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search leads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-xs text-gray-700 outline-none w-32 placeholder:text-gray-400"
            />
          </div>
          <Button size="sm" onClick={() => setFormOpen(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Lead
          </Button>
        </div>
      </div>

      {/* Pipeline summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        {STATUSES.filter(s => s.value !== 'all').map(s => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(statusFilter === s.value ? 'all' : s.value as LeadStatus)}
            className={cn(
              'rounded-xl border p-3 text-center transition-all text-left',
              statusFilter === s.value
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            )}
          >
            <div className="text-lg font-bold text-gray-900 font-display">{pipeline[s.value]}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={cn('w-1.5 h-1.5 rounded-full', s.color)} />
              <span className="text-[11px] text-gray-500">{s.label}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value as typeof statusFilter)}
            className={cn(
              'flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-all',
              statusFilter === s.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {s.label} <span className="ml-1 opacity-70">{pipeline[s.value]}</span>
          </button>
        ))}
      </div>

      {/* Leads table */}
      {filtered.length === 0 ? (
        leads.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads yet"
            description="Add your first lead to start building your pipeline"
            action={{ label: '+ Add Lead', onClick: () => setFormOpen(true) }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No leads match your filters"
            action={{ label: 'Clear filters', onClick: () => { setSearch(''); setStatusFilter('all'); } }}
          />
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Lead ID', 'Name', 'Email', 'Destination', 'Travel Date', 'Pax', 'Budget', 'Source', 'Priority', 'Follow-up', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((lead, i) => (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setEditLead(lead)}
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-400 whitespace-nowrap">{lead.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-gray-900">{lead.name}</div>
                      {lead.phone && (
                        <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />{lead.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {lead.email ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-gray-500 max-w-[120px] truncate">{lead.email}</span>
                          <GmailIcon
                            email={lead.email}
                            onClick={() => gmail.toLead(lead.email!, lead.name, lead.destination)}
                          />
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {lead.destination ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-400" />{lead.destination}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {lead.travelDate ? fmtDate(lead.travelDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-center">{lead.pax}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">
                      {lead.budget ? formatCurrency(lead.budget) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{lead.source}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn('text-xs font-semibold capitalize', PRIORITY_COLOR[lead.priority ?? 'medium'])}>
                        {lead.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                      {lead.followUpDate ? fmtDate(lead.followUpDate) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={STATUS_BADGE_VARIANT[lead.status]}>
                        {lead.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {/* Gmail */}
                        {lead.email && (
                          <GmailIcon
                            email={lead.email}
                            onClick={() => gmail.toLead(lead.email!, lead.name, lead.destination)}
                          />
                        )}
                        {/* Status quick-change */}
                        {!['converted', 'cancelled'].includes(lead.status) && (
                          <Select
                            value={lead.status}
                            onValueChange={v => setLeadStatus(lead.id, v as LeadStatus)}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.filter(s => s.value !== 'all').map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {/* Convert button */}
                        {!['converted', 'cancelled'].includes(lead.status) && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title="Convert to Trip"
                            onClick={() => handleConvert(lead.id, lead.name)}
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                          </Button>
                        )}
                        {lead.convertedTripId && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            title="Open linked trip"
                            onClick={() => navigate(`/trips/${lead.convertedTripId}`)}
                          >
                            <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                          </Button>
                        )}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setEditLead(lead)}
                          title="Edit lead"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Delete lead"
                          disabled={deletingId === lead.id}
                          onClick={() => handleDelete(lead.id, lead.name)}
                          className="hover:bg-red-50 hover:text-red-600"
                        >
                          {deletingId === lead.id
                            ? <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin block" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Lead Form */}
      <LeadForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
        loading={creating}
      />

      {/* Edit Lead Form */}
      <LeadForm
        open={!!editLead}
        onClose={() => setEditLead(null)}
        onSubmit={handleEdit}
        defaultValues={editLead ?? undefined}
        title="Edit Lead"
      />
    </div>
  );
}
