import { api } from '@/lib/api';

export interface ChannelStatus { channel: 'WHATSAPP' | 'EMAIL'; provider: string; configured: boolean; hint: string | null }
export interface CommsStatus { whatsapp: ChannelStatus; email: ChannelStatus; webhook: { configured: boolean; hint: string | null } }

export const commsApi = {
  status: () => api.get<CommsStatus>('/v2/communications/status'),
};
