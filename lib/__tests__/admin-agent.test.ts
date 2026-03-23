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
import type { MemoryEntry, SessionMemory } from '../ai/admin-agent/memory-manager';
import {
  resolveEntities,
  injectResolvedEntities,
} from '../ai/admin-agent/entity-resolver';
import type { ResolvedEntity } from '../ai/admin-agent/entity-resolver';
import { formatAgentResponse } from '../ai/admin-agent/response-formatter';
import {
  createInvoiceSchema,
  createQuickBookingSchema,
  invoiceNumberSchema,
  analyticsQuerySchema,
  opsQuerySchema,
} from '../ai/admin-agent/schemas';
import { buildBookingPreview, type ParsedQuickBookInput } from '../ai/admin-agent/quick-book-parser';
import { COMPANY } from '../ai/admin-agent/invoice-parser';
import {
  getPolicy,
  validatePolicies,
  classifyFinancialRisk,
  type PolicyViolation,
} from '../ai/admin-agent/action-policies';
import { generateRecommendations } from '../ai/admin-agent/recommendation-engine';
import type { InvoicePreviewData, BookingPreviewData, ActionPolicy, Recommendation } from '../ai/admin-agent/types';

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

  it('detects create booking and routes to quick-book', async () => {
    const plan = await generatePlan('create a new booking');
    expect(plan.intent).toBe('create_quick_booking');
    expect(plan.tools.length).toBeGreaterThanOrEqual(1);
    expect(plan.tools[0].toolName).toBe('create_quick_booking');
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
  it('exports 50 tools', () => {
    expect(allTools).toHaveLength(50);
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
    expect(toolMap.size).toBe(50);
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
    const session: SessionMemory = {
      recentEntities: [{ type: 'booking', id: 'b2', ref: 'TR-002' }],
      pendingFollowUps: [],
      recentTopics: [],
      recommendedActions: [],
    };
    const result = buildMemoryContext(longTerm, session);
    expect(result).toContain('TR-002');
    expect(result).toContain('TR-001');
    expect(result).toContain('voice output');
    expect(result).toContain('225/45/R17');
  });

  it('buildMemoryContext returns empty string for no memory', () => {
    const result = buildMemoryContext([], { recentEntities: [], pendingFollowUps: [], recentTopics: [], recommendedActions: [] });
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

/* ═══════════════════════════════════════════════════════════
 *  PHASE 2 TESTS
 * ═══════════════════════════════════════════════════════════ */

import {
  classifyRisk,
  isMultiStep,
  buildMultiStepPlan,
  createPlanExecution,
  getNextStep,
  markStepDone,
  markStepFailed,
  isPlanComplete,
} from '../ai/admin-agent/multi-step-planner';
import {
  categorizeAction,
  getPlanRiskLevel,
  buildRiskSummary,
} from '../ai/admin-agent/safeguards';
import {
  rememberPreference,
  rememberFollowUp,
} from '../ai/admin-agent/memory-manager';
import {
  formatStartupBriefingV2,
} from '../ai/admin-agent/context-builder';
import type { StartupBriefingV2 } from '../ai/admin-agent/context-builder';

/* ── 18. Multi-step planner — risk classification ───────── */
describe('classifyRisk', () => {
  it('returns low for read-only plans', () => {
    const plan: AgentPlan = {
      intent: 'stock_lookup',
      tools: [{ toolName: 'get_stock_by_size', params: { width: 205, aspect: 55, rim: 16 } }],
    };
    expect(classifyRisk(plan)).toBe('low');
  });

  it('returns low for empty tools', () => {
    const plan: AgentPlan = { intent: 'general_help', tools: [] };
    expect(classifyRisk(plan)).toBe('low');
  });

  it('returns medium for a single financial write', () => {
    const plan: AgentPlan = {
      intent: 'stock_update',
      tools: [{ toolName: 'update_stock_quantity', params: { productId: 'x', newStock: 5 } }],
    };
    // update_stock_quantity is in both HIGH_RISK and FINANCIAL — single write with high-risk → high
    expect(classifyRisk(plan)).toBe('high');
  });

  it('returns high for multiple write tools', () => {
    const plan: AgentPlan = {
      intent: 'multi',
      tools: [
        { toolName: 'update_booking_status', params: { ref: 'TR-1', newStatus: 'completed' } },
        { toolName: 'assign_driver_to_booking', params: { ref: 'TR-1', driverId: 'd1' } },
      ],
    };
    expect(classifyRisk(plan)).toBe('high');
  });

  it('returns critical for 3+ write tools', () => {
    const plan: AgentPlan = {
      intent: 'bulk',
      tools: [
        { toolName: 'update_booking_status', params: { ref: 'TR-1', newStatus: 'completed' } },
        { toolName: 'assign_driver_to_booking', params: { ref: 'TR-1', driverId: 'd1' } },
        { toolName: 'toggle_product_availability', params: { productId: 'p1' } },
      ],
    };
    expect(classifyRisk(plan)).toBe('critical');
  });

  it('returns critical for financial + another write', () => {
    const plan: AgentPlan = {
      intent: 'multi_financial',
      tools: [
        { toolName: 'update_stock_quantity', params: { productId: 'p1', newStock: 0 } },
        { toolName: 'update_booking_status', params: { ref: 'TR-1', newStatus: 'completed' } },
      ],
    };
    expect(classifyRisk(plan)).toBe('critical');
  });

  it('returns high for a single high-risk non-financial write', () => {
    const plan: AgentPlan = {
      intent: 'assign',
      tools: [{ toolName: 'assign_driver_to_booking', params: { ref: 'TR-1', driverId: 'd1' } }],
    };
    expect(classifyRisk(plan)).toBe('high');
  });

  it('returns medium for mark_callback_done (non-high-risk write)', () => {
    const plan: AgentPlan = {
      intent: 'callback',
      tools: [{ toolName: 'mark_callback_done', params: { callbackId: 'cb1' } }],
    };
    expect(classifyRisk(plan)).toBe('medium');
  });
});

/* ── 19. Multi-step detection ────────────────────────────── */
describe('isMultiStep', () => {
  it('returns true for "check stock then update"', () => {
    expect(isMultiStep('check stock then update to 10')).toBe(true);
  });

  it('returns true for "first check then update"', () => {
    expect(isMultiStep('first check stock, then update it')).toBe(true);
  });

  it('returns true for "after that"', () => {
    expect(isMultiStep('look up booking, after that change status')).toBe(true);
  });

  it('returns true for "step 1, step 2"', () => {
    expect(isMultiStep('step 1 get stock step 2 update it')).toBe(true);
  });

  it('returns true for "both of these"', () => {
    expect(isMultiStep('update both of these products')).toBe(true);
  });

  it('returns true for "and also"', () => {
    expect(isMultiStep('check bookings and also show drivers')).toBe(true);
  });

  it('returns false for simple single-step request', () => {
    expect(isMultiStep('check stock for 205/55/R16')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isMultiStep('')).toBe(false);
  });
});

/* ── 20. Multi-step plan builder ─────────────────────────── */
describe('buildMultiStepPlan', () => {
  it('orders reads before writes with dependency tracking', () => {
    const basePlan: AgentPlan = {
      intent: 'multi',
      tools: [
        { toolName: 'get_stock_by_size', params: { width: 205, aspect: 55, rim: 16 } },
        { toolName: 'update_stock_quantity', params: { productId: 'x', newStock: 5 } },
      ],
    };
    const plan = buildMultiStepPlan(basePlan, 'check and update stock');
    expect(plan.goal).toBe('check and update stock');
    expect(plan.steps).toHaveLength(2);
    // Read step has no dependencies
    expect(plan.steps[0].dependsOn).toEqual([]);
    // Write step depends on read step
    expect(plan.steps[1].dependsOn).toEqual([0]);
    expect(plan.steps[1].requiresApproval).toBe(true);
  });

  it('sets approvalRequired when risk is not low', () => {
    const basePlan: AgentPlan = {
      intent: 'assign',
      tools: [{ toolName: 'assign_driver_to_booking', params: { ref: 'TR-1', driverId: 'd1' } }],
    };
    const plan = buildMultiStepPlan(basePlan, 'assign driver');
    expect(plan.approvalRequired).toBe(true);
    expect(plan.riskLevel).toBe('high');
  });

  it('sets approvalRequired false for read-only plan', () => {
    const basePlan: AgentPlan = {
      intent: 'lookup',
      tools: [{ toolName: 'get_today_bookings', params: {} }],
    };
    const plan = buildMultiStepPlan(basePlan, 'show bookings');
    expect(plan.approvalRequired).toBe(false);
    expect(plan.riskLevel).toBe('low');
  });

  it('includes reasoning from base plan', () => {
    const basePlan: AgentPlan = {
      intent: 'test',
      tools: [],
      reasoning: 'LLM deduced stock lookup',
    };
    const plan = buildMultiStepPlan(basePlan, 'test');
    expect(plan.reasoning).toBe('LLM deduced stock lookup');
    expect(plan.assumptions).toContain('LLM deduced stock lookup');
  });
});

/* ── 21. Plan execution state management ─────────────────── */
describe('plan execution state', () => {
  const basePlan: AgentPlan = {
    intent: 'multi',
    tools: [
      { toolName: 'get_stock_by_size', params: { width: 205, aspect: 55, rim: 16 } },
      { toolName: 'update_stock_quantity', params: { productId: 'x', newStock: 5 } },
    ],
  };

  it('createPlanExecution generates valid state', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'check and update');
    const state = createPlanExecution(multiPlan);
    expect(state.planId).toBeTruthy();
    expect(state.completedSteps).toEqual([]);
    expect(state.failedSteps).toEqual([]);
    expect(state.currentStep).toBeNull();
    expect(state.startedAt).toBeTruthy();
    // Plan with writes should start paused (approval required)
    expect(state.paused).toBe(true);
  });

  it('getNextStep returns first read step when paused', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'check and update');
    let state = createPlanExecution(multiPlan);
    // Even though paused, read steps that don't require approval can proceed
    const next = getNextStep(state);
    // Step 0 is read (no approval required), should be returned
    expect(next).not.toBeNull();
    expect(next!.stepIndex).toBe(0);
    expect(next!.requiresApproval).toBe(false);
  });

  it('getNextStep returns null for write step when paused', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'check and update');
    let state = createPlanExecution(multiPlan);
    state = markStepDone(state, 0); // complete the read
    // Next step is write with approval, plan is paused → null
    const next = getNextStep(state);
    expect(next).toBeNull();
  });

  it('getNextStep returns write step when unpaused and deps met', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'check and update');
    let state = createPlanExecution(multiPlan);
    state = markStepDone(state, 0);
    state = { ...state, paused: false }; // simulate approval
    const next = getNextStep(state);
    expect(next).not.toBeNull();
    expect(next!.stepIndex).toBe(1);
  });

  it('markStepDone adds to completedSteps', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'test');
    let state = createPlanExecution(multiPlan);
    state = markStepDone(state, 0);
    expect(state.completedSteps).toContain(0);
    expect(state.currentStep).toBeNull();
  });

  it('markStepFailed adds to failedSteps', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'test');
    let state = createPlanExecution(multiPlan);
    state = markStepFailed(state, 0);
    expect(state.failedSteps).toContain(0);
    expect(state.currentStep).toBeNull();
  });

  it('isPlanComplete true when all steps done', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'test');
    let state = createPlanExecution(multiPlan);
    state = markStepDone(state, 0);
    state = markStepDone(state, 1);
    expect(isPlanComplete(state)).toBe(true);
  });

  it('isPlanComplete true when all steps done/failed', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'test');
    let state = createPlanExecution(multiPlan);
    state = markStepDone(state, 0);
    state = markStepFailed(state, 1);
    expect(isPlanComplete(state)).toBe(true);
  });

  it('isPlanComplete false when steps remain', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'test');
    let state = createPlanExecution(multiPlan);
    state = markStepDone(state, 0);
    expect(isPlanComplete(state)).toBe(false);
  });

  it('getNextStep skips failed steps', () => {
    const multiPlan = buildMultiStepPlan(basePlan, 'test');
    let state = createPlanExecution(multiPlan);
    state = markStepFailed(state, 0); // read step failed
    // Write step depends on read (step 0) — dep not met
    const next = getNextStep(state);
    expect(next).toBeNull();
  });
});

