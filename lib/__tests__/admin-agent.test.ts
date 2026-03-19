import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── 1. Planner: deterministic pattern matching ─────────── */

// We need to test the regex patterns without the LLM fallback.
// Import planner internals — the generatePlan function tries deterministic first,
// then falls to LLM. We mock the LLM to isolate pattern matching.
vi.mock('@/lib/groq', () => ({
  askGroq: vi.fn().mockResolvedValue(null),
  askGroqJSON: vi.fn().mockResolvedValue(null),
}));

// Mock the DB to prevent real connections
vi.mock('@/lib/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/db/schema', () => new Proxy({}, { get: (_, key) => key }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(), and: vi.fn(), sql: vi.fn(), gte: vi.fn(), desc: vi.fn(), lte: vi.fn(),
  exists: vi.fn(),
}));
vi.mock('@/lib/inventory/stock-service', () => ({
  adjustStock: vi.fn(),
}));
vi.mock('@/lib/state-machine', () => ({
  isValidTransition: vi.fn(),
  getValidNextStates: vi.fn(),
  executeTransition: vi.fn(),
}));

import { generatePlan } from '../ai/admin-agent/planner';
import { toolMap, allTools } from '../ai/admin-agent/tools';
import type { AgentPlan, AgentSessionContext, ToolContext, ToolResult } from '../ai/admin-agent/types';
import {
  planRequiresConfirmation,
  createPendingConfirmation,
  validateConfirmation,
  buildConfirmationDetails,
} from '../ai/admin-agent/safeguards';
import { executePlan } from '../ai/admin-agent/execute';
import { agentRequestSchema } from '../ai/admin-agent/schemas';

/* ── Intent / plan parsing ────────────────────────────────── */
describe('planner — deterministic patterns', () => {
  it('detects identity questions', async () => {
    const msgs = [
      "Who created you?",
      "who's your developer?",
      "who made you?",
      "Who built you?",
    ];
    for (const msg of msgs) {
      const plan = await generatePlan(msg);
      expect(plan.intent).toBe('identity');
      expect(plan.tools).toHaveLength(0);
    }
  });

  it('detects stock check by tyre size', async () => {
    const plan = await generatePlan('check stock for 205/55/R16');
    expect(plan.intent).toBe('stock_lookup');
    expect(plan.tools).toHaveLength(1);
    expect(plan.tools[0].toolName).toBe('get_stock_by_size');
    expect(plan.tools[0].params).toEqual({ width: 205, aspect: 55, rim: 16 });
  });

  it('handles size without R prefix', async () => {
    const plan = await generatePlan('show stock for 225/45/17');
    expect(plan.intent).toBe('stock_lookup');
    expect(plan.tools[0].params).toEqual({ width: 225, aspect: 45, rim: 17 });
  });

  it('detects low stock requests', async () => {
    const plan = await generatePlan("what's low stock?");
    expect(plan.intent).toBe('low_stock_check');
    expect(plan.tools[0].toolName).toBe('get_low_stock_items');
  });

  it('detects stock summary', async () => {
    const plan = await generatePlan('how many tyres left in inventory?');
    expect(plan.intent).toBe('inventory_summary');
    expect(plan.tools[0].toolName).toBe('get_inventory_summary');
  });

  it('detects reduce stock with tyre size and quantity', async () => {
    const plan = await generatePlan('reduce stock for 205/55/R16 by 3');
    expect(plan.intent).toBe('stock_reduction');
    expect(plan.tools[0].toolName).toBe('get_stock_by_size');
    expect(plan.tools[0].params).toEqual({ width: 205, aspect: 55, rim: 16 });
  });

  it('detects sale syntax', async () => {
    const plan = await generatePlan('sold 2 x 225/45/R17');
    expect(plan.intent).toBe('stock_reduction');
    expect(plan.tools[0].params).toEqual({ width: 225, aspect: 45, rim: 17 });
  });

  it('detects today bookings', async () => {
    const plan = await generatePlan("show today's bookings");
    expect(plan.intent).toBe('today_bookings');
    expect(plan.tools[0].toolName).toBe('get_today_bookings');
  });

  it('detects booking lookup by ref', async () => {
    const plan = await generatePlan('show booking TR-12345');
    expect(plan.intent).toBe('booking_lookup');
    expect(plan.tools[0].toolName).toBe('get_booking_by_ref');
    expect(plan.tools[0].params).toEqual({ ref: 'TR-12345' });
  });

  it('detects booking status change', async () => {
    const plan = await generatePlan('change TR-ABC123 to completed');
    expect(plan.intent).toBe('booking_status_change');
    expect(plan.tools[0].toolName).toBe('update_booking_status');
    expect(plan.tools[0].params).toEqual({ ref: 'TR-ABC123', newStatus: 'completed' });
  });

  it('detects driver status queries', async () => {
    const plan = await generatePlan('which drivers are online?');
    expect(plan.intent).toBe('driver_status');
    expect(plan.tools[0].toolName).toBe('get_driver_statuses');
  });

  it('detects alerts/notifications', async () => {
    const plan = await generatePlan('show pending notifications');
    expect(plan.intent).toBe('alerts');
    expect(plan.tools[0].toolName).toBe('get_pending_alerts');
  });

  it('detects sales summary', async () => {
    const plan = await generatePlan('show sales summary');
    expect(plan.intent).toBe('sales_summary');
    expect(plan.tools[0].toolName).toBe('get_today_sales_summary');
  });

  it('detects audit log queries', async () => {
    const plan = await generatePlan('show audit log');
    expect(plan.intent).toBe('audit_log');
    expect(plan.tools[0].toolName).toBe('get_recent_audit_events');
  });

  it('detects unread messages', async () => {
    const plan = await generatePlan('show unread messages');
    expect(plan.intent).toBe('unread_messages');
    expect(plan.tools[0].toolName).toBe('get_unread_messages');
  });

  it('falls back to general_help for unknown messages', async () => {
    // LLM is mocked to return null, so it should fallback
    const plan = await generatePlan('tell me a joke about tyres');
    expect(plan.intent).toBe('general_help');
    expect(plan.tools).toHaveLength(0);
  });
});

