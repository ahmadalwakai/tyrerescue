import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, tyreProducts, bookingTyres, bookings } from '@/lib/db';
import { sql, desc, lte } from 'drizzle-orm';
import { askGroqJSON } from '@/lib/groq';

export async function GET() {
  try {
    await requireAdmin();

    // Top selling tyre sizes (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const topSelling = await db
      .select({
        sizeDisplay: tyreProducts.sizeDisplay,
        brand: tyreProducts.brand,
        totalSold: sql<number>`sum(${bookingTyres.quantity})`,
      })
      .from(bookingTyres)
      .innerJoin(tyreProducts, sql`${bookingTyres.tyreId} = ${tyreProducts.id}`)
      .innerJoin(bookings, sql`${bookingTyres.bookingId} = ${bookings.id}`)
      .where(
        sql`${bookings.createdAt} >= ${thirtyDaysAgo} AND ${bookings.status} NOT IN ('cancelled', 'refunded', 'draft')`
      )
      .groupBy(tyreProducts.sizeDisplay, tyreProducts.brand)
      .orderBy(desc(sql`sum(${bookingTyres.quantity})`))
      .limit(10);

    // Low stock products
    const lowStock = await db
      .select({
        id: tyreProducts.id,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
        stockNew: tyreProducts.stockNew,
        priceNew: tyreProducts.priceNew,
      })
      .from(tyreProducts)
      .where(lte(tyreProducts.stockNew, 5))
      .orderBy(tyreProducts.stockNew)
      .limit(20);

    // Weekly booking volume (last 4 weeks)
    const weeklyVolume = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${bookings.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(
        sql`${bookings.createdAt} >= NOW() - INTERVAL '28 days' AND ${bookings.status} NOT IN ('cancelled', 'refunded', 'draft')`
      )
      .groupBy(sql`date_trunc('week', ${bookings.createdAt})`)
      .orderBy(sql`date_trunc('week', ${bookings.createdAt})`);

    const context = {
      topSelling: topSelling.map((r) => ({
        size: r.sizeDisplay,
        brand: r.brand,
        soldLast30Days: Number(r.totalSold),
      })),
      lowStock: lowStock.map((r) => ({
        brand: r.brand,
        pattern: r.pattern,
        size: r.sizeDisplay,
        currentStock: r.stockNew,
        price: r.priceNew,
      })),
      weeklyBookings: weeklyVolume.map((r) => ({
        week: r.week,
        bookings: Number(r.count),
      })),
    };

    const forecast = await askGroqJSON(
      `You are an inventory manager for a mobile tyre fitting company in Glasgow, Scotland.
Analyse the sales data and stock levels. Return JSON:
{
  "recommendations": [
    { "size": "string", "brand": "string", "action": "reorder"|"monitor"|"reduce", "urgency": "critical"|"high"|"medium"|"low", "reason": "string max 20 words", "suggestedQty": number }
  ],
  "summary": "string max 40 words about overall stock health",
  "trend": "growing"|"stable"|"declining"
}
Max 8 recommendations. Focus on sizes that are selling fast with low stock.`,
      JSON.stringify(context),
      600
    );

    return NextResponse.json({
      forecast: forecast || { recommendations: [], summary: 'Unable to generate forecast', trend: 'stable' },
      data: context,
      aiPowered: !!forecast,
    });
  } catch (error) {
    console.error('Forecast error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
