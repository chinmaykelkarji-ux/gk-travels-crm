import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';

interface NotificationView { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; at: string }
interface NotificationList { unread: number; items: NotificationView[] }

const KEY = ['notifications'] as const;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/**
 * The bell: things for this person (tasks given to them, messages that could
 * not be sent, documents waiting for them), and a count of the classic
 * reminders, which still live on the Operations screen.
 */
export function NotificationsMenu({ classicReminders }: { classicReminders: number }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<NotificationList>('/v2/notifications'), refetchInterval: 60_000 });
  const set = (d: NotificationList) => qc.setQueryData(KEY, d);
  const read = useMutation({ mutationFn: (id: string) => api.post<NotificationList>(`/v2/notifications/${id}/read`, {}), onSuccess: set });
  const readAll = useMutation({ mutationFn: () => api.post<NotificationList>('/v2/notifications/read-all', {}), onSuccess: set });
  const unread = q.data?.unread ?? 0;
  const badge = unread + classicReminders;

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label={`Notifications${badge ? `, ${badge} new` : ''}`} aria-expanded={open}
        className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
        <Bell className="w-[18px] h-[18px]" />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl z-20 overflow-hidden bg-white border border-slate-200 shadow-xl">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">For you</span>
              {unread > 0 && <button type="button" onClick={() => readAll.mutate()} className="text-xs text-sky-700 hover:underline">Mark all read</button>}
            </div>
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {q.data && q.data.items.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-500">Nothing new for you.</li>}
              {q.data?.items.map(n => (
                <li key={n.id}>
                  <button type="button" className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 ${n.read ? '' : 'bg-sky-50/50'}`}
                    onClick={() => { if (!n.read) read.mutate(n.id); setOpen(false); if (n.link) navigate(n.link); }}>
                    <p className={`text-sm leading-snug ${n.read ? 'text-slate-600' : 'text-slate-900 font-medium'}`}>{n.title}</p>
                    {n.body && <p className="text-xs text-slate-500 mt-0.5 break-words">{n.body}</p>}
                    <p className="text-[11px] text-slate-400 mt-0.5">{when(n.at)}</p>
                  </button>
                </li>
              ))}
            </ul>
            {classicReminders > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
                <Link to="/operations" onClick={() => setOpen(false)} className="text-xs font-medium text-sky-700 hover:underline">
                  {classicReminders} classic reminder{classicReminders === 1 ? '' : 's'} on Tasks &amp; Alerts →
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
