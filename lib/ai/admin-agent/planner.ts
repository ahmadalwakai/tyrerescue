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
const GET_BOOKING_RE = /(?:show|get|look\s*up|find|check)\s+booking\s+(TR-?\w+)/i;
const ALERTS_RE = /notification|alert|callback|pending|what.*miss/i;
const CALLBACK_DONE_RE = /(?:mark|set|resolve)\s+callback\s+(?:as\s+)?(?:done|resolved|complete)/i;
const BOOKING_STATUS_RE = /(?:change|set|update|move)\s+(?:booking\s+)?(TR-?\w+)\s+(?:to|status\s+to)\s+(\w+)/i;
const ASSIGN_DRIVER_RE = /assign\s+(?:driver\s+)?([a-f0-9-]+)\s+to\s+(?:booking\s+)?(TR-?\w+)|assign\s+(?:driver\s+to\s+)?(?:booking\s+)?(TR-?\w+)/i;
const DRIVER_STATUS_RE = /driver.*status|who.*online|which\s+driver/i;
const SALES_SUMMARY_RE = /sales\s+summary|today.*sales|how\s+much.*sold/i;
const AUDIT_RE = /audit\s+log|recent\s+action|what.*happened|activity\s+log/i;
const UNREAD_MESSAGES_RE = /unread\s+message|new\s+message|contact\s+message/i;
const CANCEL_BOOKING_RE = /cancel\s+(?:booking\s+)?(TR-?\w+)/i;
const DELETE_BOOKING_RE = /delete\s+(?:booking\s+)?(TR-?\w+)/i;
const CONFIRM_BOOKING_RE = /confirm\s+(?:booking\s+)?(TR-?\w+)/i;
const CREATE_BOOKING_RE = /(?:create|make|add|new)\s+(?:a\s+)?(?:new\s+)?booking/i;
const QUICK_BOOK_RE = /(?:quick\s+book|book\s+(?:a\s+)?(?:puncture|tyre|tire|fit|repair|assess)|book\s+(?:for|a)\s+)/i;
const ADD_INVENTORY_RE = /(?:add|create|new)\s+(?:a\s+)?(?:new\s+)?(?:tyre|tire|product)\s+(?:to\s+)?(?:inventory|stock|catalogue)/i;
const SET_STOCK_RE = /(?:set|update)\s+stock\s+(?:for\s+)?(\d{3})\/?(\d{2})\/?R?(\d{2})\s+(?:to|=)\s*(\d+)/i;
const INSIGHTS_RE = /(?:insight|anomal|bottleneck|issue|problem|what.*wrong|health\s+check|business\s+health|intelligence)/i;
const WEEKLY_RE = /(?:week(?:ly)?\s+(?:comparison|report|summary|stats)|compare.*week|this\s+week\s+vs|vs\s+last\s+week|week\s+over\s+week)/i;

