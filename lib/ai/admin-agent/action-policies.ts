/* ── Zyphon – Action Policies / Financial Safety (Phase 3) ── */

import type { ActionPolicy, ToolName, AgentPlan, RiskLevel } from './types';

/* ── Policy registry ──────────────────────────────────── */

const policies: ActionPolicy[] = [
  // Invoice creation — always requires approval, financial
  {
    toolName: 'create_invoice_draft',
    requiresReason: false,
    requiresApproval: true,
    dailyLimit: 50,
  },
  // Quick booking — always requires approval
  {
    toolName: 'create_quick_booking',
    requiresReason: false,
    requiresApproval: true,
    dailyLimit: 30,
  },
  // Stock updates — financial, cooldown to prevent spam
  {
    toolName: 'update_stock_quantity',
    requiresReason: true,
    requiresApproval: true,
    cooldownMs: 3000,
  },
  // Booking status changes — operational
  {
    toolName: 'update_booking_status',
    requiresReason: false,
    requiresApproval: true,
  },
  // Driver assignment — operational
  {
    toolName: 'assign_driver_to_booking',
    requiresReason: false,
    requiresApproval: true,
  },
  // Product availability — operational
  {
    toolName: 'toggle_product_availability',
    requiresReason: false,
    requiresApproval: true,
  },
  // Add product — financial
  {
    toolName: 'add_inventory_product',
    requiresReason: false,
    requiresApproval: true,
  },
];

const policyMap = new Map<string, ActionPolicy>(
  policies.map((p) => [p.toolName, p]),
);

/* ── Policy checks ────────────────────────────────────── */

export function getPolicy(toolName: ToolName): ActionPolicy | undefined {
  return policyMap.get(toolName);
}

/**
 * Validate an action plan against policies.
 * Returns list of policy violations.
 */
export function validatePolicies(plan: AgentPlan): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const tool of plan.tools) {
    const policy = policyMap.get(tool.toolName);
    if (!policy) continue;

    // Check if reason is required but missing
    if (policy.requiresReason && !tool.params.reason) {
      violations.push({
        toolName: tool.toolName,
        rule: 'requires_reason',
        message: `${tool.toolName} requires a reason to be provided`,
      });
    }
  }

  return violations;
}

/**
 * Classify the financial risk of a plan (extends the existing risk classification).
 */
export function classifyFinancialRisk(plan: AgentPlan): RiskLevel {
  const financialTools = ['create_invoice_draft', 'create_quick_booking', 'update_stock_quantity', 'add_inventory_product'];
  const hasFinancial = plan.tools.some((t) => financialTools.includes(t.toolName));
  const hasMultipleWrites = plan.tools.filter((t) => {
    const policy = policyMap.get(t.toolName);
    return policy?.requiresApproval;
  }).length > 1;

  if (hasFinancial && hasMultipleWrites) return 'critical';
  if (hasFinancial) return 'high';
  if (hasMultipleWrites) return 'medium';
  return 'low';
}

/* ── Types ────────────────────────────────────────────── */

export type PolicyViolation = {
  toolName: string;
  rule: string;
  message: string;
};
