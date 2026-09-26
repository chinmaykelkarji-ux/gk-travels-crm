import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { copilotApi } from './api';

export const copilotKeys = {
  all:      ['copilot'] as const,
  sessions: ['copilot', 'sessions'] as const,
  session:  (id: string) => ['copilot', 'session', id] as const,
};

export const useCopilotSessions = () => useQuery({ queryKey: copilotKeys.sessions, queryFn: copilotApi.sessions });
export const useCopilotSession = (id: string | undefined) =>
  useQuery({ queryKey: copilotKeys.session(id ?? ''), queryFn: () => copilotApi.session(id!), enabled: Boolean(id) });

export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: copilotApi.ask,
    onSuccess: a => {
      void qc.invalidateQueries({ queryKey: copilotKeys.sessions });
      void qc.invalidateQueries({ queryKey: copilotKeys.session(a.sessionId) });
    },
  });
}

/** Approving or rejecting refreshes the conversation, and whatever the approval created. */
export function useDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; approve: boolean; text?: string }) =>
      a.approve ? copilotApi.approve(a.id, a.text ? { text: a.text } : {}) : copilotApi.reject(a.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: copilotKeys.all });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}
