import {
  useQuery, useMutation, useQueryClient,
} from '@tanstack/react-query';
import { leadService, type CreateLeadInput, type UpdateLeadInput } from '@/backend/services/lead.service';
import { useAuth } from '@/backend/auth/AuthContext';
import { Q } from './queryKeys';
import { shouldRetry, STALE_TIME } from './apiError';
import type { LeadFilters } from '@/backend/repositories/lead.repository';
import type { LeadStatus } from '@/backend/supabase/database.types';

export function useLeads(filters?: LeadFilters, pagination?: { page: number; limit: number }) {
  const { user } = useAuth();
  const orgId    = user?.orgId ?? '';

  return useQuery({
    queryKey: Q.leads.list(orgId, { ...filters, ...pagination }),
    queryFn:  () => leadService.list(orgId, filters, pagination),
    enabled:  Boolean(orgId),
    staleTime: STALE_TIME.short,
    retry:    shouldRetry,
  });
}

export function useLead(id: string | undefined) {
  const { user } = useAuth();
  const orgId    = user?.orgId ?? '';

  return useQuery({
    queryKey: Q.leads.detail(orgId, id ?? ''),
    queryFn:  () => leadService.get(orgId, id!),
    enabled:  Boolean(orgId && id),
    staleTime: STALE_TIME.short,
    retry:    shouldRetry,
  });
}

export function useLeadCounts() {
  const { user } = useAuth();
  const orgId    = user?.orgId ?? '';

  return useQuery({
    queryKey: Q.leads.count(orgId),
    queryFn:  () => leadService.countByStatus(orgId),
    enabled:  Boolean(orgId),
    staleTime: STALE_TIME.medium,
    retry:    shouldRetry,
  });
}

export function useCreateLead() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (input: CreateLeadInput) =>
      leadService.create(orgId, input, user?.id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: Q.leads.all(orgId) });
    },
  });
}

export function useUpdateLead(leadId: string) {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (input: UpdateLeadInput) =>
      leadService.update(orgId, leadId, input, user?.id ?? ''),
    onSuccess: (updated) => {
      queryClient.setQueryData(Q.leads.detail(orgId, leadId), updated);
      queryClient.invalidateQueries({ queryKey: Q.leads.list(orgId) });
    },
  });
}

export function useSetLeadStatus(leadId: string) {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (status: LeadStatus) =>
      leadService.setStatus(orgId, leadId, status, user?.id ?? ''),
    onSuccess: (updated) => {
      queryClient.setQueryData(Q.leads.detail(orgId, leadId), updated);
      queryClient.invalidateQueries({ queryKey: Q.leads.list(orgId) });
      queryClient.invalidateQueries({ queryKey: Q.leads.count(orgId) });
    },
  });
}

export function useDeleteLead() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const orgId       = user?.orgId ?? '';

  return useMutation({
    mutationFn: (id: string) => leadService.delete(orgId, id, user?.id ?? ''),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: Q.leads.detail(orgId, id) });
      queryClient.invalidateQueries({ queryKey: Q.leads.all(orgId) });
    },
  });
}
