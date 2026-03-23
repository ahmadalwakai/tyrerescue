/* ── Zyphon – Startup context builder ─────────────────── */
import { db } from '@/lib/db';
import {
  bookings,
  callMeBack,
  contactMessages,
  notifications,
  tyreProducts,
  drivers,
  users,
  auditLogs,
} from '@/lib/db/schema';
import { eq, sql, gte, desc, and } from 'drizzle-orm';
import type { ZyphonLanguage } from './language';

export interface StartupBriefing {
  bookingsToday: number;
  paidBookings: number;
  todayRevenue: number;
  pendingCallbacks: number;
  unreadMessages: number;
  pendingNotifications: number;
  lowStockCount: number;
  outOfStockCount: number;
}

/** Extended briefing v2 with priorities and recommendations */
export interface StartupBriefingV2 extends StartupBriefing {
  unassignedBookings: number;
  onlineDrivers: number;
  totalDrivers: number;
  recentAuditCount: number;
  criticalBlockers: string[];
  recommendedActions: string[];
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Gather all KPIs for the startup briefing in parallel */
export async function gatherStartupBriefing(): Promise<StartupBriefing> {
  const today = todayStart();

  const [salesRow, cbRow, msgRow, notifRow, stockRow] = await Promise.all([
    db
      .select({
        totalBookings: sql<number>`count(*)::int`,
        paidCount: sql<number>`count(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then 1 end)::int`,
        totalRevenue: sql<number>`coalesce(sum(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then ${bookings.totalAmount}::numeric else 0 end), 0)`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, today))
      .then((r) => r[0]),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(callMeBack)
      .where(eq(callMeBack.status, 'pending'))
      .then((r) => r[0]),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactMessages)
      .where(eq(contactMessages.status, 'unread'))
      .then((r) => r[0]),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.status, 'pending'))
      .then((r) => r[0]),

    db
      .select({
        lowStockCount: sql<number>`count(case when ${tyreProducts.stockNew} > 0 and ${tyreProducts.stockNew} <= 3 and ${tyreProducts.isLocalStock} = true then 1 end)::int`,
        outOfStockCount: sql<number>`count(case when ${tyreProducts.stockNew} = 0 and ${tyreProducts.isLocalStock} = true then 1 end)::int`,
      })
      .from(tyreProducts)
      .where(eq(tyreProducts.availableNew, true))
      .then((r) => r[0]),
  ]);

  return {
    bookingsToday: salesRow.totalBookings,
    paidBookings: salesRow.paidCount,
    todayRevenue: Number(salesRow.totalRevenue),
    pendingCallbacks: cbRow.count,
    unreadMessages: msgRow.count,
    pendingNotifications: notifRow.count,
    lowStockCount: stockRow.lowStockCount,
    outOfStockCount: stockRow.outOfStockCount,
  };
}

/** Format the startup briefing into a human-readable message */
export function formatStartupBriefing(
  data: StartupBriefing,
  lang: ZyphonLanguage,
): string {
  if (lang === 'ar') {
    return formatBriefingArabic(data);
  }
  return formatBriefingEnglish(data);
}

function formatBriefingArabic(d: StartupBriefing): string {
  const parts: string[] = [];
  if (d.bookingsToday > 0) {
    parts.push(`${d.bookingsToday} حجز اليوم (${d.paidBookings} مدفوع، £${d.todayRevenue.toFixed(2)})`);
  } else {
    parts.push('ما في حجوزات اليوم بعد');
  }
  if (d.pendingCallbacks > 0) parts.push(`${d.pendingCallbacks} طلب اتصال بالانتظار`);
  if (d.unreadMessages > 0) parts.push(`${d.unreadMessages} رسالة ما مقروءة`);
  if (d.pendingNotifications > 0) parts.push(`${d.pendingNotifications} اشعار بالانتظار`);
  if (d.lowStockCount > 0) parts.push(`${d.lowStockCount} تاير قرب يخلص`);
  if (d.outOfStockCount > 0) parts.push(`${d.outOfStockCount} تاير خلص`);
  return parts.join('\n');
}

