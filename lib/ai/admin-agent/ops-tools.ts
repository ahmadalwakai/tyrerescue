/* ── Zyphon – Advanced Operational Tools (Phase 3) ────── */

import { db } from '@/lib/db';
import {
  bookings,
  payments,
  refunds,
  drivers,
  users,
  tyreProducts,
  inventoryMovements,
  bookingStatusHistory,
  auditLogs,
  quickBookings,
  invoices,
  siteVisitors,
  demandSnapshots,
  callMeBack,
  contactMessages,
} from '@/lib/db/schema';
import { eq, and, sql, gte, desc, lte, count } from 'drizzle-orm';
import type { ToolResult } from './types';

/* ── Helpers ──────────────────────────────────────────── */

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ── Revenue & Financial ──────────────────────────────── */

export async function getTodayRevenueData(): Promise<ToolResult> {
  const today = todayStart();
  const [result] = await db
    .select({
      totalRevenue: sql<number>`coalesce(sum(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then ${bookings.totalAmount}::numeric else 0 end), 0)`,
      bookingCount: sql<number>`count(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then 1 end)::int`,
      avgOrderValue: sql<number>`coalesce(avg(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then ${bookings.totalAmount}::numeric end), 0)`,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, today));

  return {
    success: true,
    data: {
      totalRevenue: Number(result.totalRevenue),
      bookingCount: result.bookingCount,
      avgOrderValue: Math.round(Number(result.avgOrderValue) * 100) / 100,
    },
  };
}

export async function getOutstandingPaymentsData(): Promise<ToolResult> {
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerName: invoices.customerName,
      totalAmount: invoices.totalAmount,
      dueDate: invoices.dueDate,
      status: invoices.status,
    })
    .from(invoices)
    .where(
      and(
        sql`${invoices.status} IN ('issued', 'sent', 'overdue')`,
        sql`${invoices.deletedAt} IS NULL`,
      ),
    )
    .orderBy(invoices.dueDate)
    .limit(20);

  const [total] = await db
    .select({
      totalOutstanding: sql<number>`coalesce(sum(${invoices.totalAmount}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        sql`${invoices.status} IN ('issued', 'sent', 'overdue')`,
        sql`${invoices.deletedAt} IS NULL`,
      ),
    );

  return {
    success: true,
    data: {
      totalOutstanding: Number(total.totalOutstanding),
      count: total.count,
      invoices: rows,
    },
  };
}

export async function getRefundSummaryData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  const [stats] = await db
    .select({
      totalRefunds: sql<number>`coalesce(sum(${refunds.amount}::numeric), 0)`,
      refundCount: sql<number>`count(*)::int`,
    })
    .from(refunds)
    .where(gte(refunds.createdAt, since));

  const recent = await db
    .select({
      id: refunds.id,
      amount: refunds.amount,
      reason: refunds.reason,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .where(gte(refunds.createdAt, since))
    .orderBy(desc(refunds.createdAt))
    .limit(10);

  return {
    success: true,
    data: {
      period: `${days} days`,
      totalRefunded: Number(stats.totalRefunds),
      refundCount: stats.refundCount,
      recent,
    },
  };
}

export async function getPaymentFailuresData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 7;
  const since = daysAgo(days);

  const rows = await db
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      amount: payments.amount,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(
      and(
        gte(payments.createdAt, since),
        sql`${payments.status} IN ('failed', 'requires_payment_method', 'canceled')`,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(20);

  return {
    success: true,
    data: { period: `${days} days`, failedPayments: rows, count: rows.length },
  };
}

/* ── Driver Performance ───────────────────────────────── */

export async function getDriverPerformanceData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 7;
  const since = daysAgo(days);

  const rows = await db
    .select({
      driverId: bookings.driverId,
      driverName: users.name,
      totalJobs: sql<number>`count(*)::int`,
      completedJobs: sql<number>`count(case when ${bookings.status} = 'completed' then 1 end)::int`,
      cancelledJobs: sql<number>`count(case when ${bookings.status} = 'cancelled' then 1 end)::int`,
      totalRevenue: sql<number>`coalesce(sum(case when ${bookings.status} = 'completed' then ${bookings.totalAmount}::numeric else 0 end), 0)`,
      avgCompletionTime: sql<number>`coalesce(avg(extract(epoch from (${bookings.completedAt} - ${bookings.assignedAt})) / 3600), 0)`,
    })
    .from(bookings)
    .leftJoin(drivers, eq(bookings.driverId, drivers.id))
    .leftJoin(users, eq(drivers.userId, users.id))
    .where(
      and(
        gte(bookings.createdAt, since),
        sql`${bookings.driverId} IS NOT NULL`,
      ),
    )
    .groupBy(bookings.driverId, users.name)
    .orderBy(sql`count(*) desc`);

  return {
    success: true,
    data: rows.map((r) => ({
      ...r,
      totalRevenue: Number(r.totalRevenue),
      avgCompletionTimeHrs: Math.round(Number(r.avgCompletionTime) * 10) / 10,
      completionRate: r.totalJobs > 0 ? Math.round((r.completedJobs / r.totalJobs) * 100) : 0,
    })),
  };
}

export async function getDriverAssignmentGapsData(): Promise<ToolResult> {
  // Paid bookings waiting for driver assignment
  const rows = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      customerName: bookings.customerName,
      status: bookings.status,
      createdAt: bookings.createdAt,
      waitingHours: sql<number>`round(extract(epoch from (now() - ${bookings.createdAt})) / 3600, 1)`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'paid'),
        sql`${bookings.driverId} IS NULL`,
      ),
    )
    .orderBy(bookings.createdAt)
    .limit(20);

  return { success: true, data: { unassignedBookings: rows, count: rows.length } };
}

/* ── Product / Inventory ──────────────────────────────── */

export async function getPopularTyreSizesData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  const rows = await db
    .select({
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      orderCount: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(${bookings.totalAmount}::numeric), 0)`,
    })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, since),
        sql`${bookings.tyreSizeDisplay} IS NOT NULL`,
        sql`${bookings.status} NOT IN ('draft','pricing_ready','cancelled','payment_failed')`,
      ),
    )
    .groupBy(bookings.tyreSizeDisplay)
    .orderBy(sql`count(*) desc`)
    .limit(15);

  return { success: true, data: rows.map((r) => ({ ...r, totalRevenue: Number(r.totalRevenue) })) };
}

