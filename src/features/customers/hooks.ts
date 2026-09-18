import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { customersApi } from './api';
import type { CustomerCreate, CustomerUpdate, CustomerListQuery, RelationshipCreate } from '@/shared/contracts/customers';
import { useStore } from '@/store';

export const customerKeys = {
  all:    ['customers'] as const,
  list:   (q: Partial<CustomerListQuery>) => ['customers', 'list', q] as const,
  detail: (id: string) => ['customers', 'detail', id] as const,
  dupes:  ['customers', 'duplicates'] as const,
};

export function useCustomerList(q: Partial<CustomerListQuery>) {
  return useQuery({ queryKey: customerKeys.list(q), queryFn: () => customersApi.list(q), placeholderData: keepPreviousData });
}

export function useCustomer(id: string | undefined) {
  return useQuery({ queryKey: customerKeys.detail(id ?? ''), queryFn: () => customersApi.get(id as string), enabled: !!id });
}

export function useDuplicateGroups(enabled: boolean) {
  return useQuery({ queryKey: customerKeys.dupes, queryFn: customersApi.duplicateGroups, enabled });
}

/** Legacy screens read customers from the Zustand bootstrap; keep them in step. */
function useRefreshLegacyStore() {
  const fetchAll = useStore(s => s.fetchAll);
  return () => { void fetchAll(); };
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  const refresh = useRefreshLegacyStore();
  return useMutation({
    mutationFn: (body: CustomerCreate) => customersApi.create(body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: customerKeys.all }); refresh(); },
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  const refresh = useRefreshLegacyStore();
  return useMutation({
    mutationFn: (body: CustomerUpdate) => customersApi.update(id, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: customerKeys.all }); refresh(); },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  const refresh = useRefreshLegacyStore();
  return useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: customerKeys.all }); refresh(); },
  });
}

export function useMergeCustomers() {
  const qc = useQueryClient();
  const refresh = useRefreshLegacyStore();
  return useMutation({
    mutationFn: ({ targetId, sourceId }: { targetId: string; sourceId: string }) => customersApi.merge(targetId, sourceId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: customerKeys.all }); refresh(); },
  });
}

export function useRelationships(id: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: customerKeys.all });
  const add = useMutation({ mutationFn: (body: RelationshipCreate) => customersApi.addRelationship(id, body), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (relId: string) => customersApi.removeRelationship(id, relId), onSuccess: invalidate });
  return { add, remove };
}
