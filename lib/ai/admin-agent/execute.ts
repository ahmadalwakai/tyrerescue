import { toolMap } from './tools';
import type { AgentPlan, ToolContext, ToolResult, ExecutionResultCard } from './types';

export type ExecutionOutput = {
  results: { toolName: string; result: ToolResult }[];
  cards: ExecutionResultCard[];
  allSucceeded: boolean;
};

/* ── Deduplication guard ── */

const recentExecutions = new Map<string, number>();
const DEDUP_WINDOW_MS = 5_000; // 5 seconds

function buildDedupeKey(plan: AgentPlan, userId: string): string {
  const toolPart = plan.tools
    .map((t) => `${t.toolName}:${JSON.stringify(t.params)}`)
    .join('|');
  return `${userId}:${plan.intent}:${toolPart}`;
}

/**
 * Execute all tools in a plan sequentially.
 * Includes deduplication guard to prevent double-execution.
 * Returns structured results for each tool.
 */
export async function executePlan(
  plan: AgentPlan,
  ctx: ToolContext,
  opts?: { skipDedup?: boolean },
): Promise<ExecutionOutput> {
  // Deduplication check
  if (!opts?.skipDedup) {
    const key = buildDedupeKey(plan, ctx.userId);
    const lastExec = recentExecutions.get(key);
    if (lastExec && Date.now() - lastExec < DEDUP_WINDOW_MS) {
      return {
        results: [],
        cards: [{ toolName: 'dedup_guard', success: false, summary: 'This action was already submitted. Please wait a moment before retrying.' }],
        allSucceeded: false,
      };
    }
    recentExecutions.set(key, Date.now());
    // Cleanup old entries periodically
    if (recentExecutions.size > 100) {
      const cutoff = Date.now() - DEDUP_WINDOW_MS;
      for (const [k, v] of recentExecutions) {
        if (v < cutoff) recentExecutions.delete(k);
      }
    }
  }

  const results: { toolName: string; result: ToolResult }[] = [];
  const cards: ExecutionResultCard[] = [];

  for (const planned of plan.tools) {
    const def = toolMap.get(planned.toolName);
    if (!def) {
      const fail: ToolResult = { success: false, error: `Unknown tool: ${planned.toolName}` };
      results.push({ toolName: planned.toolName, result: fail });
      cards.push({ toolName: planned.toolName, success: false, summary: fail.error! });
      continue;
    }

    try {
      const result = await def.execute(planned.params, ctx);

      // Post-action verification for write tools
      if (def.kind === 'write' && result.success && result.after) {
        const verified = await verifyPostAction(planned.toolName, planned.params, result);
        if (!verified.success) {
          result.warning = verified.warning;
        }
      }

      results.push({ toolName: planned.toolName, result });
      cards.push({
        toolName: planned.toolName,
        success: result.success,
        summary: result.success
          ? formatResultSummary(planned.toolName, result)
          : (result.error ?? 'Unknown error'),
        before: result.before ? JSON.stringify(result.before) : undefined,
        after: result.after ? JSON.stringify(result.after) : undefined,
      });

      // Add warning to card if post-verification flagged something
      if (result.warning) {
        cards[cards.length - 1].summary += ` (Warning: ${result.warning})`;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Execution error';
      results.push({ toolName: planned.toolName, result: { success: false, error: errorMsg } });
      cards.push({ toolName: planned.toolName, success: false, summary: errorMsg });
    }
  }

  return {
    results,
    cards,
    allSucceeded: results.every((r) => r.result.success),
  };
}

/* ── Post-action verification ── */

async function verifyPostAction(
  toolName: string,
  params: Record<string, unknown>,
  result: ToolResult,
): Promise<{ success: boolean; warning?: string }> {
  try {
    const after = result.after as Record<string, unknown> | undefined;
    if (!after) return { success: true };

    switch (toolName) {
      case 'update_stock_quantity': {
        // Verify the stock value matches what we set
        const expected = after.stock;
        if (expected !== undefined && result.data) {
          const d = result.data as Record<string, unknown>;
          if (d.stockAfter !== expected) {
            return { success: false, warning: `Expected stock ${expected} but got ${d.stockAfter}` };
          }
        }
        return { success: true };
      }
      case 'update_booking_status': {
        const expected = after.status;
        if (expected && result.data) {
          const d = result.data as Record<string, unknown>;
          if (d.toStatus !== expected) {
            return { success: false, warning: `Expected status "${expected}" but got "${d.toStatus}"` };
          }
        }
        return { success: true };
      }
      default:
        return { success: true };
    }
  } catch {
    return { success: true }; // Don't fail the action if verification has an error
  }
}

function formatResultSummary(toolName: string, result: ToolResult): string {
  if (!result.data) return 'Done';
  const d = result.data as Record<string, unknown>;

  switch (toolName) {
    case 'update_stock_quantity':
      return `${d.brand} ${d.size}: ${d.stockBefore} → ${d.stockAfter}`;
    case 'mark_callback_done':
      return `Callback from ${d.name} (${d.phone}) marked resolved`;
    case 'update_booking_status':
      return `${d.ref}: ${d.fromStatus} → ${d.toStatus}`;
    case 'assign_driver_to_booking':
      return `Driver assigned to ${d.ref} (status: ${d.newStatus})`;
    case 'toggle_product_availability':
      return `${d.brand} ${d.size}: ${d.available ? 'enabled' : 'disabled'}`;
    case 'mark_message_read':
      return `Message marked as read`;
    case 'update_chat_settings':
      return `Settings updated: ${(d.updated as string[]).join(', ')}`;
    case 'add_inventory_product':
      return `Added ${d.brand} ${d.pattern} ${d.sizeDisplay} at £${d.priceNew} (stock: ${d.stockNew})`;
    default:
      return 'Done';
  }
}
