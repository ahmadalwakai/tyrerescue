/* ── Admin Agent – shared types ────────────────────────── */

/** All tool names the agent can invoke */
export type ToolName =
  // Read tools
  | 'get_today_bookings'
  | 'get_booking_by_ref'
  | 'get_recent_callbacks'
  | 'get_unread_messages'
  | 'get_stock_by_size'
  | 'get_low_stock_items'
  | 'get_inventory_summary'
  | 'get_driver_statuses'
  | 'get_pending_alerts'
  | 'get_today_sales_summary'
  | 'get_recent_audit_events'
  // Intelligence tools
  | 'get_business_insights'
  | 'get_weekly_comparison'
  // Write tools
  | 'update_stock_quantity'
  | 'mark_callback_done'
  | 'update_booking_status'
  | 'assign_driver_to_booking'
  | 'toggle_product_availability'
  | 'mark_message_read'
  | 'update_chat_settings'
  | 'add_inventory_product'
  // Phase 3: Invoice tools
  | 'create_invoice_draft'
  | 'get_invoice_by_number'
  // Phase 3: Quick-book tools
  | 'create_quick_booking'
  // Phase 3: Visitor analytics tools
  | 'get_visitor_analytics'
  | 'get_traffic_sources'
  | 'get_top_pages'
  | 'get_realtime_visitors'
  | 'get_conversion_funnel'
  | 'get_demand_signals'
  // Phase 3: Advanced operational tools
  | 'get_today_revenue'
  | 'get_outstanding_payments'
  | 'get_refund_summary'
  | 'get_driver_performance'
  | 'get_driver_assignment_gaps'
  | 'get_popular_tyre_sizes'
  | 'get_customer_repeat_rate'
  | 'get_top_customers'
  | 'get_cancelled_bookings_analysis'
  | 'get_no_show_analysis'
  | 'get_peak_booking_hours'
  | 'get_service_demand_trends'
  | 'get_location_demand_heatmap'
  | 'get_admin_workload_summary'
  | 'get_payment_failures'
  | 'get_quote_to_booking_rate'
  | 'get_booking_completion_rate'
  | 'get_recent_admin_actions'
  | 'get_abandoned_booking_signals'
  | 'get_stock_movement_summary';

/** Whether the tool mutates state */
export type ToolKind = 'read' | 'write';

/** A single tool definition in the registry */
export type ToolDefinition = {
  name: ToolName;
  kind: ToolKind;
  description: string;
  requiresConfirmation: boolean;
  parameterNames: string[];
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

/** Context passed to every tool execution */
export type ToolContext = {
  userId: string;
  userRole: string;
  ipAddress?: string;
};

/** Result of a single tool execution */
export type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  warning?: string;
  /** For audit: snapshot before the change */
  before?: unknown;
  /** For audit: snapshot after the change */
  after?: unknown;
};

/** The planner output: one or more tool invocations with extracted params */
export type AgentPlan = {
  intent: string;
  tools: PlannedTool[];
  clarificationNeeded?: string;
  reasoning?: string;
};

export type PlannedTool = {
  toolName: ToolName;
  params: Record<string, unknown>;
};

/** A pending confirmation stored in the session */
export type PendingConfirmation = {
  id: string;
  createdAt: string;
  expiresAt: string;
  plan: AgentPlan;
  summary: string;
};

/** Extended session context for agent memory */
export type AgentSessionContext = {
  pendingConfirmation?: PendingConfirmation | null;
  lastToolResults?: { toolName: string; result: ToolResult; at: string }[];
  lastEntities?: { type: string; id: string; ref?: string }[];
  /** Locked language after admin's first reply (ar | en) */
  lang?: 'ar' | 'en';
};

/** A structured agent response to the client */
export type AgentResponse = {
  reply: string;
  sessionId: string;
  actions: AgentAction[];
  context?: AgentSessionContext;
};