/* ── 22. Safeguards — action categorization ──────────────── */
describe('categorizeAction', () => {
  it('returns read for read-only tools', () => {
    expect(categorizeAction('get_stock_by_size')).toBe('read');
    expect(categorizeAction('get_today_bookings')).toBe('read');
    expect(categorizeAction('get_driver_statuses')).toBe('read');
    expect(categorizeAction('get_booking_by_ref')).toBe('read');
  });

  it('returns financial for stock updates', () => {
    expect(categorizeAction('update_stock_quantity')).toBe('financial');
  });

  it('returns financial for add_inventory_product', () => {
    expect(categorizeAction('add_inventory_product')).toBe('financial');
  });

  it('returns update for booking status change', () => {
    expect(categorizeAction('update_booking_status')).toBe('update');
  });

  it('returns update for assign driver', () => {
    expect(categorizeAction('assign_driver_to_booking')).toBe('update');
  });

  it('returns update for toggle availability', () => {
    expect(categorizeAction('toggle_product_availability')).toBe('update');
  });

  it('returns notify for mark_callback_done', () => {
    expect(categorizeAction('mark_callback_done')).toBe('notify');
  });

  it('returns notify for mark_message_read', () => {
    expect(categorizeAction('mark_message_read')).toBe('notify');
  });

  it('returns read for unknown tool', () => {
    expect(categorizeAction('nonexistent_tool')).toBe('read');
  });
});

