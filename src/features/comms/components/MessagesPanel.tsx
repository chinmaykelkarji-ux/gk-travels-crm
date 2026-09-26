import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Mail, MessageCircle, Send } from 'lucide-react';
import { EmptyState, StatusPill, type Tone } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import type { ApiError } from '@/lib/api';
import type { CommChannel, CommView } from '@/shared/contracts/comms';
import { templatesApi } from '@/features/templates/api';
import { commsApi } from '../api';

const TONE: Record<string, Tone> = { LOGGED: 'neutral', QUEUED: 'warning', SENDING: 'warning', SENT: 'info', DELIVERED: 'success', READ: 'success', FAILED: 'danger' };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function Row({ m }: { m: CommView }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2.5">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left" aria-expanded={open}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {m.channel === 'EMAIL' ? <Mail className="w-4 h-4 text-slate-400" /> : <MessageCircle className="w-4 h-4 text-slate-400" />}
          <span className="font-medium text-slate-800 break-all">{m.subject ?? m.templateKey?.replace(/_/g, ' ') ?? 'Message'}</span>
          <StatusPill tone={TONE[m.status] ?? 'neutral'}>{m.statusLabel}</StatusPill>
          {m.source === 'AUTOMATION' && <StatusPill tone="info">Automatic</StatusPill>}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 break-words">to {m.to} · {when(m.at)}{m.by ? ` · ${m.by}` : ''}{m.reason ? ` · ${m.reason}` : ''}</p>
      </button>
      {open && m.text && <p className="mt-1.5 rounded bg-slate-50 px-3 py-2 text-sm whitespace-pre-wrap break-words text-slate-700">{m.text}</p>}
    </li>
  );
}

/**
 * Every message about this trip or customer, and a way to send one from a
 * template. TravelOS sends only when the channel is configured and the
 * template can be delivered; otherwise the person opens it in their own app,
 * and that is logged too.
 */
export function MessagesPanel({ tripId, customerId }: { tripId?: string; customerId?: string }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const key = ['comms', 'log', tripId ?? '', customerId ?? ''];
  const log = useQuery({ queryKey: key, queryFn: () => commsApi.log({ tripId, customerId }), refetchInterval: 30_000 });
  const templates = useQuery({ queryKey: ['templates'], queryFn: templatesApi.list, enabled: can('messaging:write') });
  const [channel, setChannel] = useState<CommChannel>('WHATSAPP');
  const [templateKey, setTemplateKey] = useState('');
  const body = { templateKey, channel, tripId: tripId ?? null, customerId: customerId ?? null, receiptId: null, ticketId: null, travellerId: null, to: null };
  const preview = useQuery({ queryKey: ['comms', 'preview', body], queryFn: () => commsApi.preview(body), enabled: Boolean(templateKey) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['comms', 'log'] });
  const send = useMutation({
    mutationFn: () => commsApi.send(body),
    onSuccess: () => { refresh(); toast.success('Queued', 'TravelOS will send it in a moment'); setTemplateKey(''); },
    onError: e => toast.error('Not sent', (e as ApiError).message),
  });
  const opened = useMutation({
    mutationFn: () => commsApi.opened({ channel, tripId: tripId ?? null, customerId: customerId ?? null, to: preview.data!.to!, subject: preview.data!.subject, text: preview.data!.text, templateKey }),
    onSuccess: refresh,
  });
  const options = (templates.data?.items ?? []).filter(t => t.channel === channel && t.enabled);
  const p = preview.data;

  return (
    <div className="space-y-4 max-w-4xl">
      {can('messaging:write') && (
        <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm" role="group" aria-label="Channel">
              {(['WHATSAPP', 'EMAIL'] as const).map(c => (
                <button key={c} type="button" aria-pressed={channel === c} onClick={() => { setChannel(c); setTemplateKey(''); }}
                  className={`px-3 py-1 rounded ${channel === c ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{c === 'WHATSAPP' ? 'WhatsApp' : 'Email'}</button>
              ))}
            </div>
            <label className="sr-only" htmlFor="msg-template">Template</label>
            <select id="msg-template" value={templateKey} onChange={e => setTemplateKey(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm bg-white">
              <option value="">Choose a message…</option>
              {options.map(t => <option key={t.id} value={t.key}>{t.name}</option>)}
            </select>
          </div>
          {preview.isFetching && <p className="text-sm text-slate-500"><Loader2 className="inline w-4 h-4 animate-spin mr-1" />Filling it in…</p>}
          {preview.isError && <p className="text-sm text-red-700">{(preview.error as ApiError).message}</p>}
          {p && !preview.isFetching && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">To {p.to ?? '— no contact on file'}</p>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap break-words">
                {p.subject && <p className="font-medium mb-1">{p.subject}</p>}{p.text}
              </div>
              {p.missing.length > 0 && <p className="text-sm text-amber-800">TravelOS does not have {p.missing.map(m => m.replace(/_/g, ' ')).join(', ')} for this message yet — add it on the record first.</p>}
              {p.missing.length === 0 && p.cannotSend && <p className="text-xs text-slate-500">{p.cannotSend}. You can open it in your own {channel === 'WHATSAPP' ? 'WhatsApp' : 'mail'} instead.</p>}
              <div className="flex flex-wrap gap-2">
                {!p.cannotSend && p.missing.length === 0 && (
                  <Button size="sm" onClick={() => send.mutate()} disabled={send.isPending}><Send className="w-4 h-4 mr-1" />Send from TravelOS</Button>
                )}
                {p.openLink && (
                  <a href={p.openLink} target="_blank" rel="noreferrer" onClick={() => opened.mutate()}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    Open in {channel === 'WHATSAPP' ? 'WhatsApp' : 'mail'}<ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-md px-4">
        {log.isPending && <p className="py-3 text-sm text-slate-500">Loading…</p>}
        {log.isError && <p className="py-3 text-sm text-red-700">{(log.error as ApiError).message}</p>}
        {log.data && log.data.items.length === 0 && <EmptyState compact title="No messages yet" description="Messages sent from TravelOS or opened in WhatsApp or mail appear here." />}
        {log.data && log.data.items.length > 0 && <ul className="divide-y divide-slate-100">{log.data.items.map(m => <Row key={m.id} m={m} />)}</ul>}
      </section>
    </div>
  );
}
