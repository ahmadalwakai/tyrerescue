import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { demandSnapshots, pricingConfig } from '@/lib/db/schema';
import { eq, gte } from 'drizzle-orm';
import { getPricingConfig, invalidatePricingConfigCache, isNightWindow } from '@/lib/pricing-config';

export async function GET(request: Request) {
  // Protect with cron secret if set
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const config = await getPricingConfig();

    // Get current hour demand
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    const [snapshot] = await db
      .select()
      .from(demandSnapshots)
      .where(eq(demandSnapshots.hourStart, hourStart))
      .limit(1);

    const callClicks = snapshot?.callClicks ?? 0;
    const bookingStarts = snapshot?.bookingStarts ?? 0;
    const bookingCompletes = snapshot?.bookingCompletes ?? 0;
    const threshold = config.demandThresholdClicks ?? 20;
    const increment = Number(config.demandIncrementPercent ?? '2');
    const maxSurcharge = Number(config.maxTotalSurchargePercent ?? '25');

    // Calculate demand surcharge
    const totalDemandSignal = callClicks + bookingStarts;
    let demandSurcharge = 0;

    if (totalDemandSignal > threshold) {
      const stepsAbove = Math.floor((totalDemandSignal - threshold) / 5);
      demandSurcharge = Math.min(stepsAbove * increment, maxSurcharge);
    }

    // Update pricing config demand surcharge
    await db
      .update(pricingConfig)
      .set({
        demandSurchargePercent: String(demandSurcharge),
        updatedAt: new Date(),
      })
      .where(eq(pricingConfig.id, config.id));

    // Update snapshot with surcharge applied
    if (snapshot) {
      await db
        .update(demandSnapshots)
        .set({ surchargeApplied: String(demandSurcharge) })
        .where(eq(demandSnapshots.id, snapshot.id));
    }

    invalidatePricingConfigCache();

    return NextResponse.json({
      success: true,
      demandSignal: totalDemandSignal,
      threshold,
      demandSurcharge,
      isNight: isNightWindow(config),
    });
  } catch (error) {
    console.error('[demand-pricing cron]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
