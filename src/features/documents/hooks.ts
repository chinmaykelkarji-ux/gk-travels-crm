import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentListQuery } from '@/shared/contracts/documents';
import { documentsApi } from './api';

export const documentKeys = {
  all:  ['documents'] as const,
  list: (q: Partial<DocumentListQuery>) => ['documents', 'list', q] as const,
  one:  (id: string) => ['documents', 'one', id] as const,
};

export const useDocuments = (q: Partial<DocumentListQuery>, enabled = true) =>
  useQuery({ queryKey: documentKeys.list(q), queryFn: () => documentsApi.list(q), enabled, placeholderData: keepPreviousData });

export const useDocument = (id: string | null) =>
  useQuery({ queryKey: documentKeys.one(id ?? ''), queryFn: () => documentsApi.get(id!), enabled: !!id });

export function useDocumentMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: documentKeys.all }); },
  });
}

/**
 * Opens a document in a new tab through a link that lives for a minute.
 * The URL is never stored and never put in the address bar of this page.
 */
export async function openDocument(id: string): Promise<void> {
  const { url } = await documentsApi.downloadUrl(id);
  window.open(url, '_blank', 'noopener,noreferrer');
}
