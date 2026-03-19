import { db } from '@/lib/db';
import {
  tyreProducts,
  bookings,
  callMeBack,
  contactMessages,
  notifications,
  drivers,
  users,
  auditLogs,
  inventoryMovements,
  adminChatSettings,
  bookingTyres,
} from '@/lib/db/schema';
import { eq, and, sql, gte, desc, lte } from 'drizzle-orm';
import { adjustStock } from '@/lib/inventory/stock-service';
import { isValidTransition, getValidNextStates, type BookingStatus } from '@/lib/state-machine';
import type { ToolDefinition, ToolContext, ToolResult } from './types';
import {
  stockBySizeSchema,
  updateStockSchema,
  bookingRefSchema,
  updateBookingStatusSchema,
  assignDriverSchema,
  callbackIdSchema,
  messageIdSchema,
  toggleAvailabilitySchema,
  chatSettingsSchema,
} from './schemas';

/* ── Helpers ──────────────────────────────────────────── */

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function logAudit(
  ctx: ToolContext,
  entityType: string,
  entityId: string,
  action: string,
  before?: unknown,
  after?: unknown,
) {
  await db.insert(auditLogs).values({
    actorUserId: ctx.userId,
    actorRole: ctx.userRole,
    entityType,
    entityId,
    action,
    beforeJson: before ?? null,
    afterJson: after ?? null,
    ipAddress: ctx.ipAddress ?? null,
  });
}

/* ── Read tools ───────────────────────────────────────── */

const getTodayBookings: ToolDefinition = {
  name: 'get_today_bookings',
  kind: 'read',
  description: 'List bookings created today with ref, customer, status, type, size, amount.',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const rows = await db
      .select({
        refNumber: bookings.refNumber,
        customerName: bookings.customerName,
        status: bookings.status,
        bookingType: bookings.bookingType,
        tyreSizeDisplay: bookings.tyreSizeDisplay,
        scheduledAt: bookings.scheduledAt,
        totalAmount: bookings.totalAmount,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, todayStart()))
      .orderBy(desc(bookings.createdAt))
      .limit(20);
    return { success: true, data: rows };
  },
};

const getBookingByRef: ToolDefinition = {
  name: 'get_booking_by_ref',
  kind: 'read',
  description: 'Look up a single booking by its reference number (e.g. TR-1234).',
  requiresConfirmation: false,
  parameterNames: ['ref'],
  async execute(params): Promise<ToolResult> {
    const parsed = bookingRefSchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid booking reference' };
    const ref = parsed.data.ref.toUpperCase();
    const [row] = await db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        customerName: bookings.customerName,
        customerEmail: bookings.customerEmail,
        customerPhone: bookings.customerPhone,
        status: bookings.status,
        bookingType: bookings.bookingType,
        serviceType: bookings.serviceType,
        tyreSizeDisplay: bookings.tyreSizeDisplay,
        vehicleReg: bookings.vehicleReg,
        addressLine: bookings.addressLine,
        scheduledAt: bookings.scheduledAt,
        totalAmount: bookings.totalAmount,
        driverId: bookings.driverId,
        notes: bookings.notes,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);
    if (!row) return { success: false, error: `Booking ${ref} not found` };
    return { success: true, data: row };
  },
};

const getRecentCallbacks: ToolDefinition = {
  name: 'get_recent_callbacks',
  kind: 'read',
  description: 'List pending callback requests.',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const rows = await db
      .select()
      .from(callMeBack)
      .where(eq(callMeBack.status, 'pending'))
      .orderBy(desc(callMeBack.createdAt))
      .limit(20);
    return { success: true, data: rows };
  },
};

const getUnreadMessages: ToolDefinition = {
  name: 'get_unread_messages',
  kind: 'read',
  description: 'List unread contact messages.',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const rows = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.status, 'unread'))
      .orderBy(desc(contactMessages.createdAt))
      .limit(20);
    return { success: true, data: rows };
  },
};

