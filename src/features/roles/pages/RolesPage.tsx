import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, PageHeader, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { api, type ApiError } from '@/lib/api';
import { permissionLabel, type RoleInput } from '@/shared/contracts/roles';

interface CustomRole { id: string; name: string; description: string | null; baseRole: 'BOOKING' | 'ACCOUNTS' | 'OPERATIONS'; permissions: string[]; people: number }
interface RolesView {
  system: { key: string; permissions: string[] }[];
  custom: CustomRole[];
  catalogue: { key: string; label: string }[];
  people: { id: string; name: string; email: string; role: string; customRoleId: string | null }[];
}
const KEY = ['roles'] as const;
const BASE_LABEL: Record<string, string> = { ADMIN: 'Owner (everything)', BOOKING: 'Sales', ACCOUNTS: 'Accounts', OPERATIONS: 'Operations', DRIVER: 'Driver' };

function Editor({ initial, catalogue, onDone }: { initial?: CustomRole; catalogue: RolesView['catalogue']; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [baseRole, setBaseRole] = useState<RoleInput['baseRole']>(initial?.baseRole ?? 'BOOKING');
  const [perms, setPerms] = useState<Set<string>>(new Set(initial?.permissions ?? []));
  const groups = useMemo(() => {
    const g = new Map<string, { key: string; label: string }[]>();
    for (const c of catalogue) { const k = c.label.split(':')[0]; g.set(k, [...(g.get(k) ?? []), c]); }
    return [...g.entries()];
  }, [catalogue]);
  const save = useMutation({
    mutationFn: () => {
      const body: RoleInput = { name, description: description || null, baseRole, permissions: [...perms] };
      return initial ? api.put(`/v2/roles/${initial.id}`, body) : api.post('/v2/roles', body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEY }); toast.success('Saved', name); onDone(); },
    onError: e => toast.error('Not saved', (e as ApiError).summary),
  });
  const toggle = (k: string) => setPerms(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs text-slate-600">Name<input value={name} onChange={e => setName(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-slate-600">Works like<select value={baseRole} onChange={e => setBaseRole(e.target.value as RoleInput['baseRole'])} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white">
          {(['BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const).map(r => <option key={r} value={r}>{BASE_LABEL[r]}</option>)}
        </select></label>
        <label className="text-xs text-slate-600">What it is for<input value={description} onChange={e => setDescription(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
      </div>
      <p className="text-xs text-slate-500">"Works like" decides which classic screens they see. What they may do everywhere else is exactly what is ticked below.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
        {groups.map(([group, items]) => (
          <fieldset key={group} className="text-sm">
            <legend className="text-xs font-medium text-slate-700">{group}</legend>
            {items.map(i => (
              <label key={i.key} className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={perms.has(i.key)} onChange={() => toggle(i.key)} />{i.label.split(': ')[1]}</label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2}>Save role</Button>
        <Button size="sm" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

/** Who may do what: the system roles, the ones you made, and who has which. */
export default function RolesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<RolesView>('/v2/roles') });
  const [editing, setEditing] = useState<CustomRole | 'new' | null>(null);
  const assign = useMutation({
    mutationFn: (b: { userId: string; roleId: string | null }) => api.post('/v2/roles/assign', b),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEY }); toast.success('Changed', 'They will be asked to sign in again'); },
    onError: e => toast.error('Not changed', (e as ApiError).message),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/v2/roles/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }) });

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Roles" subtitle="Who may see and do what. Changing someone's role signs them out so it takes effect at once."
        actions={<Button size="sm" onClick={() => setEditing('new')}>New role</Button>} />
      <div className="px-5 py-4 space-y-4 max-w-5xl">
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not load roles" description={(q.error as ApiError).message} />}
        {q.data && editing && <Editor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} catalogue={q.data.catalogue} onDone={() => setEditing(null)} />}
        {q.data && (
          <>
            <section className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
              {q.data.custom.length === 0 && <p className="p-4 text-sm text-slate-500">No roles of your own yet. The four system roles below are always there.</p>}
              {q.data.custom.map(r => (
                <div key={r.id} className="p-4 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{r.name} <StatusPill tone="info">works like {BASE_LABEL[r.baseRole]}</StatusPill></p>
                    {r.description && <p className="text-sm text-slate-600">{r.description}</p>}
                    <p className="text-xs text-slate-500 mt-0.5 break-words">{r.permissions.map(permissionLabel).join(' · ') || 'No permissions'} · {r.people} {r.people === 1 ? 'person' : 'people'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => { if (window.confirm(`Remove "${r.name}"? ${r.people} person(s) go back to ${BASE_LABEL[r.baseRole]}.`)) remove.mutate(r.id); }}>Remove</Button>
                  </div>
                </div>
              ))}
            </section>

            <section className="bg-white border border-slate-200 rounded-md p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">People</h3>
              <ul className="divide-y divide-slate-100">
                {q.data.people.map(p => (
                  <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0"><span className="font-medium text-slate-800">{p.name}</span> <span className="text-slate-500 break-all">{p.email}</span></span>
                    {p.role === 'ADMIN' || p.role === 'DRIVER'
                      ? <span className="text-xs text-slate-500">{BASE_LABEL[p.role]} — keeps this role</span>
                      : (
                        <select aria-label={`Role for ${p.name}`} value={p.customRoleId ?? ''} disabled={assign.isPending}
                          onChange={e => assign.mutate({ userId: p.id, roleId: e.target.value || null })} className="rounded-md border border-slate-300 px-2 py-1 text-sm bg-white">
                          <option value="">{BASE_LABEL[p.role]} (system)</option>
                          {q.data!.custom.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mt-2">To change someone's system role or add people, use <a href="/users" className="text-sky-700 hover:underline">User management</a>.</p>
            </section>

            <details className="bg-white border border-slate-200 rounded-md p-4 text-sm">
              <summary className="cursor-pointer font-medium text-slate-800">What the system roles may do</summary>
              {q.data.system.map(s => (
                <p key={s.key} className="mt-2"><span className="font-medium">{BASE_LABEL[s.key]}:</span> <span className="text-slate-600">{s.permissions.includes('*') ? 'everything' : s.permissions.map(permissionLabel).join(' · ')}</span></p>
              ))}
            </details>
          </>
        )}
      </div>
    </div>
  );
}
