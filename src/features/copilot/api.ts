import { api } from '@/lib/api';
import type { CopilotAnswer, CopilotAsk, CopilotSession, CopilotSessionSummary } from '@/shared/contracts/copilot';

export const copilotApi = {
  ask:      (b: CopilotAsk) => api.post<CopilotAnswer>('/v2/copilot/ask', b),
  sessions: () => api.get<{ items: CopilotSessionSummary[] }>('/v2/copilot/sessions'),
  session:  (id: string) => api.get<CopilotSession>(`/v2/copilot/sessions/${id}`),
};
