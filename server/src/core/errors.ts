// ============================================================
// Errors — one envelope for every failure the API returns.
//
//   { error: { code, message, fields?, requestId } }
//
// Services throw AppError (or a subclass helper); routes never build error
// bodies themselves. The global handler maps zod and Prisma failures too, and
// never echoes internal details on 500s (docs/travelos/01-audit.md E7).
//
// Backward compatibility: the SPA's getApiErrorMessage() already understands
// both the legacy `{ error: "string" }` shape and this object shape.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { getContext } from './requestContext.js';

export type ErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'CONFLICT' | 'STATE_CONFLICT' | 'RATE_LIMITED' | 'NOT_CONFIGURED'
  | 'PAYLOAD_TOO_LARGE' | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest   = (message: string, fields?: Record<string, string>) => new AppError('VALIDATION_ERROR', 400, message, fields);
export const unauthorized = (message = 'Authentication required') => new AppError('UNAUTHENTICATED', 401, message);
export const forbidden    = (message = 'You do not have permission to do this') => new AppError('FORBIDDEN', 403, message);
export const notFound     = (what = 'Record') => new AppError('NOT_FOUND', 404, `${what} not found`);
export const conflict     = (message: string) => new AppError('CONFLICT', 409, message);
export const stateConflict = (message: string) => new AppError('STATE_CONFLICT', 409, message);
export const notConfigured = (feature: string) => new AppError('NOT_CONFIGURED', 503, `${feature} is not configured on this server`);

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

interface ErrorBody {
  error: { code: ErrorCode; message: string; fields?: Record<string, string>; requestId?: string };
}

/** Maps any thrown value to (status, body). Exported for tests. */
export function toErrorResponse(err: unknown): { status: number; body: ErrorBody } {
  const requestId = getContext()?.requestId;

  if (isAppError(err)) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, fields: err.fields, requestId } } };
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
    return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fields, requestId } } };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | undefined)?.join(', ');
        return { status: 409, body: { error: { code: 'CONFLICT', message: target ? `A record with the same ${target} already exists` : 'Duplicate record', requestId } } };
      }
      case 'P2003':
      case 'P2014':
        return { status: 409, body: { error: { code: 'CONFLICT', message: 'Related records still reference this record', requestId } } };
      case 'P2025':
        return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Record not found', requestId } } };
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid data for this record', requestId } } };
  }

  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    return { status: 413, body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large', requestId } } };
  }

  return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong on our side. Quote the request id when reporting it.', requestId } } };
}

// ── Global Express error handler ──────────────────────────────

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const { status, body } = toErrorResponse(err);
  if (status >= 500) {
    console.error(`[${body.error.requestId ?? '-'}] UNHANDLED`, err);
  } else if (status !== 404 && status !== 401 && status !== 403) {
    console.warn(`[${body.error.requestId ?? '-'}] ${status} ${body.error.code}: ${body.error.message}`);
  }
  if (res.headersSent) return;
  res.status(status).json(body);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found', requestId: getContext()?.requestId } });
}
