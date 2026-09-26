// Feedback a customer leaves on their page. One per customer per trip; they may change it.
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import type { PortalFeedback } from '../../../../src/shared/contracts/portal.js';
import { notify } from '../notifications/service.js';
import { portalTrip } from './readModel.js';

export async function giveFeedback(customerId: string, tripId: string, input: PortalFeedback, portalAccessId: string) {
  const view = await portalTrip(customerId, tripId);                     // also proves the trip is theirs
  if (!view.canGiveFeedback) throw new AppError('STATE_CONFLICT', 409, 'Feedback opens once the trip has started');
  const row = await prisma.$transaction(async tx => {
    const f = await tx.feedback.upsert({
      where: { organizationId_tripId_customerId: { organizationId: (await tx.trip.findUniqueOrThrow({ where: { id: tripId }, select: { organizationId: true } })).organizationId, tripId, customerId } },
      create: { tripId, customerId, rating: input.rating, comments: input.comments, portalAccessId },
      update: { rating: input.rating, comments: input.comments, portalAccessId },
    });
    await audit(tx, {
      action: 'portal_feedback', entityType: 'trip', entityId: tripId, userId: null, source: 'HUMAN',
      description: `Customer feedback from their page: ${input.rating}/5${input.comments ? ` — ${input.comments.slice(0, 200)}` : ''}`,
      metadata: { customerId, portalAccessId },
    });
    await notify({ roles: ['ADMIN'], type: 'feedback', title: `Feedback for ${view.trip.name}: ${input.rating}/5`, body: input.comments, link: `/trips/${tripId}?tab=messages`, entityType: 'trip', entityId: tripId, dedupeKey: `feedback:${f.id}:${f.updatedAt.getTime()}` }, tx);
    return f;
  });
  return { rating: row.rating, comments: row.comments, at: row.updatedAt.toISOString() };
}

export async function feedbackFor(q: { tripId?: string; customerId?: string }) {
  const rows = await prisma.feedback.findMany({ where: { ...(q.tripId ? { tripId: q.tripId } : {}), ...(q.customerId ? { customerId: q.customerId } : {}) }, orderBy: { updatedAt: 'desc' }, take: 100 });
  const names = new Map((await prisma.customer.findMany({ where: { id: { in: rows.map(r => r.customerId) } }, select: { id: true, name: true } })).map(c => [c.id, c.name]));
  return rows.map(r => ({ id: r.id, tripId: r.tripId, customerId: r.customerId, customer: names.get(r.customerId) ?? null, rating: r.rating, comments: r.comments, at: r.updatedAt.toISOString() }));
}
