import { useMutation, useQuery } from '@tanstack/react-query';
import { insightsApi } from './api';

export const insightKeys = { all: ['insights'] as const };

export const useInsights = () => useQuery({ queryKey: insightKeys.all, queryFn: insightsApi.list, refetchInterval: 5 * 60_000 });
export const usePhraseInsights = () => useMutation({ mutationFn: insightsApi.phrase });
