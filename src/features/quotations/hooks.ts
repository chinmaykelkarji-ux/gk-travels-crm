import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { quotesApi } from './api';
import type { QuoteCreate, QuoteUpdate, QuoteListQuery, QuoteStatus } from '@/shared/contracts/quotations';
import { salesKeys } from '@/features/sales/hooks';
import { useStore } from '@/store';

export const quoteKeys = {
  all:  ['quotes'] as const,
  list: (q: Partial<QuoteListQuery>) => ['quotes', 'list', q] as const,
  detail: (id: string) => ['quotes', 'detail', id] as const,
  customerView: (id: string) => ['quotes', 'customer-view', id] as const,
};

export function useQuoteList(q: Partial<QuoteListQuery>) { return useQuery({ queryKey: quoteKeys.list(q), queryFn: () => quotesApi.list(q), placeholderData: keepPreviousData }); }
export function useQuote(id: string | undefined) { return useQuery({ queryKey: quoteKeys.detail(id ?? ''), queryFn: () => quotesApi.get(id as string), enabled: !!id }); }
export function useCustomerView(id: string | undefined, enabled = true) { return useQuery({ queryKey: quoteKeys.customerView(id ?? ''), queryFn: () => quotesApi.customerView(id as string), enabled: !!id && enabled }); }

export function useQuoteMutations() {
  const qc = useQueryClient();
  const fetchAll = useStore(s => s.fetchAll);
  const done = () => { void qc.invalidateQueries({ queryKey: quoteKeys.all }); void qc.invalidateQueries({ queryKey: salesKeys.enquiries }); void fetchAll(); };
  return {
    create:       useMutation({ mutationFn: (b: QuoteCreate) => quotesApi.create(b), onSuccess: done }),
    update:       useMutation({ mutationFn: ({ id, body }: { id: string; body: QuoteUpdate }) => quotesApi.update(id, body), onSuccess: done }),
    send:         useMutation({ mutationFn: (id: string) => quotesApi.send(id), onSuccess: done }),
    status:       useMutation({ mutationFn: ({ id, status, reason }: { id: string; status: QuoteStatus; reason?: string | null }) => quotesApi.status(id, status, reason), onSuccess: done }),
    approval:     useMutation({ mutationFn: ({ id, approve, comment }: { id: string; approve: boolean; comment?: string | null }) => quotesApi.approval(id, approve, comment), onSuccess: done }),
    selectOption: useMutation({ mutationFn: ({ id, optionGroupId, itemId }: { id: string; optionGroupId: string; itemId: string }) => quotesApi.selectOption(id, optionGroupId, itemId), onSuccess: done }),
    newVersion:   useMutation({ mutationFn: (id: string) => quotesApi.newVersion(id), onSuccess: done }),
    duplicate:    useMutation({ mutationFn: (id: string) => quotesApi.duplicate(id), onSuccess: done }),
    accept:       useMutation({ mutationFn: ({ id, splitByParty, note }: { id: string; splitByParty: boolean; note?: string | null }) => quotesApi.accept(id, splitByParty, note), onSuccess: done }),
    remove:       useMutation({ mutationFn: (id: string) => quotesApi.remove(id), onSuccess: done }),
  };
}
