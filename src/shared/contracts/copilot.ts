// ============================================================
// The copilot, as the screen and the API both see it.
//
// A conversation is a list of messages. Under every answer the screen shows
// what the copilot looked at to give it (`looked`), in plain words, so a
// person can open the same screen and check the number themselves.
// ============================================================

import { z } from 'zod';

export const CopilotAsk = z.object({
  message: z.string().trim().min(1, 'Type a question').max(2000, 'Keep the question under 2000 characters'),
  sessionId: z.string().max(64).optional(),
});
export type CopilotAsk = z.infer<typeof CopilotAsk>;

export const PROPOSAL_STATUS = ['PROPOSED', 'APPROVING', 'APPROVED', 'REJECTED'] as const;
export type ProposalStatus = typeof PROPOSAL_STATUS[number];

/** Something the copilot proposed. Nothing is saved until the person who asked approves it. */
export interface CopilotProposal {
  id: string;
  tool: string;
  status: ProposalStatus;
  summary: string;
  /** What the preview showed: the task, the message, the trip changes. */
  preview: Record<string, unknown>;
  input: Record<string, unknown>;
  result: { type: string; id: string | null; label: string; link: string | null; external?: boolean } | null;
  decidedAt: string | null;
}

/** One thing the copilot looked at to answer, or proposed. */
export interface CopilotLook {
  tool: string;
  label: string;
  ok: boolean;
  /** Why it could not look — never an internal error. */
  note?: string | null;
  proposal?: CopilotProposal | null;
}

export type CopilotMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; looked: CopilotLook[] };

export const ProposalDecision = z.object({
  /** Only the message wording can be edited before approving; everything else is approved as proposed. */
  text: z.string().trim().min(2).max(3000).optional(),
  subject: z.string().trim().max(200).optional().nullable(),
});
export type ProposalDecision = z.infer<typeof ProposalDecision>;

export interface CopilotSessionSummary {
  id: string;
  title: string;
  messages: number;
  updatedAt: string;
}

export interface CopilotSession extends CopilotSessionSummary {
  model: string;
  transcript: CopilotMessage[];
}

export interface CopilotAnswer {
  sessionId: string;
  title: string;
  answer: CopilotMessage & { role: 'assistant' };
  /** True when it ran out of steps before it could finish. */
  stoppedEarly: boolean;
  model: string;
}

/** What each tool is called on screen. Unknown tools fall back to their name. */
export const TOOL_LABELS: Record<string, string> = {
  search_trips: 'Searched the trips',
  get_trip: 'Opened a trip',
  search_customers: 'Searched the customers',
  get_customer: 'Opened a customer',
  get_open_tasks: 'Read the open tasks',
  get_money_summary: 'Read the money summary',
  get_receivables: 'Read who owes us',
  get_trip_profit: 'Read a trip\'s profit',
  get_supplier_dues: 'Read what we owe suppliers',
  find_documents: 'Searched the documents',
  get_documents_to_check: 'Read documents waiting to be checked',
  search_enquiries: 'Searched the enquiries',
  create_task: 'Proposed a task',
  create_followup: 'Proposed a follow-up',
  draft_message: 'Drafted a message',
  propose_trip_update: 'Proposed a trip change',
};

export const toolLabel = (tool: string) => TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ');