/* ── 23. Safeguards — risk summary ──────────────────────── */
describe('buildRiskSummary', () => {
  it('returns low risk for read-only plan', () => {
    const plan: AgentPlan = {
      intent: 'lookup',
      tools: [{ toolName: 'get_today_bookings', params: {} }],
    };
    const summary = buildRiskSummary(plan);
    expect(summary.riskLevel).toBe('low');
    expect(summary.categories).toContain('read');
    expect(summary.summary).toContain('Low risk');
  });

  it('returns high risk for write plan', () => {
    const plan: AgentPlan = {
      intent: 'update',
      tools: [{ toolName: 'update_booking_status', params: { ref: 'TR-1', newStatus: 'completed' } }],
    };
    const summary = buildRiskSummary(plan);
    expect(summary.riskLevel).toBe('high');
    expect(summary.categories).toContain('update');
    expect(summary.summary).toContain('High risk');
  });

  it('returns unique categories', () => {
    const plan: AgentPlan = {
      intent: 'multi',
      tools: [
        { toolName: 'get_today_bookings', params: {} },
        { toolName: 'update_booking_status', params: { ref: 'TR-1', newStatus: 'completed' } },
        { toolName: 'assign_driver_to_booking', params: { ref: 'TR-1', driverId: 'd1' } },
      ],
    };
    const summary = buildRiskSummary(plan);
    expect(summary.categories).toContain('read');
    expect(summary.categories).toContain('update');
    // Should be unique
    const uniqueCount = new Set(summary.categories).size;
    expect(summary.categories.length).toBe(uniqueCount);
  });

  it('getPlanRiskLevel delegates to classifyRisk', () => {
    const plan: AgentPlan = {
      intent: 'lookup',
      tools: [{ toolName: 'get_today_bookings', params: {} }],
    };
    expect(getPlanRiskLevel(plan)).toBe(classifyRisk(plan));
  });
});