/* ── 2. Confirmation-required actions (safeguards) ─────────── */
describe('safeguards — confirmation flow', () => {
  it('planRequiresConfirmation returns true for write tools', () => {
    const plan: AgentPlan = {
      intent: 'stock_update',
      tools: [{ toolName: 'update_stock_quantity', params: { productId: 'x', newStock: 5 } }],
    };
    expect(planRequiresConfirmation(plan)).toBe(true);
  });

  it('planRequiresConfirmation returns false for read-only tools', () => {
    const plan: AgentPlan = {
      intent: 'stock_lookup',
      tools: [{ toolName: 'get_stock_by_size', params: { width: 205, aspect: 55, rim: 16 } }],
    };
    expect(planRequiresConfirmation(plan)).toBe(false);
  });

  it('planRequiresConfirmation returns true for booking status change', () => {
    const plan: AgentPlan = {
      intent: 'booking_status_change',
      tools: [{ toolName: 'update_booking_status', params: { ref: 'TR-123', newStatus: 'completed' } }],
    };
    expect(planRequiresConfirmation(plan)).toBe(true);
  });

  it('planRequiresConfirmation returns true for assign driver', () => {
    const plan: AgentPlan = {
      intent: 'assign_driver',
      tools: [{ toolName: 'assign_driver_to_booking', params: { ref: 'TR-123', driverId: 'abc' } }],
    };
    expect(planRequiresConfirmation(plan)).toBe(true);
  });

  it('planRequiresConfirmation returns false for no tools', () => {
    const plan: AgentPlan = { intent: 'identity', tools: [] };
    expect(planRequiresConfirmation(plan)).toBe(false);
  });

  it('createPendingConfirmation generates valid confirmation', () => {
    const plan: AgentPlan = {
      intent: 'stock_update',
      tools: [{ toolName: 'update_stock_quantity', params: { productId: 'x', newStock: 5 } }],
    };
    const confirmation = createPendingConfirmation(plan, 'Update stock to 5');
    expect(confirmation.id).toBeTruthy();
    expect(confirmation.summary).toBe('Update stock to 5');
    expect(confirmation.plan).toBe(plan);
    expect(new Date(confirmation.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // TTL should be ~5 minutes
    const diffMs = new Date(confirmation.expiresAt).getTime() - new Date(confirmation.createdAt).getTime();
    expect(diffMs).toBe(5 * 60 * 1000);
  });

  it('validateConfirmation succeeds with matching ID', () => {
    const plan: AgentPlan = { intent: 'test', tools: [] };
    const confirmation = createPendingConfirmation(plan, 'test');
    const ctx: AgentSessionContext = { pendingConfirmation: confirmation };
    const result = validateConfirmation(ctx, confirmation.id);
    expect(result.valid).toBe(true);
    expect(result.plan).toBe(plan);
  });

  it('validateConfirmation fails with wrong ID', () => {
    const plan: AgentPlan = { intent: 'test', tools: [] };
    const confirmation = createPendingConfirmation(plan, 'test');
    const ctx: AgentSessionContext = { pendingConfirmation: confirmation };
    const result = validateConfirmation(ctx, 'wrong-id');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not match');
  });

  it('validateConfirmation fails when no pending confirmation', () => {
    const ctx: AgentSessionContext = {};
    const result = validateConfirmation(ctx, 'some-id');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No pending confirmation');
  });

  it('validateConfirmation fails when expired', () => {
    const plan: AgentPlan = { intent: 'test', tools: [] };
    const confirmation = createPendingConfirmation(plan, 'test');
    // Force expiry to the past
    confirmation.expiresAt = new Date(Date.now() - 1000).toISOString();
    const ctx: AgentSessionContext = { pendingConfirmation: confirmation };
    const result = validateConfirmation(ctx, confirmation.id);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('buildConfirmationDetails returns detail per tool', () => {
    const plan: AgentPlan = {
      intent: 'multi',
      tools: [
        { toolName: 'update_stock_quantity', params: { productId: 'x', newStock: 5 } },
        { toolName: 'mark_callback_done', params: { callbackId: 'abc' } },
      ],
    };
    const details = buildConfirmationDetails(plan);
    expect(details).toHaveLength(2);
    expect(details[0].label).toContain('update_stock_quantity');
    expect(details[0].label).toContain('productId');
    expect(details[1].label).toContain('mark_callback_done');
  });
});

/* ── 3. Tool registry structure ──────────────────────────── */
describe('tool registry', () => {
  it('exports 18 tools', () => {
    expect(allTools).toHaveLength(18);
  });

  it('all tools have required fields', () => {
    for (const tool of allTools) {
      expect(tool.name).toBeTruthy();
      expect(['read', 'write']).toContain(tool.kind);
      expect(tool.description).toBeTruthy();
      expect(typeof tool.requiresConfirmation).toBe('boolean');
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('read tools do not require confirmation', () => {
    const readTools = allTools.filter((t) => t.kind === 'read');
    for (const tool of readTools) {
      expect(tool.requiresConfirmation).toBe(false);
    }
  });

  it('write tools that mutate require confirmation', () => {
    const writeTools = allTools.filter((t) => t.kind === 'write');
    // At minimum, stock update, booking status, assign driver, toggle availability require confirmation
    const mustConfirm = ['update_stock_quantity', 'update_booking_status', 'assign_driver_to_booking', 'toggle_product_availability'];
    for (const name of mustConfirm) {
      const tool = writeTools.find((t) => t.name === name);
      expect(tool).toBeTruthy();
      expect(tool!.requiresConfirmation).toBe(true);
    }
  });

  it('toolMap has all tools indexed by name', () => {
    expect(toolMap.size).toBe(18);
    for (const tool of allTools) {
      expect(toolMap.get(tool.name)).toBe(tool);
    }
  });
});

/* ── 4. Execute pipeline ──────────────────────────────────── */
describe('executePlan', () => {
  const ctx: ToolContext = { userId: 'admin-1', userRole: 'admin' };

  it('reports error for unknown tool', async () => {
    const plan: AgentPlan = {
      intent: 'test',
      tools: [{ toolName: 'nonexistent_tool' as any, params: {} }],
    };
    const out = await executePlan(plan, ctx);
    expect(out.allSucceeded).toBe(false);
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].success).toBe(false);
    expect(out.cards[0].summary).toContain('Unknown tool');
  });

  it('catches tool execution errors gracefully', async () => {
    // Temporarily inject a throwing tool
    const original = toolMap.get('get_today_bookings');
    const throwing = {
      ...original!,
      execute: async () => { throw new Error('DB connection failed'); },
    };
    toolMap.set('get_today_bookings', throwing);

    const plan: AgentPlan = {
      intent: 'test',
      tools: [{ toolName: 'get_today_bookings', params: {} }],
    };
    const out = await executePlan(plan, ctx);
    expect(out.allSucceeded).toBe(false);
    expect(out.cards[0].success).toBe(false);
    expect(out.cards[0].summary).toBe('DB connection failed');

    // Restore
    toolMap.set('get_today_bookings', original!);
  });

  it('handles successful tool execution', async () => {
    const original = toolMap.get('get_stock_by_size');
    const successTool = {
      ...original!,
      execute: async () => ({ success: true, data: { products: [{ brand: 'Budget', sizeDisplay: '205/55/R16', stockNew: 10 }] } } as ToolResult),
    };
    toolMap.set('get_stock_by_size', successTool);

    const plan: AgentPlan = {
      intent: 'stock_lookup',
      tools: [{ toolName: 'get_stock_by_size', params: { width: 205, aspect: 55, rim: 16 } }],
    };
    const out = await executePlan(plan, ctx);
    expect(out.allSucceeded).toBe(true);
    expect(out.cards[0].success).toBe(true);

    toolMap.set('get_stock_by_size', original!);
  });

  it('executes multiple tools sequentially', async () => {
    const order: string[] = [];
    const originalA = toolMap.get('get_today_bookings');
    const originalB = toolMap.get('get_driver_statuses');

    toolMap.set('get_today_bookings', {
      ...originalA!,
      execute: async () => { order.push('bookings'); return { success: true, data: [] }; },
    });
    toolMap.set('get_driver_statuses', {
      ...originalB!,
      execute: async () => { order.push('drivers'); return { success: true, data: [] }; },
    });

    const plan: AgentPlan = {
      intent: 'multi',
      tools: [
        { toolName: 'get_today_bookings', params: {} },
        { toolName: 'get_driver_statuses', params: {} },
      ],
    };
    const out = await executePlan(plan, ctx);
    expect(out.allSucceeded).toBe(true);
    expect(out.cards).toHaveLength(2);
    expect(order).toEqual(['bookings', 'drivers']);

    toolMap.set('get_today_bookings', originalA!);
    toolMap.set('get_driver_statuses', originalB!);
  });

  it('reports partial failure when one tool fails', async () => {
    const originalA = toolMap.get('get_today_bookings');
    const originalB = toolMap.get('get_driver_statuses');

    toolMap.set('get_today_bookings', {
      ...originalA!,
      execute: async () => ({ success: true, data: [] }),
    });
    toolMap.set('get_driver_statuses', {
      ...originalB!,
      execute: async () => { throw new Error('Network error'); },
    });

    const plan: AgentPlan = {
      intent: 'multi',
      tools: [
        { toolName: 'get_today_bookings', params: {} },
        { toolName: 'get_driver_statuses', params: {} },
      ],
    };
    const out = await executePlan(plan, ctx);
    expect(out.allSucceeded).toBe(false);
    expect(out.cards[0].success).toBe(true);
    expect(out.cards[1].success).toBe(false);

    toolMap.set('get_today_bookings', originalA!);
    toolMap.set('get_driver_statuses', originalB!);
  });
});

/* ── 5. Fallback safety when LLM fails ──────────────────── */
describe('planner — LLM fallback safety', () => {
  it('returns general_help when no pattern matches and LLM returns null', async () => {
    const plan = await generatePlan('explain quantum computing to me');
    expect(plan.intent).toBe('general_help');
    expect(plan.tools).toHaveLength(0);
  });

  it('never returns undefined or throws for empty input', async () => {
    const plan = await generatePlan('');
    expect(plan).toBeTruthy();
    expect(plan.intent).toBeTruthy();
  });

  it('never returns undefined for gibberish', async () => {
    const plan = await generatePlan('asdjfklasdjf klsadjf klsdjf');
    expect(plan).toBeTruthy();
    expect(plan.tools).toBeDefined();
  });
});

/* ── 6. No false success without tool success ─────────────── */
describe('no false success', () => {
  it('executePlan allSucceeded is false when result.success is false', async () => {
    const original = toolMap.get('get_stock_by_size');
    toolMap.set('get_stock_by_size', {
      ...original!,
      execute: async () => ({ success: false, error: 'Product not found' }),
    });

    const plan: AgentPlan = {
      intent: 'stock_lookup',
      tools: [{ toolName: 'get_stock_by_size', params: { width: 999, aspect: 99, rim: 99 } }],
    };
    const out = await executePlan(plan, { userId: 'admin-1', userRole: 'admin' });
    expect(out.allSucceeded).toBe(false);
    expect(out.cards[0].success).toBe(false);
    expect(out.cards[0].summary).toBe('Product not found');

    toolMap.set('get_stock_by_size', original!);
  });
});

/* ── 7. Schema validation ─────────────────────────────────── */
describe('agent request schema', () => {
  const validSessionId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

  it('validates a standard message', () => {
    const result = agentRequestSchema.safeParse({
      sessionId: validSessionId,
      intent: 'chat',
      message: 'hello',
    });
    expect(result.success).toBe(true);
  });

  it('validates a confirm_action intent', () => {
    const result = agentRequestSchema.safeParse({
      sessionId: validSessionId,
      intent: 'confirm_action',
      message: '',
      confirmationId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty message string', () => {
    const result = agentRequestSchema.safeParse({
      sessionId: validSessionId,
      intent: 'chat',
      message: '',
    });
    expect(result.success).toBe(true);
  });
});
