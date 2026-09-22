import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentKeys } from '@/features/documents/hooks';
import { tripKeys } from '@/features/trips/hooks';
import { extractionApi } from './api';

export const extractionKeys = {
  all: ['extractions'] as const,
  pending: ['extractions', 'pending'] as const,
  forDocument: (id: string) => ['extractions', 'document', id] as const,
  one: (id: string) => ['extractions', 'one', id] as const,
};

/** While a document is being read, the answer is a few seconds away. */
export const usePendingReviews = (refetch = true) =>
  useQuery({ queryKey: extractionKeys.pending, queryFn: extractionApi.pending, refetchInterval: refetch ? 5000 : false });

export const useExtractionsFor = (documentId: string | null) =>
  useQuery({
    queryKey: extractionKeys.forDocument(documentId ?? ''),
    queryFn: () => extractionApi.forDocument(documentId!),
    enabled: !!documentId,
    refetchInterval: q => {
      const items = (q.state.data as { items: { status: string }[] } | undefined)?.items ?? [];
      return items.some(x => x.status === 'QUEUED' || x.status === 'READING') ? 3000 : false;
    },
  });

export const useExtraction = (id: string | null) =>
  useQuery({ queryKey: extractionKeys.one(id ?? ''), queryFn: () => extractionApi.get(id!), enabled: !!id });

/** Approving creates a real record, so the trip and the documents both change. */
export function useExtractionMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: extractionKeys.all });
      void qc.invalidateQueries({ queryKey: documentKeys.all });
      void qc.invalidateQueries({ queryKey: tripKeys.all });
    },
  });
}
