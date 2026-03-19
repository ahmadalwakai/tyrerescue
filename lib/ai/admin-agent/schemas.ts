import { z } from 'zod';

/* ── Zod schemas for tool parameters ──────────────────── */

export const stockBySizeSchema = z.object({
  width: z.number().int().min(100).max(400),
  aspect: z.number().int().min(20).max(90),
  rim: z.number().int().min(10).max(24),
});

export const updateStockSchema = z.object({
  productId: z.string().uuid(),
  newStock: z.number().int().min(0),
  quantitySold: z.number().int().min(0).optional(),
  reason: z.string().optional(),
});

export const bookingRefSchema = z.object({
  ref: z.string().min(1).max(30),
});

export const updateBookingStatusSchema = z.object({
  ref: z.string().min(1).max(30),
  newStatus: z.string().min(1),
});

export const assignDriverSchema = z.object({
  ref: z.string().min(1).max(30),
  driverId: z.string().uuid(),
});

export const callbackIdSchema = z.object({
  callbackId: z.string().uuid(),
});

export const messageIdSchema = z.object({
  messageId: z.string().uuid(),
});

export const toggleAvailabilitySchema = z.object({
  productId: z.string().uuid(),
  available: z.boolean(),
});

export const chatSettingsSchema = z.object({
  dailyAskEnabled: z.boolean().optional(),
  dailyAskTime: z.string().nullable().optional(),
  voiceInputEnabled: z.boolean().optional(),
  voiceOutputEnabled: z.boolean().optional(),
  autoOpenEnabled: z.boolean().optional(),
});

export const addInventoryProductSchema = z.object({
  brand: z.string().min(1).max(100),
  pattern: z.string().min(1).max(200),
  width: z.number().int().min(100).max(400),
  aspect: z.number().int().min(20).max(90),
  rim: z.number().int().min(10).max(24),
  season: z.enum(['summer', 'winter', 'allseason']),
  priceNew: z.number().min(0),
  stockNew: z.number().int().min(0).default(0),
});

/** Schema for the LLM plan extraction output */
export const llmPlanSchema = z.object({
  intent: z.string(),
  tools: z.array(z.object({
    toolName: z.string(),
    params: z.record(z.string(), z.unknown()),
  })).min(1).max(5),
  clarificationNeeded: z.string().optional(),
  reasoning: z.string().optional(),
});

/* ── Incoming request schemas ─────────────────────────── */

export const confirmItemSchema = z.object({
  productId: z.string().uuid(),
  newStock: z.number().int().min(0),
  quantitySold: z.number().int().min(1),
});

export const agentRequestSchema = z.object({
  message: z.string().max(2000),
  sessionId: z.string().uuid().nullish(),
  intent: z.enum([
    'chat',
    'greeting',
    'stock_lookup',
    'stock_summary',
    'stock_update',
    'stock_update_confirm',
    'booking_query',
    'alerts',
    'help',
    // New agent intents
    'confirm_action',
    'cancel_action',
  ]).default('chat'),
  payload: z.object({ items: z.array(confirmItemSchema).min(1).max(50) }).optional(),
  confirmationId: z.string().uuid().optional(),
});
