import { api, type Page, type Query } from '@/lib/api';
import type {
  DocumentCreate, DocumentListQuery, DocumentLinkInput, DocumentStatus, DocumentType, DocumentUpdate, DocumentVersionCreate,
} from '@/shared/contracts/documents';

export interface DocumentLink { id: string; documentId: string; entityType: string; entityId: string; role: string | null; createdAt: string }

export interface DocumentRow {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  uploadedAt: string | null;
  expiresAt: string | null;
  version: number;
  previousVersionId: string | null;
  customerVisible: boolean;
  notes: string | null;
  createdAt: string;
  links: DocumentLink[];
}

export interface DocumentDetail extends DocumentRow {
  versions: { id: string; version: number; fileName: string; uploadedAt: string | null; status: DocumentStatus }[];
}

interface Presigned { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string }
interface Registered { document: DocumentRow; upload: Presigned }

/**
 * Register → PUT straight to storage → confirm. The file never travels
 * through the API, so a 20 MB scan is not held in a request.
 */
async function uploadWith(registered: Registered, file: File): Promise<DocumentRow> {
  const put = await fetch(registered.upload.url, { method: 'PUT', headers: registered.upload.headers, body: file, credentials: 'same-origin' });
  if (!put.ok) throw new Error(`The file could not be stored (${put.status}). Nothing was saved.`);
  return api.post<DocumentRow>(`/v2/documents/${registered.document.id}/complete`);
}

export const documentsApi = {
  list: (q: Partial<DocumentListQuery> = {}) => api.get<Page<DocumentRow>>('/v2/documents', q as Query),
  get:  (id: string) => api.get<DocumentDetail>(`/v2/documents/${id}`),

  upload: async (body: DocumentCreate, file: File) =>
    uploadWith(await api.post<Registered>('/v2/documents', body), file),

  uploadVersion: async (id: string, body: DocumentVersionCreate, file: File) =>
    uploadWith(await api.post<Registered>(`/v2/documents/${id}/versions`, body), file),

  update: (id: string, body: DocumentUpdate) => api.patch<DocumentRow>(`/v2/documents/${id}`, body),
  remove: (id: string) => api.delete<{ ok: true }>(`/v2/documents/${id}`),

  addLink:    (id: string, body: DocumentLinkInput) => api.post<DocumentLink>(`/v2/documents/${id}/links`, body),
  removeLink: (id: string, linkId: string) => api.delete<{ ok: true }>(`/v2/documents/${id}/links/${linkId}`),

  /** A link that lives for a minute — never stored, never shared. */
  downloadUrl: (id: string, inline = false) => api.get<{ url: string; expiresAt: string }>(`/v2/documents/${id}/download`, { inline }),
};
