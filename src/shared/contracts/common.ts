import { z } from 'zod';

/**
 * Boolean from a query string. z.coerce.boolean() treats "false" as true
 * (Boolean("false")), so query flags need an explicit parser.
 */
export const queryBool = z.preprocess(v => {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['false', '0', 'no', 'off', ''].includes(s)) return false;
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
  }
  return v;
}, z.boolean());
