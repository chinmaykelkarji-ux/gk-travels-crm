import { api } from '@/lib/api';

export interface AiFeatureStatus { provider: string; model: string; configured: boolean; hint: string | null }
export interface AiStatus {
  extraction: AiFeatureStatus;
  prose: AiFeatureStatus;
  copilot: AiFeatureStatus;
  storage: { configured: boolean; hint: string | null };
  ready: boolean;
}

export const aiApi = {
  status: () => api.get<AiStatus>('/v2/ai/status'),
};
