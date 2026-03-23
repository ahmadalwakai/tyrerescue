/* ── Zyphon – Agent Audit Trail ───────────────────────── */
import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';
import { desc, eq, and, gte, sql } from 'drizzle-orm';
import type { AgentPlan, MultiStepPlan, RiskLevel } from './types';
import type { ExecutionOutput } from './execute';

/**
 * Log an agent plan execution to the audit trail.
 */
export async function logAgentAction(
  userId: string,
  plan: AgentPlan,
  output: ExecutionOutput,
  riskLevel: RiskLevel = 'low',
): Promise<void> {
  for (const result of output.results) {
    const entityType = inferEntityTypeFromTool(result.toolName);
    const entityId = extractEntityId(result);

    await db.insert(auditLogs).values({
      actorUserId: userId,
      actorRole: 'admin',
      entityType,
      entityId: entityId ?? 'agent',
      action: `agent:${result.toolName}`,
      beforeJson: result.result.before ?? null,
      afterJson: {
        success: result.result.success,
        ...(result.result.after ? { data: result.result.after } : {}),
        intent: plan.intent,
        riskLevel,
      },
    });
  }
}

/**
 * Get recent agent audit entries for a specific user.
 */
export async function getAgentAuditLog(
  userId: string,
  limit = 20,
): Promise<{
  action: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date | null;
  afterJson: unknown;
}[]> {
  const rows = await db
    .select({
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
      afterJson: auditLogs.afterJson,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorUserId, userId),
        sql`${auditLogs.action} LIKE 'agent:%'`,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows;
}

/* ── Helpers ──────────────────────────────────────────── */

function inferEntityTypeFromTool(toolName: string): string {
  if (toolName.includes('booking')) return 'booking';
  if (toolName.includes('stock') || toolName.includes('inventory') || toolName.includes('product') || toolName.includes('availability')) return 'tyre_product';
  if (toolName.includes('callback')) return 'callback';
  if (toolName.includes('message')) return 'contact_message';
  if (toolName.includes('driver')) return 'driver';
  if (toolName.includes('settings')) return 'settings';
  return 'agent';
}

function extractEntityId(result: { toolName: string; result: { data?: unknown } }): string | undefined {
  if (!result.result.data) return undefined;
  const d = result.result.data as Record<string, unknown>;
  if (typeof d.id === 'string') return d.id;
  if (typeof d.ref === 'string') return d.ref;
  if (typeof d.productId === 'string') return d.productId;
  if (typeof d.messageId === 'string') return d.messageId;
  return undefined;
}
