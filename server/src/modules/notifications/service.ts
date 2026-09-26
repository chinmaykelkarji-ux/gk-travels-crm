// ============================================================
// In-app notifications — what a person should know, under the bell.
//
// Raised by the modules that know something happened: a task assigned to
// you, a message you queued that could not be sent, a document you sent to
// be read that is waiting for you, an automation that failed (7.4). Each is
// for named people or everyone with a role; nobody is notified of their own
// act, and the same thing is never announced twice (`dedupeKey`).
// ============================================================

import type { Notification } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { notFound } from '../../core/errors.js';

export interface NotifyInput {
  userIds?: (string | null | undefined)[];
  roles?: string[];
  /** The person who caused it — never notified about their own act. */
  actorId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
}

export async function notify(input: NotifyInput, db: DbClient = prisma): Promise<number> {
  const ids = new Set(input.userIds?.filter((x): x is string => !!x) ?? []);
  if (input.roles?.length) {
    const users = await db.user.findMany({ where: { role: { in: input.roles as never[] }, isActive: true }, select: { id: true } });
    for (const u of users) ids.add(u.id);
  }
  if (input.actorId) ids.delete(input.actorId);
  if (!ids.size) return 0;
  const r = await db.notification.createMany({
    skipDuplicates: true,
    data: [...ids].map(userId => ({
      userId, type: input.type, title: input.title, body: input.body ?? null, link: input.link ?? null,
      entityType: input.entityType ?? null, entityId: input.entityId ?? null, dedupeKey: input.dedupeKey ?? null,
    })),
  });
  return r.count;
}

export interface NotificationView { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; at: string }
const view = (n: Notification): NotificationView => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.readAt, at: n.createdAt.toISOString() });

export async function listFor(userId: string) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { unread, items: items.map(view) };
}

export async function markRead(id: string, userId: string) {
  const n = await prisma.notification.findFirst({ where: { id, userId } });
  if (!n) throw notFound('Notification');
  if (!n.readAt) await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return listFor(userId);
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return listFor(userId);
}
