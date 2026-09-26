// ============================================================
// Automation rules — the catalogue.
//
// A rule is a trigger (something TravelOS can see happening) and actions
// (send a message from a template, or notify people). The owner switches a
// rule on or off and tunes its numbers; TravelOS never invents a trigger.
// Rules that message customers ship switched OFF (decision P4-17): nothing
// is sent automatically until the owner says so. Only what happens after a
// rule is switched on is acted on, so switching one on never messages
// everyone at once for the past.
// Dependency-free: the settings screen and the engine share it.
// ============================================================

export type TriggerCode =
  | 'PAYMENT_DUE_BEFORE_DEPARTURE'
  | 'DEPARTS_TOMORROW'
  | 'SUPPLIER_UNCONFIRMED'
  | 'TICKET_WAITLISTED'
  | 'PAYMENT_RECEIVED'
  | 'TRIP_COMPLETED';

export type AutomationAction =
  | { type: 'send'; channel: 'WHATSAPP' | 'EMAIL'; templateKey: string }
  | { type: 'notify'; roles: string[] };

export interface ParamDef { key: string; label: string; min: number; max: number; list?: boolean }

export interface RuleDef {
  key: string;
  trigger: TriggerCode;
  name: string;
  /** What it does, in the words the owner reads on the settings screen. */
  description: string;
  params: ParamDef[];
  defaultParams: Record<string, number | number[]>;
  defaultActions: AutomationAction[];
  /** Messages customers: shipped switched off. */
  customerFacing: boolean;
  /** Replaces a rule of the classic scheduler. */
  replaces?: string;
}

export const AUTOMATION_RULES: RuleDef[] = [
  {
    key: 'payment_reminder', trigger: 'PAYMENT_DUE_BEFORE_DEPARTURE', name: 'Payment reminder before departure',
    description: 'When a confirmed trip still has money to collect, remind the customer this many days before it leaves.',
    params: [{ key: 'days', label: 'Days before departure', min: 1, max: 60, list: true }], defaultParams: { days: [7, 3, 1] },
    defaultActions: [{ type: 'send', channel: 'WHATSAPP', templateKey: 'payment_reminder' }], customerFacing: true,
    replaces: 'Classic scheduler: payment reminder at 7/3/1 days',
  },
  {
    key: 'departure_reminder', trigger: 'DEPARTS_TOMORROW', name: 'Departure reminder',
    description: 'The day before a trip leaves, send the customer the pickup point and time.',
    params: [], defaultParams: {}, defaultActions: [{ type: 'send', channel: 'WHATSAPP', templateKey: 'departure_reminder' }], customerFacing: true,
    replaces: 'Classic scheduler: departure reminder the day before',
  },
  {
    key: 'supplier_unconfirmed', trigger: 'SUPPLIER_UNCONFIRMED', name: 'Supplier not confirmed',
    description: 'Tell the team when a hotel, vehicle or service is still not confirmed this many hours before it starts.',
    params: [{ key: 'hours', label: 'Hours before the service', min: 6, max: 240 }], defaultParams: { hours: 48 },
    defaultActions: [{ type: 'notify', roles: ['ADMIN', 'OPERATIONS'] }], customerFacing: false,
    replaces: 'Classic scheduler: supplier confirmation alert at 48 hours',
  },
  {
    key: 'ticket_waitlisted', trigger: 'TICKET_WAITLISTED', name: 'Ticket still waitlisted',
    description: 'Tell the team when a ticket is still waitlisted, RAC or part confirmed this many days before travel.',
    params: [{ key: 'days', label: 'Days before travel', min: 1, max: 30 }], defaultParams: { days: 3 },
    defaultActions: [{ type: 'notify', roles: ['ADMIN', 'BOOKING', 'OPERATIONS'] }], customerFacing: false,
  },
  {
    key: 'payment_received', trigger: 'PAYMENT_RECEIVED', name: 'Thank you for the payment',
    description: 'When money from a customer is recorded, thank them with the amount and the receipt number.',
    params: [], defaultParams: {}, defaultActions: [{ type: 'send', channel: 'WHATSAPP', templateKey: 'payment_received' }], customerFacing: true,
  },
  {
    key: 'feedback_request', trigger: 'TRIP_COMPLETED', name: 'Ask for feedback',
    description: 'When a trip is marked completed, ask the customer for feedback on their page.',
    params: [], defaultParams: {}, defaultActions: [{ type: 'send', channel: 'WHATSAPP', templateKey: 'feedback_request' }], customerFacing: true,
  },
];
export const AUTOMATION_BY_KEY = new Map(AUTOMATION_RULES.map(r => [r.key, r]));

/** The numbers a rule runs with: the owner's, where valid, else the defaults. */
export function effectiveParams(def: RuleDef, stored: Record<string, unknown> | null | undefined): Record<string, number | number[]> {
  const out: Record<string, number | number[]> = { ...def.defaultParams };
  for (const p of def.params) {
    const v = stored?.[p.key];
    if (p.list && Array.isArray(v) && v.length && v.every(n => Number.isInteger(n) && n >= p.min && n <= p.max)) out[p.key] = [...new Set(v as number[])].sort((a, b) => b - a);
    else if (!p.list && Number.isInteger(v) && (v as number) >= p.min && (v as number) <= p.max) out[p.key] = v as number;
  }
  return out;
}

/** What is wrong with the numbers the owner typed, per field. Empty means fine. */
export function validateParams(def: RuleDef, params: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const p = def.params.find(x => x.key === k);
    if (!p) { errors[k] = 'This rule has no such setting'; continue; }
    const values = p.list ? (Array.isArray(v) ? v : [v]) : [v];
    if (!values.length || !values.every(n => Number.isInteger(n) && (n as number) >= p.min && (n as number) <= p.max)) errors[k] = `Use whole numbers from ${p.min} to ${p.max}`;
    if (!p.list && Array.isArray(v)) errors[k] = 'One number only';
  }
  return errors;
}

export function describeAction(a: AutomationAction): string {
  return a.type === 'send'
    ? `Send "${a.templateKey.replace(/_/g, ' ')}" by ${a.channel === 'WHATSAPP' ? 'WhatsApp' : 'email'}`
    : `Notify ${a.roles.map(r => ({ ADMIN: 'the owner', BOOKING: 'sales', OPERATIONS: 'operations', ACCOUNTS: 'accounts' } as Record<string, string>)[r] ?? r).join(', ')}`;
}

export type RunOutcome = { ok: boolean; skipped?: boolean; detail: string };
/** A run is DONE when every action did its job, SKIPPED when none could apply, FAILED otherwise. */
export function runStatus(outcomes: RunOutcome[]): 'DONE' | 'SKIPPED' | 'FAILED' {
  if (outcomes.length && outcomes.every(o => o.skipped)) return 'SKIPPED';
  return outcomes.every(o => o.ok || o.skipped) ? 'DONE' : 'FAILED';
}
