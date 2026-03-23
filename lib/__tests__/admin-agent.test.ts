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
import type { AgentPlan, AgentSessionContext, ChatMessage, ToolContext, ToolResult } from '../ai/admin-agent/types';
import {
  planRequiresConfirmation,
  createPendingConfirmation,
  validateConfirmation,
  buildConfirmationDetails,
} from '../ai/admin-agent/safeguards';
import { executePlan } from '../ai/admin-agent/execute';
import { agentRequestSchema } from '../ai/admin-agent/schemas';
import {
  extractSessionMemory,
  buildMemoryContext,
  summarizeIfNeeded,
} from '../ai/admin-agent/memory-manager';
import type { MemoryEntry } from '../ai/admin-agent/memory-manager';
import {
  resolveEntities,
  injectResolvedEntities,
} from '../ai/admin-agent/entity-resolver';
import type { ResolvedEntity } from '../ai/admin-agent/entity-resolver';
import { formatAgentResponse } from '../ai/admin-agent/response-formatter';

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

  /* ── New command patterns ── */

  it('detects cancel booking', async () => {
    const plan = await generatePlan('cancel booking TR-12345');
    expect(plan.intent).toBe('cancel_booking');
    expect(plan.tools).toHaveLength(1);
    expect(plan.tools[0].toolName).toBe('update_booking_status');
    expect(plan.tools[0].params).toEqual({ ref: 'TR-12345', newStatus: 'cancelled' });
  });

  it('detects cancel booking without TR prefix', async () => {
    const plan = await generatePlan('cancel TR12345');
    expect(plan.intent).toBe('cancel_booking');
    expect(plan.tools[0].params.ref).toBe('TR12345');
  });

  it('detects delete booking and routes to lookup', async () => {
    const plan = await generatePlan('delete booking TR-FAKE');
    expect(plan.intent).toBe('delete_booking');
    expect(plan.tools[0].toolName).toBe('get_booking_by_ref');
    expect(plan.tools[0].params).toEqual({ ref: 'TR-FAKE' });
  });

  it('detects confirm booking and routes to lookup', async () => {
    const plan = await generatePlan('confirm booking TR-1234');
    expect(plan.intent).toBe('confirm_booking');
    expect(plan.tools[0].toolName).toBe('get_booking_by_ref');
    expect(plan.tools[0].params).toEqual({ ref: 'TR-1234' });
  });

  it('detects create booking and explains', async () => {
    const plan = await generatePlan('create a new booking');
    expect(plan.intent).toBe('create_booking_explain');
    expect(plan.tools).toHaveLength(0);
    expect(plan.clarificationNeeded).toContain('booking wizard');
  });

  it('detects add new tyre to inventory', async () => {
    const plan = await generatePlan('add a new tyre to inventory');
    expect(plan.intent).toBe('add_inventory_product');
    expect(plan.tools[0].toolName).toBe('add_inventory_product');
    expect(plan.clarificationNeeded).toContain('brand');
  });

  it('detects add tyre to stock', async () => {
    const plan = await generatePlan('add new product to stock');
    expect(plan.intent).toBe('add_inventory_product');
  });

  it('detects set stock to exact value', async () => {
    const plan = await generatePlan('set stock for 205/55/R16 to 10');
    expect(plan.intent).toBe('stock_set');
    expect(plan.tools[0].toolName).toBe('get_stock_by_size');
    expect(plan.tools[0].params).toEqual({ width: 205, aspect: 55, rim: 16 });
  });

  it('detects update stock to value', async () => {
    const plan = await generatePlan('update stock 225/45/R17 to 5');
    expect(plan.intent).toBe('stock_set');
    expect(plan.tools[0].params).toEqual({ width: 225, aspect: 45, rim: 17 });
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

  it('planRequiresConfirmation returns true for add_inventory_product', () => {
    const plan: AgentPlan = {
      intent: 'add_inventory_product',
      tools: [{ toolName: 'add_inventory_product', params: { brand: 'Budget', pattern: 'Economy', width: 205, aspect: 55, rim: 16, season: 'allseason', priceNew: 49.99 } }],
    };
    expect(planRequiresConfirmation(plan)).toBe(true);
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

  it('cancel_booking plan requires confirmation', async () => {
    const plan = await generatePlan('cancel booking TR-ABC');
    expect(planRequiresConfirmation(plan)).toBe(true);
  });

  it('delete_booking plan does NOT require confirmation (read-only lookup)', async () => {
    const plan = await generatePlan('delete booking TR-ABC');
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
  it('exports 19 tools', () => {
    expect(allTools).toHaveLength(19);
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
    expect(toolMap.size).toBe(19);
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
    const out = await executePlan(plan, ctx, { skipDedup: true });
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
    const out = await executePlan(plan, ctx, { skipDedup: true });
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
    const out = await executePlan(plan, ctx, { skipDedup: true });
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
    const out = await executePlan(plan, ctx, { skipDedup: true });
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
    const out = await executePlan(plan, ctx, { skipDedup: true });
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
    const out = await executePlan(plan, { userId: 'admin-1', userRole: 'admin' }, { skipDedup: true });
    expect(out.allSucceeded).toBe(false);
    expect(out.cards[0].success).toBe(false);
    expect(out.cards[0].summary).toBe('Product not found');

    toolMap.set('get_stock_by_size', original!);
  });

  it('delete non-existent booking returns clear error via get_booking_by_ref', async () => {
    const original = toolMap.get('get_booking_by_ref');
    toolMap.set('get_booking_by_ref', {
      ...original!,
      execute: async () => ({ success: false, error: 'Booking TR-FAKE not found' }),
    });

    const plan = await generatePlan('delete booking TR-FAKE');
    expect(plan.intent).toBe('delete_booking');

    const out = await executePlan(plan, { userId: 'admin-1', userRole: 'admin' }, { skipDedup: true });
    expect(out.allSucceeded).toBe(false);
    expect(out.cards[0].summary).toBe('Booking TR-FAKE not found');

    toolMap.set('get_booking_by_ref', original!);
  });

  it('cancel non-existent booking returns clear error', async () => {
    const original = toolMap.get('update_booking_status');
    toolMap.set('update_booking_status', {
      ...original!,
      execute: async () => ({ success: false, error: 'Booking TR-GONE not found' }),
    });

    const plan = await generatePlan('cancel booking TR-GONE');
    expect(plan.intent).toBe('cancel_booking');
    expect(plan.tools[0].params.newStatus).toBe('cancelled');

    const out = await executePlan(plan, { userId: 'admin-1', userRole: 'admin' }, { skipDedup: true });
    expect(out.allSucceeded).toBe(false);
    expect(out.cards[0].success).toBe(false);
    expect(out.cards[0].summary).toContain('not found');

    toolMap.set('update_booking_status', original!);
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

/* ── 8. Memory manager — session memory ──────────────────── */
describe('memory manager — session helpers', () => {
  it('extractSessionMemory returns empty defaults for undefined context', () => {
    const mem = extractSessionMemory(undefined);
    expect(mem.recentEntities).toEqual([]);
    expect(mem.lastActionContext).toBeUndefined();
    expect(mem.pendingFollowUps).toEqual([]);
  });

  it('extractSessionMemory extracts entities from context', () => {
    const ctx: AgentSessionContext = {
      lastEntities: [
        { type: 'booking', id: 'b1', ref: 'TR-001' },
        { type: 'product', id: 'p1' },
      ],
      lastToolResults: [
        { toolName: 'get_booking_by_ref', result: { success: true }, at: '2026-01-01T00:00:00Z' },
      ],
    };
    const mem = extractSessionMemory(ctx);
    expect(mem.recentEntities).toHaveLength(2);
    expect(mem.lastActionContext).toContain('get_booking_by_ref');
    expect(mem.lastActionContext).toContain('ok');
  });

  it('buildMemoryContext formats entities and preferences', () => {
    const longTerm: MemoryEntry[] = [
      { id: '1', kind: 'entity_ref', content: 'Booking TR-001 (paid, John)', entityType: 'booking', entityId: 'b1', entityRef: 'TR-001', createdAt: new Date() },
      { id: '2', kind: 'preference', content: 'Admin prefers voice output on', createdAt: new Date() },
      { id: '3', kind: 'follow_up', content: 'Check stock for 225/45/R17 tomorrow', createdAt: new Date() },
    ];
    const session = {
      recentEntities: [{ type: 'booking', id: 'b2', ref: 'TR-002' }],
      pendingFollowUps: [],
    };
    const result = buildMemoryContext(longTerm, session);
    expect(result).toContain('TR-002');
    expect(result).toContain('TR-001');
    expect(result).toContain('voice output');
    expect(result).toContain('225/45/R17');
  });

  it('buildMemoryContext returns empty string for no memory', () => {
    const result = buildMemoryContext([], { recentEntities: [], pendingFollowUps: [] });
    expect(result).toBe('');
  });
});

/* ── 9. Memory manager — summarization ──────────────────── */
describe('memory manager — summarization', () => {
  it('does not summarize when below threshold', async () => {
    const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: new Date().toISOString(),
    }));
    const { messages: result, summary } = await summarizeIfNeeded(messages);
    expect(result).toHaveLength(10);
    expect(summary).toBeNull();
  });

  it('trims messages when above threshold (LLM mocked to null)', async () => {
    // With LLM mocked to return null, it should trim to KEEP_RECENT (15)
    const messages: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: new Date().toISOString(),
    }));
    const { messages: result } = await summarizeIfNeeded(messages);
    expect(result.length).toBeLessThanOrEqual(15);
    // Should keep the newest messages
    expect(result[result.length - 1].content).toBe('Message 49');
  });

  it('preserves existing summary when LLM fails', async () => {
    const messages: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: new Date().toISOString(),
    }));
    const { summary } = await summarizeIfNeeded(messages, 'Previous summary about bookings');
    expect(summary).toBe('Previous summary about bookings');
  });
});

