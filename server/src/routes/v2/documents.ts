// ============================================================
// Documents v2 — the document centre's API.
//
//   POST   /api/v2/documents               register a file → presigned upload
//   POST   /api/v2/documents/:id/versions   a newer copy of the same document
//   POST   /api/v2/documents/:id/complete  confirm the upload landed
//   GET    /api/v2/documents               list (entity, type, status, search,
//                                          expiring, older versions)
//   GET    /api/v2/documents/:id           metadata, links and versions
//   GET    /api/v2/documents/:id/download  short-lived signed URL
//   PATCH  /api/v2/documents/:id           title, type, expiry, visibility, notes
//   POST   /api/v2/documents/:id/links     attach to an entity
//   DELETE /api/v2/documents/:id/links/:linkId
//   DELETE /api/v2/documents/:id           only while unprocessed
//
// Every response goes through the tenant-scoped client, so a document of
// another organisation is a 404. Files are never served by this router.
// ============================================================

import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { requirePermission } from '../../lib/permissions.js';
import { validate, valid } from '../../core/validate.js';
import {
  DocumentCreate, DocumentLinkInput, DocumentListQuery, DocumentUpdate, DocumentVersionCreate,
} from '../../../../src/shared/contracts/documents.js';
import * as svc from '../../modules/documents/service.js';

const router = Router();
router.use(requireAuth);
const p = (req: AuthRequest, k = 'id') => String(req.params[k]);

router.post('/', requirePermission('documents:write'), validate({ body: DocumentCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.registerDocument(valid<DocumentCreate>(res).body, req.userId));
});

router.post('/:id/versions', requirePermission('documents:write'), validate({ body: DocumentVersionCreate }), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.registerVersion(p(req), valid<DocumentVersionCreate>(res).body, req.userId));
});

router.post('/:id/complete', requirePermission('documents:write'), async (req: AuthRequest, res) => {
  res.json(await svc.completeUpload(p(req)));
});

router.get('/', requirePermission('documents:read'), validate({ query: DocumentListQuery }), async (_req, res) => {
  res.json(await svc.listDocuments(valid<unknown, DocumentListQuery>(res).query));
});

router.get('/:id', requirePermission('documents:read'), async (req: AuthRequest, res) => {
  res.json(await svc.getDocument(p(req)));
});

router.get('/:id/download', requirePermission('documents:read'), async (req: AuthRequest, res) => {
  // `?inline=true` is for showing the document beside its proposal; the
  // default still downloads, and either link lives for a minute.
  res.json(await svc.downloadLink(p(req), req.query.inline === 'true' ? 'inline' : 'attachment'));
});

router.patch('/:id', requirePermission('documents:write'), validate({ body: DocumentUpdate }), async (req: AuthRequest, res) => {
  res.json(await svc.updateDocument(p(req), valid<DocumentUpdate>(res).body, req.userId));
});

router.post('/:id/links', requirePermission('documents:write'), validate({ body: DocumentLinkInput }), async (req: AuthRequest, res) => {
  res.status(201).json(await svc.addLink(p(req), valid<DocumentLinkInput>(res).body));
});

router.delete('/:id/links/:linkId', requirePermission('documents:write'), async (req: AuthRequest, res) => {
  res.json(await svc.removeLink(p(req), p(req, 'linkId')));
});

router.delete('/:id', requirePermission('documents:write'), async (req: AuthRequest, res) => {
  res.json(await svc.deleteDocument(p(req), req.userId));
});

export default router;
