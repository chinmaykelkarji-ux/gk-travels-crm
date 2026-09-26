import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bot, History, Loader2, Plus, SendHorizontal } from 'lucide-react';
import { PageHeader, EmptyState } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '@/features/ai/api';
import type { ApiError } from '@/lib/api';
import type { CopilotMessage } from '@/shared/contracts/copilot';
import { useAsk, useCopilotSession, useCopilotSessions } from '../hooks';
import { Message } from '../components/Message';

/** Starting points, offered only when the person could open that screen themselves. */
const EXAMPLES: { q: string; permission: string }[] = [
  { q: 'Which trips leave in the next 7 days, and what is still not confirmed?', permission: 'trips:read' },
  { q: 'What is overdue today?', permission: 'tasks:read' },
  { q: 'Who owes us money, oldest first?', permission: 'finance:read' },
  { q: 'What do we owe suppliers this week?', permission: 'finance:read' },
  { q: 'Which passports lapse in the next 6 months?', permission: 'documents:read' },
  { q: 'Which documents are waiting to be checked?', permission: 'documents:read' },
];

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function Sessions({ activeId, onPick }: { activeId?: string; onPick: () => void }) {
  const q = useCopilotSessions();
  const items = q.data?.items ?? [];
  return (
    <nav aria-label="Conversations" className="space-y-0.5">
      {q.isPending && <p className="px-2 text-xs text-slate-500">Loading…</p>}
      {q.data && items.length === 0 && <p className="px-2 text-xs text-slate-500">No conversations yet.</p>}
      {items.map(s => (
        <Link key={s.id} to={`/copilot/${s.id}`} onClick={onPick}
          className={`block rounded-md px-2 py-1.5 text-sm ${s.id === activeId ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
          <span className="block truncate">{s.title}</span>
          <span className={`block text-[11px] ${s.id === activeId ? 'text-slate-300' : 'text-slate-400'}`}>{when(s.updatedAt)} · {s.messages} question{s.messages === 1 ? '' : 's'}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Ask TravelOS: answers from the same screens the person could open, with what it looked at under each answer. */
export default function CopilotPage() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: aiApi.status });
  const session = useCopilotSession(sessionId);
  const ask = useAsk();
  const [draft, setDraft] = useState('');
  const [local, setLocal] = useState<CopilotMessage[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // A fresh read of the conversation already holds what was shown locally.
  useEffect(() => { setLocal([]); }, [session.dataUpdatedAt, sessionId]);

  const messages = useMemo(() => [...(sessionId ? session.data?.transcript ?? [] : []), ...local], [sessionId, session.data, local]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, ask.isPending]);

  const configured = status.data?.copilot.configured;
  const examples = EXAMPLES.filter(e => can(e.permission)).slice(0, 4);

  function send(text: string) {
    const message = text.trim();
    if (!message || ask.isPending) return;
    setLocal(l => [...l, { role: 'user', text: message }]);
    setDraft('');
    ask.mutate({ message, ...(sessionId ? { sessionId } : {}) }, {
      onSuccess: a => {
        setLocal(l => [...l, a.answer]);
        if (a.sessionId !== sessionId) navigate(`/copilot/${a.sessionId}`, { replace: !sessionId });
      },
      onError: () => { setLocal(l => l.slice(0, -1)); setDraft(message); },
    });
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(draft); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); }
  };

  return (
    <div className="min-h-full bg-slate-50 flex flex-col">
      <PageHeader title="Ask TravelOS" subtitle="Answers from your own screens. It only looks — it never changes anything."
        actions={<div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setShowSessions(s => !s)} aria-expanded={showSessions}>
            <History className="w-4 h-4 mr-1" />Past
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setLocal([]); navigate('/copilot'); }}><Plus className="w-4 h-4 mr-1" />New</Button>
        </div>} />

      <div className="flex-1 flex min-h-0 relative">
        <aside className={`${showSessions ? 'block' : 'hidden'} lg:block w-full lg:w-64 shrink-0 border-r border-slate-200 bg-white p-2 lg:min-h-full absolute lg:static z-10 inset-x-0 shadow lg:shadow-none`}>
          <Sessions activeId={sessionId} onPick={() => setShowSessions(false)} />
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 px-3 sm:px-5 py-4 space-y-3 max-w-3xl w-full mx-auto">
            {status.data && !configured && (
              <div className="bg-white border border-slate-200 rounded-md">
                <EmptyState icon={Bot} title="Not configured" description={status.data.copilot.hint ?? 'The copilot is not configured on this server.'}
                  action={<Link to="/settings/ai" className="text-sm text-sky-700 underline">See what is set up</Link>} />
              </div>
            )}
            {sessionId && session.isError && <EmptyState title="Could not open this conversation" description={(session.error as ApiError).message} />}
            {configured && messages.length === 0 && !(sessionId && session.isPending) && (
              <div className="bg-white border border-slate-200 rounded-md p-4">
                <p className="text-sm text-slate-700">Ask about trips, customers, tasks{can('finance:read') ? ', money' : ''} or documents. Every answer shows what it looked at, so you can check it.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {examples.map(e => (
                    <button key={e.q} type="button" onClick={() => send(e.q)}
                      className="text-left text-xs rounded-full border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-100">{e.q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => <Message key={i} m={m} />)}
            {ask.isPending && (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Looking it up…</div>
            )}
            {ask.isError && <p role="alert" className="text-sm text-red-700">{(ask.error as ApiError).message}</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="sticky bottom-0 border-t border-slate-200 bg-white px-3 sm:px-5 py-2.5">
            <div className="max-w-3xl mx-auto flex items-end gap-2">
              <label htmlFor="copilot-q" className="sr-only">Your question</label>
              <textarea id="copilot-q" rows={1} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey}
                disabled={!configured} maxLength={2000}
                placeholder={configured ? 'Ask a question…' : 'Not configured'}
                className="flex-1 min-w-0 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100 max-h-40" />
              <Button type="submit" size="sm" disabled={!configured || !draft.trim() || ask.isPending} aria-label="Ask" className="h-9">
                <SendHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