export type AgentAction =
  | { type: 'confirmation_required'; confirmationId: string; summary: string; details: ConfirmationDetail[] }
  | { type: 'executed'; results: ExecutionResultCard[] }
  | { type: 'data_table'; title: string; columns: string[]; rows: unknown[][] }
  | { type: 'data_list'; title: string; items: string[] }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }
  | { type: 'stock_update_preview'; items: StockPreviewItem[] }
  | { type: 'multi_step_plan'; planId: string; goal: string; steps: { label: string; status: 'pending' | 'done' | 'failed' }[]; riskLevel: RiskLevel; approvalRequired: boolean }
  | { type: 'intelligence_insight'; insights: IntelligenceInsight[] }
  // Phase 3: New action types
  | { type: 'invoice_preview'; invoice: InvoicePreviewData }
  | { type: 'booking_preview'; booking: BookingPreviewData }
  | { type: 'analytics_card'; title: string; metric: string; trend?: string; breakdown?: { label: string; value: string | number }[] };

export type ConfirmationDetail = {
  label: string;
  before?: string;
  after?: string;
};

export type ExecutionResultCard = {
  toolName: string;
  success: boolean;
  summary: string;
  before?: string;
  after?: string;
};

export type StockPreviewItem = {
  productId: string;
  display: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  currentStock: number;
  quantitySold: number;
  newStock: number;
};

/** Chat message stored in session */
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: AgentAction[];
};

/* ── Phase 2: Multi-step planning types ───────────────── */

/** Risk level assigned to a plan based on its tools & side-effects */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** A single step in a multi-step plan (may have dependencies) */
export type PlanStep = {
  stepIndex: number;
  toolName: ToolName;
  params: Record<string, unknown>;
  /** Description of what this step does */
  label: string;
  /** Indexes of steps that must complete before this one */
  dependsOn: number[];
  /** Whether this step needs explicit admin approval */
  requiresApproval: boolean;
};

/** Extended plan for multi-step operations */
export type MultiStepPlan = {
  goal: string;
  intent: string;
  steps: PlanStep[];
  riskLevel: RiskLevel;
  assumptions: string[];
  approvalRequired: boolean;
  reasoning?: string;
  clarificationNeeded?: string;
};

/** Execution status of a multi-step plan */
export type PlanExecutionState = {
  planId: string;
  plan: MultiStepPlan;
  completedSteps: number[];
  failedSteps: number[];
  currentStep: number | null;
  paused: boolean;
  /** Admin approval token for the current pause point */
  approvalToken?: string;
  startedAt: string;
  updatedAt: string;
};

/** Intelligence insight for the admin dashboard */
export type IntelligenceInsight = {
  id: string;
  category: 'anomaly' | 'bottleneck' | 'opportunity' | 'warning';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'urgent';
  suggestedAction?: string;
  relatedEntities?: { type: string; id: string; ref?: string }[];
  detectedAt: string;
};

/* ── Phase 3: Invoice preview data ───────────────────── */

export type InvoicePreviewData = {
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  items: { description: string; quantity: number; unitPrice: number; totalPrice: number }[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  notes?: string;
  dueDate?: string;
  status: string;
};

/* ── Phase 3: Booking preview data ───────────────────── */

export type BookingPreviewData = {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  tyreSizeDisplay?: string;
  quantity: number;
  addressLine: string;
  scheduledAt?: string;
  estimatedTotal: number;
  status: string;
};

/* ── Phase 3: Financial safety policies ──────────────── */

export type ActionPolicy = {
  toolName: ToolName;
  maxAmount?: number;
  requiresReason: boolean;
  requiresApproval: boolean;
  dailyLimit?: number;
  cooldownMs?: number;
};

/* ── Phase 3: Business recommendation ────────────────── */

export type Recommendation = {
  id: string;
  category: 'revenue' | 'operations' | 'inventory' | 'customer';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  suggestedAction?: string;
  dataPoints: Record<string, unknown>;
};
