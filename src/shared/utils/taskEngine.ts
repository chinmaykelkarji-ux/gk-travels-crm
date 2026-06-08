// ============================================================
// GK TRAVELS CRM — OPERATIONAL TASK ENGINE
//
// Centralized rule table mapping quotation item categories to
// auto-generated operational tasks. Used when a quotation converts
// to a trip, so the CRM behaves like an execution engine rather
// than a data-entry tool.
//
// No `@/` runtime imports — must be importable from the server
// (tsx, no path-alias resolution) as well as the client.
// ============================================================

import type { TaskPriority, TaskStatus } from '../types/index.js';

export interface TaskTemplate {
  title:               string;
  priority:            TaskPriority;
  dueOffsetDays:       number;   // days BEFORE departure the task is due
  operationalCategory: string;
}

// Keyed by lower-cased QuotationItem.category. Synonyms ('cab'/'transfer',
// 'activity'/'sightseeing') map to the same template and are de-duped by title.
export const TASK_RULE_TABLE: Record<string, TaskTemplate> = {
  flight:      { title: 'Book flight tickets',          priority: 'high',   dueOffsetDays: 21, operationalCategory: 'flight' },
  hotel:       { title: 'Confirm hotel booking',        priority: 'high',   dueOffsetDays: 14, operationalCategory: 'hotel' },
  transfer:    { title: 'Arrange airport transfer',     priority: 'medium', dueOffsetDays: 3,  operationalCategory: 'transfer' },
  cab:         { title: 'Arrange airport transfer',     priority: 'medium', dueOffsetDays: 3,  operationalCategory: 'transfer' },
  activity:    { title: 'Confirm sightseeing vendor',   priority: 'medium', dueOffsetDays: 7,  operationalCategory: 'sightseeing' },
  sightseeing: { title: 'Confirm sightseeing vendor',   priority: 'medium', dueOffsetDays: 7,  operationalCategory: 'sightseeing' },
  visa:        { title: 'Collect visa documents',       priority: 'urgent', dueOffsetDays: 30, operationalCategory: 'visa' },
  insurance:   { title: 'Issue travel insurance',       priority: 'high',   dueOffsetDays: 10, operationalCategory: 'insurance' },
};

export function computeDueDate(departureISO?: string | null, offsetDays = 0): string | undefined {
  if (!departureISO) return undefined;
  const d = new Date(departureISO);
  if (isNaN(d.getTime())) return undefined;
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().split('T')[0];
}

export interface GeneratedTask {
  title:        string;
  description:  string;
  priority:     TaskPriority;
  dueDate?:     string;
  tripId:       string;
  customerId?:  string;
  status:       TaskStatus;
  createdDate:  string;
}

export function generateTasksFromCategories(opts: {
  categories:  string[];
  tripId:      string;
  customerId?: string | null;
  departure?:  string | null;
}): GeneratedTask[] {
  const today = new Date().toISOString().split('T')[0];
  const seen  = new Set<string>();
  const out: GeneratedTask[] = [];

  for (const cat of opts.categories) {
    const tpl = TASK_RULE_TABLE[cat.toLowerCase().trim()];
    if (!tpl || seen.has(tpl.title)) continue;
    seen.add(tpl.title);
    out.push({
      title:       tpl.title,
      description: `Auto-generated for trip ${opts.tripId} (${tpl.operationalCategory})`,
      priority:    tpl.priority,
      dueDate:     computeDueDate(opts.departure, tpl.dueOffsetDays),
      tripId:      opts.tripId,
      customerId:  opts.customerId ?? undefined,
      status:      'pending',
      createdDate: today,
    });
  }

  return out;
}
