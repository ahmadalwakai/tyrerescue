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

/* ── Phase 3: New schemas ─────────────────────────────── */

/** Schema for creating an invoice via chat */
export const createInvoiceSchema = z.object({
  customerName: z.string().min(1).max(255),
  customerEmail: z.string().max(255).optional(),
  customerPhone: z.string().max(20).optional(),
  customerAddress: z.string().max(500).optional(),
  items: z.array(z.object({
    description: z.string().min(1).max(500),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
  })).min(1).max(20),
  notes: z.string().max(1000).optional(),
  dueDate: z.string().optional(),
  bookingId: z.string().uuid().optional(),
});

/** Schema for creating a quick booking via chat */
export const createQuickBookingSchema = z.object({
  customerName: z.string().min(1).max(255),
  customerPhone: z.string().min(1).max(20),
  customerEmail: z.string().max(255).optional(),
  serviceType: z.string().min(1).max(50),
  tyreSize: z.string().max(20).optional(),
  tyreCount: z.number().int().min(1).max(10).default(1),
  locationAddress: z.string().max(500).optional(),
  locationPostcode: z.string().max(10).optional(),
  scheduledAt: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

/** Schema for invoice number lookup */
export const invoiceNumberSchema = z.object({
  invoiceNumber: z.string().min(1).max(30),
});

/** Schema for analytics queries with optional days/limit */
export const analyticsQuerySchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/** Schema for ops queries with optional days/limit */
export const opsQuerySchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
