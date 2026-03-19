import { askGroqJSON } from '@/lib/groq';
import { buildPlannerPrompt } from './prompts';
import { allTools, toolMap } from './tools';
import type { AgentPlan, ToolName } from './types';
import { llmPlanSchema } from './schemas';

/* ── Deterministic pattern matchers (fallback when LLM fails) ── */

const IDENTITY_RE = /who(?:'?s?)\s*(created?|made|built|developed|makes?|builds?)\s+you|who(?:'s|\s+is)\s+your\s+(creator|developer|maker|builder)|your\s+(creator|developer|maker)|create(?:d)?\s+you/i;
const STOCK_CHECK_RE = /(?:check|show|get|what(?:'s|\s+is)?)\s+(?:stock|availability)\s+(?:for|of)?\s*(\d{3})\/?(\d{2})\/?R?(\d{2})/i;
const STOCK_SIZE_RE = /(\d{3})\/?(\d{2})\/?R?(\d{2})/;
const LOW_STOCK_RE = /low\s+stock|out\s+of\s+stock|running\s+low|stock\s+alert/i;
const STOCK_SUMMARY_RE = /how\s+many\s+tyr|total\s+stock|left\s+in|inventory\s+summary/i;
const REDUCE_STOCK_RE = /(?:reduce|decrease|subtract|sold|remove)\s+(?:stock\s+(?:for|of|by)\s+)?(\d{3})\/?(\d{2})\/?R?(\d{2})\s+(?:by|x|×)\s+(\d+)|(?:reduce|decrease|subtract|sold|remove)\s+(\d+)\s+(?:of|from|x)\s+(\d{3})\/?(\d{2})\/?R?(\d{2})/i;
const SALE_RE = /sold\s+(\d+)\s*(?:x\s*|of\s+)?(\d{3})\/(\d{2})\/R(\d{2})/i;
const TODAY_BOOKINGS_RE = /today(?:'?s)?\s+booking|booking.*today|new\s+booking|recent\s+booking/i;
const GET_BOOKING_RE = /(?:show|get|look\s*up|find|check)\s+booking\s+(TR-?\w+|\w+)/i;
const ALERTS_RE = /notification|alert|callback|pending|what.*miss/i;
const CALLBACK_DONE_RE = /(?:mark|set|resolve)\s+callback\s+(?:as\s+)?(?:done|resolved|complete)/i;
const BOOKING_STATUS_RE = /(?:change|set|update|move)\s+(?:booking\s+)?(TR-?\w+)\s+(?:to|status\s+to)\s+(\w+)/i;
const ASSIGN_DRIVER_RE = /assign\s+(?:driver\s+)?([a-f0-9-]+)\s+to\s+(?:booking\s+)?(TR-?\w+)|assign\s+(?:driver\s+to\s+)?(?:booking\s+)?(TR-?\w+)/i;
const DRIVER_STATUS_RE = /driver.*status|who.*online|which\s+driver/i;
const SALES_SUMMARY_RE = /sales\s+summary|today.*sales|revenue|how\s+much.*sold/i;
const AUDIT_RE = /audit\s+log|recent\s+action|what.*happened|activity\s+log/i;
const UNREAD_MESSAGES_RE = /unread\s+message|new\s+message|contact\s+message/i;
const CANCEL_BOOKING_RE = /cancel\s+(?:booking\s+)?(TR-?\w+)/i;
const DELETE_BOOKING_RE = /delete\s+(?:booking\s+)?(TR-?\w+)/i;
const CONFIRM_BOOKING_RE = /confirm\s+(?:booking\s+)?(TR-?\w+)/i;
const CREATE_BOOKING_RE = /(?:create|make|add|new)\s+(?:a\s+)?(?:new\s+)?booking/i;
const ADD_INVENTORY_RE = /(?:add|create|new)\s+(?:a\s+)?(?:new\s+)?(?:tyre|tire|product)\s+(?:to\s+)?(?:inventory|stock|catalogue)/i;
const SET_STOCK_RE = /(?:set|update)\s+stock\s+(?:for\s+)?(\d{3})\/?(\d{2})\/?R?(\d{2})\s+(?:to|=)\s*(\d+)/i;

/**
 * Try to build a plan deterministically from pattern matching.
 * Returns null if no pattern matches.
 */
function deterministicPlan(message: string): AgentPlan | null {
  const msg = message.trim();
  let m: RegExpMatchArray | null;

  // Identity
  if (IDENTITY_RE.test(msg)) {
    return { intent: 'identity', tools: [] };
  }

  // Cancel booking
  m = msg.match(CANCEL_BOOKING_RE);
  if (m) {
    return {
      intent: 'cancel_booking',
      tools: [{ toolName: 'update_booking_status', params: { ref: m[1], newStatus: 'cancelled' } }],
    };
  }

  // Delete booking → lookup to show error (bookings cannot be deleted, only cancelled)
  m = msg.match(DELETE_BOOKING_RE);
  if (m) {
    return {
      intent: 'delete_booking',
      tools: [{ toolName: 'get_booking_by_ref', params: { ref: m[1] } }],
      reasoning: 'Bookings cannot be deleted — only cancelled. Looking up booking to show status.',
    };
  }

  // Confirm booking → lookup
  m = msg.match(CONFIRM_BOOKING_RE);
  if (m) {
    return {
      intent: 'confirm_booking',
      tools: [{ toolName: 'get_booking_by_ref', params: { ref: m[1] } }],
      reasoning: 'Looking up booking to determine appropriate next status.',
    };
  }

  // Create booking → no tool, explain
  if (CREATE_BOOKING_RE.test(msg)) {
    return {
      intent: 'create_booking_explain',
      tools: [],
      clarificationNeeded: 'Bookings are created through the customer-facing booking wizard on the website, which handles location, tyre selection, scheduling, and Stripe payment. I can help you look up or manage existing bookings instead.',
    };
  }

  // Add tyre to inventory
  if (ADD_INVENTORY_RE.test(msg)) {
    return {
      intent: 'add_inventory_product',
      tools: [{ toolName: 'add_inventory_product', params: {} }],
      clarificationNeeded: 'To add a tyre, I need: brand, pattern name, size (width/aspect/rim), season (summer/winter/allseason), and price. For example: "add Budget Economy 205/55/R16 allseason at £49.99"',
    };
  }

  // Set stock to exact value: "set stock for 205/55/R16 to 10"
  m = msg.match(SET_STOCK_RE);
  if (m) {
    return {
      intent: 'stock_set',
      tools: [{ toolName: 'get_stock_by_size', params: { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) } }],
      reasoning: `Set stock for ${m[1]}/${m[2]}/R${m[3]} to ${m[4]}. Need to look up products first.`,
    };
  }

  // Reduce stock with quantity
  m = msg.match(REDUCE_STOCK_RE);
  if (m) {
    // Pattern 1: reduce XXX/XX/RXX by N
    if (m[1]) {
      return {
        intent: 'stock_reduction',
        tools: [
          // First look up stock to get productId
          { toolName: 'get_stock_by_size', params: { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) } },
        ],
        reasoning: `Reduce stock for ${m[1]}/${m[2]}/R${m[3]} by ${m[4]}. Need to look up products first.`,
      };
    }
    // Pattern 2: reduce N of XXX/XX/RXX
    if (m[5]) {
      return {
        intent: 'stock_reduction',
        tools: [
          { toolName: 'get_stock_by_size', params: { width: Number(m[6]), aspect: Number(m[7]), rim: Number(m[8]) } },
        ],
        reasoning: `Reduce stock for ${m[6]}/${m[7]}/R${m[8]} by ${m[5]}. Need to look up products first.`,
      };
    }
  }

  // Sold N of XXX/XX/RXX
  m = msg.match(SALE_RE);
  if (m) {
    return {
      intent: 'stock_reduction',
      tools: [
        { toolName: 'get_stock_by_size', params: { width: Number(m[2]), aspect: Number(m[3]), rim: Number(m[4]) } },
      ],
      reasoning: `Sold ${m[1]} of ${m[2]}/${m[3]}/R${m[4]}. Lookup products first.`,
    };
  }

  // Low stock
  if (LOW_STOCK_RE.test(msg)) {
    return { intent: 'low_stock_check', tools: [{ toolName: 'get_low_stock_items', params: {} }] };
  }

  // Stock summary
  if (STOCK_SUMMARY_RE.test(msg)) {
    return { intent: 'inventory_summary', tools: [{ toolName: 'get_inventory_summary', params: {} }] };
  }

  // Stock check for a specific size
  m = msg.match(STOCK_CHECK_RE);
  if (m) {
    return { intent: 'stock_lookup', tools: [{ toolName: 'get_stock_by_size', params: { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) } }] };
  }

  // Any message with a tyre size + stock-related word
  if (/stock/i.test(msg) && STOCK_SIZE_RE.test(msg)) {
    const sm = msg.match(STOCK_SIZE_RE)!;
    return { intent: 'stock_lookup', tools: [{ toolName: 'get_stock_by_size', params: { width: Number(sm[1]), aspect: Number(sm[2]), rim: Number(sm[3]) } }] };
  }

  // Booking status change
  m = msg.match(BOOKING_STATUS_RE);
  if (m) {
    return {
      intent: 'booking_status_change',
      tools: [{ toolName: 'update_booking_status', params: { ref: m[1], newStatus: m[2] } }],
    };
  }

  // Get specific booking
  m = msg.match(GET_BOOKING_RE);
  if (m) {
    return { intent: 'booking_lookup', tools: [{ toolName: 'get_booking_by_ref', params: { ref: m[1] } }] };
  }

  // Today's bookings
  if (TODAY_BOOKINGS_RE.test(msg)) {
    return { intent: 'today_bookings', tools: [{ toolName: 'get_today_bookings', params: {} }] };
  }

  // Driver status
  if (DRIVER_STATUS_RE.test(msg)) {
    return { intent: 'driver_status', tools: [{ toolName: 'get_driver_statuses', params: {} }] };
  }

  // Alerts
  if (ALERTS_RE.test(msg)) {
    return { intent: 'alerts', tools: [{ toolName: 'get_pending_alerts', params: {} }] };
  }

  // Mark callback done
  if (CALLBACK_DONE_RE.test(msg)) {
    // User didn't specify which callback — need to list them first
    return {
      intent: 'mark_callback_done',
      tools: [{ toolName: 'get_recent_callbacks', params: {} }],
      clarificationNeeded: 'Which callback would you like to mark as done? Let me show you the pending ones.',
    };
  }

  // Sales summary
  if (SALES_SUMMARY_RE.test(msg)) {
    return { intent: 'sales_summary', tools: [{ toolName: 'get_today_sales_summary', params: {} }] };
  }

  // Audit
  if (AUDIT_RE.test(msg)) {
    return { intent: 'audit_log', tools: [{ toolName: 'get_recent_audit_events', params: {} }] };
  }

  // Unread messages
  if (UNREAD_MESSAGES_RE.test(msg)) {
    return { intent: 'unread_messages', tools: [{ toolName: 'get_unread_messages', params: {} }] };
  }

  return null;
}

