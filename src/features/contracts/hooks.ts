import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { contractsApi } from './api';
import type { ContractListQuery, ContractStatus, ScheduleInput } from '@/shared/contracts/contracts';
import { quoteKeys } from '@/features/quotations/hooks';
import { useStore } from '@/store';

export const contractKeys = {
  all: ['contracts'] as const,
  list: (q: Partial<ContractListQuery>) => ['contracts', 'list', q] as const,
  detail: (id: string) => ['contracts', 'detail', id] as const,
  due: (days: number) => ['contracts', 'due', days] as const,
};

export function useContractList(q: Partial<ContractListQuery>, enabled = true) { return useQuery({ queryKey: contractKeys.list(q), queryFn: () => contractsApi.list(q), placeholderData: keepPreviousData, enabled }); }
export function useContract(id: string | undefined) { return useQuery({ queryKey: contractKeys.detail(id ?? ''), queryFn: () => contractsApi.get(id as string), enabled: !!id }); }
export function usePaymentsDue(days = 7) { return useQuery({ queryKey: contractKeys.due(days), queryFn: () => contractsApi.paymentsDue(days) }); }

export function useContractMutations() {
  const qc = useQueryClient();
  const fetchAll = useStore(s => s.fetchAll);
  const done = () => { void qc.invalidateQueries({ queryKey: contractKeys.all }); void qc.invalidateQueries({ queryKey: quoteKeys.all }); void fetchAll(); };
  return {
    schedule: useMutation({ mutationFn: ({ id, body }: { id: string; body: ScheduleInput }) => contractsApi.setSchedule(id, body), onSuccess: done }),
    status:   useMutation({ mutationFn: ({ id, status, reason }: { id: string; status: ContractStatus; reason?: string | null }) => contractsApi.status(id, status, reason), onSuccess: done }),
    notes:    useMutation({ mutationFn: ({ id, notes }: { id: string; notes: string | null }) => contractsApi.notes(id, notes), onSuccess: done }),
  };
}
