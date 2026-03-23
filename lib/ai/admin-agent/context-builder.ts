/* ── Zyphon – Startup context builder ─────────────────── */
import { db } from '@/lib/db';
import {
  bookings,
  callMeBack,
  contactMessages,
  notifications,
  tyreProducts,
} from '@/lib/db/schema';
import { eq, sql, gte } from 'drizzle-orm';
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
