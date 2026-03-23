import { randomUUID } from 'crypto';
import type { AgentPlan, PendingConfirmation, AgentSessionContext, ConfirmationDetail, RiskLevel, MultiStepPlan } from './types';
import { toolMap } from './tools';
import { classifyRisk } from './multi-step-planner';

/** Confirmation tokens expire after 5 minutes */
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/** Action categories for approval routing */
export type ActionCategory = 'read' | 'notify' | 'update' | 'financial' | 'destructive';

/**
 * Categorize a tool's action type for approval routing.
 */
export function categorizeAction(toolName: string): ActionCategory {
  const def = toolMap.get(toolName);
  if (!def || def.kind === 'read') return 'read';

  switch (toolName) {
    case 'update_stock_quantity':
      return 'financial';
    case 'update_booking_status':
      return toolName.includes('cancel') ? 'destructive' : 'update';
    case 'toggle_product_availability':
      return 'update';
    case 'mark_callback_done':
    case 'mark_message_read':
      return 'notify';
    case 'update_chat_settings':
      return 'notify';
    case 'assign_driver_to_booking':
      return 'update';
    case 'add_inventory_product':
      return 'financial';
    default:
      return def.requiresConfirmation ? 'update' : 'read';
  }
}

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
    const paramSummary = Object.entries(t.params)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
    return { label: `${t.toolName}: ${paramSummary}` };
  });
}

/**
 * Get the risk level for a plan (delegates to multi-step-planner).
 */
export function getPlanRiskLevel(plan: AgentPlan): RiskLevel {
  return classifyRisk(plan);
}

/**
 * Build a risk-aware confirmation summary with category breakdown.
 */
export function buildRiskSummary(plan: AgentPlan): {
  riskLevel: RiskLevel;
  categories: ActionCategory[];
  summary: string;
} {
  const risk = classifyRisk(plan);
  const categories = plan.tools.map((t) => categorizeAction(t.toolName));
  const uniqueCategories = [...new Set(categories)];

  const riskLabels: Record<RiskLevel, string> = {
    low: 'Low risk — read-only',
    medium: 'Medium risk — single write',
    high: 'High risk — multiple writes',
    critical: 'Critical — bulk or financial operation',
  };

  return {
    riskLevel: risk,
    categories: uniqueCategories,
    summary: riskLabels[risk],
  };
}