/* ── Phase 3: New deterministic patterns ──────────────── */
const INVOICE_CREATE_RE = /(?:create|make|generate|new)\s+(?:an?\s+)?invoice/i;
const INVOICE_LOOKUP_RE = /(?:show|get|find|look\s*up|check)\s+invoice\s+(INV-\d{4}-\d{4})/i;
const VISITOR_ANALYTICS_RE = /(?:visitor|traffic|website)\s+(?:analytics|stats|statistics|data|numbers)/i;
const TRAFFIC_SOURCE_RE = /(?:traffic|referr(?:er|al)|organic|social|direct)\s+(?:source|breakdown|where.*come|channel)/i;
const TOP_PAGES_RE = /(?:top|most\s+visited|popular)\s+page/i;
const REALTIME_RE = /(?:real\s*time|who.*online\s+now|live\s+visitor|online\s+visitor|who.*(?:on\s+the\s+)?(?:site|website)\s+now|(?:how\s+many|any)\s+visitor.*(?:right\s+now|now|currently))/i;
const CONVERSION_RE = /(?:conversion|funnel|drop\s*off|bounce)/i;
const DEMAND_RE = /(?:demand\s+signal|hourly\s+pattern|search\s+keyword|demand\s+pattern)/i;
const REVENUE_RE = /(?:today(?:'s)?\s+revenue|how\s+much.*(?:made|earned)|daily\s+revenue|total\s+revenue\s+today)/i;
const OUTSTANDING_RE = /(?:outstanding|unpaid|overdue)\s+(?:payment|invoice|balance)/i;
const REFUND_RE = /(?:refund|money\s+back)/i;
const DRIVER_PERF_RE = /driver\s+performance|driver\s+stats|how.*driver.*(?:doing|perform)/i;
const DRIVER_GAPS_RE = /(?:unassigned|waiting\s+(?:for\s+)?driver|driver\s+gap|need\s+driver)/i;
const POPULAR_SIZES_RE = /(?:popular|best\s+selling|most\s+ordered|top)\s+(?:tyre|tire)\s+size/i;
const REPEAT_RATE_RE = /(?:repeat|return(?:ing)?)\s+(?:customer|rate|client)/i;
const TOP_CUSTOMERS_RE = /(?:top|best|vip|highest)\s+customer/i;
const CANCELLED_RE = /(?:cancel|cancellation)\s+(?:analysis|stats|rate|summary|reason)|(?:how\s+many|any).*booking.*cancel|booking.*cancel.*(?:why|reason|stats|summary)|cancel(?:led|lation)\s+booking/i;
const NO_SHOW_RE = /no[\s-]?show/i;
const PEAK_HOURS_RE = /(?:peak|busie?st?)\s+(?:hour|time|booking\s+time)/i;
const SERVICE_TRENDS_RE = /(?:service|type)\s+(?:demand|trends?|trending|breakdown|split)|service\s+types?\s+(?:are\s+)?trend/i;
const LOCATION_DEMAND_RE = /(?:location|area|city|postcode)\s+(?:demand|heatmap|breakdown|hotspot)/i;
const WORKLOAD_RE = /(?:workload|task.*pending|what.*do\s+today|admin\s+summary|open\s+task)/i;
const PAYMENT_FAIL_RE = /(?:payment|stripe)\s+(?:fail|error|issue)/i;
const QUOTE_RATE_RE = /quote.*(?:conversion|book|rate)|(?:conversion|book)\s+rate/i;
const COMPLETION_RATE_RE = /(?:completion|complete)\s+rate/i;
const ADMIN_ACTIONS_RE = /(?:admin|my)\s+(?:recent\s+)?action|what.*(?:I|admin)\s+(?:did|done)|admin\s+action|action.*(?:taken|performed|logged)/i;
const ABANDONED_RE = /(?:abandon(?:ed)?|incomplete|stuck)\s+booking|booking.*(?:abandon|stuck|incomplete)/i;
const STOCK_MOVEMENT_RE = /stock\s+movement|inventory\s+movement|what.*(?:sold|moved)/i;
const RECOMMEND_RE = /(?:recommend|suggest|what\s+should|tip|advice|what.*focus)/i;

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

  // Quick book via chat — "quick book puncture repair for Ahmed"
  if (QUICK_BOOK_RE.test(msg)) {
    return {
      intent: 'create_quick_booking',
      tools: [{ toolName: 'create_quick_booking', params: {} }],
      clarificationNeeded: 'To book, I need: customer name, phone number, and service type (fit/repair/assess). For example: "quick book tyre fit for Ahmed 07123456789"',
    };
  }

  // Create booking → route to quick-book
  if (CREATE_BOOKING_RE.test(msg)) {
    return {
      intent: 'create_quick_booking',
      tools: [{ toolName: 'create_quick_booking', params: {} }],
      clarificationNeeded: 'I can create a quick booking for you. I need: customer name, phone number, and service type (fit/repair/assess). What are the details?',
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

  // Business insights / anomalies
  if (INSIGHTS_RE.test(msg)) {
    return { intent: 'business_insights', tools: [{ toolName: 'get_business_insights' as ToolName, params: {} }] };
  }

  // Weekly comparison
  if (WEEKLY_RE.test(msg)) {
    return { intent: 'weekly_comparison', tools: [{ toolName: 'get_weekly_comparison' as ToolName, params: {} }] };
  }

  /* ── Phase 3: Invoice patterns ──────────────────────── */

  // Invoice lookup
  m = msg.match(INVOICE_LOOKUP_RE);
  if (m) {
    return { intent: 'invoice_lookup', tools: [{ toolName: 'get_invoice_by_number', params: { invoiceNumber: m[1] } }] };
  }

  // Invoice creation
  if (INVOICE_CREATE_RE.test(msg)) {
    return {
      intent: 'create_invoice',
      tools: [{ toolName: 'create_invoice_draft', params: {} }],
      clarificationNeeded: 'To create an invoice, I need: customer name, email, and items (description, quantity, price). For example: "create invoice for Ahmed ahmed@email.com — 2x puncture repair at £45"',
    };
  }

  /* ── Phase 3: Visitor analytics patterns ────────────── */

  if (REALTIME_RE.test(msg)) {
    return { intent: 'realtime_visitors', tools: [{ toolName: 'get_realtime_visitors', params: {} }] };
  }

  if (TRAFFIC_SOURCE_RE.test(msg)) {
    return { intent: 'traffic_sources', tools: [{ toolName: 'get_traffic_sources', params: {} }] };
  }

  if (TOP_PAGES_RE.test(msg)) {
    return { intent: 'top_pages', tools: [{ toolName: 'get_top_pages', params: {} }] };
  }

  if (CONVERSION_RE.test(msg)) {
    return { intent: 'conversion_funnel', tools: [{ toolName: 'get_conversion_funnel', params: {} }] };
  }

  if (DEMAND_RE.test(msg)) {
    return { intent: 'demand_signals', tools: [{ toolName: 'get_demand_signals', params: {} }] };
  }

  if (VISITOR_ANALYTICS_RE.test(msg)) {
    return { intent: 'visitor_analytics', tools: [{ toolName: 'get_visitor_analytics', params: {} }] };
  }

  /* ── Phase 3: Advanced operational patterns ─────────── */

  if (REVENUE_RE.test(msg)) {
    return { intent: 'today_revenue', tools: [{ toolName: 'get_today_revenue', params: {} }] };
  }

  if (OUTSTANDING_RE.test(msg)) {
    return { intent: 'outstanding_payments', tools: [{ toolName: 'get_outstanding_payments', params: {} }] };
  }

  if (REFUND_RE.test(msg)) {
    return { intent: 'refund_summary', tools: [{ toolName: 'get_refund_summary', params: {} }] };
  }

  if (DRIVER_PERF_RE.test(msg)) {
    return { intent: 'driver_performance', tools: [{ toolName: 'get_driver_performance', params: {} }] };
  }

  if (DRIVER_GAPS_RE.test(msg)) {
    return { intent: 'driver_assignment_gaps', tools: [{ toolName: 'get_driver_assignment_gaps', params: {} }] };
  }

  if (POPULAR_SIZES_RE.test(msg)) {
    return { intent: 'popular_tyre_sizes', tools: [{ toolName: 'get_popular_tyre_sizes', params: {} }] };
  }

  if (REPEAT_RATE_RE.test(msg)) {
    return { intent: 'customer_repeat_rate', tools: [{ toolName: 'get_customer_repeat_rate', params: {} }] };
  }

  if (TOP_CUSTOMERS_RE.test(msg)) {
    return { intent: 'top_customers', tools: [{ toolName: 'get_top_customers', params: {} }] };
  }

  if (CANCELLED_RE.test(msg)) {
    return { intent: 'cancelled_analysis', tools: [{ toolName: 'get_cancelled_bookings_analysis', params: {} }] };
  }

  if (NO_SHOW_RE.test(msg)) {
    return { intent: 'no_show_analysis', tools: [{ toolName: 'get_no_show_analysis', params: {} }] };
  }

  if (PEAK_HOURS_RE.test(msg)) {
    return { intent: 'peak_booking_hours', tools: [{ toolName: 'get_peak_booking_hours', params: {} }] };
  }

  if (SERVICE_TRENDS_RE.test(msg)) {
    return { intent: 'service_demand_trends', tools: [{ toolName: 'get_service_demand_trends', params: {} }] };
  }

  if (LOCATION_DEMAND_RE.test(msg)) {
    return { intent: 'location_demand', tools: [{ toolName: 'get_location_demand_heatmap', params: {} }] };
  }

  if (WORKLOAD_RE.test(msg)) {
    return { intent: 'admin_workload', tools: [{ toolName: 'get_admin_workload_summary', params: {} }] };
  }

  if (PAYMENT_FAIL_RE.test(msg)) {
    return { intent: 'payment_failures', tools: [{ toolName: 'get_payment_failures', params: {} }] };
  }

  if (QUOTE_RATE_RE.test(msg)) {
    return { intent: 'quote_to_booking_rate', tools: [{ toolName: 'get_quote_to_booking_rate', params: {} }] };
  }

  if (COMPLETION_RATE_RE.test(msg)) {
    return { intent: 'booking_completion_rate', tools: [{ toolName: 'get_booking_completion_rate', params: {} }] };
  }

  if (ADMIN_ACTIONS_RE.test(msg)) {
    return { intent: 'recent_admin_actions', tools: [{ toolName: 'get_recent_admin_actions', params: {} }] };
  }

  if (ABANDONED_RE.test(msg)) {
    return { intent: 'abandoned_bookings', tools: [{ toolName: 'get_abandoned_booking_signals', params: {} }] };
  }

  if (STOCK_MOVEMENT_RE.test(msg)) {
    return { intent: 'stock_movements', tools: [{ toolName: 'get_stock_movement_summary', params: {} }] };
  }

  if (RECOMMEND_RE.test(msg)) {
    return { intent: 'recommendations', tools: [{ toolName: 'get_business_insights' as ToolName, params: {} }] };
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
