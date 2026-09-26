import { api } from '@/lib/api';
import type { CopilotAnswer, CopilotAsk, CopilotProposal, CopilotSession, CopilotSessionSummary, ProposalDecision } from '@/shared/contracts/copilot';

export const copilotApi = {
  ask:      (b: CopilotAsk) => api.post<CopilotAnswer>('/v2/copilot/ask', b),
  sessions: () => api.get<{ items: CopilotSessionSummary[] }>('/v2/copilot/sessions'),
  session:  (id: string) => api.get<CopilotSession>(`/v2/copilot/sessions/${id}`),
  approve:  (id: string, b: ProposalDecision = {}) => api.post<CopilotProposal>(`/v2/copilot/proposals/${id}/approve`, b),
  reject:   (id: string) => api.post<CopilotProposal>(`/v2/copilot/proposals/${id}/reject`, {}),
};
