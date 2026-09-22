import { api } from '@/lib/api';
import type { ExtractionApproval, ExtractionStatus } from '@/shared/contracts/extraction';
import type { DocumentType } from '@/shared/contracts/documents';

export interface MatchCandidate { id: string; label: string; score: number; why: string[] }

export interface Extraction {
  id: string;
  documentId: string;
  status: ExtractionStatus;
  step: string;
  kind: DocumentType | null;
  kindConfidence: string | null;
  kindReason: string | null;
  provider: string;
  model: string;
  fields: Record<string, unknown> | null;
  matches: { trip: MatchCandidate[]; vendor: MatchCandidate[] } | null;
  proposal: Record<string, unknown> | null;
  tripId: string | null;
  vendorId: string | null;
  appliedKind: string | null;
  appliedId: string | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  document?: { id: string; title: string; fileName: string; mimeType: string; type: DocumentType; status: string };
}

export const extractionApi = {
  read:        (documentId: string) => api.post<Extraction>(`/v2/documents/${documentId}/read`),
  forDocument: (documentId: string) => api.get<{ items: Extraction[] }>(`/v2/documents/${documentId}/extractions`),
  pending:     () => api.get<{ items: Extraction[]; total: number }>('/v2/extractions/pending'),
  get:         (id: string) => api.get<Extraction>(`/v2/extractions/${id}`),
  approve:     (id: string, body: ExtractionApproval) => api.post<Extraction>(`/v2/extractions/${id}/approve`, body),
  reject:      (id: string, reason: string) => api.post<Extraction>(`/v2/extractions/${id}/reject`, { reason }),
};
