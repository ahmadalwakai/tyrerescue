import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { demandSnapshots } from '@/lib/db/schema';
import { getPricingConfig, isNightWindow, getLondonTime } from '@/lib/pricing-config';
import { gte, desc, eq } from 'drizzle-orm';

/**
 * GET /api/admin/pricing/state
 *
 * Returns one truthful response describing all live pricing state.
 * The frontend must render ONLY this data — no local re-interpretation.
 */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getPricingConfig();
    const london = getLondonTime();
    const isNight = isNightWindow(config);

    // Compute live surcharge totals from real config state
    const nightPercent = isNight ? Number(config.nightSurchargePercent ?? 0) : 0;
    const manualActive = config.manualSurchargeActive ?? false;
    const manualPercent = manualActive ? Number(config.manualSurchargePercent ?? 0) : 0;
    const demandPercent = Number(config.demandSurchargePercent ?? 0);
    const totalRaw = nightPercent + manualPercent + demandPercent;
    const maxCap = Number(config.maxTotalSurchargePercent ?? 25);
    const totalActivePercent = Math.min(totalRaw, maxCap);

    // Get current-hour demand snapshot (matched using London-time hour bucket)
    // We query the last 12 hours of snapshots, then find the one matching current London hour
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    const snapshots = await db
      .select()
      .from(demandSnapshots)
      .where(gte(demandSnapshots.hourStart, twelveHoursAgo))
      .orderBy(desc(demandSnapshots.hourStart))
      .limit(13);

    // Find the snapshot that matches the current London hour
    // The hourStart in DB is stored by the analytics event route using server time
    // We match on the hour start being within the current hour window
    const serverHourStart = new Date();
    serverHourStart.setMinutes(0, 0, 0);

    const currentSnapshot = snapshots.find(
      (s) => new Date(s.hourStart).getTime() === serverHourStart.getTime()
    );

    // Build demand section — null if no real data
    const demand = currentSnapshot
      ? {
          pageViews: currentSnapshot.pageViews ?? 0,
          callClicks: currentSnapshot.callClicks ?? 0,
          bookingStarts: currentSnapshot.bookingStarts ?? 0,
          bookingCompletes: currentSnapshot.bookingCompletes ?? 0,
          whatsappClicks: currentSnapshot.whatsappClicks ?? 0,
          surchargeApplied: currentSnapshot.surchargeApplied ?? '0.00',
          hasData: true,
        }
      : {
          pageViews: 0,
          callClicks: 0,
          bookingStarts: 0,
          bookingCompletes: 0,
          whatsappClicks: 0,
          surchargeApplied: '0.00',
          hasData: false,
        };

    // Build suggestion based on real computed state
    const totalDemandSignal = demand.callClicks + demand.bookingStarts;
    const threshold = config.demandThresholdClicks ?? 20;
    let suggestion: { enabled: boolean; text: string | null } = {
      enabled: false,
      text: null,
    };
    if (
      demand.hasData &&
      totalDemandSignal >= threshold &&
      !manualActive &&
      demandPercent === 0
    ) {
      suggestion = {
        enabled: true,
        text: `Demand signal (${totalDemandSignal} actions) has reached threshold (${threshold}). Consider reviewing surcharge settings.`,
      };
    }

    return NextResponse.json({
      config: {
        id: config.id,
        nightSurchargePercent: Number(config.nightSurchargePercent ?? 0),
        nightStartHour: config.nightStartHour ?? 18,
        nightEndHour: config.nightEndHour ?? 6,
        manualSurchargePercent: Number(config.manualSurchargePercent ?? 0),
        manualSurchargeActive: manualActive,
        demandSurchargePercent: demandPercent,
        demandThresholdClicks: threshold,
        demandIncrementPercent: Number(config.demandIncrementPercent ?? 0),
        cookieReturnSurchargePercent: Number(config.cookieReturnSurchargePercent ?? 0),
        maxTotalSurchargePercent: maxCap,
      },
      live: {
        londonHour: london.hour,
        hourStartIso: london.hourStartIso,
        hourEndIso: london.hourEndIso,
        isNightActive: isNight,
        nightPercent,
        manualPercent,
        manualActive,
        demandPercent,
        totalActivePercent,
      },
      demand,
      demandHistory: snapshots.map((s) => ({
        hourStart: s.hourStart,
        pageViews: s.pageViews ?? 0,
        callClicks: s.callClicks ?? 0,
        bookingStarts: s.bookingStarts ?? 0,
        bookingCompletes: s.bookingCompletes ?? 0,
        whatsappClicks: s.whatsappClicks ?? 0,
        surchargeApplied: s.surchargeApplied ?? '0.00',
      })),
      suggestion,
    });
  } catch (error) {
    console.error('[admin/pricing/state]', error);
    return NextResponse.json({ error: 'Failed to load pricing state' }, { status: 500 });
  }
}