const getStockBySize: ToolDefinition = {
  name: 'get_stock_by_size',
  kind: 'read',
  description: 'Look up stock for a specific tyre size (width/aspect/rim).',
  requiresConfirmation: false,
  parameterNames: ['width', 'aspect', 'rim'],
  async execute(params): Promise<ToolResult> {
    const parsed = stockBySizeSchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid tyre size. Provide width, aspect, rim.' };
    const { width, aspect, rim } = parsed.data;
    const rows = await db
      .select({
        id: tyreProducts.id,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
        stockNew: tyreProducts.stockNew,
        isLocalStock: tyreProducts.isLocalStock,
        priceNew: tyreProducts.priceNew,
        availableNew: tyreProducts.availableNew,
      })
      .from(tyreProducts)
      .where(
        and(
          eq(tyreProducts.width, width),
          eq(tyreProducts.aspect, aspect),
          eq(tyreProducts.rim, rim),
          eq(tyreProducts.availableNew, true),
        )
      );
    return { success: true, data: rows };
  },
};

const getLowStockItems: ToolDefinition = {
  name: 'get_low_stock_items',
  kind: 'read',
  description: 'List local-stock products with stock <= 3 (low stock threshold).',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const rows = await db
      .select({
        id: tyreProducts.id,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
        stockNew: tyreProducts.stockNew,
        priceNew: tyreProducts.priceNew,
      })
      .from(tyreProducts)
      .where(
        and(
          eq(tyreProducts.isLocalStock, true),
          eq(tyreProducts.availableNew, true),
          lte(tyreProducts.stockNew, 3),
        )
      )
      .orderBy(tyreProducts.stockNew)
      .limit(30);
    return { success: true, data: rows };
  },
};

const getInventorySummary: ToolDefinition = {
  name: 'get_inventory_summary',
  kind: 'read',
  description: 'Get aggregate inventory stats: total products, stock count, low-stock alerts.',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const [result] = await db
      .select({
        totalProducts: sql<number>`count(*)::int`,
        totalStock: sql<number>`coalesce(sum(${tyreProducts.stockNew}), 0)::int`,
        localStock: sql<number>`coalesce(sum(case when ${tyreProducts.isLocalStock} = true then ${tyreProducts.stockNew} else 0 end), 0)::int`,
        lowStockCount: sql<number>`count(case when ${tyreProducts.stockNew} > 0 and ${tyreProducts.stockNew} <= 3 and ${tyreProducts.isLocalStock} = true then 1 end)::int`,
        outOfStockCount: sql<number>`count(case when ${tyreProducts.stockNew} = 0 and ${tyreProducts.isLocalStock} = true then 1 end)::int`,
      })
      .from(tyreProducts)
      .where(eq(tyreProducts.availableNew, true));
    return { success: true, data: result };
  },
};

const getDriverStatuses: ToolDefinition = {
  name: 'get_driver_statuses',
  kind: 'read',
  description: 'List all drivers with their current online/offline status.',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const rows = await db
      .select({
        id: drivers.id,
        isOnline: drivers.isOnline,
        status: drivers.status,
        userId: drivers.userId,
        userName: users.name,
        locationAt: drivers.locationAt,
      })
      .from(drivers)
      .leftJoin(users, eq(drivers.userId, users.id));
    return { success: true, data: rows };
  },
};

const getPendingAlerts: ToolDefinition = {
  name: 'get_pending_alerts',
  kind: 'read',
  description: 'Get counts of pending alerts: new bookings, callbacks, messages, notifications.',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const today = todayStart();
    const [bk] = await db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(gte(bookings.createdAt, today));
    const [cb] = await db.select({ count: sql<number>`count(*)::int` }).from(callMeBack).where(eq(callMeBack.status, 'pending'));
    const [msg] = await db.select({ count: sql<number>`count(*)::int` }).from(contactMessages).where(eq(contactMessages.status, 'unread'));
    const [notif] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.status, 'pending'));
    return {
      success: true,
      data: { bookingsToday: bk.count, pendingCallbacks: cb.count, unreadMessages: msg.count, pendingNotifications: notif.count },
    };
  },
};

