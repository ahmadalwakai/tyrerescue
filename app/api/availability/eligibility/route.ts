import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { drivers, users, pricingRules, bookings } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { resolveDistance } from '@/lib/mapbox';
import { parsePricingRules } from '@/lib/pricing-engine';
import { shouldDriverAppearOnline, isLocationTrustworthy, isLocationFromMobileApp } from '@/lib/driver-presence';

/**
 * POST /api/availability/eligibility
 *
 * Location-aware emergency eligibility check.
 * Called after the customer confirms their location during an emergency booking.
 * Returns ETA, nearest driver info, and an eligible boolean.
 * Max distance from pricingRules.max_service_miles (single source of truth).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lng } = body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { error: 'Missing or invalid lat/lng' },
        { status: 400 },
      );
    }

    // Load pricing rules, drivers, and active bookings in parallel.
    const [rulesRows, allDrivers, activeBookingRows] = await Promise.all([
      db.select().from(pricingRules),
      db
        .select({
          id: drivers.id,
          name: users.name,
          lat: drivers.currentLat,
          lng: drivers.currentLng,
          locationAt: drivers.locationAt,
          isOnline: drivers.isOnline,
          status: drivers.status,
          locationSource: drivers.locationSource,
        })
        .from(drivers)
        .innerJoin(users, eq(drivers.userId, users.id)),
      db
        .select({ driverId: bookings.driverId, status: bookings.status })
        .from(bookings)
        .where(
          inArray(bookings.status, ['driver_assigned', 'en_route', 'arrived', 'in_progress']),
        ),
    ]);

    // Build active booking map
    const activeBookingMap = new Map<string, { status: string }>();
    for (const ab of activeBookingRows) {
      if (ab.driverId) activeBookingMap.set(ab.driverId, { status: ab.status });
    }

    const parsedRules = parsePricingRules(
      rulesRows.map((r) => ({ key: r.key, value: r.value })),
    );
    const maxServiceMiles = parsedRules.max_service_miles;

    // Use presence evaluator — includes grace window logic
    const availableDrivers = allDrivers.filter((d) =>
      shouldDriverAppearOnline(
        { isOnline: d.isOnline ?? false, locationAt: d.locationAt, status: d.status },
        activeBookingMap.get(d.id) ?? null,
      ),
    );

    const onlineDriverCount = availableDrivers.length;

    // For ETA/routing, only use drivers with trustworthy GPS
    // Prefer mobile_app sourced location over web_portal
    const freshDrivers = availableDrivers
      .filter((d) => {
        if (!d.lat || !d.lng) return false;
        return isLocationTrustworthy(d.locationAt);
      })
      .sort((a, b) => {
        // Mobile app location first
        const aMobile = isLocationFromMobileApp(a.locationSource) ? 0 : 1;
        const bMobile = isLocationFromMobileApp(b.locationSource) ? 0 : 1;
        return aMobile - bMobile;
      })
      .map((d) => ({
        id: d.id,
        name: d.name ?? 'Driver',
        lat: Number(d.lat),
        lng: Number(d.lng),
      }));

    // Resolve distance using fallback chain: nearest driver → garage.
    const result = await resolveDistance(
      { lat, lng },
      freshDrivers.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng })),
    );

    const eligible = result.distanceMiles <= maxServiceMiles;

    // Build ETA range: use driving duration when available, else estimate at 30mph
    const rawEta =
      result.durationMinutes ?? Math.round((result.distanceMiles / 30) * 60);

    // Produce a realistic range — never show misleading single-minute precision
    const etaMinRaw = Math.max(15, Math.round(rawEta * 0.8));
    const etaMaxRaw = Math.round(rawEta * 1.4);
    // Guard: min must never exceed max
    const etaMinMinutes = Math.min(etaMinRaw, etaMaxRaw);
    const etaMaxMinutes = Math.max(etaMinRaw, etaMaxRaw);

    // Human-friendly label
    // For emergency availability the owner-approved label is always "1–2 hours".
    // We never show misleading minute-precision ETA on this card.
    function formatEtaLabel(min: number, max: number): string {
      // Normalise so min <= max
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      if (hi >= 60) {
        const loH = lo / 60;
        const hiH = hi / 60;
        return `${Math.max(1, Math.round(loH))}–${Math.max(Math.ceil(hiH), 2)} hours`;
      }
      // Even for sub-hour, clamp to at least "1–2 hours" for emergency use
      return '1–2 hours';
    }

    const etaLabel = formatEtaLabel(etaMinMinutes, etaMaxMinutes);

    // Find matching driver name if sourced from a driver
    let driverName: string | null = null;
    if (result.selectedDriverId) {
      const match = freshDrivers.find((d) => d.id === result.selectedDriverId);
      if (match) driverName = match.name;
    }

    return NextResponse.json({
      eligible,
      etaMinMinutes,
      etaMaxMinutes,
      etaLabel,
      distanceMiles: result.distanceMiles,
      source: result.distanceSource,
      driverId: result.selectedDriverId,
      driverName,
      driverLat: result.originLat,
      driverLng: result.originLng,
      routeDurationMinutes: result.durationMinutes,
      driversOnline: onlineDriverCount,
      message: eligible
        ? freshDrivers.length > 0
          ? `Nearest driver approximately ${etaLabel} away`
          : `Estimated arrival ${etaLabel} (from garage)`
        : 'This location is outside our emergency service area',
    });
  } catch (error) {
    console.error('Eligibility check error:', error);
    return NextResponse.json(
      { error: 'Failed to check eligibility' },
      { status: 500 },
    );
  }
}
