import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, bookings, drivers, surgePricingLog, bankHolidays } from '@/lib/db';
import { eq, and, sql, gte } from 'drizzle-orm';
import { askGroqJSON } from '@/lib/groq';

export async function GET() {
  try {
    await requireAdmin();

    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const todayStr = now.toISOString().split('T')[0];

    // Gather demand signals
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [activeBookingsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          gte(bookings.createdAt, todayStart),
          sql`${bookings.status} NOT IN ('cancelled', 'completed', 'refunded', 'draft')`
        )
      );

    const [emergencyPendingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          gte(bookings.createdAt, todayStart),
          eq(bookings.bookingType, 'emergency'),
          sql`${bookings.status} NOT IN ('cancelled', 'completed', 'refunded', 'draft')`
        )
      );

    const [availableDriversResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drivers)
      .where(eq(drivers.isOnline, true));

    const [isHoliday] = await db
      .select()
      .from(bankHolidays)
      .where(eq(bankHolidays.date, todayStr))
      .limit(1);

    const demandSignals = {
      activeBookingsToday: Number(activeBookingsResult.count),
      emergencyPending: Number(emergencyPendingResult.count),
      availableDrivers: Number(availableDriversResult.count),
      currentHour: hour,
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isBankHoliday: !!isHoliday,
    };

    const groqInput = {
      ...demandSignals,
      timestamp: now.toISOString(),
    };

    const result = await askGroqJSON(
      `You are a surge pricing engine for a mobile tyre fitting company in Glasgow, Scotland.
Analyse demand signals and return a price multiplier.
Rules:
- Normal demand: 1.0
- Mild demand (many bookings, some drivers): 1.05-1.10
- High demand (emergency heavy, few drivers): 1.10-1.15
- Peak demand (emergency heavy, no drivers, antisocial hours): 1.15-1.20
- Low demand (few bookings, many drivers): 0.90-0.95
- Range MUST be 0.90 to 1.20
- Consider time of day: 6am-9am rush, 5pm-7pm rush, 10pm-6am antisocial
- Weekend and bank holidays naturally have higher demand
Return JSON: { "multiplier": number, "confidence": "high"|"medium"|"low", "reasoning": "string max 30 words", "demandLevel": "low"|"normal"|"mild"|"high"|"peak" }`,
      JSON.stringify(groqInput),
      300
    );

    const multiplier = result?.multiplier
      ? Math.max(0.9, Math.min(1.2, Number(result.multiplier)))
      : 1.0;

    // Log to surgePricingLog
    await db.insert(surgePricingLog).values({
      groqInput: groqInput as Record<string, unknown>,
      groqOutput: (result || { multiplier: 1.0 }) as Record<string, unknown>,
      multiplierUsed: String(multiplier),
      applied: true,
    });

    return NextResponse.json({
      multiplier,
      confidence: result?.confidence || 'low',
      reasoning: result?.reasoning || 'Default pricing applied',
      demandLevel: result?.demandLevel || 'normal',
      demandSignals,
      aiPowered: !!result,
    });
  } catch (error) {
    console.error('Surge check error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
