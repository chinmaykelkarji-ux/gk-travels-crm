import type { Prisma, PrismaClient } from '@prisma/client';
import { today } from '../../../src/shared/utils/date.js';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface ActivityInput {
  type:       string;
  message:    string;
  entityType: string;
  entityId:   string;
  userId?:    string | null;
  before?:    unknown;
  after?:     unknown;
}

// Single writer for ActivityLog — every operational/financial event that
// should appear in the global activity feed goes through here so the feed
// stays chronological and consistently shaped.
export async function logActivity(db: DbClient, input: ActivityInput) {
  const now = new Date();
  return db.activityLog.create({
    data: {
      type:       input.type,
      message:    input.message,
      entityType: input.entityType,
      entityId:   input.entityId,
      userId:     input.userId ?? undefined,
      timestamp:  now.toISOString(),
      date:       today(),
      before:     (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after:      (input.after  ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
