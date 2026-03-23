/* ── Zyphon – Multi-step plan decomposition ──────────── */
import { randomUUID } from 'crypto';
import { toolMap } from './tools';
import { generatePlan } from './planner';
import type {
  AgentPlan,
  MultiStepPlan,
  PlanStep,
  PlanExecutionState,
  RiskLevel,
  ToolName,
} from './types';

/* ── Risk classification ────────────────────────────────── */

/** Tools that carry higher risk when combined */
const HIGH_RISK_TOOLS: Set<string> = new Set([
  'update_stock_quantity',
  'update_booking_status',
  'assign_driver_to_booking',
  'toggle_product_availability',
  'add_inventory_product',
]);

const FINANCIAL_TOOLS: Set<string> = new Set([
  'update_stock_quantity',
]);

/**
 * Classify the risk level of a plan based on its tools.
 *  - low: read-only tools
 *  - medium: single write tool
 *  - high: multiple write tools or financial tools
 *  - critical: bulk operations affecting >3 entities
 */
export function classifyRisk(plan: AgentPlan): RiskLevel {
  const writeTools = plan.tools.filter((t) => toolMap.get(t.toolName)?.kind === 'write');
  if (writeTools.length === 0) return 'low';

  const hasFinancial = writeTools.some((t) => FINANCIAL_TOOLS.has(t.toolName));
  const hasHighRisk = writeTools.some((t) => HIGH_RISK_TOOLS.has(t.toolName));

  if (writeTools.length >= 3) return 'critical';
  if (hasFinancial && writeTools.length > 1) return 'critical';
  if (writeTools.length >= 2 || hasHighRisk) return 'high';
  if (hasFinancial) return 'medium';
  return 'medium';
}

/* ── Multi-step plan detection ─────────────────────────── */

/** Patterns that suggest a multi-step request */
const MULTI_STEP_INDICATORS = [
  /\bthen\b/i,
  /\band\s+(?:also|then)\b/i,
  /\bafter\s+that\b/i,
  /\bfirst\b.*\bthen\b/i,
  /\bstep\s*\d/i,
  /\b(?:both|all)\s+(?:of\s+)?(?:the|these)\b/i,
];

/**
 * Check if a message implies multiple sequential steps.
 */
export function isMultiStep(message: string): boolean {
  return MULTI_STEP_INDICATORS.some((re) => re.test(message));
}

/* ── Multi-step plan builder ───────────────────────────── */

/**
 * Decompose an AgentPlan into a MultiStepPlan with dependency tracking.
 * Read tools run first (no approval), write tools depend on the reads.
 */
export function buildMultiStepPlan(
  basePlan: AgentPlan,
  goal: string,
): MultiStepPlan {
  const steps: PlanStep[] = [];
  const readIndexes: number[] = [];

  for (let i = 0; i < basePlan.tools.length; i++) {
    const t = basePlan.tools[i];
    const def = toolMap.get(t.toolName);
    const isWrite = def?.kind === 'write';

    steps.push({
      stepIndex: i,
      toolName: t.toolName as ToolName,
      params: t.params,
      label: def?.description ?? t.toolName,
      dependsOn: isWrite ? [...readIndexes] : [],
      requiresApproval: isWrite && (def?.requiresConfirmation ?? true),
    });

    if (!isWrite) readIndexes.push(i);
  }

  const risk = classifyRisk(basePlan);
  const approvalRequired = risk !== 'low' && steps.some((s) => s.requiresApproval);

  return {
    goal,
    intent: basePlan.intent,
    steps,
    riskLevel: risk,
    assumptions: basePlan.reasoning ? [basePlan.reasoning] : [],
    approvalRequired,
    reasoning: basePlan.reasoning,
    clarificationNeeded: basePlan.clarificationNeeded,
  };
}

/* ── Plan execution state management ───────────────────── */

/**
 * Create a fresh execution state for a multi-step plan.
 */
export function createPlanExecution(plan: MultiStepPlan): PlanExecutionState {
  const now = new Date().toISOString();
  return {
    planId: randomUUID(),
    plan,
    completedSteps: [],
    failedSteps: [],
    currentStep: null,
    paused: plan.approvalRequired,
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Get the next executable step (all dependencies met, not yet completed/failed).
 */
export function getNextStep(state: PlanExecutionState): PlanStep | null {
  for (const step of state.plan.steps) {
    if (state.completedSteps.includes(step.stepIndex)) continue;
    if (state.failedSteps.includes(step.stepIndex)) continue;

    const depsmet = step.dependsOn.every((d) => state.completedSteps.includes(d));
    if (!depsmet) continue;

    // If step requires approval and plan is paused, stop here
    if (step.requiresApproval && state.paused) return null;

    return step;
  }
  return null;
}

/**
 * Mark a step as completed.
 */
export function markStepDone(state: PlanExecutionState, stepIndex: number): PlanExecutionState {
  return {
    ...state,
    completedSteps: [...state.completedSteps, stepIndex],
    currentStep: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mark a step as failed.
 */
export function markStepFailed(state: PlanExecutionState, stepIndex: number): PlanExecutionState {
  return {
    ...state,
    failedSteps: [...state.failedSteps, stepIndex],
    currentStep: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Check if the plan is fully complete (all steps done or failed).
 */
export function isPlanComplete(state: PlanExecutionState): boolean {
  const total = state.plan.steps.length;
  return state.completedSteps.length + state.failedSteps.length >= total;
}