/**
 * Use the LLM to generate a plan from the admin's message.
 * Falls back to deterministic matching if the LLM fails.
 * Optional memoryContext provides entity/preference context for the LLM.
 */
export async function generatePlan(message: string, memoryContext?: string): Promise<AgentPlan> {
  // 1. Try deterministic patterns first (fast, no API call)
  const deterministicResult = deterministicPlan(message);
  if (deterministicResult) return deterministicResult;

  // 2. Call LLM for ambiguous/complex messages
  try {
    let systemPrompt = buildPlannerPrompt(allTools);
    if (memoryContext) {
      systemPrompt += `\n\nCONVERSATION CONTEXT:\n${memoryContext}`;
    }
    const raw = await askGroqJSON(systemPrompt, message, 600);
    if (!raw) throw new Error('LLM returned null');

    const parsed = llmPlanSchema.safeParse(raw);
    if (!parsed.success) throw new Error('Invalid plan schema');

    // Validate tool names exist
    const plan = parsed.data;
    const validTools = plan.tools.filter((t) => toolMap.has(t.toolName));
    if (validTools.length === 0 && !plan.clarificationNeeded) {
      // Model suggested invalid tools — fall to general help
      return { intent: 'general_help', tools: [] };
    }

    return {
      intent: plan.intent,
      tools: validTools.map((t) => ({ toolName: t.toolName as ToolName, params: t.params })),
      clarificationNeeded: plan.clarificationNeeded,
      reasoning: plan.reasoning,
    };
  } catch {
    // 3. LLM failed — return general help
    return { intent: 'general_help', tools: [] };
  }
}
