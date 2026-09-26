import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink } from 'lucide-react';
import { EmptyState, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import { api, type ApiError } from '@/lib/api';
import { whatsappLink } from '@/shared/calc/messageLinks';
import { commsApi } from '@/features/comms/api';

interface LinkView { id: string; label: string | null; expiresAt: string; requireCode: boolean; codeChannel: string | null; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; lastUsedAt: string | null; useCount: number; createdAt: string }
interface FeedbackView { id: string; tripId: string; rating: number; comments: string | null; at: string }
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** The customer's private page: make a link, share it, revoke it, and read what they said. */
export function PortalLinksPanel({ customerId, customerName, phone }: { customerId: string; customerName: string; phone: string | null }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const key = ['portal-links', customerId];
  const links = useQuery({ queryKey: key, queryFn: () => api.get<{ items: LinkView[]; baseUrl: string | null }>('/v2/portal-links', { customerId }) });
  const feedback = useQuery({ queryKey: ['feedback', customerId], queryFn: () => api.get<{ items: FeedbackView[] }>('/v2/feedback', { customerId }) });
  const status = useQuery({ queryKey: ['comms', 'status'], queryFn: commsApi.status });
  const org = useQuery({ queryKey: ['organization'], queryFn: () => api.get<{ settings: { portal: { defaultLinkDays: number } } }>('/v2/organization') });
  const [daysTouched, setDays] = useState<number | null>(null);
  const days = daysTouched ?? org.data?.settings.portal.defaultLinkDays ?? 90;
  const [requireCode, setRequireCode] = useState(false);
  const [codeChannel, setCodeChannel] = useState<'WHATSAPP' | 'EMAIL'>('WHATSAPP');
  const [made, setMade] = useState<{ url: string | null; path: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<{ url: string | null; path: string }>('/v2/portal-links', { customerId, days, requireCode, codeChannel: requireCode ? codeChannel : null }),
    onSuccess: r => { setMade(r); void qc.invalidateQueries({ queryKey: key }); },
    onError: e => toast.error('No link made', (e as ApiError).message),
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.post(`/v2/portal-links/${id}/revoke`, {}), onSuccess: () => void qc.invalidateQueries({ queryKey: key }) });
  const url = made ? made.url ?? `${window.location.origin}${made.path}` : null;
  const text = url ? `Namaste ${customerName} Ji,\nHere is your private GK Travels page with your trips, tickets, stays and payments: ${url}\nPlease keep this link to yourself.` : '';
  const codeReady = (codeChannel === 'WHATSAPP' ? status.data?.whatsapp.configured : status.data?.email.configured) ?? false;

  return (
    <div className="space-y-4 max-w-3xl">
      {can('customers:write') && (
        <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
          <p className="text-sm text-slate-700">A private link opens this customer's own page: their trips, itinerary, tickets, stays, transport, payments and the documents you marked for them. Nothing internal is shown.</p>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="text-xs text-slate-600">Valid for (days)
              <input type="number" min={1} max={365} value={days} onChange={e => setDays(Number(e.target.value))} className="mt-0.5 block w-24 rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={requireCode} onChange={e => setRequireCode(e.target.checked)} />Also ask for a one-time code</label>
            {requireCode && (
              <select value={codeChannel} onChange={e => setCodeChannel(e.target.value as 'WHATSAPP' | 'EMAIL')} className="rounded-md border border-slate-300 px-2 py-1 text-sm bg-white" aria-label="Send the code by">
                <option value="WHATSAPP">Code by WhatsApp</option><option value="EMAIL">Code by email</option>
              </select>
            )}
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || (requireCode && !codeReady)}>Make a link</Button>
          </div>
          {requireCode && !codeReady && <p className="text-xs text-amber-800">{codeChannel === 'WHATSAPP' ? 'WhatsApp' : 'Email'} is not configured, so a code cannot be sent. Make the link without a code, or set up the channel first.</p>}
          {url && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900">Copy it now — TravelOS keeps only a fingerprint of the link and cannot show it again.</p>
              <p className="text-sm font-mono break-all">{url}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(url); toast.success('Copied', 'Paste it to the customer'); }}><Copy className="w-4 h-4 mr-1" />Copy</Button>
                {whatsappLink(phone, text) && (
                  <a href={whatsappLink(phone, text)!} target="_blank" rel="noreferrer" onClick={() => void commsApi.opened({ channel: 'WHATSAPP', customerId, tripId: null, to: phone!, subject: null, text, templateKey: 'portal_link' })}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Open in WhatsApp<ExternalLink className="w-3.5 h-3.5" /></a>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-md px-4">
        {links.data && links.data.items.length === 0 && <EmptyState compact title="No links yet" description="Make one above to share this customer's page." />}
        <ul className="divide-y divide-slate-100">{links.data?.items.map(l => (
          <li key={l.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2"><StatusPill tone={l.state === 'ACTIVE' ? 'success' : 'neutral'}>{l.state === 'ACTIVE' ? 'Active' : l.state === 'EXPIRED' ? 'Lapsed' : 'Revoked'}</StatusPill>{l.label ?? 'Link'}{l.requireCode ? ` · code by ${l.codeChannel === 'EMAIL' ? 'email' : 'WhatsApp'}` : ''}</p>
              <p className="text-xs text-slate-500">Made {when(l.createdAt)} · until {when(l.expiresAt)} · {l.useCount ? `opened ${l.useCount} time${l.useCount === 1 ? '' : 's'}, last ${when(l.lastUsedAt!)}` : 'not opened yet'}</p>
            </div>
            {can('customers:write') && l.state === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => revoke.mutate(l.id)} disabled={revoke.isPending}>Revoke</Button>}
          </li>
        ))}</ul>
      </section>

      {feedback.data && feedback.data.items.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">What they said</h3>
          <ul className="space-y-2 text-sm">{feedback.data.items.map(f => (
            <li key={f.id}><span className="text-amber-600">{'★'.repeat(f.rating)}<span className="text-slate-300">{'★'.repeat(5 - f.rating)}</span></span> · {f.tripId} · {when(f.at)}{f.comments && <p className="text-slate-700 whitespace-pre-wrap">{f.comments}</p>}</li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
