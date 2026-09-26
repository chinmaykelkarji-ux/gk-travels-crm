import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import { EmptyState, PageHeader } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { api, type ApiError } from '@/lib/api';
import type { OrgSettings, OrgSettingsPatch } from '@/shared/contracts/organization';

interface Org { id: string; slug: string; name: string; legalName: string | null; settings: OrgSettings }
interface Setup { done: number; total: number; items: { key: string; title: string; done: boolean; detail: string; link: string | null }[] }

const FIELDS: { section: 'insights' | 'portal'; key: string; label: string; unit: string }[] = [
  { section: 'insights', key: 'departingWithinDays', label: 'Trips leaving soon: look ahead', unit: 'days' },
  { section: 'insights', key: 'overdueDays', label: 'Money counts as overdue after', unit: 'days' },
  { section: 'insights', key: 'thinMarginPct', label: 'A margin is thin below', unit: '%' },
  { section: 'insights', key: 'passportWithinDays', label: 'Check passports for trips within', unit: 'days' },
  { section: 'portal', key: 'defaultLinkDays', label: 'Customer page links last', unit: 'days' },
];

/** The organisation: what is set up yet, its name, and the numbers TravelOS works with. */
export default function OrganizationPage() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ['organization'], queryFn: () => api.get<Org>('/v2/organization') });
  const setup = useQuery({ queryKey: ['organization', 'setup'], queryFn: () => api.get<Setup>('/v2/organization/setup'), enabled: can('settings:write') });
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!org.data) return;
    setName(org.data.name); setLegalName(org.data.legalName ?? '');
    setValues(Object.fromEntries(FIELDS.map(f => [f.key, String((org.data!.settings[f.section] as Record<string, number>)[f.key])])));
  }, [org.data]);
  const save = useMutation({
    mutationFn: () => {
      const body: OrgSettingsPatch = { name, legalName: legalName || null, insights: {}, portal: {} };
      for (const f of FIELDS) (body[f.section] as Record<string, number>)[f.key] = Number(values[f.key]);
      return api.patch<Org>('/v2/organization', body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['organization'] }); void qc.invalidateQueries({ queryKey: ['insights'] }); toast.success('Saved', 'Organisation settings'); },
    onError: e => toast.error('Not saved', (e as ApiError).summary),
  });

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Organisation" subtitle="What is set up, and the numbers TravelOS works with" />
      <div className="px-5 py-4 space-y-4 max-w-4xl">
        {setup.data && (
          <section className="bg-white border border-slate-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-slate-900">Setup — {setup.data.done} of {setup.data.total} done</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {setup.data.items.map(i => (
                <li key={i.key} className="py-2 flex items-start gap-2 text-sm">
                  {i.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <Circle className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className={i.done ? 'text-slate-700' : 'text-slate-900 font-medium'}>{i.link ? <Link to={i.link} className="hover:underline">{i.title}</Link> : i.title}</p>
                    <p className="text-xs text-slate-500 break-words">{i.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {org.isError && <EmptyState title="Could not load the organisation" description={(org.error as ApiError).message} />}
        {org.data && (
          <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-slate-600">Name<input disabled={!can('settings:write')} value={name} onChange={e => setName(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-slate-600">Legal name<input disabled={!can('settings:write')} value={legalName} onChange={e => setLegalName(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <label key={f.key} className="text-xs text-slate-600">{f.label} ({f.unit})
                  <input type="number" disabled={!can('settings:write')} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} className="mt-0.5 block w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
              ))}
            </div>
            {can('settings:write') && <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>}
          </section>
        )}
      </div>
    </div>
  );
}
