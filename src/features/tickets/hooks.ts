import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TicketListQuery } from '@/shared/contracts/tickets';
import { ticketsApi, type Ticket } from './api';

export const ticketKeys = {
  all:    ['tickets'] as const,
  list:   (q: Partial<TicketListQuery>) => ['tickets', 'list', q] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
};

export const useTickets = (q: Partial<TicketListQuery>, enabled = true) => useQuery({ queryKey: ticketKeys.list(q), queryFn: () => ticketsApi.list(q), placeholderData: keepPreviousData, enabled });
export const useTicket = (id?: string) => useQuery({ queryKey: ticketKeys.detail(id ?? ''), queryFn: () => ticketsApi.get(id!), enabled: !!id });

/** Ticket writes return the full ticket; the detail cache is replaced with it and lists refresh. */
export function useTicketMutation<A>(fn: (args: A) => Promise<Ticket>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: t => {
      qc.setQueryData(ticketKeys.detail(t.id), (old: Ticket | undefined) => ({ ...t, activity: old?.activity }));
      void qc.invalidateQueries({ queryKey: ticketKeys.all });
      void qc.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}