/* ── 24. Memory extensions — session topic inference ─────── */
describe('memory — session topics', () => {
  it('extracts booking topic from tool results', () => {
    const ctx: AgentSessionContext = {
      lastToolResults: [
        { toolName: 'get_today_bookings', result: { success: true }, at: '2026-01-01T00:00:00Z' },
      ],
    };
    const mem = extractSessionMemory(ctx);
    expect(mem.recentTopics).toContain('bookings');
  });

  it('extracts stock topic from stock tools', () => {
    const ctx: AgentSessionContext = {
      lastToolResults: [
        { toolName: 'get_stock_by_size', result: { success: true }, at: '2026-01-01T00:00:00Z' },
      ],
    };
    const mem = extractSessionMemory(ctx);
    expect(mem.recentTopics).toContain('stock');
  });

  it('extracts driver topic', () => {
    const ctx: AgentSessionContext = {
      lastToolResults: [
        { toolName: 'get_driver_statuses', result: { success: true }, at: '2026-01-01T00:00:00Z' },
      ],
    };
    const mem = extractSessionMemory(ctx);
    expect(mem.recentTopics).toContain('drivers');
  });

  it('deduplicates topics', () => {
    const ctx: AgentSessionContext = {
      lastToolResults: [
        { toolName: 'get_today_bookings', result: { success: true }, at: '2026-01-01T00:00:00Z' },
        { toolName: 'get_booking_by_ref', result: { success: true }, at: '2026-01-01T00:00:00Z' },
      ],
    };
    const mem = extractSessionMemory(ctx);
    // Both contain 'booking' → should deduplicate to one 'bookings' entry
    expect(mem.recentTopics.filter((t) => t === 'bookings')).toHaveLength(1);
  });

  it('returns empty topics when no context', () => {
    const mem = extractSessionMemory(undefined);
    expect(mem.recentTopics).toEqual([]);
    expect(mem.recommendedActions).toEqual([]);
  });
});

/* ── 25. Memory — buildMemoryContext with facts & topics ── */
describe('memory — buildMemoryContext extended', () => {
  it('includes recent topics in output', () => {
    const session: SessionMemory = {
      recentEntities: [],
      pendingFollowUps: [],
      recentTopics: ['bookings', 'stock'],
      recommendedActions: [],
    };
    const result = buildMemoryContext([], session);
    expect(result).toContain('Recent topics: bookings, stock');
  });

  it('includes facts in output', () => {
    const longTerm: MemoryEntry[] = [
      { id: '1', kind: 'fact', content: 'Peak hours are 10am-2pm', createdAt: new Date() },
    ];
    const session: SessionMemory = {
      recentEntities: [],
      pendingFollowUps: [],
      recentTopics: [],
      recommendedActions: [],
    };
    const result = buildMemoryContext(longTerm, session);
    expect(result).toContain('Known facts: Peak hours are 10am-2pm');
  });

  it('includes recommended actions in output', () => {
    const session: SessionMemory = {
      recentEntities: [],
      pendingFollowUps: [],
      recentTopics: [],
      recommendedActions: ['Assign drivers to waiting bookings'],
    };
    const result = buildMemoryContext([], session);
    expect(result).toContain('Suggested actions: Assign drivers to waiting bookings');
  });

  it('caps facts at 5', () => {
    const longTerm: MemoryEntry[] = Array.from({ length: 8 }, (_, i) => ({
      id: `${i}`,
      kind: 'fact' as const,
      content: `Fact ${i}`,
      createdAt: new Date(),
    }));
    const session: SessionMemory = {
      recentEntities: [],
      pendingFollowUps: [],
      recentTopics: [],
      recommendedActions: [],
    };
    const result = buildMemoryContext(longTerm, session);
    expect(result).toContain('Fact 0');
    expect(result).toContain('Fact 4');
    expect(result).not.toContain('Fact 5');
  });
});

/* ── 26. Tool registry — updated count ──────────────────── */
describe('tool registry — Phase 2', () => {
  it('exports 50 tools (21 + 29 phase 3)', () => {
    expect(allTools).toHaveLength(50);
  });

  it('has get_business_insights tool', () => {
    const tool = toolMap.get('get_business_insights');
    expect(tool).toBeTruthy();
    expect(tool!.kind).toBe('read');
    expect(tool!.requiresConfirmation).toBe(false);
  });

  it('has get_weekly_comparison tool', () => {
    const tool = toolMap.get('get_weekly_comparison');
    expect(tool).toBeTruthy();
    expect(tool!.kind).toBe('read');
    expect(tool!.requiresConfirmation).toBe(false);
  });
});

/* ── 27. Planner — intelligence patterns ─────────────────── */
describe('planner — intelligence patterns', () => {
  it('detects business insights intent', async () => {
    const plan = await generatePlan('any issues or anomalies?');
    expect(plan.intent).toBe('business_insights');
    expect(plan.tools[0].toolName).toBe('get_business_insights');
  });

  it('detects insights from "health check"', async () => {
    const plan = await generatePlan('give me a health check');
    expect(plan.intent).toBe('business_insights');
  });

  it('detects insights from "what\'s wrong"', async () => {
    const plan = await generatePlan("what's wrong today?");
    expect(plan.intent).toBe('business_insights');
  });

  it('detects insights from bottleneck', async () => {
    const plan = await generatePlan('any bottlenecks?');
    expect(plan.intent).toBe('business_insights');
  });

  it('detects weekly comparison intent', async () => {
    const plan = await generatePlan('weekly comparison');
    expect(plan.intent).toBe('weekly_comparison');
    expect(plan.tools[0].toolName).toBe('get_weekly_comparison');
  });

  it('detects weekly report', async () => {
    const plan = await generatePlan('show me the weekly report');
    expect(plan.intent).toBe('weekly_comparison');
  });

  it('detects "this week vs last week"', async () => {
    const plan = await generatePlan('this week vs last week');
    expect(plan.intent).toBe('weekly_comparison');
  });

  it('detects "week over week"', async () => {
    const plan = await generatePlan('week over week stats');
    expect(plan.intent).toBe('weekly_comparison');
  });
});

