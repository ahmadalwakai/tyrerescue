/* ── Zyphon – Business Recommendation Engine (Phase 3) ── */

import { db } from '@/lib/db';
import {
  bookings,
  tyreProducts,
  siteVisitors,
  demandSnapshots,
  inventoryMovements,
  callMeBack,
} from '@/lib/db/schema';
import { sql, gte, eq, and, lte } from 'drizzle-orm';
import type { Recommendation } from './types';

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

/* ── Recommendation Generators ────────────────────────── */

async function checkRevenueOpportunities(): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];
  const weekAgo = daysAgo(7);
  const twoWeeksAgo = daysAgo(14);

  const [thisWeek] = await db
    .select({
      revenue: sql<number>`coalesce(sum(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then ${bookings.totalAmount}::numeric else 0 end), 0)`,
      bookingCount: sql<number>`count(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then 1 end)::int`,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, weekAgo));

  const [lastWeek] = await db
    .select({
      revenue: sql<number>`coalesce(sum(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then ${bookings.totalAmount}::numeric else 0 end), 0)`,
      bookingCount: sql<number>`count(case when ${bookings.status} not in ('draft','pricing_ready','cancelled','payment_failed') then 1 end)::int`,
    })
    .from(bookings)
    .where(and(gte(bookings.createdAt, twoWeeksAgo), lte(bookings.createdAt, weekAgo)));

  const revenueDiff = Number(thisWeek.revenue) - Number(lastWeek.revenue);
  if (revenueDiff < 0 && Number(lastWeek.revenue) > 0) {
    const dropPercent = Math.round((Math.abs(revenueDiff) / Number(lastWeek.revenue)) * 100);
    if (dropPercent > 20) {
      recs.push({
        id: 'rev-decline',
        category: 'revenue',
        title: 'Revenue declining',
        description: `Revenue down ${dropPercent}% vs last week (£${Math.abs(revenueDiff).toFixed(0)} less)`,
        impact: dropPercent > 40 ? 'high' : 'medium',
        suggestedAction: 'Consider promotions or check if there are service issues reducing bookings',
        dataPoints: { thisWeekRevenue: Number(thisWeek.revenue), lastWeekRevenue: Number(lastWeek.revenue) },
      });
    }
  }

  return recs;
}

async function checkInventoryRecommendations(): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];
  const weekAgo = daysAgo(7);

  // Find tyre sizes that are selling well but running low
  const popular = await db
    .select({
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, weekAgo),
        sql`${bookings.tyreSizeDisplay} IS NOT NULL`,
        sql`${bookings.status} NOT IN ('draft','pricing_ready','cancelled','payment_failed')`,
      ),
    )
    .groupBy(bookings.tyreSizeDisplay)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  for (const size of popular) {
    if (!size.tyreSizeDisplay) continue;
    // Parse size to check stock
    const match = size.tyreSizeDisplay.match(/(\d{3})\/(\d{2})\/R(\d{2})/);
    if (!match) continue;
    const [, width, aspect, rim] = match;

    const [stockInfo] = await db
      .select({
        totalStock: sql<number>`coalesce(sum(${tyreProducts.stockNew}), 0)::int`,
      })
      .from(tyreProducts)
      .where(
        and(
          eq(tyreProducts.width, parseInt(width)),
          eq(tyreProducts.aspect, parseInt(aspect)),
          eq(tyreProducts.rim, parseInt(rim)),
          eq(tyreProducts.isLocalStock, true),
        ),
      );

    if (stockInfo.totalStock <= 2 && size.orderCount > 1) {
      recs.push({
        id: `restock-${size.tyreSizeDisplay}`,
        category: 'inventory',
        title: `Restock ${size.tyreSizeDisplay}`,
        description: `${size.orderCount} orders this week but only ${stockInfo.totalStock} in stock`,
        impact: 'high',
        suggestedAction: `Order more ${size.tyreSizeDisplay} tyres — popular size running low`,
        dataPoints: { size: size.tyreSizeDisplay, orderCount: size.orderCount, currentStock: stockInfo.totalStock },
      });
    }
  }

  return recs;
}

async function checkOperationalRecommendations(): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];

  // Check unresolved callbacks older than 24h
  const dayAgo = daysAgo(1);
  const [oldCallbacks] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callMeBack)
    .where(
      and(
        eq(callMeBack.status, 'pending'),
        lte(callMeBack.createdAt, dayAgo),
      ),
    );

  if (oldCallbacks.count > 0) {
    recs.push({
      id: 'stale-callbacks',
      category: 'operations',
      title: 'Stale callback requests',
      description: `${oldCallbacks.count} callback(s) pending for over 24 hours`,
      impact: 'medium',
      suggestedAction: 'Call these customers back to avoid losing them',
      dataPoints: { count: oldCallbacks.count },
    });
  }

  return recs;
}

async function checkCustomerRecommendations(): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];
  const monthAgo = daysAgo(30);

  // Check for high-value customers who haven't booked in 30+ days
  const [stats] = await db
    .select({
      totalAbandoned: sql<number>`count(case when ${bookings.status} IN ('draft','pricing_ready') then 1 end)::int`,
      totalBookings: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, monthAgo));

  if (stats.totalBookings > 0) {
    const abandonRate = Math.round((stats.totalAbandoned / stats.totalBookings) * 100);
    if (abandonRate > 30) {
      recs.push({
        id: 'abandon-rate',
        category: 'customer',
        title: 'High booking abandonment',
        description: `${abandonRate}% of bookings abandoned in the last 30 days (${stats.totalAbandoned} of ${stats.totalBookings})`,
        impact: 'high',
        suggestedAction: 'Review pricing or checkout flow — customers may be dropping off',
        dataPoints: { abandonRate, totalAbandoned: stats.totalAbandoned, totalBookings: stats.totalBookings },
      });
    }
  }

  return recs;
}

/* ── Public: Generate all recommendations ─────────────── */

export async function generateRecommendations(): Promise<Recommendation[]> {
  const [revenue, inventory, ops, customer] = await Promise.all([
    checkRevenueOpportunities(),
    checkInventoryRecommendations(),
    checkOperationalRecommendations(),
    checkCustomerRecommendations(),
  ]);

  const all = [...revenue, ...inventory, ...ops, ...customer];

  // Sort by impact: high > medium > low
  const impactOrder = { high: 0, medium: 1, low: 2 };
  return all.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
}
