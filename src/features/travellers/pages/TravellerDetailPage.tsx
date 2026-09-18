import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { PageHeader, KeyValue, StatusPill, Drawer, DataTable, EmptyState, type Column } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { confirm } from '@/shared/hooks/useConfirm';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { fmtDate } from '@/shared/utils/date';
import { ageOn } from '@/shared/calc/travellers';
import { formatPhone } from '@/shared/calc/phone';
import { ApiError } from '@/lib/api';
import { useTraveller, useUpdateTraveller, useDeleteTraveller } from '../hooks';
import { TravellerForm } from '../components/TravellerForm';
import { PassportPill } from '../components/PassportPill';
import type { TravellerDetail } from '../api';

export default function TravellerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useTraveller(id);
  const update = useUpdateTraveller(id);
  const remove = useDeleteTraveller();
  const [editOpen, setEditOpen] = useState(false);

  if (q.isPending) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (q.isError) { const e = q.error as ApiError; return <div className="p-6"><EmptyState title={e.status === 404 ? 'Traveller not found' : 'Could not load traveller'} description={e.message} action={<Button variant="outline" size="sm" onClick={() => navigate('/travellers')}>Back</Button>} /></div>; }
  const t = q.data;
  const canWrite = can('customers:write') && !t.deletedAt;

  async function onDelete() {
    const ok = await confirm({ title: `Remove ${t.displayName}?`, description: 'The traveller is archived. They must not be on any active trip.', confirmLabel: 'Remove', variant: 'destructive' });
    if (!ok) return;
    remove.mutate(id, { onSuccess: () => { toast.success('Traveller removed'); navigate('/travellers'); }, onError: e => toast.error('Could not remove', (e as Error).message) });
  }

  const tripCols: Column<TravellerDetail['trips'][number]>[] = [
    { key: 'id', header: 'Trip', render: r => <span className="font-medium">{r.id}</span> },
    { key: 'destination', header: 'Destination' },
    { key: 'departure', header: 'Dates', render: r => `${fmtDate(r.departure)}${r.returnDate ? ` → ${fmtDate(r.returnDate)}` : ''}` },
    { key: 'role', header: 'Role', render: r => <StatusPill tone={r.role === 'LEAD' ? 'accent' : 'neutral'}>{r.role.toLowerCase()}</StatusPill> },
    { key: 'status', header: 'Trip status', render: r => r.status.replace('_', ' ') },
    { key: 'passport', header: 'Passport at travel', render: r => <PassportPill expiry={t.passportExpiry} status={r.passportStatus} showDate={false} /> },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader crumbs={[{ label: 'Travellers', to: '/travellers' }, { label: t.id }]} title={t.displayName}
        badge={<>{t.deletedAt && <StatusPill tone="danger">removed</StatusPill>}<PassportPill expiry={t.passportExpiry} status={t.passportStatus} showDate={false} /></>}
        subtitle={<span className="flex flex-wrap gap-x-4">
          {t.customer && <span>Customer: <Link className="hover:underline text-slate-800" to={`/customers/${t.customer.id}`}>{t.customer.name}</Link>{t.relationToCustomer ? ` (${t.relationToCustomer})` : ''}</span>}
          {t.dateOfBirth && <span>{ageOn(t.dateOfBirth)} yrs · born {fmtDate(t.dateOfBirth)}</span>}
          {t.phone && <span>{formatPhone(t.phone)}</span>}
        </span>}
        actions={<>
          {canWrite && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4 mr-1.5" />Edit</Button>}
          {canWrite && <Button size="sm" variant="outline" className="text-red-600" onClick={onDelete} loading={remove.isPending}><Trash2 className="w-4 h-4 mr-1.5" />Remove</Button>}
        </>} />
      <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-md p-4">
          <h2 className="text-sm font-medium text-slate-800 mb-3">Passport &amp; identity</h2>
          <KeyValue items={[
            { label: 'Passport number', value: t.passportNumber }, { label: 'Expiry', value: t.passportExpiry ? <PassportPill expiry={t.passportExpiry} status={t.passportStatus} /> : null },
            { label: 'Issued', value: fmtDate(t.passportIssueDate) || null }, { label: 'Place of issue', value: t.placeOfIssue },
            { label: 'Nationality', value: t.nationality }, { label: 'Gender', value: t.gender },
            { label: 'Domestic ID', value: t.govtIdType ? `${t.govtIdType.replace('_', ' ')} · ${t.govtIdNumber}` : null },
            { label: 'Visa', value: t.visaStatus ? `${t.visaStatus.replace('_', ' ')}${t.visaCountry ? ` · ${t.visaCountry}` : ''}${t.visaType ? ` · ${t.visaType}` : ''}${t.visaExpiry ? ` · expires ${fmtDate(t.visaExpiry)}` : ''}` : null, span: 2 },
          ]} />
        </section>
        <section className="bg-white border border-slate-200 rounded-md p-4">
          <h2 className="text-sm font-medium text-slate-800 mb-3">Preferences &amp; contacts</h2>
          <KeyValue items={[
            { label: 'Seat', value: t.seatPreference }, { label: 'Meal', value: t.mealPreference },
            { label: 'Frequent flyer', value: t.frequentFlyerNumber }, { label: 'Email', value: t.email },
            { label: 'Emergency contact', value: t.emergencyContactName ? `${t.emergencyContactName}${t.emergencyRelation ? ` (${t.emergencyRelation})` : ''}${t.emergencyContactPhone ? ` · ${formatPhone(t.emergencyContactPhone)}` : ''}` : null, span: 2 },
            { label: 'Notes', value: t.notes ? <span className="whitespace-pre-wrap">{t.notes}</span> : null, span: 2 },
          ]} />
        </section>
        <section className="lg:col-span-2">
          <h2 className="text-sm font-medium text-slate-800 mb-2">Trips</h2>
          <DataTable dense columns={tripCols} rows={t.trips} rowKey={r => r.id} onRowClick={r => navigate(`/trips/${r.id}`)} emptyTitle="Not on any trip yet" />
        </section>
      </div>

      <Drawer open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) update.reset(); }} title={`Edit ${t.displayName}`} width="xl">
        <TravellerForm initial={t} submitting={update.isPending} error={update.error as ApiError | null} onCancel={() => setEditOpen(false)}
          onSubmit={({ force: _f, ...values }) => update.mutate(values, { onSuccess: () => { toast.success('Traveller updated'); setEditOpen(false); }, onError: e => { if (!(e instanceof ApiError) || (!e.fields && e.code !== 'CONFLICT')) toast.error('Could not save', (e as Error).message); } })} />
      </Drawer>
    </div>
  );
}