/* ── 10. Entity resolver — pronoun resolution ────────────── */
describe('entity resolver — injectResolvedEntities', () => {
  it('injects booking ref into params when missing', () => {
    const resolved: ResolvedEntity[] = [
      { type: 'booking', id: 'b1', ref: 'TR-ABC', label: 'Booking TR-ABC', confidence: 'inferred' },
    ];
    const params = { newStatus: 'cancelled' };
    const result = injectResolvedEntities(params, resolved, 'update_booking_status');
    expect(result.ref).toBe('TR-ABC');
    expect(result.newStatus).toBe('cancelled');
  });

  it('does not overwrite existing ref', () => {
    const resolved: ResolvedEntity[] = [
      { type: 'booking', id: 'b1', ref: 'TR-ABC', label: 'Booking TR-ABC', confidence: 'inferred' },
    ];
    const params = { ref: 'TR-XYZ', newStatus: 'cancelled' };
    const result = injectResolvedEntities(params, resolved, 'update_booking_status');
    expect(result.ref).toBe('TR-XYZ');
  });

  it('injects productId from resolved product', () => {
    const resolved: ResolvedEntity[] = [
      { type: 'product', id: 'p-uuid-123', ref: '205/55/R16', label: 'Budget 205/55/R16', confidence: 'exact' },
    ];
    const params = { newStock: 10 };
    const result = injectResolvedEntities(params, resolved, 'update_stock_quantity');
    expect(result.productId).toBe('p-uuid-123');
  });

  it('injects driverId from resolved driver', () => {
    const resolved: ResolvedEntity[] = [
      { type: 'driver', id: 'd-uuid-456', label: 'Driver John', confidence: 'exact' },
    ];
    const params = { ref: 'TR-001' };
    const result = injectResolvedEntities(params, resolved, 'assign_driver_to_booking');
    expect(result.driverId).toBe('d-uuid-456');
  });

  it('returns params unchanged when no matching resolution', () => {
    const params = { newStock: 10 };
    const result = injectResolvedEntities(params, [], 'update_stock_quantity');
    expect(result).toEqual({ newStock: 10 });
  });
});

