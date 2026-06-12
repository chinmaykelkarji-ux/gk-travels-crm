import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';

// ── emitEvent ─────────────────────────────────────────────────
// Writes a durable, deduped event for the outbox worker to dispatch.
// If `idempotencyKey` is provided, the same (eventType, idempotencyKey)
// pair will never produce more than one event — re-emitting is a no-op.

export async function emitEvent(
  eventType: string,
  payload: Record<string, unknown>,
  options?: { scheduledFor?: Date; idempotencyKey?: string },
): Promise<void> {
  const key = `${eventType}:${options?.idempotencyKey ?? randomUUID()}`;

  await prisma.outboxEvent.upsert({
    where:  { idempotencyKey: key },
    update: {},
    create: {
      eventType,
      payload,
      status:         'PENDING',
      idempotencyKey: key,
      scheduledFor:   options?.scheduledFor ?? new Date(),
    },
  });
}
