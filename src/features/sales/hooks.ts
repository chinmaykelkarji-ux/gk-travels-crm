import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { salesApi } from './api';
import type { LeadCreate, LeadUpdate, LeadListQuery, LeadStatus, LeadConvert, EnquiryCreate, EnquiryUpdate, EnquiryListQuery, EnquiryStatus } from '@/shared/contracts/sales';
import { customerKeys } from '@/features/customers/hooks';
import { useStore } from '@/store';

export const salesKeys = {
  team:      ['team'] as const,
  leads:     ['leads'] as const,
  leadList:  (q: Partial<LeadListQuery>) => ['leads', 'list', q] as const,
  lead:      (id: string) => ['leads', 'detail', id] as const,
  enquiries: ['enquiries'] as const,
  enqList:   (q: Partial<EnquiryListQuery>) => ['enquiries', 'list', q] as const,
  enquiry:   (id: string) => ['enquiries', 'detail', id] as const,
};

export function useTeam() { return useQuery({ queryKey: salesKeys.team, queryFn: salesApi.team, staleTime: 5 * 60_000 }); }

export function useLeadList(q: Partial<LeadListQuery>) { return useQuery({ queryKey: salesKeys.leadList(q), queryFn: () => salesApi.leads.list(q), placeholderData: keepPreviousData }); }
export function useLead(id: string | undefined) { return useQuery({ queryKey: salesKeys.lead(id ?? ''), queryFn: () => salesApi.leads.get(id as string), enabled: !!id }); }
export function useEnquiryList(q: Partial<EnquiryListQuery>) { return useQuery({ queryKey: salesKeys.enqList(q), queryFn: () => salesApi.enquiries.list(q), placeholderData: keepPreviousData }); }
export function useEnquiry(id: string | undefined) { return useQuery({ queryKey: salesKeys.enquiry(id ?? ''), queryFn: () => salesApi.enquiries.get(id as string), enabled: !!id }); }

function useDone(keys: readonly (readonly string[])[]) {
  const qc = useQueryClient();
  const fetchAll = useStore(s => s.fetchAll);
  return () => { for (const k of keys) void qc.invalidateQueries({ queryKey: k }); void fetchAll(); };
}

export function useLeadMutations() {
  const done = useDone([salesKeys.leads, salesKeys.enquiries, customerKeys.all]);
  return {
    create:  useMutation({ mutationFn: (b: LeadCreate) => salesApi.leads.create(b), onSuccess: done }),
    update:  useMutation({ mutationFn: ({ id, body }: { id: string; body: LeadUpdate }) => salesApi.leads.update(id, body), onSuccess: done }),
    status:  useMutation({ mutationFn: ({ id, status, lostReason, note }: { id: string; status: LeadStatus; lostReason?: string | null; note?: string | null }) => salesApi.leads.status(id, { status, lostReason, note }), onSuccess: done }),
    assign:  useMutation({ mutationFn: ({ id, userId }: { id: string; userId: string | null }) => salesApi.leads.assign(id, userId), onSuccess: done }),
    note:    useMutation({ mutationFn: ({ id, note }: { id: string; note: string }) => salesApi.leads.note(id, note), onSuccess: done }),
    convert: useMutation({ mutationFn: ({ id, body }: { id: string; body: LeadConvert }) => salesApi.leads.convert(id, body), onSuccess: done }),
    remove:  useMutation({ mutationFn: (id: string) => salesApi.leads.remove(id), onSuccess: done }),
  };
}

export function useEnquiryMutations() {
  const done = useDone([salesKeys.enquiries, salesKeys.leads, customerKeys.all]);
  return {
    create:   useMutation({ mutationFn: (b: EnquiryCreate) => salesApi.enquiries.create(b), onSuccess: done }),
    update:   useMutation({ mutationFn: ({ id, body }: { id: string; body: EnquiryUpdate }) => salesApi.enquiries.update(id, body), onSuccess: done }),
    status:   useMutation({ mutationFn: ({ id, status, lostReason, note }: { id: string; status: EnquiryStatus; lostReason?: string | null; note?: string | null }) => salesApi.enquiries.status(id, { status, lostReason, note }), onSuccess: done }),
    assign:   useMutation({ mutationFn: ({ id, userId }: { id: string; userId: string | null }) => salesApi.enquiries.assign(id, userId), onSuccess: done }),
    note:     useMutation({ mutationFn: ({ id, note }: { id: string; note: string }) => salesApi.enquiries.note(id, note), onSuccess: done }),
    followUp: useMutation({ mutationFn: ({ id, ...body }: { id: string; dueDate: string; title?: string; note?: string | null; assignedToUserId?: string | null }) => salesApi.enquiries.followUp(id, body), onSuccess: done }),
    remove:   useMutation({ mutationFn: (id: string) => salesApi.enquiries.remove(id), onSuccess: done }),
  };
}
