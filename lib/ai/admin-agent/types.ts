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
  // Write tools
  | 'update_stock_quantity'
  | 'mark_callback_done'
  | 'update_booking_status'
  | 'assign_driver_to_booking'
  | 'toggle_product_availability'
  | 'mark_message_read'
  | 'update_chat_settings'
  | 'add_inventory_product';

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
  | { type: 'stock_update_preview'; items: StockPreviewItem[] };

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
