import { api } from '@/lib/api';
import type { Insight } from '@/shared/calc/insights';

export interface InsightsView { today: string; items: Insight[] }
export interface PhrasedInsights { text: string | null; facts: string; reason: string | null; model: string | null }

export const insightsApi = {
  list:   () => api.get<InsightsView>('/v2/insights'),
  phrase: () => api.post<PhrasedInsights>('/v2/insights/phrase', {}),
};