/* ── 11. Deduplication guard in executePlan ───────────────── */
describe('executePlan — deduplication', () => {
  const ctx: ToolContext = { userId: 'admin-dedup', userRole: 'admin' };

  it('blocks duplicate execution within 5s window', async () => {
    const original = toolMap.get('get_today_bookings');
    let callCount = 0;
    toolMap.set('get_today_bookings', {
      ...original!,
      execute: async () => { callCount++; return { success: true, data: [] }; },
    });

    const plan: AgentPlan = {
      intent: 'test_dedup',
      tools: [{ toolName: 'get_today_bookings', params: {} }],
    };

    // First call should succeed
    const out1 = await executePlan(plan, ctx);
    expect(out1.allSucceeded).toBe(true);
    expect(callCount).toBe(1);

    // Second identical call within window should be blocked
    const out2 = await executePlan(plan, ctx);
    expect(out2.allSucceeded).toBe(false);
    expect(out2.cards[0].summary).toContain('already submitted');
    expect(callCount).toBe(1); // should NOT have called tool again

    toolMap.set('get_today_bookings', original!);
  });

  it('allows execution with skipDedup option', async () => {
    const original = toolMap.get('get_driver_statuses');
    let callCount = 0;
    toolMap.set('get_driver_statuses', {
      ...original!,
      execute: async () => { callCount++; return { success: true, data: [] }; },
    });

    const plan: AgentPlan = {
      intent: 'test_skip_dedup',
      tools: [{ toolName: 'get_driver_statuses', params: {} }],
    };

    await executePlan(plan, ctx, { skipDedup: true });
    await executePlan(plan, ctx, { skipDedup: true });
    expect(callCount).toBe(2);

    toolMap.set('get_driver_statuses', original!);
  });
});

