import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/features/trips/hooks';
import { tasksApi } from './api';

export const taskKeys = {
  all:   ['tasks'] as const,
  today: (mine: boolean) => ['tasks', 'today', mine] as const,
  rules: ['tasks', 'rules'] as const,
};

export const useToday = (mine: boolean) => useQuery({ queryKey: taskKeys.today(mine), queryFn: () => tasksApi.today(mine), refetchInterval: 60_000 });
export const useTaskRules = () => useQuery({ queryKey: taskKeys.rules, queryFn: tasksApi.rules });

/** Task writes refresh the Today view and the trip workspaces that list open tasks. */
export function useTaskMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.all });
      void qc.invalidateQueries({ queryKey: tripKeys.all });
    },
  });
}