export async function getStockMovementSummaryData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 7;
  const since = daysAgo(days);

  const [stats] = await db
    .select({
      totalMovements: sql<number>`count(*)::int`,
      totalSold: sql<number>`coalesce(sum(case when ${inventoryMovements.quantityDelta} < 0 then abs(${inventoryMovements.quantityDelta}) else 0 end), 0)::int`,
      totalAdded: sql<number>`coalesce(sum(case when ${inventoryMovements.quantityDelta} > 0 then ${inventoryMovements.quantityDelta} else 0 end), 0)::int`,
    })
    .from(inventoryMovements)
    .where(gte(inventoryMovements.createdAt, since));

  const topMovers = await db
    .select({
      tyreId: inventoryMovements.tyreId,
      brand: tyreProducts.brand,
      sizeDisplay: tyreProducts.sizeDisplay,
      totalSold: sql<number>`coalesce(sum(case when ${inventoryMovements.quantityDelta} < 0 then abs(${inventoryMovements.quantityDelta}) else 0 end), 0)::int`,
    })
    .from(inventoryMovements)
    .leftJoin(tyreProducts, eq(inventoryMovements.tyreId, tyreProducts.id))
    .where(gte(inventoryMovements.createdAt, since))
    .groupBy(inventoryMovements.tyreId, tyreProducts.brand, tyreProducts.sizeDisplay)
    .orderBy(sql`sum(case when ${inventoryMovements.quantityDelta} < 0 then abs(${inventoryMovements.quantityDelta}) else 0 end) desc`)
    .limit(10);

  return { success: true, data: { period: `${days} days`, ...stats, topMovers } };
}

/* ── Customer Analytics ───────────────────────────────── */

export async function getCustomerRepeatRateData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 90;
  const since = daysAgo(days);

  const [stats] = await db
    .select({
      totalCustomers: sql<number>`count(distinct ${bookings.customerPhone})::int`,
      repeatCustomers: sql<number>`count(distinct case when customer_count > 1 then phone end)::int`,
    })
    .from(
      db.select({
        phone: bookings.customerPhone,
        customer_count: sql<number>`count(*)`.as('customer_count'),
      })
        .from(bookings)
        .where(
          and(
            gte(bookings.createdAt, since),
            sql`${bookings.status} NOT IN ('draft','pricing_ready','cancelled','payment_failed')`,
          ),
        )
        .groupBy(bookings.customerPhone)
        .as('customer_stats'),
    );

  const rate = stats.totalCustomers > 0
    ? Math.round((stats.repeatCustomers / stats.totalCustomers) * 100)
    : 0;

  return {
    success: true,
    data: { period: `${days} days`, totalCustomers: stats.totalCustomers, repeatCustomers: stats.repeatCustomers, repeatRate: `${rate}%` },
  };
}

