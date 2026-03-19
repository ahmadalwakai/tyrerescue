import { toolMap } from './tools';
import type { AgentPlan, ToolContext, ToolResult, ExecutionResultCard } from './types';

export type ExecutionOutput = {
  results: { toolName: string; result: ToolResult }[];
  cards: ExecutionResultCard[];
  allSucceeded: boolean;
};

/**
 * Execute all tools in a plan sequentially.
 * Returns structured results for each tool.
 */
export async function executePlan(plan: AgentPlan, ctx: ToolContext): Promise<ExecutionOutput> {
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
    default:
      return 'Done';
  }
}