const getTodaySalesSummary: ToolDefinition = {
  name: 'get_today_sales_summary',
  kind: 'read',
  description: 'Summarize today\'s sales: booking count, total revenue, paid count.',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const today = todayStart();
    const [result] = await db
      .select({
        totalBookings: sql<number>`count(*)::int`,
        paidCount: sql<number>`count(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then 1 end)::int`,
        totalRevenue: sql<number>`coalesce(sum(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then ${bookings.totalAmount}::numeric else 0 end), 0)`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, today));
    return { success: true, data: result };
  },
};

const getRecentAuditEvents: ToolDefinition = {
  name: 'get_recent_audit_events',
  kind: 'read',
  description: 'List the most recent admin audit log entries.',
  requiresConfirmation: false,
  parameterNames: [],
  async execute(): Promise<ToolResult> {
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorRole: auditLogs.actorRole,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(15);
    return { success: true, data: rows };
  },
};

/* ── Write tools ──────────────────────────────────────── */

const updateStockQuantity: ToolDefinition = {
  name: 'update_stock_quantity',
  kind: 'write',
  description: 'Set the stock quantity for a specific product by productId. Use get_stock_by_size first to find the productId.',
  requiresConfirmation: true,
  parameterNames: ['productId', 'newStock', 'quantitySold', 'reason'],
  async execute(params, ctx): Promise<ToolResult> {
    const parsed = updateStockSchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid stock update params' };

    // Re-fetch live stock to prevent stale writes
    const [current] = await db
      .select({ stockNew: tyreProducts.stockNew, brand: tyreProducts.brand, sizeDisplay: tyreProducts.sizeDisplay })
      .from(tyreProducts)
      .where(eq(tyreProducts.id, parsed.data.productId))
      .limit(1);

    if (!current) return { success: false, error: `Product ${parsed.data.productId} not found` };

    const liveStock = current.stockNew ?? 0;
    let targetStock = parsed.data.newStock;
    // If quantitySold is provided, compute from live stock
    if (parsed.data.quantitySold && parsed.data.quantitySold > 0) {
      targetStock = Math.max(0, liveStock - parsed.data.quantitySold);
    }

    const result = await adjustStock({
      productId: parsed.data.productId,
      newStock: targetStock,
      reason: 'manual-edit',
      actor: 'admin',
      actorUserId: ctx.userId,
      note: parsed.data.reason
        ? String(parsed.data.reason)
        : `Agent stock update: ${current.brand} ${current.sizeDisplay} ${liveStock} → ${targetStock}`,
    });

    if (!result.success) return { success: false, error: result.error };

    await logAudit(ctx, 'tyre_product', parsed.data.productId, 'stock_update', { stock: liveStock }, { stock: result.stockAfter });

    return {
      success: true,
      data: { brand: current.brand, size: current.sizeDisplay, stockBefore: liveStock, stockAfter: result.stockAfter },
      before: { stock: liveStock },
      after: { stock: result.stockAfter },
    };
  },
};

const markCallbackDone: ToolDefinition = {
  name: 'mark_callback_done',
  kind: 'write',
  description: 'Mark a callback request as resolved by its ID.',
  requiresConfirmation: true,
  parameterNames: ['callbackId'],
  async execute(params, ctx): Promise<ToolResult> {
    const parsed = callbackIdSchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid callback ID' };

    const [existing] = await db.select().from(callMeBack).where(eq(callMeBack.id, parsed.data.callbackId)).limit(1);
    if (!existing) return { success: false, error: `Callback ${parsed.data.callbackId} not found` };

    await db
      .update(callMeBack)
      .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: ctx.userId })
      .where(eq(callMeBack.id, parsed.data.callbackId));

    await logAudit(ctx, 'callback', parsed.data.callbackId, 'mark_resolved', { status: existing.status }, { status: 'resolved' });

    return {
      success: true,
      data: { name: existing.name, phone: existing.phone },
      before: { status: existing.status },
      after: { status: 'resolved' },
    };
  },
};

