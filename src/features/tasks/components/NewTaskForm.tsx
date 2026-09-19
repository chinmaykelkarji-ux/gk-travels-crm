import { useState } from 'react';
import { Field, Select, TextInput, Textarea } from '@/design-system';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/hooks/useToast';
import { ApiError } from '@/lib/api';
import { AssigneeSelect } from '@/features/sales/components/common';
import type { TaskPriority } from '@/shared/contracts/tasks';
import { tasksApi } from '../api';
import { useTaskMutation } from '../hooks';

/** A task typed by a person (rules raise the rest). */
export function NewTaskForm({ onDone, tripId }: { onDone: () => void; tripId?: string }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignee, setAssignee] = useState<string | null>(null);
  const create = useTaskMutation(() => tasksApi.create({ title, description: description || null, dueAt: dueAt || null, priority, tripId: tripId ?? null, assignedToUserId: assignee }));
  const err = create.error as ApiError | null;
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); create.mutate(undefined, { onSuccess: () => { toast.success('Task added'); onDone(); } }); }}>
      <Field label="What needs doing" htmlFor="t-title" required error={err?.fields?.title}><TextInput id="t-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Collect Aadhaar copies from the Kulkarni family" /></Field>
      <Field label="Details" htmlFor="t-desc"><Textarea id="t-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Due" htmlFor="t-due" hint="India time" error={err?.fields?.dueAt}><TextInput id="t-due" type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></Field>
        <Field label="Priority" htmlFor="t-pri"><Select id="t-pri" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>{(['urgent', 'high', 'medium', 'low'] as const).map(p => <option key={p} value={p}>{p}</option>)}</Select></Field>
      </div>
      <AssigneeSelect id="t-assignee" value={assignee} onChange={setAssignee} />
      {err && !err.fields && <p className="text-sm text-red-600">{err.message}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button><Button type="submit" loading={create.isPending}>Add task</Button></div>
    </form>
  );
}