function formatBriefingEnglish(d: StartupBriefing): string {
  const parts: string[] = [];
  if (d.bookingsToday > 0) {
    parts.push(`${d.bookingsToday} booking${d.bookingsToday > 1 ? 's' : ''} today (${d.paidBookings} paid, £${d.todayRevenue.toFixed(2)} revenue)`);
  } else {
    parts.push('No bookings yet today');
  }
  if (d.pendingCallbacks > 0) parts.push(`${d.pendingCallbacks} pending callback${d.pendingCallbacks > 1 ? 's' : ''}`);
  if (d.unreadMessages > 0) parts.push(`${d.unreadMessages} unread message${d.unreadMessages > 1 ? 's' : ''}`);
  if (d.pendingNotifications > 0) parts.push(`${d.pendingNotifications} pending notification${d.pendingNotifications > 1 ? 's' : ''}`);
  if (d.lowStockCount > 0) parts.push(`${d.lowStockCount} low stock item${d.lowStockCount > 1 ? 's' : ''}`);
  if (d.outOfStockCount > 0) parts.push(`${d.outOfStockCount} out of stock`);
  return parts.join('\n');
}

/* ── Startup Briefing V2 — Extended intelligence ─────── */

/** Gather extended startup briefing with priorities and recommendations */
export async function gatherStartupBriefingV2(): Promise<StartupBriefingV2> {
  const base = await gatherStartupBriefing();
  const today = todayStart();

  const [unassignedRow, driverRow, auditRow] = await Promise.all([
    // Paid bookings without driver
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'paid'),
          sql`${bookings.driverId} IS NULL`,
        ),
      )
      .then((r) => r[0]),

    // Driver availability
    db
      .select({
        total: sql<number>`count(*)::int`,
        online: sql<number>`count(case when ${drivers.isOnline} = true then 1 end)::int`,
      })
      .from(drivers)
      .then((r) => r[0]),

    // Recent audit events (last 24h)
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, today))
      .then((r) => r[0]),
  ]);

  // Build critical blockers
  const criticalBlockers: string[] = [];
  if (unassignedRow.count > 0) {
    criticalBlockers.push(`${unassignedRow.count} paid booking${unassignedRow.count > 1 ? 's' : ''} need driver assignment`);
  }
  if (driverRow.online === 0 && driverRow.total > 0) {
    criticalBlockers.push('All drivers offline');
  }
  if (base.outOfStockCount > 3) {
    criticalBlockers.push(`${base.outOfStockCount} products out of stock`);
  }

  // Build recommended actions
  const recommendedActions: string[] = [];
  if (unassignedRow.count > 0) {
    recommendedActions.push('Assign drivers to waiting bookings');
  }
  if (base.pendingCallbacks > 0) {
    recommendedActions.push('Clear pending callbacks');
  }
  if (base.unreadMessages > 5) {
    recommendedActions.push('Review unread messages');
  }
  if (base.lowStockCount > 0) {
    recommendedActions.push('Restock low-stock items');
  }

  return {
    ...base,
    unassignedBookings: unassignedRow.count,
    onlineDrivers: driverRow.online,
    totalDrivers: driverRow.total,
    recentAuditCount: auditRow.count,
    criticalBlockers,
    recommendedActions,
  };
}

/** Format the extended startup briefing */
export function formatStartupBriefingV2(
  data: StartupBriefingV2,
  lang: ZyphonLanguage,
): string {
  // Start with base briefing
  let text = formatStartupBriefing(data, lang);

  if (lang === 'ar') {
    // Driver status
    if (data.totalDrivers > 0) {
      text += `\n${data.onlineDrivers}/${data.totalDrivers} سواق اونلاين`;
    }
    if (data.unassignedBookings > 0) {
      text += `\n⚠️ ${data.unassignedBookings} حجز يحتاج سواق`;
    }
    // Critical blockers
    if (data.criticalBlockers.length > 0) {
      text += '\n\n🚨 مشاكل عاجلة:';
      for (const b of data.criticalBlockers) text += `\n• ${b}`;
    }
    // Recommended actions
    if (data.recommendedActions.length > 0) {
      text += '\n\n💡 مقترحات:';
      for (const a of data.recommendedActions) text += `\n• ${a}`;
    }
  } else {
    // English
    if (data.totalDrivers > 0) {
      text += `\n${data.onlineDrivers}/${data.totalDrivers} driver${data.totalDrivers > 1 ? 's' : ''} online`;
    }
    if (data.unassignedBookings > 0) {
      text += `\n⚠️ ${data.unassignedBookings} booking${data.unassignedBookings > 1 ? 's' : ''} awaiting driver`;
    }
    // Critical blockers
    if (data.criticalBlockers.length > 0) {
      text += '\n\n🚨 Critical:';
      for (const b of data.criticalBlockers) text += `\n• ${b}`;
    }
    // Recommended actions
    if (data.recommendedActions.length > 0) {
      text += '\n\n💡 Suggested:';
      for (const a of data.recommendedActions) text += `\n• ${a}`;
    }
  }

  return text;
}
