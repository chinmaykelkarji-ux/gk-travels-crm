import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { EmptyState, PageHeader, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { api, type ApiError } from '@/lib/api';

interface KeyView { id: string; name: string; prefix: string; permissions: string[]; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; expiresAt: string | null; lastUsedAt: string | null; useCount: number; createdAt: string }
const KEY = ['api-keys'] as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');

/** Keys another system uses to read TravelOS — read-only, shown once, revocable. */
export default function ApiKeysPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<{ items: KeyView[]; catalogue: { key: string; label: string }[] }>('/v2/api-keys') });
  const [name, setName] = useState('');
  const [days, setDays] = useState(365);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [made, setMade] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<{ key: string }>('/v2/api-keys', { name, permissions: [...perms], days }),
    onSuccess: r => { setMade(r.key); setName(''); setPerms(new Set()); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: e => toast.error('No key made', (e as ApiError).message),
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.post(`/v2/api-keys/${id}/revoke`, {}), onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }) });

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="API keys" subtitle="For another system to read TravelOS. A key can only read, and only what you tick." />
      <div className="px-5 py-4 space-y-4 max-w-4xl">
        <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-xs text-slate-600">Name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Accounting export" className="mt-0.5 block w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
            <label className="text-xs text-slate-600">Valid for (days)<input type="number" min={1} max={730} value={days} onChange={e => setDays(Number(e.target.value))} className="mt-0.5 block w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {q.data?.catalogue.map(c => (
              <label key={c.key} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={perms.has(c.key)} onChange={() => setPerms(p => { const n = new Set(p); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />{c.label}
              </label>
            ))}
          </div>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || name.trim().length < 2 || perms.size === 0}>Make a key</Button>
          {made && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900">Copy it now — TravelOS keeps only a fingerprint and cannot show it again. Send it as <code>Authorization: Bearer …</code></p>
              <p className="text-sm font-mono break-all">{made}</p>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(made); toast.success('Copied', ''); }}><Copy className="w-4 h-4 mr-1" />Copy</Button>
            </div>
          )}
        </section>
        {q.isError && <EmptyState title="Could not load keys" description={(q.error as ApiError).message} />}
        <section className="bg-white border border-slate-200 rounded-md px-4 divide-y divide-slate-100">
          {q.data && q.data.items.length === 0 && <EmptyState compact title="No keys yet" />}
          {q.data?.items.map(k => (
            <div key={k.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><span className="font-medium">{k.name}</span><code className="text-xs text-slate-500">{k.prefix}</code><StatusPill tone={k.state === 'ACTIVE' ? 'success' : 'neutral'}>{k.state === 'ACTIVE' ? 'Active' : k.state === 'EXPIRED' ? 'Lapsed' : 'Revoked'}</StatusPill></p>
                <p className="text-xs text-slate-500 break-words">Reads {k.permissions.join(', ')} · made {when(k.createdAt)} · until {when(k.expiresAt)} · last used {when(k.lastUsedAt)}</p>
              </div>
              {k.state === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => revoke.mutate(k.id)}>Revoke</Button>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