export async function getTopCustomersData(params: { days?: number; limit?: number }): Promise<ToolResult> {
  const days = params.days ?? 90;
  const limit = params.limit ?? 10;
  const since = daysAgo(days);

  const rows = await db
    .select({
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      bookingCount: sql<number>`count(*)::int`,
      totalSpent: sql<number>`coalesce(sum(${bookings.totalAmount}::numeric), 0)`,
      lastBooking: sql<string>`max(${bookings.createdAt}::text)`,
    })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, since),
        sql`${bookings.status} NOT IN ('draft','pricing_ready','cancelled','payment_failed')`,
      ),
    )
    .groupBy(bookings.customerName, bookings.customerPhone)
    .orderBy(sql`count(*) desc`)
    .limit(limit);

  return { success: true, data: rows.map((r) => ({ ...r, totalSpent: Number(r.totalSpent) })) };
}

/* ── Booking Analytics ────────────────────────────────── */

export async function getCancelledBookingsAnalysisData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  const [stats] = await db
    .select({
      totalCancelled: sql<number>`count(*)::int`,
      lostRevenue: sql<number>`coalesce(sum(${bookings.totalAmount}::numeric), 0)`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'cancelled'),
        gte(bookings.createdAt, since),
      ),
    );

  // Cancellation reasons from status history
  const reasons = await db
    .select({
      note: bookingStatusHistory.note,
      count: sql<number>`count(*)::int`,
    })
    .from(bookingStatusHistory)
    .where(
      and(
        eq(bookingStatusHistory.toStatus, 'cancelled'),
        gte(bookingStatusHistory.createdAt, since),
      ),
    )
    .groupBy(bookingStatusHistory.note)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  return {
    success: true,
    data: {
      period: `${days} days`,
      totalCancelled: stats.totalCancelled,
      lostRevenue: Number(stats.lostRevenue),
      topReasons: reasons,
    },
  };
}

export async function getNoShowAnalysisData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  const [stats] = await db
    .select({
      totalNoShows: sql<number>`count(case when ${bookings.status} = 'no_show' then 1 end)::int`,
      totalCompletedPeriod: sql<number>`count(case when ${bookings.status} NOT IN ('draft','pricing_ready','cancelled','payment_failed') then 1 end)::int`,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, since));

  const rate = stats.totalCompletedPeriod > 0
    ? Math.round((stats.totalNoShows / stats.totalCompletedPeriod) * 100)
    : 0;

  return {
    success: true,
    data: { period: `${days} days`, totalNoShows: stats.totalNoShows, noShowRate: `${rate}%` },
  };
}

export async function getPeakBookingHoursData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  const rows = await db
    .select({
      hour: sql<number>`extract(hour from ${bookings.createdAt})::int`,
      bookingCount: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, since))
    .groupBy(sql`extract(hour from ${bookings.createdAt})`)
    .orderBy(sql`count(*) desc`);

  return { success: true, data: { period: `${days} days`, peakHours: rows } };
}