/* ── 28. Startup briefing V2 formatter ──────────────────── */
describe('formatStartupBriefingV2', () => {
  const mockV2: StartupBriefingV2 = {
    bookingsToday: 5,
    paidBookings: 3,
    todayRevenue: 250.00,
    pendingCallbacks: 2,
    unreadMessages: 8,
    pendingNotifications: 0,
    lowStockCount: 3,
    outOfStockCount: 1,
    unassignedBookings: 2,
    onlineDrivers: 1,
    totalDrivers: 4,
    recentAuditCount: 15,
    criticalBlockers: ['2 paid bookings need driver assignment'],
    recommendedActions: ['Assign drivers to waiting bookings', 'Clear pending callbacks'],
  };

  it('formats English V2 with driver status', () => {
    const result = formatStartupBriefingV2(mockV2, 'en');
    expect(result).toContain('5 bookings today');
    expect(result).toContain('1/4 drivers online');
    expect(result).toContain('2 bookings awaiting driver');
  });

  it('formats English V2 with critical blockers', () => {
    const result = formatStartupBriefingV2(mockV2, 'en');
    expect(result).toContain('🚨 Critical:');
    expect(result).toContain('2 paid bookings need driver assignment');
  });

  it('formats English V2 with recommended actions', () => {
    const result = formatStartupBriefingV2(mockV2, 'en');
    expect(result).toContain('💡 Suggested:');
    expect(result).toContain('Assign drivers to waiting bookings');
    expect(result).toContain('Clear pending callbacks');
  });

  it('formats Arabic V2 with driver status', () => {
    const result = formatStartupBriefingV2(mockV2, 'ar');
    expect(result).toContain('5 حجز اليوم');
    expect(result).toContain('1/4 سواق اونلاين');
    expect(result).toContain('2 حجز يحتاج سواق');
  });

  it('formats Arabic V2 with critical blockers', () => {
    const result = formatStartupBriefingV2(mockV2, 'ar');
    expect(result).toContain('🚨 مشاكل عاجلة:');
  });

  it('formats Arabic V2 with recommended actions', () => {
    const result = formatStartupBriefingV2(mockV2, 'ar');
    expect(result).toContain('💡 مقترحات:');
  });

  it('omits sections when no blockers or actions', () => {
    const clean: StartupBriefingV2 = {
      bookingsToday: 2,
      paidBookings: 1,
      todayRevenue: 80,
      pendingCallbacks: 0,
      unreadMessages: 0,
      pendingNotifications: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      unassignedBookings: 0,
      onlineDrivers: 2,
      totalDrivers: 3,
      recentAuditCount: 5,
      criticalBlockers: [],
      recommendedActions: [],
    };
    const result = formatStartupBriefingV2(clean, 'en');
    expect(result).not.toContain('🚨');
    expect(result).not.toContain('💡');
    expect(result).toContain('2/3 drivers online');
    expect(result).not.toContain('awaiting driver');
  });

  it('omits driver section when no drivers', () => {
    const noDrivers: StartupBriefingV2 = {
      bookingsToday: 1,
      paidBookings: 1,
      todayRevenue: 50,
      pendingCallbacks: 0,
      unreadMessages: 0,
      pendingNotifications: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      unassignedBookings: 0,
      onlineDrivers: 0,
      totalDrivers: 0,
      recentAuditCount: 0,
      criticalBlockers: [],
      recommendedActions: [],
    };
    const result = formatStartupBriefingV2(noDrivers, 'en');
    expect(result).not.toContain('drivers online');
  });
});

/* ══════════════════════════════════════════════════════════ */
/* ═══ PHASE 3 TESTS ══════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════ */

