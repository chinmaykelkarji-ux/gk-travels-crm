// ============================================================
// Validation middleware — zod at the edge, typed data inside.
//
//   router.post('/', validate({ body: CreateCustomerSchema }), (req, res) => {
//     const input = valid<CreateCustomer>(res).body;
//   });
//
// Unknown keys are stripped (zod's default for objects), so a client cannot
// smuggle server-owned columns into a service call (audit finding E3).
// Parsed values live on res.locals.valid because Express 5 makes req.query a
// read-only getter.
// ============================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ZodError } from 'zod';

export interface ValidationSchemas<B extends ZodTypeAny = ZodTypeAny, Q extends ZodTypeAny = ZodTypeAny, P extends ZodTypeAny = ZodTypeAny> {
  body?:   B;
  query?:  Q;
  params?: P;
}

export interface Validated<B = unknown, Q = unknown, P = unknown> {
  body:   B;
  query:  Q;
  params: P;
}

export function validate<B extends ZodTypeAny, Q extends ZodTypeAny, P extends ZodTypeAny>(
  schemas: ValidationSchemas<B, Q, P>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const out: Validated = { body: req.body, query: req.query, params: req.params };
      if (schemas.body)   out.body   = schemas.body.parse(req.body ?? {});
      if (schemas.query)  out.query  = schemas.query.parse(req.query ?? {});
      if (schemas.params) out.params = schemas.params.parse(req.params ?? {});
      res.locals.valid = out;
      next();
    } catch (err) {
      // Let the global handler turn the ZodError into the 400 envelope.
      next(err instanceof ZodError ? err : err);
    }
  };
}

/** Typed accessor for what validate() parsed. */
export function valid<B = unknown, Q = unknown, P = unknown>(res: Response): Validated<B, Q, P> {
  const v = res.locals.valid as Validated<B, Q, P> | undefined;
  if (!v) throw new Error('valid() called on a route without validate()');
  return v;
}

export type Infer<T extends ZodTypeAny> = z.infer<T>;