/* ── 12. Response formatter — fallback ───────────────────── */
describe('response formatter — fallback', () => {
  it('formats successful results when LLM returns null', async () => {
    const results = [
      {
        toolName: 'get_low_stock_items',
        result: {
          success: true,
          data: [
            { id: 'p1', brand: 'Budget', sizeDisplay: '205/55/R16', stockNew: 2, priceNew: '48.00' },
          ],
        },
      },
    ];
    const reply = await formatAgentResponse('low_stock', results);
    expect(reply).toContain('1 item');
    expect(reply).toContain('Budget');
  });

  it('formats error results when tool fails', async () => {
    const results = [
      { toolName: 'get_booking_by_ref', result: { success: false, error: 'Booking TR-999 not found' } },
    ];
    const reply = await formatAgentResponse('booking_lookup', results);
    expect(reply).toContain('TR-999 not found');
  });

  it('returns "No results." for empty results', async () => {
    const reply = await formatAgentResponse('test', []);
    expect(reply).toBe('No results.');
  });
});

/* ── 13. Post-action verification ────────────────────────── */
describe('executePlan — post-action verification', () => {
  const ctx: ToolContext = { userId: 'admin-verify', userRole: 'admin' };

  it('adds warning when verification detects mismatch', async () => {
    const original = toolMap.get('update_stock_quantity');
    toolMap.set('update_stock_quantity', {
      ...original!,
      execute: async () => ({
        success: true,
        data: { brand: 'Budget', size: '205/55/R16', stockBefore: 10, stockAfter: 7 },
        before: { stock: 10 },
        after: { stock: 8 }, // Mismatch: expected 8, got 7
      }),
    });

    const plan: AgentPlan = {
      intent: 'stock_update',
      tools: [{ toolName: 'update_stock_quantity', params: { productId: 'x', newStock: 8 } }],
    };

    const out = await executePlan(plan, ctx, { skipDedup: true });
    expect(out.allSucceeded).toBe(true);
    // The card should contain a warning about the mismatch
    expect(out.cards[0].summary).toContain('Warning');

    toolMap.set('update_stock_quantity', original!);
  });
});

/* ── 14. Planner accepts memoryContext ───────────────────── */
describe('planner — with memory context', () => {
  it('still works with deterministic patterns when memoryContext is provided', async () => {
    const plan = await generatePlan('check stock for 205/55/R16', 'Recent entities: booking:TR-001');
    expect(plan.intent).toBe('stock_lookup');
    expect(plan.tools[0].toolName).toBe('get_stock_by_size');
  });

  it('falls back to general_help with memoryContext when LLM returns null', async () => {
    const plan = await generatePlan('what is the meaning of life', 'No recent context');
    expect(plan.intent).toBe('general_help');
  });
});

/* ── 15. Language detection ──────────────────────────────── */

import {
  detectLanguage,
  resolveSessionLanguage,
  ZYPHON_GREETING,
} from '../ai/admin-agent/language';
import type { ZyphonLanguage } from '../ai/admin-agent/language';
import {
  formatStartupBriefing,
} from '../ai/admin-agent/context-builder';
import type { StartupBriefing } from '../ai/admin-agent/context-builder';

describe('language detection', () => {
  it('detects Arabic text', () => {
    expect(detectLanguage('شلون الحال')).toBe('ar');
    expect(detectLanguage('مرحبا كيفك')).toBe('ar');
    expect(detectLanguage('هلا والله')).toBe('ar');
  });

  it('detects English text', () => {
    expect(detectLanguage('hello there')).toBe('en');
    expect(detectLanguage('check stock for 205/55/R16')).toBe('en');
    expect(detectLanguage('show today bookings')).toBe('en');
  });

  it('detects Arabic with mixed Latin (tyre sizes)', () => {
    expect(detectLanguage('شنو stock الـ 205/55/R16')).toBe('ar');
  });

  it('detects Arabic dialect words', () => {
    expect(detectLanguage('يلا نبلش')).toBe('ar');
    expect(detectLanguage('خوش')).toBe('ar');
    expect(detectLanguage('اكو شغل اليوم')).toBe('ar');
  });

  it('returns en for empty or whitespace', () => {
    expect(detectLanguage('')).toBe('en');
    expect(detectLanguage('   ')).toBe('en');
  });
});

