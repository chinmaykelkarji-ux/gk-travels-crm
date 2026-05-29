import { useState, useMemo } from 'react';
import { Activity, Bell, CheckSquare, AlertTriangle } from 'lucide-react';
import { useStore, selectors } from '@/store';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { fmtDate } from '@/shared/utils/date';
import { cn } from '@/shared/utils/cn';
import { toast } from '@/shared/hooks/useToast';

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'bg-red-50 border-red-200',
  high:   'bg-orange-50 border-orange-200',
  medium: 'bg-yellow-50 border-yellow-200',
  low:    'bg-gray-50 border-gray-200',
};

export default function Operations() {
  const reminders       = useStore(selectors.pendingReminders);
  const tasks           = useStore(s => s.tasks);
  const markSent        = useStore(s => s.markReminderSent);
  const completeTask    = useStore(s => s.completeTask);
  const refreshReminders = useStore(s => s.refreshAllReminders);

  const pendingTasks  = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 font-display">Operations</h2>
          {reminders.length > 0 && (
            <Badge variant="destructive">{reminders.length} pending</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => { refreshReminders(); toast.info('Reminders refreshed'); }}>
          Refresh Reminders
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3.5">
        <p className="text-sm text-blue-700 font-medium">Full Operations Module — Phase 3</p>
        <p className="text-xs text-blue-600 mt-1">
          WhatsApp integration, email reminders, automation rules, and an operational command center are coming in Phase 3.
        </p>
      </div>

      <Tabs defaultValue="reminders">
        <TabsList>
          <TabsTrigger value="reminders">
            Reminders
            {reminders.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5">{reminders.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks ({pendingTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reminders">
          {reminders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <Bell className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No pending reminders — all clear!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reminders.map(r => (
                <div
                  key={r.id}
                  className={cn('flex items-start gap-4 p-4 rounded-xl border', PRIORITY_COLOR[r.priority] ?? PRIORITY_COLOR.low)}
                >
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{r.message}</p>
                    <p className="text-xs text-gray-500 mt-1">Due: {fmtDate(r.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge
                      variant={r.priority === 'urgent' ? 'destructive' : r.priority === 'high' ? 'warning' : 'secondary'}
                      className="text-[10px]"
                    >
                      {r.priority}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { markSent(r.id); toast.success('Reminder marked sent'); }}
                      className="text-xs"
                    >
                      Mark Sent
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          {pendingTasks.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <CheckSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No pending tasks</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingTasks.map(t => (
                <div key={t.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200">
                  <button
                    onClick={() => { completeTask(t.id); toast.success('Task completed'); }}
                    className="w-5 h-5 rounded border-2 border-gray-300 hover:border-blue-500 flex-shrink-0 transition-colors"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{t.title}</p>
                    {t.dueDate && <p className="text-xs text-gray-400 mt-0.5">Due {fmtDate(t.dueDate)}</p>}
                  </div>
                  <Badge
                    variant={t.priority === 'urgent' ? 'destructive' : t.priority === 'high' ? 'warning' : 'secondary'}
                    className="text-[10px]"
                  >
                    {t.priority}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