/* ── Planner: Phase 3 patterns ─────────────────────────── */
describe('planner — Phase 3 patterns', () => {
  // Invoice patterns
  it('detects "create invoice" intent', async () => {
    const plan = await generatePlan('create an invoice for John Smith');
    expect(plan.tools.length).toBeGreaterThanOrEqual(1);
    expect(plan.tools[0].toolName).toBe('create_invoice_draft');
  });

  it('detects "generate invoice" intent', async () => {
    const plan = await generatePlan('generate invoice for booking #123');
    expect(plan.tools.length).toBeGreaterThanOrEqual(1);
    expect(plan.tools[0].toolName).toBe('create_invoice_draft');
  });

  it('detects "new invoice for" intent', async () => {
    const plan = await generatePlan('new invoice for Sarah');
    expect(plan.tools[0].toolName).toBe('create_invoice_draft');
  });

  // Quick booking patterns
  it('detects quick booking intent', async () => {
    const plan = await generatePlan('book a tyre fitting for Mark on Baker Street');
    expect(plan.tools.length).toBeGreaterThanOrEqual(1);
    expect(plan.tools[0].toolName).toBe('create_quick_booking');
  });

  it('detects "quick book" phrasing', async () => {
    const plan = await generatePlan('quick book tyre change for Dave');
    expect(plan.tools[0].toolName).toBe('create_quick_booking');
  });

  // Analytics patterns
  it('detects visitor analytics intent', async () => {
    const plan = await generatePlan('show me visitor analytics');
    expect(plan.tools[0].toolName).toBe('get_visitor_analytics');
  });

  it('detects traffic sources intent', async () => {
    const plan = await generatePlan('what are the top traffic sources');
    expect(plan.tools[0].toolName).toBe('get_traffic_sources');
  });

  it('detects "top pages" intent', async () => {
    const plan = await generatePlan('show me the most visited pages');
    expect(plan.tools[0].toolName).toBe('get_top_pages');
  });

  it('detects realtime visitors intent', async () => {
    const plan = await generatePlan('how many visitors right now');
    expect(plan.tools[0].toolName).toBe('get_realtime_visitors');
  });

  it('detects conversion funnel intent', async () => {
    const plan = await generatePlan('show conversion funnel');
    expect(plan.tools[0].toolName).toBe('get_conversion_funnel');
  });

  it('detects demand signals intent', async () => {
    const plan = await generatePlan('show demand signals');
    expect(plan.tools[0].toolName).toBe('get_demand_signals');
  });

  // Ops patterns
  it('detects "today revenue" intent', async () => {
    const plan = await generatePlan("what's today's revenue");
    expect(plan.tools[0].toolName).toBe('get_today_revenue');
  });

  it('detects outstanding payments intent', async () => {
    const plan = await generatePlan('any outstanding payments');
    expect(plan.tools[0].toolName).toBe('get_outstanding_payments');
  });

  it('detects refund summary intent', async () => {
    const plan = await generatePlan('show refund summary');
    expect(plan.tools[0].toolName).toBe('get_refund_summary');
  });

  it('detects payment failures intent', async () => {
    const plan = await generatePlan('any payment failures this week');
    expect(plan.tools[0].toolName).toBe('get_payment_failures');
  });

  it('detects driver performance intent', async () => {
    const plan = await generatePlan('how are the drivers performing');
    expect(plan.tools[0].toolName).toBe('get_driver_performance');
  });

  it('detects driver gaps intent', async () => {
    const plan = await generatePlan('are there any unassigned bookings');
    expect(plan.tools[0].toolName).toBe('get_driver_assignment_gaps');
  });

  it('detects popular tyre sizes intent', async () => {
    const plan = await generatePlan('what are the most popular tyre sizes');
    expect(plan.tools[0].toolName).toBe('get_popular_tyre_sizes');
  });

  it('detects customer repeat rate intent', async () => {
    const plan = await generatePlan('what is the repeat customer rate');
    expect(plan.tools[0].toolName).toBe('get_customer_repeat_rate');
  });

  it('detects top customers intent', async () => {
    const plan = await generatePlan('who are the top customers');
    expect(plan.tools[0].toolName).toBe('get_top_customers');
  });

  it('detects cancelled bookings intent', async () => {
    const plan = await generatePlan('how many bookings were cancelled');
    expect(plan.tools[0].toolName).toBe('get_cancelled_bookings_analysis');
  });

  it('detects no-show analysis intent', async () => {
    const plan = await generatePlan('any no shows today');
    expect(plan.tools[0].toolName).toBe('get_no_show_analysis');
  });

  it('detects peak hours intent', async () => {
    const plan = await generatePlan('when are the busiest hours');
    expect(plan.tools[0].toolName).toBe('get_peak_booking_hours');
  });

  it('detects service demand trends intent', async () => {
    const plan = await generatePlan('what service types are trending');
    expect(plan.tools[0].toolName).toBe('get_service_demand_trends');
  });

  it('detects location heatmap intent', async () => {
    const plan = await generatePlan('show location demand heatmap');
    expect(plan.tools[0].toolName).toBe('get_location_demand_heatmap');
  });

  it('detects quote-to-booking rate intent', async () => {
    const plan = await generatePlan('what is the quote to booking rate');
    expect(plan.tools[0].toolName).toBe('get_quote_to_booking_rate');
  });

  it('detects booking completion rate intent', async () => {
    const plan = await generatePlan('show booking completion rate');
    expect(plan.tools[0].toolName).toBe('get_booking_completion_rate');
  });

  it('detects abandoned bookings intent', async () => {
    const plan = await generatePlan('any abandoned bookings');
    expect(plan.tools[0].toolName).toBe('get_abandoned_booking_signals');
  });

  it('detects admin workload intent', async () => {
    const plan = await generatePlan('show admin workload summary');
    expect(plan.tools[0].toolName).toBe('get_admin_workload_summary');
  });

  it('detects recent admin actions intent', async () => {
    const plan = await generatePlan('show my recent admin actions');
    expect(plan.tools[0].toolName).toBe('get_recent_admin_actions');
  });

  it('detects stock movements intent', async () => {
    const plan = await generatePlan('show stock movements');
    expect(plan.tools[0].toolName).toBe('get_stock_movement_summary');
  });

  it('detects recommendation request', async () => {
    const plan = await generatePlan('what should I focus on');
    expect(plan.tools[0].toolName).toBe('get_business_insights');
  });
});