describe('resolveSessionLanguage', () => {
  it('returns existing session language if set', () => {
    expect(resolveSessionLanguage('en', 'مرحبا')).toBe('en');
    expect(resolveSessionLanguage('ar', 'hello')).toBe('ar');
  });

  it('detects from message when no session language', () => {
    expect(resolveSessionLanguage(undefined, 'مرحبا')).toBe('ar');
    expect(resolveSessionLanguage(undefined, 'hello')).toBe('en');
  });

  it('defaults to Arabic when no message', () => {
    expect(resolveSessionLanguage(undefined, undefined)).toBe('ar');
    expect(resolveSessionLanguage(undefined, '')).toBe('ar');
  });
});

describe('ZYPHON_GREETING', () => {
  it('is the exact mandatory greeting', () => {
    expect(ZYPHON_GREETING).toBe('شلونك عبودي جاهز تا نبلش مصايب اليوم 😁');
  });
});

/* ── 16. Startup briefing formatter ──────────────────────── */

describe('formatStartupBriefing', () => {
  const mockData: StartupBriefing = {
    bookingsToday: 3,
    paidBookings: 2,
    todayRevenue: 145.50,
    pendingCallbacks: 1,
    unreadMessages: 2,
    pendingNotifications: 0,
    lowStockCount: 4,
    outOfStockCount: 1,
  };

  it('formats English briefing with all data', () => {
    const result = formatStartupBriefing(mockData, 'en');
    expect(result).toContain('3 bookings today');
    expect(result).toContain('2 paid');
    expect(result).toContain('£145.50');
    expect(result).toContain('1 pending callback');
    expect(result).toContain('2 unread messages');
    expect(result).toContain('4 low stock items');
    expect(result).toContain('1 out of stock');
    expect(result).not.toContain('notification');
  });

  it('formats Arabic briefing with all data', () => {
    const result = formatStartupBriefing(mockData, 'ar');
    expect(result).toContain('3 حجز اليوم');
    expect(result).toContain('2 مدفوع');
    expect(result).toContain('£145.50');
    expect(result).toContain('1 طلب اتصال');
    expect(result).toContain('2 رسالة');
    expect(result).toContain('4 تاير قرب يخلص');
    expect(result).toContain('1 تاير خلص');
  });

  it('handles zero bookings in English', () => {
    const empty: StartupBriefing = {
      bookingsToday: 0, paidBookings: 0, todayRevenue: 0,
      pendingCallbacks: 0, unreadMessages: 0, pendingNotifications: 0,
      lowStockCount: 0, outOfStockCount: 0,
    };
    const result = formatStartupBriefing(empty, 'en');
    expect(result).toBe('No bookings yet today');
  });

  it('handles zero bookings in Arabic', () => {
    const empty: StartupBriefing = {
      bookingsToday: 0, paidBookings: 0, todayRevenue: 0,
      pendingCallbacks: 0, unreadMessages: 0, pendingNotifications: 0,
      lowStockCount: 0, outOfStockCount: 0,
    };
    const result = formatStartupBriefing(empty, 'ar');
    expect(result).toBe('ما في حجوزات اليوم بعد');
  });

  it('singular vs plural in English', () => {
    const single: StartupBriefing = {
      bookingsToday: 1, paidBookings: 1, todayRevenue: 50,
      pendingCallbacks: 1, unreadMessages: 1, pendingNotifications: 1,
      lowStockCount: 1, outOfStockCount: 0,
    };
    const result = formatStartupBriefing(single, 'en');
    expect(result).toContain('1 booking today');
    expect(result).not.toContain('bookings');
    expect(result).toContain('1 pending callback');
    expect(result).not.toContain('callbacks');
    expect(result).toContain('1 unread message');
    expect(result).not.toContain('messages');
  });
});

/* ── 17. Response formatter with language ────────────────── */
describe('response formatter — language parameter', () => {
  it('formats with Arabic language when specified', async () => {
    const results = [
      {
        toolName: 'get_low_stock_items',
        result: {
          success: true,
          data: [
            { id: 'p1', brand: 'Budget', sizeDisplay: '205/55/R16', stockNew: 2, priceNew: '48.00' },
          ],
        },
      },
    ];
    // LLM is mocked to return null, so fallback will be used
    const reply = await formatAgentResponse('low_stock', results, undefined, 'ar');
    expect(reply).toContain('Budget');
    expect(reply).toContain('1 item');
  });

  it('accepts lang parameter without error', async () => {
    const results = [
      { toolName: 'get_booking_by_ref', result: { success: false, error: 'Not found' } },
    ];
    const replyEn = await formatAgentResponse('booking_lookup', results, undefined, 'en');
    expect(replyEn).toContain('Not found');
    const replyAr = await formatAgentResponse('booking_lookup', results, undefined, 'ar');
    expect(replyAr).toContain('Not found');
  });
});
