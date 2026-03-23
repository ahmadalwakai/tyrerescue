import { db, bookings, drivers, surgePricingLog, bankHolidays } from '@/lib/db';
import { eq, and, sql, gte } from 'drizzle-orm';
import { askGroqJSON } from '@/lib/groq';
import { getLondonTime } from '@/lib/pricing-config';
import { shouldDriverAppearOnline } from '@/lib/driver-presence';

export async function getSurgeMultiplier(): Promise<number> {
  try {
    const now = new Date();
    const london = getLondonTime();
    const hour = london.hour;
    const dayOfWeek = now.getDay();
    const todayStr = now.toISOString().split('T')[0];

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

    const allDrivers = await db
      .select({
        id: drivers.id,
        isOnline: drivers.isOnline,
        locationAt: drivers.locationAt,
        status: drivers.status,
      })
      .from(drivers);

    const availableDriverCount = allDrivers.filter((d) =>
      shouldDriverAppearOnline(
        { isOnline: d.isOnline ?? false, locationAt: d.locationAt, status: d.status },
        null,
      ),
    ).length;

    const [isHoliday] = await db
      .select()
      .from(bankHolidays)
      .where(eq(bankHolidays.date, todayStr))
      .limit(1);

    const groqInput = {
      activeBookingsToday: Number(activeBookingsResult.count),
      emergencyPending: Number(emergencyPendingResult.count),
      availableDrivers: availableDriverCount,
      currentHour: hour,
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isBankHoliday: !!isHoliday,
      timestamp: now.toISOString(),
    };

    const result = await askGroqJSON(
      `You are a surge pricing engine for a mobile tyre fitting company in Glasgow.
Return a price multiplier based on demand. Range: 0.90 to 1.20.
Normal: 1.0, High demand: up to 1.20, Low demand: down to 0.90.
Return JSON: { "multiplier": number }`,
      JSON.stringify(groqInput),
      150
    );

    const multiplier = result?.multiplier
      ? Math.max(0.9, Math.min(1.2, Number(result.multiplier)))
      : 1.0;

    // Log
    await db.insert(surgePricingLog).values({
      groqInput: groqInput as Record<string, unknown>,
      groqOutput: (result || { multiplier: 1.0 }) as Record<string, unknown>,
      multiplierUsed: String(multiplier),
      applied: true,
    });

    return multiplier;
  } catch (error) {
    console.error('getSurgeMultiplier error:', error);
    return 1.0;
  }
}
