import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, EmptyState, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import { ApiError } from '@/lib/api';
import { useTripWorkspace } from '../hooks';
import { StagePill } from './TripsPage';
import { StageBar } from '../components/StageBar';
import { OverviewTab } from '../components/OverviewTab';
import { TravellersTab } from '../components/TravellersTab';
import { HotelsTab } from '../components/HotelsTab';
import { TransportTab } from '../components/TransportTab';
import { ActivitiesTab } from '../components/ActivitiesTab';
import { TicketsTab, DocumentsTab, TimelineTab } from '../components/MoreTabs';

const TABS = [
  { id: 'overview', label: 'Overview' }, { id: 'travellers', label: 'Travellers' }, { id: 'tickets', label: 'Tickets' }, { id: 'hotels', label: 'Hotels' },
  { id: 'transport', label: 'Transport' }, { id: 'activities', label: 'Activities' }, { id: 'documents', label: 'Documents' }, { id: 'timeline', label: 'Timeline' },
] as const;
type TabId = typeof TABS[number]['id'];

/** One workspace per trip: everything about the tour, and the stage it is in. */
export default function TripWorkspacePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'overview';
  const { can } = usePermissions();
  const q = useTripWorkspace(id);

  if (q.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (q.isError) { const e = q.error as ApiError; return <div className="p-6"><EmptyState title={e.status === 404 ? 'Trip not found' : 'Could not load trip'} description={e.message} action={<Button variant="outline" size="sm" onClick={() => navigate('/trips')}>Back</Button>} /></div>; }
  const ws = q.data;
  const t = ws.trip;
  const open = t.stage !== 'COMPLETED' && t.stage !== 'CANCELLED';
  const canWrite = can('operations:write') && open;
  const count = (id: TabId) => ({ travellers: ws.travellers.length, tickets: ws.tickets.length, hotels: ws.hotels.length, transport: ws.vehicles.length, activities: ws.activities.length, documents: ws.documents.length } as Partial<Record<TabId, number>>)[id];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title={t.tourName ?? t.destination} crumbs={[{ label: 'Trips', to: '/trips' }, { label: t.id }]}
        subtitle={<span>{t.id} · {t.destination} · {t.departure ? `${fmtDate(t.departure)}${t.returnDate ? ` → ${fmtDate(t.returnDate)}` : ''}` : 'dates not set'}{t.nights !== null ? ` · ${t.nights} nights` : ''} · {ws.travellers.length || t.pax} pax · {t.customerId ? <Link className="text-indigo-600 hover:underline" to={`/customers/${t.customerId}`}>{t.customer}</Link> : t.customer}</span>}
        badge={<><StagePill stage={t.stage} />{t.isInternational && <StatusPill tone="info">international</StatusPill>}</>}
        actions={<Link to={`/legacy/trips/${t.id}`} className="text-xs text-slate-500 hover:text-slate-800">Classic view</Link>} />
      <StageBar ws={ws} canWrite={can('operations:write')} />
      <nav className="px-5 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white" role="tablist">
        {TABS.map(x => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => { const n = new URLSearchParams(params); if (x.id === 'overview') n.delete('tab'); else n.set('tab', x.id); setParams(n, { replace: true }); }}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === x.id ? 'border-indigo-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {x.label}{count(x.id) ? <span className="ml-1 text-xs text-slate-400">{count(x.id)}</span> : null}
          </button>
        ))}
      </nav>
      <div className="px-5 py-4">
        {tab === 'overview' && <OverviewTab ws={ws} />}
        {tab === 'travellers' && <TravellersTab ws={ws} canWrite={canWrite} />}
        {tab === 'tickets' && <TicketsTab ws={ws} canWrite={canWrite} />}
        {tab === 'hotels' && <HotelsTab ws={ws} canWrite={canWrite} />}
        {tab === 'transport' && <TransportTab ws={ws} canWrite={canWrite} />}
        {tab === 'activities' && <ActivitiesTab ws={ws} canWrite={canWrite} />}
        {tab === 'documents' && <DocumentsTab ws={ws} canWrite={can('documents:write')} />}
        {tab === 'timeline' && <TimelineTab ws={ws} />}
      </div>
    </div>
  );
}