export async function getServiceDemandTrendsData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  const rows = await db
    .select({
      serviceType: bookings.serviceType,
      bookingCount: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(${bookings.totalAmount}::numeric), 0)`,
    })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, since),
        sql`${bookings.status} NOT IN ('draft','pricing_ready','cancelled','payment_failed')`,
      ),
    )
    .groupBy(bookings.serviceType)
    .orderBy(sql`count(*) desc`);

  return { success: true, data: rows.map((r) => ({ ...r, totalRevenue: Number(r.totalRevenue) })) };
}

export async function getLocationDemandHeatmapData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  // Group by city/area from site visitors
  const visitorLocations = await db
    .select({
      city: siteVisitors.city,
      visitorCount: sql<number>`count(*)::int`,
    })
    .from(siteVisitors)
    .where(
      and(
        gte(siteVisitors.createdAt, since),
        sql`${siteVisitors.city} IS NOT NULL AND ${siteVisitors.city} != ''`,
      ),
    )
    .groupBy(siteVisitors.city)
    .orderBy(sql`count(*) desc`)
    .limit(15);

  // Also group bookings by postcode area (first part)
  const bookingLocations = await db
    .select({
      area: sql<string>`substring(${bookings.addressLine} from '[A-Z]{1,2}[0-9]{1,2}')`,
      bookingCount: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, since))
    .groupBy(sql`substring(${bookings.addressLine} from '[A-Z]{1,2}[0-9]{1,2}')`)
    .orderBy(sql`count(*) desc`)
    .limit(15);

  return { success: true, data: { visitorLocations, bookingLocations } };
}

export async function getQuoteToBookingRateData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  const [stats] = await db
    .select({
      totalQuotes: sql<number>`count(*)::int`,
      convertedCount: sql<number>`count(case when ${bookings.status} NOT IN ('draft','pricing_ready','cancelled','payment_failed') then 1 end)::int`,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, since));

  const rate = stats.totalQuotes > 0
    ? Math.round((stats.convertedCount / stats.totalQuotes) * 100)
    : 0;

  return {
    success: true,
    data: { period: `${days} days`, totalQuotes: stats.totalQuotes, converted: stats.convertedCount, conversionRate: `${rate}%` },
  };
}

export async function getBookingCompletionRateData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 30;
  const since = daysAgo(days);

  const [stats] = await db
    .select({
      totalPaid: sql<number>`count(case when ${bookings.status} NOT IN ('draft','pricing_ready','cancelled','payment_failed') then 1 end)::int`,
      completed: sql<number>`count(case when ${bookings.status} = 'completed' then 1 end)::int`,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, since));

  const rate = stats.totalPaid > 0
    ? Math.round((stats.completed / stats.totalPaid) * 100)
    : 0;

  return {
    success: true,
    data: { period: `${days} days`, totalPaid: stats.totalPaid, completed: stats.completed, completionRate: `${rate}%` },
  };
}

export async function getAbandonedBookingSignalsData(params: { days?: number }): Promise<ToolResult> {
  const days = params.days ?? 7;
  const since = daysAgo(days);

  // Bookings stuck in draft or pricing_ready
  const abandoned = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      status: bookings.status,
      createdAt: bookings.createdAt,
      ageHours: sql<number>`round(extract(epoch from (now() - ${bookings.createdAt})) / 3600, 1)`,
    })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, since),
        sql`${bookings.status} IN ('draft', 'pricing_ready')`,
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(20);

  // Also check quick bookings that never finalized
  const abandonedQB = await db
    .select({
      id: quickBookings.id,
      customerName: quickBookings.customerName,
      customerPhone: quickBookings.customerPhone,
      status: quickBookings.status,
      createdAt: quickBookings.createdAt,
    })
    .from(quickBookings)
    .where(
      and(
        gte(quickBookings.createdAt, since),
        sql`${quickBookings.bookingId} IS NULL`,
        sql`${quickBookings.status} != 'finalized'`,
      ),
    )
    .orderBy(desc(quickBookings.createdAt))
    .limit(10);

  return {
    success: true,
    data: {
      abandonedBookings: abandoned,
      abandonedQuickBookings: abandonedQB,
      totalAbandoned: abandoned.length + abandonedQB.length,
    },
  };
}

/* ── Admin / Operations ───────────────────────────────── */

export async function getAdminWorkloadSummaryData(): Promise<ToolResult> {
  const today = todayStart();

  const [bookingStats] = await db
    .select({
      todayBookings: sql<number>`count(case when ${bookings.createdAt} >= ${today} then 1 end)::int`,
      pendingAssignment: sql<number>`count(case when ${bookings.status} = 'paid' and ${bookings.driverId} IS NULL then 1 end)::int`,
      activeBookings: sql<number>`count(case when ${bookings.status} IN ('driver_assigned','accepted','en_route','arrived','in_progress') then 1 end)::int`,
    })
    .from(bookings);

  const [cbStats] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(callMeBack)
    .where(eq(callMeBack.status, 'pending'));

  const [msgStats] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(eq(contactMessages.status, 'unread'));

  return {
    success: true,
    data: {
      ...bookingStats,
      pendingCallbacks: cbStats.pending,
      unreadMessages: msgStats.unread,
    },
  };
}

export async function getRecentAdminActionsData(params: { limit?: number }): Promise<ToolResult> {
  const limit = params.limit ?? 20;

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorRole: auditLogs.actorRole,
      beforeJson: auditLogs.beforeJson,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return { success: true, data: rows };
}
