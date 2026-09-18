import { PrismaClient } from '@prisma/client';
import type { ITXClientDenyList } from '@prisma/client/runtime/library';
import { tenantExtension } from '../core/tenant.js';

// Singleton to avoid multiple connections during hot-reload / serverless reuse.
const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

const base = globalForPrisma.prismaBase ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaBase = base;

/**
 * The application client. Every model that carries organizationId is scoped
 * to the organisation in the current request context (core/tenant.ts).
 */
export const prisma = base.$extends(tenantExtension());

/** The unscoped client — platform tooling and tests only. */
export const prismaUnscoped = base;

/** What services accept: the app client or an interactive-transaction client. */
export type DbClient = Omit<typeof prisma, ITXClientDenyList>;