const updateBookingStatus: ToolDefinition = {
  name: 'update_booking_status',
  kind: 'write',
  description: 'Change a booking status. Validates against the state machine. Provide ref and newStatus.',
  requiresConfirmation: true,
  parameterNames: ['ref', 'newStatus'],
  async execute(params, ctx): Promise<ToolResult> {
    const parsed = updateBookingStatusSchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid params: need ref and newStatus' };
    const ref = parsed.data.ref.toUpperCase();

    const [booking] = await db
      .select({ id: bookings.id, status: bookings.status, refNumber: bookings.refNumber })
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) return { success: false, error: `Booking ${ref} not found` };

    const fromStatus = booking.status;
    const toStatus = parsed.data.newStatus;

    if (!isValidTransition(fromStatus as BookingStatus, toStatus as BookingStatus)) {
      const valid = getValidNextStates(fromStatus as BookingStatus);
      return {
        success: false,
        error: `Cannot transition ${ref} from "${fromStatus}" to "${toStatus}". Valid next: ${valid.join(', ') || 'none (terminal)'}`,
      };
    }

    await db.update(bookings).set({ status: toStatus, updatedAt: new Date() }).where(eq(bookings.id, booking.id));

    await logAudit(ctx, 'booking', booking.id, 'status_change', { status: fromStatus }, { status: toStatus });

    return {
      success: true,
      data: { ref, fromStatus, toStatus },
      before: { status: fromStatus },
      after: { status: toStatus },
    };
  },
};

const assignDriverToBooking: ToolDefinition = {
  name: 'assign_driver_to_booking',
  kind: 'write',
  description: 'Assign a driver to a booking. Provide booking ref and driverId.',
  requiresConfirmation: true,
  parameterNames: ['ref', 'driverId'],
  async execute(params, ctx): Promise<ToolResult> {
    const parsed = assignDriverSchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid params: need ref and driverId' };
    const ref = parsed.data.ref.toUpperCase();

    const [booking] = await db
      .select({ id: bookings.id, status: bookings.status, refNumber: bookings.refNumber, driverId: bookings.driverId })
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) return { success: false, error: `Booking ${ref} not found` };

    // Must be in paid or driver_assigned status for assignment
    if (!['paid', 'driver_assigned'].includes(booking.status)) {
      return { success: false, error: `Booking ${ref} is "${booking.status}" — must be "paid" or "driver_assigned" for driver assignment` };
    }

    const [driver] = await db
      .select({ id: drivers.id, userId: drivers.userId })
      .from(drivers)
      .where(eq(drivers.id, parsed.data.driverId))
      .limit(1);

    if (!driver) return { success: false, error: `Driver ${parsed.data.driverId} not found` };

    const updates: Record<string, unknown> = {
      driverId: driver.id,
      assignedAt: new Date(),
      updatedAt: new Date(),
    };

    // If paid → driver_assigned transition
    if (booking.status === 'paid') {
      updates.status = 'driver_assigned';
    }

    await db.update(bookings).set(updates).where(eq(bookings.id, booking.id));

    await logAudit(ctx, 'booking', booking.id, 'assign_driver', { driverId: booking.driverId }, { driverId: driver.id });

    return {
      success: true,
      data: { ref, driverId: driver.id, newStatus: updates.status ?? booking.status },
      before: { driverId: booking.driverId },
      after: { driverId: driver.id },
    };
  },
};

