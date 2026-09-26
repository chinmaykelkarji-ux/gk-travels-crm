import { api } from '@/lib/api';
import type { CommOpened, CommPreview, CommSend, CommView } from '@/shared/contracts/comms';

export interface ChannelStatus { channel: 'WHATSAPP' | 'EMAIL'; provider: string; configured: boolean; hint: string | null }
export interface CommsStatus { whatsapp: ChannelStatus; email: ChannelStatus; webhook: { configured: boolean; hint: string | null } }

export const commsApi = {
  status:  () => api.get<CommsStatus>('/v2/communications/status'),
  log:     (q: { tripId?: string; customerId?: string }) => api.get<{ items: CommView[] }>('/v2/communications', q),
  preview: (b: CommSend) => api.post<CommPreview>('/v2/communications/preview', b),
  send:    (b: CommSend) => api.post<CommView>('/v2/communications/send', b),
  opened:  (b: CommOpened) => api.post<CommView>('/v2/communications/opened', b),
};
