import { randomUUID } from 'crypto';
import type { AgentPlan, PendingConfirmation, AgentSessionContext, ConfirmationDetail } from './types';
import { toolMap } from './tools';

/** Confirmation tokens expire after 5 minutes */
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/**
 * Check whether a plan requires confirmation before execution.
 * Returns true if ANY tool in the plan has requiresConfirmation = true.
 */
export function planRequiresConfirmation(plan: AgentPlan): boolean {
  return plan.tools.some((t) => {
    const def = toolMap.get(t.toolName);
    return def?.requiresConfirmation === true;
  });
}

/**
 * Create a pending confirmation payload to store in session context.
 */
export function createPendingConfirmation(plan: AgentPlan, summary: string): PendingConfirmation {
  const now = new Date();
  return {
    id: randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONFIRMATION_TTL_MS).toISOString(),
    plan,
    summary,
  };
}

/**
 * Validate that a confirmationId matches the pending confirmation and hasn't expired.
 */
export function validateConfirmation(
  context: AgentSessionContext | undefined,
  confirmationId: string,
): { valid: boolean; error?: string; plan?: AgentPlan } {
  if (!context?.pendingConfirmation) {
    return { valid: false, error: 'No pending confirmation found. The action may have expired or was already executed.' };
  }

  const pending = context.pendingConfirmation;

  if (pending.id !== confirmationId) {
    return { valid: false, error: 'Confirmation ID does not match the pending action. It may have been superseded by a newer request.' };
  }

  if (new Date(pending.expiresAt) < new Date()) {
    return { valid: false, error: 'Confirmation has expired. Please re-issue the command.' };
  }

  return { valid: true, plan: pending.plan };
}

/**
 * Build confirmation detail cards from a plan for the UI.
 */
export function buildConfirmationDetails(plan: AgentPlan): ConfirmationDetail[] {
  return plan.tools.map((t) => {
    const def = toolMap.get(t.toolName);
    const label = def?.description ?? t.toolName;
    const paramSummary = Object.entries(t.params)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
    return { label: `${t.toolName}: ${paramSummary}` };
  });
}