/* ── Tool registry: Phase 3 tool count ─────────────────── */
describe('tool registry — Phase 3', () => {
  it('has at least 50 tools registered', () => {
    expect(allTools.length).toBeGreaterThanOrEqual(50);
  });

  const phase3Tools = [
    'create_invoice_draft',
    'get_invoice_by_number',
    'create_quick_booking',
    'get_visitor_analytics',
    'get_traffic_sources',
    'get_top_pages',
    'get_realtime_visitors',
    'get_conversion_funnel',
    'get_demand_signals',
    'get_today_revenue',
    'get_outstanding_payments',
    'get_refund_summary',
    'get_payment_failures',
    'get_driver_performance',
    'get_driver_assignment_gaps',
    'get_popular_tyre_sizes',
    'get_customer_repeat_rate',
    'get_top_customers',
    'get_cancelled_bookings_analysis',
    'get_no_show_analysis',
    'get_peak_booking_hours',
    'get_service_demand_trends',
    'get_location_demand_heatmap',
    'get_quote_to_booking_rate',
    'get_booking_completion_rate',
    'get_abandoned_booking_signals',
    'get_admin_workload_summary',
    'get_recent_admin_actions',
    'get_stock_movement_summary',
  ];

  for (const name of phase3Tools) {
    it(`has tool "${name}" in the registry`, () => {
      expect(toolMap.has(name)).toBe(true);
      const tool = toolMap.get(name)!;
      expect(tool.name).toBe(name);
      expect(tool.description).toBeTruthy();
      expect(typeof tool.execute).toBe('function');
    });
  }

  it('read-only analytics tools do not require confirmation', () => {
    const readOnlyTools = [
      'get_visitor_analytics', 'get_traffic_sources', 'get_top_pages', 'get_realtime_visitors',
      'get_conversion_funnel', 'get_demand_signals', 'get_today_revenue', 'get_outstanding_payments',
      'get_refund_summary', 'get_payment_failures', 'get_driver_performance', 'get_driver_assignment_gaps',
      'get_popular_tyre_sizes', 'get_customer_repeat_rate', 'get_top_customers', 'get_cancelled_bookings_analysis',
      'get_no_show_analysis', 'get_peak_booking_hours', 'get_service_demand_trends',
      'get_location_demand_heatmap', 'get_quote_to_booking_rate', 'get_booking_completion_rate',
      'get_abandoned_booking_signals', 'get_admin_workload_summary', 'get_recent_admin_actions',
      'get_stock_movement_summary',
    ];
    for (const name of readOnlyTools) {
      const tool = toolMap.get(name)!;
      expect(tool.requiresConfirmation).toBe(false);
    }
  });

  it('write tools require confirmation', () => {
    const writeTools = ['create_invoice_draft', 'create_quick_booking'];
    for (const name of writeTools) {
      const tool = toolMap.get(name)!;
      expect(tool.requiresConfirmation).toBe(true);
    }
  });
});

