import { api } from '@/lib/api';
import type { TemplateCreate, TemplateUpdate, TemplateView } from '@/shared/contracts/templates';

export const templatesApi = {
  list:   () => api.get<{ items: TemplateView[] }>('/v2/templates'),
  create: (b: TemplateCreate) => api.post<TemplateView>('/v2/templates', b),
  update: (id: string, b: TemplateUpdate) => api.patch<TemplateView>(`/v2/templates/${id}`, b),
  reset:  (id: string) => api.post<TemplateView>(`/v2/templates/${id}/reset`, {}),
  remove: (id: string) => api.delete<void>(`/v2/templates/${id}`),
};
