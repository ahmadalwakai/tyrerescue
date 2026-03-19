/* ── Admin Agent – Response Formatter ─────────────────── */
import { askGroq } from '@/lib/groq';
import { buildResponsePrompt, IDENTITY_RESPONSE } from './prompts';
import type { ToolResult, ExecutionResultCard } from './types';

/**
 * Format tool results into a natural admin-facing reply.
 * Uses LLM with fallback to structured text.
 */
export async function formatAgentResponse(
  intent: string,
  toolResults: { toolName: string; result: ToolResult }[],
  memoryContext?: string,
): Promise<string> {
  const resultSummary = toolResults.map((r) => {
    if (r.result.success) {
      return `Tool ${r.toolName} succeeded. Data: ${JSON.stringify(r.result.data)}`;
    }
    return `Tool ${r.toolName} failed: ${r.result.error}`;
  }).join('\n');

  const contextNote = memoryContext
    ? `\nContext:\n${memoryContext}\n`
    : '';

  try {
    const reply = await askGroq(
      buildResponsePrompt(),
      `Intent: ${intent}${contextNote}\nResults:\n${resultSummary}`,
      500,
    );
    if (reply && reply.length > 5) return reply;
  } catch { /* fall through to manual formatting */ }

  // Fallback: format without LLM
  return formatFallback(toolResults);
}

/** Structured fallback when Groq is unavailable */
function formatFallback(
  toolResults: { toolName: string; result: ToolResult }[],
): string {
  if (toolResults.length === 0) return 'No results.';

  const parts = toolResults.map((r) => {
    if (!r.result.success) return `Error (${r.toolName}): ${r.result.error}`;

    const data = r.result.data;
    if (!data) return `${r.toolName}: Done.`;

    if (Array.isArray(data)) {
      if (data.length === 0) return 'No results found.';
      const items = data.slice(0, 10).map((item: Record<string, unknown>) => {
        return formatDataRow(item);
      });
      return `Found ${data.length} item(s):\n${items.join('\n')}`;
    }

    return formatDataRow(data as Record<string, unknown>);
  });

  return parts.join('\n\n');
}

function formatDataRow(data: Record<string, unknown>): string {
  const entries = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      // Pretty-format known fields
      if (k === 'totalAmount' || k === 'totalRevenue' || k === 'priceNew') {
        return `${k}: £${Number(v).toFixed(2)}`;
      }
      if (k === 'scheduledAt' || k === 'createdAt' || k === 'locationAt') {
        return `${k}: ${new Date(String(v)).toLocaleString('en-GB')}`;
      }
      return `${k}: ${v}`;
    });
  return entries.join(' | ');
}

/**
 * Build a brief action confirmation preview from a plan.
 * Shown before execution so the admin knows what's about to happen.
 */
export function buildActionPreview(
  tools: { toolName: string; params: Record<string, unknown> }[],
): string {
  return tools.map((t) => {
    const paramStr = Object.entries(t.params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `${t.toolName}(${paramStr})`;
  }).join('\n');
}