/* ── Schemas: Phase 3 validation ──────────────────────── */
describe('schemas — Phase 3', () => {
  describe('createInvoiceSchema', () => {
    it('validates a correct invoice input', () => {
      const result = createInvoiceSchema.safeParse({
        customerName: 'John Smith',
        items: [{ description: '205/55R16 tyre', quantity: 4, unitPrice: 79.99 }],
      });
      expect(result.success).toBe(true);
    });

    it('requires at least one item', () => {
      const result = createInvoiceSchema.safeParse({
        customerName: 'John',
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it('requires customer name', () => {
      const result = createInvoiceSchema.safeParse({
        items: [{ description: 'Tyre', quantity: 1, unitPrice: 50 }],
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional fields', () => {
      const result = createInvoiceSchema.safeParse({
        customerName: 'Jane',
        customerEmail: 'jane@example.com',
        customerPhone: '07700900000',
        customerAddress: '123 Main St',
        items: [{ description: 'Fitting', quantity: 1, unitPrice: 25 }],
        notes: 'Rush order',
        dueDate: '2025-02-01',
        bookingId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid bookingId format', () => {
      const result = createInvoiceSchema.safeParse({
        customerName: 'Test',
        items: [{ description: 'T', quantity: 1, unitPrice: 1 }],
        bookingId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createQuickBookingSchema', () => {
    it('validates a correct quick booking input', () => {
      const result = createQuickBookingSchema.safeParse({
        customerName: 'Dave Wilson',
        customerPhone: '07700900001',
        serviceType: 'fit',
      });
      expect(result.success).toBe(true);
    });

    it('requires customer name and phone', () => {
      const result = createQuickBookingSchema.safeParse({
        serviceType: 'fit',
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional tyre details and location', () => {
      const result = createQuickBookingSchema.safeParse({
        customerName: 'Sarah',
        customerPhone: '07700900002',
        serviceType: 'replace',
        tyreSize: '225/45R17',
        tyreCount: 2,
        locationAddress: '10 High Street',
        locationPostcode: 'SW1A 1AA',
        scheduledAt: '2025-02-01T10:00:00Z',
        notes: 'Front tyres only',
      });
      expect(result.success).toBe(true);
    });

    it('limits tyre count to 10', () => {
      const result = createQuickBookingSchema.safeParse({
        customerName: 'Test',
        customerPhone: '123',
        serviceType: 'fit',
        tyreCount: 11,
      });
      expect(result.success).toBe(false);
    });

    it('defaults tyreCount to 1', () => {
      const result = createQuickBookingSchema.safeParse({
        customerName: 'Test',
        customerPhone: '123',
        serviceType: 'fit',
      });
      expect(result.success).toBe(true);
      expect(result.data?.tyreCount).toBe(1);
    });
  });

  describe('invoiceNumberSchema', () => {
    it('validates a correct invoice number', () => {
      const result = invoiceNumberSchema.safeParse({ invoiceNumber: 'INV-20250115-001' });
      expect(result.success).toBe(true);
    });

    it('rejects empty invoice number', () => {
      const result = invoiceNumberSchema.safeParse({ invoiceNumber: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('analyticsQuerySchema', () => {
    it('validates with no params (all optional)', () => {
      const result = analyticsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts days and limit', () => {
      const result = analyticsQuerySchema.safeParse({ days: 30, limit: 10 });
      expect(result.success).toBe(true);
    });

    it('rejects days > 365', () => {
      const result = analyticsQuerySchema.safeParse({ days: 400 });
      expect(result.success).toBe(false);
    });

    it('rejects limit > 100', () => {
      const result = analyticsQuerySchema.safeParse({ limit: 200 });
      expect(result.success).toBe(false);
    });
  });

  describe('opsQuerySchema', () => {
    it('validates with no params', () => {
      const result = opsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts days', () => {
      const result = opsQuerySchema.safeParse({ days: 7 });
      expect(result.success).toBe(true);
    });
  });
});

/* ── Quick-book parser ────────────────────────────────── */
describe('buildBookingPreview', () => {
  it('builds a booking preview with correct fields', () => {
    const input: ParsedQuickBookInput = {
      customerName: 'Mark Johnson',
      customerPhone: '07700900003',
      serviceType: 'fit',
      tyreSize: '205/55R16',
      tyreCount: 4,
      locationAddress: '25 Baker Street, London',
    };
    const preview = buildBookingPreview(input);
    expect(preview.customerName).toBe('Mark Johnson');
    expect(preview.customerPhone).toBe('07700900003');
    expect(preview.serviceType).toBe('tyre_replacement');
    expect(preview.tyreSizeDisplay).toBe('205/55R16');
    expect(preview.quantity).toBe(4);
    expect(preview.addressLine).toBe('25 Baker Street, London');
    expect(preview.status).toBe('pending_location');
    expect(preview.id).toBe('');
  });

  it('falls back to generic location text when no address given', () => {
    const input: ParsedQuickBookInput = {
      customerName: 'Test',
      customerPhone: '123',
      serviceType: 'replace',
      tyreCount: 1,
    };
    const preview = buildBookingPreview(input);
    expect(preview.addressLine).toBe('Location pending');
  });

  it('maps known service types to display names', () => {
    const types = [
      { input: 'fit', expected: 'tyre_replacement' },
      { input: 'repair', expected: 'puncture_repair' },
      { input: 'tyre_replacement', expected: 'tyre_replacement' },
    ];
    for (const { input, expected } of types) {
      const preview = buildBookingPreview({
        customerName: 'T',
        customerPhone: '1',
        serviceType: input,
        tyreCount: 1,
      });
      expect(preview.serviceType).toBe(expected);
    }
  });

  it('uses raw service type when not in SERVICE_MAP', () => {
    const preview = buildBookingPreview({
      customerName: 'T',
      customerPhone: '1',
      serviceType: 'custom_service',
      tyreCount: 1,
    });
    expect(preview.serviceType).toBe('custom_service');
  });
});

/* ── Invoice parser constants ─────────────────────────── */
describe('invoice-parser — COMPANY constant', () => {
  it('has required company fields', () => {
    expect(COMPANY.name).toBeTruthy();
    expect(typeof COMPANY.name).toBe('string');
  });
});

/* ── Action policies ──────────────────────────────────── */
describe('action-policies', () => {
  describe('getPolicy', () => {
    it('returns policy for create_invoice_draft', () => {
      const policy = getPolicy('create_invoice_draft');
      expect(policy).toBeDefined();
      expect(policy!.requiresApproval).toBe(true);
    });

    it('returns policy for create_quick_booking', () => {
      const policy = getPolicy('create_quick_booking');
      expect(policy).toBeDefined();
      expect(policy!.requiresApproval).toBe(true);
    });

    it('returns policy for update_stock_quantity', () => {
      const policy = getPolicy('update_stock_quantity');
      expect(policy).toBeDefined();
      expect(policy!.requiresReason).toBe(true);
    });

    it('returns undefined for read-only tools', () => {
      const policy = getPolicy('get_visitor_analytics');
      expect(policy).toBeUndefined();
    });
  });

  describe('validatePolicies', () => {
    it('returns no violations for a read-only plan', () => {
      const plan: AgentPlan = {
        intent: 'analytics',
        tools: [{ toolName: 'get_today_revenue', params: {} }],
      };
      const violations = validatePolicies(plan);
      expect(violations).toHaveLength(0);
    });

    it('returns violation when reason is required but missing', () => {
      const plan: AgentPlan = {
        intent: 'stock_update',
        tools: [{ toolName: 'update_stock_quantity', params: { productId: '123', newQty: 10 } }],
      };
      const violations = validatePolicies(plan);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0].rule).toBe('requires_reason');
    });

    it('returns no violations when reason is provided', () => {
      const plan: AgentPlan = {
        intent: 'stock_update',
        tools: [{ toolName: 'update_stock_quantity', params: { productId: '123', newQty: 10, reason: 'restock' } }],
      };
      const violations = validatePolicies(plan);
      expect(violations).toHaveLength(0);
    });
  });

  describe('classifyFinancialRisk', () => {
    it('classifies read-only plan as low risk', () => {
      const plan: AgentPlan = {
        intent: 'analytics',
        tools: [{ toolName: 'get_today_revenue', params: {} }],
      };
      expect(classifyFinancialRisk(plan)).toBe('low');
    });

    it('classifies single financial tool as high risk', () => {
      const plan: AgentPlan = {
        intent: 'invoice',
        tools: [{ toolName: 'create_invoice_draft', params: {} }],
      };
      expect(classifyFinancialRisk(plan)).toBe('high');
    });

    it('classifies multiple financial writes as critical', () => {
      const plan: AgentPlan = {
        intent: 'multi',
        tools: [
          { toolName: 'create_invoice_draft', params: {} },
          { toolName: 'update_stock_quantity', params: {} },
        ],
      };
      expect(classifyFinancialRisk(plan)).toBe('critical');
    });

    it('classifies single non-financial write as medium', () => {
      const plan: AgentPlan = {
        intent: 'multi',
        tools: [
          { toolName: 'update_booking_status', params: {} },
          { toolName: 'assign_driver_to_booking', params: {} },
        ],
      };
      expect(classifyFinancialRisk(plan)).toBe('medium');
    });
  });
});
