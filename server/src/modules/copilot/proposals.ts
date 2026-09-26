// ============================================================
// Proposals — the only way the copilot's work reaches a record.
//
//   the model calls a write tool → ai_actions row, status PROPOSED
//   the person who asked presses Approve
//     → their permission for that tool is checked again
//     → the tool's `apply` runs the ordinary service, as that person
//     → status APPROVED, approvedById / approvedAt, what it created
//     → an audit row saying the copilot proposed it and who approved it
//   or presses Reject → status REJECTED, rejectedById / rejectedAt
//
// A proposal belongs to the conversation's owner: nobody else can see or
// approve it, and it can be decided once.
// ============================================================

import type { AiAction, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { hasPermission } from '../../lib/permissions.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import type { CopilotProposal, ProposalDecision, ProposalStatus } from '../../../../src/shared/contracts/copilot.js';
import { TOOL_BY_NAME, type ProposalResult } from './tools.js';

export interface Decider { userId: string; role: string }

export function proposalView(a: AiAction): CopilotProposal {
  const out = (a.output ?? {}) as { proposed?: Record<string, unknown> & { summary?: string } };
  const proposed = out.proposed ?? {};
  const { summary, ...preview } = proposed;
  return {
    id: a.id, tool: a.tool, status: a.status as ProposalStatus, summary: summary ?? a.tool, preview,
    input: (a.input ?? {}) as Record<string, unknown>,
    result: (a.result ?? null) as CopilotProposal['result'],
    decidedAt: (a.approvedAt ?? a.rejectedAt)?.toISOString() ?? null,
  };
}

/** The proposals of one conversation, by the model's call id. */
export async function proposalsFor(sessionId: string): Promise<Map<string, CopilotProposal>> {
  const rows = await prisma.aiAction.findMany({ where: { sessionId, kind: 'write', callId: { not: null }, status: { not: 'DONE' } } });
  return new Map(rows.map(r => [r.callId!, proposalView(r)]));
}

async function mine(id: string, who: Decider) {
  const a = await prisma.aiAction.findFirst({ where: { id }, include: { session: { select: { userId: true } } } });
  if (!a || a.session.userId !== who.userId || a.kind !== 'write') throw notFound('Proposal');
  if (a.status !== 'PROPOSED') throw stateConflict(`This proposal is already ${a.status.toLowerCase()}`);
  return a;
}

export async function approveProposal(id: string, who: Decider, decision: ProposalDecision = {}): Promise<CopilotProposal> {
  const a = await mine(id, who);
  const tool = TOOL_BY_NAME.get(a.tool);
  if (!tool?.apply) throw stateConflict('This proposal can no longer be applied');
  if (!hasPermission(who.role as never, tool.permission)) {
    throw new AppError('FORBIDDEN', 403, `Approving this needs the ${tool.permission} permission`);
  }
  const original = (a.input ?? {}) as Record<string, unknown>;
  const edits = a.tool === 'draft_message'
    ? Object.fromEntries(Object.entries({ text: decision.text, subject: decision.subject }).filter(([, v]) => v !== undefined))
    : {};
  const input = tool.input.safeParse({ ...original, ...edits });
  if (!input.success) throw new AppError('VALIDATION_ERROR', 400, input.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));

  // Claim it first, so a double click cannot create two records.
  const claimed = await prisma.aiAction.updateMany({ where: { id, status: 'PROPOSED' }, data: { status: 'APPROVING' } });
  if (!claimed.count) throw stateConflict('This proposal is already being saved');

  let result: ProposalResult;
  try {
    result = await tool.apply(input.data as never, { userId: who.userId, role: who.role });
  } catch (err) {
    await prisma.aiAction.update({ where: { id }, data: { status: 'PROPOSED' } });
    throw err;
  }
  const edited = Object.keys(edits).length ? { editedInput: input.data } : {};
  const summary = proposalView(a).summary;
  const row = await prisma.$transaction(async tx => {
    const updated = await tx.aiAction.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: who.userId, approvedAt: new Date(), result: { ...result, ...edited } as Prisma.InputJsonValue },
    });
    await audit(tx, {
      action: 'copilot_proposal_approved',
      entityType: result.type === 'message_draft' ? 'customer' : result.type,
      entityId: result.id ?? String(original.customerId ?? id),
      userId: who.userId, source: 'HUMAN',
      description: `${summary} — proposed by the copilot, approved by the user${result.type === 'message_draft' ? ' (not sent by TravelOS)' : ''}`,
      metadata: { aiActionId: id, tool: a.tool, edited: Object.keys(edits) },
    });
    return updated;
  });
  return proposalView(row);
}

export async function rejectProposal(id: string, who: Decider): Promise<CopilotProposal> {
  const a = await mine(id, who);
  const row = await prisma.$transaction(async tx => {
    const updated = await tx.aiAction.update({ where: { id }, data: { status: 'REJECTED', rejectedById: who.userId, rejectedAt: new Date() } });
    await audit(tx, {
      action: 'copilot_proposal_rejected', entityType: 'ai_action', entityId: id, userId: who.userId, source: 'HUMAN',
      description: `${proposalView(a).summary} — proposed by the copilot, rejected`, metadata: { tool: a.tool },
    });
    return updated;
  });
  return proposalView(row);
}

/** For the model's next turn: what the person decided since it proposed. */
export async function decidedSince(sessionId: string): Promise<string[]> {
  const rows = await prisma.aiAction.findMany({ where: { sessionId, kind: 'write', status: { in: ['APPROVED', 'REJECTED'] } }, orderBy: { createdAt: 'asc' } });
  return rows.map(r => `- ${proposalView(r).summary}: ${r.status === 'APPROVED' ? 'approved and saved' : 'rejected by the person'}`);
}
