import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, PageHeader, StatusPill } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { toast } from '@/shared/hooks/useToast';
import type { ApiError } from '@/lib/api';
import { PLACEHOLDERS, SAMPLE_VALUES, renderTemplate, unknownPlaceholders } from '@/shared/calc/templates';
import type { TemplateView } from '@/shared/contracts/templates';
import { templatesApi } from '../api';

const KEY = ['templates'] as const;

function Editor({ t, canEdit }: { t: TemplateView; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(t.body);
  const [subject, setSubject] = useState(t.subject ?? '');
  const [meta, setMeta] = useState(t.metaTemplateName ?? '');
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const save = useMutation({
    mutationFn: () => templatesApi.update(t.id, { body, subject: t.channel === 'EMAIL' ? subject : null, metaTemplateName: meta || null }),
    onSuccess: () => { refresh(); toast.success('Saved', t.name); setOpen(false); },
    onError: e => toast.error('Not saved', (e as ApiError).summary),
  });
  const toggle = useMutation({ mutationFn: () => templatesApi.update(t.id, { enabled: !t.enabled }), onSuccess: refresh, onError: e => toast.error('Not saved', (e as ApiError).summary) });
  const reset = useMutation({ mutationFn: () => templatesApi.reset(t.id), onSuccess: v => { refresh(); setBody(v.body); setSubject(v.subject ?? ''); toast.success('Reset', t.name); } });
  const unknown = unknownPlaceholders(subject, body);
  const preview = renderTemplate({ subject: t.channel === 'EMAIL' ? subject : null, body }, SAMPLE_VALUES);

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 flex flex-wrap items-center gap-2">
            {t.name}
            <StatusPill tone={t.channel === 'WHATSAPP' ? 'success' : 'info'}>{t.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}</StatusPill>
            {!t.enabled && <StatusPill tone="neutral">Off</StatusPill>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{t.purpose ?? t.key}{t.channel === 'WHATSAPP' ? ` · Meta template: ${t.metaTemplateName ?? 'not set — can only be opened in WhatsApp, not sent by TravelOS'}` : ''}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => toggle.mutate()} disabled={toggle.isPending}>{t.enabled ? 'Switch off' : 'Switch on'}</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Edit'}</Button>
          </div>
        )}
      </div>
      {!open && <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words">{t.body}</p>}
      {open && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            {t.channel === 'EMAIL' && (
              <label className="block text-xs text-slate-600">Subject
                <input value={subject} onChange={e => setSubject(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
              </label>
            )}
            <label className="block text-xs text-slate-600">Message
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} className="mt-0.5 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-mono" />
            </label>
            {t.channel === 'WHATSAPP' && (
              <label className="block text-xs text-slate-600">Approved Meta template name (so TravelOS can send it)
                <input value={meta} onChange={e => setMeta(e.target.value)} placeholder="e.g. payment_reminder_v1" className="mt-0.5 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
              </label>
            )}
            {unknown.length > 0 && <p className="text-xs text-red-700">TravelOS cannot fill: {unknown.map(u => `{{${u}}}`).join(', ')}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || unknown.length > 0}>Save</Button>
              {t.isSystem && <Button size="sm" variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending}>Reset to original</Button>}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Preview with sample details</p>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap break-words">
              {preview.subject && <p className="font-medium mb-1">{preview.subject}</p>}
              {preview.text}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/** What the office says, again and again — the wording, per channel, with what each placeholder means. */
export default function TemplatesPage() {
  const { can } = usePermissions();
  const q = useQuery({ queryKey: KEY, queryFn: templatesApi.list });
  const [channel, setChannel] = useState<'ALL' | 'WHATSAPP' | 'EMAIL'>('ALL');
  const items = useMemo(() => (q.data?.items ?? []).filter(t => channel === 'ALL' || t.channel === channel), [q.data, channel]);

  return (
    <div className="min-h-full bg-slate-50">
      <PageHeader title="Message templates" subtitle="The wording TravelOS uses for WhatsApp and email. Nothing is sent from this page."
        actions={<div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm" role="group" aria-label="Channel">
          {(['ALL', 'WHATSAPP', 'EMAIL'] as const).map(c => (
            <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)}
              className={`px-3 py-1 rounded ${channel === c ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{c === 'ALL' ? 'All' : c === 'WHATSAPP' ? 'WhatsApp' : 'Email'}</button>
          ))}
        </div>} />
      <div className="px-5 py-4 space-y-4 max-w-5xl">
        {q.isPending && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isError && <EmptyState title="Could not load templates" description={(q.error as ApiError).message} />}
        {items.length > 0 && <ul className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">{items.map(t => <Editor key={t.id} t={t} canEdit={can('settings:write')} />)}</ul>}
        <details className="bg-white border border-slate-200 rounded-md p-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-800">What each {'{{placeholder}}'} fills in</summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {PLACEHOLDERS.map(p => <div key={p.key} className="flex gap-2 min-w-0"><dt className="font-mono text-xs text-slate-700 shrink-0">{`{{${p.key}}}`}</dt><dd className="text-xs text-slate-500 truncate">{p.label}</dd></div>)}
          </dl>
        </details>
      </div>
    </div>
  );
}
