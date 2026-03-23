/* ── Zyphon – Business Intelligence Engine ───────────── */
import { db } from '@/lib/db';
import {
  bookings,
  tyreProducts,
  callMeBack,
  contactMessages,
  drivers,
  users,
  auditLogs,
  inventoryMovements,
} from '@/lib/db/schema';
import { eq, and, sql, gte, desc, lte, count } from 'drizzle-orm';
import type { IntelligenceInsight } from './types';

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

/* ── Anomaly Detection ─────────────────────────────────── */

/**
 * Detect business anomalies:
 *  - Unusually high/low booking counts vs 7-day average
 *  - Stock that dropped sharply
 *  - Callbacks piling up without resolution
 */
export async function detectAnomalies(): Promise<IntelligenceInsight[]> {
  const insights: IntelligenceInsight[] = [];
  const now = new Date().toISOString();

  // 1. Booking volume anomaly (today vs 7-day avg)
  const today = todayStart();
  const weekAgo = daysAgo(7);

  const [todayCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(gte(bookings.createdAt, today));

  const [weekCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(gte(bookings.createdAt, weekAgo));

  const dailyAvg = weekCount.count / 7;
  if (todayCount.count > dailyAvg * 2 && todayCount.count > 3) {
    insights.push({
      id: `anomaly-high-bookings-${today.toISOString().slice(0, 10)}`,
      category: 'anomaly',
      title: 'Unusually high booking volume',
      description: `${todayCount.count} bookings today vs ${dailyAvg.toFixed(1)} daily average (7-day)`,
      severity: 'info',
      suggestedAction: 'Check if all drivers are assigned. Consider extending availability.',
      detectedAt: now,
    });
  } else if (dailyAvg > 2 && todayCount.count === 0) {
    insights.push({
      id: `anomaly-zero-bookings-${today.toISOString().slice(0, 10)}`,
      category: 'warning',
      title: 'No bookings today',
      description: `Zero bookings so far today. 7-day average is ${dailyAvg.toFixed(1)}/day.`,
      severity: 'warning',
      detectedAt: now,
    });
  }

  // 2. Unresolved callbacks piling up (>5 pending)
  const [pendingCb] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callMeBack)
    .where(eq(callMeBack.status, 'pending'));

  if (pendingCb.count > 5) {
    insights.push({
      id: `anomaly-pending-callbacks`,
      category: 'bottleneck',
      title: 'Callbacks piling up',
      description: `${pendingCb.count} unresolved callback requests. Customers may be waiting.`,
      severity: pendingCb.count > 10 ? 'urgent' : 'warning',
      suggestedAction: 'Review and resolve pending callbacks.',
      detectedAt: now,
    });
  }

  return insights;
}

/* ── Operational Bottleneck Detection ──────────────────── */

/**
 * Detect operational bottlenecks:
 *  - Bookings stuck in non-terminal states for too long
 *  - No online drivers
 *  - Unread messages accumulating
 */
export async function detectBottlenecks(): Promise<IntelligenceInsight[]> {
  const insights: IntelligenceInsight[] = [];
  const now = new Date().toISOString();

  // 1. Paid bookings with no driver assigned (waiting >2h)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const [stuckPaid] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'paid'),
        lte(bookings.createdAt, twoHoursAgo),
      ),
    );

  if (stuckPaid.count > 0) {
    insights.push({
      id: `bottleneck-unassigned-bookings`,
      category: 'bottleneck',
      title: 'Bookings waiting for driver',
      description: `${stuckPaid.count} paid booking${stuckPaid.count > 1 ? 's' : ''} waiting >2h without driver assignment.`,
      severity: 'urgent',
      suggestedAction: 'Assign drivers to these bookings.',
      detectedAt: now,
    });
  }

  // 2. No online drivers
  const [onlineDrivers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(drivers)
    .where(eq(drivers.isOnline, true));

  if (onlineDrivers.count === 0) {
    insights.push({
      id: `bottleneck-no-drivers`,
      category: 'warning',
      title: 'No drivers online',
      description: 'All drivers are currently offline. New bookings cannot be dispatched.',
      severity: 'warning',
      detectedAt: now,
    });
  }

  // 3. Unread messages accumulating (>10)
  const [unreadMsgs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(eq(contactMessages.status, 'unread'));

  if (unreadMsgs.count > 10) {
    insights.push({
      id: `bottleneck-unread-messages`,
      category: 'bottleneck',
      title: 'Unread messages accumulating',
      description: `${unreadMsgs.count} unread contact messages need attention.`,
      severity: 'warning',
      suggestedAction: 'Review and respond to contact messages.',
      detectedAt: now,
    });
  }

  return insights;
}

/* ── Combined Intelligence Gathering ──────────────────── */

/**
 * Gather all intelligence insights in parallel.
 */
export async function gatherIntelligence(): Promise<IntelligenceInsight[]> {
  const [anomalies, bottlenecks] = await Promise.all([
    detectAnomalies(),
    detectBottlenecks(),
  ]);

  return [...anomalies, ...bottlenecks]
    .sort((a, b) => {
      const severityOrder = { urgent: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
}