const toggleProductAvailability: ToolDefinition = {
  name: 'toggle_product_availability',
  kind: 'write',
  description: 'Toggle a product\'s availability on/off by productId.',
  requiresConfirmation: true,
  parameterNames: ['productId', 'available'],
  async execute(params, ctx): Promise<ToolResult> {
    const parsed = toggleAvailabilitySchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid params: need productId and available (boolean)' };

    const [current] = await db
      .select({ id: tyreProducts.id, availableNew: tyreProducts.availableNew, brand: tyreProducts.brand, sizeDisplay: tyreProducts.sizeDisplay })
      .from(tyreProducts)
      .where(eq(tyreProducts.id, parsed.data.productId))
      .limit(1);

    if (!current) return { success: false, error: `Product ${parsed.data.productId} not found` };

    await db.update(tyreProducts).set({ availableNew: parsed.data.available, updatedAt: new Date() }).where(eq(tyreProducts.id, parsed.data.productId));

    await logAudit(ctx, 'tyre_product', parsed.data.productId, 'toggle_availability', { available: current.availableNew }, { available: parsed.data.available });

    return {
      success: true,
      data: { brand: current.brand, size: current.sizeDisplay, available: parsed.data.available },
      before: { available: current.availableNew },
      after: { available: parsed.data.available },
    };
  },
};

const markMessageRead: ToolDefinition = {
  name: 'mark_message_read',
  kind: 'write',
  description: 'Mark a contact message as read by its ID.',
  requiresConfirmation: false,
  parameterNames: ['messageId'],
  async execute(params, ctx): Promise<ToolResult> {
    const parsed = messageIdSchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid message ID' };

    const [existing] = await db.select({ id: contactMessages.id, status: contactMessages.status }).from(contactMessages).where(eq(contactMessages.id, parsed.data.messageId)).limit(1);
    if (!existing) return { success: false, error: `Message ${parsed.data.messageId} not found` };

    await db.update(contactMessages).set({ status: 'read' }).where(eq(contactMessages.id, parsed.data.messageId));

    await logAudit(ctx, 'contact_message', parsed.data.messageId, 'mark_read', { status: existing.status }, { status: 'read' });

    return { success: true, data: { messageId: parsed.data.messageId }, before: { status: existing.status }, after: { status: 'read' } };
  },
};

const updateChatSettings: ToolDefinition = {
  name: 'update_chat_settings',
  kind: 'write',
  description: 'Update admin chatbot settings (daily ask, voice, auto-open).',
  requiresConfirmation: false,
  parameterNames: ['dailyAskEnabled', 'dailyAskTime', 'voiceInputEnabled', 'voiceOutputEnabled', 'autoOpenEnabled'],
  async execute(params, ctx): Promise<ToolResult> {
    const parsed = chatSettingsSchema.safeParse(params);
    if (!parsed.success) return { success: false, error: 'Invalid settings' };

    const [existing] = await db.select().from(adminChatSettings).where(eq(adminChatSettings.userId, ctx.userId)).limit(1);

    const updates = { ...parsed.data, updatedAt: new Date() };
    if (existing) {
      await db.update(adminChatSettings).set(updates).where(eq(adminChatSettings.userId, ctx.userId));
    } else {
      await db.insert(adminChatSettings).values({ userId: ctx.userId, ...updates });
    }

    return { success: true, data: { updated: Object.keys(parsed.data) } };
  },
};

/* ── Tool registry ────────────────────────────────────── */

export const allTools: ToolDefinition[] = [
  // Read
  getTodayBookings,
  getBookingByRef,
  getRecentCallbacks,
  getUnreadMessages,
  getStockBySize,
  getLowStockItems,
  getInventorySummary,
  getDriverStatuses,
  getPendingAlerts,
  getTodaySalesSummary,
  getRecentAuditEvents,
  // Write
  updateStockQuantity,
  markCallbackDone,
  updateBookingStatus,
  assignDriverToBooking,
  toggleProductAvailability,
  markMessageRead,
  updateChatSettings,
];

export const toolMap = new Map<string, ToolDefinition>(allTools.map((t) => [t.name, t]));
